import { Router } from "express";
import * as ctrl from "../controllers/profiles.js";

const r = Router();

// Old paths preserved
r.get("/",    ctrl.getProfile);
r.post("/",   ctrl.createProfile);
r.put("/",    ctrl.upsertProfile);
r.patch("/",  ctrl.patchProfile);
r.delete("/", ctrl.deleteProfile);

// Extra friendly aliases
r.get("/me",   ctrl.getProfile);
r.put("/me",   ctrl.upsertProfile);
r.patch("/me", ctrl.patchProfile);
r.delete("/me",ctrl.deleteProfile);

export default r;
