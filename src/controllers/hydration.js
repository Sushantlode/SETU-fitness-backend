// src/controllers/hydration.js
import { pool } from "../db/pool.js";

/* ========== helpers ========== */
const n = (v) => (v == null ? NaN : Number(v));
const pos = (x) => Number.isFinite(x) && x > 0;
const today = () => new Date().toISOString().slice(0, 10);

const computeBmi = (kg, cm) => {
  const w = n(kg), h = n(cm);
  if (!pos(w) || !pos(h)) return null;
  return +(w / ((h / 100) ** 2)).toFixed(2);
};

const bmiCategory = (bmi) => {
  const x = Number(bmi);
  if (!Number.isFinite(x)) return null;
  if (x < 18.5) return "Underweight";
  if (x < 25)   return "Normal";
  if (x < 30)   return "Overweight";
  return "Obese";
};

const recommendedFromBmi = (weightKg, bmi) => {
  const cat = bmiCategory(bmi);
  const mlPerKg = cat === "Obese" ? 25 : cat === "Overweight" ? 30 : 35;
  const raw = Math.round(n(weightKg) * mlPerKg);
  return Math.max(1200, Math.min(6000, raw)); // clamp
};

async function getProfile(user_id, client = pool) {
  const { rows } = await client.query(
    `SELECT id, weight_kg, height_cm, bmi
       FROM ftn_profiles
      WHERE user_id = $1
      LIMIT 1`,
    [String(user_id)]
  );
  return rows[0] || null;
}

async function getActiveGoalMl(user_id, client = pool) {
  const { rows } = await client.query(
    `SELECT daily_ml::int AS ml
       FROM ftn_hydration_goals
      WHERE user_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
      LIMIT 1`,
    [String(user_id)]
  );
  return rows[0]?.ml || 0;
}

async function ensureDaily(user_id, day, goal_ml, client) {
  await client.query(
    `INSERT INTO ftn_daily_water_intake(user_id, day, goal_ml)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO NOTHING`,
    [user_id, day, goal_ml]
  );
}

async function recomputeDaily(user_id, day, client) {
  const [{ rows: sumR }, { rows: goalR }] = await Promise.all([
    client.query(
      `SELECT COALESCE(SUM(amount_ml),0)::int AS raw
         FROM ftn_water_logs
        WHERE user_id = $1 AND logged_at::date = $2::date`,
      [user_id, day]
    ),
    client.query(
      `SELECT goal_ml::int AS goal_ml
         FROM ftn_daily_water_intake
        WHERE user_id = $1 AND day = $2::date
        LIMIT 1`,
      [user_id, day]
    )
  ]);

  const raw = sumR[0].raw;
  const goal = goalR[0]?.goal_ml || 0;
  const clamped = goal > 0 ? Math.min(raw, goal) : raw;
  const met = goal > 0 && raw >= goal;
  const pct = goal > 0 ? Math.min(Math.round((raw / goal) * 100), 100) : 0;

  const { rows } = await client.query(
    `UPDATE ftn_daily_water_intake
        SET consumed_ml = $3, met_goal = $4, updated_at = NOW()
      WHERE user_id = $1 AND day = $2
      RETURNING day, goal_ml::int AS goal_ml, consumed_ml::int AS consumed_ml, met_goal`,
    [user_id, day, clamped, met]
  );

  return { ...rows[0], percent_consumed: pct };
}

/* ========== controllers (NAMED EXPORTS) ========== */

// POST /hydration/body-profile/upsert
export async function upsertBodyProfileAndGoal(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = String(req.user_id);
    const p = await getProfile(user_id, client);
    if (!p) return res.status(404).json({ hasError: true, message: "Profile not found" });

    let bmi = p.bmi;
    if (bmi == null || !Number.isFinite(Number(bmi))) bmi = computeBmi(p.weight_kg, p.height_cm);
    if (bmi == null) return res.status(400).json({ hasError: true, message: "Cannot derive BMI from profile" });

    const daily_ml = recommendedFromBmi(p.weight_kg, bmi);

    await client.query("BEGIN");
    await client.query(
      `UPDATE ftn_hydration_goals SET is_active = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND is_active = TRUE`,
      [user_id]
    );
    const { rows: goalRows } = await client.query(
      `INSERT INTO ftn_hydration_goals(user_id, daily_ml, is_active, created_at, updated_at)
       VALUES ($1, $2, TRUE, NOW(), NOW()) RETURNING *`,
      [user_id, daily_ml]
    );

    const d = today();
    await ensureDaily(user_id, d, daily_ml, client);
    const todayRow = await recomputeDaily(user_id, d, client);

    await client.query("COMMIT");
    res.json({
      hasError: false,
      data: {
        goal: goalRows[0],
        today: {
          day: d,
          goal_ml: todayRow.goal_ml,
          consumed_ml: todayRow.consumed_ml,
          percent_consumed: todayRow.percent_consumed,
          remaining_ml: Math.max(todayRow.goal_ml - todayRow.consumed_ml, 0),
          met_goal: todayRow.met_goal
        }
      }
    });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} ; next(e); }
  finally { client.release(); }
}

