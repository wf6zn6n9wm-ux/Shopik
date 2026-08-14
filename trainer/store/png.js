/* ──────────────────────────────────────────────────────────────────
   Обрізання PNG зверху-ліворуч.

   Headless-браузер верстає сторінку на 87 пікселів нижчою за вікно, а
   знімок робить у розмір вікна — знизу лишається біла смуга. Досі це
   обходили тим, що малювали тло на всю сторінку й підбирали кольори;
   для іконок так не вийде: там потрібен точний розмір і жодного зайвого
   пікселя.

   Тому знімаємо із запасом і відрізаємо зайве. Пакетів для картинок тут
   немає, тож розбираємо PNG самі: zlib у Node є, а решта — арифметика.

   Підтримуємо те, що пише Chromium: 8 біт на канал, RGB або RGBA, без
   черезрядковості. Інші варіанти чесно кажуть про себе помилкою.
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunks(buf){
  const out = [];
  let i = 8;
  while (i < buf.length){
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    out.push({type, data: buf.subarray(i + 8, i + 8 + len)});
    i += 12 + len;
  }
  return out;
}

function chunk(type, data){
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 8 + data.length);
  return out;
}

/* зворотні фільтри PNG: кожен рядок закодований відносно сусідів */
function unfilter(raw, w, h, bpp){
  const line = w * bpp;
  const out = Buffer.alloc(h * line);
  let pos = 0;
  for (let y = 0; y < h; y++){
    const f = raw[pos++];
    const cur = out.subarray(y * line, (y + 1) * line);
    raw.copy(cur, 0, pos, pos + line);
    pos += line;
    const prev = y ? out.subarray((y - 1) * line, y * line) : null;
    for (let x = 0; x < line; x++){
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (f !== 0) throw new Error('невідомий фільтр PNG: ' + f);
      cur[x] = v & 255;
    }
  }
  return out;
}

/* пишемо без фільтрації: файли невеликі, а код зрозуміліший */
function refilter(px, w, h, bpp){
  const line = w * bpp;
  const out = Buffer.alloc(h * (line + 1));
  for (let y = 0; y < h; y++){
    out[y * (line + 1)] = 0;
    px.copy(out, y * (line + 1) + 1, y * line, (y + 1) * line);
  }
  return out;
}

/* обрізає зображення до w×h, лишаючи лівий верхній кут */
function crop(file, w, h){
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('це не PNG: ' + file);
  const cs = chunks(buf);
  const ihdr = cs.find(c => c.type === 'IHDR').data;
  const W = ihdr.readUInt32BE(0), H = ihdr.readUInt32BE(4);
  const depth = ihdr[8], color = ihdr[9], interlace = ihdr[12];
  if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0)
    throw new Error('очікували 8-бітний RGB/RGBA без черезрядковості, а тут depth=' +
                    depth + ' color=' + color + ' interlace=' + interlace);
  if (w > W || h > H) throw new Error('обрізати можна лише вниз: ' + W + '×' + H + ' → ' + w + '×' + h);
  if (w === W && h === H) return false;

  const bpp = color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter(c => c.type === 'IDAT').map(c => c.data)));
  const px = unfilter(raw, W, H, bpp);

  const line = W * bpp, want = w * bpp;
  const cut = Buffer.alloc(h * want);
  for (let y = 0; y < h; y++) px.copy(cut, y * want, y * line, y * line + want);

  const head = Buffer.from(ihdr);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  fs.writeFileSync(file, Buffer.concat([
    SIG, chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(refilter(cut, w, h, bpp), {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  return true;
}

function size(file){
  const b = fs.readFileSync(file).subarray(16, 24);
  return {w: b.readUInt32BE(0), h: b.readUInt32BE(4)};
}

/* збирає PNG із сирих пікселів — потрібно тестам, щоб перевірити
   обрізання на картинці, яку вони самі й намалювали */
function encode(px, w, h, bpp){
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8; head[9] = bpp === 4 ? 6 : 2;
  return Buffer.concat([
    SIG, chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(refilter(px, w, h, bpp))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* сирі пікселі назад — теж лише для перевірки */
function decode(file){
  const buf = fs.readFileSync(file);
  const cs = chunks(buf);
  const ihdr = cs.find(c => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  const bpp = ihdr[9] === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter(c => c.type === 'IDAT').map(c => c.data)));
  return {w, h, bpp, px: unfilter(raw, w, h, bpp)};
}

module.exports = {crop, size, encode, decode};
