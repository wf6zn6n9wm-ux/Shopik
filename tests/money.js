/* Денежные сценарии: каждый шаг сверяем по сохранённому балансу.
   Сравниваем с допуском — майнинг капает каждую секунду. */
const { браузер, открыть, жди, близко, состояние, день, Отчёт } = require('./helpers');

(async () => {
  const о = new Отчёт('money');
  const b = await браузер();
  const p = await открыть(b, { состояние: { bal: 100000, fs: { d: день() }, dl: { streak: 0, last: '' } } });
  const бал = async () => (await состояние(p)).bal;
  const влож = async () => (await состояние(p)).inv || 0;

  о.раздел('бонус');
  let до = await бал();
  await p.click('#btnBonus'); await p.waitForTimeout(700);
  await p.click('#bnGo'); await p.waitForTimeout(700);
  let после = await бал();
  о.проверка('первый бонус +10 ★', близко(после - до, 10), 'начислено ' + (после - до).toFixed(2));
  await p.click('#bnX'); await p.waitForTimeout(400);

  о.раздел('вклад в мощность');
  до = await бал(); const в0 = await влож();
  await p.click('.card.earn').catch(() => {}); await p.waitForTimeout(600);
  if (await p.evaluate(() => document.getElementById('ivSheet').getAttribute('aria-hidden') === 'false')) {
    await p.fill('#ivAmt', '1000').catch(() => {});
    await p.evaluate(() => document.getElementById('ivAmt').dispatchEvent(new Event('input', { bubbles: true }))).catch(() => {});
    await p.waitForTimeout(300);
    await p.click('#ivGo', { force: true }).catch(() => {}); await p.waitForTimeout(700);
    const б = await бал(), в = await влож();
    о.проверка('вложено 1000 ★', близко(до - б, 1000) && близко(в - в0, 1000),
      'баланс ' + до.toFixed(2) + '→' + б.toFixed(2) + ', мощность ' + в0 + '→' + в);
  } else о.проверка('шторка вклада открылась', false);

  о.раздел('пополнение');
  до = await бал();
  await p.click('#btnAdd'); await p.waitForTimeout(600);
  await p.fill('#dpAmt', '500').catch(() => {});
  await p.evaluate(() => document.getElementById('dpAmt').dispatchEvent(new Event('input', { bubbles: true }))).catch(() => {});
  await p.waitForTimeout(300);
  await p.click('#dpGo', { force: true }).catch(() => {}); await p.waitForTimeout(700);
  после = await бал();
  о.проверка('пополнение 500 ★', близко(после - до, 500), до.toFixed(2) + '→' + после.toFixed(2));

  о.раздел('вывод');
  до = await бал();
  await p.click('[data-i18n="withdraw"]'); await p.waitForTimeout(700);
  await p.fill('#wUser', 'starshash'); await p.fill('#wAmt', '1000');
  await p.evaluate(() => ['#wUser', '#wAmt'].forEach(s =>
    document.querySelector(s).dispatchEvent(new Event('input', { bubbles: true }))));
  await p.waitForTimeout(300);
  const обещано = await p.evaluate(() => document.getElementById('wNetS').textContent);
  await p.click('#wdGo', { force: true }); await p.waitForTimeout(700);
  после = await бал();
  о.проверка('вывод 1000 ★ списан целиком', близко(до - после, 1000), 'списано ' + (до - после).toFixed(2));
  о.проверка('к получению 950 ★ (комиссия 5%)', близко(+обещано, 950, 0.01), обещано);

  о.раздел('запреты');
  до = await бал();
  await p.click('[data-i18n="withdraw"]').catch(() => {}); await p.waitForTimeout(600);
  await p.fill('#wAmt', '10').catch(() => {});
  await p.evaluate(() => document.getElementById('wAmt').dispatchEvent(new Event('input', { bubbles: true })));
  await p.waitForTimeout(300);
  const выкл = await p.evaluate(() => document.getElementById('wdGo').disabled);
  await p.click('#wdGo', { force: true }).catch(() => {}); await p.waitForTimeout(500);
  после = await бал();
  о.проверка('вывод ниже минимума не проходит', выкл && близко(после, до),
    'кнопка ' + (выкл ? 'заблокирована' : 'АКТИВНА'));
  await p.click('#wdX', { force: true }).catch(() => {}); await p.waitForTimeout(400);
  await p.close();

  const бедный = await открыть(b, { состояние: { bal: 10, fs: { d: день() }, dl: { streak: 1, last: день() } } });
  await бедный.click('.tab[data-p="games"]'); await бедный.waitForTimeout(400);
  await бедный.click('#goPvp'); await бедный.waitForTimeout(700);
  const б0 = (await состояние(бедный)).bal;
  await бедный.click('#pChips button[data-pbet="1000"]').catch(() => {}); await бедный.waitForTimeout(200);
  await бедный.click('#pGo', { force: true }).catch(() => {}); await бедный.waitForTimeout(900);
  const б1 = (await состояние(бедный)).bal;
  const подпись = await бедный.evaluate(() => document.getElementById('pGo').textContent.trim());
  о.проверка('ставка больше баланса не проходит', близко(б1, б0) && б1 >= 0,
    'баланс ' + б0.toFixed(2) + '→' + б1.toFixed(2) + ', кнопка: «' + подпись + '»');
  await бедный.close();

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
