import { pool } from "../db/pool.js";

/* ---------- Utilities ---------- */
const IST_TODAY_SQL = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const dayOrToday = (d) => d ? `${d}` : null;

/* ---------- CREATE ---------- */
/**
 * POST /track
 * Create a record for a day. 409 if exists (unless ?upsert=1).
 * Body: { day?, steps?, distance_m?, calories_kcal?, active_seconds?, source? }
 */
export async function createTrack(req, res, next) {
  try {
    const user_id = req.user_id;
    const upsert = String(req.query.upsert || "0") === "1";
    const {
      day,
      steps = 0,
      distance_m = 0,
      calories_kcal = 0,
      active_seconds = 0,
      source = "manual"
    } = req.body || {};

    if (upsert) {
      const { rows } = await pool.query(
        `
        INSERT INTO fit_daily_tracks (user_id, day, steps, distance_m, calories_kcal, active_seconds, source, last_synced_at, created_at, updated_at)
        VALUES ($1, COALESCE($2::date, ${IST_TODAY_SQL}), $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
        ON CONFLICT (user_id, day) DO UPDATE SET
          steps          = EXCLUDED.steps,
          distance_m     = EXCLUDED.distance_m,
          calories_kcal  = EXCLUDED.calories_kcal,
          active_seconds = EXCLUDED.active_seconds,
          source         = EXCLUDED.source,
          last_synced_at = NOW(),
          updated_at     = NOW()
        RETURNING *
        `,
        [user_id, dayOrToday(day), steps, distance_m, calories_kcal, active_seconds, source]
      );
      return res.json({ hasError: false, data: rows[0] });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO fit_daily_tracks (user_id, day, steps, distance_m, calories_kcal, active_seconds, source, last_synced_at, created_at, updated_at)
      VALUES ($1, COALESCE($2::date, ${IST_TODAY_SQL}), $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
      ON CONFLICT (user_id, day) DO NOTHING
      RETURNING *
      `,
      [user_id, dayOrToday(day), steps, distance_m, calories_kcal, active_seconds, source]
    );
    if (!rows[0]) return res.status(409).json({ hasError: true, message: "Record exists" });
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

/* ---------- READ ---------- */
/**
 * GET /track/:day
 * Path: day = YYYY-MM-DD
 */
export async function getTrackByDay(req, res, next) {
  try {
    const user_id = req.user_id;
    const day = req.params.day;
    const { rows } = await pool.query(
      `SELECT * FROM fit_daily_tracks WHERE user_id=$1 AND day=$2::date`,
      [user_id, day]
    );
    return res.json({ hasError: false, data: rows[0] || null });
  } catch (e) { next(e); }
}

/**
 * GET /track
 * Query: start?, end?, page? (1+), limit? (default 30)
 */
export async function listTracks(req, res, next) {
  try {
    const user_id = req.user_id;
    const start = req.query.start || '1900-01-01';
    const end   = req.query.end   || '9999-12-31';
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || "30", 10)));
    const page  = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `
      SELECT day, steps, distance_m, calories_kcal, active_seconds, source, last_synced_at, updated_at
      FROM fit_daily_tracks
      WHERE user_id=$1 AND day BETWEEN $2::date AND $3::date
      ORDER BY day DESC
      LIMIT $4 OFFSET $5
      `,
      [user_id, start, end, limit, offset]
    );
    return res.json({ hasError: false, page, limit, data: rows });
  } catch (e) { next(e); }
}

/* ---------- UPDATE (full replace) ---------- */
/**
 * PUT /track/:day
 * Body: { steps, distance_m, calories_kcal, active_seconds, source? }
 * Replaces all metric fields for the day.
 */
export async function putTrackForDay(req, res, next) {
  try {
    const user_id = req.user_id;
    const day = req.params.day;
    const { steps, distance_m, calories_kcal, active_seconds, source } = req.body || {};
    if ([steps, distance_m, calories_kcal, active_seconds].some(v => v == null)) {
      return res.status(400).json({ hasError: true, message: "steps, distance_m, calories_kcal, active_seconds are required" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO fit_daily_tracks (user_id, day, steps, distance_m, calories_kcal, active_seconds, source, last_synced_at, created_at, updated_at)
      VALUES ($1, $2::date, $3, $4, $5, $6, COALESCE($7, 'manual'), NOW(), NOW(), NOW())
      ON CONFLICT (user_id, day) DO UPDATE SET
        steps          = EXCLUDED.steps,
        distance_m     = EXCLUDED.distance_m,
        calories_kcal  = EXCLUDED.calories_kcal,
        active_seconds = EXCLUDED.active_seconds,
        source         = EXCLUDED.source,
        last_synced_at = NOW(),
        updated_at     = NOW()
      RETURNING *
      `,
      [user_id, day, steps, distance_m, calories_kcal, active_seconds, source || null]
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

/* ---------- UPDATE (partial) ---------- */
/**
 * PATCH /track/:day
 * Body: any subset of { steps, distance_m, calories_kcal, active_seconds, source }
 * Only provided fields are updated; row is created if missing.
 */
export async function patchTrackForDay(req, res, next) {
  try {
    const user_id = req.user_id;
    const day = req.params.day;

    // Ensure row
    await pool.query(
      `INSERT INTO fit_daily_tracks (user_id, day) VALUES ($1, $2::date) ON CONFLICT DO NOTHING`,
      [user_id, day]
    );

    const fields = [];
    const params = [user_id, day];
    let i = 3;

    const up = (col, val, cast) => {
      if (val !== undefined) {
        fields.push(`${col} = $${i}${cast || ""}`);
        params.push(val);
        i++;
      }
    };

    const { steps, distance_m, calories_kcal, active_seconds, source } = req.body || {};
    up("steps", steps, "::int");
    up("distance_m", distance_m, "::numeric");
    up("calories_kcal", calories_kcal, "::numeric");
    up("active_seconds", active_seconds, "::int");
    up("source", source);

    if (!fields.length) return res.status(400).json({ hasError: true, message: "No fields to update" });

    const { rows } = await pool.query(
      `
      UPDATE fit_daily_tracks
      SET ${fields.join(", ")},
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE user_id=$1 AND day=$2::date
      RETURNING *
      `,
      params
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

/* ---------- DELETE ---------- */
/**
 * DELETE /track/:day
 */
export async function deleteTrackByDay(req, res, next) {
  try {
    const user_id = req.user_id;
    const day = req.params.day;
    const { rowCount } = await pool.query(
      `DELETE FROM fit_daily_tracks WHERE user_id=$1 AND day=$2::date`,
      [user_id, day]
    );
    if (!rowCount) return res.status(404).json({ hasError: true, message: "Not found" });
    return res.json({ hasError: false, deleted: true });
  } catch (e) { next(e); }
}

/* ---------- Convenience metric PUTs (overwrite a single field) ---------- */
// PUT /track/steps
export async function putSteps(req, res, next) {
  try {
    const user_id = req.user_id;
    const { day, steps } = req.body || {};
    if (steps == null) return res.status(400).json({ hasError: true, message: "steps required" });

    const { rows } = await pool.query(
      `
      INSERT INTO fit_daily_tracks (user_id, day, steps)
      VALUES ($1, COALESCE($2::date, ${IST_TODAY_SQL}), $3)
      ON CONFLICT (user_id, day) DO UPDATE SET
        steps = EXCLUDED.steps,
        updated_at = NOW(),
        last_synced_at = NOW()
      RETURNING *
      `,
      [user_id, dayOrToday(day), steps]
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /track/distance
export async function putDistance(req, res, next) {
  try {
    const user_id = req.user_id;
    const { day, distance_m } = req.body || {};
    if (distance_m == null) return res.status(400).json({ hasError: true, message: "distance_m required" });

    const { rows } = await pool.query(
      `
      INSERT INTO fit_daily_tracks (user_id, day, distance_m)
      VALUES ($1, COALESCE($2::date, ${IST_TODAY_SQL}), $3)
      ON CONFLICT (user_id, day) DO UPDATE SET
        distance_m = EXCLUDED.distance_m,
        updated_at = NOW(),
        last_synced_at = NOW()
      RETURNING *
      `,
      [user_id, dayOrToday(day), distance_m]
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /track/calories
export async function putCalories(req, res, next) {
  try {
    const user_id = req.user_id;
    const { day, calories_kcal } = req.body || {};
    if (calories_kcal == null) return res.status(400).json({ hasError: true, message: "calories_kcal required" });

    const { rows } = await pool.query(
      `
      INSERT INTO fit_daily_tracks (user_id, day, calories_kcal)
      VALUES ($1, COALESCE($2::date, ${IST_TODAY_SQL}), $3)
      ON CONFLICT (user_id, day) DO UPDATE SET
        calories_kcal = EXCLUDED.calories_kcal,
        updated_at = NOW(),
        last_synced_at = NOW()
      RETURNING *
      `,
      [user_id, dayOrToday(day), calories_kcal]
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}
