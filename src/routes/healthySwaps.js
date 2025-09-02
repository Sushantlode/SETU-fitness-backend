import express from 'express';
import { 
  getAllSwaps, 
  getSwapById, 
  createSwap, 
  updateSwap, 
  deleteSwap 
} from '../controllers/healthySwaps.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllSwaps);
router.get('/:id', getSwapById);

// Protected routes (require authentication)
router.use(authenticateJWT);

// Protected routes (require authentication)
router.post('/', createSwap);
router.put('/:id', updateSwap);
router.delete('/:id', deleteSwap);

export default router;
