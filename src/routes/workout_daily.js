// routes/workout_daily.js
import { Router } from "express";
import {
  upsertDay,
  listDays,
  getDay,
  patchDay,
  addItems,
  deleteDay,
  deleteItem,
} from "../controllers/workout_daily.js";
import { authenticateJWT } from "../middleware/auth.js";

const r = Router();
r.use(authenticateJWT);

// collection
r.get("/days", listDays);           // ?start&end (defaults to last 7 days)
r.post("/days", upsertDay);         // upsert day (optionally replace items)

// item
r.get("/days/:day", getDay);        // one day
r.patch("/days/:day", patchDay);    // partial update; can replace items
r.post("/days/:day/exercises", addItems); // append items
r.delete("/days/:day", deleteDay);  // delete whole day
r.delete("/days/:day/exercises/:itemId", deleteItem); // delete one item

export default r;
