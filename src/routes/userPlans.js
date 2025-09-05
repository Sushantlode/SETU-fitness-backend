// src/routes/userPlans.js
import express from 'express';
import {
  addToPlan,
  getUserPlans,
  updatePlanStatus,
  removeFromPlan,
} from '../controllers/userPlans.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// auth for all user-plan routes
router.use(authenticateJWT);

// POST /user-plans            { swapId:int, scheduledDate:'YYYY-MM-DD', isCompleted?:bool }
router.post('/', addToPlan);

// GET  /user-plans            ?day=YYYY-MM-DD | ?start=YYYY-MM-DD&end=YYYY-MM-DD&page=&limit=
router.get('/', getUserPlans);

// PATCH /user-plans/:planId/status   { isCompleted:boolean }
router.patch('/:planId/status', updatePlanStatus);

// DELETE /user-plans/:planId
router.delete('/:planId', removeFromPlan);

export default router;
