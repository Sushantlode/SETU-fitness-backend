import { pool } from "../db/pool.js";
import crypto from "crypto";
import { putObject, presignGet } from "../utils/s3.js";
import { mealImageKey } from "../utils/keys.js";

/* ===================== MIME → extension ===================== */
const extFromMime = (m) =>
  /png$/i.test(m)     ? "png"  :
  /jpe?g$/i.test(m)   ? "jpg"  :
  /webp$/i.test(m)    ? "webp" :
  /gif$/i.test(m)     ? "gif"  :
  /hei[cf]$/i.test(m) ? "heic" : "bin";

/* ===================== Bootstrap: create/patch table ===================== */
export async function ensureMealsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ftn_daily_meals ( id BIGSERIAL PRIMARY KEY );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='user_id')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN user_id TEXT; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='day')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN day DATE NOT NULL DEFAULT CURRENT_DATE; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='meal_type')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN meal_type TEXT; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='food_name')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN food_name TEXT NOT NULL; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='amount')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN amount NUMERIC(10,2); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='unit')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN unit TEXT; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='calories')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN calories INT; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='protein_g')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN protein_g NUMERIC(10,2); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='carbs_g')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN carbs_g NUMERIC(10,2); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='fat_g')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN fat_g NUMERIC(10,2); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='fiber_g')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN fiber_g NUMERIC(10,2); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='image_s3_key')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN image_s3_key TEXT; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='is_completed')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN is_completed BOOLEAN DEFAULT FALSE; END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='created_at')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(); END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ftn_daily_meals' AND column_name='updated_at')
      THEN ALTER TABLE public.ftn_daily_meals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(); END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_ftn_daily_meals_user_day
      ON public.ftn_daily_meals (user_id, day, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ftn_daily_meals_user_day_mealtype
      ON public.ftn_daily_meals (user_id, day, meal_type);
  `);
}

/* ===================== BMI → targets ===================== */
function targetsFromBMI(bmi) {
  if (bmi == null) return { calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null };
  let cal, p, c, f, fiber;
  if (bmi < 18.5) { cal = 2400; p=0.20; c=0.55; f=0.25; fiber=25; }
  else if (bmi < 25) { cal = 2100; p=0.20; c=0.50; f=0.30; fiber=30; }
  else if (bmi < 30) { cal = 1800; p=0.25; c=0.40; f=0.35; fiber=30; }
  else { cal = 1600; p=0.30; c=0.35; f=0.35; fiber=30; }
  return {
    calories: cal,
    protein_g: Math.round(cal * p / 4),
    carbs_g:   Math.round(cal * c / 4),
    fat_g:     Math.round(cal * f / 9),
    fiber_g:   fiber
  };
}

/* ===================== Update flag per user/day ===================== */
async function updateDailyCompletion(user_id, day) {
  const { rows: prof } = await pool.query(
    `SELECT bmi FROM public.ftn_profiles WHERE user_id = $1 LIMIT 1`,
    [user_id]
  );
  const bmi = prof[0]?.bmi == null ? null : Number(prof[0].bmi);
  const targets = targetsFromBMI(bmi);

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(calories)::int,0) AS total_calories
     FROM public.ftn_daily_meals WHERE user_id=$1 AND day=$2`,
    [user_id, day]
  );
  const consumed = Number(rows[0]?.total_calories || 0);
  const done = targets.calories != null && consumed >= targets.calories;

  await pool.query(
    `UPDATE public.ftn_daily_meals
     SET is_completed = $3, updated_at = NOW()
     WHERE user_id=$1 AND day=$2`,
    [user_id, day, done]
  );
}

/* ===================== CRUD (user-scoped) ===================== */

// POST /meals   (multipart with optional image)
// Stores image at: fitness/users/<uid>/meals/meal_<id>/...
export async function createDailyMeal(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const {
      day = null, meal_type = null, food_name,
      amount = null, unit = null,
      calories = null, protein_g = null, carbs_g = null, fat_g = null, fiber_g = null
    } = req.body || {};
    if (!food_name?.trim()) return res.status(400).json({ hasError: true, message: "food_name is required" });

    // 1) Insert row without image to get id
    const { rows: ins } = await pool.query(
      `INSERT INTO public.ftn_daily_meals
        (user_id, day, meal_type, food_name, amount, unit, calories, protein_g, carbs_g, fat_g, fiber_g)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [user_id, day, meal_type, food_name.trim(), amount, unit, calories, protein_g, carbs_g, fat_g, fiber_g]
    );

    let data = ins[0];

    // 2) If image provided, upload under meal_<id>
    if (req.file) {
      const ext  = extFromMime(req.file.mimetype);
      const name = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const Key  = mealImageKey({ userId: user_id, mealId: data.id, filename: name });

      await putObject({ Key, Body: req.file.buffer, ContentType: req.file.mimetype });

      const { rows: upd } = await pool.query(
        `UPDATE public.ftn_daily_meals
         SET image_s3_key = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [Key, data.id, user_id]
      );
      data = upd[0];
    }

    await updateDailyCompletion(user_id, data.day);
    if (data.image_s3_key) data.image_url = await presignGet(data.image_s3_key, 3600);

    return res.json({ hasError: false, data });
  } catch (e) { next(e); }
}

