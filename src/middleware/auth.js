// src/middleware/auth.js
import jwt from "jsonwebtoken";
import {
  verifyAccess,
  verifyRefresh,
  signAccessToken,
  signRefreshToken,
} from "../utils/tokens.js";

/**
 * Client must send:
 *  - Authorization: Bearer <accessToken>
 *  - X-Refresh-Token: <refreshToken>   (only needed when access is expired)
 *
 * On successful refresh, response headers include:
 *  - Authorization: Bearer <NEW_ACCESS>
 *  - X-Refresh-Token: <NEW_REFRESH>
 */
export function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      hasError: true,
      message: "Authorization header missing or invalid",
    });
  }

  try {
    // ✅ access token valid
    const decoded = verifyAccess(token);
    if (!decoded?.user_id) {
      return res
        .status(400)
        .json({ hasError: true, message: "user_id missing in token" });
    }
    req.user_id = decoded.user_id;
    req.user = decoded;
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // 🔁 try refresh
      const refresh = req.headers["x-refresh-token"];
      if (!refresh) {
        return res
          .status(403)
          .json({ hasError: true, message: "Refresh token is required" });
      }
      try {
        const r = verifyRefresh(refresh);

        // Optional: check tokenVersion from DB here to revoke old refresh tokens
        // const { rows } = await pool.query('SELECT token_version FROM users WHERE user_id=$1', [r.user_id]);
        // if (rows[0].token_version !== r.tokenVersion) throw new Error('Stale refresh token');

        const payload = {
          user_id: r.user_id,
          email: r.email, // include only what you actually need
          // tokenVersion: r.tokenVersion,
        };

        const newAccess = signAccessToken(payload);
        const newRefresh = signRefreshToken(payload);

        // expose new tokens to client
        res.setHeader("Authorization", `Bearer ${newAccess}`);
        res.setHeader("X-Refresh-Token", newRefresh);

        // proceed with this request as authenticated
        const decodedNew = verifyAccess(newAccess);
        req.user_id = decodedNew.user_id;
        req.user = decodedNew;
        return next();
      } catch (e) {
        console.error("Refresh failed:", e.message);
        return res
          .status(403)
          .json({
            hasError: true,
            message: "Failed to refresh token. Please log in again.",
          });
      }
    }

    return res
      .status(403)
      .json({ hasError: true, message: "Invalid or expired token" });
  }
}
