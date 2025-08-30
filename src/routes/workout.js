import { Router } from "express";
import * as W from "../controllers/workout.js";

const r = Router();

/** Muscles */
r.get("/muscles", W.listMuscles);          // GET /workout/muscles
r.post("/muscles", W.addMuscle);           // POST /workout/muscles { name }

/** Exercises */
r.get("/exercises", W.listExercises);      // GET /workout/exercises?muscle=Chest&search=press&page=1&limit=20
r.get("/exercises/:id", W.getExercise);    // GET /workout/exercises/:id
r.post("/exercises", W.createExercise);    // POST /workout/exercises { ... }
r.put("/exercises/:id", W.updateExercise); // PUT /workout/exercises/:id { ... }

export default r;
  