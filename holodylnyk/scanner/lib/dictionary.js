// Словник української роздрібної торгівлі.
//
// Ключове спостереження з реальних чеків: українські мережі ставлять
// категорію ПЕРШИМ словом — «Батончик 90 г Nestle Lion King», «Вода 1,5 л
// Buvette», «Цукерки 80 г жувальні Bebeto». Тому нормалізація будується
// навколо першого токена, а не навколо повного рядка.
//
// Це стартовий словник (~250 позицій). Він має рости з реальних чеків:
// кожна позиція, яку розпізнало як `unknown`, — кандидат сюди.

/** Службові рядки чека. Ніколи не товар. */
const SERVICE_LINES = [
  'готівка', 'картка', 'сума', 'до сплати', 'решта', 'здача', 'пдв',
  'знижка', 'бонус', 'округлення', 'еквайринг', 'епз', 'код транз',
  'код авт', 'платіжна система', 'каса', 'чек', 'штрих код', 'штрихкод',
  'дякуємо', 'фіскальний', 'z-звіт', 'z звіт', 'зн ', 'фн ', 'mac=',
  'оплата', 'касир', 'держатель', 'разом', 'без пдв', 'акциз',
];

/** Скорочення пакування — прибираємо з назви, але зберігаємо в raw. */
const PACKAGING_TOKENS = [
  'м/уп', 'м/у', 'м\\у', 'п/е', 'ф/п', 'в/у', 'без/у', 'т/п', 'с/м',
  'в/г', 'ваг', 'п гп', 'гп', 'н/о', 'б/у', 'шт', 'уп',
];

/**
 * Перший токен → { category, food }.
 * `food: false` означає «не їжа» — позиція не потрапляє в холодильник.
 */
