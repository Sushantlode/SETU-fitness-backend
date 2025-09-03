import { pool } from "../db/pool.js";

/* ========= helpers ========= */
const isUuid = (s) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// tolerant: "2025-9-3" -> "2025-09-03"; null if bad
const normDay = (s) => {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const dt = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return `${y}-${mm}-${dd}`;
};

// YYYY-MM-DD in a TZ (default IST)
function dayInTz(tsMs = Date.now(), tz = "Asia/Kolkata") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  });
  return fmt.format(new Date(tsMs));
}

// Map token id -> UUID PK in ftn_profiles
async function resolveProfileUuid(userHint) {
  const hint = String(userHint || "").trim();
  if (!hint) return null;
  if (isUuid(hint)) return hint;
  const { rows } = await pool.query(
    `SELECT id FROM public.ftn_profiles WHERE user_id::text = $1 LIMIT 1`,
    [hint]
  );
  return rows[0]?.id || null;
}

// sanitize/clip inputs
function sanitizeBody(b = {}) {
  const out = {};
  if (b.steps != null) out.steps = Math.max(0, parseInt(b.steps, 10) || 0);
  if (b.distance_m != null) out.distance_m = Math.max(0, Number(b.distance_m) || 0);
  if (b.calories_kcal != null) out.calories_kcal = Math.max(0, Number(b.calories_kcal) || 0);
  if (b.active_seconds != null) out.active_seconds = Math.max(0, parseInt(b.active_seconds, 10) || 0);
  return out;
}

/* ========= CRUD ========= */

// POST /track      (create or upsert by day; missing fields -> 0)
export async function createOrUpsertTrack(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = req.body?.day ? (normDay(String(req.body.day)) || dayInTz()) : dayInTz();
    const v = sanitizeBody(req.body);

    const params = [
      userPk, day,
      v.steps ?? null,
      v.distance_m ?? null,
      v.calories_kcal ?? null,
      v.active_seconds ?? null
    ];

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks
         (user_id, day, steps, distance_m, calories_kcal, active_seconds)
       VALUES ($1::uuid, $2::date,
               COALESCE($3::int,     0),
               COALESCE($4::numeric, 0),
               COALESCE($5::numeric, 0),
               COALESCE($6::int,     0))
       ON CONFLICT (user_id, day) DO UPDATE SET
         steps          = COALESCE($3::int,     fit_daily_tracks.steps),
         distance_m     = COALESCE($4::numeric, fit_daily_tracks.distance_m),
         calories_kcal  = COALESCE($5::numeric, fit_daily_tracks.calories_kcal),
         active_seconds = COALESCE($6::int,     fit_daily_tracks.active_seconds),
         updated_at = NOW()
       RETURNING *`,
      params
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// GET /track?start&end   (range)
export async function listRange(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const start = normDay(String(req.query.start || ""));
    const end   = normDay(String(req.query.end || ""));
    if (!start || !end) return res.status(400).json({ hasError: true, message: "invalid start/end" });

    const sMs = Date.parse(`${start}T00:00:00Z`), eMs = Date.parse(`${end}T00:00:00Z`);
    const [from, to] = sMs <= eMs ? [start, end] : [end, start];

    const { rows } = await pool.query(
      `SELECT * FROM public.fit_daily_tracks
        WHERE user_id=$1::uuid AND day BETWEEN $2::date AND $3::date
        ORDER BY day ASC`,
      [userPk, from, to]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// GET /track/:day
export async function getOneDay(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = normDay(String(req.params.day || ""));
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day" });

    const { rows } = await pool.query(
      `SELECT * FROM public.fit_daily_tracks WHERE user_id=$1::uuid AND day=$2::date`,
      [userPk, day]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /track/:day   (replace all fields)
export async function replaceDay(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = normDay(String(req.params.day || ""));
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day" });

    const v = sanitizeBody(req.body);
    for (const k of ["steps","distance_m","calories_kcal","active_seconds"]) {
      if (v[k] == null) return res.status(400).json({ hasError: true, message: `missing ${k}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks
         (user_id, day, steps, distance_m, calories_kcal, active_seconds)
       VALUES ($1::uuid, $2::date, $3::int, $4::numeric, $5::numeric, $6::int)
       ON CONFLICT (user_id, day) DO UPDATE SET
         steps=$3::int, distance_m=$4::numeric, calories_kcal=$5::numeric, active_seconds=$6::int, updated_at=NOW()
       RETURNING *`,
      [userPk, day, v.steps, v.distance_m, v.calories_kcal, v.active_seconds]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PATCH /track/:day   (partial)
export async function patchDay(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = normDay(String(req.params.day || ""));
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day" });

    const v = sanitizeBody(req.body);

    const cast = { steps: "::int", distance_m: "::numeric", calories_kcal: "::numeric", active_seconds: "::int" };
    const sets = [], vals = [userPk, day];
    for (const k of ["steps","distance_m","calories_kcal","active_seconds"]) {
      if (v[k] != null) { vals.push(v[k]); sets.push(`${k}=$${vals.length}${cast[k]}`); }
    }
    if (!sets.length) return res.status(400).json({ hasError: true, message: "no fields to update" });

    const { rows } = await pool.query(
      `UPDATE public.fit_daily_tracks
         SET ${sets.join(", ")}, updated_at=NOW()
       WHERE user_id=$1::uuid AND day=$2::date
       RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// DELETE /track/:day
export async function deleteDay(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = normDay(String(req.params.day || ""));
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day" });

    const { rowCount } = await pool.query(
      `DELETE FROM public.fit_daily_tracks WHERE user_id=$1::uuid AND day=$2::date`,
      [userPk, day]
    );
    if (!rowCount) return res.status(404).json({ hasError: true, message: "not found" });
    res.json({ hasError: false, success: true });
  } catch (e) { next(e); }
}

