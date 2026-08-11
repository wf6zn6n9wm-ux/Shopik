const out=[]; let fails=0;
const t=(l,a,e)=>{const ok=String(a)===String(e);if(!ok)fails++;out.push((ok?"PASS":"FAIL")+" | "+l+(ok?"":"  очік="+e+" отрим="+a));};
const $=(s)=>document.querySelector(s);
const txt=()=>$("#view").textContent.replace(/\s+/g," ");
const has=(re)=>re.test(txt());
const click=(s)=>{const n=$(s);if(!n){out.push("FAIL | немає "+s);fails++;return false}n.click();return true};
const type=(s,v)=>{const n=$(s);if(!n){out.push("FAIL | немає поля "+s);fails++;return}n.value=v;
  n.dispatchEvent(new Event("input",{bubbles:true}));};
setTimeout(()=>{
try{
  // онбординг
  t("перший запуск — онбординг", has(/Нічого не треба вводити руками/), true);
  click('[data-onb="fridge"]');
  t("холодильник · 14 позицій", has(/14 позицій/), true);
  t("свіжих 57%", has(/57%/), true);
  t("банер нагадування", has(/Нагадування/), true);
  click("[data-push]");
  t("банер ховається", has(/Нагадування/), false);

  // пошук і фільтр
  type("#q","молок");
  t("пошук знайшов 1", has(/Знайдено 1/), true);
  type("#q","");
  click('[data-place="морозилка"]');
  t("фільтр морозилка · 1", has(/Знайдено 1/), true);
  t("це фарш", has(/Фарш яловичий/), true);
  click('[data-place="all"]');

  // списання
  click('[data-tab="soon"]');
  t("екран Скоро", has(/Вжити до · минуло/), true);
  t("рецепти зі складу", has(/Ідеї з того, що горить/), true);
  click("[data-eat]");
  click('[data-tab="fridge"]');
  t("після списання 13", has(/13 позицій/), true);

  // чек
  click('[data-tab="add"]');
  t("екран Додати · 4 способи", has(/Фото чека/) && has(/Голосом/) && has(/Штрихкод/) && has(/Вручну/), true);
  click('[data-go="scan"]');
  t("три чеки", document.querySelectorAll("[data-scan]").length, 3);
  click('[data-scan="atb"]');
  t("АТБ зійшовся", has(/Чек зійшовся · 77.40 = 77.40/), true);
  click("[data-add]");
  t("після чека 15", has(/15 позицій/), true);
  click('[data-tab="add"]'); click('[data-go="scan"]'); click('[data-scan="cut"]');
  t("обрізаний · не вистачає 239.60", has(/Не вистачає 239.60 ₴/), true);
  t("обрізаний · ПДВ", has(/ПДВ 44.88 ₴ не сходиться/), true);
  t("обрізаний · пропонує перезняти", has(/Перезняти повністю/), true);

  // голос
  click('[data-tab="add"]'); click('[data-go="voice"]');
  click('[data-voice="1"]');
  t("голос розпізнав фразу", has(/поклав молоко, фарш і шпинат/), true);
  click("[data-voiceadd]");
  t("після голосу 18", has(/18 позицій/), true);

  // штрихкод
  click('[data-tab="add"]'); click('[data-go="barcode"]');
  t("штрихкод знайшов товар", has(/Знайдено в базі/), true);
  click("[data-bcadd]");
  t("після штрихкоду 19", has(/19 позицій/), true);

  // вручну
  click('[data-tab="add"]'); click('[data-go="manual"]');
  type("#m-name","Сир Пармезан");
  click('[data-mcat="dairy_cheese_hard"]');
  t("категорія дала термін 30 дн", has(/термін 30 дн/), true);
  click('[data-mplace="полиця 1"]');
  click("[data-madd]");
  t("після ручного 20", has(/20 позицій/), true);
  type("#q","пармезан");
  t("пармезан знаходиться пошуком", has(/Сир Пармезан/), true);
  t("у нього полиця 1", has(/полиця 1/), true);
  type("#q","");

  // картка + редагування
  click('[data-card]');
  t("картка відкрилась", has(/Твоя історія з ним/), true);
  click("[data-edit]");
  t("режим редагування", has(/Зберегти/), true);
  type("#e-qty","250 г");
  click("[data-save]");
  t("зміни збережено", has(/250 г/), true);

  // список покупок
  click('[data-tab="list"]');
  type("#l-name","Банани");
  click("[data-ladd]");
  t("банани у списку", has(/Банани/), true);
  click("[data-lquick]");
  click('[data-shop="1"]');
  t("режим магазину", has(/у кошику/), true);
  click("[data-tog]");
  click("[data-buy]");
  t("покупки додано", has(/позицій/), true);

  // ще
  click('[data-tab="more"]'); 
  t("віджет у Ще", has(/Так виглядає віджет/), true);
  click('[data-go="report"]');
  t("звіт", has(/Слабкі місця/), true);
  t("шпинат слабке місце", has(/Шпинат\s*викинуто 2×/), true);
  click('[data-go="more"]'); click('[data-go="family"]');
  t("сімʼя", has(/Останні дії/), true);
  click('[data-go="more"]'); click('[data-go="settings"]');
  t("налаштування", has(/Місця зберігання/), true);
  click('[data-theme="dark"]');
  t("темна тема", document.documentElement.dataset.t, "dark");
  click('[data-theme="light"]');
  t("світла тема", document.documentElement.dataset.t, "light");
  t("сегмент підсвічений", $('[data-theme="light"]').className, "on");
  click('[data-theme="system"]');
  t("системна тема розвʼязується", ["light","dark"].includes(document.documentElement.dataset.t), true);
  click('[data-theme="dark"]');
  click("[data-notify]");


  // ── нове: заморозка ────────────────────────────────────────────────
  click('[data-tab="soon"]');
  t("у Скоро є кнопка заморозити", !!$("[data-freeze]"), true);
  click("[data-freeze]");
  click('[data-tab="fridge"]');
  click('[data-place="морозилка"]');
  t("щось переїхало в морозилку", /Знайдено [1-9]/.test(txt()), true);
  click('[data-place="all"]');

  // ── нове: часткове списання ────────────────────────────────────────
  click('[data-card]');
  t("картка має частки", !!$("[data-part]"), true);
  click('[data-share="0.5"]');
  t("залишок показано", /лишилось ½/.test(txt()), true);
  click('[data-share="0.5"]');
  t("друга половина списала позицію", /лишилось ½/.test(txt()), false);

  // ── нове: категорії ────────────────────────────────────────────────
  click('[data-tab="more"]');
  click('[data-go="cats"]');
  t("екран категорій", /Спершу те, де щось горить/.test(txt()), true);
  t("категорії клікабельні", document.querySelectorAll("[data-cat]").length > 3, true);
  $("[data-cat]").click();
  t("фільтр за категорією застосувався", /Знайдено/.test(txt()), true);
  t("є чіп скидання", !!$('[data-cat="all"]'), true);
  click('[data-cat="all"]');
  t("фільтр скинуто", /Далі за терміном/.test(txt()), true);

  // ── нове: історія чеків ────────────────────────────────────────────
  click('[data-tab="more"]');
  t("у Ще є історія чеків", has(/Історія чеків/), true);
  click('[data-go="receipts"]');
  t("в історії є чеки", /\d+ чек/.test(txt()), true);
  t("щойно доданий чек зверху", /АТБ · Чорноморськ.*24\.08/.test(txt()), true);
  t("рядок чека клікабельний", !!$("[data-hist]"), true);
  click("[data-hist]");
  t("деталі чека", has(/Що додано/), true);
  t("у чеку видно позиції", has(/Ролліні/), true);
  click('[data-go="receipts"]');
  t("назад до списку чеків", has(/Історія чеків/), true);

  // ── нове: камера і адреса сканера ──────────────────────────────────
  click('[data-tab="add"]'); click('[data-go="scan"]');
  t("є кнопка камери", !!$("#shot"), true);
  t("є вибір з галереї", !!$("#pick"), true);
  t("без адреси попереджає чесно", has(/Адресу сервера розпізнавання не вказано/), true);
  t("демо-чеки на місці", document.querySelectorAll("[data-scan]").length, 3);
  click('[data-tab="more"]'); click('[data-go="settings"]');
  type("#s-api","https://scan.example.com/api/receipt");
  click('[data-tab="add"]'); click('[data-go="scan"]');
  t("адресу видно на екрані знімка", has(/scan\.example\.com/), true);
  t("попередження зникло", has(/Адресу сервера розпізнавання не вказано/), false);
  click('[data-tab="more"]'); click('[data-go="settings"]');
  t("адреса збереглась", $("#s-api").value, "https://scan.example.com/api/receipt");
  click("[data-apiclear]");
  t("адресу прибрано", has(/не налаштовано/), true);

  // ── нове: КБЖУ ─────────────────────────────────────────────────────
  click('[data-tab="fridge"]');
  type("#q","яйц");
  click('[data-card]');
  t("у картці є КБЖУ", has(/ккал/), true);
  t("КБЖУ підписано джерелом", /середнє по категорії|за штрихкодом|Open Food Facts/.test(txt()), true);
  click('[data-tab="more"]'); click('[data-go="settings"]');
  click("[data-nutr]");
  click('[data-tab="fridge"]'); click('[data-card]');
  t("вимкнене КБЖУ зникає", has(/ккал/), false);
  click('[data-tab="more"]'); click('[data-go="settings"]'); click("[data-nutr]");
  click('[data-tab="fridge"]'); type("#q","");

  // ── нове: обмін файлом замість фейкової синхронізації ──────────────
  click('[data-tab="more"]'); click('[data-go="family"]');
  t("чесно про синхронізацію", has(/Справжня синхронізація потребує сервера/), true);
  t("є вивантаження у файл", !!$("[data-export]"), true);
  t("є завантаження з файла", !!$("#imp"), true);
  click('[data-go="more"]'); click('[data-go="settings"]');
  t("у налаштуваннях теж є обмін", !!$("[data-export]") && !!$("#imp2"), true);


  // ── нове: гроші ────────────────────────────────────────────────────
  click('[data-tab="more"]');
  t("у Ще є Гроші", has(/Гроші/), true);
  t("у Ще є Ритм покупок", has(/Ритм покупок/), true);
  click('[data-go="money"]');
  t("екран грошей", has(/зараз, ₴/) && has(/викинуто, ₴/), true);
  t("витрачено за 30 днів", has(/витрачено, ₴/), true);
  t("особиста інфляція порахована", /Твій кошик подорожчав на \+\d/.test(txt()), true);
  t("є порівняння магазинів", has(/Де дешевше/), true);
  t("АТБ найдешевший", /АТБ · Чорноморськ[\s\S]{0,80}дешевше/.test(txt()), true);
  t("Сільпо дорожче", /Сільпо · Одеса[\s\S]{0,80}\+\d+%/.test(txt()), true);

  // ── нове: ритм покупок ─────────────────────────────────────────────
  click('[data-tab="more"]'); click('[data-go="rhythm"]');
  t("екран ритму", has(/Ритм покупок/), true);
  t("молоко має період", /Молоко 2,5%[\s\S]{0,60}кожні \d+ дн/.test(txt()), true);
  t("кава рідкісна", /Кава мелена[\s\S]{0,60}кожні \d\d дн/.test(txt()), true);
  t("чесно про частоту походів", has(/не буває точнішим за твої походи/), true);
  const rb = $("[data-rhadd]");
  t("є кнопка додати за ритмом", !!rb, true);
  if (rb && !rb.disabled) {
    click("[data-rhadd]");
    t("перекинуло у список", has(/Список покупок/), true);
    t("позначено, що за ритмом", has(/за ритмом/), true);
  }

  // скидання
  click('[data-tab="more"]'); click('[data-go="settings"]');
  click("[data-reset]");
  t("скидання повертає онбординг", has(/Нічого не треба вводити руками/), true);


}catch(err){out.push("CRASH | "+(err&&err.message)+" @ "+(err&&err.stack||"").split("\n")[1]);fails++;}
  document.getElementById("R").textContent="===\n"+out.join("\n")+"\n=== FAILS: "+fails;
},400);
