# Senior Family Cookbook PWA

A Progressive Web App for the Senior Family Cookbook, installable on Android and iOS.

## Setup on GitHub Pages

1. Go to github.com and create a new repository named `senior-family-cookbook`
2. Upload all files from this folder to the repository
3. Go to Settings → Pages
4. Under "Source" select "Deploy from a branch"
5. Select "main" branch and "/ (root)" folder
6. Click Save
7. Your app will be live at: https://dsshrek-ai.github.io/senior-family-cookbook

## Install on Android

1. Open Chrome on your Android phone
2. Go to https://dsshrek-ai.github.io/senior-family-cookbook
3. Tap the menu (⋮) → "Add to Home screen"
4. Tap Add
5. The app icon will appear on your home screen

## Files

- `index.html` — Main app HTML
- `style.css` — All styles
- `app.js` — App logic (recipes, caching, scaling)
- `sw.js` — Service worker (offline support)
- `manifest.json` — PWA manifest
- `icon-192.png` — App icon (192×192)
- `icon-512.png` — App icon (512×512)

## Updating Recipes

Just update your Google Sheet — the app will fetch fresh data when you tap Refresh.
No code changes needed.
