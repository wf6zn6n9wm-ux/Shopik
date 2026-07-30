// Контракт сервер↔клиент по ИМЕНАМ полей.
//
// Три раза подряд ловил один и тот же класс ошибки: сервер переименовал поле
// (ton → stars), клиент продолжал читать старое, и экран показывал NaN или
// пустоту. Ни один тест этого не видел, потому что оба файла по отдельности
// синтаксически исправны. Здесь проверяется именно стык: каждое поле, которое
// клиент читает из ответа, сервер обязан отдавать под тем же именем.
const { app } = require('./paths');
const fs = require('fs');
const SRV = fs.readFileSync(app('api/shark.js'), 'utf8');
const CLI = fs.readFileSync(app('index.html'), 'utf8');

let bad = 0;
const ok = (name, cond, hint) => {
  console.log((cond ? '  ok  ' : '  FAIL ') + name + (cond ? '' : '   ← ' + (hint || '')));
  if (!cond) bad++;
};
const sect = (s) => console.log('\n— ' + s + ' —');

// Достаём тело литерала объекта по имени ключа: srvBlock('config') вернёт всё
// от «config: {» до закрывающей скобки того же уровня.
function srvBlock(key) {
  const at = SRV.indexOf(key + ': {');
  if (at < 0) return '';
  let i = SRV.indexOf('{', at), depth = 0;
  for (let j = i; j < SRV.length; j++) {
    if (SRV[j] === '{') depth++;
    else if (SRV[j] === '}') { depth--; if (!depth) return SRV.slice(i, j + 1); }
  }
  return '';
}
// Ключи бывают двух видов: «name: value» и сокращённый «name,». Второй вид
// как раз и прятал поля earnedStars/new24h — их регулярка с двоеточием не
// видела, и тест зеленел там, где смотреть было нечего.
function srvKeys(block) {
  const out = [];
  // Комментарии в конце строки вырезаем: иначе «rake7d: x, // что осталось»
  // разрывает цепочку разделителей и следующий ключ теряется.
  block = block.replace(/\/\/[^\n]*/g, '');
  // Разделитель — только в lookahead. Если его съесть, то в строке
  // «users, new24h, new7d,» запятая уйдёт в предыдущее совпадение и каждый
  // второй ключ потеряется — именно так тест и пропускал new24h с active24h.
  const re = /(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g;
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

// ---- state.config / state.referrals ----
sect('state: конфиг и рефералка');
const cfg = srvKeys(srvBlock('config'));
const refs = srvKeys(srvBlock('referrals'));

// что клиент читает
const cliCfg = [...CLI.matchAll(/\bcfg\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
const cliRef = [...CLI.matchAll(/\bREF\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);

ok('config отдаётся', cfg.length > 0, 'не нашёл блок config в ответе state');
for (const k of [...new Set(cliCfg)]) {
  ok('cfg.' + k + ' есть на сервере', cfg.includes(k), 'сервер такого поля не отдаёт');
}
for (const k of [...new Set(cliRef)]) {
  // count/earnedStars/sharePct/bonusStars/friends приходят из referrals
  ok('REF.' + k + ' есть на сервере', refs.includes(k), 'сервер такого поля не отдаёт');
}
ok('в конфиге нет TON-полей', !cfg.some((k) => /Ton$/.test(k)), cfg.filter((k) => /Ton$/.test(k)).join(','));
ok('в рефералке нет TON-полей', !refs.some((k) => /Ton$/.test(k)), refs.filter((k) => /Ton$/.test(k)).join(','));

// ---- admin_stats ----
sect('admin_stats: сводка');
const st = srvKeys(srvBlock('stats'));
const cliSt = [...CLI.matchAll(/\bs\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  // s.* встречается и вне админки, поэтому сверяем только то, что похоже на сводку
  .filter((k) => /^(users|new24h|new7d|active24h|openClaims|starsHeld|starsInClaims|bets7d|wins7d|rake7d|topups7d|grants7d|referral7d|scan|tonHeld|tonPendingWithdraw|pendingWithdrawals)$/.test(k));
ok('stats отдаётся', st.length > 0);
for (const k of [...new Set(cliSt)]) {
  ok('s.' + k + ' есть на сервере', st.includes(k), 'админка читает поле, которого нет');
}

// ---- admin_players ----
sect('admin_players: игроки');
const plAt = SRV.indexOf('players: rows.map(');
const plBlock = plAt < 0 ? '' : SRV.slice(plAt, SRV.indexOf('}))', plAt));
const plKeys = srvKeys(plBlock);
const cliPl = [...CLI.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  .filter((k) => /^(tg_id|name|username|lang|stars|wonStars|played|banned|isAdmin|createdAt|lastSeen|ton|wonTon)$/.test(k));
ok('players отдаётся', plKeys.length > 0);
for (const k of [...new Set(cliPl)]) {
  ok('p.' + k + ' есть на сервере', plKeys.includes(k), 'список игроков читает поле, которого нет');
}

// ---- publicUser ----
sect('publicUser: то, что рисует баланс');
const puAt = SRV.indexOf('function publicUser');
const puBlock = SRV.slice(puAt, SRV.indexOf('\n}', puAt));
const puKeys = srvKeys(puBlock);
const cliUser = [...CLI.matchAll(/\bu\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  .filter((k) => /^(stars|wonStars|played|rank|tg_id|username|first_name|lang|refCode|ton|wonTon)$/.test(k));
for (const k of [...new Set(cliUser)]) {
  // rank сервер пока не считает — тайл сознательно показывает прочерк
  if (k === 'rank') { ok('u.rank — известный пробел, читается как 0', true); continue; }
  ok('u.' + k + ' есть на сервере', puKeys.includes(k), 'applyUser читает поле, которого нет');
}

// ---- таблицы, которых больше нет ----
sect('мёртвые сущности');
for (const t of ['shark_withdrawals', 'min_withdraw_ton', 'min_topup_ton', 'withdraw_hours', 'referral_bonus_ton']) {
  ok('нет обращений к ' + t, !SRV.includes(t), 'осталось в api/shark.js');
}
ok('клиент не читает поля с суффиксом Ton',
  !/\b(?:s|p|u|cfg|REF)\.\w*Ton\b/.test(CLI),
  (CLI.match(/\b(?:s|p|u|cfg|REF)\.\w*Ton\b/g) || []).join(','));

console.log(bad ? ('\n✗ провалов: ' + bad) : '\n✓ контракт сервер↔клиент согласован');
process.exit(bad ? 1 : 0);
