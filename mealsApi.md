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