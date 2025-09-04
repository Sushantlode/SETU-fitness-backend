import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/profiles.js";

const r = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("ONLY_IMAGES"));
  },
});

// Upload photo only (already existed)
r.post("/photo", upload.single("image"), ctrl.uploadProfilePhoto);

// CREATE PROFILE — now accepts multipart with "image" + text fields
r.post("/", upload.single("image"), ctrl.createProfile);

// You can keep PUT/PATCH JSON-only, or also enable multipart similarly if you want:
r.put("/", ctrl.upsertProfile);
r.patch("/", ctrl.patchProfile);

r.get("/",    ctrl.getProfile);
r.delete("/", ctrl.deleteProfile);

// Aliases
r.get("/me",    ctrl.getProfile);
r.put("/me",    ctrl.upsertProfile);
r.patch("/me",  ctrl.patchProfile);
r.delete("/me", ctrl.deleteProfile);

export default r;
