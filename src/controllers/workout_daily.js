// controllers/workout_daily.js
import { pool } from "../db/pool.js";
import { presignGet as presignS3Get } from "../utils/s3.js";

/* =================== small utils =================== */
const toStr = (v) => (v == null ? null : String(v).trim());
const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : d;
};
function getUserId(req) {
  return (
    req.user_id ||               // ← your auth.js sets this
    req.user?.user_id ||
    req.user?.userId ||
    req.user?.id ||
    req.user?.sub ||
    null
  );
}




/* ============== schema bootstrap (idempotent) ============== */
async function ensureSchema() {
  await pool.query(`
    DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

    -- master day row
    CREATE TABLE IF NOT EXISTS workout_daily (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      day DATE NOT NULL,
      total_seconds INT NOT NULL DEFAULT 0,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, day)
    );

    -- exercises done that day
    CREATE TABLE IF NOT EXISTS workout_daily_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      daily_id UUID NOT NULL REFERENCES workout_daily(id) ON DELETE CASCADE,
      exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE RESTRICT,
      order_index INT NOT NULL DEFAULT 0,
      sets INT,
      reps INT,
      weight_kg NUMERIC(8,2),
      duration_seconds INT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_workout_daily_user_day ON workout_daily(user_id, day);
    CREATE INDEX IF NOT EXISTS idx_workout_daily_exercises_daily ON workout_daily_exercises(daily_id);

    -- add FK to profiles.user_id (CASCADE), if missing
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_workout_daily_profile_user'
          AND table_name = 'workout_daily'
      ) THEN
        ALTER TABLE workout_daily
          ADD CONSTRAINT fk_workout_daily_profile_user
          FOREIGN KEY (user_id)
          REFERENCES ftn_profiles(user_id)
          ON UPDATE CASCADE
          ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}
ensureSchema().catch(e => console.error("ensureSchema(workout_daily) failed:", e));

/* =================== helpers =================== */
async function assertProfileExists(user_id) {
  const { rows } = await pool.query(
    `SELECT user_id FROM ftn_profiles WHERE user_id=$1`,
    [user_id]
  );
  if (!rows[0]) {
    const err = new Error("profile not found for user");
    err.statusCode = 404;
    throw err;
  }
}

async function getOrCreateDaily(client, user_id, day) {
  const { rows } = await client.query(
    `INSERT INTO workout_daily (user_id, day)
     VALUES ($1,$2)
     ON CONFLICT (user_id, day) DO UPDATE SET updated_at=NOW()
     RETURNING *`,
    [user_id, day]
  );
  return rows[0];
}

async function fetchDayRow(user_id, day) {
  const { rows } = await pool.query(
    `SELECT * FROM workout_daily WHERE user_id=$1 AND day=$2`,
    [user_id, day]
  );
  return rows[0] || null;
}

/** Hydrate a list of item rows with exercise meta + presigned image URLs */
async function hydrateItems(items /* rows from workout_daily_exercises */) {
  if (!items.length) return [];

  // fetch exercise meta in one shot
  const exIds = [...new Set(items.map(r => r.exercise_id))];
  const { rows: meta } = await pool.query(
    `SELECT id, exercise_name, image_key, image_url
       FROM workout_exercises
      WHERE id = ANY($1::uuid[])`,
    [exIds]
  );
  const metaMap = new Map(meta.map(m => [m.id, m]));

  // presign URLs (if key)
  const out = [];
  for (const r of items) {
    const m = metaMap.get(r.exercise_id);
    let finalUrl = m?.image_url || null;
    if (m?.image_key) {
      try { finalUrl = await presignS3Get(m.image_key, 60 * 60 * 12); } catch {}
    }
    out.push({
      id: r.id,
      exercise_id: r.exercise_id,
      exercise_name: m?.exercise_name || null,
      image_url: finalUrl,
      order_index: r.order_index,
      sets: r.sets,
      reps: r.reps,
      weight_kg: r.weight_kg,
      duration_seconds: r.duration_seconds,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at
    });
  }
  return out;
}

/* =================== endpoints =================== */

/**
 * POST /workout/days
 * Upsert day. If "exercises" is provided, replaces items.
 * body: { day?, total_seconds?, is_completed?, notes?, exercises?: [{ exercise_id, order_index?, sets?, reps?, weight_kg?, duration_seconds?, notes? }, ...] }
 */
export async function upsertDay(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.body?.day) || new Date().toISOString().slice(0, 10);
    const total_seconds_in = req.body?.total_seconds;
    const is_completed_in = req.body?.is_completed;
    const notes_in = req.body?.notes;

    await client.query("BEGIN");

    // ensure daily row
    let daily = await getOrCreateDaily(client, user_id, day);

    // partial field updates
    const total_seconds = (total_seconds_in === undefined) ? daily.total_seconds : toInt(total_seconds_in, daily.total_seconds);
    const is_completed = (is_completed_in === undefined) ? daily.is_completed : (is_completed_in === true || is_completed_in === "true");
    const notes = (notes_in === undefined) ? daily.notes : toStr(notes_in);

    const { rows: upd } = await client.query(
      `UPDATE workout_daily
          SET total_seconds=$3,
              is_completed=$4,
              notes=$5,
              updated_at=NOW()
        WHERE id=$1 AND user_id=$2
        RETURNING *`,
      [daily.id, user_id, total_seconds, is_completed, notes]
    );
    daily = upd[0];

    // replace items if provided
    const items = Array.isArray(req.body?.exercises) ? req.body.exercises : null;
    if (items) {
      await client.query(`DELETE FROM workout_daily_exercises WHERE daily_id=$1`, [daily.id]);

      const values = [];
      const params = [];
      let i = 1;
      for (const it of items) {
        const exercise_id = toStr(it.exercise_id);
        if (!exercise_id) continue;
        const order_index = toInt(it.order_index, 0);
        const sets = it.sets == null ? null : toInt(it.sets);
        const reps = it.reps == null ? null : toInt(it.reps);
        const weight_kg = it.weight_kg == null ? null : Number(it.weight_kg);
        const duration_seconds = it.duration_seconds == null ? null : toInt(it.duration_seconds);
        const inotes = toStr(it.notes);

        params.push(daily.id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, inotes);
        values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      }
      if (values.length) {
        await client.query(
          `INSERT INTO workout_daily_exercises
             (daily_id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, notes)
           VALUES ${values.join(",")}`,
          params
        );
      }
    }

    await client.query("COMMIT");

    // hydrate & return
    const itemsRows = await pool.query(
      `SELECT * FROM workout_daily_exercises WHERE daily_id=$1 ORDER BY order_index ASC, created_at ASC`,
      [daily.id]
    );
    const hydrated = await hydrateItems(itemsRows.rows);

    res.json({
      hasError: false,
      data: {
        id: daily.id,
        day: daily.day,
        total_seconds: daily.total_seconds,
        is_completed: daily.is_completed,
        notes: daily.notes,
        created_at: daily.created_at,
        updated_at: daily.updated_at,
        exercises: hydrated
      }
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}

/**
 * GET /workout/days?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Defaults to last 7 days (inclusive).
 */
export async function listDays(req, res, next) {
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const today = new Date().toISOString().slice(0, 10);
    const start = toStr(req.query?.start) || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const end = toStr(req.query?.end) || today;

    const { rows: days } = await pool.query(
      `SELECT * FROM workout_daily
        WHERE user_id=$1 AND day BETWEEN $2 AND $3
        ORDER BY day DESC`,
      [user_id, start, end]
    );
    if (!days.length) return res.json({ hasError: false, data: [], start, end });

    const dailyIds = days.map(d => d.id);

    const { rows: items } = await pool.query(
      `SELECT * FROM workout_daily_exercises
        WHERE daily_id = ANY($1::uuid[])
        ORDER BY order_index ASC, created_at ASC`,
      [dailyIds]
    );

    // group items by daily_id
    const group = new Map(dailyIds.map(id => [id, []]));
    for (const r of items) group.get(r.daily_id)?.push(r);

    // hydrate per day
    const out = [];
    for (const d of days) {
      const hydrated = await hydrateItems(group.get(d.id) || []);
      out.push({
        id: d.id,
        day: d.day,
        total_seconds: d.total_seconds,
        is_completed: d.is_completed,
        notes: d.notes,
        created_at: d.created_at,
        updated_at: d.updated_at,
        exercises: hydrated
      });
    }

    res.json({ hasError: false, data: out, start, end });
  } catch (e) { next(e); }
}

/**
 * GET /workout/days/:day
 */
export async function getDay(req, res, next) {
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.params?.day);
    if (!day) return res.status(400).json({ hasError: true, message: "day required" });

    const d = await fetchDayRow(user_id, day);
    if (!d) return res.status(404).json({ hasError: true, message: "not found" });

    const { rows: items } = await pool.query(
      `SELECT * FROM workout_daily_exercises
        WHERE daily_id=$1
        ORDER BY order_index ASC, created_at ASC`,
      [d.id]
    );
    const hydrated = await hydrateItems(items);

    res.json({
      hasError: false,
      data: {
        id: d.id,
        day: d.day,
        total_seconds: d.total_seconds,
        is_completed: d.is_completed,
        notes: d.notes,
        created_at: d.created_at,
        updated_at: d.updated_at,
        exercises: hydrated
      }
    });
  } catch (e) { next(e); }
}

/**
 * PATCH /workout/days/:day
 * Partial updates. To replace items, pass "exercises_replace".
 */
export async function patchDay(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.params?.day);
    if (!day) return res.status(400).json({ hasError: true, message: "day required" });

    await client.query("BEGIN");

    let daily = await getOrCreateDaily(client, user_id, day);

    const total_seconds =
      (req.body?.total_seconds === undefined) ? daily.total_seconds : toInt(req.body.total_seconds, daily.total_seconds);
    const is_completed =
      (req.body?.is_completed === undefined) ? daily.is_completed : (req.body.is_completed === true || req.body.is_completed === "true");
    const notes =
      (req.body?.notes === undefined) ? daily.notes : toStr(req.body.notes);

    const { rows: upd } = await client.query(
      `UPDATE workout_daily
          SET total_seconds=$3, is_completed=$4, notes=$5, updated_at=NOW()
        WHERE id=$1 AND user_id=$2
        RETURNING *`,
      [daily.id, user_id, total_seconds, is_completed, notes]
    );
    daily = upd[0];

    // replace exercises if provided
    const repl = Array.isArray(req.body?.exercises_replace) ? req.body.exercises_replace : null;
    if (repl) {
      await client.query(`DELETE FROM workout_daily_exercises WHERE daily_id=$1`, [daily.id]);

      const values = [];
      const params = [];
      let i = 1;
      for (const it of repl) {
        const exercise_id = toStr(it.exercise_id);
        if (!exercise_id) continue;
        const order_index = toInt(it.order_index, 0);
        const sets = it.sets == null ? null : toInt(it.sets);
        const reps = it.reps == null ? null : toInt(it.reps);
        const weight_kg = it.weight_kg == null ? null : Number(it.weight_kg);
        const duration_seconds = it.duration_seconds == null ? null : toInt(it.duration_seconds);
        const inotes = toStr(it.notes);

        params.push(daily.id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, inotes);
        values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      }
      if (values.length) {
        await client.query(
          `INSERT INTO workout_daily_exercises
             (daily_id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, notes)
           VALUES ${values.join(",")}`,
          params
        );
      }
    }

    await client.query("COMMIT");

    const { rows: items } = await pool.query(
      `SELECT * FROM workout_daily_exercises WHERE daily_id=$1 ORDER BY order_index ASC, created_at ASC`,
      [daily.id]
    );
    const hydrated = await hydrateItems(items);

    res.json({
      hasError: false,
      data: {
        id: daily.id,
        day: daily.day,
        total_seconds: daily.total_seconds,
        is_completed: daily.is_completed,
        notes: daily.notes,
        created_at: daily.created_at,
        updated_at: daily.updated_at,
        exercises: hydrated
      }
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}

/**
 * POST /workout/days/:day/exercises
 * Append items; does NOT wipe existing.
 * body: { items: [ { exercise_id, order_index?, sets?, reps?, weight_kg?, duration_seconds?, notes? }, ... ] }
 */
export async function addItems(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.params?.day);
    if (!day) return res.status(400).json({ hasError: true, message: "day required" });

    await client.query("BEGIN");
    const daily = await getOrCreateDaily(client, user_id, day);

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length) {
      const values = [];
      const params = [];
      let i = 1;
      for (const it of items) {
        const exercise_id = toStr(it.exercise_id);
        if (!exercise_id) continue;
        const order_index = toInt(it.order_index, 0);
        const sets = it.sets == null ? null : toInt(it.sets);
        const reps = it.reps == null ? null : toInt(it.reps);
        const weight_kg = it.weight_kg == null ? null : Number(it.weight_kg);
        const duration_seconds = it.duration_seconds == null ? null : toInt(it.duration_seconds);
        const inotes = toStr(it.notes);

        params.push(daily.id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, inotes);
        values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      }
      if (values.length) {
        await client.query(
          `INSERT INTO workout_daily_exercises
             (daily_id, exercise_id, order_index, sets, reps, weight_kg, duration_seconds, notes)
           VALUES ${values.join(",")}`,
          params
        );
      }
    }

    await client.query("COMMIT");

    const d = await fetchDayRow(user_id, day);
    const { rows: itemsRows } = await pool.query(
      `SELECT * FROM workout_daily_exercises WHERE daily_id=$1 ORDER BY order_index ASC, created_at ASC`,
      [d.id]
    );
    const hydrated = await hydrateItems(itemsRows);

    res.json({
      hasError: false,
      data: {
        id: d.id,
        day: d.day,
        total_seconds: d.total_seconds,
        is_completed: d.is_completed,
        notes: d.notes,
        created_at: d.created_at,
        updated_at: d.updated_at,
        exercises: hydrated
      }
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}

/**
 * DELETE /workout/days/:day
 */
export async function deleteDay(req, res, next) {
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.params?.day);
    if (!day) return res.status(400).json({ hasError: true, message: "day required" });

    const { rowCount } = await pool.query(
      `DELETE FROM workout_daily WHERE user_id=$1 AND day=$2`,
      [user_id, day]
    );
    res.json({ hasError: false, deleted: rowCount > 0 });
  } catch (e) { next(e); }
}

/**
 * DELETE /workout/days/:day/exercises/:itemId
 */
export async function deleteItem(req, res, next) {
  try {
    const user_id = getUserId(req);
    if (!isNonEmpty(user_id)) return res.status(401).json({ hasError: true, message: "unauthorized" });
    await assertProfileExists(user_id);

    const day = toStr(req.params?.day);
    const itemId = toStr(req.params?.itemId);
    if (!day || !itemId) return res.status(400).json({ hasError: true, message: "day and itemId required" });

    const d = await fetchDayRow(user_id, day);
    if (!d) return res.status(404).json({ hasError: true, message: "day not found" });

    const { rowCount } = await pool.query(
      `DELETE FROM workout_daily_exercises WHERE id=$1 AND daily_id=$2`,
      [itemId, d.id]
    );
    res.json({ hasError: false, deleted: rowCount > 0 });
  } catch (e) { next(e); }
}
