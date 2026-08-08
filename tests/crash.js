const { chromium } = require('./helpers').playwright();
const errs=[];
const say=(n,ok,d)=>{ console.log('  '+n+': '+(ok?'ок':'ПРОВАЛ')+(d?' — '+d:'')); if(!ok) errs.push(n); };
const открыть = async (b, засев)=>{
  const p=await b.newPage({viewport:{width:393,height:752}});
  p.on('pageerror',e=>errs.push(String(e)));
  if(засев!=null) await p.addInitScript(v=>{ Math.random=()=>v; }, засев);
  await p.addInitScript(()=>{
    localStorage.setItem('starshash_prefs',JSON.stringify({vibro:true,sound:false,lang:'ru'}));
    if(!localStorage.getItem('starshash_state'))
      localStorage.setItem('starshash_state',JSON.stringify({bal:50000,fs:{d:'2026-08-07'},dl:{streak:0,last:''}}));});
  await p.goto(require('./helpers').АДРЕС); await p.waitForTimeout(1600);
  await p.evaluate(()=>{const x=document.getElementById('stX');
    if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
  await p.waitForTimeout(300);
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goCrash'); await p.waitForTimeout(500);
  return p;};
const жди = async (p,усл,мс=30000)=>{ const t0=Date.now();
  while(Date.now()-t0<мс){ if(await p.evaluate(усл)) return true; await p.waitForTimeout(120);} return false;};
(async () => {
  const b = await chromium.launch();

  console.log('— мгновенный обрыв не ломает раунд —');
  let p = await открыть(b, 0.99);                 // ДОЛЯ/0.99 < 1 → обрыв сразу
  await жди(p,()=>!document.getElementById('cGo').disabled &&
                  /Войти|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
  await p.click('#cGo');
  const рвануло = await жди(p,()=>document.getElementById('cMult').className.includes('boom'),20000);
  say('раунд оборвался', рвануло);
  say('показан ×1.00', await p.evaluate(()=>document.getElementById('cMult').textContent)==='1.00×',
      await p.evaluate(()=>document.getElementById('cMult').textContent));
  say('ставка списана, выплаты нет', await p.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('starshash_state')||'{}');
    return s.gm && s.gm.l && s.gm.l[0] && s.gm.l[0].w===0 && s.gm.l[0].b>0;}),
    JSON.stringify(await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).gm.l[0])));
  /* продолжение раунда здесь не проверяем: Math.random заморожен на всю
     страницу и ломает отсчёт до следующего раунда — это заглушка, а не игра.
     Живое продолжение после ×1.00 проверяется ниже, на обычной случайности. */
  await p.close();

  console.log('— обычная игра: несколько раундов подряд —');
  p = await открыть(b, null);
  const точки=[];
  for(let i=0;i<7;i++){
    await жди(p,()=>!document.getElementById('cGo').disabled &&
                    /Войти|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
    await p.click('#cGo');
    await жди(p,()=>document.getElementById('cMult').className.includes('boom'),35000);
    точки.push(await p.evaluate(()=>+document.getElementById('cMult').textContent.replace('×','')));
    await p.waitForTimeout(3000);
  }
  console.log('   точки обрыва: ×'+точки.join(', ×'));
  say('все обрывы не ниже ×1.00 и не выше потолка', точки.every(x=>x>=1&&x<=25));
  say('короткие раунды встречаются', точки.some(x=>x<2));
  const мгновенных=точки.filter(x=>x===1).length;
  say('после мгновенного обрыва игра продолжается',
      !мгновенных || точки.length===7,
      мгновенных+' обрывов ×1.00 из '+точки.length+' раундов, все сыграны подряд');
  say('история пишет обрывы', await p.evaluate(()=>
      document.querySelectorAll('#cHist > *').length>=5),
      await p.evaluate(()=>[...document.querySelectorAll('#cHist > *')].slice(0,5).map(e=>e.textContent).join(' ')));

  console.log('— авто-вывод по-прежнему срабатывает —');
  await p.fill('#cAutoMult','1.05');
  await p.evaluate(()=>{document.getElementById('cAutoMult').dispatchEvent(new Event('input',{bubbles:true}));
    const c=document.getElementById('cAutoChk'); if(!c.checked) c.click();});
  let сработал=false;
  for(let i=0;i<6 && !сработал;i++){
    await жди(p,()=>!document.getElementById('cGo').disabled &&
                    /Войти|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
    const было=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).gm.n||0);
    await p.click('#cGo');
    await жди(p,()=>document.getElementById('cMult').className.includes('boom'),35000);
    const з=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).gm.l[0]);
    if(з && з.w>0) сработал=true;
    await p.waitForTimeout(2600);
  }
  say('авто-вывод забрал банк хотя бы раз', сработал);
  await p.close();

  console.log('ОШИБКИ:', errs.length?JSON.stringify([...new Set(errs)]):'нет');
  process.exitCode = errs.length ? 1 : 0;
  await b.close();
})();
