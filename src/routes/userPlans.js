import express from 'express';
import { 
  addToPlan, 
  getUserPlans, 
  updatePlanStatus, 
  removeFromPlan 
} from '../controllers/userPlans.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);

// Add a swap to user's plan
router.post('/', addToPlan);

// Get user's plans (optionally filtered by date)
router.get('/', getUserPlans);

// Update plan status (mark as completed/not completed)
router.patch('/:planId/status', updatePlanStatus);

// Remove a swap from user's plan
router.delete('/:planId', removeFromPlan);

export default router;
