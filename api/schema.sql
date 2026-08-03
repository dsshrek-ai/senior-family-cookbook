-- Senior Family Cookbook — recipe database schema
-- Run this in phpMyAdmin's SQL tab against the `RecipeFile` database.
-- NOTE: if these tables already exist on your server, don't re-run this —
-- use schema-update-collections.sql instead to ALTER them in place.

CREATE TABLE recipes (
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
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tags (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipe_tags (
  recipe_id  INT NOT NULL,
  tag_id     INT NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(100) NULL,
  collection     VARCHAR(50) NULL, -- NULL = can edit every collection; otherwise restricted to just this one
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token       CHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
