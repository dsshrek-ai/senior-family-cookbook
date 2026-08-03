-- Run this in phpMyAdmin's SQL tab against RecipeFile, BEFORE re-running migrate.php.
-- Fixes the tables to use utf8mb4 so special characters (≈, é, emoji, etc.) store correctly.

ALTER DATABASE `rde85qok3x5n8pqk_RecipeFile` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE recipes     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE tags        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE recipe_tags CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE users       CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sessions    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Clear out the partial import from the run that failed partway through.
DELETE FROM recipes WHERE collection = 'senior-family';
