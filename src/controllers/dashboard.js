// src/controllers/dashboard.js
import { pool } from "../db/pool.js";

function asDate(x) {
  // expects 'YYYY-MM-DD' or undefined
  if (!x) return null;
  const m = String(x).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? x : null;
}

export async function day(req, res, next) {
  try {
    const user_id = req.user_id;
    const dateParam = asDate(req.query.date);
    // default to today if not provided
    const daySQL = dateParam ? dateParam : null; // null means CURRENT_DATE in SQL

    // 1) goals
    const [{ rows: goalHyd }, { rows: goalDaily }] = await Promise.all([
      pool.query(
        `SELECT daily_ml
           FROM ftn_hydration_goals
          WHERE user_id=$1 AND is_active=TRUE
          ORDER BY created_at DESC LIMIT 1`,
        [user_id]
      ),
      pool
        .query(
          `SELECT daily_calorie_kcal, daily_exercise_min
             FROM ftn_daily_goals
            WHERE user_id=$1 AND is_active=TRUE
            ORDER BY created_at DESC LIMIT 1`,
          [user_id]
        )
        .catch(() => ({ rows: [] })), // table may not exist yet
    ]);

    const water_goal_ml = goalHyd[0]?.daily_ml ?? 0;
    const cal_goal_kcal = goalDaily[0]?.daily_calorie_kcal ?? null;
    const ex_goal_min = goalDaily[0]?.daily_exercise_min ?? null;

    // helpers for date filter
    const dateFilter = (col) =>
      dateParam ? `${col}::date = $2` : `${col}::date = CURRENT_DATE`;

    const dateArgs = dateParam ? [user_id, dateParam] : [user_id];

    // 2) consumed water
    const { rows: wrows } = await pool.query(
      `SELECT COALESCE(SUM(amount_ml),0)::int AS ml
         FROM ftn_water_logs
        WHERE user_id=$1 AND ${dateFilter("logged_at")}`,
      dateArgs
    );
    const water_ml = Number(wrows[0]?.ml ?? 0);

    // 3) calories eaten that day
    const { rows: crows } = await pool.query(
      `SELECT COALESCE(SUM(total_calories),0)::int AS kcal
         FROM ftn_meal_logs
        WHERE user_id=$1 AND ${dateFilter("eaten_at")}`,
      dateArgs
    );
    const eaten_kcal = Number(crows[0]?.kcal ?? 0);

    // 4) activity sessions (count + minutes)
    const sessRes = await pool
      .query(
        `SELECT
            COUNT(*)::int AS sessions,
            COALESCE(SUM(COALESCE(duration_min, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))/60)::int)),0)::int AS minutes
           FROM ftn_activity_sessions
          WHERE user_id=$1 AND ${dateFilter("started_at")}`,
        dateArgs
      )
      .catch(() => ({ rows: [{ sessions: 0, minutes: 0 }] })); // if table not present yet

    const sessions = Number(sessRes.rows[0].sessions || 0);
    const minutes = Number(sessRes.rows[0].minutes || 0);

    // 5) daily movement (steps/distance)
    const moveRes = await pool
      .query(
        `SELECT steps::int, distance_km::numeric
           FROM ftn_daily_activity
          WHERE user_id=$1 AND ${dateParam ? "day=$2" : "day=CURRENT_DATE"}
          LIMIT 1`,
        dateArgs
      )
      .catch(() => ({ rows: [] }));
    const steps = Number(moveRes.rows?.[0]?.steps ?? 0);
    const distance_km = Number(moveRes.rows?.[0]?.distance_km ?? 0);

    // === Compute component percentages ===
    const water_pct =
      water_goal_ml > 0 ? Math.min(water_ml / water_goal_ml, 1) * 100 : 0;

    let exercise_pct = 0;
    if (ex_goal_min && ex_goal_min > 0) {
      exercise_pct = Math.min(minutes / ex_goal_min, 1) * 100;
    } else {
      exercise_pct = sessions > 0 ? 100 : 0; // fallback if no goal configured
    }

    let diet_pct = 0;
    if (cal_goal_kcal && cal_goal_kcal > 0) {
      diet_pct = Math.min(eaten_kcal / cal_goal_kcal, 1) * 100;
    } else {
      // fallback: treat 2000 kcal as goal
      diet_pct = Math.min(eaten_kcal / 2000, 1) * 100;
    }

    const completion_pct = Math.round(
      (water_pct + exercise_pct + diet_pct) / 3
    );

    return res.json({
      hasError: false,
      data: {
        date: dateParam || new Date().toISOString().slice(0, 10),
        completion_pct,
        components: {
          water_pct: Math.round(water_pct),
          exercise_pct: Math.round(exercise_pct),
          diet_pct: Math.round(diet_pct),
        },
        hydration: { goal_ml: water_goal_ml, consumed_ml: water_ml },
        calories: { consumed_kcal: eaten_kcal, goal_kcal: cal_goal_kcal },
        activity: { sessions, minutes, goal_min: ex_goal_min },
        movement: { steps, distance_km },
      },
    });
  } catch (e) {
    next(e);
  }
}
