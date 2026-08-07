const { chromium } = require('./helpers').playwright();
const sizes=[[393,724,'tg-реальный'],[360,640,'малый'],[375,667,'se'],[393,752,'tg'],
             [390,844,'ip14'],[412,915,'pixel'],[430,932,'max'],[393,640,'нижняя граница'],[375,540,'se+шапка · прокрутка'],[360,610,'android+шапка · прокрутка']];
(async () => {
  const b = await chromium.launch();
  for(const [w,h,n] of sizes){
    const p = await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(require('./helpers').АДРЕС,{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(1600);
    // окно «С чего начать» всплывает на 900-й мс и перехватывает клики
    await p.evaluate(()=>{const x=document.getElementById('stX');
      if(x&&document.getElementById('stSheet').getAttribute('aria-hidden')==='false') x.click();});
    await p.waitForTimeout(350);
    const probe=async(label)=>{
      const m=await p.evaluate(()=>{
        const vh=document.documentElement.clientHeight;
        const page=document.querySelector('.page.on');
        const nav=document.querySelector('.nav').getBoundingClientRect();
        const app=document.getElementById('app').getBoundingClientRect();
        // проверяем наезд последнего блока страницы на навигацию
        const kids=[...page.children];
        const last=kids[kids.length-1].getBoundingClientRect();
        return {navOk:nav.bottom<=vh+0.5, navFixed:getComputedStyle(document.querySelector('.nav')).position==='fixed', dead:Math.round(vh-app.bottom),
          overlap:last.bottom>nav.top+0.5, ovf:page.scrollHeight-page.clientHeight,
          scroll:document.documentElement.scrollHeight-vh};
      });
      const scrollMode=m.navFixed;
      return `${label}:${scrollMode?'прокрутка '+m.scroll+(m.navOk?', nav закреплена':', NAV ОБРЕЗАНА'):(m.navOk?'nav ok':'NAV ОБРЕЗАНА')+(m.overlap?' НАЕЗД':'')+(m.ovf>2?' переполнение '+m.ovf:'')+(m.dead>2?' мёртвых '+m.dead+'px':'')}`;
    };
    let out=[await probe('заработок')];
    await p.evaluate(()=>[...document.querySelectorAll('.tab')].find(t=>t.dataset.p==='games').click());
    await p.waitForTimeout(350); out.push(await probe('игры'));
    await p.click('#goCrash'); await p.waitForTimeout(400); out.push(await probe('краш'));
    await p.click('#gCrash [data-back]'); await p.waitForTimeout(250);
    await p.click('#goPvp'); await p.waitForTimeout(500); out.push(await probe('пвп'));
    console.log(`${n.padEnd(13)} ${String(w+'x'+h).padEnd(9)} | ${out.join(' | ')}`, errs.length?'ERR:'+errs:'');
  }
  await b.close();
})();
