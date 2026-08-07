const { chromium } = require('./helpers').playwright();
const errs=[];
const say=(n,ok,d)=>{ console.log('  '+n+': '+(ok?'ок':'ПРОВАЛ')+(d?' — '+d:'')); if(!ok) errs.push(n); };
const день=n=>{const d=new Date(); d.setDate(d.getDate()-(n||0));
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);};
const открыть = async (b, состояние, язык='ru')=>{
  const p=await b.newPage({viewport:{width:393,height:752}});
  p.on('pageerror',e=>errs.push(String(e)));
  await p.addInitScript(([st,я])=>{
    localStorage.setItem('starshash_prefs',JSON.stringify({vibro:true,sound:false,lang:я}));
    if(st && !localStorage.getItem('starshash_state'))
      localStorage.setItem('starshash_state',JSON.stringify(st));},[состояние,язык]);
  await p.goto(require('./helpers').АДРЕС); await p.waitForTimeout(1600);
  await p.evaluate(()=>{const x=document.getElementById('stX');
    if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
  await p.waitForTimeout(300);
  await p.click('.tab[data-p="tasks"]'); await p.waitForTimeout(500);
  return p;};
const список = p => p.evaluate(()=>({
  счёт:document.getElementById('dtCnt').textContent,
  точка:document.querySelector('.tab[data-p="tasks"]').classList.contains('has'),
  строки:[...document.querySelectorAll('#dtList .trow')].map(r=>({
    имя:r.querySelector('.nm').textContent,
    награда:r.querySelector('.rw').textContent.trim(),
    прогресс:(r.querySelector('.pn')||{}).textContent||'',
    кнопка:!!r.querySelector('.ac'), взято:r.className.includes('got'),
    полоска:(r.querySelector('.pg i')||{}).style?.width||''}))}));
(async () => {
  const b = await chromium.launch();

  console.log('— чистый день —');
  let p = await открыть(b, {bal:100000, fs:{d:день()}, dl:{streak:0,last:''}});
  let v = await список(p);
  say('три задания', v.строки.length===3, v.строки.map(x=>x.имя+' '+x.награда).join(' · '));
  say('прогресс на нуле', v.строки.every(x=>/^0\//.test(x.прогресс)) && !v.строки.some(x=>x.кнопка),
      v.строки.map(x=>x.прогресс).join(' '));
  say('счётчик показывает 3', v.счёт==='3');
  say('точки на вкладке нет', !v.точка);

  console.log('— играем: прогресс растёт —');
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goCases'); await p.waitForTimeout(600);
  await p.click('#kList .ccard:not(.free)'); await p.waitForTimeout(600);
  const жди=async(усл,мс=25000)=>{const t0=Date.now();
    while(Date.now()-t0<мс){ if(await p.evaluate(усл)) return true; await p.waitForTimeout(150);} return false;};
  for(let i=0;i<3;i++){
    await жди(()=>!document.getElementById('kGo').disabled && /Открыть/.test(document.getElementById('kGo').textContent),9000);
    await p.click('#kGo');
    await жди(()=>/★/.test(document.getElementById('kSub').textContent) &&
                  !/Открываем/.test(document.getElementById('kSub').textContent),15000);
    await p.waitForTimeout(2400);
  }
  await p.click('.tab[data-p="tasks"]'); await p.waitForTimeout(500);
  v = await список(p);
  console.log('   ' + v.строки.map(x=>x.имя+' → '+(x.кнопка?'ГОТОВО':x.прогресс||'взято')).join(' | '));
  say('«сыграть 3 раунда» закрылось', v.строки[0].кнопка);
  say('«открыть кейс» закрылось', v.строки[1].кнопка);
  say('точка на вкладке зажглась', v.точка);
  /* «выиграть раунд» должно требовать настоящей победы, а не любой выплаты */
  const журнал=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).gm.l);
  const былаПобеда=журнал.some(z=>z.w>z.b);
  say('«выиграть раунд» считает только выплату больше ставки',
      v.строки[2].кнопка===былаПобеда,
      журнал.map(z=>z.b+'→'+z.w).join(', ')+' ⇒ '+(v.строки[2].кнопка?'закрыто':'не закрыто'));

  console.log('— забираем —');
  const бал0=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).bal);
  await p.click('#dtList .trow .ac'); await p.waitForTimeout(700);
  const бал1=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).bal);
  v = await список(p);
  say('награда начислена', бал1-бал0===4, 'было '+бал0+', стало '+бал1);
  say('строка помечена взятой', v.строки[0].взято);
  say('второй раз забрать нельзя', !v.строки[0].кнопка);
  await p.close();

  console.log('— полночь обнуляет —');
  p = await открыть(b, {bal:1000, fs:{d:день()}, dl:{streak:0,last:''},
    dt:{d:день(1), p:{d_play:3,d_case:1,d_win:1}, g:{d_play:1,d_case:1,d_win:1}}});
  v = await список(p);
  say('вчерашний прогресс не перенёсся', v.строки.every(x=>/^0\//.test(x.прогресс)) &&
      !v.строки.some(x=>x.взято), v.строки.map(x=>x.прогресс||'взято').join(' '));
  say('и всё снова можно сделать', v.счёт==='3');
  await p.close();

  console.log('— вчера забрал, сегодня опять доступно —');
  p = await открыть(b, {bal:1000, fs:{d:день()}, dl:{streak:0,last:''},
    dt:{d:день(), p:{d_play:3}, g:{}}});
  v = await список(p);
  say('сегодняшний прогресс на месте', v.строки[0].кнопка, v.строки.map(x=>x.прогресс||'ГОТОВО').join(' '));
  await p.close();

  console.log('— три языка —');
  for(const [l,заг] of [['ru','Каждый день'],['en','Every day'],['uk','Щодня']]){
    const pg=await открыть(b, {bal:1000, fs:{d:день()}, dl:{streak:0,last:''}}, l);
    const t=await pg.evaluate(()=>document.querySelectorAll('.ptitle span')[0].textContent);
    const с=await список(pg);
    const ок=t===заг && с.строки.every(x=>x.имя && !/^\[/.test(x.имя));
    console.log('  '+l+': '+(ок?'ок':'ПРОВАЛ')+' — «'+t+'», '+с.строки.map(x=>x.имя).join(' · '));
    if(!ок) errs.push('язык '+l);
    await pg.close();
  }
  console.log('ОШИБКИ:', errs.length?JSON.stringify([...new Set(errs)]):'нет');
  process.exitCode = errs.length ? 1 : 0;
  await b.close();
})();
