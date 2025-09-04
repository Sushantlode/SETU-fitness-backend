// controllers/workout.js
import { pool } from "../db/pool.js";
import { putObject, presignGet as presignS3Get, buildKey } from "../utils/s3.js";
import crypto from "crypto";

/* ============== schema bootstrap (self-migrating) ============== */
async function ensureSchema() {
  await pool.query(`
    DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS workout_muscles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exercise_name TEXT NOT NULL,
      image_url TEXT,              -- legacy/external URL (optional)
      image_key TEXT,              -- S3 object key (preferred)
      how_to_perform TEXT,
      equipment_needed TEXT,
      suggested_routine JSONB,     -- { sets, reps, rest }
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workout_exercise_targets (
      exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
      muscle_id   UUID NOT NULL REFERENCES workout_muscles(id)   ON DELETE RESTRICT,
      PRIMARY KEY(exercise_id, muscle_id)
    );

    ALTER TABLE workout_exercises
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS image_key TEXT,
      ADD COLUMN IF NOT EXISTS how_to_perform TEXT,
      ADD COLUMN IF NOT EXISTS equipment_needed TEXT,
      ADD COLUMN IF NOT EXISTS suggested_routine JSONB;

    DO $seed$
    BEGIN
      IF (SELECT COUNT(*) FROM workout_muscles) = 0 THEN
        INSERT INTO workout_muscles(name) VALUES
          ('Chest'), ('Back'), ('Shoulders'), ('Biceps'), ('Triceps'),
          ('Forearms'), ('Quadriceps'), ('Hamstrings'), ('Glutes'),
          ('Calves'), ('Core'), ('Obliques'), ('Traps'), ('Lats');
      END IF;
    END
    $seed$;
  `);
}
ensureSchema().catch(err => console.error("ensureSchema(workout) failed:", err));

/* ======================== helpers ======================== */
const toStr = (v) => (v == null ? null : String(v).trim());
const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const normArray = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : [];

function sanitizeRoutine(r) {
  if (!r || typeof r !== "object") return null;
  const sets = isNonEmpty(r.sets) ? String(r.sets).trim() : null;
  const reps = isNonEmpty(r.reps) ? String(r.reps).trim() : null;
  const rest = isNonEmpty(r.rest) ? String(r.rest).trim() : null;
  if (!sets && !reps && !rest) return null;
  return { sets, reps, rest };
}

async function upsertMusclesByNames(client, names /* string[] */) {
  if (!names.length) return [];
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];

  for (const n of unique) {
    await client.query(
      `INSERT INTO workout_muscles(name)
       VALUES ($1)
       ON CONFLICT(name) DO NOTHING`,
      [n.charAt(0).toUpperCase() + n.slice(1)]
    );
  }
  const { rows } = await client.query(
    `SELECT id, name FROM workout_muscles WHERE lower(name) = ANY($1::text[])`,
    [unique]
  );
  return rows;
}

async function setExerciseTargets(client, exercise_id, muscles /* [{id}] */) {
  await client.query(`DELETE FROM workout_exercise_targets WHERE exercise_id=$1`, [exercise_id]);
  if (!muscles.length) return;
  const params = [];
  const values = [];
  muscles.forEach((m, i) => {
    params.push(exercise_id, m.id);
    const off = i * 2;
    values.push(`($${off + 1}, $${off + 2})`);
  });
  await client.query(
    `INSERT INTO workout_exercise_targets(exercise_id, muscle_id)
     VALUES ${values.join(",")}`,
    params
  );
}

/** Multer → S3 (server-side upload) */
async function handleImageUploadFile({ file, exerciseNameForKey }) {
  if (!file) return { image_key: null, image_url_for_db: null };
  const buf = file.buffer;
  const mime = file.mimetype || "application/octet-stream";
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const safeName = (exerciseNameForKey || "exercise")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const ext = (file.originalname?.split(".").pop() || "bin").toLowerCase();

  const Key = buildKey("workouts", "exercises", `${safeName}-${hash}.${ext}`);
  await putObject({ Key, Body: buf, ContentType: mime });
  return { image_key: Key, image_url_for_db: null };
}

/** Base64 → S3 */
async function handleImageBase64({ image_base64, exerciseNameForKey }) {
  if (!isNonEmpty(image_base64)) return { image_key: null, image_url_for_db: null };
  let b64 = image_base64.trim();
  let mime = "image/png";
  const m = b64.match(/^data:([a-z0-9/+.-]+);base64,(.*)$/i);
  if (m) { mime = m[1]; b64 = m[2]; }
  const buf = Buffer.from(b64, "base64");
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const safeName = (exerciseNameForKey || "exercise")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const ext =
    /png$/i.test(mime) ? "png" :
    /jpe?g$/i.test(mime) ? "jpg" :
    /webp$/i.test(mime) ? "webp" :
    /gif$/i.test(mime) ? "gif" : "bin";

  const Key = buildKey("workouts", "exercises", `${safeName}-${hash}.${ext}`);
  await putObject({ Key, Body: buf, ContentType: mime });
  return { image_key: Key, image_url_for_db: null };
}

