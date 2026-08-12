# Senior Family Cookbook / Living Lean

Two Progressive Web Apps sharing one backend: **Senior Family Cookbook**
(root of this repo) and **Living Lean** (`living-lean/`), a personal
low-carb/low-cal collection. Both are installable on Android/iOS and are
public — anyone can browse, scale servings, favorite, and build a shopping
list with no login. Only adding/editing a recipe requires an account with
edit rights.

See [SETUP.md](SETUP.md) for deployment (database, API, GitHub Pages,
granting edit access, and migrating off the old standalone database).

## Files

- `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json` — Senior
  Family Cookbook
- `living-lean/` — the same app, re-skinned and re-branded for Living Lean
  (near-identical `app.js`/`index.html`/`style.css`; differences are
  branding, theme colors, and `localStorage` key prefixes)
- `api/api.php` — shared backend for both apps: public recipe reads,
  gated add/edit/delete
- `api/schema.sql` — database tables (`users`, `sessions`,
  `cookbook_recipes`, `cookbook_tags`, `cookbook_recipe_tags`)
- `api/config.example.php` — copy to `api/config.php` with real DB
  credentials (gitignored)

## Accounts

No signup here — this shares the same login as My Apps Hub, T-Minus, Shed
Inventory, PWI Weight Tracker, and Choir Admin Panel (all on MyDataWorld).
Sign up through My Apps Hub, then ask to be granted edit access to
whichever cookbook(s) you maintain.

## Single sign-on

If `apps.sso_enabled = 1` is set for `senior-family-cookbook`/`living-lean`
in My Apps Hub's database, launching either app from the Hub logs you in
automatically — if your account has edit rights there, the Add/Edit/Delete
buttons are already unlocked on arrival.
