Fitness Track API — README

Base path: /track
Auth: Authorization: Bearer <JWT> (required)
Content-Type: application/json
Dates: YYYY-MM-DD (default = today in Asia/Kolkata)

Fields

day (string) — YYYY-MM-DD

steps (int ≥ 0)

distance_m (number ≥ 0; meters)

calories_kcal (number ≥ 0)

active_seconds (int ≥ 0)

Endpoints
1) Create/Upsert by day

POST /track
Creates if missing; updates only provided fields (others kept).

// request
{
  "day": "2025-09-05",
  "steps": 1200,
  "distance_m": 950.25,
  "calories_kcal": 85.5,
  "active_seconds": 600
}

// 200
{ "hasError": false, "data": { "...record..." } }

2) List range (defaults to last 7 days)

GET /track?start=2025-09-01&end=2025-09-07

// 200
{ "hasError": false, "data": [ { "...record..." } ] }


If start/end omitted → returns last 7 days (IST).

3) Get one day

GET /track/2025-09-05

// 200
{ "hasError": false, "data": { "...record..." } }

4) Replace full day (all fields required)

PUT /track/2025-09-05

// request
{
  "steps": 3000,
  "distance_m": 2500.0,
  "calories_kcal": 220.0,
  "active_seconds": 1800
}

// 200
{ "hasError": false, "data": { "...record..." } }

5) Patch day (partial update)

PATCH /track/2025-09-05

// request (any subset)
{ "steps": 3456, "calories_kcal": 240.5 }

// 200
{ "hasError": false, "data": { "...record..." } }


If your implementation keeps strict semantics, this may 404 when the row doesn’t exist. Use PATCH /track/metrics below to upsert.

6) Delete day

DELETE /track/2025-09-05

// 200
{ "hasError": false, "success": true }

7) Update only steps

PUT /track/steps

{ "day": "2025-09-06", "steps": 4321 }

{ "hasError": false, "data": { "...record..." } }

8) Update only distance

PUT /track/distance

{ "day": "2025-09-06", "distance_m": 3800.75 }

{ "hasError": false, "data": { "...record..." } }

9) Update only calories

PUT /track/calories

{ "day": "2025-09-06", "calories_kcal": 265.4 }

{ "hasError": false, "data": { "...record..." } }

10) Live steps with day rollover (optional)

PUT /track/steps/live
Stores yesterday on date change; starts today at 0.

{
  "device_total": 10500,
  "ts": "2025-09-06T21:50:00+05:30",
  "timezone": "Asia/Kolkata"
}

{ "hasError": false, "data": { "...today's record..." } }

11) Combined metrics upsert

PATCH /track/metrics
Creates if missing; updates only provided fields.

{ "day": "2025-09-05", "steps": 3456, "distance_m": 1000.75, "calories_kcal": 240.5 }

{ "hasError": false, "data": { "...record..." } }

Common errors

401 { "hasError": true, "message": "unauthorized" }

400 { "hasError": true, "message": "invalid day" }

400 { "hasError": true, "message": "invalid start/end" }

404 { "hasError": true, "message": "not found" } (for strict PATCH /:day when row missing)