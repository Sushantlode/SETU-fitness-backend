# Fitness Backend API Documentation

**Base URL:** `http://localhost:7004`  
**Auth:** JWT (Authorization: Bearer <token>)

---

## Health / Splash

### `GET /health`

Check server status.

---

## Profile

### `GET /profiles`

Get current user's fitness profile.

### `PUT /profiles`

Create/update profile.  
Body:

```json
{
  "units": "metric",
  "timezone": "Asia/Kolkata",
  "activity_level": "moderate",
  "target_calories": 2100
}
```

---

## Dashboard

### `GET /dashboard/day`

day's summary (hydration, calories, activity).

---

## Hydration
API quick list (base: http://localhost:7004/hydration, send Authorization: Bearer <JWT>)

POST /body-profile/upsert
{ "name":"Pratik","height_cm":176,"weight_kg":72.5,"age_years":28,"gender":"male" }

GET /goal

PUT /goal
{ "daily_ml": 2500 }

POST /logs
{ "amount_ml": 300, "source": "glass" }
(also accepts { "amounts": [300,400,500], "source": "button" } and routes to batch)

POST /logs/batch
{ "amounts": [300,400,500,500,300], "source": "button" }

DELETE /logs/last

GET /logs/today

GET /consumed/today

POST /daily
{ "start": "2025-08-01", "end": "2025-08-23" }
### `GET /hydration/goal`

Get active daily water goal.

### `PUT /hydration/goal`

Set new daily water goal.  
Body:

```json
{ "daily_ml": 2500 }
```

### `POST /hydration/logs`

Add a water intake log.  
Body:

```json
{ "amount_ml": 250, "source": "glass" }
```

### `GET /hydration/logs/day`

Get day's water intake logs.

---

## Recipes

### `GET /recipes`

List recipes.

### `POST /recipes`

Create recipe.  
Body:

```json
{
  "title": "High-Protein Salad",
  "description": "Nutritious and filling",
  "servings": 2,
  "total_time_min": 15,
  "image_s3_key": "fitness/users/<uid>/recipes/<id>/cover.jpg"
}
```

### `GET /recipes/:id`

Get recipe by ID.

### `PUT /recipes/:id`

Update recipe fields.

### `DELETE /recipes/:id`

Delete recipe.

### `POST /recipes/:id/items`

Add recipe ingredient.  
Body:

```json
{
  "ingredient_name": "Chicken",
  "quantity": 200,
  "unit": "g",
  "notes": "Grilled"
}
```

### `GET /recipes/:id/items`

List ingredients.

### `PUT /recipes/:id/items/:item_id`

Update ingredient.

### `DELETE /recipes/:id/items/:item_id`

Delete ingredient.

---

## Meals

### `GET /meals`

List meals.

### `POST /meals`

Create meal.  
Body:

```json
{
  "name": "Oats Bowl",
  "meal_type": "breakfast",
  "total_calories": 420,
  "image_s3_key": "fitness/users/<uid>/meals/<id>/cover.jpg",
  "notes": "With banana and almonds"
}
```

### `GET /meals/:id`

Get meal by ID.

### `PUT /meals/:id`

Update meal.

### `DELETE /meals/:id`

Delete meal.

### `POST /meals/:id/items`

Add meal item.  
Body:

```json
{
  "custom_food_name": "Rolled Oats",
  "quantity": 60,
  "unit": "g",
  "calories": 230
}
```

### `GET /meals/:id/items`

List meal items.

### `PUT /meals/:id/items/:item_id`

Update meal item.

### `DELETE /meals/:id/items/:item_id`

Delete meal item.

---

## Favourites

### `GET /favourites/meals`

List favorite meals.

### `POST /favourites/meals`

Add favorite meal.  
Body:

```json
{ "meal_id": "<uuid>" }
```

### `DELETE /favourites/meals/:meal_id`

Remove favorite meal.

---

## Meal Plans

### Plans

- `GET /meal-plans`
- `POST /meal-plans`
- `GET /meal-plans/:plan_id`
- `PUT /meal-plans/:plan_id`
- `DELETE /meal-plans/:plan_id`

### Days

- `GET /meal-plans/:plan_id/days`
- `POST /meal-plans/:plan_id/days`
- `PUT /meal-plans/days/:day_id`
- `DELETE /meal-plans/days/:day_id`

### Slots

- `GET /meal-plans/days/:day_id/slots`
- `POST /meal-plans/days/:day_id/slots`
- `PUT /meal-plans/days/:day_id/slots/:slot_id`
- `DELETE /meal-plans/days/:day_id/slots/:slot_id`

---

## Healthy Swaps

### Public

- `GET /swaps`

### Admin

- `POST /swaps`
- `PUT /swaps/:id`
- `DELETE /swaps/:id`

### User Saved

- `POST /swaps/save`
- `GET /swaps/saved`

---

## Motivations

### `GET /motivations`

Random public motivation.

### `POST /motivations/favorite`

Mark as favorite.  
Body:

```json
{ "motivation_id": "<uuid>", "is_favorite": true }
```

### `GET /motivations/favorites`

List favorites.

### Admin

- `POST /motivations`
- `DELETE /motivations/:id`

---

## Images

### `GET http://localhost:7004/images/presign?key=<s3-key>&expires=<seconds>`

curl -s -H "Authorization: Bearer $TOKEN" \
 "http://localhost:7004/images/presign?key=fitness/users/1/recipes/123/cover.jpg&expires=600"

Get S3 presigned URL.
