// Сходинки: дешева модель читає чек, дорога вмикається лише за доказом.
//
//   node test/ladder.js
//
// Ключ, мережа й node_modules не потрібні: SDK підвантажується ліниво,
// а замість клієнта підставляється підробка. Саме тому тут перевіряється
// поведінка, а не текст файлу.

import { read, extract, setClient } from '../api/receipt.js';
import { ATB_COMPLETE, CROPPED_RECEIPT } from './fixtures.js';

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

// Змазане фото — найчистіший спосіб отримати 'partial': числа зійшлися,
// але модель сама зізналась, що частину тексту вгадувала.
const BLURRY = {
  ...ATB_COMPLETE,
  image_quality: { top_cut_off: false, bottom_cut_off: false, blurry: true },
};

const IMAGE = 'data:image/jpeg;base64,AAAA';

/**
 * Підробка SDK. Віддає заготовлені відповіді по черзі й записує, з якими
 * параметрами її кликали, — щоб перевірити ще й те, що `effort` не летить
 * у модель, яка його не розуміє.
 */
function fakeClient(replies) {
  const calls = [];
  let n = 0;
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params);
        const reply = replies[n++];
        return {
          async finalMessage() {
            if (reply instanceof Error) throw reply;
            return {
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: JSON.stringify(reply) }],
              usage: { input_tokens: 1000, output_tokens: 500 },
            };
          },
        };
      },
    },
  };
}

// ── 1. Дешева модель упоралась ─────────────────────────────────────────
section('Чек зійшовся з першого разу');

let fake = fakeClient([ATB_COMPLETE]);
setClient(fake);
let r = await read(IMAGE);

check('вердикт', r.validation.verdict, 'ok');
check('одна спроба — дорогу не кликали', r.attempts.length, 1);
check('спроба була дешевою моделлю', r.attempts[0].model, 'claude-haiku-4-5');
check('усього викликів моделі', fake.calls.length, 1);
check('позиції на місці', r.items.length, 2);

// ── 2. Ескалація, і вона допомогла ─────────────────────────────────────
section('Дешева не впевнена, дорога прочитала');

fake = fakeClient([BLURRY, ATB_COMPLETE]);
setClient(fake);
r = await read(IMAGE);

check('вердикт після ескалації', r.validation.verdict, 'ok');
check('спроб дві', r.attempts.length, 2);
check('друга — дорога модель', r.attempts[1].model, 'claude-opus-5');
check('обидві спроби пораховані', r.attempts.map((a) => a.model),
  ['claude-haiku-4-5', 'claude-opus-5']);

// ── 3. Ескалація не допомогла ──────────────────────────────────────────
section('Дорога теж не впоралась');

fake = fakeClient([BLURRY, BLURRY]);
setClient(fake);
r = await read(IMAGE);

check('лишили чесний partial', r.validation.verdict, 'partial');
check('але заплатили за обидві спроби', r.attempts.length, 2);

// ── 4. Обрізаний чек — ескалації немає ─────────────────────────────────
section('Обрізаний чек: другу модель не кличемо');

fake = fakeClient([CROPPED_RECEIPT, ATB_COMPLETE]);
setClient(fake);
r = await read(IMAGE);

check('вердикт', r.validation.verdict, 'reshoot');
check('дорогу модель не кликали', fake.calls.length, 1);
check('спроба одна', r.attempts.length, 1);
check('просимо перезняти', r.validation.suggested_action, 'reshoot_full');

// ── 5. Дорога модель впала ─────────────────────────────────────────────
section('Дорога модель недоступна');

fake = fakeClient([BLURRY, new Error('overloaded')]);
setClient(fake);
r = await read(IMAGE);

check('віддали те, що прочитала дешева', r.validation.verdict, 'partial');
check('позиції не загубились', r.items.length, 2);
check('спроба зарахована одна', r.attempts.length, 1);

// ── 6. Параметри запиту ────────────────────────────────────────────────
section('Що саме летить у модель');

fake = fakeClient([BLURRY, ATB_COMPLETE]);
setClient(fake);
await read(IMAGE);

check('дешева модель — без effort', 'effort' in fake.calls[0].output_config, false);
check('дорога модель — з effort', fake.calls[1].output_config.effort, 'medium');
check('схема в обох', fake.calls.map((c) => c.output_config.format.type),
  ['json_schema', 'json_schema']);
check('картинка їде першим блоком', fake.calls[0].messages[0].content[0].type, 'image');

// ── 7. Вимкнена друга сходинка ─────────────────────────────────────────
// README обіцяє, що порожнє AI_MODEL_FALLBACK вимикає ескалацію. Модуль
// читає змінну при завантаженні, тому імпортуємо його вдруге, з іншим
// оточенням: інакше перевірялася б не обіцянка, а вже готова константа.
section('AI_MODEL_FALLBACK= вимикає ескалацію');

process.env.AI_MODEL_FALLBACK = '';
const solo = await import('../api/receipt.js?solo');
const soloFake = fakeClient([BLURRY, ATB_COMPLETE]);
solo.setClient(soloFake);
const soloResult = await solo.read(IMAGE);

check('друга сходинка вимкнена', solo.FALLBACK, '');
check('дорогу модель не кликали', soloFake.calls.length, 1);
check('спроба одна', soloResult.attempts.length, 1);
check('чек віддали як є', soloResult.validation.verdict, 'partial');
delete process.env.AI_MODEL_FALLBACK;

// ── 8. Погане на вході ─────────────────────────────────────────────────
section('Погане на вході');

setClient(fakeClient([ATB_COMPLETE]));
let err = await extract('не картинка').catch((e) => e);
check('не data-URL — 400', err.status, 400);

err = await extract(`data:image/jpeg;base64,${'A'.repeat(9 * 1024 * 1024)}`).catch((e) => e);
check('завелике фото — 413', err.status, 413);

console.log(failures === 0 ? '\nУсі перевірки пройдено.' : `\nПРОВАЛЕНО перевірок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
