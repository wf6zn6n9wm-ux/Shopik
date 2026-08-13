/* Перевірка локалізації Urok+.
   node urok/tests/i18n.js

   Ловить те, що око не ловить: забутий ключ в одній із трьох мов,
   різні набори підстановок {name} у перекладах, неповну множину. */
const {boot} = require('./harness');

const {U} = boot();
const {DICT, PLURALS, LANGS, CAL, makeT} = U;

let fails = 0;
const fail = m => { console.error('  ✗ ' + m); fails++; };
const ok = m => console.log('  ✓ ' + m);

const langs = LANGS.map(l => l.id);
const base = 'uk';
const baseKeys = Object.keys(DICT[base]);

console.log('i18n');

/* 1. однаковий набір ключів у всіх мовах */
langs.filter(l => l !== base).forEach(l => {
  const keys = Object.keys(DICT[l]);
  const missing = baseKeys.filter(k => !(k in DICT[l]));
  const extra = keys.filter(k => !(k in DICT[base]));
  if (missing.length) fail(`${l}: немає ключів — ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` (+${missing.length - 8})` : ''}`);
  if (extra.length) fail(`${l}: зайві ключі — ${extra.slice(0, 8).join(', ')}`);
});
if (!fails) ok(`${baseKeys.length} ключів × ${langs.length} мови`);

/* 2. підстановки {var} збігаються між мовами */
const vars = s => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
baseKeys.forEach(k => {
  const want = vars(DICT[base][k]);
  langs.filter(l => l !== base).forEach(l => {
    if (!(k in DICT[l])) return;
    const got = vars(DICT[l][k]);
    if (got !== want) fail(`${k} (${l}): підстановки «${got || '—'}» замість «${want || '—'}»`);
  });
});
if (!fails) ok('підстановки збігаються');

/* 3. порожні рядки — майже завжди забутий переклад */
langs.forEach(l => Object.keys(DICT[l]).forEach(k => {
  if (!String(DICT[l][k]).trim()) fail(`${k} (${l}) порожній`);
}));

/* 4. множина: три форми для uk/ru, дві для en */
Object.keys(PLURALS).forEach(kind => {
  langs.forEach(l => {
    const forms = PLURALS[kind][l];
    if (!forms) return fail(`plural ${kind}: немає форм для ${l}`);
    const want = l === 'en' ? 2 : 3;
    if (forms.length !== want) fail(`plural ${kind} (${l}): ${forms.length} форм замість ${want}`);
    forms.forEach(f => { if (!/\{n\}/.test(f)) fail(`plural ${kind} (${l}): у формі «${f}» немає {n}`); });
  });
});

/* 5. слов'янська множина на контрольних числах */
const t = makeT('uk');
const cases = [[1, '1 заняття'], [2, '2 заняття'], [5, '5 занять'], [11, '11 занять'], [21, '21 заняття'], [104, '104 заняття']];
cases.forEach(([n, want]) => {
  const got = t.plural('lesson', n);
  if (got !== want) fail(`plural uk lesson ${n}: «${got}» замість «${want}»`);
});
const te = makeT('en');
if (te.plural('lesson', 1) !== '1 lesson') fail('plural en 1');
if (te.plural('lesson', 3) !== '3 lessons') fail('plural en 3');
if (!fails) ok('множина рахується правильно');

/* 6. календар: 7 днів, 12 місяців у кожній мові */
langs.forEach(l => {
  const c = CAL[l];
  if (!c) return fail(`немає календаря для ${l}`);
  if (c.dowShort.length !== 7 || c.dowLong.length !== 7) fail(`${l}: днів тижня має бути 7`);
  if (c.monthGen.length !== 12 || c.monthNom.length !== 12) fail(`${l}: місяців має бути 12`);
});

/* 7. запасний варіант: невідомий ключ не ламає t() */
if (t('нема.такого') !== 'нема.такого') fail('t() має повертати сам ключ, якщо перекладу немає');
if (makeT('zz')('nav.calendar') !== DICT.uk['nav.calendar']) fail('невідома мова має падати на uk');
if (!fails) ok('запасні варіанти працюють');

console.log(fails ? `\n${fails} помилок локалізації` : '\nлокалізація ціла');
process.exit(fails ? 1 : 0);
