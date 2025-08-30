-- 2025-08-13: Fitness dashboard extensions (PostgreSQL) - FIXED
-- This version avoids DO $$ ... $$ blocks to prevent parser errors in some environments.
-- It uses DROP TRIGGER IF EXISTS + CREATE TRIGGER for idempotency.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- === Activity sessions (workouts) ===
CREATE TABLE IF NOT EXISTS ftn_activity_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id INTEGER NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    type TEXT,
    duration_min INTEGER,
    calories_burned INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_date ON ftn_activity_sessions (user_id, started_at DESC);

-- === Daily movement (steps/distance) ===
CREATE TABLE IF NOT EXISTS ftn_daily_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id INTEGER NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    day DATE NOT NULL,
    steps INTEGER NOT NULL DEFAULT 0,
    distance_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_day ON ftn_daily_activity (user_id, day DESC);

-- === Optional daily goals (calories/exercise minutes) ===
CREATE TABLE IF NOT EXISTS ftn_daily_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id INTEGER NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    daily_calorie_kcal INTEGER,
    daily_exercise_min INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_goals_user_active ON ftn_daily_goals (user_id, is_active);

-- === Helper function to touch updated_at (safe to re-create) ===
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- === Attach "touch" triggers (idempotent via DROP IF EXISTS) ===
DROP TRIGGER IF EXISTS trg_activity_sessions_touch ON ftn_activity_sessions;

CREATE TRIGGER trg_activity_sessions_touch
  BEFORE UPDATE ON ftn_activity_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_daily_activity_touch ON ftn_daily_activity;

CREATE TRIGGER trg_daily_activity_touch
  BEFORE UPDATE ON ftn_daily_activity
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_daily_goals_touch ON ftn_daily_goals;

CREATE TRIGGER trg_daily_goals_touch
  BEFORE UPDATE ON ftn_daily_goals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();