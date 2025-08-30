import { pool } from "../db/pool.js";
export async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, name, meal_type, image_s3_key, total_calories, created_at FROM ftn_meals ORDER BY created_at DESC LIMIT 200"
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function create(req, res, next) {
  try {
    const user_id = req.user_id;
    const {
      name,
      meal_type = null,
      total_calories = null,
      image_s3_key = null,
      notes = null,
    } = req.body;
    if (!name)
      return res
        .status(400)
        .json({ hasError: true, message: "name is required" });
    const q = `INSERT INTO ftn_meals (user_id, name, meal_type, total_calories, image_s3_key, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
    const { rows } = await pool.query(q, [
      user_id,
      name,
      meal_type,
      total_calories,
      image_s3_key,
      notes,
    ]);
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM ftn_meals WHERE id=$1", [
      id,
    ]);
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name = null,
      meal_type = null,
      total_calories = null,
      image_s3_key = null,
      notes = null,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_meals SET name=COALESCE($2,name),meal_type=COALESCE($3,meal_type),total_calories=COALESCE($4,total_calories),image_s3_key=COALESCE($5,image_s3_key),notes=COALESCE($6,notes),updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, name, meal_type, total_calories, image_s3_key, notes]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM ftn_meals WHERE id=$1", [id]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function addItem(req, res, next) {
  try {
    const { id } = req.params;
    const {
      food_id = null,
      custom_food_name = null,
      quantity = null,
      unit = null,
      calories = null,
      protein_g = null,
      carbs_g = null,
      fat_g = null,
    } = req.body;
    if (!custom_food_name && !food_id)
      return res
        .status(400)
        .json({
          hasError: true,
          message: "custom_food_name or food_id required",
        });
    const { rows } = await pool.query(
      "INSERT INTO ftn_meal_items (meal_id, food_id, custom_food_name, quantity, unit, calories, protein_g, carbs_g, fat_g) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        id,
        food_id,
        custom_food_name,
        quantity,
        unit,
        calories,
        protein_g,
        carbs_g,
        fat_g,
      ]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function listItems(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM ftn_meal_items WHERE meal_id=$1 ORDER BY id",
      [id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function updateItem(req, res, next) {
  try {
    const { id, item_id } = req.params;
    const {
      food_id = null,
      custom_food_name = null,
      quantity = null,
      unit = null,
      calories = null,
      protein_g = null,
      carbs_g = null,
      fat_g = null,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_meal_items SET food_id=COALESCE($3,food_id),custom_food_name=COALESCE($4,custom_food_name),quantity=COALESCE($5,quantity),unit=COALESCE($6,unit),calories=COALESCE($7,calories),protein_g=COALESCE($8,protein_g),carbs_g=COALESCE($9,carbs_g),fat_g=COALESCE($10,fat_g) WHERE id=$2 AND meal_id=$1 RETURNING *`,
      [
        id,
        item_id,
        food_id,
        custom_food_name,
        quantity,
        unit,
        calories,
        protein_g,
        carbs_g,
        fat_g,
      ]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function removeItem(req, res, next) {
  try {
    const { id, item_id } = req.params;
    await pool.query("DELETE FROM ftn_meal_items WHERE id=$2 AND meal_id=$1", [
      id,
      item_id,
    ]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
