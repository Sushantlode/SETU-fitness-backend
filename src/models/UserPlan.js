import { DataTypes } from 'sequelize';
import { sequelize } from '../db/pool.js';

const UserPlan = sequelize.define('UserPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id',
    },
  },
  swapId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'swap_id',
    references: {
      model: 'healthy_swaps',
      key: 'id',
    },
  },
  scheduledDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'scheduled_date',
  },
  isCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_completed',
  },
}, {
  tableName: 'user_plans',
  timestamps: true,
  underscored: true,
});

export default UserPlan;
