// openFoodFacts.js — Minimal client for the Open Food Facts product database.
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
// No API key required. We only need read access (product lookup by barcode).

// Open Food Facts asks integrators to identify their app via User-Agent,
// but browsers block setting a custom User-Agent header from JS — this is
// only enforceable from server-side code. Left here as documentation for
// anyone who later proxies these calls through a backend.
// const USER_AGENT = 'FridgeTracker/0.1 (personal project)';

/**
 * Gets the base URL for Open Food Facts, defaulting to the global version.
 * Can be overridden by storing 'off_country_code' in localStorage.
 */
function getOFFBaseUrl() {
  const countryCode = localStorage.getItem('off_country_code') || 'world';
  return `https://${countryCode}.openfoodfacts.org/api/v2/product`;
}

/**
 * Looks up a product by its barcode (EAN-13 / UPC-A).
 * Returns a normalized product object, or null if the product isn't
 * in the database (common for local/regional or unpackaged food).
 */
async function lookupByBarcode(barcode) {
  const fields = [
    'product_name',
    'brands',
    'categories',
    'nutriscore_grade',
    'nutriments',
    'quantity',
  ].join(',');

  const url = `${getOFFBaseUrl()}/${encodeURIComponent(barcode)}.json?fields=${fields}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Food Facts request failed: ${response.status}`);
  }

  const data = await response.json();

  // status === 0 means "product not found" in the OFF API.
  if (data.status === 0 || !data.product) {
    return null;
  }

  return normalizeProduct(data.product);
}

/**
 * Converts the (fairly messy, crowd-sourced) OFF product shape into the
 * flat structure our app stores locally.
 */
function normalizeProduct(product) {
  const n = product.nutriments || {};

  return {
    name: product.product_name || '',
    brand: product.brands || null,
    category: firstCategory(product.categories),
    nutriscore: product.nutriscore_grade || null,
    nutriments: {
      // Use clean numeric conversion here, not the DOM-reading function from app.js
      energyKcal: cleanNumber(n['energy-kcal_100g']),
      proteins: cleanNumber(n.proteins_100g),
      carbs: cleanNumber(n.carbohydrates_100g),
      sugars: cleanNumber(n.sugars_100g),
      fat: cleanNumber(n.fat_100g),
      fiber: cleanNumber(n.fiber_100g),
      salt: cleanNumber(n.salt_100g),
    },
  };
}

// Pure helper function for numeric conversion
function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstCategory(categoriesString) {
  if (!categoriesString) return null;
  // categories comes as a comma-separated list, most generic first,
  // e.g. "Dairies, Fermented foods, Fermented milk products, Yogurts"
  const parts = categoriesString.split(',').map((s) => s.trim());
  return parts[parts.length - 1] || parts[0] || null;
}

// --- deprecated function ---
// function numberOrNull(value) {
//   const n = Number(value);
//   return Number.isFinite(n) ? n : null;
// }

window.OpenFoodFacts = {
  lookupByBarcode,
};
