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

  console.log('— вход от 30 ★ и состав из ответа сервера —');
  {
    /* Раньше состав набирался в телефоне, а раунд считал сервер со своими
       соперниками — и банк на экране прыгал в момент розыгрыша. Теперь
       сервер отвечает при входе, и показанный банк дальше не меняется. */
    const БАЗА = { ok:true, admin:false, bal:5000, inv:0, mined:0, ref:{by:'',earned:0},
                   ref_n:0, bonus:{streak:0,day:null}, tasks:{}, daily:{}, stats:{} };
    const p2 = await b.newPage({ viewport:{width:393,height:752} });
    p2.on('pageerror', e => errs.push(String(e)));
    await p2.addInitScript(о => {
      localStorage.setItem('starshash_prefs', JSON.stringify({vibro:true,sound:false,lang:'ru'}));
      localStorage.setItem('starshash_state', JSON.stringify({bal:5000,fs:{d:'2026-08-07'},dl:{streak:1,last:'2026-08-07'}}));
      window.Telegram = { WebApp:{ initData:'user=%7B%22id%22%3A1%7D&hash=подделка', initDataUnsafe:{user:{}},
        ready(){}, expand(){}, setHeaderColor(){}, setBackgroundColor(){}, openTelegramLink(){}, openLink(){},
        HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}} } };
      window.fetch = function(u, init){
        let d='state'; try{ d=JSON.parse(init.body).action||d; }catch(e){}
        return Promise.resolve({ json:()=>Promise.resolve(о[d]||{ok:false,reason:'unknown_action'}) });
      };
    }, { state: БАЗА,
         pvp: Object.assign({}, БАЗА, { bal:4900, rivals:[40,55,30], winner:1, pot:225, win:0 }) });
    await p2.goto(require('./helpers').АДРЕС); await p2.waitForTimeout(1700);
    await p2.evaluate(()=>{const x=document.getElementById('stX');
      if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
    await p2.waitForTimeout(300);
    await p2.click('.tab[data-p="games"]'); await p2.waitForTimeout(400);
    await p2.click('#goPvp'); await p2.waitForTimeout(700);

    /* Соперники подсаживаются по одному, поэтому в начале сбора банк ещё
       неполный — важно, что он не перерастает объявленный потолок. */
    const банк0 = await p2.evaluate(()=>+document.getElementById('pPot').textContent.replace(/\D/g,''));
    say('банк до входа не выходит за потолок', банк0>0 && банк0<=187, String(банк0));

    /* ставка ниже минимума не пропускается */
    await p2.fill('#pOwn','5').catch(()=>{});
    await p2.evaluate(()=>document.getElementById('pOwn').dispatchEvent(new Event('input',{bubbles:true})));
    await p2.waitForTimeout(200);
    await p2.click('#pGo',{force:true}).catch(()=>{}); await p2.waitForTimeout(400);
    const к = await p2.evaluate(()=>({ т:document.getElementById('pGo').textContent,
      выкл:document.getElementById('pGo').disabled, вошёл:!!document.querySelector('.prow.me') }));
    say('ставка ниже 30 ★ не пропускается', /30/.test(к.т) && к.выкл && !к.вошёл,
        '«'+к.т.trim()+'», кнопка '+(к.выкл?'заблокирована':'АКТИВНА'));

    await p2.waitForTimeout(1800);
    await p2.click('#pChips button[data-pbet="50"]').catch(()=>{});
    await p2.waitForTimeout(200);
    if(await жди(p2,()=>!document.getElementById('pGo').disabled &&
                        /Войти/.test(document.getElementById('pGo').textContent), 12000)){
      await p2.click('#pGo'); await p2.waitForTimeout(900);
      const после = await p2.evaluate(()=>({
        банк:+document.getElementById('pPot').textContent.replace(/\D/g,''),
        строк:document.querySelectorAll('.prow').length,
        баланс:JSON.parse(localStorage.getItem('starshash_state')).bal
      }));
      /* 50 своих + 40+55+30 присланных = 175 */
      say('после входа банк — из ответа сервера', после.банк===175, String(после.банк));
      say('состав — я и трое соперников', после.строк===4, 'строк '+после.строк);
      say('баланс принят с сервера, а не посчитан в телефоне',
          Math.abs(после.баланс-4900)<1, после.баланс.toFixed(2));
      await p2.waitForTimeout(2500);
      const держится = await p2.evaluate(()=>+document.getElementById('pPot').textContent.replace(/\D/g,''));
      say('до розыгрыша банк больше не меняется', держится===175, String(держится));
    } else errs.push('кнопка входа в ПВП не разблокировалась');
    await p2.close();
  }

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
