// src/routes/food.js
import { Router } from "express";
import {
  addFood,
  listFoods,
  getFood,
  updateFood,
  deleteFood,
  getFoodByName
} from "../controllers/food.js";

const r = Router();

// Food CRUD routes
r.post("/", addFood);        // Add a new food item
r.get("/", listFoods);       // List all food items
r.get("/:id", getFood);      // Get a specific food item
r.get("/name/:name", getFoodByName);  // Get a food item by name
r.put("/:id", updateFood);   // Update a food item
r.delete("/:id", deleteFood); // Delete a food item

export default r;
