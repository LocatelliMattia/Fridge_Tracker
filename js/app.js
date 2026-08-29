// app.js — Main UI controller. Ties together db.js, openFoodFacts.js,
// scanner.js and recommend.js. No framework: the app is small enough
// that plain DOM manipulation keeps things easy to follow and cheap to
// run on an old tablet.

let currentItems = [];       // in-memory cache, kept in sync with IndexedDB
let activeMeal = 'breakfast';
let pendingBarcode = null;   // barcode of the item currently being added, if any
let editingId = null;        // ID of the item currently being edited, or null if creating new

// ---- Bootstrapping ---------------------------------------------------

async function init() {
  setupTabNav();
  setupMealPicker();
  setupAddFlow();
  setupListControls();
  resetAddFlow();
  await refreshItemsFromDB();
  registerServiceWorker();
}

function updateCategorySelect() {
  const select = document.getElementById('field-category-select');
  
  // 1. Define the static options: empty and "new category"
  const options = [
    { value: '', text: '-- Seleziona o crea --' },
    { value: 'NEW_CATEGORY', text: '+ Crea nuova categoria...' }
  ];
  
  // 2. Total reset of the select element to avoid duplicates
  select.innerHTML = '';
  
  // 3. Add the static options first
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.text;
    select.appendChild(el);
  });
  
  // 4. Add dynamic options from currentItems
  const categories = [...new Set(currentItems.map(i => i.category).filter(Boolean))];
  categories.sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

// function updateCategoryList() {
//   const datalist = document.getElementById('category-list');
//   if (!datalist) return;

//   // Extract unique, non-empty categories from currentItems
//   const categories = [...new Set(currentItems.map(i => i.category).filter(Boolean))];
  
//   datalist.innerHTML = '';
//   categories.sort().forEach(cat => {
//     const option = document.createElement('option');
//     option.value = cat;
//     datalist.appendChild(option);
//   });
// }

async function refreshItemsFromDB() {
  currentItems = await window.FridgeDB.getAllItems();
  updateCategorySelect();
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

  if (viewName === 'add') {
    resetAddFlow();
  }

  // Leaving the "add" view while the camera is running should stop it.
  if (viewName !== 'add') {
    window.BarcodeScanner.stopScanning();
  }
}

// ---- "Dispensa" list ---------------------------------------------------

function setupListControls() {
  document.getElementById('search-input').addEventListener('input', renderList);
  document.getElementById('sort-select').addEventListener('change', renderList);
}

function renderList() {
  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('list-empty-state');
  
  // 1. Filter
  const query = document.getElementById('search-input').value.toLowerCase();
  let items = currentItems.filter(i => 
    i.name.toLowerCase().includes(query) || 
    (i.brand && i.brand.toLowerCase().includes(query))
  );

  // 2. Group by category
  const groups = items.reduce((acc, item) => {
    const cat = item.category || 'Senza Categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  listEl.innerHTML = '';
  emptyEl.hidden = items.length > 0;

  // 3. Render Groups with Collapsible details
  Object.keys(groups).sort().forEach(cat => {
    const groupLi = document.createElement('li');
    
    // Create collapsible section
    const details = document.createElement('details');
    details.open = true; // Default to open
    
    const summary = document.createElement('summary');
    summary.innerHTML = `<strong>${cat}:</strong> ${groups[cat].length} item${groups[cat].length !== 1 ? 's' : ''}`;
    summary.className = 'category-summary';
    
    const subList = document.createElement('ul');
    subList.className = 'item-list';
    // Allow dropping items into this category list to change their category
    subList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      subList.classList.add('drop-target');
    });

    subList.addEventListener('dragleave', () => {
      subList.classList.remove('drop-target');
    });

    subList.addEventListener('drop', async (e) => {
      e.preventDefault();
      subList.classList.remove('drop-target');
      const idStr = e.dataTransfer.getData('text/plain');
      const id = Number(idStr);
      if (!Number.isFinite(id)) return;

      const item = currentItems.find(i => i.id === id);
      if (!item) return;

      // 'Senza Categoria' label maps to null category
      const newCategory = (cat === 'Senza Categoria') ? null : cat;
      if (item.category === newCategory) return; // nothing to change

      item.category = newCategory;
      try {
        await window.FridgeDB.updateItem(item);
      } catch (err) {
        console.error('Failed to update item category', err);
      }
      await refreshItemsFromDB();
    });
    
    groups[cat].forEach(item => subList.appendChild(buildItemCard(item)));
    
    details.appendChild(summary);
    details.appendChild(subList);
    groupLi.appendChild(details);
    listEl.appendChild(groupLi);
  });
}

