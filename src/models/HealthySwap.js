import { DataTypes } from 'sequelize';
import { sequelize } from '../db/pool.js';

const HealthySwap = sequelize.define('HealthySwap', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Category of the swap (e.g., Carbs, Proteins, Snacks, Beverages)'
  },
  unhealthyItem: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'unhealthy_item'
  },
  healthyAlternative: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'healthy_alternative'
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'image_url'
  },
  benefits: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Health benefits of making this swap'
  },
  caloriesSaved: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'calories_saved',
    comment: 'Approximate calories saved per serving'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'healthy_swaps',
  timestamps: true,
  underscored: true
});

export default HealthySwap;
