// src/middleware/auth.js (ESM)
import jwt from "jsonwebtoken";
import axios from "axios";

/**
 * - Verifies access JWT with JWT_SECRET
 * - If expired and X-Refresh-Token exists -> calls REFRESH_TOKEN_URL to mint new pair
 * - Sets headers: Authorization: Bearer <new>, X-Refresh-Token: <new>
 * - Populates req.user and req.user_id (string)
 */
export async function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const [scheme, token] = auth.split(" ");
  const refresh =
    req.headers["x-refresh-token"] ||
    req.headers["X-Refresh-Token"] ||
    req.headers["x-refresh"] ||
    null;

  if (!token || !/^Bearer$/i.test(scheme)) {
    return res.status(401).json({
      hasError: true,
      code: "MISSING_ACCESS_TOKEN",
      message: "Authorization header missing or invalid",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const rawUserId =
      decoded.user_id ?? decoded.userId ?? decoded.id ?? decoded.sub; // ← include sub
    if (rawUserId === undefined || rawUserId === null || String(rawUserId).trim() === "") {
      return res.status(401).json({
        hasError: true,
        code: "INVALID_PAYLOAD",
        message: "user_id missing in token",
      });
    }
    req.user = decoded;
    req.user_id = String(rawUserId); // ← always string
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      if (!refresh) {
        return res.status(401).json({
          hasError: true,
          code: "ACCESS_EXPIRED",
          message: "Access token expired",
        });
      }

      try {
        if (!process.env.REFRESH_TOKEN_URL) {
          return res.status(500).json({
            hasError: true,
            code: "CONFIG_MISSING",
            message: "REFRESH_TOKEN_URL not set",
          });
        }

        const resp = await axios.post(process.env.REFRESH_TOKEN_URL, { refreshToken: refresh });

        const accessToken =
          resp.data?.accessToken ||
          resp.data?.token ||
          resp.data?.data?.accessToken;
        const newRefreshToken =
          resp.data?.newRefreshToken ||
          resp.data?.refreshToken ||
          resp.data?.data?.refreshToken;

        if (!accessToken) throw new Error("No accessToken in refresh response");

        res.setHeader("Authorization", `Bearer ${accessToken}`);
        if (newRefreshToken) res.setHeader("X-Refresh-Token", newRefreshToken);

        const decodedNew = jwt.verify(accessToken, process.env.JWT_SECRET);
        const rawUserIdNew =
          decodedNew.user_id ?? decodedNew.userId ?? decodedNew.id ?? decodedNew.sub; // ← include sub
        if (rawUserIdNew === undefined || rawUserIdNew === null || String(rawUserIdNew).trim() === "") {
          return res.status(401).json({
            hasError: true,
            code: "INVALID_PAYLOAD",
            message: "user_id missing in refreshed token",
          });
        }
        req.user = decodedNew;
        req.user_id = String(rawUserIdNew); // ← always string
        return next();
      } catch (e) {
        return res.status(401).json({
          hasError: true,
          code: "REFRESH_FAILED",
          message: e?.response?.data?.message || e.message || "Failed to refresh token",
        });
      }
    }

    return res.status(401).json({
      hasError: true,
      code: "INVALID_TOKEN",
      message: "Invalid token",
    });
  }
}
