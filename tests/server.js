/* Сервер: подпись Telegram и совпадение экономики с приложением.

   Базы и Vercel тут нет — проверяем то, что можно проверить в чистом
   виде. Подпись важнее всего: на ней держится вся защита денег, а
   ошибка в ней тихо пускает внутрь кого угодно.

   Расхождение ставок между сервером и index.html игрок видит как
   «обсчитали»: приложение обещает 2%, а начисляют по 1.8%. */
const crypto = require('crypto');
const { исходник, Отчёт } = require('./helpers');
const S = require('../starshash/api/starshash.js');

const ТОКЕН = '111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/* Собираем initData так же, как это делает Telegram */
function подписать(поля, токен) {
  const p = new URLSearchParams(поля);
  const dcs = [...p.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([k, v]) => k + '=' + v).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(токен || ТОКЕН).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}
const ЧЕЛОВЕК = JSON.stringify({ id: 6029995640, first_name: 'Андрій', language_code: 'uk' });
const сейчас = () => String(Math.floor(Date.now() / 1000));

const о = new Отчёт('server');

о.раздел('подпись Telegram');
const свой = S.verifyInitData(подписать({ user: ЧЕЛОВЕК, auth_date: сейчас() }), ТОКЕН);
о.проверка('своя подпись принимается', !!свой && свой.id === 6029995640, свой ? свой.name : 'отказ');
о.проверка('имя и язык разобраны', !!свой && свой.name === 'Андрій' && свой.lang === 'uk');

const чужой = S.verifyInitData(подписать({ user: ЧЕЛОВЕК, auth_date: сейчас() }, '222:BBB'), ТОКЕН);
о.проверка('подпись чужим токеном отвергнута', чужой === null);

/* самое опасное: подменить id в уже подписанных данных */
const подмена = подписать({ user: ЧЕЛОВЕК, auth_date: сейчас() })
  .replace('6029995640', '1111111111');
о.проверка('подменённый id отвергнут', S.verifyInitData(подмена, ТОКЕН) === null);

о.проверка('без подписи отказ', S.verifyInitData('user=' + encodeURIComponent(ЧЕЛОВЕК), ТОКЕН) === null);
о.проверка('пустые данные отказ', S.verifyInitData('', ТОКЕН) === null && S.verifyInitData(null, ТОКЕН) === null);

const старый = подписать({ user: ЧЕЛОВЕК, auth_date: String(Math.floor(Date.now() / 1000) - 90000) });
о.проверка('вчерашняя подпись отвергнута', S.verifyInitData(старый, ТОКЕН) === null);

о.проверка('без токена внутрь не пускают',
  S.verifyInitData(подписать({ user: ЧЕЛОВЕК, auth_date: сейчас() }), '') === null);

/* метку приглашения берём из подписанных данных, а не от клиента */
const сМеткой = S.verifyInitData(
  подписать({ user: ЧЕЛОВЕК, auth_date: сейчас(), start_param: 'ref_777' }), ТОКЕН);
о.проверка('метка приглашения приходит подписанной',
  !!сМеткой && сМеткой.start_param === 'ref_777', сМеткой ? сМеткой.start_param : '—');

о.раздел('экономика сходится с приложением');
const src = исходник();
const базовая = Number((src.match(/var BASE_YIELD\s*=\s*([\d.]+)/) || [])[1]);
о.проверка('базовая ставка та же', базовая === S.BASE_YIELD, базовая + ' / ' + S.BASE_YIELD);

const блок = (src.match(/var BOOSTS=\[([\s\S]*?)\];/) || [])[1] || '';
const пары = [...блок.matchAll(/\{y:([\d.]+),\s*price:(\d+)\}/g)].map(m => [Number(m[1]), Number(m[2])]);
о.проверка('пакетов столько же', пары.length === S.BOOSTS.length, пары.length + ' / ' + S.BOOSTS.length);
const разошлись = пары.filter((p, i) => !S.BOOSTS[i] || S.BOOSTS[i].y !== p[0] || S.BOOSTS[i].price !== p[1]);
о.проверка('ставки и цены совпадают', разошлись.length === 0,
  разошлись.map(p => p[1] + '★→' + p[0] + '%').join(', '));

/* точки перелома важнее середины: там ошибка на единицу меняет ставку */
[[0, 1.0], [99, 1.0], [100, 1.2], [199, 1.2], [200, 1.4], [99999, 3.5], [100000, 5.0]]
  .forEach(([v, ждём]) => о.проверка('вклад ' + v + ' → ' + ждём + '%', S.rateFor(v) === ждём, String(S.rateFor(v))));

о.раздел('ежедневный бонус');
const первый = Number((src.match(/var DAILY=\[(\d+)\]/) || [])[1]);
const длина = Number((src.match(/while\(DAILY\.length<(\d+)\)/) || [])[1]);
const дальше = Number((src.match(/DAILY\.push\((\d+)\)/) || [])[1]);
о.проверка('первый день совпадает', первый === S.DAILY.first, первый + ' / ' + S.DAILY.first);
о.проверка('остальные дни совпадают', дальше === S.DAILY.rest, дальше + ' / ' + S.DAILY.rest);
о.проверка('длина лесенки совпадает', длина === S.DAILY.len, длина + ' / ' + S.DAILY.len);

о.раздел('без настроек не падает');
о.проверка('токен и ключи не вшиты в код',
  !/\d{8,10}:AA[\w-]{30,}/.test(require('fs').readFileSync(__dirname + '/../starshash/api/starshash.js', 'utf8')));

process.exit(о.итог() ? 0 : 1);
