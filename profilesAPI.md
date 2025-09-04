Profiles API (multipart + JSON)

Base path: /profiles
Auth: Authorization: Bearer <JWT> (required). Optional X-Refresh-Token.
Images: Stored as S3 key at
<S3_BASE_PREFIX>/users/<user_id>/profile_photos/<file>; responses return presigned URL.

Endpoints
Method	Path	Purpose	Body Type
POST	/profiles/photo	Upload profile photo → S3; save key in profile	multipart/form-data (file only)
POST	/profiles	Create profile (can include photo file)	multipart/form-data (file + fields)
PUT	/profiles	Upsert profile (create/update)	application/json
PATCH	/profiles	Partial update	application/json
GET	/profiles	Get profile (returns presigned user_image)	—
DELETE	/profiles	Delete profile	—
GET	/profiles/me	Alias of GET /profiles	—
PUT	/profiles/me	Alias of PUT /profiles	application/json
PATCH	/profiles/me	Alias of PATCH /profiles	application/json
DELETE	/profiles/me	Alias of DELETE /profiles	—
Validation (server-side)

name: non-empty string (POST/PUT required)

age: 1–150

height_cm: 50–300

weight_kg: 10–500

gender: male | female | other | prefer_not_to_say

Image types: png, jpg/jpeg, webp, gif, heic/heif (≤ 5 MB)

DB stores S3 key only. Reads presign user_image (default ~24h TTL).

1) Upload photo only

POST /profiles/photo
Body (form-data):

image → File (required)

Do not set Content-Type manually; let your client/library add the boundary.

cURL

TOKEN="<JWT>"
curl -X POST http://localhost:7000/profiles/photo \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/me.jpg"


200 Response

{
  "hasError": false,
  "key": "prod/users/12345/profile_photos/1736042900000_ab12cd34.jpg",
  "url": "https://s3...presigned...",
  "data": {
    "name": "Neelesh",
    "user_image": "https://s3...presigned...",
    "age": 28,
    "height_cm": 176,
    "weight_kg": 73,
    "gender": "male",
    "bmi": 23.57
  }
}

2) Create profile (with optional photo file)

POST /profiles (multipart)

Body (form-data):

image → File (optional; if present, used)

name → Text (required)

age → Text/number (required)

height_cm → Text/number (required)

weight_kg → Text/number (required)

gender → Text (required)

user_image → S3 key or S3 URL (optional; ignored if image provided)

cURL

TOKEN="<JWT>"
curl -X POST http://localhost:7000/profiles \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/me.jpg" \
  -F "name=Neelesh" \
  -F "age=28" \
  -F "height_cm=176" \
  -F "weight_kg=73" \
  -F "gender=male"


201 Response

{
  "hasError": false,
  "data": {
    "name": "Neelesh",
    "user_image": "https://s3...presigned...",
    "age": 28,
    "height_cm": 176,
    "weight_kg": 73,
    "gender": "male",
    "bmi": 23.57
  }
}


Alternative (no file, reference existing S3 key)

curl -X POST http://localhost:7000/profiles \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name":"Neelesh",
    "age":28,
    "height_cm":176,
    "weight_kg":73,
    "gender":"male",
    "user_image":"prod/users/12345/profile_photos/1736042900000_ab12cd34.jpg"
  }'

3) Upsert profile (JSON)

PUT /profiles

Request

{
  "name": "Neelesh K",
  "age": 28,
  "height_cm": 176,
  "weight_kg": 73,
  "gender": "male",
  "user_image": "prod/users/12345/profile_photos/1736042900000_ab12cd34.jpg"
}


200 Response

{
  "hasError": false,
  "data": {
    "name": "Neelesh K",
    "user_image": "https://s3...presigned...",
    "age": 28,
    "height_cm": 176,
    "weight_kg": 73,
    "gender": "male",
    "bmi": 23.57
  }
}

4) Patch profile (JSON, partial)

PATCH /profiles

Request

{
  "weight_kg": 72.4
}


200 Response

{
  "hasError": false,
  "data": {
    "name": "Neelesh K",
    "user_image": "https://s3...presigned...",
    "age": 28,
    "height_cm": 176,
    "weight_kg": 72.4,
    "gender": "male",
    "bmi": 23.36
  }
}

5) Get profile

GET /profiles (or /profiles/me)

200 Response

{
  "hasError": false,
  "data": {
    "name": "Neelesh K",
    "user_image": "https://s3...presigned...",  // presigned from stored key
    "age": 28,
    "height_cm": 176,
    "weight_kg": 72.4,
    "gender": "male",
    "bmi": 23.36
  }
}

6) Delete profile

DELETE /profiles (or /profiles/me)

204 No Content

Common errors
HTTP	Body (example)	Cause
400	{"hasError": true, "message": "name is required"}	Missing/empty name on POST/PUT
400	{"hasError": true, "message": "user_image must be an S3 key or S3 URL"}	Non-S3 URL provided in user_image
400	{"hasError": true, "message": "ONLY_IMAGES"}	Invalid file type
400	{"hasError": true, "code": "BAD_MULTIPART", "message": "Malformed part header"}	Wrong multipart (don’t set Content-Type manually)
401	{"hasError": true, "code": "MISSING_ACCESS_TOKEN", "message": "Authorization header missing or invalid"}	No/invalid Authorization header
401	{"hasError": true, "code": "ACCESS_EXPIRED", "message": "Access token expired"}	Access token expired; include X-Refresh-Token
409	{"hasError": true, "message": "Profile already exists"}	Duplicate POST
Quick Postman setup (form-data)

Method: POST

URL: http://localhost:7000/profiles

Headers: Authorization: Bearer <JWT> (remove any manual Content-Type)

Body: form-data

image → File (choose a file)

name → Neelesh

age → 28

height_cm → 176

weight_kg → 73

gender → male