/** Decide source of image: multer file, presigned key, base64, or external URL */
async function resolveImageForCreateOrUpdate({ req, exerciseName, existing }) {
  // Priority: file → image_key → image_base64 → image_url
  if (req.file) {
    return await handleImageUploadFile({ file: req.file, exerciseNameForKey: exerciseName });
  }

  const image_key_in = toStr(req.body?.image_key);
  if (isNonEmpty(image_key_in)) {
    return { image_key: image_key_in, image_url_for_db: null };
  }

  const image_base64 = toStr(req.body?.image_base64);
  if (isNonEmpty(image_base64)) {
    return await handleImageBase64({ image_base64, exerciseNameForKey: exerciseName });
  }

  const image_url = toStr(req.body?.image_url);
  if (isNonEmpty(image_url)) {
    return { image_key: null, image_url_for_db: image_url };
  }

  // No new image provided → keep existing if present
  if (existing) {
    return {
      image_key: existing.image_key || null,
      image_url_for_db: existing.image_key ? null : (existing.image_url || null),
    };
  }

  return { image_key: null, image_url_for_db: null };
}

/** Attach presigned GET url if image_key exists */
async function hydrateExerciseRow(row) {
  let finalUrl = row.image_url || null;
  if (isNonEmpty(row.image_key)) {
    try {
      finalUrl = await presignS3Get(row.image_key, 60 * 60 * 12); // 12h
    } catch {}
  }
  return { ...row, image_url: finalUrl, image_key: row.image_key || null };
}

async function fetchExercise(client, id) {
  const [{ rows: exRows }, { rows: musRows }] = await Promise.all([
    client.query(
      `SELECT id, exercise_name, image_url, image_key, how_to_perform, equipment_needed, suggested_routine,
              created_at, updated_at
         FROM workout_exercises WHERE id=$1`,
      [id]
    ),
    client.query(
      `SELECT m.id, m.name
         FROM workout_exercise_targets t
         JOIN workout_muscles m ON m.id=t.muscle_id
        WHERE t.exercise_id=$1
        ORDER BY m.name ASC`,
      [id]
    ),
  ]);
  if (!exRows[0]) return null;
  const hydrated = await hydrateExerciseRow(exRows[0]);
  return { ...hydrated, targeted_muscles: musRows };
}

/* ======================== endpoints ======================== */

export async function listMuscles(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.name,
              COALESCE(x.cnt,0)::int AS exercises_count
         FROM workout_muscles m
    LEFT JOIN (
           SELECT muscle_id, COUNT(*) AS cnt
             FROM workout_exercise_targets
            GROUP BY muscle_id
         ) x ON x.muscle_id = m.id
        ORDER BY m.name ASC`
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

export async function addMuscle(req, res, next) {
  try {
    const raw = toStr(req.body?.name);
    if (!isNonEmpty(raw))
      return res.status(400).json({ hasError: true, message: "name is required" });
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const { rows } = await pool.query(
      `INSERT INTO workout_muscles(name)
       VALUES ($1)
       ON CONFLICT(name) DO UPDATE SET updated_at=NOW()
       RETURNING id, name, created_at, updated_at`,
      [name]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

export async function listExercises(req, res, next) {
  try {
    const muscle = toStr(req.query.muscle);
    const search = toStr(req.query.search);
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(lower(e.exercise_name) LIKE $${params.length} OR lower(e.how_to_perform) LIKE $${params.length})`);
    }

    if (muscle) {
      params.push(muscle.toLowerCase());
      where.push(`
        EXISTS (
          SELECT 1 FROM workout_exercise_targets t
          JOIN workout_muscles m ON m.id=t.muscle_id
          WHERE t.exercise_id = e.id
            AND (lower(m.name) = $${params.length} OR m.id::text = $${params.length})
        )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `
      SELECT e.id, e.exercise_name, e.image_url, e.image_key,
             e.how_to_perform, e.equipment_needed, e.suggested_routine,
             e.created_at, e.updated_at
        FROM workout_exercises e
        ${whereSql}
    ORDER BY e.exercise_name ASC
       LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    if (!rows.length) return res.json({ hasError: false, data: [], page, limit });

    const hydrated = await Promise.all(rows.map(hydrateExerciseRow));

    const ids = hydrated.map((r) => r.id);
    const { rows: tm } = await pool.query(
      `SELECT t.exercise_id, m.id AS muscle_id, m.name
         FROM workout_exercise_targets t
         JOIN workout_muscles m ON m.id=t.muscle_id
        WHERE t.exercise_id = ANY($1::uuid[])
        ORDER BY m.name ASC`,
      [ids]
    );
    const byEx = tm.reduce((acc, r) => {
      acc[r.exercise_id] = acc[r.exercise_id] || [];
      acc[r.exercise_id].push({ id: r.muscle_id, name: r.name });
      return acc;
    }, {});
    const data = hydrated.map((r) => ({ ...r, targeted_muscles: byEx[r.id] || [] }));

    res.json({ hasError: false, data, page, limit });
  } catch (e) { next(e); }
}