/* ========= single-field updates ========= */

// PUT /track/steps
export async function updateSteps(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = req.body?.day ? (normDay(String(req.body.day)) || dayInTz()) : dayInTz();
    const v = Math.max(0, parseInt(req.body?.steps, 10) || 0);

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks (user_id, day, steps)
       VALUES ($1::uuid,$2::date,$3::int)
       ON CONFLICT (user_id, day) DO UPDATE SET steps=$3::int, updated_at=NOW()
       RETURNING *`,
      [userPk, day, v]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /track/distance
export async function updateDistance(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = req.body?.day ? (normDay(String(req.body.day)) || dayInTz()) : dayInTz();
    const v = Math.max(0, Number(req.body?.distance_m) || 0);

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks (user_id, day, distance_m)
       VALUES ($1::uuid,$2::date,$3::numeric)
       ON CONFLICT (user_id, day) DO UPDATE SET distance_m=$3::numeric, updated_at=NOW()
       RETURNING *`,
      [userPk, day, v]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /track/calories
export async function updateCalories(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = req.body?.day ? (normDay(String(req.body.day)) || dayInTz()) : dayInTz();
    const v = Math.max(0, Number(req.body?.calories_kcal) || 0);

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks (user_id, day, calories_kcal)
       VALUES ($1::uuid,$2::date,$3::numeric)
       ON CONFLICT (user_id, day) DO UPDATE SET calories_kcal=$3::numeric, updated_at=NOW()
       RETURNING *`,
      [userPk, day, v]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

/* ========= live rollover (optional) =========
   PUT /track/steps/live  { device_total, ts?, timezone? }
*/
export async function updateStepsLive(req, res, next) {
  const client = await pool.connect();
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) { client.release(); return res.status(401).json({ hasError: true, message: "unknown user (no profile)" }); }

    const tz = (req.body?.timezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
    const tsRaw = req.body?.ts;
    const tsMs = tsRaw == null ? Date.now() : (isNaN(tsRaw) ? Date.parse(String(tsRaw)) : Number(tsRaw));
    if (!Number.isFinite(tsMs)) { client.release(); return res.status(400).json({ hasError: true, message: "invalid ts" }); }

    const today = dayInTz(tsMs, tz);
    const total = Number(req.body?.device_total);
    if (!Number.isFinite(total) || total < 0) { client.release(); return res.status(400).json({ hasError: true, message: "invalid device_total" }); }

    await client.query("BEGIN");

    const curQ = await client.query(
      `SELECT user_id, cursor_day, baseline_total, last_total
       FROM public.fit_step_cursors WHERE user_id=$1::uuid FOR UPDATE`,
      [userPk]
    );

    if (!curQ.rows[0]) {
      await client.query(
        `INSERT INTO public.fit_step_cursors (user_id, cursor_day, baseline_total, last_total, updated_at)
         VALUES ($1::uuid,$2::date,$3::bigint,$3::bigint,NOW())`,
        [userPk, today, Math.trunc(total)]
      );
      await client.query(
        `INSERT INTO public.fit_daily_tracks (user_id, day, steps)
         VALUES ($1::uuid,$2::date,0)
         ON CONFLICT (user_id, day) DO NOTHING`,
        [userPk, today]
      );
      await client.query("COMMIT");
      client.release();
      const { rows } = await pool.query(
        `SELECT * FROM public.fit_daily_tracks WHERE user_id=$1::uuid AND day=$2::date`,
        [userPk, today]
      );
      return res.json({ hasError: false, data: rows[0] || { user_id: userPk, day: today, steps: 0 } });
    }

    const cur = curQ.rows[0];

    if (cur.cursor_day === today) {
      let daily = Math.trunc(total) - Number(cur.baseline_total);
      if (daily < 0) {
        await client.query(
          `UPDATE public.fit_step_cursors
             SET baseline_total=$2::bigint, last_total=$2::bigint, updated_at=NOW()
           WHERE user_id=$1::uuid`,
          [userPk, Math.trunc(total)]
        );
        daily = 0;
      } else {
        await client.query(
          `UPDATE public.fit_step_cursors SET last_total=$2::bigint, updated_at=NOW() WHERE user_id=$1::uuid`,
          [userPk, Math.trunc(total)]
        );
      }
      await client.query(
        `INSERT INTO public.fit_daily_tracks (user_id, day, steps)
         VALUES ($1::uuid,$2::date,$3::int)
         ON CONFLICT (user_id, day) DO UPDATE SET steps=$3::int, updated_at=NOW()`,
        [userPk, today, Math.max(0, daily)]
      );
      await client.query("COMMIT");
      client.release();
      const { rows } = await pool.query(
        `SELECT * FROM public.fit_daily_tracks WHERE user_id=$1::uuid AND day=$2::date`,
        [userPk, today]
      );
      return res.json({ hasError: false, data: rows[0] });
    } else {
      const prevSteps = Math.max(0, Math.trunc(Number(cur.last_total) - Number(cur.baseline_total)));
      await client.query(
        `INSERT INTO public.fit_daily_tracks (user_id, day, steps)
         VALUES ($1::uuid,$2::date,$3::int)
         ON CONFLICT (user_id, day) DO UPDATE SET
           steps = GREATEST($3::int, fit_daily_tracks.steps), updated_at=NOW()`,
        [userPk, cur.cursor_day, prevSteps]
      );
      await client.query(
        `UPDATE public.fit_step_cursors
         SET cursor_day=$2::date, baseline_total=$3::bigint, last_total=$3::bigint, updated_at=NOW()
         WHERE user_id=$1::uuid`,
        [userPk, today, Math.trunc(total)]
      );
      await client.query(
        `INSERT INTO public.fit_daily_tracks (user_id, day, steps)
         VALUES ($1::uuid,$2::date,0)
         ON CONFLICT (user_id, day) DO UPDATE SET steps=LEAST(fit_daily_tracks.steps, 0)`,
        [userPk, today]
      );
      await client.query("COMMIT");
      client.release();
      const { rows } = await pool.query(
        `SELECT * FROM public.fit_daily_tracks WHERE user_id=$1::uuid AND day=$2::date`,
        [userPk, today]
      );
      return res.json({ hasError: false, data: rows[0] });
    }
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    next(e);
  }
}

/* ========= optional: combined patch =========
   PATCH /track/metrics  { day, steps?, distance_m?, calories_kcal? }
*/
export async function patchMetrics(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const day = normDay(String(req.body?.day || ""));
    if (!day) return res.status(400).json({ hasError: true, message: "invalid day (YYYY-MM-DD)" });

    const stepsParam = req.body?.steps;
    const distParam  = req.body?.distance_m;
    const calParam   = req.body?.calories_kcal;
    if (stepsParam === undefined && distParam === undefined && calParam === undefined) {
      return res.status(400).json({ hasError: true, message: "no metrics to update" });
    }

    const stepsVal = stepsParam === undefined ? null : Math.max(0, parseInt(stepsParam, 10) || 0);
    const distVal  = distParam  === undefined ? null : Math.max(0, Number(distParam) || 0);
    const calVal   = calParam   === undefined ? null : Math.max(0, Number(calParam) || 0);

    const { rows } = await pool.query(
      `INSERT INTO public.fit_daily_tracks (user_id, day, steps, distance_m, calories_kcal)
       VALUES ($1::uuid, $2::date,
               COALESCE($3::int, 0), COALESCE($4::numeric, 0), COALESCE($5::numeric, 0))
       ON CONFLICT (user_id, day) DO UPDATE SET
         steps         = CASE WHEN $3::int     IS NULL THEN fit_daily_tracks.steps         ELSE EXCLUDED.steps         END,
         distance_m    = CASE WHEN $4::numeric IS NULL THEN fit_daily_tracks.distance_m    ELSE EXCLUDED.distance_m    END,
         calories_kcal = CASE WHEN $5::numeric IS NULL THEN fit_daily_tracks.calories_kcal ELSE EXCLUDED.calories_kcal END,
         updated_at = NOW()
       RETURNING *`,
      [userPk, day, stepsVal, distVal, calVal]
    );

    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

/* ========= NEW: daily steps goal from BMI + goal status =========
   GET /track/steps/needed[?day=YYYY-MM-DD]
*/
export async function getDailyNeededSteps(req, res, next) {
  try {
    const userPk = await resolveProfileUuid(req.user_id ?? req.user?.user_id);
    if (!userPk) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    // day param optional, defaults to "today" in IST
    const dayParam = typeof req.query?.day === "string" ? req.query.day : null;
    const day = dayParam ? (normDay(dayParam) || dayInTz()) : dayInTz();

    // fetch BMI + actual steps for that day
    const { rows } = await pool.query(
      `SELECT p.id, p.bmi, COALESCE(t.steps, 0) AS actual_steps
         FROM public.ftn_profiles p
         LEFT JOIN public.fit_daily_tracks t
           ON t.user_id = p.id AND t.day = $2::date
        WHERE p.id = $1::uuid
        LIMIT 1`,
      [userPk, day]
    );

    const r = rows[0];
    if (!r) return res.status(401).json({ hasError: true, message: "unknown user (no profile)" });

    const bmiNum = r.bmi == null ? null : Number(r.bmi);
    if (!Number.isFinite(bmiNum)) {
      return res.status(400).json({ hasError: true, message: "bmi missing on profile" });
    }

    // bmi-bands-v1 mapping
    let bmi_band, recommended_steps;
    if (bmiNum < 18.5) { bmi_band = "underweight"; recommended_steps = 8000; }
    else if (bmiNum < 25) { bmi_band = "normal"; recommended_steps = 9000; }
    else if (bmiNum < 30) { bmi_band = "overweight"; recommended_steps = 11000; }
    else { bmi_band = "obese"; recommended_steps = 12000; }

    const actual_steps = Math.max(0, parseInt(r.actual_steps, 10) || 0);
    const goal_completed = actual_steps >= recommended_steps;

    return res.json({
      hasError: false,
      data: {
        user_id: userPk,
        day,
        bmi: Number(bmiNum.toFixed(2)),
        bmi_band,
        recommended_steps,
        actual_steps,
        goal_completed,
        rule: "bmi-bands-v1"
      }
    });
  } catch (e) { next(e); }
}
