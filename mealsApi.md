Meals API

Base: /meals
Auth: Bearer JWT
Image field: image (multipart)

POST /meals

Create a meal.
Fields: food_name (req), meal_type, day, amount, unit, calories, protein_g, carbs_g, fat_g, fiber_g, image (file).
→ Returns meal with image_url.

PUT /meals/:id

Update a meal (same fields as create).
→ Returns updated meal.

GET /meals

List meals (optional day=YYYY-MM-DD).
→ Returns array of meals.

GET /meals/today

All meals for today + totals.

GET /meals/daily/summary?day=YYYY-MM-DD

Totals for one day.

GET /meals/daily/status?day=YYYY-MM-DD

Targets (from BMI) vs consumed for one day.

GET /meals/:id

Get one meal by ID.

DELETE /meals/:id

Delete a meal.

Errors:

401 unauthorized

404 not found

400 food_name/day required

415 unsupported image

413 file too large




GET /meals/daily/needs?day=YYYY-MM-DD

Reads BMI from ftn_profiles (or computes from height & weight).

Auto-calculates needed calories, protein, carbs, fats, fiber.

Saves to ftn_daily_targets.

Updates is_completed flag for that day.

Returns both targets + consumed + completion %.

Response:

{
  "hasError": false,
  "day": "2025-09-03",
  "bmi": 23.4,
  "targets": {
    "calories": 2100,
    "protein_g": 105,
    "carbs_g": 263,
    "fat_g": 70,
    "fiber_g": 30
  },
  "consumed": {
    "calories": 1450,
    "protein_g": 60,
    "carbs_g": 180,
    "fat_g": 50,
    "fiber_g": 15
  },
  "completion": {
    "calories_pct": 69.0,
    "protein_pct": 57.1,
    "carbs_pct": 68.4,
    "fat_pct": 71.4,
    "fiber_pct": 50.0
  },
  "is_completed": false
}

Tables