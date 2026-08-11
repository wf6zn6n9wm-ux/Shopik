// Нормалізація позицій чека.
//
// Порядок навмисний: СЛОВНИК ПЕРШИМ, модель — запасним варіантом.
// Словник детермінований, тестований і росте від реальних чеків; модель
// добре вгадує, але щоразу по-різному. Там, де словник знає відповідь,
// думка моделі не питається взагалі.

import {
  SERVICE_LINES,
  PACKAGING_TOKENS,
  FIRST_TOKEN,
  CATEGORY_LABELS,
} from './dictionary.js';
import { shelfLifeDays, defaultStorage, addDays } from './shelflife.js';

/** Приводить рядок до вигляду, з яким можна порівнювати. */
function fold(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[’'`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Службовий рядок (сума, решта, ПДВ) — не товар. */
function isServiceLine(raw) {
  const f = fold(raw);
  if (!f) return true;
  return SERVICE_LINES.some((s) => f.startsWith(s) || f.includes(`${s}:`));
}

/**
 * Перший значущий токен назви.
 * Пропускаємо число/вагу на початку («2 x », «0,5 кг»), бо категорія
 * в українських чеках — це майже завжди перше СЛОВО.
 */
function firstToken(raw) {
  const cleaned = fold(raw)
    .replace(/^\d+[.,]?\d*\s*[x×]\s*\d+[.,]?\d*\s*=?\s*/, '')
    .replace(/^\d+[.,]?\d*\s*(кг|г|мл|л|шт|уп)\b\s*/, '');
  const m = cleaned.match(/[a-zа-яіїєґ']+/i);
  return m ? m[0] : '';
}

/** Прибирає скорочення пакування та артикули — назва для людини. */
function cleanName(raw) {
  let s = (raw || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/,?\s*арт\.?\s*[a-zа-я0-9-]+/gi, '');
  for (const tok of PACKAGING_TOKENS) {
    s = s.replace(new RegExp(`(^|\\s)${tok}(?=\\s|$)`, 'gi'), ' ');
  }
  s = s.replace(/\([^)]{1,3}\)/g, ' '); // маркери мережі: (Н), (В)
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  // Хвостові однобуквені залишки скорочень («… п», «… н»), які лишаються
  // після зняття пакування. Цифри не чіпаємо — це грамаж.
  s = s.replace(/(\s+[а-яіїєґa-z])+$/i, '');
  s = s.replace(/[\s,.-]+$/, '');
  return s;
}

/**
 * EAN-13, що починається з 2, — внутрішній код магазину.
 * Такий код не резолвиться в жодній зовнішній базі (перевірено на
 * реальному чеку АТБ: 2999300069184 — внутрішній, 7613036731713 — Nestlé).
 */
function isGlobalEan(barcode) {
  const b = (barcode || '').replace(/\D/g, '');
  if (b.length !== 8 && b.length !== 13) return false;
  if (b.startsWith('2') || b.startsWith('02')) return false;
  const digits = b.split('').map(Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Усі валідні категорії — щоб модель не вигадала свою. */
const FRIDGE_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

/**
 * Категорія позиції.
 * @returns {{category: string, source: 'dictionary'|'model'|'unknown'}}
 */
function classify(rawText, modelCategory, modelIsFood) {
  const token = firstToken(rawText);
  if (token && FIRST_TOKEN[token]) {
    return { category: FIRST_TOKEN[token], source: 'dictionary' };
  }
  if (modelCategory && FRIDGE_CATEGORIES.has(modelCategory)) {
    return { category: modelCategory, source: 'model' };
  }
  if (modelIsFood === false) {
    return { category: 'nonfood', source: 'model' };
  }
  return { category: 'unknown', source: 'unknown' };
}

/**
 * Одна позиція чека → картка продукту.
 * @param {object} line сира позиція від vision
 * @param {string} purchaseDate ISO `YYYY-MM-DD`
 */
function normalizeLine(line, purchaseDate) {
  const raw = line.raw_text || '';
  const { category, source } = classify(
    raw,
    line.model_category,
    line.model_is_food,
  );

  const isFood = category !== 'nonfood' && category !== 'unknown'
    ? true
    : category === 'nonfood'
      ? false
      : line.model_is_food !== false;

  const storage = defaultStorage(category);
  const days = shelfLifeDays(category, storage);

  return {
    raw,
    name: cleanName(raw),
    category,
    category_label: CATEGORY_LABELS[category] || CATEGORY_LABELS.unknown,
    category_source: source,
    is_food: isFood,
    quantity: line.quantity || 1,
    unit: line.unit || 'шт',
    line_total: line.line_total || 0,
    barcode: line.barcode || '',
    barcode_resolvable: isGlobalEan(line.barcode),
    storage,
    shelf_life_days: days,
    expires_on: addDays(purchaseDate, days),
    // Чому саме такий термін — щоб інтерфейс міг це пояснити,
    // а не просто показати дату «з неба».
    shelf_life_reason:
      source === 'dictionary'
        ? `середній термін для категорії «${CATEGORY_LABELS[category]}»`
        : source === 'model'
          ? 'категорію визначено моделлю — перевірте дату'
          : 'категорія невідома — вкажіть термін вручну',
    needs_review: source !== 'dictionary',
  };
}

/**
 * Повний прохід по позиціях.
 * @returns {{items: object[], skipped: object[]}}
 */
function normalizeLines(lines, purchaseDate) {
  const items = [];
  const skipped = [];

  for (const line of lines || []) {
    if (isServiceLine(line.raw_text)) {
      skipped.push({ raw: line.raw_text, reason: 'службовий рядок' });
      continue;
    }
    const item = normalizeLine(line, purchaseDate);
    if (!item.is_food) {
      skipped.push({ raw: item.raw, name: item.name, reason: 'не їжа' });
      continue;
    }
    items.push(item);
  }

  return { items, skipped };
}

export {
  fold,
  isServiceLine,
  firstToken,
  cleanName,
  isGlobalEan,
  classify,
  normalizeLine,
  normalizeLines,
};