// GET /meals?day=YYYY-MM-DD
export async function listDailyMeals(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const { day } = req.query;
    const params = [user_id];
    let sql = `
      SELECT id, user_id, day, meal_type, food_name, amount, unit,
             calories, protein_g, carbs_g, fat_g, fiber_g, image_s3_key, is_completed,
             created_at, updated_at
      FROM public.ftn_daily_meals
      WHERE user_id = $1
    `;
    if (day) { sql += ` AND day = $2`; params.push(day); }
    sql += ` ORDER BY day DESC, created_at DESC LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    await Promise.all(rows.map(async r => {
      if (r.image_s3_key) r.image_url = await presignGet(r.image_s3_key, 3600);
    }));
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// GET /meals/:id
export async function getDailyMeal(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    const { id } = req.params;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const { rows } = await pool.query(
      `SELECT * FROM public.ftn_daily_meals WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Not found" });

    const meal = rows[0];
    if (meal.image_s3_key) meal.image_url = await presignGet(meal.image_s3_key, 3600);
    res.json({ hasError: false, data: meal });
  } catch (e) { next(e); }
}

// PUT /meals/:id   (multipart with optional image)
export async function updateDailyMeal(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    const { id } = req.params;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    // If new image uploaded, store under meal_<id>
    if (req.file) {
      const ext  = extFromMime(req.file.mimetype);
      const name = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const Key  = mealImageKey({ userId: user_id, mealId: id, filename: name });
      await putObject({ Key, Body: req.file.buffer, ContentType: req.file.mimetype });
      req.body.image_s3_key = Key;
    }

    const fields = ["day","meal_type","food_name","amount","unit","calories","protein_g","carbs_g","fat_g","fiber_g","image_s3_key"];
    const sets = [];
    const vals = [id, user_id];

    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, f)) {
        vals.push(req.body[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ hasError: true, message: "No fields to update" });

    const { rows } = await pool.query(
      `UPDATE public.ftn_daily_meals
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Not found" });

    await updateDailyCompletion(user_id, rows[0].day);

    const data = rows[0];
    if (data.image_s3_key) data.image_url = await presignGet(data.image_s3_key, 3600);

    res.json({ hasError: false, data });
  } catch (e) { next(e); }
}

// DELETE /meals/:id
export async function deleteDailyMeal(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    const { id } = req.params;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const { rows: pre } = await pool.query(
      `SELECT day FROM public.ftn_daily_meals WHERE id=$1 AND user_id=$2`,
      [id, user_id]
    );
    if (!pre[0]) return res.status(404).json({ hasError: true, message: "Not found" });
    const day = pre[0].day;

    const { rowCount } = await pool.query(
      `DELETE FROM public.ftn_daily_meals WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!rowCount) return res.status(404).json({ hasError: true, message: "Not found" });

    await updateDailyCompletion(user_id, day);
    res.json({ hasError: false, success: true });
  } catch (e) { next(e); }
}

/* ===================== Reports ===================== */

// GET /meals/daily/summary?day=YYYY-MM-DD
export async function dailyConsumed(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    const day = req.query.day;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });
    if (!day) return res.status(400).json({ hasError: true, message: "day is required (YYYY-MM-DD)" });

    const { rows } = await pool.query(
      `SELECT
          COALESCE(SUM(calories)::int, 0) AS calories,
          COALESCE(SUM(protein_g), 0)     AS protein_g,
          COALESCE(SUM(carbs_g), 0)       AS carbs_g,
          COALESCE(SUM(fat_g), 0)         AS fat_g,
          COALESCE(SUM(fiber_g), 0)       AS fiber_g,
          BOOL_OR(is_completed)           AS is_completed
       FROM public.ftn_daily_meals
       WHERE user_id = $1 AND day = $2`,
      [user_id, day]
    );
    res.json({
      hasError: false,
      day,
      consumed: {
        calories: Number(rows[0].calories || 0),
        protein_g: Number(rows[0].protein_g || 0),
        carbs_g: Number(rows[0].carbs_g || 0),
        fat_g: Number(rows[0].fat_g || 0),
        fiber_g: Number(rows[0].fiber_g || 0),
      },
      is_completed: !!rows[0].is_completed
    });
  } catch (e) { next(e); }
}

