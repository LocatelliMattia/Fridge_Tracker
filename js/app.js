// app.js — Main UI controller. Ties together db.js, openFoodFacts.js,
// scanner.js and recommend.js. No framework: the app is small enough
// that plain DOM manipulation keeps things easy to follow and cheap to
// run on an old tablet.

let currentItems = [];       // in-memory cache, kept in sync with IndexedDB
let activeMeal = 'breakfast';
let pendingBarcode = null;   // barcode of the item currently being added, if any

// ---- Bootstrapping ---------------------------------------------------

async function init() {
  setupTabNav();
  setupMealPicker();
  setupAddFlow();
  await refreshItemsFromDB();
  registerServiceWorker();
}

async function refreshItemsFromDB() {
  currentItems = await window.FridgeDB.getAllItems();
  renderList();
  renderSuggestions();
}

// ---- View switching ---------------------------------------------------

function setupTabNav() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(viewName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('is-active', section.id === `view-${viewName}`);
  });

  // Leaving the "add" view while the camera is running should stop it.
  if (viewName !== 'add') {
    window.BarcodeScanner.stopScanning();
  }
}

// ---- "In frigo" list ---------------------------------------------------

function renderList() {
  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('list-empty-state');
  const summaryEl = document.getElementById('summary-bar');

  const sorted = [...currentItems].sort(
    (a, b) => window.Recommend.daysUntilExpiry(a) - window.Recommend.daysUntilExpiry(b)
  );

  listEl.innerHTML = '';
  emptyEl.hidden = sorted.length > 0;

  const expiringSoonCount = sorted.filter((item) => {
    const status = window.Recommend.freshnessStatus(item);
    return status === 'urgent' || status === 'soon';
  }).length;

  summaryEl.textContent = sorted.length === 0
    ? ''
    : `${sorted.length} alimenti in frigo` +
      (expiringSoonCount > 0 ? ` · ${expiringSoonCount} in scadenza a breve` : '');

  sorted.forEach((item) => listEl.appendChild(buildItemCard(item)));
}

function buildItemCard(item) {
  const status = window.Recommend.freshnessStatus(item);
  const days = window.Recommend.daysUntilExpiry(item);

  const li = document.createElement('li');
  li.className = `item-card status-${status}`;

  const main = document.createElement('div');
  main.className = 'item-card-main';

  const name = document.createElement('p');
  name.className = 'item-card-name';
  name.textContent = item.name;

  const meta = document.createElement('p');
  meta.className = 'item-card-meta';
  meta.textContent = [item.brand, item.category].filter(Boolean).join(' · ') || '—';

  main.appendChild(name);
  main.appendChild(meta);

  const expiry = document.createElement('span');
  expiry.className = `item-card-expiry status-${status}`;
  expiry.textContent = formatExpiryLabel(days);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'item-card-delete';
  deleteBtn.setAttribute('aria-label', `Rimuovi ${item.name}`);
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => handleDeleteItem(item.id));

  li.appendChild(main);
  li.appendChild(expiry);
  li.appendChild(deleteBtn);

  return li;
}

function formatExpiryLabel(days) {
  if (days < 0) return `Scaduto da ${Math.abs(days)}g`;
  if (days === 0) return 'Scade oggi';
  if (days === 1) return 'Scade domani';
  return `Scade tra ${days}g`;
}

async function handleDeleteItem(id) {
  await window.FridgeDB.deleteItem(id);
  await refreshItemsFromDB();
}

// ---- "Cosa mangio" suggestions ---------------------------------------

function setupMealPicker() {
  const buttons = document.querySelectorAll('.meal-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      activeMeal = btn.dataset.meal;
      renderSuggestions();
    });
  });
}

function renderSuggestions() {
  const listEl = document.getElementById('suggest-list');
  const emptyEl = document.getElementById('suggest-empty-state');

  const suggestions = window.Recommend.suggestForMeal(currentItems, activeMeal);

  listEl.innerHTML = '';
  emptyEl.hidden = suggestions.length > 0;

  suggestions.forEach((item) => listEl.appendChild(buildItemCard(item)));
}

// ---- Add-item flow -----------------------------------------------------

function setupAddFlow() {
  document.getElementById('btn-start-scan').addEventListener('click', beginScanning);
  document.getElementById('btn-cancel-scan').addEventListener('click', cancelScanning);
  document.getElementById('btn-manual-entry').addEventListener('click', () => {
    pendingBarcode = null;
    showFormStep({});
  });
  document.getElementById('btn-discard-form').addEventListener('click', resetAddFlow);
  document.getElementById('add-step-form').addEventListener('submit', handleFormSubmit);
}