const FIRST_TOKEN = {
  // ── М'ясо ───────────────────────────────────────────────────────────
  'фарш': 'meat_raw', 'м\'ясо': 'meat_raw', 'мясо': 'meat_raw',
  'свинина': 'meat_raw', 'яловичина': 'meat_raw', 'телятина': 'meat_raw',
  'баранина': 'meat_raw', 'вирізка': 'meat_raw', 'стейк': 'meat_raw',
  'ребра': 'meat_raw', 'печінка': 'meat_raw', 'серце': 'meat_raw',
  'курка': 'poultry', 'філе': 'poultry', 'стегно': 'poultry',
  'крило': 'poultry', 'гомілка': 'poultry', 'індичка': 'poultry',
  'окіст': 'meat_processed', 'шинка': 'meat_processed',
  'ковбаса': 'meat_processed', 'сосиски': 'meat_processed',
  'сардельки': 'meat_processed', 'бекон': 'meat_processed',
  'салямі': 'meat_processed', 'балик': 'meat_processed',
  'сало': 'meat_processed', 'паштет': 'meat_processed',

  // ── Риба ────────────────────────────────────────────────────────────
  'риба': 'fish_raw', 'лосось': 'fish_raw', 'форель': 'fish_raw',
  'скумбрія': 'fish_raw', 'тунець': 'fish_raw', 'хек': 'fish_raw',
  'минтай': 'fish_raw', 'креветки': 'fish_raw', 'кальмар': 'fish_raw',
  'мідії': 'fish_raw',
  'оселедець': 'fish_smoked', 'ікра': 'fish_smoked',

  // ── Молочка ─────────────────────────────────────────────────────────
  'молоко': 'dairy_milk', 'вершки': 'dairy_milk', 'кефір': 'dairy_milk',
  'ряжанка': 'dairy_milk', 'айран': 'dairy_milk', 'закваска': 'dairy_milk',
  'йогурт': 'dairy_yogurt', 'сирок': 'dairy_yogurt',
  'сметана': 'dairy_sourcream',
  'сир': 'dairy_cheese_hard', 'бринза': 'dairy_cheese_soft',
  'моцарела': 'dairy_cheese_soft', 'фета': 'dairy_cheese_soft',
  'творог': 'dairy_cheese_soft',
  'масло': 'dairy_butter', 'маргарин': 'dairy_butter',

  // ── Яйця ────────────────────────────────────────────────────────────
  'яйця': 'eggs', 'яйце': 'eggs',

  // ── Овочі ───────────────────────────────────────────────────────────
  'шпинат': 'veg_leafy', 'салат': 'veg_leafy', 'зелень': 'veg_leafy',
  'кріп': 'veg_leafy', 'петрушка': 'veg_leafy', 'рукола': 'veg_leafy',
  'базилік': 'veg_leafy', 'щавель': 'veg_leafy', 'кінза': 'veg_leafy',
  'картопля': 'veg_root', 'морква': 'veg_root', 'цибуля': 'veg_root',
  'буряк': 'veg_root', 'часник': 'veg_root', 'редька': 'veg_root',
  'імбир': 'veg_root', 'капуста': 'veg_root', 'гарбуз': 'veg_root',
  'помідори': 'veg_other', 'томати': 'veg_other', 'огірки': 'veg_other',
  'перець': 'veg_other', 'кабачки': 'veg_other', 'баклажани': 'veg_other',
  'гриби': 'veg_other', 'печериці': 'veg_other', 'кукурудза': 'veg_other',
  'броколі': 'veg_other', 'спаржа': 'veg_other', 'редис': 'veg_other',

  // ── Фрукти ──────────────────────────────────────────────────────────
  'яблука': 'fruit', 'банани': 'fruit', 'апельсини': 'fruit',
  'мандарини': 'fruit', 'груші': 'fruit', 'виноград': 'fruit',
  'лимон': 'fruit', 'лайм': 'fruit', 'авокадо': 'fruit', 'ківі': 'fruit',
  'персики': 'fruit', 'сливи': 'fruit', 'нектарини': 'fruit',
  'ананас': 'fruit', 'гранат': 'fruit', 'хурма': 'fruit', 'манго': 'fruit',
  'полуниця': 'berries', 'чорниця': 'berries', 'малина': 'berries',
  'смородина': 'berries', 'вишня': 'berries', 'черешня': 'berries',
  'ожина': 'berries', 'журавлина': 'berries',

  // ── Хліб ────────────────────────────────────────────────────────────
  'хліб': 'bread', 'батон': 'bread', 'булка': 'bread', 'булочка': 'bread',
  'лаваш': 'bread', 'багет': 'bread', 'коровай': 'bread', 'тост': 'bread',
  'сухарі': 'bread', 'круасан': 'bread', 'піта': 'bread',

  // ── Солодке та снеки ────────────────────────────────────────────────
  'цукерки': 'sweets', 'шоколад': 'sweets', 'батончик': 'sweets',
  'печиво': 'sweets', 'вафлі': 'sweets', 'торт': 'sweets',
  'тістечко': 'sweets', 'мармелад': 'sweets', 'зефір': 'sweets',
  'халва': 'sweets', 'джем': 'sweets', 'варення': 'sweets',
  'мед': 'sweets', 'згущене': 'sweets', 'рулет': 'sweets',
  'морозиво': 'frozen',
  'чіпси': 'snacks', 'сухарики': 'snacks', 'горішки': 'snacks',
  'арахіс': 'snacks', 'фісташки': 'snacks', 'мигдаль': 'snacks',
  'крекер': 'snacks', 'попкорн': 'snacks', 'снеки': 'snacks',

  // ── Напої ───────────────────────────────────────────────────────────
  'вода': 'drinks_water', 'мінералка': 'drinks_water',
  'сік': 'drinks_juice', 'нектар': 'drinks_juice', 'морс': 'drinks_juice',
  'смузі': 'drinks_juice',
  'напій': 'drinks_soda', 'лимонад': 'drinks_soda', 'квас': 'drinks_soda',
  'кола': 'drinks_soda', 'енергетик': 'drinks_soda',
  'пиво': 'drinks_soda', 'вино': 'drinks_soda', 'сидр': 'drinks_soda',
  'кава': 'grocery_dry', 'чай': 'grocery_dry',

  // ── Бакалія ─────────────────────────────────────────────────────────
  'крупа': 'grocery_dry', 'гречка': 'grocery_dry', 'рис': 'grocery_dry',
  'макарони': 'grocery_dry', 'спагеті': 'grocery_dry',
  'вермішель': 'grocery_dry', 'борошно': 'grocery_dry',
  'цукор': 'grocery_dry', 'сіль': 'spices', 'вівсянка': 'grocery_dry',
  'пшоно': 'grocery_dry', 'манка': 'grocery_dry', 'горох': 'grocery_dry',
  'квасоля': 'grocery_dry', 'сочевиця': 'grocery_dry',
  'булгур': 'grocery_dry', 'кускус': 'grocery_dry', 'пластівці': 'grocery_dry',
  'дріжджі': 'grocery_dry', 'сода': 'grocery_dry', 'крохмаль': 'grocery_dry',

  // ── Олія, соуси, консерви ───────────────────────────────────────────
  'олія': 'oil', 'оцет': 'oil',
  'майонез': 'sauces', 'кетчуп': 'sauces', 'соус': 'sauces',
  'гірчиця': 'sauces', 'аджика': 'sauces', 'хрін': 'sauces',
  'паста': 'sauces',
  'консерва': 'canned', 'тушонка': 'canned', 'шпроти': 'canned',
  'горошок': 'canned', 'оливки': 'canned', 'маслини': 'canned',
  'квашена': 'canned',
  'спеції': 'spices', 'приправа': 'spices', 'кориця': 'spices',
  'ваніль': 'spices', 'лавровий': 'spices', 'куркума': 'spices',

  // ── Заморозка ───────────────────────────────────────────────────────
  'пельмені': 'frozen', 'вареники': 'frozen', 'млинці': 'frozen',
  'наггетси': 'frozen', 'котлети': 'frozen', 'піца': 'frozen',
  'чебуреки': 'frozen', 'хінкалі': 'frozen',

  // ── НЕ ЇЖА ──────────────────────────────────────────────────────────
  // На українських чеках усе йде за однією ставкою ПДВ, тому німецький
  // трюк «7% = їжа, 19% = не їжа» тут не працює. Потрібен смисловий фільтр.
  'пакет': 'nonfood', 'точилка': 'nonfood', 'зошит': 'nonfood',
  'ручка': 'nonfood', 'олівець': 'nonfood', 'серветки': 'nonfood',
  'папір': 'nonfood', 'мило': 'nonfood', 'шампунь': 'nonfood',
  'порошок': 'nonfood', 'гель': 'nonfood', 'губка': 'nonfood',
  'батарейка': 'nonfood', 'лампа': 'nonfood', 'свічка': 'nonfood',
  'рукавички': 'nonfood', 'щітка': 'nonfood', 'засіб': 'nonfood',
  'освіжувач': 'nonfood', 'фольга': 'nonfood', 'плівка': 'nonfood',
  'сірники': 'nonfood', 'запальничка': 'nonfood', 'бальзам': 'nonfood',
  'дезодорант': 'nonfood', 'зубна': 'nonfood', 'прокладки': 'nonfood',
  'підгузки': 'nonfood', 'корм': 'nonfood', 'наповнювач': 'nonfood',
  'посуд': 'nonfood', 'кондиціонер': 'nonfood', 'відбілювач': 'nonfood',
};

