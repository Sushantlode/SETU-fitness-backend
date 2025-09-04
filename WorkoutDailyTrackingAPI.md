Workout Daily Tracking API — README

Base path: /workout
Auth: Authorization: Bearer <JWT> (required). Optional X-Refresh-Token if your access token may be expired.
Dates: YYYY-MM-DD (server stores by calendar day; client should use local day, e.g., Asia/Kolkata).

Entities & Relationships

User Profile: ftn_profiles.user_id (must exist; FK target)

Daily Summary: workout_daily (user_id, day, total_seconds, is_completed, notes)

Daily Items: workout_daily_exercises (daily_id → workout_daily.id, exercise_id → workout_exercises.id)

Exercise Catalog: workout_exercises (id, exercise_name, image_key?, image_url?)

On reads, each item returns a presigned image_url if image_key exists.

Endpoint Summary
Method	Path	Purpose	Auth
POST	/workout/days	Upsert a day; optionally replace exercises	✅
GET	/workout/days?start&end	List days (range; defaults last 7 days)	✅
GET	/workout/days/:day	Get one day (with items + presigned images)	✅
PATCH	/workout/days/:day	Partial update; can replace all exercises	✅
POST	/workout/days/:day/exercises	Append items to the day (doesn’t wipe)	✅
DELETE	/workout/days/:day	Delete the day (and all its items)	✅
DELETE	/workout/days/:day/exercises/:itemId	Delete one item	✅

To discover exercise_id values, use the catalog: GET /workout/exercises?search=... (separate module you already have).

Common Payload Fields

day — string YYYY-MM-DD (optional in create; defaults to today)

total_seconds — integer ≥ 0

is_completed — boolean

notes — string

exercises / exercises_replace / items — arrays of:

exercise_id (UUID, required per item)

order_index (int, default 0)

sets (int, optional)

reps (int, optional)

weight_kg (number, optional)

duration_seconds (int, optional)

notes (string, optional)

1) Upsert Day (replace items)

POST /workout/days
Replaces items if exercises is provided; otherwise only updates summary fields.

Request

{
  "day": "2025-09-04",
  "total_seconds": 1800,
  "is_completed": true,
  "notes": "Push day (chest+tri)",
  "exercises": [
    {
      "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
      "order_index": 0,
      "sets": 4,
      "reps": 10,
      "weight_kg": 50,
      "duration_seconds": 420,
      "notes": "Warm-up included"
    },
    {
      "exercise_id": "3c0a2b77-9e0a-4f8b-ae2f-2b3a1fb6e211",
      "order_index": 1,
      "sets": 3,
      "reps": 12,
      "duration_seconds": 300
    }
  ]
}


200 Response

{
  "hasError": false,
  "data": {
    "id": "daily-uuid",
    "day": "2025-09-04",
    "total_seconds": 1800,
    "is_completed": true,
    "notes": "Push day (chest+tri)",
    "created_at": "2025-09-04T05:32:11.123Z",
    "updated_at": "2025-09-04T05:32:11.123Z",
    "exercises": [
      {
        "id": "item-uuid-1",
        "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
        "exercise_name": "Bench Press",
        "image_url": "https://s3-presigned-url...",
        "order_index": 0,
        "sets": 4,
        "reps": 10,
        "weight_kg": 50,
        "duration_seconds": 420,
        "notes": "Warm-up included",
        "created_at": "2025-09-04T05:32:11.123Z",
        "updated_at": "2025-09-04T05:32:11.123Z"
      },
      {
        "id": "item-uuid-2",
        "exercise_id": "3c0a2b77-9e0a-4f8b-ae2f-2b3a1fb6e211",
        "exercise_name": "Tricep Dips",
        "image_url": "https://s3-presigned-url...",
        "order_index": 1,
        "sets": 3,
        "reps": 12,
        "weight_kg": null,
        "duration_seconds": 300,
        "notes": null,
        "created_at": "2025-09-04T05:32:11.123Z",
        "updated_at": "2025-09-04T05:32:11.123Z"
      }
    ]
  }
}

2) List Range

GET /workout/days?start=2025-09-01&end=2025-09-07
Defaults to last 7 days when omitted.

200 Response

{
  "hasError": false,
  "data": [
    {
      "id": "daily-uuid",
      "day": "2025-09-04",
      "total_seconds": 1800,
      "is_completed": true,
      "notes": "Push day (chest+tri)",
      "created_at": "2025-09-04T05:32:11.123Z",
      "updated_at": "2025-09-04T05:32:11.123Z",
      "exercises": [
        {
          "id": "item-uuid-1",
          "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
          "exercise_name": "Bench Press",
          "image_url": "https://s3-presigned-url...",
          "order_index": 0,
          "sets": 4,
          "reps": 10,
          "weight_kg": 50,
          "duration_seconds": 420
        }
      ]
    }
  ],
  "start": "2025-09-01",
  "end": "2025-09-07"
}

3) Get One Day

GET /workout/days/2025-09-04

200 Response

