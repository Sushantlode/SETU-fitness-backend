import { Op } from 'sequelize';
import HealthySwap from '../models/HealthySwap.js';

// Get all healthy swaps with optional category filter
export const getAllSwaps = async (req, res) => {
  try {
    const { category } = req.query;
    
    const whereClause = { isActive: true };
    if (category && category.toLowerCase() !== 'all') {
      whereClause.category = { [Op.iLike]: `%${category}%` };
    }

    const swaps = await HealthySwap.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'category',
        'unhealthyItem',
        'healthyAlternative',
        'imageUrl',
        'benefits',
        'caloriesSaved'
      ]
    });

    // Group by category for the frontend
    const groupedSwaps = {};
    const allCategories = ['Carbs', 'Proteins', 'Snacks', 'Beverages'];
    
    // Initialize with all categories
    allCategories.forEach(cat => {
      groupedSwaps[cat] = [];
    });

    // Group the swaps
    swaps.forEach(swap => {
      const category = swap.category || 'Other';
      if (!groupedSwaps[category]) {
        groupedSwaps[category] = [];
      }
      groupedSwaps[category].push(swap);
    });

    res.status(200).json({
      success: true,
      data: category ? swaps : groupedSwaps,
      message: 'Healthy swaps retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching healthy swaps:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch healthy swaps',
      error: error.message
    });
  }
};

// Get a single healthy swap by ID
export const getSwapById = async (req, res) => {
  try {
    const { id } = req.params;
    const swap = await HealthySwap.findByPk(id);
    
    if (!swap) {
      return res.status(404).json({
        success: false,
        message: 'Healthy swap not found'
      });
    }

    res.status(200).json({
      success: true,
      data: swap,
      message: 'Healthy swap retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching healthy swap:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch healthy swap',
      error: error.message
    });
  }
};

// Create a new healthy swap (Admin only)
export const createSwap = async (req, res) => {
  try {
    const { category, unhealthyItem, healthyAlternative, imageUrl, benefits, caloriesSaved } = req.body;
    
    if (!category || !unhealthyItem || !healthyAlternative) {
      return res.status(400).json({
        success: false,
        message: 'Category, unhealthy item, and healthy alternative are required'
      });
    }

    const newSwap = await HealthySwap.create({
      category,
      unhealthyItem,
      healthyAlternative,
      imageUrl: imageUrl || null,
      benefits: benefits || null,
      caloriesSaved: caloriesSaved || null
    });

    res.status(201).json({
      success: true,
      data: newSwap,
      message: 'Healthy swap created successfully'
    });
  } catch (error) {
    console.error('Error creating healthy swap:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create healthy swap',
      error: error.message
    });
  }
};

// Update a healthy swap (Admin only)
export const updateSwap = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const swap = await HealthySwap.findByPk(id);
    if (!swap) {
      return res.status(404).json({
        success: false,
        message: 'Healthy swap not found'
      });
    }

    await swap.update(updates);
    
    res.status(200).json({
      success: true,
      data: swap,
      message: 'Healthy swap updated successfully'
    });
  } catch (error) {
    console.error('Error updating healthy swap:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update healthy swap',
      error: error.message
    });
  }
};

// Delete a healthy swap (Admin only)
export const deleteSwap = async (req, res) => {
  try {
    const { id } = req.params;
    
    const swap = await HealthySwap.findByPk(id);
    if (!swap) {
      return res.status(404).json({
        success: false,
        message: 'Healthy swap not found'
      });
    }

    // Soft delete by setting isActive to false
    await swap.update({ isActive: false });
    
    res.status(200).json({
      success: true,
      message: 'Healthy swap deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting healthy swap:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete healthy swap',
      error: error.message
    });
  }
};
