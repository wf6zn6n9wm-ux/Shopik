// Э8: проверяем перестроенный интерфейс — центральная кнопка «Игры», шапка с
// балансом, лайв-лента выигрышей, баннеры игр, рейтинг, награды, рефералка,
// заявки и запретный словарь во всех трёх локалях.
import { openApp } from './browser.mjs';

const { run, close } = await openApp({ port: 9343, settle: 1500 });

let bad=0;
const ok=(name,cond)=>{console.log((cond?'  ok  ':'  FAIL ')+name);if(!cond)bad++;};
const sect=s=>console.log('\n— '+s+' —');

await run("onbMarkSeen();document.getElementById('onb').classList.remove('open');setLang('ru');return 1");
await new Promise(r=>setTimeout(r,200));

sect('нижняя навигация');
const tabs = await run("return [...document.querySelectorAll('.tabbar .tab')].map(x=>({tab:x.dataset.tab,mid:x.classList.contains('tab-mid'),txt:x.querySelector('span:last-child').textContent.trim()}))");
ok('пять вкладок', tabs.length === 5);
ok('игры ровно в середине', tabs[2] && tabs[2].mid === true);
ok('и подписаны «Игры»', tabs[2] && tabs[2].txt === 'Игры');
ok('приподнятая иконка одна', tabs.filter(x=>x.mid).length === 1);
ok('магазина в навигации нет', !tabs.some(x=>x.tab === 'shop'));
ok('порядок: турниры, лидеры, игры, награды, профиль',
  tabs.map(x=>x.tab).join(',') === 'contests,leaders,home,rewards,profile');

sect('шапка с балансом');
const hd = await run("const b=document.querySelector('.apbar');return b?{av:!!b.querySelector('.apbar-av'),lab:(b.querySelector('.apbar-l')||{}).textContent,val:(b.querySelector('.apbar-v')||{}).textContent,btn:(b.querySelector('.apbar-btn')||{}).textContent}:null");
ok('шапка есть', !!hd);
ok('аватар с шестерёнкой', hd && hd.av);
ok('подпись про баланс', hd && /баланс/i.test(hd.lab || ''));
ok('кнопка «Пополнить»', hd && /Пополнить/i.test(hd.btn || ''));
ok('в шапке нет слова «вывод»', hd && !/вывод|вывести/i.test(JSON.stringify(hd)));

sect('лайв-лента выигрышей');
await run("go('home');startLive();return 1");
await new Promise(r=>setTimeout(r,300));
const live = await run("const s=document.querySelector('.live-strip');if(!s)return null;const it=[...s.querySelectorAll('.ls-item')];return {n:it.length,lbl:(s.querySelector('.ls-lbl')||{}).textContent,txt:it.map(x=>x.textContent),ic:it.filter(x=>x.querySelector('.star-ic')).length,plus:it.filter(x=>/^\\+/.test((x.querySelector('.li-v')||{textContent:''}).textContent.trim())).length}");
ok('лента отрисована', live && live.n >= 10);
ok('подписана как Live', live && /live/i.test(live.lbl || ''));
ok('в каждой записи иконка звезды', live && live.ic === live.n);
ok('и все суммы показаны как выигрыш', live && live.plus === live.n);
const nums = (live ? live.txt : []).map(x => x.replace(/[^0-9]/g, ''));
ok('суммы разные', new Set(nums).size > 1);
ok('нет TON/USDT/грн в ленте', live && !/TON|USDT|грн/i.test(live.txt.join(' ')));

sect('баннеры игр');
const gm = await run("const r=document.querySelector('.gm-rocket'),p=document.querySelector('.gm-pvp');return {rocket:!!r,mult:r?r.querySelectorAll('.gm-mult').length:0,badge:r?((r.querySelector('.gm-badge')||{}).textContent||'').trim():'',pvp:!!p,faces:p?p.querySelectorAll('.gm-face').length:0,pbadge:p?((p.querySelector('.gm-badge')||{}).textContent||'').trim():'',pct:p?/%/.test(p.textContent):false}");
ok('баннер «ракетки»', gm.rocket);
ok('с множителями', gm.mult >= 2);
ok('и плашкой-бейджем', gm.badge.length > 1);
ok('баннер PVP', gm.pvp);
ok('с лицами соперников', gm.faces === 3);
ok('со своим бейджем', gm.pbadge.length > 1);
ok('и процентами шансов', gm.pct);

