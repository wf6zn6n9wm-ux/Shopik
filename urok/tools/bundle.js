/* Однофайлова збірка Urok+ — робочий застосунок без мережі.
   node urok/tools/bundle.js > /tmp/urok.html

   Навіщо: сторінка, яку можна відкрити будь-де (артефакт, прев'ю,
   офлайн-демо), не має права ходити в CDN. Тому JSX транспілюємо
   заздалегідь, а замість React підставляємо tools/runtime.js.

   Це не заміна index.html: у застосунку працює справжній React.
   Тут — той самий код екранів, той самий CSS, той самий стан.       */
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawnSync} = require('child_process');
const {sourceFiles} = require('../tests/harness');

const ROOT = path.join(__dirname, '..');
const DEMO = process.argv.includes('--no-demo') ? false : true;
/* --fragment: те саме, але без каркаса документа — для середовищ,
   які самі загортають вміст у <html><head><body> (артефакти). */
const FRAGMENT = process.argv.includes('--fragment');

function transpile(src){
  try {
    const babel = require('@babel/standalone');
    return babel.transform(src, {presets: ['react']}).code;
  } catch (e){
    if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urok-bundle-'));
  const jsx = path.join(dir, 'app.jsx'), out = path.join(dir, 'out.js');
  fs.writeFileSync(jsx, src);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {jsx: 'react', jsxFactory: 'React.createElement', jsxFragmentFactory: 'React.Fragment', target: 'es2020'},
  }));
  const r = spawnSync('bun', ['build', '--no-bundle', jsx, '--outfile', out], {encoding: 'utf8'});
  if (r.status !== 0 || !fs.existsSync(out))
    throw new Error('не вдалося транспілювати JSX: постав bun або @babel/standalone\n' + (r.stderr || r.error || ''));
  return fs.readFileSync(out, 'utf8');
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = html.split('<style>')[1].split('</style>')[0];
const runtime = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
const files = sourceFiles();
const app = transpile(files
  .map(f => `\n/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))
  .join('\n'));

/* Перше знайомство приємніше з розкладом, ніж із порожнім
   тижнем, тому автономна збірка сама наливає демо-дані — рівно
   ті, що вмикає перемикач у налаштуваннях, і вимикаються там же. */
const seed = DEMO ? `
  (function(){
    var U = window.U, s = U.store.get();
    if (!s.students.length && !s.lessons.length) U.loadDemo(U.makeT(s.settings.lang));
  })();
` : '';

const head = FRAGMENT ? '' : `<!doctype html>
<html lang="uk" data-theme="light">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#FFFFFF" id="metaTheme" />
</head>
<body>`;
const tail = FRAGMENT ? '' : '</body>\n</html>';

process.stdout.write(`${head}
<title>Urok+</title>
<style>
${css}
/* Шрифти Onest і Manrope тут недоступні (сторінка не ходить у
   мережу), тому працює системний стек — на iOS і macOS це SF Pro. */
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,ui-sans-serif,sans-serif;}
.dsp,.brand,.brandbig,.hero .ttl,.h1,.stat .v,.money .v,.chart-v{font-family:inherit;}
</style>
<div id="root"></div>
<script>
${runtime}
</script>
<script>
  (function(){
    try{
      /* Тему, яку виставила сторінка навколо, запам'ятовуємо до
         першого кадру: далі «системна» в налаштуваннях означає її. */
      var host = document.documentElement.getAttribute('data-theme');
      if (host) window.__UROK_HOST_THEME = host;
      var raw = localStorage.getItem('urok.v1');
      var pref = raw ? (JSON.parse(raw).settings||{}).theme : 'system';
      var sysDark = host ? host === 'dark'
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var dark = pref === 'dark' || ((pref === 'system' || !pref) && sysDark);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var m = document.getElementById('metaTheme');
      if (m) m.setAttribute('content', dark ? '#0B0D10' : '#FFFFFF');
    }catch(e){}
  })();
</script>
<script>
${app}
</script>
<script>
${seed}
</script>
${tail}
`);
