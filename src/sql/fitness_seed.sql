CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$DECLARE u INTEGER := :user_id; x INTEGER; BEGIN SELECT COUNT(*) INTO x FROM users WHERE user_id=u; IF x=0 THEN RAISE EXCEPTION 'No users.user_id=% found.', u; END IF; END $$;
INSERT INTO ftn_swaps (title, description, from_item, to_item, benefit, image_s3_key, is_public, owner_user_id, created_at) VALUES
('Swap white bread for whole grain','More fiber, better satiety.','White bread','Whole-grain bread','Higher fiber','fitness/public/catalog/swaps/wholegrain.jpg', TRUE, NULL, NOW()),
('Soda -> sparkling water + lemon','Keep the fizz, lose the sugar.','Soda','Sparkling water + lemon','Less sugar','fitness/public/catalog/swaps/sparkling-lemon.jpg', TRUE, NULL, NOW())
ON CONFLICT DO NOTHING;
INSERT INTO ftn_motivations (quote, author, is_public, image_s3_key, created_at) VALUES
('A little progress each day adds up to big results.', NULL, TRUE, 'fitness/public/catalog/motivations/progress.jpg', NOW()),
('Discipline is choosing what you want most over what you want now.', NULL, TRUE, 'fitness/public/catalog/motivations/discipline.jpg', NOW())
ON CONFLICT DO NOTHING;
DO $$DECLARE u INTEGER := :user_id; meal_oats UUID; meal_chicken UUID; recipe_oats UUID; plan_id UUID; day1_id UUID; swap_id UUID; motiv_id UUID; BEGIN
INSERT INTO ftn_profiles (user_id, units, timezone, activity_level, target_calories) VALUES (u,'metric','Asia/Kolkata','moderate',2100)
ON CONFLICT (user_id) DO UPDATE SET units=EXCLUDED.units, timezone=EXCLUDED.timezone, activity_level=EXCLUDED.activity_level, target_calories=EXCLUDED.target_calories, updated_at=NOW();
UPDATE ftn_hydration_goals SET is_active=FALSE WHERE user_id=u AND is_active=TRUE;
INSERT INTO ftn_hydration_goals (user_id, daily_ml, is_active) VALUES (u,2500,TRUE);
INSERT INTO ftn_water_logs (user_id, logged_at, amount_ml, source, created_at) VALUES
(u, NOW()-INTERVAL '8 hours', 250, 'glass', NOW()),
(u, NOW()-INTERVAL '4 hours', 250, 'glass', NOW()),
(u, NOW()-INTERVAL '1 hours', 300, 'bottle', NOW());
INSERT INTO ftn_recipes (user_id, title, description, total_time_min, servings, image_s3_key) VALUES
(u,'Oats Banana Smoothie','High-fiber breakfast smoothie.',10,1,'fitness/users/'||u||'/recipes/oats-smoothie/cover.jpg')
RETURNING id INTO recipe_oats;
INSERT INTO ftn_recipe_items (recipe_id, ingredient_name, quantity, unit) VALUES
(recipe_oats,'Rolled Oats',50,'g'),(recipe_oats,'Banana',1,'piece'),(recipe_oats,'Greek Yogurt (low-fat)',150,'g'),(recipe_oats,'Milk (skim)',200,'ml');
INSERT INTO ftn_meals (user_id, name, meal_type, total_calories, image_s3_key, notes) VALUES
(u,'Oats Bowl','breakfast',420,'fitness/users/'||u||'/meals/oats-bowl/cover.jpg','Oats + banana + nuts')
RETURNING id INTO meal_oats;
INSERT INTO ftn_meal_items (meal_id, custom_food_name, quantity, unit, calories, protein_g, carbs_g, fat_g) VALUES
(meal_oats,'Rolled Oats',60,'g',230,8,40,4),(meal_oats,'Banana',1,'piece',90,1,23,0),(meal_oats,'Almonds',15,'g',90,3,3,8);
INSERT INTO ftn_meals (user_id, name, meal_type, total_calories, image_s3_key, notes) VALUES
(u,'Grilled Chicken Salad','lunch',520,'fitness/users/'||u||'/meals/chicken-salad/cover.jpg','Greens + chicken + vinaigrette')
RETURNING id INTO meal_chicken;
INSERT INTO ftn_meal_items (meal_id, custom_food_name, quantity, unit, calories, protein_g, carbs_g, fat_g) VALUES
(meal_chicken,'Grilled Chicken Breast',180,'g',300,55,0,6),(meal_chicken,'Mixed Greens',120,'g',30,2,5,0),(meal_chicken,'Olive Oil Vinaigrette',20,'ml',175,0,2,18);
INSERT INTO ftn_meal_logs (user_id, eaten_at, meal_type, meal_id, total_calories, notes) VALUES
(u, date_trunc('day',NOW())+INTERVAL '08:30','breakfast',meal_oats,420,'With coffee'),
(u, date_trunc('day',NOW())+INTERVAL '13:30','lunch',meal_chicken,520,'Post-gym');
INSERT INTO ftn_favorite_meals (user_id, meal_id) VALUES (u,meal_oats) ON CONFLICT (user_id, meal_id) DO NOTHING;
INSERT INTO ftn_meal_plan_headers (user_id, name, start_date, end_date, is_active) VALUES (u,'Week 1',CURRENT_DATE,CURRENT_DATE+INTERVAL '6 days',TRUE) RETURNING id INTO plan_id;
INSERT INTO ftn_meal_plan_days (plan_id, day_index, day_date) VALUES (plan_id,1,CURRENT_DATE) RETURNING id INTO day1_id;
INSERT INTO ftn_meal_plan_slots (plan_day_id, slot_type, meal_id, notes) VALUES (day1_id,'breakfast',meal_oats,'Per plan'),(day1_id,'lunch',meal_chicken,'Post-gym');
SELECT id INTO swap_id FROM ftn_swaps ORDER BY created_at ASC LIMIT 1; IF swap_id IS NOT NULL THEN INSERT INTO ftn_user_saved_swaps (user_id, swap_id) VALUES (u, swap_id) ON CONFLICT (user_id, swap_id) DO NOTHING; END IF;
SELECT id INTO motiv_id FROM ftn_motivations ORDER BY created_at ASC LIMIT 1; IF motiv_id IS NOT NULL THEN INSERT INTO ftn_user_motivations (user_id, motivation_id, is_favorite, seen_at) VALUES (u, motiv_id, TRUE, NOW()) ON CONFLICT (user_id, motivation_id) DO UPDATE SET is_favorite=EXCLUDED.is_favorite, seen_at=NOW(); END IF;
END $$;