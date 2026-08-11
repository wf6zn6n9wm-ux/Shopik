// Офлайн-прогін пайплайна на справжніх чеках. Ключ і мережа не потрібні.
//
//   node test/run.js

import { build } from '../lib/pipeline.js';
import { tally, summarize, report } from '../lib/batchstats.js';
import { isGlobalEan, cleanName, firstToken } from '../lib/normalize.js';
import { ATB_COMPLETE, CROPPED_RECEIPT, WITH_SERVICE_LINES } from './fixtures.js';

let failures = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n      очікували ${e}\n      отримали  ${a}`}`);
}

function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// ── 1. Справжній чек АТБ ───────────────────────────────────────────────
section('Чек 1 · АТБ, Чорноморськ, 24.08.2025');

const r1 = build(ATB_COMPLETE);
console.log(`  ${r1.validation.sum.message}`);
check('вердикт', r1.validation.verdict, 'ok');
check('сума позицій', r1.validation.sum.lines_sum, 77.4);
check('ПДВ сходиться зі ставкою', r1.validation.vat.ok, true);
check('позицій додано', r1.items.length, 2);

const [rollini, baton] = r1.items;
check('Ролліні · назва', rollini.name, 'Ролліні 95 г з телятиною');
check('Ролліні · категорія', rollini.category, 'meat_snack');
check('Ролліні · джерело категорії', rollini.category_source, 'model');
check('Ролліні · термін', rollini.expires_on, '2025-08-27');
check('Ролліні · код 2999… внутрішній', rollini.barcode_resolvable, false);
check('Ролліні · потребує перевірки', rollini.needs_review, true);

check('Батончик · назва', baton.name, 'Батончик 90 г Nestle Lion King');
check('Батончик · категорія', baton.category, 'sweets');
check('Батончик · джерело категорії', baton.category_source, 'dictionary');
check('Батончик · код Nestlé резолвиться', baton.barcode_resolvable, true);
check('Батончик · не потребує перевірки', baton.needs_review, false);

// ── 2. Справжній обрізаний чек ─────────────────────────────────────────
section('Чек 2 · обрізаний зверху, 11.01.2022');

const r2 = build(CROPPED_RECEIPT);
console.log(`  ${r2.validation.sum.message}`);
console.log(`  ${r2.validation.vat.message}`);
check('вердикт — перезняти', r2.validation.verdict, 'reshoot');
check('сума позицій', r2.validation.sum.lines_sum, 69.9);
check('не вистачає, ₴', r2.validation.sum.missing, 239.6);
check('ПДВ не сходиться', r2.validation.vat.ok, false);
check('розпізнано частку чека', r2.validation.recognized_share, 0.23);
check('дія для інтерфейсу', r2.validation.suggested_action, 'reshoot_full');
check('позицій додано', r2.items.length, 2);
check('точилку відсіяно', r2.skipped.some((s) => s.reason === 'не їжа'), true);
check('вода · категорія', r2.items[1].category, 'drinks_water');
check('вода · термін', r2.items[1].expires_on, '2023-01-11');
check('цукерки · комора, не холодильник', r2.items[0].storage, 'pantry');

// ── 3. Службові рядки серед позицій ────────────────────────────────────
section('Чек 3 · службові рядки та не-їжа');

const r3 = build(WITH_SERVICE_LINES);
check('позицій додано', r3.items.length, 3);
check('«Готівка» відсіяна', r3.skipped.some((s) => s.reason === 'службовий рядок'), true);
check('«Пакет-майка» відсіяна', r3.skipped.some((s) => s.reason === 'не їжа'), true);
check('молоко · 7 днів', r3.items[0].expires_on, '2026-08-17');
check('шпинат · 3 дні', r3.items[1].expires_on, '2026-08-13');
check('фарш · 2 дні', r3.items[2].expires_on, '2026-08-12');
check('усі три зі словника', r3.items.every((i) => i.category_source === 'dictionary'), true);

// ── 4. Одиничні функції ────────────────────────────────────────────────
section('Юніти');

check('EAN Nestlé валідний', isGlobalEan('7613036731713'), true);
check('внутрішній код 2… відхилено', isGlobalEan('2999300069184'), false);
check('порожній код', isGlobalEan(''), false);
check('перший токен ігнорує кількість', firstToken('2. X 24,90 = Точилка-гумка'), 'точилка');
check('арт. прибирається', cleanName('Точилка-гумка 2 в 1, арт. МР58320'), 'Точилка-гумка 2 в 1');
check('м/уп прибирається', cleanName('Цукерки 80 г жувальні Bebeto Worms м/уп'), 'Цукерки 80 г жувальні Bebeto Worms');

// ── Прогін пачки: підрахунок на тих самих справжніх чеках ──────────────
// Скрипт tools/batch.js людина запустить один раз, маючи ключ. Якщо він
// на той момент виявиться зламаним, це з'ясується найгіршим способом —
// тому рахунок перевіряється тут, офлайн.
const rows = [tally('atb.jpg', r1), tally('cut.jpg', r2)];
const sum = summarize(rows);

check('пачка: чеків пораховано', sum.receipts, 2);
check('пачка: повний чек зійшовся', rows[0].sum_ok, true);
check('пачка: обрізаний не зійшовся', rows[1].sum_ok, false);
check('пачка: вердикт обрізаного', rows[1].verdict, 'reshoot');
check('пачка: зійшовся рівно один', sum.sum_ok, 1);
check('пачка: позицій усього', sum.positions, r1.items.length + r2.items.length);
check('пачка: словник + модель + невідомі сходяться',
  sum.src.dictionary + sum.src.model + sum.src.unknown, sum.positions);
check('пачка: частка словника між 0 і 1', sum.dict_share > 0 && sum.dict_share <= 1, true);
check('пачка: «Ролліні» потрапило у список невідомих',
  sum.unknown_tokens.some((t) => t.token === 'ролліні'), true);
check('пачка: у невідомого є приклад із чека',
  sum.unknown_tokens[0].examples.length > 0, true);

const md = report(rows, sum, [{ name: 'bad.heic', error: 'формат' }]);
check('звіт: є заголовок', md.startsWith('# Прогін чеків'), true);
check('звіт: є розділ словника', md.includes('Слова, яких немає у словнику'), true);
check('звіт: є розділ ручної звірки', md.includes('Для ручної звірки'), true);
check('звіт: невдачі не загубились', md.includes('bad.heic'), true);
check('звіт: назви позицій виписані', md.includes(r1.items[0].name), true);

// ── Підсумок ───────────────────────────────────────────────────────────
const total = r1.items.length + r2.items.length + r3.items.length;
const fromDict =
  [...r1.items, ...r2.items, ...r3.items].filter((i) => i.category_source === 'dictionary').length;

console.log(`\n${'═'.repeat(52)}`);
console.log(`Позицій оброблено: ${total}`);
console.log(`Категорію дав словник: ${fromDict}/${total} (${Math.round((fromDict / total) * 100)}%)`);
console.log(`Решта — фолбек на модель, позначені needs_review.`);
console.log(failures === 0 ? '\nУсі перевірки пройдено.' : `\nПРОВАЛЕНО перевірок: ${failures}`);

process.exit(failures === 0 ? 0 : 1);