sect('рейтинг');
await run("go('leaders');return 1");
await new Promise(r=>setTimeout(r,250));
const lb = await run("const h=document.querySelector('.lb-hero'),rows=[...document.querySelectorAll('.lb-row')];return {hero:!!h,cd:h?/\\d/.test((h.querySelector('.lb-cd')||{textContent:''}).textContent):false,rows:rows.length,me:rows.some(x=>x.classList.contains('me')),names:rows.map(x=>(x.querySelector('.lb-nm')||{}).textContent||''),gift:rows.some(x=>x.querySelector('.lb-gift'))}");
ok('шапка турнира есть', lb.hero);
ok('с обратным отсчётом', lb.cd);
ok('строки участников', lb.rows > 0);
ok('своя строка закреплена', lb.me);
ok('ники маскируются', lb.names.some(n => n.includes('•') || n.includes('*')));
ok('у призовых мест виден приз', lb.gift);

sect('награды');
await run("go('rewards');return 1");
await new Promise(r=>setTimeout(r,250));
await run("RW.groups=[{key:'daily',icon:'\u23F0',tasks:[{key:'play3',icon:'\u{1F3AE}',goal:3,reward:15,progress:1,ready:false,claimed:false,go:'games'},{key:'visit',icon:'\u{1F44B}',goal:1,reward:5,progress:1,ready:true,claimed:false,go:'home'}]},{key:'once',icon:'\u{1F3C5}',tasks:[{key:'ref3',icon:'\u{1F465}',goal:3,reward:200,progress:0,ready:false,claimed:false,go:'refs'}]}];RW.done=0;RW.total=3;RW.earned=1;RW.loaded=true;renderRewards();return 1");
await new Promise(r=>setTimeout(r,150));
const rw = await run("const s=document.getElementById('s-rewards');if(!s)return null;const c=[...s.querySelectorAll('.rw')];return {n:c.length,grp:s.querySelectorAll('.rw-grp').length,titles:c.map(x=>(x.querySelector('.rw-n')||{}).textContent||''),pays:c.map(x=>(x.querySelector('.rw-pay')||{}).textContent||''),bars:c.filter(x=>x.querySelector('.rw-bar')).length,cta:c.filter(x=>x.querySelector('.rw-cta')).length,txt:s.textContent}");
ok('экран наград есть', !!rw);
ok('задания отрисованы', rw && rw.n === 3);
ok('разбиты на группы', rw && rw.grp === 2);
ok('у каждого есть кнопка', rw && rw.cta === rw.n);
ok('награда указана в звёздах', rw && rw.pays.every(x => /\d/.test(x)));
ok('у заданий есть заголовки', rw && rw.titles.every(x => x.trim().length > 0));
ok('нет непереведённых ключей', rw && !/rw_t_|\[\w+\]/.test(rw.titles.join(' ')));
ok('прогресс полосой там, где цель больше одной', rw && rw.bars === 2);
ok('в наградах нет заданий про пополнение', rw && !/пополн/i.test(rw.titles.join(' ')));

sect('рефералка');
await run("go('refs');return 1");
await new Promise(r=>setTimeout(r,250));
const rf = await run("const s=document.getElementById('s-refs');return {txt:s.textContent,pct:/10\\s*%/.test(s.textContent),link:(document.getElementById('ref-link')||{}).value||'',copy:[...s.querySelectorAll('button')].some(x=>/скопировать|пригласить/i.test(x.textContent))}");
ok('условие 10% на экране', rf.pct);
ok('ссылка для приглашения готова', /t\.me\/.+start=ref_/.test(rf.link));
ok('есть кнопка поделиться ссылкой', rf.copy);
ok('речь про потраченные звёзды', /потрач/i.test(rf.txt));

sect('запретный словарь интерфейса');
for (const l of ['uk','ru','en']) {
  await run("setLang('"+l+"');return 1");
  await new Promise(r=>setTimeout(r,120));
  const words = await run("const bad=[];const re=/вывод|вывести|виведення|вивести|обмен|обмін|exchange|курс|конверт|withdraw|cash out|cashout/i;document.querySelectorAll('body *').forEach(n=>{if(/^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName))return;for(const c of n.childNodes)if(c.nodeType===3&&re.test(c.nodeValue))bad.push(c.nodeValue.trim().slice(0,60));});return [...new Set(bad)]");
  const allow = words.filter(w => !/Забрать|Отримати|Claim/i.test(w));
  ok(l + ': нет слов про вывод и обмен', allow.length === 0);
  if (allow.length) console.log('      ' + allow.join(' | '));
}
await run("setLang('ru');return 1");

