import { pool } from "../db/pool.js";
export async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, title, image_s3_key, servings, total_time_min, created_at FROM ftn_recipes ORDER BY created_at DESC LIMIT 200"
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
      title,
      description = null,
      total_time_min = null,
      servings = null,
      image_s3_key = null,
    } = req.body;
    if (!title)
      return res
        .status(400)
        .json({ hasError: true, message: "title is required" });
    const q = `INSERT INTO ftn_recipes (user_id, title, description, total_time_min, servings, image_s3_key) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
    const { rows } = await pool.query(q, [
      user_id,
      title,
      description,
      total_time_min,
      servings,
      image_s3_key,
    ]);
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM ftn_recipes WHERE id=$1", [
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
    const { title, description, total_time_min, servings, image_s3_key } =
      req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_recipes SET title=COALESCE($2,title),description=COALESCE($3,description),total_time_min=COALESCE($4,total_time_min),servings=COALESCE($5,servings),image_s3_key=COALESCE($6,image_s3_key),updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, title, description, total_time_min, servings, image_s3_key]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM ftn_recipes WHERE id=$1", [id]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function addItem(req, res, next) {
  try {
    const { id } = req.params;
    const {
      ingredient_name,
      quantity = null,
      unit = null,
      notes = null,
    } = req.body;
    if (!ingredient_name)
      return res
        .status(400)
        .json({ hasError: true, message: "ingredient_name required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_recipe_items (recipe_id, ingredient_name, quantity, unit, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [id, ingredient_name, quantity, unit, notes]
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
      "SELECT * FROM ftn_recipe_items WHERE recipe_id=$1 ORDER BY id",
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
      ingredient_name = null,
      quantity = null,
      unit = null,
      notes = null,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_recipe_items SET ingredient_name=COALESCE($3,ingredient_name),quantity=COALESCE($4,quantity),unit=COALESCE($5,unit),notes=COALESCE($6,notes) WHERE id=$2 AND recipe_id=$1 RETURNING *`,
      [id, item_id, ingredient_name, quantity, unit, notes]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function removeItem(req, res, next) {
  try {
    const { id, item_id } = req.params;
    await pool.query(
      "DELETE FROM ftn_recipe_items WHERE id=$2 AND recipe_id=$1",
      [id, item_id]
    );
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
