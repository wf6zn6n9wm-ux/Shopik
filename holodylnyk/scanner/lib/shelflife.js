// Терміни придатності за категорією.
//
// На чеку терміну немає НІКОЛИ — жоден канал (ні фото, ні реєстр ДПС) його
// не віддає. Тому це не «розпізнавання», а оцінка за категорією, яку
// користувач може виправити одним тапом.
//
// Числа — консервативні побутові оцінки для холодильника після покупки,
// не лабораторні норми. Занижувати безпечніше, ніж завищувати.

import { FREEZER_CATEGORIES } from './dictionary.js';

/** Днів у холодильнику від дати покупки. */
const FRIDGE_DAYS = {
  meat_raw: 2,
  meat_processed: 7,
  meat_snack: 3,
  poultry: 2,
  fish_raw: 2,
  fish_smoked: 7,
  dairy_milk: 7,
  dairy_yogurt: 14,
  dairy_cheese_hard: 30,
  dairy_cheese_soft: 7,
  dairy_sourcream: 10,
  dairy_butter: 30,
  eggs: 28,
  veg_leafy: 3,
  veg_root: 30,
  veg_other: 7,
  fruit: 7,
  berries: 3,
  bread: 3,
  sweets: 180,
  snacks: 120,
  frozen: 180,
  drinks_water: 365,
  drinks_juice: 180,
  drinks_soda: 180,
  grocery_dry: 365,
  oil: 540,
  sauces: 120,
  canned: 730,
  spices: 540,
  unknown: 5, // свідомо коротко: краще нагадати зайвий раз
};

/** Днів у морозилці. Заморозка множить, але не безмежно. */
const FREEZER_DAYS = {
  meat_raw: 180,
  meat_processed: 90,
  meat_snack: 90,
  poultry: 270,
  fish_raw: 180,
  fish_smoked: 60,
  veg_leafy: 90,
  veg_other: 240,
  veg_root: 240,
  fruit: 240,
  berries: 300,
  bread: 90,
  frozen: 180,
  unknown: 90,
};

/**
 * @param {string} category
 * @param {'fridge'|'freezer'|'pantry'} storage
 * @returns {number} днів від дати покупки
 */
function shelfLifeDays(category, storage = 'fridge') {
  if (storage === 'freezer') {
    return FREEZER_DAYS[category] ?? FRIDGE_DAYS[category] ?? FRIDGE_DAYS.unknown;
  }
  return FRIDGE_DAYS[category] ?? FRIDGE_DAYS.unknown;
}

/** Куди зазвичай кладуть цю категорію. */
function defaultStorage(category) {
  if (FREEZER_CATEGORIES.has(category)) return 'freezer';
  const pantry = new Set([
    'grocery_dry', 'oil', 'canned', 'spices', 'snacks',
    'drinks_water', 'drinks_soda', 'sweets', 'bread',
  ]);
  return pantry.has(category) ? 'pantry' : 'fridge';
}

/**
 * @param {string} purchaseDate ISO `YYYY-MM-DD`
 * @param {number} days
 * @returns {string|null} ISO `YYYY-MM-DD`
 */
function addDays(purchaseDate, days) {
  if (!purchaseDate) return null;
  const d = new Date(`${purchaseDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { FRIDGE_DAYS, FREEZER_DAYS, shelfLifeDays, defaultStorage, addDays };
