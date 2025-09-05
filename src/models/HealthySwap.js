import { DataTypes } from 'sequelize';
import { sequelize } from '../db/pool.js';

const HealthySwap = sequelize.define('HealthySwap', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  category: { type: DataTypes.STRING, allowNull: false },
  unhealthyItem: { type: DataTypes.STRING, allowNull: false, field: 'unhealthy_item' },
  healthyAlternative: { type: DataTypes.STRING, allowNull: false, field: 'healthy_alternative' },
  imageUrl: { type: DataTypes.STRING, field: 'image_url' },
  benefits: { type: DataTypes.TEXT },
  caloriesSaved: { type: DataTypes.INTEGER, field: 'calories_saved' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
}, {
  tableName: 'healthy_swaps',
  timestamps: true,
  underscored: true,
});
export default HealthySwap;
