import { pool } from "../db/pool.js";
export async function oneRandom(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM ftn_motivations ORDER BY RANDOM() LIMIT 1"
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function createPublic(req, res, next) {
  try {
    const {
      quote,
      author = null,
      image_s3_key = null,
      is_public = true,
    } = req.body;
    if (!quote)
      return res
        .status(400)
        .json({ hasError: true, message: "quote required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_motivations (quote, author, image_s3_key, is_public) VALUES ($1,$2,$3,$4) RETURNING *",
      [quote, author, image_s3_key, is_public]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function deletePublic(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM ftn_motivations WHERE id=$1", [id]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function favorite(req, res, next) {
  try {
    const user_id = req.user_id;
    const { motivation_id, is_favorite = true } = req.body;
    if (!motivation_id)
      return res
        .status(400)
        .json({ hasError: true, message: "motivation_id required" });
    const upsert = `INSERT INTO ftn_user_motivations (user_id, motivation_id, is_favorite, seen_at, created_at) VALUES ($1,$2,$3,NOW(),NOW()) ON CONFLICT (user_id, motivation_id) DO UPDATE SET is_favorite=EXCLUDED.is_favorite, seen_at=NOW() RETURNING *`;
    const { rows } = await pool.query(upsert, [
      user_id,
      motivation_id,
      is_favorite,
    ]);
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function listFavorites(req, res, next) {
  try {
    const user_id = req.user_id;
    const { rows } = await pool.query(
      `SELECT um.*, m.quote, m.author, m.image_s3_key FROM ftn_user_motivations um JOIN ftn_motivations m ON m.id=um.motivation_id WHERE um.user_id=$1 AND um.is_favorite=TRUE ORDER BY um.created_at DESC`,
      [user_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
