// Пути к файлам приложения — для тестов на чистом Node.
//
// Тесты подгружают боевые модули как есть (require('api/shark.js')) и читают
// index.html со schema.sql как текст, поэтому им нужен корень приложения, а не
// текущая директория: прогон из любого места должен давать один результат.
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// app('api/shark.js') → /…/shark/api/shark.js
function app(rel) { return path.join(ROOT, rel); }

module.exports = { ROOT, app };
