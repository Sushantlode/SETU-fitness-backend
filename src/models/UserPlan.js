import { DataTypes } from 'sequelize';
import { sequelize } from '../db/pool.js';

const UserPlan = sequelize.define('UserPlan', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' }, // FK → ftn_profiles.id
  swapId: { type: DataTypes.INTEGER, allowNull: false, field: 'swap_id' },
  scheduledDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'scheduled_date' },
  isCompleted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_completed' },
}, {
  tableName: 'user_plans',
  timestamps: true,
  underscored: true,
});
export default UserPlan;
