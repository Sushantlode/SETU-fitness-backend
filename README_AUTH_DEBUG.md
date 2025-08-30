# Auth Debug Tools (Non-invasive)

This folder adds **non-breaking** utilities to help you debug JWT auth without changing existing functionality.

## Files added
- `utils/jwtTools.js` — helper to decode/verify tokens and perform login.
- `scripts/login_and_decode.js` — small CLI to login → decode → (optionally) verify a JWT.
- `middlewares/validateUserHardened.js` — optional drop-in auth middleware (case-tolerant Bearer parsing).
- `package.json` script: `auth:debug`.

## Usage
1. Ensure env:
```
JWT_SECRET=Setu123
JWT_REFRESH_SECRET=Setu@123
API_BASE_URL=http://localhost:7004
```
2. Install deps:
```
npm i jsonwebtoken axios dotenv
```
3. Run:
```
npm run auth:debug -- <username> <password> Setu123
```
4. (Optional) Use the hardened middleware:
```js
const validateUser = require('./middlewares/validateUserHardened');
app.get('/profiles', validateUser, (req, res) => res.json({ ok: true, user: req.user }));
```

**Note:** These additions avoid altering existing route behavior by default.
