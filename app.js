/* ============================================
   SENIOR FAMILY COOKBOOK — App Logic
   ============================================ */

const API_URL    = 'https://seniorfamily.org/api/api.php';
const COLLECTION = 'senior-family';
const APP_KEY    = 'senior-family-cookbook'; // My Apps Hub app_key for app_access/can_edit lookups
const STORAGE_KEY      = 'sfcAllRecipes';
const STORAGE_BACKUP   = 'sfcAllRecipesBackup';
const STORAGE_UPDATED  = 'sfcLastUpdated';
const STORAGE_FAVS     = 'sfcFavorites';
const STORAGE_FAV_SCALES = 'sfcFavScales';
const STORAGE_EXCL     = 'sfcExcluded';
const STORAGE_AUTH_TOKEN    = 'sfcAuthToken';
const STORAGE_AUTH_NAME     = 'sfcAuthName';
const STORAGE_AUTH_CAN_EDIT = 'sfcAuthCanEdit';
const STORAGE_SHOPPING_LIST = 'sfcShoppingList';

// ---- State ----
let allData        = null;   // { recipeList, recipes }
let currentRecipe  = null;
let scaleFactor    = 1;
let baseServings   = 1;
let checkedIng     = new Set();
let checkedSteps   = new Set();
let favorites      = new Set(JSON.parse(localStorage.getItem(STORAGE_FAVS) || '[]'));
let favoritesOnly  = false;
let favScales      = JSON.parse(localStorage.getItem(STORAGE_FAV_SCALES) || '{}');
let excl           = JSON.parse(localStorage.getItem(STORAGE_EXCL) || '{}');
let authToken   = localStorage.getItem(STORAGE_AUTH_TOKEN) || null;
let authName    = localStorage.getItem(STORAGE_AUTH_NAME) || null;
let authCanEdit = localStorage.getItem(STORAGE_AUTH_CAN_EDIT) === 'true';
let editingRecipeId = null; // null while adding a new recipe; set to an id while editing
let shoppingList    = []; // current editable list: [{ name, qty, unit, dept, deptManual, checked }]
let shoppingMode    = false; // false = edit mode, true = check-off shopping mode

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
const btnAccount     = document.getElementById('btn-account');
const btnAddRecipe   = document.getElementById('btn-add-recipe');
const btnEditRecipe  = document.getElementById('btn-edit-recipe');
const btnDeleteRecipe = document.getElementById('btn-delete-recipe');
const screenLogin    = document.getElementById('screen-login');
const screenEdit     = document.getElementById('screen-edit');
const screenShoppingList = document.getElementById('screen-shopping-list');

// ---- Init ----
window.addEventListener('load', init);

