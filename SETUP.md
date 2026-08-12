# Setup Guide

Backed by **MyDataWorld**, the same shared database as My Apps Hub, T-Minus,
Shed Inventory, PWI Weight Tracker, and Choir Admin Panel. Public pages
(browse, scale, favorite, shopping list) need no login, same as always —
only recipe add/edit/delete requires an account with edit rights.

This replaces the old standalone "RecipeFile" database entirely.

## 1. Update the database

Open **phpMyAdmin**, select the MyDataWorld database, go to the **SQL** tab,
and run everything in [`api/schema.sql`](api/schema.sql). It's safe to run
even if `users`/`sessions` already exist — those use
`CREATE TABLE IF NOT EXISTS`. This also requires My Apps Hub's own
`api/schema.sql` to have already been run at least once (this app reads the
shared `apps`/`app_access` tables, including `can_edit`).

## 2. Deploy the API

1. Copy `api/config.example.php` to `api/config.php` and fill in the real
   `DB_NAME`, `DB_USER`, `DB_PASS` — same credentials as your other
   MyDataWorld apps.
2. Upload the whole `api/` folder via FTP/File Manager to wherever it
   already lives (e.g. `seniorfamily.org/api/`) — `app.js` in both apps
   already points `API_URL` there, so no front-end change is needed if the
   path stays the same.

## 3. Grant edit access

1. Sign up through **My Apps Hub** with your email, if you haven't already.
2. Open the Hub's `admin.html`, look yourself up, and check the box next to
   **Senior Family Cookbook** and/or **Living Lean** — both are public apps,
   so checking the box grants *editing*, not just access (everyone can
   already browse). Repeat for anyone else who adds/edits recipes.
3. There's no more per-account `collection` restriction — access is
   per-app now, so someone can be an editor of one cookbook, the other, or
   both, independently.

## 4. Data migration (RecipeFile → MyDataWorld)

Both databases live under the same hosting account and the same DB user, so
this is a single cross-database script — no CSV export needed. Run the
migration script (ask your assistant for it if you don't have a copy — it
was written to move `recipes`/`tags`/`recipe_tags` into
`cookbook_recipes`/`cookbook_tags`/`cookbook_recipe_tags` with IDs
preserved) in phpMyAdmin's SQL tab, **after** step 1.

Verify row counts match between the old and new tables before doing
anything destructive. Once confirmed, the old RecipeFile database
(including its own separate `users`/`sessions` tables) can be dropped —
existing editor accounts there do **not** carry over; whoever edited
recipes before needs to sign up through My Apps Hub and be re-granted
access per step 3.

## Single sign-on

If `apps.sso_enabled = 1` is set for `senior-family-cookbook`/`living-lean`,
launching either app from My Apps Hub logs it in automatically
(`?token=...` handoff) — if that account has edit rights, the Add/Edit/
Delete buttons are unlocked immediately, no second login inside the app.

## Notes

- Tags stay global across both cookbooks (a "Keto" tag is the same row
  whether used on a Senior Family or Living Lean recipe) — unchanged from
  before.
- Favorites and shopping lists are entirely client-side (`localStorage`) —
  nothing to migrate there.
- Three old one-off scripts (`hash-generator.php`, `migrate.php`,
  `fix-tag-case.php`) have been removed from this repo. If they're still
  present on the live server from before, delete them there too via
  FTP/File Manager — `hash-generator.php` in particular had no login of its
  own and could mint accounts for anyone who found the URL.
