-- Run this in phpMyAdmin's SQL tab against RecipeFile.
-- Adds cookbook-collection scoping on top of the original schema.sql tables.

ALTER TABLE recipes
  ADD COLUMN collection VARCHAR(50) NOT NULL DEFAULT 'senior-family' AFTER name;

ALTER TABLE users
  ADD COLUMN collection VARCHAR(50) NULL AFTER display_name;
-- users.collection = NULL means that user can edit every collection.
-- users.collection = 'senior-family' (etc.) restricts them to only that one.
