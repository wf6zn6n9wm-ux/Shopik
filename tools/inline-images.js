/* Собирает единый файл: подставляет картинки из img/ обратно в HTML.

   Зачем: в рабочем виде приложение — index.html плюс папка img/, так
   быстрее открывается второй раз. Но для предпросмотра и для случаев,
   когда файл отдают одним куском, внешние ссылки не работают.

   Запуск: node tools/inline-images.js [куда.html]
   По умолчанию кладёт рядом: starshash/single.html */
const fs = require('fs');
const path = require('path');

const КОРЕНЬ = path.join(__dirname, '..', 'starshash');
const ФАЙЛ = path.join(КОРЕНЬ, 'index.html');
const ПАПКА = path.join(КОРЕНЬ, 'img');
const КУДА = process.argv[2] || path.join(КОРЕНЬ, 'single.html');

let s = fs.readFileSync(ФАЙЛ, 'utf8');
let вставлено = 0, пропущено = 0;

s = s.replace(/url\('img\/([^']+)'\)/g, (весь, имя) => {
  const п = path.join(ПАПКА, имя);
  if (!fs.existsSync(п)) { пропущено++; console.log('нет файла: ' + имя); return весь; }
  const тип = path.extname(имя).slice(1);
  вставлено++;
  return "url('data:image/" + тип + ";base64," + fs.readFileSync(п).toString('base64') + "')";
});

/* ракета Краша — картинкой внутри SVG, а не в стилях */
s = s.replace(/href="img\/([^"]+)"/g, (весь, имя) => {
  const п = path.join(ПАПКА, имя);
  if (!fs.existsSync(п)) { пропущено++; console.log('нет файла: ' + имя); return весь; }
  вставлено++;
  return 'href="data:image/' + path.extname(имя).slice(1) + ';base64,' + fs.readFileSync(п).toString('base64') + '"';
});

fs.writeFileSync(КУДА, s);
console.log('вставлено картинок: ' + вставлено + (пропущено ? ', пропущено ' + пропущено : ''));
console.log(path.relative(process.cwd(), КУДА) + ': ' + Math.round(s.length / 1024) + ' КБ');