// GET /hydration/goal
export async function getGoal(req, res, next) {
  try {
    const user_id = String(req.user_id);
    const [activeMl, p] = await Promise.all([getActiveGoalMl(user_id), getProfile(user_id)]);

    let bmi = p?.bmi;
    if ((bmi == null || !Number.isFinite(Number(bmi))) && p?.height_cm && p?.weight_kg) {
      bmi = computeBmi(p.weight_kg, p.height_cm);
    }

    const suggested_daily_ml =
      (p?.weight_kg && bmi != null) ? recommendedFromBmi(p.weight_kg, bmi) : null;

    res.json({
      hasError: false,
      data: {
        goal_ml: activeMl || null,
        profile_bmi: bmi ?? null,
        bmi_category: bmiCategory(bmi),
        suggested_daily_ml
      }
    });
  } catch (e) { next(e); }
}

// PUT /hydration/goal
export async function setGoal(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = String(req.user_id);
    const daily_ml = n(req.body?.daily_ml);
    if (!pos(daily_ml)) return res.status(400).json({ hasError: true, message: "daily_ml must be > 0" });

    await client.query("BEGIN");
    await client.query(
      `UPDATE ftn_hydration_goals SET is_active = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND is_active = TRUE`,
      [user_id]
    );
    const { rows } = await client.query(
      `INSERT INTO ftn_hydration_goals(user_id, daily_ml, is_active, created_at, updated_at)
       VALUES ($1, $2, TRUE, NOW(), NOW()) RETURNING *`,
      [user_id, daily_ml]
    );

    const d = today();
    await ensureDaily(user_id, d, daily_ml, client);
    await recomputeDaily(user_id, d, client);

    await client.query("COMMIT");
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} ; next(e); }
  finally { client.release(); }
}

// POST /hydration/logs
export async function addLog(req, res, next) {
  if (Array.isArray(req.body?.amounts)) return addLogsBatch(req, res, next);

  const client = await pool.connect();
  try {
    const user_id = String(req.user_id);
    const amount_ml = n(req.body?.amount_ml);
    if (!pos(amount_ml)) return res.status(400).json({ hasError: true, message: "amount_ml must be > 0" });

    const source = req.body?.source ?? null;
    const at = req.body?.logged_at || null;
    const d = (at ? String(at).slice(0, 10) : today());

    const goal_ml = await getActiveGoalMl(user_id, client);
    if (!pos(goal_ml)) return res.status(400).json({ hasError: true, message: "No active goal set" });

    await client.query("BEGIN");
    await ensureDaily(user_id, d, goal_ml, client);

    const { rows: ins } = await client.query(
      `INSERT INTO ftn_water_logs(user_id, logged_at, amount_ml, source, created_at)
       VALUES ($1, COALESCE($2::timestamptz, NOW()), $3, $4, NOW())
       RETURNING id, logged_at, amount_ml::int AS amount_ml, source`,
      [user_id, at, amount_ml, source]
    );

    const updated = await recomputeDaily(user_id, d, client);
    await client.query("COMMIT");

    res.json({
      hasError: false,
      data: {
        inserted: ins[0],
        day: d,
        goal_ml: updated.goal_ml,
        consumed_ml: updated.consumed_ml,
        percent_consumed: updated.percent_consumed,
        remaining_ml: Math.max(updated.goal_ml - updated.consumed_ml, 0),
        met_goal: updated.met_goal
      }
    });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} ; next(e); }
  finally { client.release(); }
}

// POST /hydration/logs/batch
export async function addLogsBatch(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = String(req.user_id);
    const source = req.body?.source ?? null;
    const amounts = (Array.isArray(req.body?.amounts) ? req.body.amounts.map(n) : []);
    const ats = Array.isArray(req.body?.logged_ats) ? req.body.logged_ats : null;

    if (!amounts.length || amounts.some(a => !pos(a))) {
      return res.status(400).json({ hasError: true, message: "amounts must be positive numbers" });
    }
    if (ats && ats.length !== amounts.length) {
      return res.status(400).json({ hasError: true, message: "logged_ats length must match amounts" });
    }

    const d = today();
    const goal_ml = await getActiveGoalMl(user_id, client);
    if (!pos(goal_ml)) return res.status(400).json({ hasError: true, message: "No active goal set" });

    await client.query("BEGIN");
    await ensureDaily(user_id, d, goal_ml, client);

    const params = [];
    const values = [];
    for (let i = 0; i < amounts.length; i++) {
      params.push(user_id, ats ? String(ats[i]) : new Date(Date.now() + i * 500).toISOString(), amounts[i], source);
      const off = i * 4;
      values.push(`($${off + 1}, $${off + 2}::timestamptz, $${off + 3}::int, $${off + 4})`);
    }

    const { rows: inserted } = await client.query(
      `WITH ins AS (
         INSERT INTO ftn_water_logs(user_id, logged_at, amount_ml, source)
         VALUES ${values.join(",")}
         RETURNING id, logged_at, amount_ml::int AS amount_ml, source, created_at
       )
       SELECT * FROM ins ORDER BY logged_at ASC;`,
      params
    );

    const updated = await recomputeDaily(user_id, d, client);
    await client.query("COMMIT");

    res.json({
      hasError: false,
      data: {
        inserted,
        day: d,
        goal_ml: updated.goal_ml,
        consumed_ml: updated.consumed_ml,
        percent_consumed: updated.percent_consumed,
        remaining_ml: Math.max(updated.goal_ml - updated.consumed_ml, 0),
        met_goal: updated.met_goal
      }
    });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} ; next(e); }
  finally { client.release(); }
}

