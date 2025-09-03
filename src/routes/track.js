import { Router } from "express";
import {
  createTrack,
  getTrackByDay,
  listTracks,
  putTrackForDay,
  patchTrackForDay,
  deleteTrackByDay,
  putSteps,
  putDistance,
  putCalories,
} from "../controllers/track.js";

const r = Router();

// CREATE
r.post("/", createTrack);                     // POST /track

// READ
r.get("/", listTracks);                       // GET /track?start=&end=&page=&limit=
r.get("/:day", getTrackByDay);                // GET /track/2025-09-03

// UPDATE (replace / partial)
r.put("/:day", putTrackForDay);               // PUT /track/2025-09-03
r.patch("/:day", patchTrackForDay);           // PATCH /track/2025-09-03

// DELETE
r.delete("/:day", deleteTrackByDay);          // DELETE /track/2025-09-03

// Convenience single-metric PUTs (overwrite that field only)
r.put("/steps", putSteps);                    // body: { day?, steps }
r.put("/distance", putDistance);              // body: { day?, distance_m }
r.put("/calories", putCalories);              // body: { day?, calories_kcal }

export default r;
