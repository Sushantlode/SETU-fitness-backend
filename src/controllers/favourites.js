import { pool } from "../db/pool.js";
export async function listMeals(req, res, next) {
  try {
    const user_id = req.user_id;
    const { rows } = await pool.query(
      `SELECT fm.*, m.name, m.meal_type, m.image_s3_key FROM ftn_favorite_meals fm JOIN ftn_meals m ON m.id=fm.meal_id WHERE fm.user_id=$1 ORDER BY fm.created_at DESC`,
      [user_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function addMeal(req, res, next) {
  try {
    const user_id = req.user_id;
    const { meal_id } = req.body;
    if (!meal_id)
      return res
        .status(400)
        .json({ hasError: true, message: "meal_id required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_favorite_meals (user_id, meal_id) VALUES ($1,$2) ON CONFLICT (user_id, meal_id) DO NOTHING RETURNING *",
      [user_id, meal_id]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function removeMeal(req, res, next) {
  try {
    const user_id = req.user_id;
    const { meal_id } = req.params;
    await pool.query(
      "DELETE FROM ftn_favorite_meals WHERE user_id=$1 AND meal_id=$2",
      [user_id, meal_id]
    );
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
