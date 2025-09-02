-- Create healthy_swaps table
CREATE TABLE IF NOT EXISTS healthy_swaps (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    unhealthy_item VARCHAR(255) NOT NULL,
    healthy_alternative VARCHAR(255) NOT NULL,
    image_url VARCHAR(512),
    benefits TEXT,
    calories_saved INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category CHECK (category IN ('Carbs', 'Proteins', 'Snacks', 'Beverages', 'Other'))
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_healthy_swaps_category ON healthy_swaps (category, is_active);

-- Add sample data
INSERT INTO healthy_swaps 
    (category, unhealthy_item, healthy_alternative, calories_saved, benefits)
VALUES 
    ('Carbs', 'White Bread', 'Multigrain Brown Bread', 50, 'Higher in fiber and nutrients, keeps you full longer'),
    ('Beverages', 'Sugary Soda', 'Sparkling Water with Lemon', 150, 'Reduces sugar intake, hydrates better'),
    ('Proteins', 'Fried Chicken', 'Grilled Chicken Breast', 200, 'Lower in unhealthy fats, higher in protein'),
    ('Snacks', 'Potato Chips', 'Air-Popped Popcorn', 100, 'Lower in fat and calories, whole grain option available'),
    ('Beverages', 'Flavored Yogurt', 'Greek Yogurt with Fresh Fruit', 80, 'Higher in protein, less added sugar'),
    ('Carbs', 'White Rice', 'Quinoa or Brown Rice', 30, 'More fiber and protein, lower glycemic index'),
    ('Snacks', 'Candy Bar', 'Dark Chocolate with Nuts', 100, 'Antioxidants, healthy fats, and less sugar'),
    ('Proteins', 'Processed Deli Meats', 'Fresh Roasted Turkey or Chicken', 120, 'Lower in sodium and preservatives'),
    ('Beverages', 'Fruit Juice', 'Whole Fruit', 100, 'More fiber, less sugar, more filling'),
    ('Snacks', 'Ice Cream', 'Frozen Banana "Ice Cream"', 150, 'Naturally sweet, more nutrients, less processed');

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_healthy_swaps_updated_at
BEFORE UPDATE ON healthy_swaps
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
