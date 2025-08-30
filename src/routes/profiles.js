import { Router } from "express";
import * as ctrl from "../controllers/profiles.js";

const r = Router();

r.get("/", ctrl.getProfile);        // READ
r.post("/", ctrl.createProfile);    // CREATE (409 if already exists)
r.put("/", ctrl.upsertProfile);     // UPSERT (create if missing)
r.patch("/", ctrl.patchProfile);    // PARTIAL UPDATE
r.delete("/", ctrl.deleteProfile);  // DELETE

export default r;
