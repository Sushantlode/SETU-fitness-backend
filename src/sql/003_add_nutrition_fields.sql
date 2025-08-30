-- Add meal_type to recipes
ALTER TABLE ftn_recipes 
ADD COLUMN IF NOT EXISTS meal_type VARCHAR(50);

-- Add category to swaps
ALTER TABLE ftn_swaps 
ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Create index for better performance on common queries
CREATE INDEX IF NOT EXISTS idx_ftn_recipes_meal_type ON ftn_recipes(LOWER(meal_type));
CREATE INDEX IF NOT EXISTS idx_ftn_swaps_category ON ftn_swaps(LOWER(category));
