// src/models/index.js
import { sequelize } from '../db/sequelize.js';   // keep your named import
import HealthySwap from './HealthySwap.js';
import UserPlan    from './UserPlan.js';

// Wire associations once (NO factories here)
UserPlan.belongsTo(HealthySwap, { foreignKey: 'swap_id', as: 'swap' });
HealthySwap.hasMany(UserPlan,   { foreignKey: 'swap_id', as: 'plans' });

// Optional: export for convenience
export { sequelize, HealthySwap, UserPlan };
export default { sequelize, HealthySwap, UserPlan };
