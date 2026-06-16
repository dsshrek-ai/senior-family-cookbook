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
const searchInput    = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');

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
// ---- Print Recipe ----
function printRecipe() {
  if (!currentRecipe) return;
  const r       = currentRecipe;
  const serving = parseFloat(document.getElementById('servings-input')?.value) || baseServings;
  const sf      = serving / baseServings;
  const scaled  = Math.round(serving * 10) / 10;

  // Build ingredients HTML
  let ingRows = '';
  (r.ingredients || []).forEach(ing => {
    let qty = '';
    if (ing.quantity !== '' && ing.quantity !== null && ing.quantity !== undefined) {
      const raw = parseFloat(ing.quantity);
      if (!isNaN(raw)) qty = formatQty(raw * sf);
    }
    const unit  = ing.unit  || '';
    const name  = ing.ingredient || '';
    const notes = ing.notes ? ` <em>(${ing.notes})</em>` : '';
    ingRows += `<tr><td class="qty-col">${qty}</td><td class="unit-col">${unit}</td><td>${name}${notes}</td></tr>`;
  });

  // Build steps HTML
  let stepsList = '';
  (r.steps || []).forEach((step, i) => {
    stepsList += `<li>${step}</li>`;
  });

  const storyBlock = r.story ? `<div class="story"><strong>About this recipe:</strong><br>${r.story}</div>` : '';
  const nutriBlock = r.nutrition ? `<div class="story"><strong>Nutrition:</strong><br>${r.nutrition}</div>` : '';
  const scaleNote  = sf !== 1 ? ` <span class="scale-note">(scaled to ${scaled} servings)</span>` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${r.name}</title>
<style>
  body { font-family: Georgia, serif; font-size: 13px; margin: 24px 32px; color: #2c2c2c; max-width: 700px; }
  h1   { font-size: 24px; color: #3D5A3E; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 20px; font-family: sans-serif; }
  .scale-note { color: #8B6914; font-style: italic; }
  h2   { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em;
         color: #3D5A3E; border-bottom: 2px solid #3D5A3E; padding-bottom: 3px;
         margin: 20px 0 10px; font-family: sans-serif; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  td   { padding: 3px 6px; vertical-align: top; font-size: 13px; }
  .qty-col  { width: 48px; text-align: right; font-weight: bold; color: #3D5A3E; white-space: nowrap; }
  .unit-col { width: 60px; color: #6B5B45; white-space: nowrap; padding-left: 6px; }
  ol   { padding-left: 20px; }
  li   { margin-bottom: 6px; line-height: 1.5; }
  .story { background: #F5F0E8; border-left: 3px solid #C4A35A; padding: 10px 14px;
           margin-top: 16px; font-size: 12px; line-height: 1.6; color: #5A4A35; border-radius: 4px; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>${r.name}</h1>
  <div class="meta">Base: ${baseServings} servings${scaleNote} · Senior Family Cookbook</div>
  ${storyBlock}
  <h2>Ingredients</h2>
  <table>${ingRows}</table>
  <h2>Steps</h2>
  <ol>${stepsList}</ol>
  ${nutriBlock}
</body>
</html>`;

  let printDiv = document.getElementById('print-frame');
  if (printDiv) printDiv.remove();
  printDiv = document.createElement('div');
  printDiv.id = 'print-frame';
  printDiv.innerHTML = html;
  document.body.appendChild(printDiv);
  window.print();
  printDiv.remove();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — show banner
          const banner = document.getElementById('update-banner');
          if (banner) banner.classList.remove('hidden');

          document.getElementById('btn-update').addEventListener('click', () => {
            newWorker.postMessage('skipWaiting');
            window.location.reload();
          });

          document.getElementById('btn-dismiss-update').addEventListener('click', () => {
            banner.classList.add('hidden');
          });
        }
      });
    });
  }).catch(() => {});
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

  tagSelect.innerHTML = '<option value="all">— Select Category —</option>';
  [...tagSet].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    tagSelect.appendChild(opt);
  });

  populateRecipeList('all');
}

function populateRecipeList(tag, search) {
  recipeSelect.innerHTML = '<option value="">— Choose a recipe —</option>';
  btnLoad.disabled = true;

  const term = (search || '').toLowerCase().trim();

  let recipes = allData.recipes;

  // Filter by tag first
  if (tag !== 'all' && tag !== '') {
    recipes = recipes.filter(r =>
      r.tags && r.tags.split(',').map(t => t.trim()).includes(tag)
    );
  }

  // Then filter by search term (instring across name, tags, ingredients)
  if (term) {
    recipes = recipes.filter(r => {
      // Search recipe name
      if (r.name.toLowerCase().includes(term)) return true;
      // Search tags
      if (r.tags && r.tags.toLowerCase().includes(term)) return true;
      // Search ingredient names
      if (r.ingredients && r.ingredients.some(ing =>
        ing.ingredient && ing.ingredient.toLowerCase().includes(term)
      )) return true;
      return false;
    });
  }

  const names = recipes.map(r => r.name).sort();

  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    recipeSelect.appendChild(opt);
  });
}

// ---- Events: Home ----
tagSelect.addEventListener('change', () => {
  populateRecipeList(tagSelect.value, searchInput.value);
});

searchInput.addEventListener('input', () => {
  const hasText = searchInput.value.length > 0;
  btnClearSearch.classList.toggle('hidden', !hasText);
  if (searchInput.value !== 'Nourish Forward') {
    document.getElementById('btn-nourish').classList.remove('active');
  }
  populateRecipeList(tagSelect.value === '— Select Category —' ? 'all' : tagSelect.value, searchInput.value);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.classList.add('hidden');
  document.getElementById('btn-nourish').classList.remove('active');
  searchInput.focus();
  populateRecipeList(tagSelect.value, '');
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

document.getElementById('btn-nourish').addEventListener('click', () => {
  const btn = document.getElementById('btn-nourish');
  const active = btn.classList.toggle('active');
  if (active) {
    searchInput.value = 'Nourish Forward';
    btnClearSearch.classList.remove('hidden');
  } else {
    searchInput.value = '';
    btnClearSearch.classList.add('hidden');
  }
  populateRecipeList('all', searchInput.value);
});

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
document.getElementById('btn-print').addEventListener('click', printRecipe);
document.getElementById('btn-share-recipe').addEventListener('click', shareRecipe);
document.getElementById('btn-share-app').addEventListener('click', shareApp);

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

// ---- Share ----
async function shareApp() {
  const data = {
    title: 'Senior Family Cookbook',
    text: 'Check out our family cookbook — all our favorite recipes in one place!',
    url: 'https://dsshrek-ai.github.io/senior-family-cookbook'
  };
  if (navigator.share) {
    try { await navigator.share(data); } catch(e) { if (e.name !== 'AbortError') copyToClipboard(data.url, 'App link copied!'); }
  } else {
    copyToClipboard(data.url, 'App link copied!');
  }
}

async function shareRecipe() {
  if (!currentRecipe) return;
  const r  = currentRecipe;
  const sf = scaleFactor;
  const serving = parseFloat(document.getElementById('servings-input')?.value) || baseServings;

  let text = `🍽️ ${r.name}\n`;
  if (r.tags) text += `${r.tags}\n`;
  text += `Serves: ${serving}\n\n`;

  text += `INGREDIENTS\n`;
  (r.ingredients || []).forEach(ing => {
    let line = '';
    if (ing.quantity !== '' && ing.quantity !== null && ing.quantity !== undefined) {
      const raw = parseFloat(ing.quantity);
      if (!isNaN(raw)) line += formatQty(raw * sf) + ' ';
    }
    if (ing.unit) line += ing.unit + ' ';
    line += ing.ingredient || '';
    if (ing.notes) line += ` (${ing.notes})`;
    text += `• ${line.trim()}\n`;
  });

  text += `\nSTEPS\n`;
  (r.steps || []).forEach((step, i) => {
    text += `${i + 1}. ${step}\n`;
  });

  if (r.story && r.story.trim()) text += `\nAbout: ${r.story}\n`;

  text += `\nFrom the Senior Family Cookbook: https://dsshrek-ai.github.io/senior-family-cookbook`;

  const shareData = { title: r.name, text };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch(e) { if (e.name !== 'AbortError') copyToClipboard(text, 'Recipe copied!'); }
  } else {
    copyToClipboard(text, 'Recipe copied!');
  }
}

function copyToClipboard(text, msg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(msg);
  }).catch(() => {
    showToast('Could not copy — try long-pressing to copy.');
  });
}

function showToast(msg) {
  const existing = document.getElementById('share-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'share-toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; bottom:calc(24px + var(--safe-bottom)); left:50%; transform:translateX(-50%);
    background:#2A3E2B; color:#fff; padding:10px 20px; border-radius:24px;
    font-size:14px; font-family:var(--font-body); z-index:9999;
    box-shadow:0 4px 16px rgba(0,0,0,0.25); white-space:nowrap;
    animation: fadeInUp 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ---- Helpers ----
function buildIngText(ing, sf) {
  let html = '';

  if (ing.quantity !== '' && ing.quantity !== null && ing.quantity !== undefined) {
    const raw = parseFloat(ing.quantity);
    if (!isNaN(raw)) {
      const scaled = Math.round(raw * sf * 1000) / 1000;
      const display = formatQty(scaled);
      html += `<span class="qty">${display}</span> `;
    }
  }

  if (ing.unit && ing.unit !== 'to taste') {
    html += `<span class="unit">${escHtml(ing.unit)}</span> `;
  } else if (ing.unit === 'to taste') {
    html += `<span class="unit">to taste</span> `;
  }

  html += `<span class="ing-name">${escHtml(ing.ingredient)}</span>`;

  if (ing.notes) {
    html += ` <span class="ing-note">(${escHtml(ing.notes)})</span>`;
  }

  return html;
}

function formatQty(n) {
  if (n === Math.floor(n)) return String(n);
  // Nice fractions
  const fracs = [[0.25,'¼'],[0.33,'⅓'],[0.5,'½'],[0.67,'⅔'],[0.75,'¾']];
  const whole = Math.floor(n);
  const dec   = Math.round((n - whole) * 100) / 100;
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
