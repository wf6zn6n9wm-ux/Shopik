// Перевірка цілісності чека.
//
// Це найважливіша частина всього ендпоінта. Без неї «90% точності»
// означає «90% на тих чеках, які ми показуємо в маркетингу»: додаток
// мовчки покладе в холодильник 3 позиції з 12 і нічого не скаже.
//
// Обидва контрольні числа надруковані на самому чеку — жодних зовнішніх
// джерел, жодних інтеграцій. Перевірка безкоштовна.

const CENT = 0.011; // допуск на копійчані округлення мережі

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Сума позицій проти надрукованого підсумку.
 *
 * Спрацювало на реальному чеку: розпізналось 69,90 ₴ при підсумку 309,50 ₴ —
 * верх стрічки не потрапив у кадр.
 */
function checkSum(lines, printedTotal) {
  const sum = round2(
    (lines || []).reduce((acc, l) => acc + (Number(l.line_total) || 0), 0),
  );

  if (!printedTotal) {
    return {
      ok: false,
      status: 'no_total',
      message: 'На фото не видно підсумкової суми — перезніміть низ чека.',
      lines_sum: sum,
      printed_total: null,
      missing: null,
    };
  }

  const missing = round2(printedTotal - sum);

  if (Math.abs(missing) <= CENT) {
    return {
      ok: true,
      status: 'balanced',
      message: `Чек зійшовся · ${sum.toFixed(2)} = ${printedTotal.toFixed(2)}`,
      lines_sum: sum,
      printed_total: printedTotal,
      missing: 0,
    };
  }

  if (missing > 0) {
    return {
      ok: false,
      status: 'incomplete',
      message: `Не вистачає ${missing.toFixed(2)} ₴ — частина чека не в кадрі.`,
      lines_sum: sum,
      printed_total: printedTotal,
      missing,
    };
  }

  return {
    ok: false,
    status: 'over',
    message: `Позицій на ${Math.abs(missing).toFixed(2)} ₴ більше за підсумок — можливо, рядок продубльовано.`,
    lines_sum: sum,
    printed_total: printedTotal,
    missing,
  };
}

/**
 * Перехресна перевірка ПДВ. Другий, незалежний сигнал.
 *
 * Якщо весь чек за ставкою 20%, то ПДВ = сума / 6. На реальному чеку
 * 309,50 / 6 = 51,58, а надруковано 44,88 — отже вище були позиції за
 * іншою ставкою, тобто чек точно неповний.
 */
function checkVat(printedTotal, vatAmount, vatRate = 20) {
  if (!printedTotal || !vatAmount || !vatRate) {
    return { ok: true, status: 'skipped', message: '', expected: null };
  }

  const expected = round2(printedTotal - printedTotal / (1 + vatRate / 100));
  const delta = round2(Math.abs(expected - vatAmount));

  if (delta <= CENT) {
    return {
      ok: true,
      status: 'uniform_rate',
      message: `ПДВ сходиться зі ставкою ${vatRate}%.`,
      expected,
    };
  }

  return {
    ok: false,
    status: 'mixed_rates',
    message:
      `ПДВ ${vatAmount.toFixed(2)} ₴ не сходиться зі ставкою ${vatRate}% ` +
      `(очікували ${expected.toFixed(2)} ₴) — у чеку є позиції за іншою ставкою.`,
    expected,
  };
}

/**
 * Підсумковий вердикт для інтерфейсу.
 * @returns {{verdict: 'ok'|'partial'|'reshoot', ...}}
 */
function validateReceipt(lines, receipt, imageQuality = {}) {
  const sum = checkSum(lines, receipt.total);
  const vat = checkVat(receipt.total, receipt.vat_amount, receipt.vat_rate);

  const cropped = imageQuality.top_cut_off || imageQuality.bottom_cut_off;
  const recognizedShare =
    receipt.total > 0 ? round2(sum.lines_sum / receipt.total) : null;

  let verdict = 'ok';
  const reasons = [];

  if (!sum.ok) {
    reasons.push(sum.message);
    verdict = sum.status === 'over' ? 'partial' : 'reshoot';
  }
  if (!vat.ok) {
    reasons.push(vat.message);
    if (verdict === 'ok') verdict = 'partial';
  }
  if (cropped) {
    reasons.push(
      imageQuality.top_cut_off
        ? 'Верх чека не в кадрі.'
        : 'Низ чека не в кадрі.',
    );
    verdict = 'reshoot';
  }
  if (imageQuality.blurry) {
    reasons.push('Фото змазане.');
    if (verdict === 'ok') verdict = 'partial';
  }

  return {
    verdict,
    sum,
    vat,
    recognized_share: recognizedShare,
    reasons,
    // Що показати користувачу однією кнопкою.
    suggested_action:
      verdict === 'ok'
        ? 'add_all'
        : verdict === 'reshoot'
          ? 'reshoot_full'
          : 'add_partial',
  };
}

export { round2, checkSum, checkVat, validateReceipt };