// GET /meals/daily/status?day=YYYY-MM-DD
export async function dailyStatus(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    const day = req.query.day;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });
    if (!day) return res.status(400).json({ hasError: true, message: "day is required (YYYY-MM-DD)" });

    const { rows: prof } = await pool.query(
      `SELECT bmi FROM public.ftn_profiles WHERE user_id = $1 LIMIT 1`,
      [user_id]
    );
    const bmi = prof[0]?.bmi == null ? null : Number(prof[0].bmi);
    const targets = targetsFromBMI(bmi);

    const { rows } = await pool.query(
      `SELECT
          COALESCE(SUM(calories)::int, 0) AS calories,
          COALESCE(SUM(protein_g), 0)     AS protein_g,
          COALESCE(SUM(carbs_g), 0)       AS carbs_g,
          COALESCE(SUM(fat_g), 0)         AS fat_g,
          COALESCE(SUM(fiber_g), 0)       AS fiber_g,
          BOOL_OR(is_completed)           AS is_completed
       FROM public.ftn_daily_meals
       WHERE user_id = $1 AND day = $2`,
      [user_id, day]
    );
    const c = rows[0];
    const pct = (cons, targ) => (!targ || targ <= 0 ? null : +((Number(cons||0)/targ)*100).toFixed(1));

    res.json({
      hasError: false,
      day,
      bmi,
      targets,
      consumed: {
        calories: Number(c.calories || 0),
        protein_g: Number(c.protein_g || 0),
        carbs_g: Number(c.carbs_g || 0),
        fat_g: Number(c.fat_g || 0),
        fiber_g: Number(c.fiber_g || 0),
      },
      completion: {
        calories_pct: pct(c.calories, targets.calories),
        protein_pct:  pct(c.protein_g, targets.protein_g),
        carbs_pct:    pct(c.carbs_g,   targets.carbs_g),
        fat_pct:      pct(c.fat_g,     targets.fat_g),
        fiber_pct:    pct(c.fiber_g,   targets.fiber_g),
      },
      is_completed: !!c.is_completed
    });
  } catch (e) { next(e); }
}

// GET /meals/today
export async function todayMeals(req, res, next) {
  try {
    await ensureMealsSchema();
    const user_id = req.user_id || req.user?.user_id;
    if (!user_id) return res.status(401).json({ hasError: true, message: "unauthorized" });

    const { rows: meals } = await pool.query(
      `SELECT id, user_id, day, meal_type, food_name, amount, unit,
              calories, protein_g, carbs_g, fat_g, fiber_g, image_s3_key, is_completed,
              created_at, updated_at
       FROM public.ftn_daily_meals
       WHERE user_id = $1 AND day = CURRENT_DATE
       ORDER BY created_at DESC`,
      [user_id]
    );

    await Promise.all(meals.map(async m => {
      if (m.image_s3_key) m.image_url = await presignGet(m.image_s3_key, 3600);
    }));

    const { rows: totalsRows } = await pool.query(
      `SELECT
          COALESCE(SUM(calories)::int, 0) AS calories,
          COALESCE(SUM(protein_g), 0)     AS protein_g,
          COALESCE(SUM(carbs_g), 0)       AS carbs_g,
          COALESCE(SUM(fat_g), 0)         AS fat_g,
          COALESCE(SUM(fiber_g), 0)       AS fiber_g,
          BOOL_OR(is_completed)           AS is_completed
       FROM public.ftn_daily_meals
       WHERE user_id = $1 AND day = CURRENT_DATE`,
      [user_id]
    );

    const totals = totalsRows[0] || {};
    res.json({
      hasError: false,
      day: new Date().toISOString().slice(0,10),
      meals,
      totals: {
        calories: Number(totals.calories || 0),
        protein_g: Number(totals.protein_g || 0),
        carbs_g:   Number(totals.carbs_g || 0),
        fat_g:     Number(totals.fat_g || 0),
        fiber_g:   Number(totals.fiber_g || 0),
      },
      is_completed: !!totals.is_completed
    });
  } catch (e) { next(e); }
}
