// import { Router } from "express";
// import * as ctrl from "../controllers/meals.js";
// const r = Router();
// r.get("/", ctrl.list);
// r.post("/", ctrl.create);
// r.get("/:id", ctrl.getOne);
// r.put("/:id", ctrl.update);
// r.delete("/:id", ctrl.remove);
// r.post("/:id/items", ctrl.addItem);
// r.get("/:id/items", ctrl.listItems);
// r.put("/:id/items/:item_id", ctrl.updateItem);
// r.delete("/:id/items/:item_id", ctrl.removeItem);
// export default r;


// src/routes/meals.js
import { Router } from "express";
import {
  list,
  create,
  getOne,
  update,
  remove,
  addItem,
  listItems,
  updateItem,
  removeItem,
} from "../controllers/meals.js";

const r = Router();

// (optional) sanity check to catch bad imports early
const fns = [list, create, getOne, update, remove, addItem, listItems, updateItem, removeItem];
if (fns.some(fn => typeof fn !== "function")) {
  throw new Error("meals controllers not exported correctly");
}

// Meals
r.get("/", list);
r.post("/", create);
r.get("/:id", getOne);
r.put("/:id", update);
r.delete("/:id", remove);

// Meal items
r.post("/:id/items", addItem);
r.get("/:id/items", listItems);
r.put("/:id/items/:item_id", updateItem);
r.delete("/:id/items/:item_id", removeItem);

export default r;
