// src/middlewares/validateUser.js
import jwt from "jsonwebtoken";
import {
  verifyAccess,
  verifyRefresh,
  signAccessToken,
  signRefreshToken,
} from "../utils/tokens.js";

/**
 * Expects headers:
 *  - Authorization: Bearer <accessToken>
 *  - x-refresh-token: <refreshToken>   (required only if access is expired)
 *
 * On successful refresh, sets response headers:
 *  - Authorization: Bearer <NEW_ACCESS>
 *  - x-refresh-token: <NEW_REFRESH>
 */
export async function validateUser(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Access token is required" });
    }

    try {
      // ✅ Access token OK
      const decoded = verifyAccess(token);
      req.user = decoded;
      return next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        // Try refresh flow
        const refreshToken = req.headers["x-refresh-token"];
        if (!refreshToken) {
          return res.status(403).json({ message: "Refresh token is required" });
        }

        try {
          const decodedRefresh = verifyRefresh(refreshToken);

          // ⚠️ Optional: check tokenVersion in DB to enforce rotation/blacklist
          // const { rows } = await pool.query('SELECT token_version FROM users WHERE user_id=$1',[decodedRefresh.user_id])
          // if (rows[0].token_version !== decodedRefresh.tokenVersion) throw new Error('Stale refresh token');

          // Build a minimal payload for new tokens
          const payload = {
            user_id: decodedRefresh.user_id,
            email: decodedRefresh.email, // include only if you need it
            // tokenVersion: decodedRefresh.tokenVersion,
          };

          const newAccess = signAccessToken(payload);
          const newRefresh = signRefreshToken(payload); // rotate; or reuse old if you prefer

          // Expose to client for storage
          res.setHeader("Authorization", `Bearer ${newAccess}`);
          res.setHeader("x-refresh-token", newRefresh);

          // Proceed with the new access token for this request
          req.user = jwt.verify(newAccess, process.env.JWT_SECRET);
          return next();
        } catch (refreshErr) {
          console.error("Refresh failed:", refreshErr.message);
          return res
            .status(403)
            .json({ message: "Failed to refresh token. Please log in again." });
        }
      }

      if (err instanceof jwt.JsonWebTokenError) {
        return res.status(403).json({ message: "Invalid access token" });
      }

      console.error("Unexpected JWT error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  } catch (e) {
    console.error("validateUser error:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}