function showAddStep(stepId) {
  document.querySelectorAll('#view-add .add-step').forEach((el) => {
    el.hidden = el.id !== stepId;
  });
}

async function beginScanning() {
  showAddStep('add-step-scan');
  await window.BarcodeScanner.startScanning(handleBarcodeDetected, handleScanError);
}

async function cancelScanning() {
  await window.BarcodeScanner.stopScanning();
  showAddStep('add-step-choice');
}

function handleScanError(err) {
  alert('Non riesco ad accedere alla fotocamera. Controlla i permessi del browser.');
  console.error(err);
  showAddStep('add-step-choice');
}

async function handleBarcodeDetected(barcode) {
  pendingBarcode = barcode;
  showFormStep({ loading: true });

  try {
    const product = await window.OpenFoodFacts.lookupByBarcode(barcode);
    if (product) {
      showFormStep({ product, statusText: 'Prodotto trovato su Open Food Facts.' });
    } else {
      showFormStep({
        statusText: `Codice ${barcode} non trovato nel database. Compila i dati a mano.`,
      });
    }
  } catch (err) {
    console.error('Product lookup failed', err);
    showFormStep({
      statusText: 'Errore di rete durante la ricerca del prodotto. Compila i dati a mano.',
    });
  }
}

/**
 * Populates (or clears) the product form and reveals it.
 * `product` follows the shape returned by OpenFoodFacts.lookupByBarcode.
 */
function showFormStep({ product = null, statusText = '', loading = false } = {}) {
  showAddStep('add-step-form');

  const form = document.getElementById('add-step-form');
  form.reset();

  document.getElementById('form-status').textContent = loading ? 'Ricerca prodotto…' : statusText;

  document.getElementById('field-name').value = product?.name || '';
  document.getElementById('field-brand').value = product?.brand || '';
  document.getElementById('field-category').value = product?.category || '';
  document.getElementById('field-expiry').value = defaultExpiryDate();
  document.getElementById('field-quantity').value = 1;
  document.getElementById('field-unit').value = 'pz';

  const n = product?.nutriments || {};
  document.getElementById('field-kcal').value = n.energyKcal ?? '';
  document.getElementById('field-proteins').value = n.proteins ?? '';
  document.getElementById('field-carbs').value = n.carbs ?? '';
  document.getElementById('field-sugars').value = n.sugars ?? '';
  document.getElementById('field-fat').value = n.fat ?? '';
  document.getElementById('field-fiber').value = n.fiber ?? '';
  document.getElementById('field-salt').value = n.salt ?? '';
}

// Sensible starting point for the date picker — the user almost always
// needs to change this to match the actual printed date, but defaulting
// to +7 days saves a few taps for typical fresh/packaged goods.
function defaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function handleFormSubmit(event) {
  event.preventDefault();

  const mealTags = Array.from(
    document.querySelectorAll('input[name="mealTag"]:checked')
  ).map((el) => el.value);

  const item = {
    barcode: pendingBarcode,
    name: document.getElementById('field-name').value.trim(),
    brand: document.getElementById('field-brand').value.trim() || null,
    category: document.getElementById('field-category').value.trim() || null,
    mealTags,
    nutriscore: null,
    nutriments: {
      energyKcal: numberOrNull('field-kcal'),
      proteins: numberOrNull('field-proteins'),
      carbs: numberOrNull('field-carbs'),
      sugars: numberOrNull('field-sugars'),
      fat: numberOrNull('field-fat'),
      fiber: numberOrNull('field-fiber'),
      salt: numberOrNull('field-salt'),
    },
    quantity: Number(document.getElementById('field-quantity').value) || 1,
    unit: document.getElementById('field-unit').value,
    expiryDate: document.getElementById('field-expiry').value,
    addedAt: new Date().toISOString(),
  };

  await window.FridgeDB.addItem(item);
  await refreshItemsFromDB();
  resetAddFlow();
  switchView('list');
}

function numberOrNull(fieldId) {
  const raw = document.getElementById(fieldId).value;
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resetAddFlow() {
  pendingBarcode = null;
  document.getElementById('add-step-form').reset();
  showAddStep('add-step-choice');
}

// ---- PWA service worker (app-shell caching only, not API data) --------

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
