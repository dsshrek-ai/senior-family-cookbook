-- Senior Family Cookbook / Living Lean — schema for MyDataWorld
-- Run this in phpMyAdmin's SQL tab against the MyDataWorld database, AFTER
-- My Apps Hub's own api/schema.sql has been run at least once (this relies
-- on the shared apps/app_access tables, including the can_edit column,
-- already existing).
--
-- Replaces the standalone "RecipeFile" database entirely. Table names are
-- prefixed cookbook_ so they can't collide with another app's tables here.
-- Both apps (senior-family-cookbook, living-lean) share these same tables,
-- partitioned by the `collection` column, same as they always have been.

CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(100) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token       CHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Editing rights no longer live on the user row (the old nullable
-- users.collection column) — they're app_access.can_edit grants against
-- the 'senior-family-cookbook' / 'living-lean' app_keys instead, managed
-- from My Apps Hub's admin tool like every other app.

CREATE TABLE IF NOT EXISTS cookbook_recipes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  collection     VARCHAR(50) NOT NULL DEFAULT 'senior-family',
  category       VARCHAR(100) NULL,
  base_servings  INT NULL,
  prep_time      VARCHAR(50) NULL,
  cook_time      VARCHAR(50) NULL,
  total_time     VARCHAR(50) NULL,
  tested         TINYINT(1) NOT NULL DEFAULT 0,
  story          TEXT NULL,
  nutrition      TEXT NULL,
  notes          TEXT NULL,
  ingredients    JSON NOT NULL,
  steps          JSON NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collection (collection)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tags stay global/shared across both cookbooks, matching current behavior
-- (a "Keto" tag is the same row whether used on a senior-family or
-- living-lean recipe).
CREATE TABLE IF NOT EXISTS cookbook_tags (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cookbook_recipe_tags (
  recipe_id  INT NOT NULL,
  tag_id     INT NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES cookbook_recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES cookbook_tags(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grant yourself (and anyone else who edits recipes) access once they've
-- signed up through My Apps Hub — otherwise nobody can add/edit anything.
-- INSERT INTO app_access (user_id, app_id, can_edit)
-- SELECT u.id, a.id, 1 FROM users u, apps a
-- WHERE u.username = 'you@example.com' AND a.app_key = 'senior-family-cookbook';