async function init() {
  registerSW();

  // Single sign-on: My Apps Hub launches this app with ?token=... when the
  // visitor is already logged in there, so this skips the login screen.
  // canEdit starts false (fail closed) until whoAmI confirms it, so the
  // Add Recipe/Edit/Delete buttons never flash on before we know for sure.
  const ssoToken = new URLSearchParams(window.location.search).get('token');
  if (ssoToken) {
    authToken = ssoToken;
    authName = null;
    authCanEdit = false;
    localStorage.setItem(STORAGE_AUTH_TOKEN, authToken);
    localStorage.removeItem(STORAGE_AUTH_NAME);
    localStorage.removeItem(STORAGE_AUTH_CAN_EDIT);
    window.history.replaceState({}, document.title, window.location.pathname);
    fetch(`${API_URL}?action=whoAmI&appKey=${APP_KEY}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }).then(res => res.json()).then(data => {
      if (!data.error) {
        authName = data.displayName;
        authCanEdit = !!data.canEdit;
        localStorage.setItem(STORAGE_AUTH_NAME, authName);
        localStorage.setItem(STORAGE_AUTH_CAN_EDIT, String(authCanEdit));
        updateAuthUI();
      }
    }).catch(() => {});
  }

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
  updateAuthUI();
}

// ---- Print (opens a real Safari tab, not our own webview — calling
//      window.print() from inside an installed iOS PWA's own webview
//      is unreliable: it can get stuck on page 1 with an unresponsive
//      cancel button. A separate tab prints correctly and there's no
//      close/back button here to accidentally exit the app.) ----
const PRINT_STYLES = `
  body { font-family: Georgia, serif; font-size: 13px; margin: 24px 32px; color: #2c2c2c; max-width: 700px; }
  h1   { font-size: 22px; color: #3D5A3E; margin: 0 0 4px; }
  .print-meta { font-size: 12px; color: #888; margin-bottom: 16px; font-family: sans-serif; }
  .recipes-summary { font-size: 12px; color: #888; margin-bottom: 16px; font-family: sans-serif; line-height: 1.6; }
  .recipes-summary strong { color: #3D5A3E; display: block; margin-bottom: 4px; }
  .scale-note { color: #8B6914; font-style: italic; }
  h2   { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em;
         color: #3D5A3E; border-bottom: 2px solid #3D5A3E; padding-bottom: 3px;
         margin: 20px 0 10px; font-family: sans-serif; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  td   { padding: 5px 6px; vertical-align: top; font-size: 13px; }
  tr   { border-bottom: 1px solid #f0f0f0; }
  .qty-col  { width: 48px; text-align: right; font-weight: bold; color: #3D5A3E; white-space: nowrap; }
  .unit-col { width: 60px; color: #6B5B45; white-space: nowrap; padding-left: 6px; }
  .chk-col  { width: 22px; font-size: 16px; color: #aaa; }
  .ing-col  { font-size: 14px; }
  .note { font-size: 12px; color: #888; font-style: italic; }
  .approx { color: #8B6914; font-style: italic; margin-right: 1px; }
  .approx-note { font-size: 11px; color: #8B6914; margin-top: 16px; font-family: sans-serif; }
  .dept-row td { background: #f0f4f0; color: #3D5A3E; font-weight: bold; font-family: sans-serif;
                 font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
                 padding: 10px 4px 3px; border-bottom: 2px solid #3D5A3E; }
  ol   { padding-left: 20px; }
  li   { margin-bottom: 6px; line-height: 1.5; }
  .story { background: #F5F0E8; border-left: 3px solid #C4A35A; padding: 10px 14px;
           margin-top: 16px; font-size: 12px; line-height: 1.6; color: #5A4A35; border-radius: 4px; }
  .recipe-block { page-break-after: always; padding-bottom: 24px; }
  .recipe-block:last-child { page-break-after: avoid; }
  .print-tip { font-size: 13px; color: #5A4A35; background: #F5F0E8; border-radius: 8px;
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
  <p class="print-tip">🖨 Tap the Share icon, then choose <strong>Print</strong>. When you're done, switch back to Senior Family Cookbook from your Home Screen or the App Switcher.</p>
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
    <div class="print-meta">Base: ${baseServings} servings${scaleNote} · Senior Family Cookbook</div>
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
    <div class="print-meta">Senior Family Cookbook${scaleNote}</div>
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
      <div class="print-meta">${r.baseServings} servings · Senior Family Cookbook</div>
      ${storyBlock}
      <h2>Ingredients</h2>
      <table>${ingRows}</table>
      <h2>Steps</h2>
      <ol>${stepsList}</ol>
    </div>`;
  });

  const html = `
    <div class="print-meta">${favRecipes.length} favorite recipe${favRecipes.length !== 1 ? 's' : ''} · Senior Family Cookbook</div>
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
    'smoked paprika','seasoning','spice','za\'atar'],
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
const OZ_TO_TSP  = 6; // pint=pound bridge: 1 pint(96 tsp) ≈ 1 lb(16 oz) → 1 oz ≈ 6 tsp

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
      if (exclSet.has(idx)) return; // user checked this off
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

    // Group entries by unit type
    const volEntries   = withQty.filter(e => VOL_TO_TSP[e.unit] !== undefined);
    const wtEntries    = withQty.filter(e => WT_TO_OZ[e.unit]   !== undefined);
    const otherEntries = withQty.filter(e => !VOL_TO_TSP[e.unit] && !WT_TO_OZ[e.unit]);

    const pushResult = (qty, unit, approx) => result.push({ name: g.name, qty, unit, approx, dept });

    // Combine volume entries
    if (volEntries.length > 0 && wtEntries.length === 0 && otherEntries.length === 0) {
      const totalTsp = volEntries.reduce((s, e) => s + e.qty * VOL_TO_TSP[e.unit], 0);
      const { qty, unit } = tspToReadable(totalTsp);
      pushResult(qty, unit, false);

    // Combine weight entries
    } else if (wtEntries.length > 0 && volEntries.length === 0 && otherEntries.length === 0) {
      const totalOz = wtEntries.reduce((s, e) => s + e.qty * WT_TO_OZ[e.unit], 0);
      const { qty, unit } = ozToReadable(totalOz);
      pushResult(qty, unit, false);

    // Mixed volume + weight — use pint=pound bridge
    } else if ((volEntries.length > 0 || wtEntries.length > 0) && otherEntries.length === 0) {
      const totalTsp = volEntries.reduce((s, e) => s + e.qty * VOL_TO_TSP[e.unit], 0)
                     + wtEntries.reduce((s, e)  => s + e.qty * WT_TO_OZ[e.unit] * OZ_TO_TSP, 0);
      const { qty, unit } = tspToReadable(totalTsp);
      pushResult(qty, unit, true); // ~ approximate

    // Other units — group by unit and sum within each
    } else {
      const byUnit = {};
      withQty.forEach(e => {
        byUnit[e.unit] = (byUnit[e.unit] || 0) + e.qty;
      });
      Object.entries(byUnit).forEach(([unit, qty]) => pushResult(qty, unit, false));
    }
  });

  return result.sort((a, b) => {
    const di = DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept);
    return di !== 0 ? di : a.name.localeCompare(b.name);
  });
}

function currentFavRecipes() {
  return [...favorites]
    .map(name => allData.recipes.find(r => r.name === name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildFreshShoppingList() {
  const combined = combineIngredients(currentFavRecipes());
  return combined.map(item => ({
    name: item.name,
    qty: item.qty !== undefined ? Math.round(item.qty * 100) / 100 : '',
    unit: item.unit || '',
    dept: item.dept || 'Other',
    deptManual: false,
    checked: false
  }));
}

function saveShoppingList() {
  localStorage.setItem(STORAGE_SHOPPING_LIST, JSON.stringify(shoppingList));
}

function openShoppingListScreen() {
  if (favorites.size === 0) { showToast('No favorites saved'); return; }

  const stored = localStorage.getItem(STORAGE_SHOPPING_LIST);
  if (stored) {
    try {
      shoppingList = JSON.parse(stored);
    } catch (e) {
      shoppingList = buildFreshShoppingList();
    }
  } else {
    shoppingList = buildFreshShoppingList();
  }
  saveShoppingList();

  exitShoppingMode(); // always open into edit mode, with the right buttons visible
  screenShoppingList.classList.add('active');
}

function closeShoppingListScreen() {
  screenShoppingList.classList.remove('active');
}

function enterShoppingMode() {
  shoppingMode = true;
  document.getElementById('btn-start-shopping').classList.add('hidden');
  document.getElementById('btn-shopping-list-reset').classList.add('hidden');
  document.getElementById('btn-add-shopping-item').classList.add('hidden');
  document.getElementById('btn-back-to-edit').classList.remove('hidden');
  renderShoppingListScreen();
}

function exitShoppingMode() {
  shoppingMode = false;
  document.getElementById('btn-start-shopping').classList.remove('hidden');
  document.getElementById('btn-shopping-list-reset').classList.remove('hidden');
  document.getElementById('btn-add-shopping-item').classList.remove('hidden');
  document.getElementById('btn-back-to-edit').classList.add('hidden');
  renderShoppingListScreen();
}

function resetShoppingListToAutoCombined() {
  if (!confirm('Discard your edits and rebuild the list from your current favorites?')) return;
  shoppingList = buildFreshShoppingList();
  saveShoppingList();
  renderShoppingListScreen();
  showToast('Shopping list reset');
}

function addShoppingListItem() {
  shoppingList.push({ name: '', qty: '', unit: '', dept: 'Other', deptManual: false, checked: false });
  saveShoppingList();
  renderShoppingListScreen();
  const nameInputs = document.querySelectorAll('.shop-item-name');
  const last = nameInputs[nameInputs.length - 1];
  if (last) last.focus();
}

function removeShoppingListItem(index) {
  shoppingList.splice(index, 1);
  saveShoppingList();
  renderShoppingListScreen();
}

function bumpShoppingListQty(index, delta) {
  const current = parseFloat(shoppingList[index].qty);
  const next = (isNaN(current) ? 0 : current) + delta;
  shoppingList[index].qty = Math.max(0, Math.round(next * 100) / 100);
  saveShoppingList();
  renderShoppingListScreen();
}

function renderShoppingListScreen() {
  const container = document.getElementById('shopping-list-content');
  container.innerHTML = '';

  if (shoppingMode) {
    renderShoppingModeRows(container);
  } else {
    renderShoppingListEditRows(container);
  }
}

function renderShoppingListEditRows(container) {
  const grouped = [];
  DEPT_ORDER.forEach(dept => {
    const items = shoppingList
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (item.dept || 'Other') === dept);
    if (items.length) grouped.push({ dept, items });
  });

  if (grouped.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty-msg';
    empty.textContent = 'Your shopping list is empty.';
    container.appendChild(empty);
    return;
  }

  grouped.forEach(({ dept, items }) => {
    const header = document.createElement('div');
    header.className = 'shop-dept-header';
    header.textContent = dept;
    container.appendChild(header);

    items.forEach(({ item, index }) => {
      container.appendChild(makeShoppingListRow(item, index));
    });
  });
}

function makeShoppingListRow(item, index) {
  const row = document.createElement('div');
  row.className = 'shop-item-row';
  const currentDept = item.dept || 'Other';
  const deptOptions = DEPT_ORDER.map(dept =>
    `<option value="${dept}"${currentDept === dept ? ' selected' : ''}>${dept}</option>`
  ).join('');
  row.innerHTML = `
    <div class="shop-item-top">
      <div class="qty-stepper">
        <button type="button" class="qty-step-btn qty-step-down" aria-label="Decrease quantity">−</button>
        <input type="text" class="qty-input" inputmode="decimal" value="${escHtml(String(item.qty ?? ''))}">
        <button type="button" class="qty-step-btn qty-step-up" aria-label="Increase quantity">+</button>
      </div>
      <input type="text" class="form-input unit-input-small" placeholder="Unit" value="${escHtml(item.unit || '')}">
      <button type="button" class="btn-remove-row" aria-label="Remove item">×</button>
    </div>
    <input type="text" class="form-input shop-item-name" placeholder="Item name" value="${escHtml(item.name || '')}">
    <div class="select-wrapper dept-select-wrapper">
      <select class="dept-select">${deptOptions}</select>
      <svg class="select-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
  `;

  row.querySelector('.qty-step-down').addEventListener('click', () => bumpShoppingListQty(index, -1));
  row.querySelector('.qty-step-up').addEventListener('click', () => bumpShoppingListQty(index, 1));
  row.querySelector('.btn-remove-row').addEventListener('click', () => removeShoppingListItem(index));

  row.querySelector('.qty-input').addEventListener('change', e => {
    const val = parseFloat(e.target.value);
    shoppingList[index].qty = e.target.value.trim() === '' ? '' : (isNaN(val) ? shoppingList[index].qty : val);
    saveShoppingList();
  });
  row.querySelector('.unit-input-small').addEventListener('change', e => {
    shoppingList[index].unit = e.target.value.trim();
    saveShoppingList();
  });
  row.querySelector('.shop-item-name').addEventListener('change', e => {
    const name = e.target.value.trim();
    shoppingList[index].name = name;
    // Auto-guess the department from the name, unless the user has already
    // picked one manually for this row. Deliberately NOT a full
    // renderShoppingListScreen() here: that tears down and rebuilds every
    // row's DOM, and if the very next thing the user does is tap this row's
    // department dropdown, the rebuild can detach that select mid-tap and
    // silently drop the pick. Just sync this one select's displayed value —
    // the row will snap into its correct department group next time the
    // screen re-renders for some other reason (add/remove/reset/mode switch).
    if (!shoppingList[index].deptManual) {
      shoppingList[index].dept = getDept(name);
      const deptSelect = row.querySelector('.dept-select');
      if (deptSelect) deptSelect.value = shoppingList[index].dept;
    }
    saveShoppingList();
  });
  row.querySelector('.dept-select').addEventListener('change', e => {
    shoppingList[index].dept = e.target.value;
    shoppingList[index].deptManual = true;
    saveShoppingList();
    renderShoppingListScreen();
  });

  return row;
}

// Items with no quantity or a quantity of 0 are treated as "don't need this
// one" — kept in the editable list (so zeroing out a field isn't the same as
// deleting the row) but left off the shopping-mode view and printouts.
function hasShoppableQty(item) {
  return item.qty !== '' && item.qty !== null && item.qty !== undefined && item.qty !== 0;
}

// ---- Shopping mode (check items off, tap to strike through & recall) ----
function renderShoppingModeRows(container) {
  const withIndex = shoppingList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => hasShoppableQty(item));
  const unchecked = withIndex.filter(({ item }) => !item.checked);
  const checked   = withIndex.filter(({ item }) => item.checked);

  if (unchecked.length === 0 && checked.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty-msg';
    empty.textContent = 'Your shopping list is empty.';
    container.appendChild(empty);
    return;
  }

  DEPT_ORDER.forEach(dept => {
    const items = unchecked.filter(({ item }) => (item.dept || 'Other') === dept);
    if (!items.length) return;
    const header = document.createElement('div');
    header.className = 'shop-dept-header';
    header.textContent = dept;
    container.appendChild(header);
    items.forEach(({ item, index }) => container.appendChild(makeShoppingModeRow(item, index)));
  });

  if (checked.length) {
    const header = document.createElement('div');
    header.className = 'shop-dept-header shop-dept-header-done';
    header.textContent = 'Checked Off';
    container.appendChild(header);
    checked.forEach(({ item, index }) => container.appendChild(makeShoppingModeRow(item, index)));
  }
}

function makeShoppingModeRow(item, index) {
  const row = document.createElement('div');
  row.className = 'shop-mode-item' + (item.checked ? ' checked' : '');
  const qtyUnit = [item.qty, item.unit]
    .filter(v => v !== '' && v !== null && v !== undefined)
    .join(' ');
  row.innerHTML = `
    <div class="shop-mode-check"></div>
    <span class="shop-mode-text">${qtyUnit ? `<strong>${escHtml(String(qtyUnit))}</strong> ` : ''}${escHtml(item.name || '')}</span>
  `;
  row.addEventListener('click', () => toggleShoppingItemChecked(index));
  return row;
}

function toggleShoppingItemChecked(index) {
  shoppingList[index].checked = !shoppingList[index].checked;
  saveShoppingList();
  renderShoppingListScreen();
}

function printCurrentShoppingList() {
  const printable = shoppingList.filter(hasShoppableQty);
  if (printable.length === 0) { showToast('Shopping list is empty'); return; }

  const favRecipes = currentFavRecipes();
  const recipeSummary = favRecipes.map(r => {
    const servings = favScales[r.name] || r.baseServings;
    return `${r.name} (${servings} servings)`;
  }).join('<br>');

  let rows = '';
  let lastDept = null;
  printable.forEach(item => {
    const dept = item.dept || 'Added Items';
    if (dept !== lastDept) {
      rows += `<tr class="dept-row"><td colspan="4">${dept}</td></tr>`;
      lastDept = dept;
    }
    rows += `<tr>
      <td class="chk-col">☐</td>
      <td class="qty-col">${formatQty(item.qty)}</td>
      <td class="unit-col">${item.unit || ''}</td>
      <td class="ing-col">${item.name}</td>
    </tr>`;
  });

  const html = `
    <h1>Shopping List</h1>
    <div class="recipes-summary"><strong>Recipes included:</strong>${recipeSummary}</div>
    <table>${rows}</table>
  `;

  openPrintWindow('Shopping List', html);
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
    const res  = await fetch(`${API_URL}?action=getAllRecipes&collection=${COLLECTION}`);
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

  // Filter by tag first
  if (tag !== 'all' && tag !== '') {
    recipes = recipes.filter(r =>
      r.tags && r.tags.split(',').map(t => t.trim()).includes(tag)
    );
  }

  // Filter to favorites only
  if (favoritesOnly) {
    recipes = recipes.filter(r => favorites.has(r.name));
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
document.getElementById('btn-combined-shopping').addEventListener('click', openShoppingListScreen);
document.getElementById('btn-shopping-list-back').addEventListener('click', closeShoppingListScreen);
document.getElementById('btn-shopping-list-reset').addEventListener('click', resetShoppingListToAutoCombined);
document.getElementById('btn-print-shopping-list').addEventListener('click', printCurrentShoppingList);
document.getElementById('btn-add-shopping-item').addEventListener('click', addShoppingListItem);
document.getElementById('btn-start-shopping').addEventListener('click', enterShoppingMode);
document.getElementById('btn-back-to-edit').addEventListener('click', exitShoppingMode);

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
  updateEditButtonsVisibility();

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
  </div>
  <div id="saved-serving-row" class="saved-serving-row hidden">
    🛒 Shopping list: <strong id="saved-serving-val"></strong> servings &nbsp;·&nbsp; <em>tap Go to update</em>
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
      // Persist so shopping list can exclude checked-off ingredients
      if (checkedIng.size > 0) {
        excl[currentRecipe.name] = [...checkedIng];
      } else {
        delete excl[currentRecipe.name];
      }
      localStorage.setItem(STORAGE_EXCL, JSON.stringify(excl));
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

  // Save serving size for shopping list if this recipe is a favorite
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
  const btn = document.getElementById('btn-favorite');
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

// ============================================
// AUTH
// ============================================

function isLoggedIn() {
  return !!authToken;
}

function canEdit() {
  return isLoggedIn() && authCanEdit;
}

function updateAuthUI() {
  btnAccount.title = isLoggedIn() ? `Log out (${authName || 'account'})` : 'Log in';
  btnAccount.style.color = isLoggedIn() ? '#C4A35A' : '';
  btnAddRecipe.classList.toggle('hidden', !canEdit());
  updateEditButtonsVisibility();
}

function updateEditButtonsVisibility() {
  const show = canEdit() && !!currentRecipe;
  btnEditRecipe.classList.toggle('hidden', !show);
  btnDeleteRecipe.classList.toggle('hidden', !show);
}

function openLoginScreen() {
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  screenLogin.classList.add('active');
}

function closeLoginScreen() {
  screenLogin.classList.remove('active');
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  if (!username || !password) {
    errorEl.textContent = 'Enter both username and password.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${API_URL}?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, appKey: APP_KEY })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    authToken   = data.token;
    authName    = data.displayName || username;
    authCanEdit = !!data.canEdit;
    localStorage.setItem(STORAGE_AUTH_TOKEN, authToken);
    localStorage.setItem(STORAGE_AUTH_NAME, authName);
    localStorage.setItem(STORAGE_AUTH_CAN_EDIT, String(authCanEdit));

    closeLoginScreen();
    updateAuthUI();
    showToast(`Welcome, ${authName}!`);
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed.';
    errorEl.classList.remove('hidden');
  }
}

function doLogout() {
  const token = authToken;
  authToken = null;
  authName = null;
  authCanEdit = false;
  localStorage.removeItem(STORAGE_AUTH_TOKEN);
  localStorage.removeItem(STORAGE_AUTH_NAME);
  localStorage.removeItem(STORAGE_AUTH_CAN_EDIT);
  updateAuthUI();
  showToast('Logged out');

  if (token) {
    fetch(`${API_URL}?action=logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {});
  }
}

btnAccount.addEventListener('click', () => {
  if (isLoggedIn()) {
    if (confirm(`Log out ${authName || ''}?`.trim())) doLogout();
  } else {
    openLoginScreen();
  }
});

document.getElementById('btn-login-back').addEventListener('click', closeLoginScreen);
document.getElementById('btn-login-submit').addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ============================================
// RECIPE EDITOR (add / edit / delete)
// ============================================

function makeIngredientRow(ing) {
  const wrap = document.createElement('div');
  wrap.className = 'ingredient-row';
  const qty = ing && ing.quantity !== undefined && ing.quantity !== null ? String(ing.quantity) : '';
  wrap.innerHTML = `
    <div class="ingredient-row-fields">
      <input type="text" class="form-input qty-input" placeholder="Qty" value="${escHtml(qty)}">
      <input type="text" class="form-input unit-input" placeholder="Unit" value="${escHtml(ing?.unit || '')}">
      <input type="text" class="form-input" placeholder="Ingredient name" value="${escHtml(ing?.ingredient || '')}">
      <button type="button" class="btn-remove-row" aria-label="Remove ingredient">×</button>
    </div>
    <input type="text" class="form-input ingredient-notes-input" placeholder="Notes (optional)" value="${escHtml(ing?.notes || '')}">
  `;
  wrap.querySelector('.btn-remove-row').addEventListener('click', () => wrap.remove());
  return wrap;
}

function makeStepRow(stepText) {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `
    <div class="step-number-badge"></div>
    <textarea class="form-textarea" rows="2" placeholder="Step instructions">${escHtml(stepText || '')}</textarea>
    <button type="button" class="btn-remove-row" aria-label="Remove step">×</button>
  `;
  row.querySelector('.btn-remove-row').addEventListener('click', () => {
    row.remove();
    renumberSteps();
  });
  return row;
}

function renumberSteps() {
  document.querySelectorAll('#step-rows .step-number-badge').forEach((el, i) => {
    el.textContent = `${i + 1}.`;
  });
}

function renderIngredientRows(ingredients) {
  const container = document.getElementById('ingredient-rows');
  container.innerHTML = '';
  const list = ingredients && ingredients.length ? ingredients : [null];
  list.forEach(ing => container.appendChild(makeIngredientRow(ing)));
}

function renderStepRows(steps) {
  const container = document.getElementById('step-rows');
  container.innerHTML = '';
  const list = steps && steps.length ? steps : [''];
  list.forEach(step => container.appendChild(makeStepRow(step)));
  renumberSteps();
}

document.getElementById('btn-add-ingredient').addEventListener('click', () => {
  document.getElementById('ingredient-rows').appendChild(makeIngredientRow(null));
});

document.getElementById('btn-add-step').addEventListener('click', () => {
  document.getElementById('step-rows').appendChild(makeStepRow(''));
  renumberSteps();
});

function openAddRecipeForm() {
  editingRecipeId = null;
  document.getElementById('edit-screen-title').textContent = 'Add Recipe';
  document.getElementById('btn-edit-delete').classList.add('hidden');
  document.getElementById('edit-error').classList.add('hidden');
  document.getElementById('field-name').value = '';
  document.getElementById('field-category').value = '';
  document.getElementById('field-servings').value = '';
  document.getElementById('field-tags').value = '';
  document.getElementById('field-prep-time').value = '';
  document.getElementById('field-cook-time').value = '';
  document.getElementById('field-total-time').value = '';
  document.getElementById('field-tested').checked = false;
  document.getElementById('field-story').value = '';
  document.getElementById('field-notes').value = '';
  document.getElementById('field-nutrition').value = '';
  renderIngredientRows([]);
  renderStepRows([]);
  screenEdit.classList.add('active');
}

function openEditRecipeForm(recipe) {
  editingRecipeId = recipe.id;
  document.getElementById('edit-screen-title').textContent = 'Edit Recipe';
  document.getElementById('btn-edit-delete').classList.remove('hidden');
  document.getElementById('edit-error').classList.add('hidden');
  document.getElementById('field-name').value = recipe.name || '';
  document.getElementById('field-category').value = recipe.category || '';
  document.getElementById('field-servings').value = recipe.baseServings || '';
  document.getElementById('field-tags').value = recipe.tags || '';
  document.getElementById('field-prep-time').value = recipe.prepTime || '';
  document.getElementById('field-cook-time').value = recipe.cookTime || '';
  document.getElementById('field-total-time').value = recipe.totalTime || '';
  document.getElementById('field-tested').checked = !!recipe.tested;
  document.getElementById('field-story').value = recipe.story || '';
  document.getElementById('field-notes').value = recipe.notes || '';
  document.getElementById('field-nutrition').value = recipe.nutrition || '';
  renderIngredientRows(recipe.ingredients || []);
  renderStepRows(recipe.steps || []);
  screenEdit.classList.add('active');
}

function closeEditForm() {
  screenEdit.classList.remove('active');
}

function collectRecipeFromForm() {
  const ingredients = [...document.querySelectorAll('#ingredient-rows .ingredient-row')].map(row => {
    const inputs = row.querySelectorAll('.ingredient-row-fields input');
    const qtyRaw = inputs[0].value.trim();
    return {
      quantity: qtyRaw === '' ? '' : parseFloat(qtyRaw),
      unit: inputs[1].value.trim(),
      ingredient: inputs[2].value.trim(),
      notes: row.querySelector('.ingredient-notes-input').value.trim()
    };
  }).filter(ing => ing.ingredient !== '');

  const steps = [...document.querySelectorAll('#step-rows .step-row textarea')]
    .map(t => t.value.trim())
    .filter(Boolean);

  const servingsRaw = document.getElementById('field-servings').value;

  return {
    name: document.getElementById('field-name').value.trim(),
    collection: COLLECTION,
    category: document.getElementById('field-category').value.trim() || null,
    baseServings: servingsRaw ? parseInt(servingsRaw, 10) : null,
    tags: document.getElementById('field-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    prepTime: document.getElementById('field-prep-time').value.trim() || null,
    cookTime: document.getElementById('field-cook-time').value.trim() || null,
    totalTime: document.getElementById('field-total-time').value.trim() || null,
    tested: document.getElementById('field-tested').checked,
    story: document.getElementById('field-story').value.trim() || null,
    notes: document.getElementById('field-notes').value.trim() || null,
    nutrition: document.getElementById('field-nutrition').value.trim() || null,
    ingredients,
    steps
  };
}

async function saveRecipe() {
  const errorEl = document.getElementById('edit-error');
  errorEl.classList.add('hidden');

  const payload = collectRecipeFromForm();
  if (!payload.name) {
    errorEl.textContent = 'Recipe name is required.';
    errorEl.classList.remove('hidden');
    return;
  }

  const action = editingRecipeId ? 'updateRecipe' : 'addRecipe';
  if (editingRecipeId) payload.id = editingRecipeId;

  try {
    const res = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        showToast('Your session expired — please log in again.');
        doLogout();
        closeEditForm();
        return;
      }
      throw new Error(data.error || 'Save failed');
    }

    const savedId = editingRecipeId || data.id;
    await fetchFromWeb();
    closeEditForm();
    showToast('Recipe saved');

    const saved = allData.recipes.find(r => r.id === savedId);
    if (saved) openRecipe(saved);
  } catch (err) {
    errorEl.textContent = err.message || 'Save failed.';
    errorEl.classList.remove('hidden');
  }
}

async function deleteRecipe(id) {
  if (!confirm('Delete this recipe? This cannot be undone.')) return;

  try {
    const res = await fetch(`${API_URL}?action=deleteRecipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ id })
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        showToast('Your session expired — please log in again.');
        doLogout();
        return;
      }
      throw new Error(data.error || 'Delete failed');
    }

    await fetchFromWeb();
    closeEditForm();
    goHome();
    showToast('Recipe deleted');
  } catch (err) {
    showToast(err.message || 'Delete failed.');
  }
}

btnAddRecipe.addEventListener('click', openAddRecipeForm);
btnEditRecipe.addEventListener('click', () => {
  if (currentRecipe) openEditRecipeForm(currentRecipe);
});
btnDeleteRecipe.addEventListener('click', () => {
  if (currentRecipe) deleteRecipe(currentRecipe.id);
});

document.getElementById('btn-edit-back').addEventListener('click', closeEditForm);
document.getElementById('btn-edit-save').addEventListener('click', saveRecipe);
document.getElementById('btn-edit-delete').addEventListener('click', () => {
  if (editingRecipeId) deleteRecipe(editingRecipeId);
});
