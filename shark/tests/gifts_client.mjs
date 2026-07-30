// Э5, клиентская часть: рендер инвентаря проверяем в настоящем браузере.
// Разметку собираем строками, поэтому важно не «что вернула функция», а что
// реально оказалось в DOM — включая экранирование чужих строк.
import { openApp, wait } from './browser.mjs';

const { run, close } = await openApp({ port: 9337, settle: 1200 });

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

// Инвентарь, каким его отдал бы сервер. Имя подарка — враждебное: подарки
// заводит сервер, но экранирование не должно зависеть от того, кто источник.
const FIXTURE = `
  onbMarkSeen(); document.getElementById('onb').classList.remove('open');
  setLang('ru'); go('gifts');
  GFT.loaded=true; GFT.err=false; GFT.features={send:false,exchange:false,collect:false};
  GFT.rows=[
    {id:3,name:'<img src=x onerror=window.__pwn=1>',emoji:'🔱',value:10000,rarity:'legendary',status:'sending',caseName:'Бездна',at:'2026-01-05T10:00:00Z',sentAt:null},
    {id:2,name:'Коралл',emoji:'🪸',value:120,rarity:'rare',status:'held',caseName:'Глубина',at:'2026-01-04T10:00:00Z',sentAt:null},
    {id:1,name:'Ракушка',emoji:'🐚',value:25,rarity:'common',status:'sent',caseName:'Риф',at:'2026-01-03T10:00:00Z',sentAt:'2026-01-03T18:00:00Z'}
  ];
  GFT.counts={total:3,held:1,sending:1,sent:1}; GFT.totalValue=10145; GFT.pendingValue=10120;
  GFT.filter='all';
  document.querySelectorAll('#gft-filters .gft-chip').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-gf')==='all'); });
  gftRender(); return 1;`;

console.log('\n— рендер инвентаря —');
await run(FIXTURE);
ok('экран показан', await run("return document.getElementById('s-gifts').classList.contains('active')"));
ok('карточек три', await run("return document.querySelectorAll('#gft-list .gft').length") === 3);

ok('статусы разложены по классам',
  JSON.stringify(await run("return Array.from(document.querySelectorAll('#gft-list .gft-st')).map(e=>e.className)"))
  === JSON.stringify(['gft-st s-sending', 'gft-st s-held', 'gft-st s-sent']));
ok('редкость — на карточке',
  JSON.stringify(await run("return Array.from(document.querySelectorAll('#gft-list .gft')).map(e=>e.className)"))
  === JSON.stringify(['gft r-legendary', 'gft r-rare', 'gft r-common']));

ok('статус подписан словом, а не ключом',
  await run("return document.querySelector('#gft-list .gft-st').textContent") === 'отправляем');
ok('у выданного показано время выдачи, а не покупки',
  (await run("return document.querySelectorAll('#gft-list .gft-m')[2].textContent")).includes('03.01.26'));

console.log('\n— экранирование —');
ok('имя подарка не стало разметкой', await run("return window.__pwn===undefined"));
ok('и видно игроку как текст',
  (await run("return document.querySelectorAll('#gft-list .gft-n')[0].textContent")).includes('<img src=x'));
ok('внутри карточки нет чужого <img>',
  await run("return document.querySelectorAll('#gft-list img').length") === 0);

console.log('\n— сводка и фильтры —');
ok('всего подарков', (await run("return document.getElementById('gft-sum').textContent")).includes('3'));
// Ценность в звёздах из сводки убрана: подарки не возвращаются в баланс,
// и цифра «столько-то ⭐» обещала обмен, которого нет.
ok('в сводке нет ценности в звёздах',
  !(await run("return document.getElementById('gft-sum').textContent")).includes('⭐'));
ok('вместо неё — сколько ждёт отправки',
  /Ожидают отправки|Очікують надсилання|Awaiting delivery/.test(
    await run("return document.getElementById('gft-sum').textContent")));
ok('счётчики на чипсах',
  JSON.stringify(await run("return Array.from(document.querySelectorAll('#gft-filters .gft-chip')).map(e=>e.textContent)"))
  === JSON.stringify(['Все · 3', 'В инвентаре · 2', 'Отправлены · 1']));

await run("gftFilter('held'); return 1");
ok('фильтр «в инвентаре» прячет выданные', await run("return document.querySelectorAll('#gft-list .gft').length") === 2);
ok('и не прячет «отправляем»',
  (await run("return document.getElementById('gft-list').textContent")).includes('отправляем'));
await run("gftFilter('sent'); return 1");
ok('фильтр «отправлены» оставляет один', await run("return document.querySelectorAll('#gft-list .gft').length") === 1);
ok('активен ровно один чипс',
  await run("return document.querySelectorAll('#gft-filters .gft-chip.on').length") === 1);

console.log('\n— пустые состояния —');
await run("gftFilter('all'); GFT.rows=[{id:1,name:'Ракушка',emoji:'🐚',value:25,rarity:'common',status:'held',caseName:'Риф',at:'2026-01-03T10:00:00Z',sentAt:null}]; GFT.counts={total:1,held:1,sending:0,sent:0}; gftFilter('sent'); return 1");
ok('пустой фильтр — своя подсказка',
  (await run("return document.getElementById('gft-list').textContent")).includes('другой фильтр'));
