import { presignGet as presignGetUrl } from "../utils/s3.js";

export async function presignGet(req, res, next) {
  try {
    const { key, expires = 900 } = req.query;
    if (!key)
      return res
        .status(400)
        .json({ hasError: true, message: "key is required" });
    const url = await presignGetUrl(String(key), Number(expires));
    res.json({ hasError: false, key, url });
  } catch (e) {
    next(e);
  }
}
