User Plans API (raw SQL)

Base URL: http://localhost:7012
Auth: Authorization: Bearer <token> (required)
Profile resolution (dev/testing): X-Profile-Id: <ftn_profiles.id UUID> (recommended for tests)
Content-Type: application/json
Date format: YYYY-MM-DD (UTC/IST agnostic; stored as DATE)

Endpoints (summary)
Method	Path	Purpose	Body	Query
POST	/user-plans	Create/Upsert a plan for a day+swap	{ swapId:int, scheduledDate:str, isCompleted?:bool }	–
GET	/user-plans	List plans (paged)	–	page,limit and either day or start,end
PATCH	/user-plans/:planId/status	Mark completed/not completed	{ isCompleted:boolean }	–
DELETE	/user-plans/:planId	Remove a plan	–	–

Idempotent create: POST upserts on unique (user_id, scheduled_date, swap_id).

Headers

Authorization: Bearer <token> → your JWT middleware

X-Profile-Id: <UUID> → optional but handy: directly supplies ftn_profiles.id to avoid “invalid input syntax for type uuid: "39"”.

POST /user-plans
Request
{
  "swapId": 11,
  "scheduledDate": "2025-09-10",
  "isCompleted": false
}


Rules:

swapId = existing healthy_swaps.id with is_active=true

scheduledDate = YYYY-MM-DD

Response (200)
{
  "hasError": false,
  "data": {
    "id": 42,
    "user_id": "f7896084-0c56-4ced-a789-d5cef14cc909",
    "scheduled_date": "2025-09-10",
    "is_completed": false,
    "swap_id": 11,
    "category": "Proteins",
    "unhealthy_item": "Fried Chicken",
    "healthy_alternative": "Grilled Chicken Breast",
    "calories_saved": 200,
    "image_url": null,
    "benefits": "Lean protein; less fat."
  }
}

Errors

400: swapId (int) required / scheduledDate must be YYYY-MM-DD

401: unknown profile (JWT didn’t map and no X-Profile-Id)

404: swap not found or inactive

500: Failed to add to plan

GET /user-plans
Query options

Single day: ?day=2025-09-10

Range: ?start=2025-09-10&end=2025-09-12

Pagination: ?page=1&limit=20 (defaults: page=1, limit=20, max 100)

Response (200)
{
  "hasError": false,
  "meta": { "page": 1, "limit": 20, "total": 3 },
  "data": [
    {
      "id": 40,
      "user_id": "f7896084-0c56-4ced-a789-d5cef14cc909",
      "scheduled_date": "2025-09-10",
      "is_completed": false,
      "swap_id": 1,
      "category": "Carbs",
      "unhealthy_item": "White Rice",
      "healthy_alternative": "Brown Rice",
      "calories_saved": 50,
      "image_url": null,
      "benefits": "More fiber; steadier glucose."
    },
    {
      "id": 41,
      "user_id": "f7896084-0c56-4ced-a789-d5cef14cc909",
      "scheduled_date": "2025-09-11",
      "is_completed": false,
      "swap_id": 2,
      "category": "Carbs",
      "unhealthy_item": "White Bread",
      "healthy_alternative": "Whole Wheat Bread",
      "calories_saved": 80,
      "image_url": null,
      "benefits": "Higher fiber; fuller longer."
    }
  ]
}

Errors

401: unknown profile

400: day must be YYYY-MM-DD or start/end must be YYYY-MM-DD (when provided)

500: Failed to fetch user plans

PATCH /user-plans/:planId/status
Request
{ "isCompleted": true }

Response (200)
{
  "hasError": false,
  "data": {
    "id": 42,
    "user_id": "f7896084-0c56-4ced-a789-d5cef14cc909",
    "scheduled_date": "2025-09-10",
    "is_completed": true,
    "swap_id": 11,
    "category": "Proteins",
    "unhealthy_item": "Fried Chicken",
    "healthy_alternative": "Grilled Chicken Breast",
    "calories_saved": 200,
    "image_url": null,
    "benefits": "Lean protein; less fat."
  }
}

Errors

400: invalid planId / isCompleted (boolean) required

401: unknown profile

404: plan not found

500: Failed to update plan status

DELETE /user-plans/:planId
Response (200)
{ "hasError": false, "message": "removed" }

Errors

400: invalid planId

401: unknown profile

404: plan not found

500: Failed to remove from plan

cURL tests (quick)

Replace <PROFILE_UUID> and <BASE>.

# POST create
curl -X POST "<BASE>/user-plans" \
  -H "Content-Type: application/json" \
  -H "X-Profile-Id: <PROFILE_UUID>" \
  -d '{ "swapId": 11, "scheduledDate": "2025-09-10" }'

# GET list all (paged)
curl "<BASE>/user-plans?page=1&limit=20" \
  -H "X-Profile-Id: <PROFILE_UUID>"

# GET by day
curl "<BASE>/user-plans?day=2025-09-10" \
  -H "X-Profile-Id: <PROFILE_UUID>"

# PATCH status
curl -X PATCH "<BASE>/user-plans/42/status" \
  -H "Content-Type: application/json" \
  -H "X-Profile-Id: <PROFILE_UUID>" \
  -d '{ "isCompleted": true }'

# DELETE
curl -X DELETE "<BASE>/user-plans/42" \
  -H "X-Profile-Id: <PROFILE_UUID>"

Common pitfalls (and fixes)

invalid input syntax for type uuid: "39" → you didn’t pass X-Profile-Id and your JWT maps to numeric. For tests, always send X-Profile-Id: <ftn_profiles.id>.

swap not found or inactive → seed healthy_swaps and use a real id.

Bad date → must be YYYY-MM-DD.

If you want this as a ready Postman collection JSON, say it and I’ll generate it.