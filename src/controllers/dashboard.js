// src/controllers/goals.js
import { pool } from "../db/pool.js";

/* ----------------------------- TZ + Validation ---------------------------- */
const IST = "Asia/Kolkata";
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const asDay = (s) => (typeof s === "string" && DAY_RE.test(s) ? s : null);
const todayIST = () =>
  new Date().toLocaleString("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }); // YYYY-MM-DD

const clampPct = (x) => Math.max(0, Math.min(100, Math.round(x)));

/* --------------------------------- Auth ---------------------------------- */
function requireUserId(req) {
  // accept either req.user_id or req.user.user_id, normalize to string
  const id = req.user_id ?? req.user?.user_id ?? null;
  return id ? String(id) : null;
}

/* ----------------------------- Hydration (1/4) ---------------------------- */
/** Prefer ftn_daily_water_intake (goal/consumed), else derive from logs + active goal */
async function hydrationForDay(user_id, day) {
  // try daily table first
  const { rows: drows } = await pool.query(
    `SELECT goal_ml::int AS goal_ml, COALESCE(consumed_ml,0)::int AS consumed_ml, COALESCE(met_goal,false) AS met_goal
       FROM ftn_daily_water_intake
      WHERE user_id=$1 AND day=$2::date
      LIMIT 1`,
    [user_id, day]
  );

  let goal_ml, consumed_ml, met_goal = false;

  if (drows[0]) {
    goal_ml = drows[0].goal_ml;
    consumed_ml = drows[0].consumed_ml;
    met_goal = drows[0].met_goal === true;
  } else {
    // fallback: latest active goal
    const { rows: g } = await pool.query(
      `SELECT daily_ml::int AS goal_ml
         FROM ftn_hydration_goals
        WHERE user_id=$1 AND is_active=TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [user_id]
    );
    goal_ml = g[0]?.goal_ml ?? 0;

    const { rows: w } = await pool.query(
      `SELECT COALESCE(SUM(amount_ml),0)::int AS consumed_ml
         FROM ftn_water_logs
        WHERE user_id=$1 AND (logged_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
      [user_id, day]
    );
    consumed_ml = w[0]?.consumed_ml ?? 0;
    met_goal = goal_ml > 0 && consumed_ml >= goal_ml;
  }

  const pct = goal_ml > 0 ? clampPct((consumed_ml / goal_ml) * 100) : 0;
  return { goal_ml, consumed_ml, met_goal, pct };
}

/* -------------------------------- Meals (2/4) ----------------------------- */
/**
 * We compute meals % using CALORIES as the driver (simple, objective).
 * Target order of preference:
 *  1) A saved target in a per-day table (ftn_daily_targets.calories) if you have it
 *  2) Else fallback to 2000 kcal (change DEFAULT_KCAL below if you want)
 */
const DEFAULT_KCAL = 2000;

async function mealsForDay(user_id, day) {
  // consumed
  const { rows: c } = await pool.query(
    `SELECT COALESCE(SUM(calories)::int,0) AS calories
       FROM public.ftn_daily_meals
      WHERE user_id=$1 AND day=$2::date`,
    [user_id, day]
  );
  const consumed_kcal = c[0]?.calories ?? 0;

  // target (try a targets table if present; catch if table doesn't exist)
  let goal_kcal = DEFAULT_KCAL;
  try {
    const tgt = await pool.query(
      `SELECT calories::int AS kcal
         FROM public.ftn_daily_targets
        WHERE user_id=$1 AND day=$2::date
        LIMIT 1`,
      [user_id, day]
    );
    if (tgt.rows[0]?.kcal > 0) goal_kcal = tgt.rows[0].kcal;
  } catch {
    // silently fallback to default
  }

  const pct = goal_kcal > 0 ? clampPct((consumed_kcal / goal_kcal) * 100) : 0;
  return { goal_kcal, consumed_kcal, pct };
}

/* ------------------------------- Steps (3/4) ------------------------------ */
/**
 * Uses BMI bands from ftn_profiles.bmi to set recommended steps.
 * Steps source: fit_daily_tracks(day). If missing BMI, default band "normal" (9000).
 */
function stepsGoalFromBMI(bmiNum) {
  if (!Number.isFinite(bmiNum)) return 9000;
  if (bmiNum < 18.5) return 8000;
  if (bmiNum < 25) return 9000;
  if (bmiNum < 30) return 11000;
  return 12000;
}

async function stepsForDay(user_id, day) {
  const { rows } = await pool.query(
    `SELECT p.bmi, COALESCE(t.steps,0)::int AS steps
       FROM public.ftn_profiles p
       LEFT JOIN public.fit_daily_tracks t
         ON t.user_id = p.id AND t.day=$2::date
      WHERE p.user_id=$1
      LIMIT 1`,
    [user_id, day]
  );
  if (!rows[0]) {
    // profile missing → treat as zero data
    return { goal_steps: 9000, actual_steps: 0, pct: 0 };
  }
  const bmi = rows[0].bmi == null ? null : Number(rows[0].bmi);
  const goal_steps = stepsGoalFromBMI(bmi);
  const actual_steps = rows[0].steps || 0;
  const pct = goal_steps > 0 ? clampPct((actual_steps / goal_steps) * 100) : 0;
  return { goal_steps, actual_steps, pct };
}

/* ------------------------------ Workout (4/4) ----------------------------- */
/**
 * Workout %: if workout_daily.is_completed → 100.
 * Else use total_seconds vs GOAL_SECONDS (default 1800 = 30 min).
 * Change GOAL_SECONDS if you want a different daily workout target.
 */
const GOAL_SECONDS = 1800;

async function workoutForDay(user_id, day) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(total_seconds,0)::int AS total_seconds,
              COALESCE(is_completed,false)  AS is_completed
         FROM public.workout_daily
        WHERE user_id=$1 AND day=$2::date
        LIMIT 1`,
      [user_id, day]
    );
    const row = rows[0];
    if (!row) return { total_seconds: 0, is_completed: false, pct: 0 };

    const total_seconds = row.total_seconds || 0;
    const is_completed = row.is_completed === true;
    const pct = is_completed ? 100 : clampPct((total_seconds / GOAL_SECONDS) * 100);
    return { total_seconds, is_completed, pct };
  } catch {
    // table missing / other error → safe fallback
    return { total_seconds: 0, is_completed: false, pct: 0 };
  }
}

/* ---------------------------- Composition Logic --------------------------- */
function compositePct(parts /* array of numbers */) {
  // equal weights across 4 components; ignore NaN by treating as 0
  const safe = parts.map((x) => (Number.isFinite(x) ? x : 0));
  return clampPct(safe.reduce((a, b) => a + b, 0) / safe.length);
}

async function buildDaySummary(user_id, day) {
  const [hyd, meal, step, wkt] = await Promise.all([
    hydrationForDay(user_id, day),
    mealsForDay(user_id, day),
    stepsForDay(user_id, day),
    workoutForDay(user_id, day),
  ]);

  const overall_pct = compositePct([hyd.pct, meal.pct, step.pct, wkt.pct]);
  return {
    day,
    overall_pct,
    components: {
      hydration_pct: hyd.pct,
      meals_pct: meal.pct,
      steps_pct: step.pct,
      workout_pct: wkt.pct,
    },
    hydration: {
      goal_ml: hyd.goal_ml,
      consumed_ml: hyd.consumed_ml,
      met_goal: hyd.met_goal,
    },
    meals: {
      goal_kcal: meal.goal_kcal,
      consumed_kcal: meal.consumed_kcal,
    },
    steps: {
      goal_steps: step.goal_steps,
      actual_steps: step.actual_steps,
    },
    workout: {
      total_seconds: wkt.total_seconds,
      is_completed: wkt.is_completed,
      goal_seconds: GOAL_SECONDS,
    },
  };
}

/* -------------------------------- Handlers -------------------------------- */
// GET /goals/day  (today in IST)
export async function getToday(req, res, next) {
  try {
    const user_id = requireUserId(req);
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });
    const day = todayIST();
    const data = await buildDaySummary(user_id, day);
    return res.json({ hasError: false, data });
  } catch (e) { next(e); }
}

// GET /goals/day/:day  (YYYY-MM-DD)
export async function getByDay(req, res, next) {
  try {
    const user_id = requireUserId(req);
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });
    const day = asDay(req.params.day);
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day (YYYY-MM-DD)" });
    const data = await buildDaySummary(user_id, day);
    return res.json({ hasError: false, data });
  } catch (e) { next(e); }
}

// GET /goals/history?start=YYYY-MM-DD&end=YYYY-MM-DD
// limits range to 31 days to keep it cheap. Use pagination on client or widen safely later.
export async function getHistory(req, res, next) {
  try {
    const user_id = requireUserId(req);
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const start = asDay(String(req.query.start || ""));
    const end   = asDay(String(req.query.end   || ""));
    let s = start, e = end;

    if (!s && !e) {
      // default last 7 full days ending today IST
      e = todayIST();
      const d = new Date(`${e}T00:00:00`);
      d.setDate(d.getDate() - 6);
      s = d.toISOString().slice(0, 10);
    }
    if (!s || !e) return res.status(400).json({ hasError: true, message: "invalid start/end (YYYY-MM-DD)" });

    // normalize order
    if (s > e) [s, e] = [e, s];

    // guard max range
    const sMs = Date.parse(`${s}T00:00:00Z`);
    const eMs = Date.parse(`${e}T00:00:00Z`);
    const days = Math.floor((eMs - sMs) / (24 * 3600 * 1000)) + 1;
    if (days > 31) return res.status(400).json({ hasError: true, message: "range too large (max 31 days)" });

    // generate list of days
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${s}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // compute in parallel but batched to avoid hammering DB
    const batchSize = 6;
    const results = [];
    for (let i = 0; i < dates.length; i += batchSize) {
      const chunk = dates.slice(i, i + batchSize);
      const done = await Promise.all(chunk.map((d) => buildDaySummary(user_id, d)));
      results.push(...done);
    }

    return res.json({
      hasError: false,
      meta: { start: s, end: e, count: results.length },
      data: results, // ascending by day
    });
  } catch (e) { next(e); }
}
