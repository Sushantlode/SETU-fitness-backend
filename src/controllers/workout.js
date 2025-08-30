import { pool } from "../db/pool.js";

/* ============== schema bootstrap (self-migrating) ============== */
async function ensureSchema() {
  await pool.query(`
    DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

    -- Muscles master
    CREATE TABLE IF NOT EXISTS workout_muscles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Exercises
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exercise_name TEXT NOT NULL,
      image_url TEXT,
      how_to_perform TEXT,
      equipment_needed TEXT,
      suggested_routine JSONB, -- { sets: "3-4", reps: "8-12", rest: "1 min" }
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Join (many-to-many: exercise targets multiple muscles)
    CREATE TABLE IF NOT EXISTS workout_exercise_targets (
      exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
      muscle_id   UUID NOT NULL REFERENCES workout_muscles(id)   ON DELETE RESTRICT,
      PRIMARY KEY(exercise_id, muscle_id)
    );

    -- Add JSONB validation defaults if missing
    ALTER TABLE workout_exercises
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS how_to_perform TEXT,
      ADD COLUMN IF NOT EXISTS equipment_needed TEXT,
      ADD COLUMN IF NOT EXISTS suggested_routine JSONB;

    -- Seed common muscles if table is empty
    DO $$
    BEGIN
      IF (SELECT COUNT(*) FROM workout_muscles) = 0 THEN
        INSERT INTO workout_muscles(name) VALUES
          ('Chest'), ('Back'), ('Shoulders'), ('Biceps'), ('Triceps'),
          ('Forearms'), ('Quadriceps'), ('Hamstrings'), ('Glutes'),
          ('Calves'), ('Core'), ('Obliques'), ('Traps'), ('Lats');
      END IF;
    END $$;
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

  // Insert-where-not-exists
  for (const n of unique) {
    await client.query(
      `INSERT INTO workout_muscles(name)
       VALUES ($1)
       ON CONFLICT(name) DO NOTHING`,
      [n.charAt(0).toUpperCase() + n.slice(1)] // store titled
    );
  }
  const { rows } = await client.query(
    `SELECT id, name FROM workout_muscles WHERE lower(name) = ANY($1::text[])`,
    [unique]
  );
  return rows; // [{id, name}]
}

async function setExerciseTargets(client, exercise_id, muscles /* [{id}] */) {
  // clear existing
  await client.query(
    `DELETE FROM workout_exercise_targets WHERE exercise_id=$1`,
    [exercise_id]
  );
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

async function fetchExercise(client, id) {
  const [{ rows: exRows }, { rows: musRows }] = await Promise.all([
    client.query(
      `SELECT id, exercise_name, image_url, how_to_perform, equipment_needed, suggested_routine,
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
  return { ...exRows[0], targeted_muscles: musRows };
}

/* ======================== endpoints ======================== */

/** GET /workout/muscles */
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
  } catch (e) {
    next(e);
  }
}

/** POST /workout/muscles { name } */
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
  } catch (e) {
    next(e);
  }
}

/**
 * GET /workout/exercises
 * Query: muscle (id or name), search, page, limit
 */
export async function listExercises(req, res, next) {
  try {
    const muscle = toStr(req.query.muscle);
    const search = toStr(req.query.search);
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const offset = (page - 1) * limit;

    // Build filters
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(lower(e.exercise_name) LIKE $${params.length} OR lower(e.how_to_perform) LIKE $${params.length})`);
    }

    if (muscle) {
      // filter by muscle name or id
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
      SELECT e.id, e.exercise_name, e.image_url,
             e.how_to_perform, e.equipment_needed, e.suggested_routine,
             e.created_at, e.updated_at
        FROM workout_exercises e
        ${whereSql}
    ORDER BY e.exercise_name ASC
       LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    // fetch muscles per exercise (batch)
    if (!rows.length) return res.json({ hasError: false, data: [], page, limit });
    const ids = rows.map((r) => r.id);
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
    const data = rows.map((r) => ({ ...r, targeted_muscles: byEx[r.id] || [] }));

    res.json({ hasError: false, data, page, limit });
  } catch (e) {
    next(e);
  }
}

/** GET /workout/exercises/:id */
export async function getExercise(req, res, next) {
  try {
    const id = toStr(req.params.id);
    if (!id) return res.status(400).json({ hasError: true, message: "id required" });
    const ex = await fetchExercise(pool, id);
    if (!ex) return res.status(404).json({ hasError: true, message: "not found" });
    res.json({ hasError: false, data: ex });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /workout/exercises
 * Body:
 * {
 *   "exercise_name": "Barbell Bench Press",
 *   "image_url": "https://.../bench.png",
 *   "targeted_muscles": ["Chest","Triceps","Shoulders"],  // or IDs
 *   "how_to_perform": "Lie on bench, grip bar slightly wider than shoulders...",
 *   "equipment_needed": "Barbell, Flat bench",
 *   "suggested_routine": { "sets":"3-4","reps":"8-12","rest":"1-2 min" }
 * }
 */
export async function createExercise(req, res, next) {
  const client = await pool.connect();
  try {
    const name = toStr(req.body?.exercise_name);
    if (!isNonEmpty(name))
      return res.status(400).json({ hasError: true, message: "exercise_name required" });

    const image_url = toStr(req.body?.image_url);
    const how_to_perform = toStr(req.body?.how_to_perform);
    const equipment_needed = toStr(req.body?.equipment_needed);
    const routine = sanitizeRoutine(req.body?.suggested_routine);
    const targeted = normArray(req.body?.targeted_muscles);

    await client.query("BEGIN");
    // insert exercise
    const { rows: exRows } = await client.query(
      `INSERT INTO workout_exercises
         (exercise_name, image_url, how_to_perform, equipment_needed, suggested_routine, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       RETURNING id`,
      [name, image_url, how_to_perform, equipment_needed, routine]
    );
    const exercise_id = exRows[0].id;

    // upsert muscles and link
    const muscles = await upsertMusclesByNames(client, targeted);
    await setExerciseTargets(client, exercise_id, muscles);

    await client.query("COMMIT");

    // return hydrated object
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
 * PUT /workout/exercises/:id   (partial update)
 * same body shape as POST; any field omitted is left unchanged
 */
export async function updateExercise(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toStr(req.params.id);
    if (!id) return res.status(400).json({ hasError: true, message: "id required" });

    const ex = await fetchExercise(client, id);
    if (!ex) return res.status(404).json({ hasError: true, message: "not found" });

    const exercise_name = isNonEmpty(req.body?.exercise_name) ? String(req.body.exercise_name).trim() : ex.exercise_name;
    const image_url = req.body?.image_url !== undefined ? toStr(req.body.image_url) : ex.image_url;
    const how_to_perform = req.body?.how_to_perform !== undefined ? toStr(req.body.how_to_perform) : ex.how_to_perform;
    const equipment_needed = req.body?.equipment_needed !== undefined ? toStr(req.body.equipment_needed) : ex.equipment_needed;
    const routine = req.body?.suggested_routine !== undefined ? sanitizeRoutine(req.body.suggested_routine) : ex.suggested_routine;
    const targeted = req.body?.targeted_muscles !== undefined ? normArray(req.body.targeted_muscles) : null;

    await client.query("BEGIN");
    await client.query(
      `UPDATE workout_exercises
          SET exercise_name=$2,
              image_url=$3,
              how_to_perform=$4,
              equipment_needed=$5,
              suggested_routine=$6,
              updated_at=NOW()
        WHERE id=$1`,
      [id, exercise_name, image_url, how_to_perform, equipment_needed, routine]
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