await run("GFT.rows=[]; GFT.counts={total:0,held:0,sending:0,sent:0}; GFT.totalValue=0; GFT.pendingValue=0; gftFilter('all'); return 1");
ok('пустой инвентарь — приглашение открыть кейс',
  (await run("return document.getElementById('gft-list').textContent")).includes('Откройте кейс'));
ok('чипсы без счётчиков, когда нечего считать',
  await run("return document.querySelector('#gft-filters .gft-chip').textContent") === 'Все');

console.log('\n— будущие функции —');
await run(FIXTURE);
ok('кнопок действий нет, пока флаги выключены',
  await run("return document.querySelectorAll('#gft-list .gft-act').length") === 0);
ok('но в тексте экрана есть обещание',
  (await run("return document.getElementById('i-gft-roadmap').textContent")).length > 10);
// Включение функции — только флаг с сервера, без правки разметки и стилей.
await run("GFT.features={send:true,exchange:false,collect:false}; gftRender(); return 1");
ok('флаг сервера включает кнопку',
  await run("return document.querySelectorAll('#gft-list .gft-act').length") === 3);
ok('у выданного подарка кнопка заблокирована',
  await run("return document.querySelectorAll('#gft-list .gft')[2].querySelector('.gft-act').disabled") === true);
ok('у невыданного — активна',
  await run("return document.querySelectorAll('#gft-list .gft')[0].querySelector('.gft-act').disabled") === false);
ok('без обработчика жать безопасно',
  await run("try{ gftAct('send',3); return true; }catch(e){ return String(e); }") === true);

console.log('\n— смена языка —');
await run("GFT.features={}; setLang('en'); return 1");
ok('карточки перерисованы',
  await run("return document.querySelector('#gft-list .gft-st').textContent") === 'sending');
ok('чипсы перерисованы со счётчиками',
  await run("return document.querySelector('#gft-filters .gft-chip').textContent") === 'All · 3');
ok('заголовок переведён', await run("return document.getElementById('i-gifts-h1').textContent") === 'My gifts');
ok('кавычки в en — не «ёлочки»',
  (await run("return document.querySelectorAll('#gft-list .gft-m')[0].textContent")).includes('“Бездна”'));
await run("setLang('uk'); return 1");
ok('украинский тоже цел',
  await run("return document.getElementById('i-gifts-h1').textContent") === 'Мої подарунки');

console.log('\n— вход с профиля —');
await run("setLang('ru'); go('profile'); return 1");
ok('карточка «Подарки» есть в меню',
  (await run("return document.querySelector('.menu-grid').textContent")).includes('Подарки'));
ok('она ведёт на экран инвентаря',
  await run("document.querySelector('.menu-grid .menu-card').click(); return document.getElementById('s-gifts').classList.contains('active')"));

console.log('\n— очередь выдачи в админке —');
await run(`S.isAdmin=true; syncAdminEntry(); go('admin'); admTab('gifts');
  admGf.loaded=true; admGf.total=2; admGf.pending=2;
  admGf.rows=[{id:4,tg_id:102,player:'<b>Оля</b>',username:'olya',name:'Пузырь',emoji:'🫧',value:10,rarity:'common',status:'held',caseName:'Риф',at:'2026-01-05T10:00:00Z',sentAt:null},
              {id:3,tg_id:101,player:'Коля',username:'kolya',name:'Трезубец',emoji:'🔱',value:10000,rarity:'legendary',status:'sending',caseName:'Бездна',at:'2026-01-05T12:00:00Z',sentAt:null}];
  admRenderGifts(); return 1`);
ok('вкладка открыта', await run("return document.getElementById('adm-pane-gifts').classList.contains('on')"));
ok('две карточки в очереди', await run("return document.querySelectorAll('#adm-gifts .gft').length") === 2);
// Имя игрок задаёт сам в Telegram — в админке оно обязано быть текстом.
ok('имя игрока не стало разметкой', await run("return document.querySelectorAll('#adm-gifts b').length") === 0);
ok('и видно админу как есть',
  (await run("return document.querySelectorAll('#adm-gifts .gft-m')[0].textContent")).includes('<b>Оля</b>'));
ok('у held — две кнопки',
  await run("return document.querySelectorAll('#adm-gifts .gft')[0].querySelectorAll('.gft-act').length") === 2);
ok('у sending — только «отправлен»',
  await run("return document.querySelectorAll('#adm-gifts .gft')[1].querySelectorAll('.gft-act').length") === 1);
ok('счётчик ожидающих виден',
  (await run("return document.getElementById('adm-gf-cnt').textContent")).includes('2'));
// то, что уже выдано, кнопок не получает
await run("admGf.rows[0].status='sent'; admGf.rows[0].sentAt='2026-01-06T10:00:00Z'; admRenderGifts(); return 1");
ok('у выданного кнопок нет',
  await run("return document.querySelectorAll('#adm-gifts .gft')[0].querySelectorAll('.gft-act').length") === 0);
ok('и статус переключился',
  await run("return document.querySelectorAll('#adm-gifts .gft-st')[0].className") === 'gft-st s-sent');

console.log(fails ? '\nFAIL: ' + fails : '\nвсе проверки прошли');
close();
process.exit(fails ? 1 : 0);
