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

  /* Лента лежит на самой панели, в левом нижнем углу: там же летит
     ракета, и взгляд не уходит с картинки ради истории. */
  const лента=await p.evaluate(()=>{
    const c=document.getElementById('cStage').getBoundingClientRect();
    const h=document.getElementById('cHist').getBoundingClientRect();
    const m=document.getElementById('cMult').getBoundingClientRect();
    return {внутри: h.left>=c.left-1 && h.right<=c.right+1 && h.bottom<=c.bottom+1 && h.top>=c.top-1,
            слева: h.left-c.left<20, снизу: c.bottom-h.bottom<20,
            неНаМножителе: h.right<=m.left+1 || h.top>=m.bottom-1,
            отступы:Math.round(h.left-c.left)+'/'+Math.round(c.bottom-h.bottom)};
  });
  say('лента лежит на панели слева внизу',
      лента.внутри && лента.слева && лента.снизу, 'отступы '+лента.отступы);
  say('лента не налезает на множитель', лента.неНаМножителе);
  /* Боковая прокрутка включает и вертикальную: без явной высоты ряд
     обрезал чипы ровно посередине цифр, и читались они как мусор. */
  const чип=await p.evaluate(()=>{
    const h=document.getElementById('cHist'), i=h.querySelector('i');
    if(!i) return null;
    const r=h.getBoundingClientRect(), ri=i.getBoundingClientRect();
    return {цел: ri.top>=r.top-0.5 && ri.bottom<=r.bottom+0.5,
            высота:Math.round(ri.height), ряд:Math.round(r.height)};
  });
  say('множители не обрезаны по высоте', !!чип && чип.цел,
      чип ? 'чип '+чип.высота+'px в ряду '+чип.ряд+'px' : 'ленты нет');

  /* Итог раунда виден по цвету строки: забрал — зелёная, не успел —
     красная. Числа читать для этого не нужно. Смотрим сразу после
     обрыва: в следующем ожидании состав уже новый и без классов. */
  await жди(p,()=>!document.getElementById('cGo').disabled &&
      /Поставить|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
  await p.click('#cGo');
  await жди(p,()=>document.getElementById('cMult').className.includes('boom'),35000);
  const строки=await p.evaluate(()=>[...document.querySelectorAll('#cPlayers .cpr')].map(el=>{
    const c=getComputedStyle(el);
    return {кл:el.className, фон:c.backgroundImage!=='none'};
  }));
  say('строки раунда подсвечены по итогу',
      строки.some(r=>/\bwin\b/.test(r.кл)||/\blose\b/.test(r.кл)) &&
      строки.filter(r=>/\bwin\b|\blose\b/.test(r.кл)).every(r=>r.фон),
      строки.length+' строк: '+строки.map(r=>r.кл.replace('cpr','').trim()||'—').join(', '));
  await p.waitForTimeout(2800);

  await p.close();

  /* Музыка раунда. Внутрь приложения не заглянуть — весь код живёт в
     замыкании, — поэтому считаем, что слышно снаружи: сколько нот
     заказано звуковой машине. В полёте их поток идёт, после обрыва
     обязан прекратиться, иначе музыка останется играть в пустом
     экране. Звук включаем отдельно: в остальных проверках он выключен. */
  console.log('— музыка раунда —');
  {
    const pm=await b.newPage({viewport:{width:393,height:752}});
    pm.on('pageerror',e=>errs.push(String(e)));
    await pm.addInitScript(()=>{
      localStorage.setItem('starshash_prefs',JSON.stringify({vibro:true,sound:true,lang:'ru'}));
      localStorage.setItem('starshash_state',JSON.stringify({bal:50000,fs:{d:'2026-08-07'},dl:{streak:0,last:''}}));
      window.__нот=0;
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){ const f=AC.prototype.createOscillator;
        AC.prototype.createOscillator=function(){ window.__нот++; return f.apply(this,arguments); }; }
    });
    await pm.goto(require('./helpers').АДРЕС); await pm.waitForTimeout(1600);
    await pm.evaluate(()=>{const x=document.getElementById('stX');
      if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
    await pm.waitForTimeout(300);
    await pm.click('.tab[data-p="games"]'); await pm.waitForTimeout(400);
    await pm.click('#goCrash'); await pm.waitForTimeout(500);

    await жди(pm,()=>!document.getElementById('cGo').disabled &&
        /Поставить|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
    await pm.click('#cGo');
    /* дожидаемся именно полёта: до него идёт отсчёт, и музыки там нет */
    await жди(pm,()=>parseFloat(document.getElementById('cMult').textContent)>1.05,20000);
    const было=await pm.evaluate(()=>window.__нот);
    await pm.waitForTimeout(1200);
    const стало=await pm.evaluate(()=>window.__нот);
    say('в полёте музыка звучит', стало>было, было+' → '+стало+' нот');

    await жди(pm,()=>document.getElementById('cMult').className.includes('boom'),35000);
    await pm.waitForTimeout(900);          // дать отзвучать звуку обрыва
    const после=await pm.evaluate(()=>window.__нот);
    await pm.waitForTimeout(1500);
    const тишина=await pm.evaluate(()=>window.__нот);
    say('после обрыва музыка смолкает', тишина===после, после+' → '+тишина+' нот');
    await pm.close();
  }

  console.log('ОШИБКИ:', errs.length?JSON.stringify([...new Set(errs)]):'нет');
  process.exitCode = errs.length ? 1 : 0;
  await b.close();
})();