/** Категорії, які за замовчуванням живуть у морозилці. */
const FREEZER_CATEGORIES = new Set(['frozen']);

/** Людські назви категорій — для інтерфейсу. */
const CATEGORY_LABELS = {
  meat_raw: 'М\'ясо', meat_processed: 'Ковбасні', meat_snack: 'М\'ясна закуска',
  poultry: 'Птиця', fish_raw: 'Риба', fish_smoked: 'Риба солона',
  dairy_milk: 'Молочка', dairy_yogurt: 'Молочка', dairy_cheese_hard: 'Сир',
  dairy_cheese_soft: 'Сир мʼякий', dairy_sourcream: 'Молочка',
  dairy_butter: 'Масло', eggs: 'Яйця',
  veg_leafy: 'Зелень', veg_root: 'Овочі', veg_other: 'Овочі',
  fruit: 'Фрукти', berries: 'Ягоди', bread: 'Хліб',
  sweets: 'Солодке', snacks: 'Снеки', frozen: 'Заморозка',
  drinks_water: 'Вода', drinks_juice: 'Соки', drinks_soda: 'Напої',
  grocery_dry: 'Бакалія', oil: 'Олія', sauces: 'Соуси',
  canned: 'Консерви', spices: 'Спеції', nonfood: 'Не їжа',
  unknown: 'Інше',
};

export {
  SERVICE_LINES,
  PACKAGING_TOKENS,
  FIRST_TOKEN,
  FREEZER_CATEGORIES,
  CATEGORY_LABELS,
};
