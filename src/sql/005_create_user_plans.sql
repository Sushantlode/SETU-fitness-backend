-- Create user_plans table
CREATE TABLE IF NOT EXISTS user_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swap_id INTEGER NOT NULL REFERENCES healthy_swaps(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, swap_id, scheduled_date)  -- Prevent duplicate entries
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_swap_id ON user_plans(swap_id);
