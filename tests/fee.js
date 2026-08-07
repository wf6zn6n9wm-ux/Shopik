const { chromium } = require('./helpers').playwright();
const errs=[];
const say=(n,ok,d)=>{ console.log('  '+n+': '+(ok?'ок':'ПРОВАЛ')+(d?' — '+d:'')); if(!ok) errs.push(n); };
const открыть = async (b, язык='ru')=>{
  const p=await b.newPage({viewport:{width:393,height:752}});
  p.on('pageerror',e=>errs.push(String(e)));
  await p.addInitScript(я=>{
    localStorage.setItem('starshash_prefs',JSON.stringify({vibro:true,sound:false,lang:я}));
    if(!localStorage.getItem('starshash_state'))
      localStorage.setItem('starshash_state',JSON.stringify({bal:200000,fs:{d:'2026-08-07'},dl:{streak:0,last:''}}));},язык);
  await p.goto(require('./helpers').АДРЕС); await p.waitForTimeout(1600);
  await p.evaluate(()=>{const x=document.getElementById('stX');
    if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
  await p.waitForTimeout(300);
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goPvp'); await p.waitForTimeout(700);
  return p;};
const жди = async (p,усл,мс=30000)=>{ const t0=Date.now();
  while(Date.now()-t0<мс){ if(await p.evaluate(усл)) return true; await p.waitForTimeout(150);} return false;};
(async () => {
  const b = await chromium.launch();

  console.log('— комиссия названа до розыгрыша —');
  let p = await открыть(b);
  let v = await p.evaluate(()=>({банк:+document.getElementById('pPot').textContent.replace(/\D/g,''),
    подпись:document.getElementById('pFee').textContent}));
  say('подпись под банком есть', /5%/.test(v.подпись), '«'+v.подпись+'» при банке '+v.банк);
  const обещано=+((v.подпись.match(/([\d\s ]+)\s*★/)||[])[1]||'0').replace(/\D/g,'');
  say('обещано ровно 95% банка', обещано===Math.floor(v.банк*0.95),
      обещано+' против '+Math.floor(v.банк*0.95));

  console.log('— выплата совпадает с обещанием —');
  await p.click('#pChips button[data-pbet="1000"]').catch(()=>{});
  await p.waitForTimeout(200);
  let проверено=false;
  for(let i=0;i<10 && !проверено;i++){
    if(!await жди(p,()=>!document.getElementById('pGo').disabled &&
                        /Войти/.test(document.getElementById('pGo').textContent))) break;
    await p.click('#pGo'); await p.waitForTimeout(400);
    /* банк растёт до самого розыгрыша: боты доходят по одному. Читать его
       сразу после входа бессмысленно — сверять надо последнее обещание */
    let до={банк:0,обещано:0};
    const t0=Date.now();
    while(Date.now()-t0<25000){
      const с=await p.evaluate(()=>({банк:+document.getElementById('pPot').textContent.replace(/[^0-9]/g,''),
        обещано:+((document.getElementById('pFee').textContent.match(/([0-9\s\u00a0]+)\s*★/)||[])[1]||'0').replace(/[^0-9]/g,''),
        готово:/Победа|Выиграл/.test(document.getElementById('pGo').textContent)}));
      if(с.готово) break;
      if(с.банк) до=с;
      await p.waitForTimeout(150);
    }
    if(!await жди(p,()=>/Победа|Выиграл/.test(document.getElementById('pGo').textContent),25000)) break;
    const победа=await p.evaluate(()=>/Победа/.test(document.getElementById('pGo').textContent));
    if(победа){
      const з=await p.evaluate(()=>JSON.parse(localStorage.getItem('starshash_state')).gm.l[0]);
      say('победа: выплачено 95% банка, как и обещали',
          з.w===до.обещано && з.w===Math.floor(до.банк*0.95),
          'банк '+до.банк+', обещано '+до.обещано+', выплачено '+з.w);
      say('дом удержал свою долю', до.банк-з.w===до.банк-Math.floor(до.банк*0.95),
          'комиссия '+(до.банк-з.w)+' ★');
      проверено=true;
    }
    await p.waitForTimeout(3200);
  }
  if(!проверено) errs.push('победы за десять раундов не дождались');
  await p.close();

  console.log('— правила и три языка —');
  for(const [l,кусок] of [['ru','комиссии 5%'],['en','5% fee'],['uk','комісії 5%']]){
    const pg=await открыть(b,l);
    const подпись=await pg.evaluate(()=>document.getElementById('pFee').textContent);
    await pg.click('.tab[data-p="me"]'); await pg.waitForTimeout(400);
    await pg.click('#setRules'); await pg.waitForTimeout(600);
    const правила=await pg.evaluate(()=>document.body.innerText);
    const ок=/5%/.test(подпись) && правила.includes(кусок);
    console.log('  '+l+': '+(ок?'ок':'ПРОВАЛ')+' — «'+подпись.slice(0,44)+'»');
    if(!ок) errs.push('язык '+l);
    await pg.close();
  }
  console.log('ОШИБКИ:', errs.length?JSON.stringify([...new Set(errs)]):'нет');
  process.exitCode = errs.length ? 1 : 0;
  await b.close();
})();