async function handleConsumeItem(id) {
  const item = currentItems.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('consume-modal');
  const input = document.getElementById('consume-amount');
  const text = document.getElementById('consume-text');
  
  text.textContent = `Quanto consumi di ${item.name}? (${item.unit})`;
  modal.hidden = false; // Show

  // Use a named function so we can remove listener if needed, 
  // or just reset the onclick handler clearly
  document.getElementById('btn-consume-ok').onclick = async () => {
    const amount = parseFloat(input.value.replace(',', '.'));
    
    // Hide first
    modal.hidden = true;
    input.value = '1'; // Reset
    
    if (isNaN(amount) || amount <= 0) return;
    
    if (item.quantity <= amount) {
      await window.FridgeDB.deleteItem(id);
    } else {
      item.quantity -= amount;
      await window.FridgeDB.updateItem(item);
    }
    await refreshItemsFromDB();
  };

  document.getElementById('btn-consume-cancel').onclick = () => {
    modal.hidden = true;
    input.value = '1';
  };
}

function buildItemCard(item) {
  const status = window.Recommend.freshnessStatus(item);
  const days = window.Recommend.daysUntilExpiry(item);

  const li = document.createElement('li');
  li.className = `item-card status-${status}`;
  const total = 14; // Assuming 14 days as a reference for freshness percentage calculation
  li.style.setProperty('--freshness', `${Math.max(0, Math.min(100, (days / total) * 100))}%`);
  li.draggable = true; // Make the card draggable for drag-and-drop category movements

  // Drag start event
  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('is-dragging');
  });

  // Drag end event
  li.addEventListener('dragend', () => {
    li.classList.remove('is-dragging');
  });

  const main = document.createElement('div');
  main.className = 'item-card-main';

  const name = document.createElement('p');
  name.className = 'item-card-name';
  name.textContent = item.name;

  // Show quantity and brand/category
  const meta = document.createElement('p');
  meta.className = 'item-card-meta';
  const qtyDisplay = `${item.quantity} ${item.unit || 'pz'}`;
  meta.textContent = [qtyDisplay, item.brand, item.category].filter(Boolean).join(' · ');

  main.appendChild(name);
  main.appendChild(meta);

  const expiry = document.createElement('span');
  expiry.className = `item-card-expiry status-${status}`;
  expiry.textContent = formatExpiryLabel(days);

  // Update button text to "Consuma" instead of "-1"
  const consumeBtn = document.createElement('button');
  consumeBtn.className = 'item-card-consume';
  consumeBtn.textContent = 'Consuma';
  consumeBtn.addEventListener('click', () => handleConsumeItem(item.id));

  const editBtn = document.createElement('button');
  editBtn.className = 'item-card-edit';
  editBtn.textContent = 'Modifica';
  editBtn.addEventListener('click', () => handleEditItem(item.id));

  li.appendChild(main);
  li.appendChild(expiry);
  li.appendChild(consumeBtn);
  li.appendChild(editBtn);

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

