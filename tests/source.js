/* Проверка по исходнику, без браузера: словари, внешние связи,
   требования мини-аппа. Дешёвая и ловит самое обидное — забытый перевод. */
const { исходник, Отчёт } = require('./helpers');

const src = исходник();
const о = new Отчёт('source');

о.раздел('словари');
const линии = src.split('\n');
const нач = я => линии.findIndex(l => l.trim() === я + ':{');
/* последний словарь заканчивается закрытием самого I18N, а не следующим
   языком — иначе в него утекает код, идущий ниже */
const конец = линии.findIndex((l, i) => i > нач('ru') && /^\}\};?$/.test(l.trim()));
const блок = я => {
  const i = нач(я); if (i < 0) return null;
  const дальше = ['ru', 'en', 'uk'].map(нач).filter(j => j > i).sort((a, b) => a - b)[0];
  return линии.slice(i + 1, дальше > 0 ? дальше : конец).join('\n');
};
/* содержимое строк вырезаем: внутри переводов встречается «deposit: 100 ★»,
   и такое слово попадало бы в список ключей */
const ключи = т => new Set([...т.replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .matchAll(/(?:^|\s|,)([a-z][a-z0-9_]*)\s*:/g)].map(m => m[1]));

const ru = блок('ru'), en = блок('en'), uk = блок('uk');
о.проверка('все три словаря на месте', !!(ru && en && uk));
if (ru && en && uk) {
  const R = ключи(ru), E = ключи(en), U = ключи(uk);
  о.замечание('ключей: ru ' + R.size + ', en ' + E.size + ', uk ' + U.size);
  const нет = (A, B, имя) => {
    const п = [...A].filter(k => !B.has(k));
    о.проверка(имя + ' полный', п.length === 0, п.length ? 'не хватает: ' + п.join(', ') : '');
  };
  нет(R, E, 'en'); нет(R, U, 'uk');
  const лишние = [...new Set([...E, ...U])].filter(k => !R.has(k));
  о.проверка('лишних ключей в переводах нет', лишние.length === 0, лишние.join(', '));
}

о.раздел('внешние связи');
const внеш = [...new Set([...src.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]))];
const чужие = внеш.filter(u => !/telegram\.org/.test(u));
о.проверка('грузится только скрипт телеграма', чужие.length === 0, внеш.join(', '));
const сеть = [...new Set([...src.matchAll(/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/g)].map(m => m[1]))];
о.проверка('сетевых вызовов нет', сеть.length === 0, сеть.join(', '));

о.раздел('мини-апп');
[[/<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/, 'подключён telegram-web-app.js'],
 [/viewport-fit=cover/, 'вьюпорт с учётом вырезов'],
 [/user-scalable=no/, 'масштабирование пальцами отключено'],
 [/theme-color/, 'цвет темы задан']
].forEach(([re, что]) => о.проверка(что, re.test(src)));

о.раздел('опасные места');
[[/\beval\s*\(/g, 'eval'],
 [/console\.(log|warn|error)\s*\(/g, 'забытый console']
].forEach(([re, что]) => {
  const m = src.match(re);
  о.проверка('нет: ' + что, !m, m ? m.length + ' шт' : '');
});

process.exit(о.итог() ? 0 : 1);
