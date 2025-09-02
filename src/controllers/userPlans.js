import { Op } from 'sequelize';
import UserPlan from '../models/UserPlan.js';
import HealthySwap from '../models/HealthySwap.js';

export const addToPlan = async (req, res) => {
  try {
    const { swapId, scheduledDate } = req.body;
    const userId = req.user_id; // From auth middleware

    // Check if the swap exists
    const swap = await HealthySwap.findByPk(swapId);
    if (!swap) {
      return res.status(404).json({
        hasError: true,
        message: 'Healthy swap not found',
      });
    }

    // Check if already in plan for the same date
    const existingPlan = await UserPlan.findOne({
      where: {
        userId,
        swapId,
        scheduledDate,
      },
    });

    if (existingPlan) {
      return res.status(400).json({
        hasError: true,
        message: 'This swap is already in your plan for the selected date',
      });
    }

    const plan = await UserPlan.create({
      userId,
      swapId,
      scheduledDate,
      isCompleted: false,
    });

    res.status(201).json({
      hasError: false,
      message: 'Added to your plan successfully',
      data: plan,
    });
  } catch (error) {
    console.error('Error adding to plan:', error);
    res.status(500).json({
      hasError: true,
      message: 'Failed to add to plan',
      error: error.message,
    });
  }
};

export const getUserPlans = async (req, res) => {
  try {
    const userId = req.user_id;
    const { date } = req.query; // Format: YYYY-MM-DD
    
    const whereClause = { userId };
    
    if (date) {
      whereClause.scheduledDate = date;
    }

    const plans = await UserPlan.findAll({
      where: whereClause,
      include: [
        {
          model: HealthySwap,
          as: 'swap',
          attributes: ['id', 'category', 'unhealthyItem', 'healthyAlternative', 'imageUrl', 'benefits', 'caloriesSaved'],
        },
      ],
      order: [['scheduledDate', 'ASC']],
    });

    res.json({
      hasError: false,
      data: plans,
    });
  } catch (error) {
    console.error('Error fetching user plans:', error);
    res.status(500).json({
      hasError: true,
      message: 'Failed to fetch user plans',
      error: error.message,
    });
  }
};

export const updatePlanStatus = async (req, res) => {
  try {
    const { planId } = req.params;
    const { isCompleted } = req.body;
    const userId = req.user_id;

    const plan = await UserPlan.findOne({
      where: {
        id: planId,
        userId,
      },
    });

    if (!plan) {
      return res.status(404).json({
        hasError: true,
        message: 'Plan not found',
      });
    }

    plan.isCompleted = isCompleted;
    await plan.save();

    res.json({
      hasError: false,
      message: 'Plan updated successfully',
      data: plan,
    });
  } catch (error) {
    console.error('Error updating plan status:', error);
    res.status(500).json({
      hasError: true,
      message: 'Failed to update plan status',
      error: error.message,
    });
  }
};

export const removeFromPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const userId = req.user_id;

    const result = await UserPlan.destroy({
      where: {
        id: planId,
        userId,
      },
    });

    if (result === 0) {
      return res.status(404).json({
        hasError: true,
        message: 'Plan not found or already removed',
      });
    }

    res.json({
      hasError: false,
      message: 'Removed from plan successfully',
    });
  } catch (error) {
    console.error('Error removing from plan:', error);
    res.status(500).json({
      hasError: true,
      message: 'Failed to remove from plan',
      error: error.message,
    });
  }
};
