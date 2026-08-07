/* Вынимает картинки из index.html в файлы и заменяет их на ссылки.

   Зачем: HTML браузер перепроверяет при каждом открытии, а файлы с
   отпечатком в имени кэширует навсегда. Со встроенными картинками
   человек качал весь мегабайт заново при каждом заходе.

   Запуск: node tools/split-images.js
   Повторный запуск ничего не ломает: уже вынесенные картинки пропускаются.

   Обратная операция — tools/inline-images.js: собирает единый файл для
   предпросмотра, где внешние ссылки не работают. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const КОРЕНЬ = path.join(__dirname, '..', 'starshash');
const ФАЙЛ = path.join(КОРЕНЬ, 'index.html');
const ПАПКА = path.join(КОРЕНЬ, 'img');

let s = fs.readFileSync(ФАЙЛ, 'utf8');
fs.mkdirSync(ПАПКА, { recursive: true });

/* Имя выводим из селектора: так в папке видно, что где лежит, и правка
   одной картинки не перетасовывает остальные. */
function имяИз(селектор) {
  const м = селектор.match(/html\[lang="(\w+)"\]/);
  const язык = м ? м[1] : 'ru';
  const s = селектор.replace(/\s+/g, ' ').trim();
  let база =
    /art-crash/.test(s) ? 'crash' :
    /art-pvp/.test(s) && /\.art\b/.test(s) ? 'pvp' :
    /art-kase/.test(s) ? 'kase' :
    (s.match(/\.rv-(\w+)/) || [])[1] ? 'rv-' + s.match(/\.rv-(\w+)/)[1] :
    (s.match(/\.av-(\d+)/) || [])[1] ? 'av-' + s.match(/\.av-(\d+)/)[1] :
    /\.reel\b/.test(s) ? 'reel' :
    null;
  if (!база) return null;
  /* язык дописываем только тем, у кого он есть */
  return /crash|pvp|kase/.test(база) ? база + '-' + язык : база;
}

const пат = /([^{}\n][^{}]*)\{([^{}]*)url\('data:image\/(\w+);base64,([^']+)'\)/g;
const занято = new Set();
let вынесено = 0, байт = 0;
let итог = '', позиция = 0, m;

while ((m = пат.exec(s)) !== null) {
  const [весь, селектор, доURL, тип, база64] = m;
  const имя = имяИз(селектор);
  if (!имя) { console.log('пропускаю, не понял селектор: ' + селектор.trim().slice(-60)); continue; }

  const бин = Buffer.from(база64, 'base64');
  const отпечаток = crypto.createHash('sha1').update(бин).digest('hex').slice(0, 8);
  let файл = имя + '.' + отпечаток + '.' + тип;
  if (занято.has(файл)) { console.log('повтор имени: ' + файл); continue; }
  занято.add(файл);

  fs.writeFileSync(path.join(ПАПКА, файл), бин);
  вынесено++; байт += бин.length;

  const конецURL = m.index + весь.length;
  итог += s.slice(позиция, m.index) + селектор + '{' + доURL + "url('img/" + файл + "')";
  позиция = конецURL;
}
итог += s.slice(позиция);

/* Ракета Краша лежит не в стилях, а картинкой внутри SVG — её ловим
   отдельно, иначе двадцать килобайт остались бы в HTML. */
итог = итог.replace(/<image([^>]*?)href="data:image\/(\w+);base64,([^"]+)"/g, (весь, до, тип, б64) => {
  const бин = Buffer.from(б64, 'base64');
  const отпечаток = crypto.createHash('sha1').update(бин).digest('hex').slice(0, 8);
  const файл = 'rocket.' + отпечаток + '.' + тип;
  fs.writeFileSync(path.join(ПАПКА, файл), бин);
  вынесено++; байт += бин.length;
  return '<image' + до + 'href="img/' + файл + '"';
});

fs.writeFileSync(ФАЙЛ, итог);
console.log('вынесено картинок: ' + вынесено + ', ' + Math.round(байт / 1024) + ' КБ');
console.log('index.html: ' + Math.round(s.length / 1024) + ' → ' + Math.round(итог.length / 1024) + ' КБ');