function handleEditItem(id) {
  const item = currentItems.find(i => i.id === id);
  if (!item) return;

  editingId = id;
  pendingBarcode = item.barcode || null;
  
  // Switch to add view and populate form
  switchView('add');
  showFormStep({ product: item });
  
  // Custom status text for edit mode
  document.getElementById('form-status').textContent = `Stai modificando: ${item.name}`;
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
  document.getElementById('btn-cancel-manual-barcode').addEventListener('click', resetAddFlow);

  document.getElementById('btn-show-manual-barcode').addEventListener('click', () => {
    showAddStep('add-step-manual-barcode');
  });

  document.getElementById('btn-show-manual-form').addEventListener('click', () => {
    pendingBarcode = null;
    showFormStep({});
  });
  
  document.getElementById('manual-barcode-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('field-manual-barcode');
    const barcode = input.value.trim();
    if (!barcode) return;
    input.value = '';
    handleBarcodeDetected(barcode);
  });
  document.getElementById('btn-discard-form').addEventListener('click', resetAddFlow);
  document.getElementById('add-step-form').addEventListener('submit', handleFormSubmit);

  // Setup Backup
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('input-import').addEventListener('change', importData);
}

async function exportData() {
  const items = await window.FridgeDB.getAllItems();
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frigo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const items = JSON.parse(e.target.result);
      if (!Array.isArray(items)) throw new Error('Formato non valido');
      
      for (const item of items) {
        await window.FridgeDB.addItem(item);
      }
      await refreshItemsFromDB();
      alert('Importazione completata!');
    } catch (err) {
      alert('Errore nell\'importazione: ' + err.message);
    }
  };
  reader.readAsText(file);
}

document.getElementById('field-category-select').addEventListener('change', (e) => {
  const newCatInput = document.getElementById('field-category-new');
  newCatInput.style.display = (e.target.value === 'NEW_CATEGORY') ? 'block' : 'none';
});

function showAddStep(stepId) {
  document.querySelectorAll('#view-add .add-step').forEach((el) => {
    el.hidden = el.id !== stepId;
  });

  const manualInput = document.getElementById('field-manual-barcode');
  if (manualInput) {
    manualInput.value = stepId === 'add-step-manual-barcode' ? manualInput.value : '';
  }
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
  console.error(err);

  if (err && err.code === 'INSECURE_CONTEXT') {
    alert(
      'La fotocamera funziona solo su una connessione HTTPS (o su localhost). ' +
      'Stai aprendo il sito con http:// dalla rete locale: il browser blocca la ' +
      'fotocamera anche se i permessi sono concessi. Serve pubblicare il sito su ' +
      'HTTPS (es. GitHub Pages) oppure usare un tunnel HTTPS per i test (es. ngrok).'
    );
  } else if (err && err.code === 'NO_MEDIA_DEVICES') {
    alert('Questo browser non espone l\'API della fotocamera. Prova con Chrome o Safari aggiornati.');
  } else {
    alert('Non riesco ad accedere alla fotocamera. Controlla i permessi del browser.');
  }

  showAddStep('add-step-choice');
}

async function handleBarcodeDetected(barcode) {
  pendingBarcode = barcode;
  showFormStep({ loading: true });

  try {
    const product = await window.OpenFoodFacts.lookupByBarcode(barcode);
    if (product) {
      showFormStep({ product, statusText: 'Product found on Open Food Facts.' });
    } else {
      showFormStep({
        statusText: `Code ${barcode} not found in database. Please enter details manually.`,
      });
    }
  } catch (err) {
    console.error('DEBUG - Product lookup failed:', err);
    
    showFormStep({
      statusText: `Error: ${err.message}. Please enter details manually.`,
    });
  }
}

/**
 * Populates (or clears) the product form and reveals it.
 * `product` follows the shape returned by OpenFoodFacts.lookupByBarcode.
 */