sect('заявка на выигрыш');
// Экран заявок — только статус и история: кнопка «Забрать выигрыш» живёт в
// профиле, а сама заявка создаётся в шторке и уходит в бота.
await run("go('claims');CLAIMS.rows=[];CLAIMS.loaded=true;renderClaims();return 1");
await new Promise(r=>setTimeout(r,200));
const cl = await run("const s=document.getElementById('s-claims');return {txt:s.textContent,inp:s.querySelectorAll('input,select,textarea').length,btn:[...s.querySelectorAll('button')].map(x=>x.textContent.trim())}");
ok('на экране заявок нет полей ввода', cl.inp === 0);
ok('и нет кнопок выплаты', cl.btn.length === 0);
ok('сказано, что заявку разбирает человек', /человек/i.test(cl.txt));
ok('и что ответ придёт в бота', /бот/i.test(cl.txt));

await run("CLAIMS.rows=[{id:7,stars:1200,status:'new',at:1,note:''},{id:6,stars:800,status:'paid',at:1,decidedAt:2,note:''},{id:5,stars:500,status:'rejected',at:1,decidedAt:2,note:'дубль'}];renderClaims();return 1");
await new Promise(r=>setTimeout(r,150));
const rows = await run("const c=[...document.querySelectorAll('#claims-list .cl')];return {n:c.length,st:c.map(x=>(x.querySelector('.cl-st')||{}).textContent||''),sums:c.map(x=>(x.querySelector('.cl-n')||{}).textContent||''),ic:c.filter(x=>x.querySelector('.star-ic')).length}");
ok('история заявок отрисована', rows.n === 3);
ok('у каждой виден статус', rows.st.every(x => x.trim().length > 0));
ok('суммы в звёздах', rows.ic === 3 && rows.sums.every(x => /\d/.test(x)));
ok('статусы переведены, не ключи', !/claim_st_/.test(rows.st.join(' ')));

const pf = await run("go('profile');return [...document.querySelectorAll('#s-profile button, #s-profile .menu-card')].map(x=>x.textContent.trim())");
ok('кнопка «Забрать выигрыш» в профиле', pf.some(x => /Забрать выигрыш/i.test(x)));
ok('в профиле нет кнопки «Вывод»', !pf.some(x => /вывод|вывести/i.test(x)));

// Шторка заявки: сумма — да, адрес кошелька и валюта — нет.
const sheet = await run("SERVER=true;CLAIM_MIN=500;S.stars=1200;openClaim();const s=document.getElementById('sheet');const r={txt:s.textContent,ids:[...s.querySelectorAll('input,select,textarea')].map(x=>x.id||x.tagName),btn:[...s.querySelectorAll('button')].map(x=>x.textContent.trim())};closeSheet();return r");
ok('шторка открылась', sheet.txt.length > 0);
ok('поля адреса кошелька нет', !sheet.ids.some(x => /addr|wallet|кошел/i.test(x)));
ok('выбора валюты нет', !sheet.ids.includes('SELECT'));
ok('есть только сумма и комментарий', sheet.ids.join(',') === 'cl-amt,cl-note');
ok('кнопка называется «Забрать выигрыш»', sheet.btn.some(x => /Забрать выигрыш/i.test(x)));
ok('в шторке нет слов про вывод и обмен', !/вывод|вывести|обмен|курс|конверт/i.test(sheet.txt));

sect('кейсы после удаления магазина');
await run("CASES=[{key:'s',emoji:'\u{1F4E6}',name:'Малый кейс',price:250,drops:[{emoji:'\u{1F41A}',name:'Ракушка',value:50,chance:70},{emoji:'\u{1F48E}',name:'Алмаз',value:400,chance:30}]}];go('gifts');renderGiftCases();return 1");
await new Promise(r=>setTimeout(r,200));
const gc = await run("const b=document.getElementById('gft-cases');const c=[...b.querySelectorAll('.gc')];return {h:(b.querySelector('h3')||{}).textContent||'',n:c.length,btn:c.map(x=>(x.querySelector('.gc-b')||{}).textContent||''),top:c.map(x=>(x.querySelector('.gc-d')||{}).textContent||'')}");
ok('вход в кейсы есть на экране подарков', gc.n === 1);
ok('блок подписан', /кейс/i.test(gc.h));
ok('цена в Telegram Stars', gc.btn.every(x => x.includes('\u2B50')));
ok('показан главный приз', /Алмаз/.test(gc.top.join(' ')));
const sh = await run("SERVER=true;openCase(CASES[0]);const s=document.getElementById('sheet');const r={txt:s.textContent,btn:!!document.getElementById('cs-buy')};closeSheet();return r");
ok('шторка кейса открывается', sh.btn);
ok('шансы выпадения показаны', /70%/.test(sh.txt) && /30%/.test(sh.txt));

console.log(bad ? ('\n✗ провалов: ' + bad) : '\nвсе проверки прошли');
close();process.exit(bad?1:0);
