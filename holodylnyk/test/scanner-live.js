// Живий сканер від кінця до кінця: справжній файл у input[type=file],
// підмінений fetch, відповідь у форматі api/receipt.js.
const out=[]; let fails=0;
const t=(l,a,e)=>{const ok=String(a)===String(e);if(!ok)fails++;out.push((ok?"PASS":"FAIL")+" | "+l+(ok?"":"  очік="+e+" отрим="+a));};
const $=(s)=>document.querySelector(s);
const txt=()=>$("#view").textContent.replace(/\s+/g," ");
const has=(re)=>re.test(txt());
const click=(s)=>{const n=$(s);if(!n){out.push("FAIL | немає "+s);fails++;return false}n.click();return true};
const type=(s,v)=>{const n=$(s);if(!n){out.push("FAIL | немає поля "+s);fails++;return}n.value=v;
  n.dispatchEvent(new Event("input",{bubbles:true}));};

const RESP = {
  ok:true,
  store:{ name:"Сільпо · Одеса", address:"вул. Грецька, 1" },
  receipt:{ date:"2026-08-11", time:"19:05", fiscal_number:"4000123456",
            total:128.5, vat_amount:21.42, vat_rate:20 },
  validation:{ verdict:"ok",
    sum:{ ok:true, status:"balanced", lines_sum:128.5, printed_total:128.5, missing:0 },
    vat:{ ok:true, status:"uniform_rate", expected:21.42 },
    recognized_share:1, reasons:[], suggested_action:"add_all" },
  items:[
    { name:"Кефір 1% Яготинський", category:"dairy_milk", category_source:"dictionary",
      quantity:1, unit:"шт", line_total:38.9, barcode:"4820000000017",
      storage:"fridge", expires_on:"2026-08-18", needs_review:false },
    { name:"Печериці", category:"veg_other", category_source:"model",
      quantity:0.4, unit:"кг", line_total:47.6, barcode:"",
      storage:"fridge", expires_on:"2026-08-18", needs_review:true },
    { name:"Хліб Київський", category:"bread", category_source:"dictionary",
      quantity:1, unit:"шт", line_total:32, barcode:"",
      storage:"pantry", expires_on:"2026-08-14", needs_review:false },
  ],
  skipped:[{ raw:"ПАКЕТ-МАЙКА 2ШТ", name:"Пакет-майка", reason:"не їжа" }],
  stats:{ lines_read:4, items_added:3, items_skipped:1, needs_review:1 },
};

let SENT = null;
window.fetch = (url, opts) => {
  SENT = { url, opts };
  return Promise.resolve({ ok:true, status:200,
    text:() => Promise.resolve(JSON.stringify(RESP)) });
};

const putFile = (sel) => {
  const n = $(sel);
  if (!n) { out.push("FAIL | немає " + sel); fails++; return; }
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70])],
    "chek.jpg", { type:"image/jpeg" }));
  n.files = dt.files;
  n.dispatchEvent(new Event("change", { bubbles:true }));
};

const steps = [
  () => {
    click('[data-onb="fridge"]');
    click('[data-tab="more"]'); click('[data-go="settings"]');
    type("#s-api", "https://scan.example.com/api/receipt");
    click('[data-tab="add"]'); click('[data-go="scan"]');
    t("адреса підхопилась", has(/scan\.example\.com/), true);
    putFile("#shot");
  },
  () => {
    t("фото зʼявилось на екрані", !!$(".shot img"), true);
    t("зʼявилась кнопка розпізнати", !!$("[data-send]"), true);
    click("[data-send]");
  },
  () => {
    t("запит пішов на вказану адресу", SENT && SENT.url, "https://scan.example.com/api/receipt");
    t("метод POST", SENT && SENT.opts.method, "POST");
    const body = JSON.parse(SENT.opts.body);
    t("тіло — data URL картинки", /^data:image\/jpeg;base64,/.test(body.image), true);
    t("магазин із відповіді", has(/Сільпо · Одеса/), true);
    t("вердикт сервера показано", has(/Чек зійшовся · 128.50 = 128.50/), true);
    t("три позиції розпізнано", has(/Розпізнано · 3/), true);
    t("кефір у списку", has(/Кефір 1% Яготинський/), true);
    t("кількість із одиницею", has(/0\.4 кг/), true);
    t("пакет пропущено з причиною", /Пакет-майка\s*не їжа\s*Пропущено/.test(txt()), true);
    t("модельну категорію позначено", has(/категорію дала модель/), true);
    t("фото видно поруч із розбором", !!$(".shot img"), true);
    click('[data-add="live"]');
  },
  () => {
    t("після живого чека 17", has(/17 позицій/), true);
    type("#q", "печериц");
    t("печериці в холодильнику", has(/Печериці/), true);
    click("[data-card]");
    t("термін з сервера, а не перерахований", has(/18\.08/), true);
    t("категорію позначено як «перевірте»", has(/визначила модель/), true);
    click('[data-tab="fridge"]'); type("#q", "");
    click('[data-tab="more"]'); click('[data-go="receipts"]');
    t("живий чек в історії", has(/Сільпо · Одеса/), true);
    t("позначено, що з камери", has(/з камери/), true);
    click("[data-hist]");
    t("в історії ті самі позиції", has(/Кефір/) && has(/Хліб Київський/), true);
    t("пропущену позицію пораховано", /1\s*пропущено/.test(txt()), true);
  },
];

let i = 0;
const next = () => {
  if (i >= steps.length) {
    document.getElementById("R").textContent = "===\n" + out.join("\n") + "\n=== FAILS: " + fails;
    return;
  }
  try { steps[i++](); }
  catch (err) { out.push("CRASH | " + (err && err.message) + " @ "
    + (err && err.stack || "").split("\n")[1]); fails++; i = steps.length; }
  setTimeout(next, 260);
};
setTimeout(next, 350);
