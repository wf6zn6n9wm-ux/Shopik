// Ловим ошибки времени выполнения при старте и на каждом экране.
//
// Тест не проверяет, ЧТО нарисовано, — только что ни один экран, ни одна
// вкладка админки и ни одна смена языка не выбросили исключение и не написали
// в console.error. Такие поломки не видны в юнит-тестах: файл синтаксически
// исправен, а падает уже в браузере.
import { openApp, wait } from './browser.mjs';

const { run, errors: errs, close } = await openApp({ port: 9341, collectErrors: true, settle: 1500 });

await run("onbMarkSeen();document.getElementById('onb').classList.remove('open');return 1");
for(const scr of ['home','games','pvp','contests','leaders','profile','refs','history','gifts','claims','rewards','ach','settings']){
  await run("go('"+scr+"');return 1"); await wait(120);
}
await run("S.isAdmin=true;syncAdminEntry();go('admin');return 1");
for(const tab of ['stats','players','gifts','grant']) { await run("admTab('"+tab+"');return 1"); await wait(120); }
for(const l of ['uk','ru','en']) await run("setLang('"+l+"');return 1");
await run("setGameTab('crash');setGameTab('roulette');return 1");
await run("openTopup();closeSheet();return 1");
console.log(errs.length?('ERRORS:\n'+[...new Set(errs)].join('\n')):'no runtime errors across 13 screens + 4 admin tabs + 3 langs');
close();process.exit(errs.length?1:0);
