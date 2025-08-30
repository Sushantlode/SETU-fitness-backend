// src/controllers/meals.js
import { pool } from "../db/pool.js";

/* ---------- helpers ---------- */
async function mealOwnedByUser(mealId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM ftn_meals WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [mealId, userId]
  );
  return !!rows[0];
}

async function recalcMealTotals(mealId) {
  await pool.query(
    `UPDATE ftn_meals m
        SET total_calories = COALESCE((
              SELECT SUM(calories)::int FROM ftn_meal_items WHERE meal_id = $1
            ), 0),
            updated_at = NOW()
      WHERE id = $1`,
    [mealId]
  );
}

/* ---------- Meals CRUD (scoped to req.user_id) ---------- */

// GET /meals
export async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, name, meal_type, image_s3_key, total_calories, created_at
         FROM ftn_meals
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [req.user_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// POST /meals
export async function create(req, res, next) {
  try {
    const user_id = req.user_id;
    const {
      name,
      meal_type = null,
      total_calories = null,
      image_s3_key = null,
      notes = null,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ hasError: true, message: "name is required" });
    }

    const { rows } = await pool.query(
      `INSERT INTO ftn_meals (user_id, name, meal_type, total_calories, image_s3_key, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [user_id, String(name).trim(), meal_type, total_calories, image_s3_key, notes]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// GET /meals/:id
export async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT *
         FROM ftn_meals
        WHERE id = $1 AND user_id = $2
        LIMIT 1`,
      [id, req.user_id]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// PUT /meals/:id  (NULL-friendly dynamic update)
export async function update(req, res, next) {
  try {
    const { id } = req.params;
    if (!(await mealOwnedByUser(id, req.user_id))) {
      return res.status(404).json({ hasError: true, message: "Not found" });
    }

    const allowed = ["name", "meal_type", "total_calories", "image_s3_key", "notes"];
    const sets = [];
    const params = [id];

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        params.push(req.body[k]); // can be null
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ hasError: true, message: "No fields to update" });

    params.push(req.user_id);

    const { rows } = await pool.query(
      `UPDATE ftn_meals
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $1 AND user_id = $${params.length}
        RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// DELETE /meals/:id  (hard delete + items)
export async function remove(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    if (!(await mealOwnedByUser(id, req.user_id))) {
      client.release();
      return res.status(404).json({ hasError: true, message: "Not found" });
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM ftn_meal_items WHERE meal_id = $1`, [id]); // safe even without FK
    await client.query(`DELETE FROM ftn_meals WHERE id = $1 AND user_id = $2`, [id, req.user_id]);
    await client.query("COMMIT");

    res.json({ hasError: false });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
}

/* ---------- Meal Items (guarded by ownership) ---------- */

// POST /meals/:id/items
export async function addItem(req, res, next) {
  try {
    const { id } = req.params; // meal_id
    const user_id = req.user_id;
    if (!(await mealOwnedByUser(id, user_id))) {
      return res.status(403).json({ hasError: true, message: "Forbidden" });
    }

    const {
      food_id = null,
      custom_food_name = null,
      quantity = null,
      unit = null,
      calories = null,
      protein_g = null,
      carbs_g = null,
      fat_g = null,
    } = req.body || {};

    if (!custom_food_name && !food_id) {
      return res.status(400).json({ hasError: true, message: "custom_food_name or food_id required" });
    }

    const { rows } = await pool.query(
      `INSERT INTO ftn_meal_items (meal_id, food_id, custom_food_name, quantity, unit, calories, protein_g, carbs_g, fat_g)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [id, food_id, custom_food_name, quantity, unit, calories, protein_g, carbs_g, fat_g]
    );

    await recalcMealTotals(id);
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// GET /meals/:id/items
export async function listItems(req, res, next) {
  try {
    const { id } = req.params; // meal_id
    const user_id = req.user_id;
    if (!(await mealOwnedByUser(id, user_id))) {
      return res.status(403).json({ hasError: true, message: "Forbidden" });
    }

    const { rows } = await pool.query(
      `SELECT *
         FROM ftn_meal_items
        WHERE meal_id = $1
        ORDER BY id`,
      [id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// PUT /meals/:id/items/:item_id  (NULL-friendly)
export async function updateItem(req, res, next) {
  try {
    const { id, item_id } = req.params; // meal_id, item_id
    const user_id = req.user_id;
    if (!(await mealOwnedByUser(id, user_id))) {
      return res.status(403).json({ hasError: true, message: "Forbidden" });
    }

    const allowed = ["food_id","custom_food_name","quantity","unit","calories","protein_g","carbs_g","fat_g"];
    const sets = [];
    const params = [id, item_id];

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        params.push(req.body[k]); // can be null
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ hasError: true, message: "No fields to update" });

    const { rows } = await pool.query(
      `UPDATE ftn_meal_items
          SET ${sets.join(", ")}
        WHERE meal_id = $1 AND id = $2
        RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Not found" });

    await recalcMealTotals(id);
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// DELETE /meals/:id/items/:item_id
export async function removeItem(req, res, next) {
  try {
    const { id, item_id } = req.params; // meal_id, item_id
    const user_id = req.user_id;
    if (!(await mealOwnedByUser(id, user_id))) {
      return res.status(403).json({ hasError: true, message: "Forbidden" });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM ftn_meal_items WHERE id = $2 AND meal_id = $1`,
      [id, item_id]
    );
    if (!rowCount) return res.status(404).json({ hasError: true, message: "Not found" });

    await recalcMealTotals(id);
    res.json({ hasError: false });
  } catch (e) { next(e); }
}
