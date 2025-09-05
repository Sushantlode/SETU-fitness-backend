// src/db/sequelize.js
import pg from "pg";
import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

// Parse NUMERIC (1700) and BIGINT (20)
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20,   v => (v === null ? null : parseInt(v, 10)));

export const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  ssl: { require: true, rejectUnauthorized: false },
});

export const sequelize = new Sequelize(
  process.env.PGDATABASE,
  process.env.PGUSER,
  process.env.PGPASSWORD,
  {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    dialect: "postgres",
    dialectModule: pg,
    logging: false,
    define: { timestamps: true, underscored: true },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  }
);

// Optional connectivity log (non-blocking)
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");
  } catch (err) {
    console.error("Unable to connect to the database:", err);
  }
})();
