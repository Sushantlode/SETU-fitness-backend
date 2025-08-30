// src/controllers/food.js
import { pool } from "../db/pool.js";

// Add a new food item to the global food database
export async function addFood(req, res, next) {
  try {
    const { name, food_type, meal_type, cuisine, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, healthiness_score } = req.body;

    // Validate that required fields are provided
    if (!name || !calories_per_100g || !protein_g_per_100g || !carbs_g_per_100g || !fat_g_per_100g || !healthiness_score) {
      return res.status(400).json({ hasError: true, message: "All fields are required" });
    }

    // Insert the new food into the `ftn_foods` table
    const { rows } = await pool.query(
      `INSERT INTO ftn_foods (name, food_type, meal_type, cuisine, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, healthiness_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, food_type, meal_type, cuisine, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, healthiness_score]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// List all food items
export async function listFoods(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT * FROM ftn_foods ORDER BY name`);
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// Get a specific food item by ID
export async function getFood(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM ftn_foods WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Food not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// Get a food item by name (newly added API)
export async function getFoodByName(req, res, next) {
  try {
    const { name } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM ftn_foods WHERE name ILIKE $1 LIMIT 1`,
      [`%${name}%`]  // Using ILIKE for case-insensitive search
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Food not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// Update a food item details (e.g., change calories, name, etc.)
export async function updateFood(req, res, next) {
  try {
    const { id } = req.params;
    const { name, food_type, meal_type, cuisine, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, healthiness_score } = req.body;

    const { rows } = await pool.query(
      `UPDATE ftn_foods
         SET name = COALESCE($1, name),
             food_type = COALESCE($2, food_type),
             meal_type = COALESCE($3, meal_type),
             cuisine = COALESCE($4, cuisine),
             calories_per_100g = COALESCE($5, calories_per_100g),
             protein_g_per_100g = COALESCE($6, protein_g_per_100g),
             carbs_g_per_100g = COALESCE($7, carbs_g_per_100g),
             fat_g_per_100g = COALESCE($8, fat_g_per_100g),
             healthiness_score = COALESCE($9, healthiness_score),
             updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, food_type, meal_type, cuisine, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, healthiness_score, id]
    );

    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Food not found" });
    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// Delete a food item
export async function deleteFood(req, res, next) {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM ftn_foods WHERE id = $1`, [id]);

    if (!rowCount) return res.status(404).json({ hasError: true, message: "Food not found" });
    res.json({ hasError: false, message: "Food deleted successfully" });
  } catch (e) { next(e); }
}

// Add food items to a meal (calculate nutritional values based on the amount)
export async function addFoodToMeal(req, res, next) {
  try {
    const { meal_id } = req.params;
    const { food_id, quantity } = req.body;  // quantity is the amount of food added in grams

    // Get food details from `ftn_foods` table
    const { rows: foodRows } = await pool.query(
      `SELECT * FROM ftn_foods WHERE id = $1`,
      [food_id]
    );

    if (!foodRows[0]) {
      return res.status(404).json({ hasError: true, message: "Food not found" });
    }

    // Calculate the nutritional values based on quantity
    const food = foodRows[0];
    const calories = (food.calories_per_100g * quantity) / 100;
    const protein = (food.protein_g_per_100g * quantity) / 100;
    const carbs = (food.carbs_g_per_100g * quantity) / 100;
    const fat = (food.fat_g_per_100g * quantity) / 100;

    // Add the food item to the meal (add to `ftn_meal_items` table)
    const { rows } = await pool.query(
      `INSERT INTO ftn_meal_items (meal_id, food_id, quantity, calories, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [meal_id, food_id, quantity, calories, protein, carbs, fat]
    );

    // Recalculate the meal's total calories
    await recalcMealTotals(meal_id);

    res.json({ hasError: false, data: rows[0] });
  } catch (e) { next(e); }
}

// Recalculate total calories for a meal (based on added food items)
async function recalcMealTotals(mealId) {
  await pool.query(
    `UPDATE ftn_meals SET total_calories = COALESCE((
        SELECT SUM(calories) FROM ftn_meal_items WHERE meal_id = $1
      ), 0), updated_at = NOW() WHERE id = $1`,
    [mealId]
  );
}
