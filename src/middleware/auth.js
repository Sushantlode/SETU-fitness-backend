// src/middleware/auth.js
import jwt from "jsonwebtoken";
import {
  verifyAccess,
  verifyRefresh,
  signAccessToken,
  signRefreshToken,
} from "../utils/tokens.js";

/**
 * Behavior:
 * - If access token valid -> next()
 * - If access expired AND X-Refresh-Token present -> mint new pair, set headers, next()
 * - If access expired AND no refresh -> 401 ACCESS_EXPIRED (do NOT demand refresh)
 * - If token invalid (bad signature) -> 401 INVALID_TOKEN
 *
 * Notes:
 * - Header name is case-insensitive; we read "authorization" and "x-refresh-token".
 * - We set new tokens on response headers; make sure CORS exposes them.
 */
export function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const [scheme, token] = auth.split(" ");

  if (!/^Bearer$/i.test(scheme) || !token) {
    return res.status(401).json({
      hasError: true,
      code: "MISSING_ACCESS_TOKEN",
      message: "Authorization header missing or invalid",
    });
  }

  try {
    const decoded = verifyAccess(token);
    if (!decoded?.user_id) {
      return res.status(401).json({
        hasError: true,
        code: "INVALID_PAYLOAD",
        message: "user_id missing in token",
      });
    }
    req.user_id = decoded.user_id;
    req.user = decoded;
    return next();
  } catch (err) {
    // Expired access token -> try silent refresh only if client sent refresh
    if (err instanceof jwt.TokenExpiredError) {
      const refresh =
        req.headers["x-refresh-token"] ||
        req.headers["X-Refresh-Token"] ||
        req.headers["x-refresh"] ||
        null;

      if (!refresh) {
        return res.status(401).json({
          hasError: true,
          code: "ACCESS_EXPIRED",
          message: "Access token expired",
        });
      }

      try {
        const r = verifyRefresh(refresh);

        // (Optional) check tokenVersion in DB here to revoke stale refresh tokens
        // const { rows } = await pool.query('SELECT token_version FROM users WHERE id=$1',[r.user_id]);
        // if (rows[0].token_version !== r.tokenVersion) throw new Error('STALE_REFRESH');

        const payload = {
          user_id: r.user_id,
          email: r.email, // keep payload minimal
          // tokenVersion: r.tokenVersion,
        };

        const newAccess = signAccessToken(payload);
        const newRefresh = signRefreshToken(payload);

        // expose to client; ensure CORS exposes these headers
        res.setHeader("Authorization", `Bearer ${newAccess}`);
        res.setHeader("X-Refresh-Token", newRefresh);

        // trust what we just signed instead of re-verifying
        req.user_id = payload.user_id;
        req.user = payload;

        return next();
      } catch (e) {
        return res.status(401).json({
          hasError: true,
          code: "REFRESH_FAILED",
          message: "Failed to refresh token. Please log in again.",
        });
      }
    }

    // Any other JWT error (bad signature, malformed, etc.)
    return res.status(401).json({
      hasError: true,
      code: "INVALID_TOKEN",
      message: "Invalid token",
    });
  }
}
