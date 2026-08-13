// db.js — Thin wrapper around IndexedDB for storing fridge items locally.
// This app runs on a single fixed device (tablet near the fridge), so we
// deliberately keep everything local: no backend, no sync, no accounts.

const DB_NAME = 'fridge-tracker';
const DB_VERSION = 1;
const STORE_NAME = 'items';

let dbInstance = null;

/**
 * Opens (and if needed, creates/upgrades) the IndexedDB database.
 * Returns a promise that resolves to the open IDBDatabase instance.
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        // Index used to sort/query items by expiry date quickly.
        store.createIndex('expiryDate', 'expiryDate', { unique: false });
        store.createIndex('barcode', 'barcode', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Shape of a fridge item stored in the DB:
 * {
 *   id: number (auto),
 *   barcode: string | null,
 *   name: string,
 *   brand: string | null,
 *   category: string | null,       // raw category label, mostly informational
 *   mealTags: string[],            // subset of ['breakfast','lunch','dinner','snack']
 *   nutriments: {                  // per 100g, all optional/nullable
 *     energyKcal: number | null,
 *     proteins: number | null,
 *     carbs: number | null,
 *     sugars: number | null,
 *     fat: number | null,
 *     fiber: number | null,
 *     salt: number | null,
 *   },
 *   nutriscore: string | null,     // 'a'..'e'
 *   quantity: number,
 *   unit: string,                  // 'pz' | 'g' | 'ml' etc.
 *   expiryDate: string,            // ISO date, e.g. '2026-08-20'
 *   addedAt: string,               // ISO datetime
 * }
 */

async function addItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(item);
    request.onsuccess = () => resolve(request.result); // returns new id
    request.onerror = () => reject(request.error);
  });
}

async function updateItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Exposed as a global object since we're not using a module bundler —
// keeps the tablet deployment dead simple (just static files, no build step).
window.FridgeDB = {
  addItem,
  updateItem,
  deleteItem,
  getAllItems,
};
