// import { Router } from "express";
// import * as W from "../controllers/workout.js";

// const r = Router();

// /** Muscles */
// r.get("/muscles", W.listMuscles);          // GET /workout/muscles
// r.post("/muscles", W.addMuscle);           // POST /workout/muscles { name }

// /** Exercises */
// r.get("/exercises", W.listExercises);      // GET /workout/exercises?muscle=Chest&search=press&page=1&limit=20
// r.get("/exercises/:id", W.getExercise);    // GET /workout/exercises/:id
// r.post("/exercises", W.createExercise);    // POST /workout/exercises { ... }
// r.put("/exercises/:id", W.updateExercise); // PUT /workout/exercises/:id { ... }

// export default r;
  



// routes/workout.js
import { Router } from "express";
import * as W from "../controllers/workout.js";
import { uploadImage } from "../middleware/upload.js";

const r = Router();

/** Muscles */
r.get("/muscles", W.listMuscles);
r.post("/muscles", W.addMuscle);

/** Exercises */
r.get("/exercises", W.listExercises);
r.get("/exercises/:id", W.getExercise);

// Support BOTH: multipart file upload and JSON-only bodies
r.post("/exercises", uploadImage, W.createExercise);
r.put("/exercises/:id", uploadImage, W.updateExercise);

export default r;
