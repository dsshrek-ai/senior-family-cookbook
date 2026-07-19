/* ============================================
   NOURISH FORWARD RECIPES — App Logic
   ============================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbwnKIbezeBG1V60oOo-NvXQaWk2g8RabMiuI2BGmVXGIEnASneDFOLVLwmBe-MnKtVs/exec';
const STORAGE_KEY      = 'nfrAllRecipes';
const STORAGE_BACKUP   = 'nfrAllRecipesBackup';
const STORAGE_UPDATED  = 'nfrLastUpdated';
const STORAGE_FAVS     = 'nfrFavorites';
const STORAGE_FAV_SCALES = 'nfrFavScales';
const STORAGE_EXCL     = 'nfrExcluded';

// ---- State ----
let allData        = null;
let currentRecipe  = null;
let scaleFactor    = 1;
let baseServings   = 1;
let checkedIng     = new Set();
let checkedSteps   = new Set();
let favorites      = new Set(JSON.parse(localStorage.getItem(STORAGE_FAVS) || '[]'));
let favoritesOnly  = false;
let favScales      = JSON.parse(localStorage.getItem(STORAGE_FAV_SCALES) || '{}');
let excl           = JSON.parse(localStorage.getItem(STORAGE_EXCL) || '{}');

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
const searchInput   = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');
const btnResetFilters = document.getElementById('btn-reset-filters');

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
  updateClearFavsVisibility();
}

// ---- Print (opens a real Safari tab, not our own webview — calling
//      window.print() from inside an installed iOS PWA's own webview
//      is unreliable: it can get stuck on page 1 with an unresponsive
//      cancel button. A separate tab prints correctly and there's no
//      close/back button here to accidentally exit the app.) ----
const PRINT_STYLES = `
  body { font-family: Georgia, serif; font-size: 13px; margin: 24px 32px; color: #2c2c2c; max-width: 700px; }
  h1   { font-size: 22px; color: #2C6B4F; margin: 0 0 4px; }
  .print-meta { font-size: 12px; color: #888; margin-bottom: 16px; font-family: sans-serif; }
  .recipes-summary { font-size: 12px; color: #888; margin-bottom: 16px; font-family: sans-serif; line-height: 1.6; }
  .recipes-summary strong { color: #2C6B4F; display: block; margin-bottom: 4px; }
  .scale-note { color: #7C5CBF; font-style: italic; }
  h2   { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em;
         color: #2C6B4F; border-bottom: 2px solid #2C6B4F; padding-bottom: 3px;
         margin: 20px 0 10px; font-family: sans-serif; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  td   { padding: 5px 6px; vertical-align: top; font-size: 13px; }
  tr   { border-bottom: 1px solid #f0f0f0; }
  .qty-col  { width: 48px; text-align: right; font-weight: bold; color: #2C6B4F; white-space: nowrap; }
  .unit-col { width: 60px; color: #3A5A46; white-space: nowrap; padding-left: 6px; }
  .chk-col  { width: 22px; font-size: 16px; color: #aaa; }
  .ing-col  { font-size: 14px; }
  .note { font-size: 12px; color: #888; font-style: italic; }
  .approx { color: #7C5CBF; font-style: italic; margin-right: 1px; }
  .approx-note { font-size: 11px; color: #7C5CBF; margin-top: 16px; font-family: sans-serif; }
  .dept-row td { background: #e8f2ec; color: #2C6B4F; font-weight: bold; font-family: sans-serif;
                 font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
                 padding: 10px 4px 3px; border-bottom: 2px solid #2C6B4F; }
  ol   { padding-left: 20px; }
  li   { margin-bottom: 6px; line-height: 1.5; }
  .story { background: #F2F8F5; border-left: 3px solid #A480D9; padding: 10px 14px;
           margin-top: 16px; font-size: 12px; line-height: 1.6; color: #3A5A46; border-radius: 4px; }
  .recipe-block { page-break-after: always; padding-bottom: 24px; }
  .recipe-block:last-child { page-break-after: avoid; }
  .print-tip { font-size: 13px; color: #3A5A46; background: #F2F8F5; border-radius: 8px;
               padding: 10px 14px; margin-bottom: 20px; font-family: sans-serif; }
  @media print { .print-tip { display: none; } }
`;

function openPrintWindow(title, bodyHtml) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
  <p class="print-tip">🖨 Tap the Share icon, then choose <strong>Print</strong>. When you're done, switch back to Nourish Forward Recipes from your Home Screen or the App Switcher.</p>
  ${bodyHtml}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to print'); return; }
  win.document.write(html);
  win.document.close();
}

// ---- Print Recipe ----
function printRecipe() {
  if (!currentRecipe) return;
  const r       = currentRecipe;
  const serving = parseFloat(document.getElementById('servings-input')?.value) || baseServings;
  const sf      = serving / baseServings;
  const scaled  = Math.round(serving * 10) / 10;

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

  let stepsList = '';
  (r.steps || []).forEach(step => {
    stepsList += `<li>${step}</li>`;
  });

  const storyBlock = r.story ? `<div class="story"><strong>About this recipe:</strong><br>${r.story}</div>` : '';
  const nutriBlock = r.nutrition ? `<div class="story"><strong>Nutrition:</strong><br>${r.nutrition}</div>` : '';
  const scaleNote  = sf !== 1 ? ` <span class="scale-note">(scaled to ${scaled} servings)</span>` : '';

  const html = `
    <h1>${r.name}</h1>
    <div class="print-meta">Base: ${baseServings} servings${scaleNote} · Nourish Forward Recipes</div>
    ${storyBlock}
    <h2>Ingredients</h2>
    <table>${ingRows}</table>
    <h2>Steps</h2>
    <ol>${stepsList}</ol>
    ${nutriBlock}
  `;

  openPrintWindow(r.name, html);
}

function printShoppingList() {
  if (!currentRecipe) return;
  const r       = currentRecipe;
  const serving = parseFloat(document.getElementById('servings-input')?.value) || baseServings;
  const sf      = serving / baseServings;
  const scaleNote = sf !== 1 ? ` — scaled to ${Math.round(serving * 10) / 10} servings` : ` — ${baseServings} servings`;

  let rows = '';
  (r.ingredients || []).forEach(ing => {
    let qty = '';
    if (ing.quantity !== '' && ing.quantity !== null && ing.quantity !== undefined) {
      const raw = parseFloat(ing.quantity);
      if (!isNaN(raw)) qty = formatQty(raw * sf);
    }
    rows += `<tr>
      <td class="chk-col">☐</td>
      <td class="qty-col">${qty}</td>
      <td class="unit-col">${ing.unit || ''}</td>
      <td>${ing.ingredient || ''}${ing.notes ? ` <span class="note">(${ing.notes})</span>` : ''}</td>
    </tr>`;
  });

  const html = `
    <h1>Shopping List — ${r.name}</h1>
    <div class="print-meta">Nourish Forward Recipes${scaleNote}</div>
    <table>${rows}</table>
  `;

  openPrintWindow(`Shopping List — ${r.name}`, html);
}

function printAllFavorites() {
  if (favorites.size === 0) { showToast('No favorites saved'); return; }

  const favRecipes = [...favorites]
    .map(name => allData.recipes.find(r => r.name === name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  let recipesHtml = '';
  favRecipes.forEach(r => {
    let ingRows = '';
    (r.ingredients || []).forEach(ing => {
      const qty = ing.quantity !== '' && ing.quantity !== null ? formatQty(parseFloat(ing.quantity) || 0) : '';
      ingRows += `<tr>
        <td class="qty-col">${qty}</td>
        <td class="unit-col">${ing.unit || ''}</td>
        <td>${ing.ingredient || ''}${ing.notes ? ` <em>(${ing.notes})</em>` : ''}</td>
      </tr>`;
    });
    const stepsList = (r.steps || []).map(s => `<li>${s}</li>`).join('');
    const storyBlock = r.story ? `<div class="story"><strong>About:</strong> ${r.story}</div>` : '';

    recipesHtml += `<div class="recipe-block">
      <h1>${r.name}</h1>
      <div class="print-meta">${r.baseServings} servings · Nourish Forward Recipes</div>
      ${storyBlock}
      <h2>Ingredients</h2>
      <table>${ingRows}</table>
      <h2>Steps</h2>
      <ol>${stepsList}</ol>
    </div>`;
  });

  const html = `
    <div class="print-meta">${favRecipes.length} favorite recipe${favRecipes.length !== 1 ? 's' : ''} · Nourish Forward Recipes</div>
    ${recipesHtml}
  `;

  openPrintWindow('Favorite Recipes', html);
}

// ---- Grocery Departments ----
const DEPT_ORDER = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread',
  'Baking', 'Dry Goods & Pasta', 'Canned & Jarred',
  'Spices & Seasonings', 'Oils & Condiments', 'Frozen', 'Other'
];
const DEPT_KEYWORDS = {
  'Produce': ['onion','garlic','tomato','pepper','carrot','celery','potato','lettuce',
    'spinach','kale','mushroom','lemon','lime','orange','apple','banana','cucumber',
    'zucchini','squash','corn','green bean','pea','broccoli','cauliflower','asparagus',
    'beet','radish','scallion','shallot','chive','parsley','cilantro','basil','mint',
    'thyme','rosemary','sage','dill','ginger','jalapeño','jalapeno','avocado',
    'cabbage','artichoke','eggplant','fennel','leek','arugula','chard','collard',
    'turnip','parsnip','yam','sweet potato','pumpkin','butternut','acorn','spaghetti squash',
    'pear','peach','plum','cherry','grape','melon','watermelon','mango','papaya',
    'pineapple','kiwi','fig','pomegranate','cranberry','blueberry','strawberry',
    'raspberry','blackberry','rhubarb','berry','berries','fresh herb','scallion','bok choy'],
  'Meat & Seafood': ['chicken','beef','pork','turkey','lamb','fish','salmon','tuna',
    'shrimp','crab','lobster','sausage','bacon','ham','steak','roast','veal','duck',
    'venison','anchovy','clam','mussel','scallop','tilapia','cod','halibut','flounder',
    'meatball','brisket','ribs','tenderloin','sirloin','chuck','filet','fillet',
    'prosciutto','pancetta','pepperoni','salami','chorizo','kielbasa','ground beef',
    'ground turkey','ground pork','ground lamb','ground chicken','hot dog','bratwurst'],
  'Dairy & Eggs': ['milk','cream','butter','cheese','yogurt','egg','sour cream',
    'cottage cheese','ricotta','mozzarella','parmesan','cheddar','cream cheese',
    'half-and-half','half and half','whipping cream','heavy cream','buttermilk',
    'kefir','ghee','brie','feta','gouda','swiss','gruyere','provolone','mascarpone',
    'colby','monterey jack','goat cheese','queso','creme fraiche'],
  'Bakery & Bread': ['bread','roll','baguette','pita','tortilla','wrap','bun',
    'croissant','bagel','english muffin','crumpet','naan','flatbread','lavash',
    'sourdough','ciabatta','focaccia','challah'],
  'Baking': ['flour','sugar','baking powder','baking soda','yeast','cocoa powder',
    'chocolate chip','vanilla','cornstarch','corn starch','powdered sugar',
    'confectioner','brown sugar','molasses','honey','maple syrup','shortening','lard',
    'almond flour','bread flour','cake flour','whole wheat flour','oat flour',
    'tapioca','arrowroot','gelatin','pectin','extract','food coloring','sprinkle',
    'cocoa','dark chocolate','white chocolate','bittersweet','semisweet','meringue',
    'cream of tartar','active dry','instant yeast'],
  'Dry Goods & Pasta': ['pasta','spaghetti','penne','fettuccine','linguine','rigatoni',
    'farfalle','orzo','lasagna','noodle','rice','oat','oatmeal','cereal','quinoa',
    'barley','farro','bulgur','couscous','lentil','bean','chickpea','black bean',
    'kidney bean','pinto bean','navy bean','white bean','bread crumb','panko',
    'cracker','broth','stock','ramen','udon','soba','rice noodle','vermicelli',
    'polenta','grits','cornmeal','millet','buckwheat','spelt','wild rice','brown rice',
    'jasmine rice','basmati','arborio','fregola','macaroni','rotini','ziti','cavatappi'],
  'Canned & Jarred': ['tomato sauce','tomato paste','diced tomato','crushed tomato',
    'canned','salsa','pickle','olive','jam','jelly','peanut butter','almond butter',
    'tahini','coconut milk','coconut cream','roasted pepper','sun-dried','artichoke heart',
    'chili','soup','applesauce','fruit preserves','caramel sauce','hot fudge'],
  'Spices & Seasonings': ['salt','pepper','cumin','paprika','cinnamon','oregano',
    'coriander','turmeric','cayenne','chili powder','garlic powder','onion powder',
    'bay leaf','nutmeg','clove','cardamom','curry','allspice','anise','caraway',
    'celery seed','fennel seed','fenugreek','lemongrass','mace','marjoram',
    'mustard seed','saffron','star anise','sumac','tarragon','herbes de provence',
    'italian seasoning','old bay','cajun','creole','dried basil','dried oregano',
    'dried thyme','dried rosemary','dried parsley','red pepper flake','chili flake',
    'smoked paprika','seasoning','spice',"za'atar"],
  'Oils & Condiments': ['olive oil','vegetable oil','canola oil','sesame oil',
    'coconut oil','avocado oil','peanut oil','grapeseed oil','vinegar','balsamic',
    'apple cider vinegar','rice vinegar','wine vinegar','soy sauce','tamari',
    'worcestershire','hot sauce','ketchup','mustard','mayo','mayonnaise','dressing',
    'relish','capers','fish sauce','oyster sauce','hoisin','teriyaki','sriracha',
    'miso','cooking spray','nonstick',' oil'],
  'Frozen': ['frozen','ice cream','sorbet','popsicle'],
};

function getDept(ingredientName) {
  const name = ingredientName.toLowerCase();
  for (const dept of DEPT_ORDER) {
    if (dept === 'Other') break;
    const keywords = DEPT_KEYWORDS[dept] || [];
    if (keywords.some(kw => name.includes(kw))) return dept;
  }
  return 'Other';
}

// ---- Unit Conversion ----
const UNIT_SYNONYMS = {
  'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp', 't': 'tsp',
  'tbsp': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'tbs': 'tbsp', 'tbl': 'tbsp', 'T': 'tbsp',
  'fl oz': 'fl oz', 'fluid oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  'cup': 'cup', 'cups': 'cup', 'c': 'cup',
  'pint': 'pint', 'pints': 'pint', 'pt': 'pint',
  'quart': 'quart', 'quarts': 'quart', 'qt': 'quart',
  'gallon': 'gallon', 'gallons': 'gallon', 'gal': 'gallon',
  'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
  'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
};
const VOL_TO_TSP = { 'tsp': 1, 'tbsp': 3, 'fl oz': 6, 'cup': 48, 'pint': 96, 'quart': 192, 'gallon': 768 };
const WT_TO_OZ   = { 'oz': 1, 'lb': 16 };
const OZ_TO_TSP  = 6;

function normalizeUnit(unit) {
  const u = (unit || '').trim();
  return UNIT_SYNONYMS[u] || UNIT_SYNONYMS[u.toLowerCase()] || u.toLowerCase();
}

function tspToReadable(tsp) {
  if (tsp >= 192) return { qty: tsp / 192, unit: 'quart' };
  if (tsp >= 48)  return { qty: tsp / 48,  unit: 'cup' };
  if (tsp >= 3)   return { qty: tsp / 3,   unit: 'tbsp' };
  return { qty: tsp, unit: 'tsp' };
}

function ozToReadable(oz) {
  if (oz >= 16) return { qty: oz / 16, unit: 'lb' };
  return { qty: oz, unit: 'oz' };
}

function combineIngredients(recipes) {
  const groups = {};

  recipes.forEach(r => {
    const storedServings = favScales[r.name] || r.baseServings || 1;
    const sf = storedServings / (r.baseServings || 1);
    const exclSet = new Set(excl[r.name] || []);

    (r.ingredients || []).forEach((ing, idx) => {
      if (exclSet.has(idx)) return;
      const rawName = (ing.ingredient || '').trim();
      if (!rawName) return;
      const key = rawName.toLowerCase();
      if (!groups[key]) groups[key] = { name: rawName, entries: [] };

      const rawQty = parseFloat(ing.quantity);
      const unit   = normalizeUnit(ing.unit);
      groups[key].entries.push({
        qty:   isNaN(rawQty) || ing.quantity === '' || ing.quantity === null ? null : rawQty * sf,
        unit,
        notes: ing.notes || ''
      });
    });
  });

  const result = [];

  Object.values(groups).forEach(g => {
    const withQty    = g.entries.filter(e => e.qty !== null);
    const withoutQty = g.entries.filter(e => e.qty === null);
    const dept = getDept(g.name);

    if (withQty.length === 0) {
      result.push({ name: g.name, display: '', unit: withoutQty[0]?.unit || '', approx: false, dept });
      return;
    }

    const volEntries   = withQty.filter(e => VOL_TO_TSP[e.unit] !== undefined);
    const wtEntries    = withQty.filter(e => WT_TO_OZ[e.unit]   !== undefined);
    const otherEntries = withQty.filter(e => !VOL_TO_TSP[e.unit] && !WT_TO_OZ[e.unit]);

    const pushResult = (qty, unit, approx) => result.push({ name: g.name, qty, unit, approx, dept });

    if (volEntries.length > 0 && wtEntries.length === 0 && otherEntries.length === 0) {
      const totalTsp = volEntries.reduce((s, e) => s + e.qty * VOL_TO_TSP[e.unit], 0);
      const { qty, unit } = tspToReadable(totalTsp);
      pushResult(qty, unit, false);
    } else if (wtEntries.length > 0 && volEntries.length === 0 && otherEntries.length === 0) {
      const totalOz = wtEntries.reduce((s, e) => s + e.qty * WT_TO_OZ[e.unit], 0);
      const { qty, unit } = ozToReadable(totalOz);
      pushResult(qty, unit, false);
    } else if ((volEntries.length > 0 || wtEntries.length > 0) && otherEntries.length === 0) {
      const totalTsp = volEntries.reduce((s, e) => s + e.qty * VOL_TO_TSP[e.unit], 0)
                     + wtEntries.reduce((s, e)  => s + e.qty * WT_TO_OZ[e.unit] * OZ_TO_TSP, 0);
      const { qty, unit } = tspToReadable(totalTsp);
      pushResult(qty, unit, true);
    } else {
      const byUnit = {};
      withQty.forEach(e => { byUnit[e.unit] = (byUnit[e.unit] || 0) + e.qty; });
      Object.entries(byUnit).forEach(([unit, qty]) => pushResult(qty, unit, false));
    }
  });

  return result.sort((a, b) => {
    const di = DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept);
    return di !== 0 ? di : a.name.localeCompare(b.name);
  });
}

function printCombinedShoppingList() {
  if (favorites.size === 0) { showToast('No favorites saved'); return; }

  const favRecipes = [...favorites]
    .map(name => allData.recipes.find(r => r.name === name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const combined = combineIngredients(favRecipes);

  const recipeSummary = favRecipes.map(r => {
    const servings = favScales[r.name] || r.baseServings;
    return `${r.name} (${servings} servings)`;
  }).join('<br>');

  let rows = '';
  let lastDept = null;
  combined.forEach(item => {
    if (item.dept !== lastDept) {
      rows += `<tr class="dept-row"><td colspan="4">${item.dept}</td></tr>`;
      lastDept = item.dept;
    }
    const qtyStr = item.qty !== undefined ? formatQty(Math.round(item.qty * 100) / 100) : '';
    const approxMark = item.approx ? '<span class="approx">~</span>' : '';
    rows += `<tr>
      <td class="chk-col">☐</td>
      <td class="qty-col">${approxMark}${qtyStr}</td>
      <td class="unit-col">${item.unit || ''}</td>
      <td class="ing-col">${item.name}</td>
    </tr>`;
  });

  const html = `
    <h1>Combined Shopping List</h1>
    <div class="recipes-summary"><strong>Recipes included:</strong>${recipeSummary}</div>
    <table>${rows}</table>
    <p class="approx-note">~ Quantity is approximate (volume + weight combined)<br>Checked-off ingredients are excluded from this list.</p>
  `;

  openPrintWindow('Combined Shopping List', html);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
  rebuildCategoryFilter(allData.recipes);
  populateRecipeList('all');
}

function rebuildCategoryFilter(recipes) {
  const tagSet = new Set();
  recipes.forEach(r => {
    if (r.tags) r.tags.split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed) tagSet.add(trimmed);
    });
  });
  tagSelect.innerHTML = '<option value="all">— Select Category —</option>';
  [...tagSet].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    tagSelect.appendChild(opt);
  });
}

function populateRecipeList(tag, search) {
  recipeSelect.innerHTML = '<option value="">— Choose a recipe —</option>';
  btnLoad.disabled = true;

  const term = (search || '').toLowerCase().trim();
  let recipes = allData.recipes;

  if (tag !== 'all' && tag !== '') {
    recipes = recipes.filter(r =>
      r.tags && r.tags.split(',').map(t => t.trim()).includes(tag)
    );
  }

  if (favoritesOnly) {
    recipes = recipes.filter(r => favorites.has(r.name));
  }

  if (term) {
    recipes = recipes.filter(r => {
      if (r.name.toLowerCase().includes(term)) return true;
      if (r.tags && r.tags.toLowerCase().includes(term)) return true;
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

  updateResetFiltersVisibility();
}

function updateResetFiltersVisibility() {
  const filtersActive = (tagSelect.value !== 'all' && tagSelect.value !== '')
    || searchInput.value.length > 0
    || favoritesOnly;
  btnResetFilters.classList.toggle('hidden', !filtersActive);
}

// ---- Events: Home ----
tagSelect.addEventListener('change', () => {
  populateRecipeList(tagSelect.value, searchInput.value);
});

searchInput.addEventListener('input', () => {
  const hasText = searchInput.value.length > 0;
  btnClearSearch.classList.toggle('hidden', !hasText);
  populateRecipeList(tagSelect.value === '— Select Category —' ? 'all' : tagSelect.value, searchInput.value);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.classList.add('hidden');
  rebuildCategoryFilter(allData.recipes);
  tagSelect.value = 'all';
  searchInput.focus();
  populateRecipeList('all', '');
});

btnResetFilters.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.classList.add('hidden');
  rebuildCategoryFilter(allData.recipes);
  tagSelect.value = 'all';
  favoritesOnly = false;
  document.getElementById('btn-favs').classList.remove('active');
  populateRecipeList('all', '');
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
document.getElementById('btn-print').addEventListener('click', printRecipe);
document.getElementById('btn-print-shopping').addEventListener('click', printShoppingList);
document.getElementById('btn-share-recipe').addEventListener('click', shareRecipe);
document.getElementById('btn-share-app').addEventListener('click', shareApp);
document.getElementById('btn-favorite').addEventListener('click', toggleFavorite);
document.getElementById('btn-print-favs').addEventListener('click', printAllFavorites);
document.getElementById('btn-combined-shopping').addEventListener('click', printCombinedShoppingList);

document.getElementById('btn-favs').addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  document.getElementById('btn-favs').classList.toggle('active', favoritesOnly);
  populateRecipeList(tagSelect.value, searchInput.value);
});

document.getElementById('btn-clear-favs').addEventListener('click', () => {
  favorites.clear();
  favScales = {};
  localStorage.setItem(STORAGE_FAVS, '[]');
  localStorage.setItem(STORAGE_FAV_SCALES, '{}');
  favoritesOnly = false;
  document.getElementById('btn-favs').classList.remove('active');
  updateClearFavsVisibility();
  populateRecipeList(tagSelect.value, searchInput.value);
  showToast('Favorites cleared');
});

// ---- Recipe Screen ----
function openRecipe(recipe) {
  currentRecipe  = recipe;
  baseServings   = recipe.baseServings || 4;
  scaleFactor    = 1;
  checkedIng     = new Set(excl[recipe.name] || []);
  checkedSteps   = new Set();

  renderRecipe();
  updateHeartIcon();

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

  html += `<div class="recipe-hero">`;
  html += `<h1 class="recipe-name">${escHtml(r.name)}</h1>`;

  if (r.tags) {
    const tags = r.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length) {
      html += `<div class="recipe-tags">`;
      tags.forEach(tag => { html += `<span class="tag-pill">${escHtml(tag)}</span>`; });
      html += `</div>`;
    }
  }

  html += `<div class="servings-card">
    <span class="servings-base">Base: ${baseServings}</span>
    <div class="servings-input-group">
      <span class="servings-label">Make:</span>
      <input type="number" class="servings-input" id="servings-input"
             value="${baseServings}" min="1" inputmode="numeric">
      <button class="btn-scale" id="btn-scale">Go</button>
      <span class="scale-factor" id="scale-label">(1×)</span>
    </div>
  </div>
  <div id="saved-serving-row" class="saved-serving-row hidden">
    🛒 Shopping list: <strong id="saved-serving-val"></strong> servings &nbsp;·&nbsp; <em>tap Go to update</em>
  </div>`;
  html += `</div>`;

  html += `<div class="recipe-body">`;

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

  if (r.story && r.story.trim()) {
    html += `<div class="section">
      <div class="section-header story-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        <h2>About This Recipe</h2>
      </div>
      <div class="prose-section"><p>${escHtml(r.story)}</p></div>
    </div>`;
  }

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
  html += `</div>`;

  recipeContent.innerHTML = html;

  document.querySelectorAll('[data-ing]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.ing);
      if (checkedIng.has(i)) checkedIng.delete(i);
      else checkedIng.add(i);
      el.classList.toggle('checked', checkedIng.has(i));
      if (checkedIng.size > 0) {
        excl[currentRecipe.name] = [...checkedIng];
      } else {
        delete excl[currentRecipe.name];
      }
      localStorage.setItem(STORAGE_EXCL, JSON.stringify(excl));
    });
  });

  document.querySelectorAll('[data-step]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.step);
      if (checkedSteps.has(i)) checkedSteps.delete(i);
      else checkedSteps.add(i);
      el.classList.toggle('checked', checkedSteps.has(i));
    });
  });

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

  document.querySelectorAll('[data-ing]').forEach(el => {
    const i    = parseInt(el.dataset.ing);
    const ing  = currentRecipe.ingredients[i];
    const span = el.querySelector('.item-text');
    span.innerHTML = buildIngText(ing, scaleFactor);
  });

  if (currentRecipe && favorites.has(currentRecipe.name)) {
    favScales[currentRecipe.name] = desired;
    localStorage.setItem(STORAGE_FAV_SCALES, JSON.stringify(favScales));
    updateSavedServingLabel();
    showToast(`Shopping list updated to ${desired} servings`);
  }
}

// ---- Favorites ----
function toggleFavorite() {
  if (!currentRecipe) return;
  const name = currentRecipe.name;
  if (favorites.has(name)) {
    favorites.delete(name);
    delete favScales[name];
    showToast('Removed from favorites');
  } else {
    favorites.add(name);
    const serving = parseFloat(document.getElementById('servings-input')?.value) || baseServings;
    favScales[name] = serving;
    showToast('Added to favorites ♥');
  }
  localStorage.setItem(STORAGE_FAVS, JSON.stringify([...favorites]));
  localStorage.setItem(STORAGE_FAV_SCALES, JSON.stringify(favScales));
  updateHeartIcon();
  updateClearFavsVisibility();
}

function updateClearFavsVisibility() {
  document.getElementById('clear-favs-section').classList.toggle('hidden', favorites.size === 0);
}

function updateHeartIcon() {
  const btn   = document.getElementById('btn-favorite');
  const isFav = currentRecipe && favorites.has(currentRecipe.name);
  btn.style.color = isFav ? '#e05555' : '';
  document.getElementById('icon-heart').setAttribute('fill', isFav ? 'currentColor' : 'none');
  updateSavedServingLabel();
}

function updateSavedServingLabel() {
  const row = document.getElementById('saved-serving-row');
  if (!row) return;
  const isFav = currentRecipe && favorites.has(currentRecipe.name);
  if (isFav) {
    const saved = favScales[currentRecipe.name] || baseServings;
    document.getElementById('saved-serving-val').textContent = saved;
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
  }
}

// ---- Share ----
async function shareApp() {
  const data = {
    title: 'Nourish Forward Recipes',
    text: 'Check out Nourish Forward Recipes — healthy recipes at your fingertips!',
    url: 'https://dsshrek-ai.github.io/senior-family-cookbook/nourish-forward'
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

  let text = `🌿 ${r.name}\n`;
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
  (r.steps || []).forEach((step, i) => { text += `${i + 1}. ${step}\n`; });
  if (r.story && r.story.trim()) text += `\nAbout: ${r.story}\n`;
  text += `\nFrom Nourish Forward Recipes: https://dsshrek-ai.github.io/senior-family-cookbook/nourish-forward`;

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
    background:#1A4535; color:#fff; padding:10px 20px; border-radius:24px;
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
      html += `<span class="qty">${formatQty(Math.round(raw * sf * 1000) / 1000)}</span> `;
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
  const fracs = [[0.25,'¼'],[0.33,'⅓'],[0.5,'½'],[0.67,'⅔'],[0.75,'¾']];
  const whole = Math.floor(n);
  const dec   = Math.round((n - whole) * 100) / 100;
  for (const [val, sym] of fracs) {
    if (Math.abs(dec - val) < 0.04) return whole > 0 ? `${whole}${sym}` : sym;
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

function showLoading(show) { loadingOverlay.classList.toggle('hidden', !show); }
function showStatus(msg)   { statusBar.textContent = msg; statusBar.classList.remove('hidden'); }
function hideStatus()      { statusBar.classList.add('hidden'); }
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
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const banner = document.createElement('div');
    banner.className = 'install-prompt';
    banner.innerHTML = `
      <p>Add <strong>Nourish Forward Recipes</strong> to your home screen</p>
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