// GET /hydration/logs/today
export async function getTodayLogs(req, res, next) {
  try {
    const user_id = String(req.user_id);
    const d = today();
    const { rows } = await pool.query(
      `SELECT id, logged_at, amount_ml::int AS amount_ml, source, created_at
         FROM ftn_water_logs
        WHERE user_id = $1 AND logged_at::date = $2::date
        ORDER BY logged_at DESC`,
      [user_id, d]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// DELETE /hydration/logs/last
export async function undoLastLog(req, res, next) {
  const client = await pool.connect();
  try {
    const user_id = String(req.user_id);
    const d = today();

    await client.query("BEGIN");
    const { rows: last } = await client.query(
      `SELECT id FROM ftn_water_logs
        WHERE user_id = $1 AND logged_at::date = $2::date
        ORDER BY logged_at DESC
        LIMIT 1`,
      [user_id, d]
    );
    if (!last[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ hasError: true, message: "No logs today" });
    }
    await client.query(`DELETE FROM ftn_water_logs WHERE id = $1`, [last[0].id]);
    const updated = await recomputeDaily(user_id, d, client);
    await client.query("COMMIT");

    res.json({
      hasError: false,
      data: {
        day: d,
        goal_ml: updated.goal_ml,
        consumed_ml: updated.consumed_ml,
        percent_consumed: updated.percent_consumed,
        remaining_ml: Math.max(updated.goal_ml - updated.consumed_ml, 0),
        met_goal: updated.met_goal
      }
    });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} ; next(e); }
  finally { client.release(); }
}

// GET /hydration/consumed/today
export async function getConsumedToday(req, res, next) {
  try {
    const user_id = String(req.user_id);
    const d = today();

    const { rows: logs } = await pool.query(
      `SELECT
         amount_ml::int AS consumed_ml,
         to_char((logged_at AT TIME ZONE 'Asia/Kolkata'), 'HH24:MI') AS time
       FROM ftn_water_logs
       WHERE user_id = $1 AND logged_at::date = $2::date
       ORDER BY logged_at ASC`,
      [user_id, d]
    );

    const raw = logs.reduce((s, r) => s + (r.consumed_ml || 0), 0);
    const { rows: daily } = await pool.query(
      `SELECT goal_ml::int AS goal_ml, consumed_ml::int AS consumed_ml
         FROM ftn_daily_water_intake
        WHERE user_id = $1 AND day = $2::date
        LIMIT 1`,
      [user_id, d]
    );

    const goal_ml = daily[0]?.goal_ml || (await getActiveGoalMl(user_id));
    const clamped = goal_ml > 0 ? Math.min(raw, goal_ml) : raw;
    const percent = goal_ml > 0 ? Math.min(Math.round((raw / goal_ml) * 100), 100) : 0;
    const met = goal_ml > 0 && raw >= goal_ml;

    res.json({
      hasError: false,
      data: {
        day: d,
        goal_ml,
        added_water: logs,
        total_consumed_ml: clamped,
        percent_consumed: percent,
        met_goal: met
      }
    });
  } catch (e) { next(e); }
}

// POST /hydration/daily
export async function getDailyRowsByBody(req, res, next) {
  try {
    const user_id = String(req.user_id);
    const start = (req.body?.start && String(req.body.start).slice(0, 10)) || new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
    const end = (req.body?.end && String(req.body.end).slice(0, 10)) || today();

    const { rows } = await pool.query(
      `SELECT day,
              goal_ml::int     AS goal_ml,
              consumed_ml::int AS consumed_ml,
              met_goal
         FROM ftn_daily_water_intake
        WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date
        ORDER BY day DESC`,
      [user_id, start, end]
    );

    res.json({ hasError: false, data: { start, end, days: rows } });
  } catch (e) { next(e); }
}
