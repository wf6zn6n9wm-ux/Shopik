// Сирий витяг → відповідь застосунку.
//
// Навмисно без жодної залежності від SDK: усе, що тут відбувається,
// детерміноване й тестується офлайн, без ключа і без мережі.

import { normalizeLines } from './normalize.js';
import { validateReceipt } from './validate.js';

/**
 * @param {object} raw результат vision за схемою RECEIPT_SCHEMA
 */
function build(raw) {
  const purchaseDate = raw.receipt?.date || '';
  const { items, skipped } = normalizeLines(raw.lines, purchaseDate);

  // Перевірка суми рахує ВСІ рядки чека, включно з не-їжею: надрукований
  // підсумок теж включає пакет і точилку. Якби ми рахували лише те, що
  // йде в холодильник, чек ніколи б не сходився.
  const validation = validateReceipt(
    raw.lines,
    raw.receipt || {},
    raw.image_quality || {},
  );

  return {
    ok: true,
    store: raw.store,
    receipt: raw.receipt,
    validation,
    items,
    skipped,
    stats: {
      lines_read: (raw.lines || []).length,
      items_added: items.length,
      items_skipped: skipped.length,
      needs_review: items.filter((i) => i.needs_review).length,
    },
  };
}

export { build };
