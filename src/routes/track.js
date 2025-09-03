    import { Router } from "express";
    import { authenticateJWT } from "../middleware/auth.js";
    import {
    createOrUpsertTrack,
    listRange,
    getOneDay,
    replaceDay,
    patchDay,
    deleteDay,
    updateSteps,
    updateDistance,
    updateCalories,
    updateStepsLive,
    patchMetrics
    } from "../controllers/track.js";

    const r = Router();
    r.use(authenticateJWT);

    // collection routes at /track  (mounted with app.use("/track", r))
    r.post("/", createOrUpsertTrack);     // create/upsert by day (body.day optional)
    r.get("/", listRange);                // ?start&end

    // single-field + live rollover (declare before :day)
    r.put("/steps", updateSteps);
    r.put("/steps/live", updateStepsLive); // optional
    r.put("/distance", updateDistance);
    r.put("/calories", updateCalories);

    // combined patch for steps/distance/calories
    r.patch("/metrics", patchMetrics);

    // item routes by :day
    r.route("/:day")
    .get(getOneDay)
    .put(replaceDay)
    .patch(patchDay)
    .delete(deleteDay);

    export default r;
