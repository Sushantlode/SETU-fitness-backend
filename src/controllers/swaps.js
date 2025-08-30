import { pool } from "../db/pool.js";
export async function list(req, res, next) {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT id, title, benefit, from_item, to_item, 
             image_s3_key, is_public, category, created_at 
      FROM ftn_swaps 
      WHERE is_public = TRUE
    `;
    
    const queryParams = [];
    
    if (category) {
      query += ` AND LOWER(category) = LOWER($1)`;
      queryParams.push(category);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 200`;
    
    const { rows } = await pool.query(query, queryParams);
    
    // If no category filter, group by category for the frontend
    const response = { hasError: false };
    
    if (!category) {
      const categories = {};
      
      // Default categories
      const defaultCategories = [
        'beverage', 'breads', 'snacks', 'breakfast', 
        'lunch', 'dinner', 'desserts', 'sauces'
      ];
      
      // Initialize with empty arrays
      defaultCategories.forEach(cat => {
        categories[cat] = [];
      });
      
      // Group swaps by category
      rows.forEach(swap => {
        const cat = (swap.category || 'other').toLowerCase();
        if (!categories[cat]) {
          categories[cat] = [];
        }
        categories[cat].push(swap);
      });
      
      response.data = categories;
    } else {
      response.data = rows;
    }
    
    res.json(response);
  } catch (e) {
    next(e);
  }
}
export async function createOrUpdatePublic(req, res, next) {
  try {
    const {
      id = null,
      title = null,
      description = null,
      from_item = null,
      to_item = null,
      benefit = null,
      image_s3_key = null,
      is_public = true,
      category = null,
    } = req.body;
    const owner_user_id = req.user_id;
    if (!title && !id)
      return res
        .status(400)
        .json({ hasError: true, message: "title required for create" });
    if (id) {
      const { rows } = await pool.query(
        `UPDATE ftn_swaps 
         SET title=COALESCE($2,title),
             description=COALESCE($3,description),
             from_item=COALESCE($4,from_item),
             to_item=COALESCE($5,to_item),
             benefit=COALESCE($6,benefit),
             image_s3_key=COALESCE($7,image_s3_key),
             is_public=COALESCE($8,is_public),
             category=COALESCE($9,category)
         WHERE id=$1 
         RETURNING *`,
        [
          id,
          title,
          description,
          from_item,
          to_item,
          benefit,
          image_s3_key,
          is_public,
          category
        ]
      );
      return res.json({ hasError: false, data: rows[0] || null });
    } else {
      const { rows } = await pool.query(
        `INSERT INTO ftn_swaps 
          (title, description, from_item, to_item, benefit, image_s3_key, is_public, owner_user_id, category) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [
          title,
          description,
          from_item,
          to_item,
          benefit,
          image_s3_key,
          is_public,
          owner_user_id,
          category
        ]
      );
      return res.json({ hasError: false, data: rows[0] });
    }
  } catch (e) {
    next(e);
  }
}
export async function deletePublic(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM ftn_swaps WHERE id=$1", [id]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function saveForUser(req, res, next) {
  try {
    const user_id = req.user_id;
    const { swap_id } = req.body;
    if (!swap_id)
      return res
        .status(400)
        .json({ hasError: true, message: "swap_id required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_user_saved_swaps (user_id, swap_id) VALUES ($1,$2) ON CONFLICT (user_id, swap_id) DO NOTHING RETURNING *",
      [user_id, swap_id]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function listSaved(req, res, next) {
  try {
    const user_id = req.user_id;
    const { rows } = await pool.query(
      `SELECT sus.*, s.title, s.image_s3_key, s.benefit FROM ftn_user_saved_swaps sus JOIN ftn_swaps s ON s.id=sus.swap_id WHERE sus.user_id=$1 ORDER BY sus.created_at DESC`,
      [user_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
