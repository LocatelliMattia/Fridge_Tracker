// recommend.js — Simple, explainable scoring logic for "what should I eat".
// Deliberately not machine learning: expiry urgency is the dominant signal,
// with meal-tag matching as a secondary filter. Easy to tune by hand.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the number of whole days between today and the item's expiry
 * date. Negative values mean the item is already past its expiry date.
 */
function daysUntilExpiry(item) {
  const today = startOfDay(new Date());
  const expiry = startOfDay(new Date(item.expiryDate));
  return Math.round((expiry - today) / MS_PER_DAY);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Classifies freshness so the UI can show a status color/label.
 * 'expired'   -> past expiry date, should not be recommended
 * 'urgent'    -> expires today or tomorrow
 * 'soon'      -> expires within the next 4 days
 * 'fresh'     -> everything else
 */
function freshnessStatus(item) {
  const days = daysUntilExpiry(item);
  if (days < 0) return 'expired';
  if (days <= 1) return 'urgent';
  if (days <= 4) return 'soon';
  return 'fresh';
}

/**
 * Suggests which items to consume for a given meal.
 *
 * @param {Array} items - all items currently in the fridge
 * @param {string} mealType - 'breakfast' | 'lunch' | 'dinner' | 'snack'
 * @param {object} options
 *   includeExpired: whether to still surface already-expired items
 *                   (default true, so the user notices and discards them)
 * @returns {Array} items sorted by priority, highest priority first
 */
function suggestForMeal(items, mealType, options = {}) {
  const { includeExpired = true } = options;

  return items
    .filter((item) => matchesMeal(item, mealType))
    .filter((item) => includeExpired || freshnessStatus(item) !== 'expired')
    .map((item) => ({ item, days: daysUntilExpiry(item) }))
    .sort((a, b) => a.days - b.days) // most urgent first
    .map(({ item }) => item);
}

/**
 * An item matches a meal if it was explicitly tagged for it, or if it
 * has no meal tags at all (untagged items are assumed suitable anytime —
 * this keeps the manual-entry flow low-friction for the user).
 */
function matchesMeal(item, mealType) {
  if (!item.mealTags || item.mealTags.length === 0) return true;
  return item.mealTags.includes(mealType);
}

window.Recommend = {
  daysUntilExpiry,
  freshnessStatus,
  suggestForMeal,
};