function showFormStep({ product = null, statusText = '', loading = false } = {}) {
  // Ensure the form is revealed in the DOM before accessing its elements
  showAddStep('add-step-form');

  const form = document.getElementById('add-step-form');
  form.reset();
  
  // Reset category UI
  document.getElementById('field-category-new').style.display = 'none';
  document.getElementById('field-category-new').value = '';

  document.getElementById('form-status').textContent = loading ? 'Searching product...' : statusText;

  // Only attempt to fill fields if we have a product object
  if (product) {
    document.getElementById('field-name').value = product.name || '';
    document.getElementById('field-brand').value = product.brand || '';
    
    // Logic to handle category
    const select = document.getElementById('field-category-select');
    const newCatInput = document.getElementById('field-category-new');
    newCatInput.style.display = 'none';
    
    if (product.category) {
      // Check if the category exists in the dropdown options
      const optionExists = Array.from(select.options).some(o => o.value === product.category);
      
      if (optionExists) {
        select.value = product.category;
      } else {
        // If not, trigger the "New" flow
        select.value = 'NEW_CATEGORY';
        newCatInput.style.display = 'block';
        newCatInput.value = product.category;
      }
    } else {
      select.value = '';
    }
    
    // Set expiry date (either existing item's expiry or default)
    document.getElementById('field-expiry').value = product.expiryDate || defaultExpiryDate();

    // Set quantity and unit if available
    if (product.quantity !== undefined) {
      document.getElementById('field-quantity').value = product.quantity;
    }
    if (product.unit) {
      document.getElementById('field-unit').value = product.unit;
    }

    // Set meal tags if available
    if (product.mealTags && Array.isArray(product.mealTags)) {
      document.querySelectorAll('input[name="mealTag"]').forEach(cb => {
        cb.checked = product.mealTags.includes(cb.value);
      });
    }

    // Fill nutrition if available
    if (product.nutriments) {
      const n = product.nutriments;
      document.getElementById('field-kcal').value = n.energyKcal ?? '';
      document.getElementById('field-proteins').value = n.proteins ?? '';
      document.getElementById('field-carbs').value = n.carbs ?? '';
      document.getElementById('field-sugars').value = n.sugars ?? '';
      document.getElementById('field-fat').value = n.fat ?? '';
      document.getElementById('field-fiber').value = n.fiber ?? '';
      document.getElementById('field-salt').value = n.salt ?? '';
    }
  }
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

  const select = document.getElementById('field-category-select');
  const newCatInput = document.getElementById('field-category-new');
  
  // Logic: 
  // 1. If select is empty, category is null.
  // 2. If select is NEW_CATEGORY, take value from text input.
  // 3. Otherwise, take value from select.
  let finalCategory = null;
  if (select.value === 'NEW_CATEGORY') {
    finalCategory = newCatInput.value.trim();
  } else if (select.value !== '') {
    finalCategory = select.value;
  }

  const item = {
    barcode: pendingBarcode,
    name: document.getElementById('field-name').value.trim(),
    brand: document.getElementById('field-brand').value.trim() || null,
    category: finalCategory || null,
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
    addedAt: editingId ? (currentItems.find(i => i.id === editingId).addedAt) : new Date().toISOString(),
  };

  if (editingId) {
    item.id = editingId;
    await window.FridgeDB.updateItem(item);
  } else {
    item.barcode = pendingBarcode;
    await window.FridgeDB.addItem(item);
  }
  
  await refreshItemsFromDB();
  resetAddFlow();
  switchView('list');
}

function numberOrNull(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return null;
  
  const rawValue = el.value.replace(',', '.'); // Convert comma to dot just in case
  if (rawValue === '') return null;
  
  const n = parseFloat(rawValue); // Use parseFloat instead of Number for better decimal handling
  return !isNaN(n) && isFinite(n) ? n : null;
}

function resetAddFlow() {
  pendingBarcode = null;
  editingId = null; // Reset editing state
  const addStepForm = document.getElementById('add-step-form');
  const newCategoryInput = document.getElementById('field-category-new');
  const manualBarcodeInput = document.getElementById('field-manual-barcode');

  if (manualBarcodeInput) manualBarcodeInput.value = '';
  if (addStepForm) addStepForm.reset();
  if (newCategoryInput) newCategoryInput.style.display = 'none';

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

// Auto reload the page when a new service worker takes control, so the user
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Nuova versione disponibile, ricarico...');
    window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', init);