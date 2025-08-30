import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// Parse NUMERIC/BIGINT into numbers in JSON
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20,   v => (v === null ? null : parseInt(v, 10)));

export const pool = new pg.Pool({
  host: process.env.PGHOST,              // e.g. RDS endpoint
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  // Your DB requires SSL
  ssl: { require: true, rejectUnauthorized: false },
});
