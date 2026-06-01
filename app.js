/* ============================================
   SENIOR FAMILY COOKBOOK — App Logic
   ============================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbzJ_eW_3TyedpTFM8ZkK7FePZ9iaWNR6plK-RoKYvEbF8RNNkdTb0KV90kuJHtQZeh7iQ/exec';
const STORAGE_KEY      = 'sfcAllRecipes';
const STORAGE_BACKUP   = 'sfcAllRecipesBackup';
const STORAGE_UPDATED  = 'sfcLastUpdated';

// ---- State ----
let allData        = null;   // { recipeList, recipes }
let currentRecipe  = null;
let scaleFactor    = 1;
let baseServings   = 1;
let checkedIng     = new Set();
let checkedSteps   = new Set();

// ---- DOM ----
const screenHome    = document.getElementById('screen-home');
const screenRecipe  = document.getElementById('screen-recipe');
const tagSelect     = document.getElementById('tag-select');
const recipeSelect  = document.getElementById('recipe-select');
const btnLoad       = document.getElementById('btn-load');
const btnBack       = document.getElementById('btn-back');
const btnRefresh    = document.getElementById('btn-refresh');
const btnRestore    = document.getElementById('btn-restore');
const statusBar     = document.getElementById('status-bar');
const restoreBanner = document.getElementById('restore-banner');
const lastUpdated   = document.getElementById('last-updated');
const loadingOverlay = document.getElementById('loading-overlay');
const recipeContent = document.getElementById('recipe-content');

// ---- Init ----
window.addEventListener('load', init);

async function init() {
  registerSW();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      allData = JSON.parse(stored);
      populateUI();
      showLastUpdated();
    } catch (e) {
      await fetchFromWeb();
    }
  } else {
    await fetchFromWeb();
  }
  setupInstallPrompt();
}

// ---- Service Worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---- Fetch ----
async function fetchFromWeb() {
  showLoading(true);
  hideStatus();
  restoreBanner.classList.add('hidden');

  try {
    const res  = await fetch(`${API_URL}?action=getAllRecipes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Backup current before replacing
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(STORAGE_BACKUP, current);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_UPDATED, new Date().toLocaleString());

    allData = data;
    populateUI();
    showLastUpdated();
  } catch (err) {
    if (allData) {
      showStatus('⚠️ Could not refresh — using cached data.');
      restoreBanner.classList.remove('hidden');
    } else {
      showStatus('⚠️ Could not load recipes. Check your connection and try refreshing.');
    }
  } finally {
    showLoading(false);
  }
}

// ---- Populate Home UI ----
function populateUI() {
  if (!allData) return;

  // Build tag list
  const tagSet = new Set();
  allData.recipes.forEach(r => {
    if (r.tags) r.tags.split(',').forEach(t => tagSet.add(t.trim()));
  });

  tagSelect.innerHTML = '<option value="all">All Recipes</option>';
  [...tagSet].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    tagSelect.appendChild(opt);
  });

  populateRecipeList('all');
}

function populateRecipeList(tag) {
  recipeSelect.innerHTML = '<option value="">— Choose a recipe —</option>';
  btnLoad.disabled = true;

  let names = allData.recipeList;
  if (tag !== 'all') {
    names = allData.recipes
      .filter(r => r.tags && r.tags.split(',').map(t => t.trim()).includes(tag))
      .map(r => r.name)
      .sort();
  }

  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    recipeSelect.appendChild(opt);
  });
}

// ---- Events: Home ----
tagSelect.addEventListener('change', () => {
  populateRecipeList(tagSelect.value);
});

recipeSelect.addEventListener('change', () => {
  btnLoad.disabled = recipeSelect.value === '';
});

btnLoad.addEventListener('click', () => {
  const name = recipeSelect.value;
  if (!name) return;
  const recipe = allData.recipes.find(r => r.name === name);
  if (!recipe) return;
  openRecipe(recipe);
});

btnRefresh.addEventListener('click', fetchFromWeb);

btnRestore.addEventListener('click', () => {
  const backup = localStorage.getItem(STORAGE_BACKUP);
  if (backup) {
    try {
      localStorage.setItem(STORAGE_KEY, backup);
      allData = JSON.parse(backup);
      populateUI();
      showStatus('✅ Restored from backup.');
      restoreBanner.classList.add('hidden');
    } catch (e) {
      showStatus('⚠️ Backup data is corrupted.');
    }
  } else {
    showStatus('⚠️ No backup available.');
  }
});

btnBack.addEventListener('click', goHome);

// ---- Recipe Screen ----
function openRecipe(recipe) {
  currentRecipe  = recipe;
  baseServings   = recipe.baseServings || 4;
  scaleFactor    = 1;
  checkedIng     = new Set();
  checkedSteps   = new Set();

  renderRecipe();

  // Slide transition
  screenHome.classList.add('slide-out');
  screenRecipe.classList.add('active');
  screenRecipe.scrollTop = 0;
  recipeContent.scrollTop = 0;
}

function goHome() {
  screenRecipe.classList.remove('active');
  screenHome.classList.remove('slide-out');
}

function renderRecipe() {
  const r = currentRecipe;
  let html = '';

  // Hero
  html += `<div class="recipe-hero">`;
  html += `<h1 class="recipe-name">${escHtml(r.name)}</h1>`;

  if (r.tags) {
    const tags = r.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length) {
      html += `<div class="recipe-tags">`;
      tags.forEach(tag => {
        html += `<span class="tag-pill">${escHtml(tag)}</span>`;
      });
      html += `</div>`;
    }
  }

  const scaled = formatQty(baseServings * scaleFactor);
  html += `<div class="servings-card">
    <span class="servings-base">Base: ${baseServings}</span>
    <div class="servings-input-group">
      <span class="servings-label">Make:</span>
      <input type="number" class="servings-input" id="servings-input"
             value="${baseServings}" min="1" inputmode="numeric">
      <button class="btn-scale" id="btn-scale">Go</button>
      <span class="scale-factor" id="scale-label">(1×)</span>
    </div>
  </div>`;
  html += `</div>`; // end hero

  html += `<div class="recipe-body">`;

  // Ingredients
  html += `<div class="section">
    <div class="section-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
      <h2>Ingredients</h2>
    </div>
    <ul class="item-list" id="ing-list">`;

  r.ingredients.forEach((ing, i) => {
    const displayText = buildIngText(ing, scaleFactor);
    const checked = checkedIng.has(i);
    html += `<li class="item${checked ? ' checked' : ''}" data-ing="${i}">
      <div class="item-check"></div>
      <span class="item-text">${displayText}</span>
    </li>`;
  });

  html += `</ul></div>`;

  // Steps
  html += `<div class="section">
    <div class="section-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <h2>Steps</h2>
    </div>
    <ul class="item-list" id="step-list">`;

  r.steps.forEach((step, i) => {
    const checked = checkedSteps.has(i);
    html += `<li class="item${checked ? ' checked' : ''}" data-step="${i}">
      <div class="step-number">${i + 1}</div>
      <span class="item-text">${escHtml(step)}</span>
    </li>`;
  });

  html += `</ul></div>`;

  // Story
  if (r.story && r.story.trim()) {
    html += `<div class="section">
      <div class="section-header story-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        <h2>About This Recipe</h2>
      </div>
      <div class="prose-section"><p>${escHtml(r.story)}</p></div>
    </div>`;
  }

  // Nutrition
  if (r.nutrition && r.nutrition.trim()) {
    html += `<div class="section">
      <div class="section-header nutrition-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>
        <h2>Nutrition</h2>
      </div>
      <div class="prose-section"><p class="nutrition-text">${escHtml(r.nutrition)}</p></div>
    </div>`;
  }

  html += `<div class="bottom-spacer"></div>`;
  html += `</div>`; // end recipe-body

  recipeContent.innerHTML = html;

  // Wire up ingredient taps
  document.querySelectorAll('[data-ing]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.ing);
      if (checkedIng.has(i)) checkedIng.delete(i);
      else checkedIng.add(i);
      el.classList.toggle('checked', checkedIng.has(i));
    });
  });

  // Wire up step taps
  document.querySelectorAll('[data-step]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.step);
      if (checkedSteps.has(i)) checkedSteps.delete(i);
      else checkedSteps.add(i);
      el.classList.toggle('checked', checkedSteps.has(i));
    });
  });

  // Servings scaling
  document.getElementById('btn-scale').addEventListener('click', applyScale);
  document.getElementById('servings-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.target.blur(); applyScale(); }
  });
}

function applyScale() {
  const input = document.getElementById('servings-input');
  const desired = parseFloat(input.value);
  if (!desired || desired <= 0) return;
  scaleFactor = desired / baseServings;

  const label = document.getElementById('scale-label');
  const sf = Math.round(scaleFactor * 100) / 100;
  label.textContent = sf === 1 ? '(1×)' : `(${sf}×)`;

  // Update ingredient quantities in place
  document.querySelectorAll('[data-ing]').forEach(el => {
    const i     = parseInt(el.dataset.ing);
    const ing   = currentRecipe.ingredients[i];
    const span  = el.querySelector('.item-text');
    span.innerHTML = buildIngText(ing, scaleFactor);
  });
}

// ---- Unit Normalization ----

// Conversion tables — each entry: [unit aliases, value in tsp]
// Volume family (tsp-based)
const VOLUME_LADDER = [
  { names: ['tsp', 'teaspoon', 'teaspoons'],        tsp: 1 },
  { names: ['tbsp', 'tablespoon', 'tablespoons'],   tsp: 3 },
  { names: ['fl oz', 'fluid oz', 'fluid ounce', 'fluid ounces'], tsp: 6 },
  { names: ['cup', 'cups'],                          tsp: 48 },
  { names: ['pint', 'pints', 'pt'],                  tsp: 96 },
  { names: ['quart', 'quarts', 'qt'],                tsp: 192 },
  { names: ['gallon', 'gallons', 'gal'],             tsp: 768 },
];

// Weight family (oz-based)
const WEIGHT_LADDER = [
  { names: ['oz', 'ounce', 'ounces'],  oz: 1 },
  { names: ['lb', 'lbs', 'pound', 'pounds'], oz: 16 },
];

// Canonical display names (singular/plural handled separately)
const UNIT_DISPLAY = {
  tsp:    { s: 'tsp',    p: 'tsp'    },
  tbsp:   { s: 'tbsp',   p: 'tbsp'   },
  'fl oz':{ s: 'fl oz',  p: 'fl oz'  },
  cup:    { s: 'cup',    p: 'cups'   },
  pint:   { s: 'pint',   p: 'pints'  },
  quart:  { s: 'quart',  p: 'quarts' },
  gallon: { s: 'gallon', p: 'gallons'},
  oz:     { s: 'oz',     p: 'oz'     },
  lb:     { s: 'lb',     p: 'lbs'    },
};

function normalizeUnit(unitRaw) {
  if (!unitRaw) return null;
  const u = unitRaw.toLowerCase().trim();
  for (const step of VOLUME_LADDER) {
    if (step.names.includes(u)) return { family: 'volume', canonical: step.names[0], tsp: step.tsp };
  }
  for (const step of WEIGHT_LADDER) {
    if (step.names.includes(u)) return { family: 'weight', canonical: step.names[0], oz: step.oz };
  }
  return null; // unknown unit — pass through as-is
}

function normalizeQty(qty, unitInfo) {
  // Returns array of { qty, unit } parts, e.g. [{qty:1,unit:'cup'},{qty:2,unit:'tbsp'}]
  if (!unitInfo) return null;

  if (unitInfo.family === 'volume') {
    const totalTsp = qty * unitInfo.tsp;
    return splitVolume(totalTsp);
  }

  if (unitInfo.family === 'weight') {
    const totalOz = qty * unitInfo.oz;
    return splitWeight(totalOz);
  }

  return null;
}

function splitVolume(totalTsp) {
  const parts = [];
  let remaining = totalTsp;

  // Work down from gallon to tsp
  const steps = [...VOLUME_LADDER].reverse(); // gallon → tsp
  for (const step of steps) {
    if (remaining <= 0) break;
    const count = remaining / step.tsp;
    const whole = Math.floor(count + 0.001); // small epsilon for float errors
    if (whole >= 1) {
      const fracRemainder = count - whole;
      const frac = snapFraction(fracRemainder);
      const display = whole > 0 && frac
        ? `${whole}${frac}`
        : frac || String(whole);
      parts.push({ display, unit: step.names[0] });
      remaining -= whole * step.tsp;
    } else if (parts.length === 0 && step === VOLUME_LADDER[0]) {
      // We're at tsp and have less than 1 — show as fraction
      const frac = snapFraction(count);
      parts.push({ display: frac || formatDecimal(count), unit: step.names[0] });
      remaining = 0;
    }
  }

  // If nothing matched cleanly, show as tsp
  if (parts.length === 0) {
    parts.push({ display: formatDecimal(totalTsp), unit: 'tsp' });
  }

  return parts;
}

function splitWeight(totalOz) {
  const parts = [];
  let remaining = totalOz;

  if (remaining >= 16) {
    const lbs = Math.floor(remaining / 16);
    const fracLbs = remaining / 16 - lbs;
    const frac = snapFraction(fracLbs);
    const display = lbs > 0 && frac ? `${lbs}${frac}` : frac || String(lbs);
    parts.push({ display, unit: 'lb' });
    remaining -= lbs * 16;
  }

  if (remaining > 0.01) {
    const frac = snapFraction(remaining / Math.ceil(remaining));
    const whole = Math.floor(remaining);
    const fracPart = snapFraction(remaining - whole);
    const display = whole > 0 && fracPart
      ? `${whole}${fracPart}`
      : fracPart || formatDecimal(remaining);
    parts.push({ display, unit: 'oz' });
  }

  if (parts.length === 0) parts.push({ display: formatDecimal(totalOz), unit: 'oz' });
  return parts;
}

function snapFraction(dec) {
  const fracs = [
    [0,    ''],
    [0.125,'⅛'],
    [0.25, '¼'],
    [0.333,'⅓'],
    [0.375,'⅜'],
    [0.5,  '½'],
    [0.625,'⅝'],
    [0.667,'⅔'],
    [0.75, '¾'],
    [0.875,'⅞'],
    [1,    ''],
  ];
  for (const [val, sym] of fracs) {
    if (Math.abs(dec - val) < 0.04) return sym;
  }
  return null;
}

function formatDecimal(n) {
  if (n === Math.floor(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function displayUnit(canonical, qty) {
  const d = UNIT_DISPLAY[canonical];
  if (!d) return canonical;
  // Use plural if qty > 1 (roughly)
  const num = parseFloat(qty);
  return num > 1 ? d.p : d.s;
}

// ---- Helpers ----
function buildIngText(ing, sf) {
  let html = '';

  if (ing.quantity !== '' && ing.quantity !== null && ing.quantity !== undefined) {
    const raw = parseFloat(ing.quantity);
    if (!isNaN(raw)) {
      const scaled = Math.round(raw * sf * 10000) / 10000;
      const unitInfo = normalizeUnit(ing.unit);
      const parts = unitInfo ? normalizeQty(scaled, unitInfo) : null;

      if (parts && parts.length > 0) {
        // Normalized display: "1 cup 2 tbsp"
        const partsHtml = parts.map(p => {
          const uLabel = displayUnit(p.unit, parseFloat(p.display));
          return `<span class="qty">${p.display}</span> <span class="unit">${uLabel}</span>`;
        }).join(' ');
        html += partsHtml + ' ';
      } else {
        // Unknown unit — show as-is
        const display = formatQty(scaled);
        html += `<span class="qty">${display}</span> `;
        if (ing.unit && ing.unit !== 'to taste') {
          html += `<span class="unit">${escHtml(ing.unit)}</span> `;
        } else if (ing.unit === 'to taste') {
          html += `<span class="unit">to taste</span> `;
        }
      }
    }
  } else {
    // No quantity — just show unit if "to taste" or similar
    if (ing.unit) {
      html += `<span class="unit">${escHtml(ing.unit)}</span> `;
    }
  }

  html += `<span class="ing-name">${escHtml(ing.ingredient)}</span>`;

  if (ing.notes) {
    html += ` <span class="ing-note">(${escHtml(ing.notes)})</span>`;
  }

  return html;
}

function formatQty(n) {
  if (n === Math.floor(n)) return String(n);
  const fracs = [[0.125,'⅛'],[0.25,'¼'],[0.333,'⅓'],[0.5,'½'],[0.667,'⅔'],[0.75,'¾'],[0.875,'⅞']];
  const whole = Math.floor(n);
  const dec   = Math.round((n - whole) * 1000) / 1000;
  for (const [val, sym] of fracs) {
    if (Math.abs(dec - val) < 0.04) {
      return whole > 0 ? `${whole}${sym}` : sym;
    }
  }
  return String(Math.round(n * 100) / 100);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showLoading(show) {
  loadingOverlay.classList.toggle('hidden', !show);
}

function showStatus(msg) {
  statusBar.textContent = msg;
  statusBar.classList.remove('hidden');
}

function hideStatus() {
  statusBar.classList.add('hidden');
}

function showLastUpdated() {
  const ts = localStorage.getItem(STORAGE_UPDATED);
  lastUpdated.textContent = ts ? `Updated ${ts}` : '';
}

// ---- PWA Install Prompt ----
let deferredPrompt = null;

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;

    // Only show if not already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const banner = document.createElement('div');
    banner.className = 'install-prompt';
    banner.innerHTML = `
      <p>Add <strong>Senior Family Cookbook</strong> to your home screen</p>
      <button class="install-btn">Install</button>
      <button class="install-dismiss" aria-label="Dismiss">×</button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('.install-btn').addEventListener('click', async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      banner.remove();
      deferredPrompt = null;
    });

    banner.querySelector('.install-dismiss').addEventListener('click', () => {
      banner.remove();
    });
  });
}
