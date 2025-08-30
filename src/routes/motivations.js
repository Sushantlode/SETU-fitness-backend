import { Router } from "express";
import * as ctrl from "../controllers/motivations.js";
const r = Router();
r.get("/", ctrl.oneRandom);
r.post("/", ctrl.createPublic);
r.delete("/:id", ctrl.deletePublic);
r.post("/favorite", ctrl.favorite);
r.get("/favorites", ctrl.listFavorites);
export default r;
