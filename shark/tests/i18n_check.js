// Проверка полноты словарей: каждый ключ, который клиент реально просит,
// должен быть во всех трёх языках. Ключ, которого нет, t() вернёт как есть —
// пользователь увидит «gft_st_held» вместо слова, и никакой ошибки не будет.
const { app } = require('./paths');
const fs = require('fs');
const src = fs.readFileSync(app('index.html'), 'utf8');
const code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

// словари
const dictSrc = code.match(/var I18N=\{[\s\S]*?\n\};/)[0];
const I18N = eval('(' + dictSrc.replace('var I18N=', '') .replace(/;$/, '') + ')');
const langs = Object.keys(I18N);

// ключи, запрошенные литералами t('x') / tf('x',...)
const used = new Set();
for (const m of code.matchAll(/\bt\(\s*'([a-z0-9_]+)'\s*\)/g)) used.add(m[1]);
// tf('rw_t_'+key) — префикс, а не ключ: такие семейства перечислены в dyn
const PREFIX = /_$/;
for (const m of code.matchAll(/\btf\(\s*'([a-z0-9_]+)'/g)) used.add(m[1]);
// ключи из IDMAP в applyI18n
const mapSrc = code.match(/function applyI18n\(\)\{[\s\S]*?\n  \};/)[0];
for (const m of mapSrc.matchAll(/:\s*'([a-z0-9_]+)'/g)) used.add(m[1]);
// динамические семейства, собираемые конкатенацией
const dyn = ['gft_st_held','gft_st_sending','gft_st_sent',
             'claim_st_new','claim_st_in_review','claim_st_done','claim_st_rejected',
             'rw_g_daily','rw_g_once',
             'rw_t_play3','rw_t_visit','rw_t_pvp1','rw_t_play25','rw_t_win1000','rw_t_ref3','rw_t_case1',
             'gft_f_all','gft_f_held','gft_f_sent',
             'rarity_common','rarity_rare','rarity_epic','rarity_legendary'];
dyn.forEach((k) => used.add(k));

let bad = 0;
for (const k of Array.from(used).sort()) {
  if (PREFIX.test(k)) continue;
  const missing = langs.filter((l) => I18N[l][k] == null);
  if (missing.length) { console.log('MISSING', k, '→', missing.join(',')); bad++; }
}
// и обратно: ключи, которые есть в uk, но забыты в ru/en
for (const k of Object.keys(I18N.uk)) {
  const missing = langs.filter((l) => I18N[l][k] == null);
  if (missing.length) { console.log('UNTRANSLATED', k, '→', missing.join(',')); bad++; }
}
console.log(bad ? '\nFAIL: ' + bad : 'i18n OK — ' + used.size + ' used keys, ' + langs.join('/'));
process.exit(bad ? 1 : 0);