{
  "hasError": false,
  "data": {
    "id": "daily-uuid",
    "day": "2025-09-04",
    "total_seconds": 1800,
    "is_completed": true,
    "notes": "Push day (chest+tri)",
    "created_at": "2025-09-04T05:32:11.123Z",
    "updated_at": "2025-09-04T05:32:11.123Z",
    "exercises": [
      {
        "id": "item-uuid-1",
        "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
        "exercise_name": "Bench Press",
        "image_url": "https://s3-presigned-url...",
        "order_index": 0,
        "sets": 4,
        "reps": 10,
        "weight_kg": 50,
        "duration_seconds": 420,
        "notes": "Warm-up included"
      }
    ]
  }
}

4) Patch Day (partial + replace items)

PATCH /workout/days/2025-09-04
Use exercises_replace to wipe & replace all items.

Request

{
  "total_seconds": 2100,
  "is_completed": true,
  "notes": "Increased bench load",
  "exercises_replace": [
    {
      "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
      "order_index": 0,
      "sets": 5,
      "reps": 8,
      "weight_kg": 55
    }
  ]
}


200 Response

{
  "hasError": false,
  "data": {
    "id": "daily-uuid",
    "day": "2025-09-04",
    "total_seconds": 2100,
    "is_completed": true,
    "notes": "Increased bench load",
    "created_at": "2025-09-04T05:32:11.123Z",
    "updated_at": "2025-09-04T06:10:00.123Z",
    "exercises": [
      {
        "id": "item-uuid-new",
        "exercise_id": "e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1",
        "exercise_name": "Bench Press",
        "image_url": "https://s3-presigned-url...",
        "order_index": 0,
        "sets": 5,
        "reps": 8,
        "weight_kg": 55
      }
    ]
  }
}

5) Append Items

POST /workout/days/2025-09-04/exercises

Request

{
  "items": [
    {
      "exercise_id": "6a0f4f1f-9a8a-4c7e-96f1-9e9ee2a1cc20",
      "order_index": 2,
      "sets": 3,
      "reps": 20,
      "duration_seconds": 300
    }
  ]
}


200 Response

{
  "hasError": false,
  "data": {
    "id": "daily-uuid",
    "day": "2025-09-04",
    "total_seconds": 2100,
    "is_completed": true,
    "notes": "Increased bench load",
    "exercises": [
      { "...existing..." },
      {
        "id": "item-uuid-added",
        "exercise_id": "6a0f4f1f-9a8a-4c7e-96f1-9e9ee2a1cc20",
        "exercise_name": "Push Ups",
        "image_url": "https://s3-presigned-url...",
        "order_index": 2,
        "sets": 3,
        "reps": 20,
        "weight_kg": null,
        "duration_seconds": 300
      }
    ]
  }
}

6) Delete One Item

DELETE /workout/days/2025-09-04/exercises/<itemId>

200 Response

{ "hasError": false, "deleted": true }

7) Delete Day

DELETE /workout/days/2025-09-04

200 Response

{ "hasError": false, "deleted": true }

Errors
HTTP	Body (example)	When
401	{"hasError": true, "message": "unauthorized"}	Controller can’t read a user id from request (bad/missing JWT)
401	{"hasError": true, "code": "INVALID_TOKEN", "message": "Invalid token"}	JWT invalid (auth middleware)
401	{"hasError": true, "code": "ACCESS_EXPIRED", "message": "Access token expired"}	Access token expired; send X-Refresh-Token or re-login
404	{"hasError": true, "message": "profile not found for user"}	No ftn_profiles.user_id matching token
400	{"hasError": true, "message": "day required"}	Missing :day path param
400	{"hasError": true, "message": "Invalid JSON in request body"}	Body parse error (malformed JSON)
500	{"hasError": true, "message": "Internal error"}	Unhandled server error
cURL Cheatsheet

Upsert day

TOKEN='<JWT>'
curl -X POST http://localhost:7000/workout/days \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "day":"2025-09-04",
    "total_seconds":1800,
    "is_completed":true,
    "exercises":[
      {"exercise_id":"e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1","order_index":0,"sets":4,"reps":10}
    ]
  }'


List range

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:7000/workout/days?start=2025-09-01&end=2025-09-07"


Get one day

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:7000/workout/days/2025-09-04


Patch day (replace items)

curl -X PATCH http://localhost:7000/workout/days/2025-09-04 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "total_seconds":2100,
    "exercises_replace":[{"exercise_id":"e0f1c3c6-5d2d-4d9b-8f7c-8a33d3a1d9f1","order_index":0,"sets":5,"reps":8}]
  }'


Append item

curl -X POST http://localhost:7000/workout/days/2025-09-04/exercises \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"exercise_id":"6a0f4f1f-9a8a-4c7e-96f1-9e9ee2a1cc20","order_index":2,"reps":20}]}'


Delete item

curl -X DELETE http://localhost:7000/workout/days/2025-09-04/exercises/<itemId> \
  -H "Authorization: Bearer $TOKEN"


Delete day

curl -X DELETE http://localhost:7000/workout/days/2025-09-04 \
  -H "Authorization: Bearer $TOKEN"

Notes

user_id is taken from your JWT (user_id/userId/id/sub) and normalized to string.

A matching ftn_profiles.user_id must exist; otherwise write operations fail fast.

Exercise image_url is presigned from S3 if image_key exists; it will expire (default ~12h).

ChatGPT can mak