export async function getExercise(req, res, next) {
  try {
    const id = toStr(req.params.id);
    if (!id) return res.status(400).json({ hasError: true, message: "id required" });
    const ex = await fetchExercise(pool, id);
    if (!ex) return res.status(404).json({ hasError: true, message: "not found" });
    res.json({ hasError: false, data: ex });
  } catch (e) { next(e); }
}

/**
 * POST /workout/exercises
 * form-data (image) or JSON:
 * {
 *   "exercise_name": "Bench Press",
 *   "image_key": "...",           // or `image_base64`, or send file field `image`
 *   "image_url": "https://...",   // legacy
 *   "targeted_muscles": ["Chest","Triceps"],  // or IDs
 *   "how_to_perform": "...",
 *   "equipment_needed": "Barbell, Bench",
 *   "suggested_routine": { "sets":"3-4","reps":"8-12","rest":"1-2 min" }
 * }
 */
export async function createExercise(req, res, next) {
  const client = await pool.connect();
  try {
    const name = toStr(req.body?.exercise_name);
    if (!isNonEmpty(name))
      return res.status(400).json({ hasError: true, message: "exercise_name required" });

    const how_to_perform = toStr(req.body?.how_to_perform);
    const equipment_needed = toStr(req.body?.equipment_needed);
    const routine = sanitizeRoutine(req.body?.suggested_routine);
    const targeted = normArray(req.body?.targeted_muscles);

    const { image_key, image_url_for_db } = await resolveImageForCreateOrUpdate({
      req, exerciseName: name
    });

    await client.query("BEGIN");
    const { rows: exRows } = await client.query(
      `INSERT INTO workout_exercises
         (exercise_name, image_url, image_key, how_to_perform, equipment_needed, suggested_routine, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
       RETURNING id`,
      [name, image_url_for_db, image_key, how_to_perform, equipment_needed, routine]
    );
    const exercise_id = exRows[0].id;

    const muscles = await upsertMusclesByNames(client, targeted);
    await setExerciseTargets(client, exercise_id, muscles);

    await client.query("COMMIT");

    const ex = await fetchExercise(pool, exercise_id);
    res.json({ hasError: false, data: ex });
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}

/**
 * PUT /workout/exercises/:id
 * Accepts same fields as POST; any omitted field remains unchanged.
 */
export async function updateExercise(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toStr(req.params.id);
    if (!id) return res.status(400).json({ hasError: true, message: "id required" });

    const existing = await fetchExercise(client, id);
    if (!existing) return res.status(404).json({ hasError: true, message: "not found" });

    const exercise_name = isNonEmpty(req.body?.exercise_name) ? String(req.body.exercise_name).trim() : existing.exercise_name;
    const how_to_perform = (req.body?.how_to_perform !== undefined) ? toStr(req.body.how_to_perform) : existing.how_to_perform;
    const equipment_needed = (req.body?.equipment_needed !== undefined) ? toStr(req.body.equipment_needed) : existing.equipment_needed;
    const routine = (req.body?.suggested_routine !== undefined) ? sanitizeRoutine(req.body.suggested_routine) : existing.suggested_routine;

    const { image_key, image_url_for_db } = await resolveImageForCreateOrUpdate({
      req, exerciseName: exercise_name, existing
    });

    const targeted = req.body?.targeted_muscles !== undefined ? normArray(req.body.targeted_muscles) : null;

    await client.query("BEGIN");
    await client.query(
      `UPDATE workout_exercises
          SET exercise_name=$2,
              image_url=$3,
              image_key=$4,
              how_to_perform=$5,
              equipment_needed=$6,
              suggested_routine=$7,
              updated_at=NOW()
        WHERE id=$1`,
      [id, exercise_name, image_url_for_db, image_key, how_to_perform, equipment_needed, routine]
    );

    if (targeted !== null) {
      const muscles = await upsertMusclesByNames(client, targeted);
      await setExerciseTargets(client, id, muscles);
    }

    await client.query("COMMIT");
    const fresh = await fetchExercise(pool, id);
    res.json({ hasError: false, data: fresh });
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}
