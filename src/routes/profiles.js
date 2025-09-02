import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/profiles.js";

const r = Router();

// Upload (multipart/form-data; field name: "image")
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("ONLY_IMAGES"));
  },
});
r.post("/photo", upload.single("image"), ctrl.uploadProfilePhoto);

// Old paths preserved
r.get("/",    ctrl.getProfile);
r.post("/",   ctrl.createProfile);
r.put("/",    ctrl.upsertProfile);
r.patch("/",  ctrl.patchProfile);
r.delete("/", ctrl.deleteProfile);

// Friendly aliases
r.get("/me",    ctrl.getProfile);
r.put("/me",    ctrl.upsertProfile);
r.patch("/me",  ctrl.patchProfile);
r.delete("/me", ctrl.deleteProfile);

export default r;
