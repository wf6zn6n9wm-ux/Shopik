// Фікстури — записаний сирий витяг із ДВОХ СПРАВЖНІХ чеків.
//
// Це не вигадані приклади. Обидва чеки реальні, і другий навмисно поганий:
// знятий під кутом, зім'ятий, обрізаний зверху. Саме на ньому перевіряється,
// що додаток чесно каже «перезніміть», а не мовчки додає три позиції з
// дванадцяти.
//
// Завдяки фікстурам `npm test` працює без ключа і без мережі.

/** АТБ, Чорноморськ, 24.08.2025. Повний чек — усе сходиться. */
const ATB_COMPLETE = {
  store: { name: 'АТБ-Маркет', address: 'Одеська обл., м. Чорноморськ, вул. Паркова, 2а' },
  receipt: {
    date: '2025-08-24',
    time: '21:40',
    fiscal_number: '3000755572',
    total: 77.4,
    vat_amount: 12.9,
    vat_rate: 20,
  },
  lines: [
    {
      raw_text: 'Ролліні 95 г з телятиною (Н) без/у п ГП',
      quantity: 1, unit: 'шт', unit_price: 23.9, line_total: 23.9,
      barcode: '2999300069184', tax_letter: 'A',
      model_category: 'meat_snack', model_is_food: true,
    },
    {
      raw_text: 'Батончик 90 г Nestle Lion King м/у п',
      quantity: 1, unit: 'шт', unit_price: 53.5, line_total: 53.5,
      barcode: '7613036731713', tax_letter: 'A',
      model_category: 'sweets', model_is_food: true,
    },
  ],
  image_quality: { top_cut_off: false, bottom_cut_off: false, blurry: false },
};

/** Чек від 11.01.2022 — обрізаний зверху. Видно 3 позиції з приблизно 12. */
const CROPPED_RECEIPT = {
  store: { name: '', address: '' },
  receipt: {
    date: '2022-01-11',
    time: '13:44',
    fiscal_number: '3000267912',
    total: 309.5,
    vat_amount: 44.88,
    vat_rate: 20,
  },
  lines: [
    {
      raw_text: 'Точилка-гумка 2 в 1, арт. МР58320',
      quantity: 2, unit: 'шт', unit_price: 24.9, line_total: 49.8,
      barcode: '', tax_letter: 'A',
      model_category: 'nonfood', model_is_food: false,
    },
    {
      raw_text: 'Цукерки 80 г жувальні Bebeto Worms м/уп',
      quantity: 1, unit: 'шт', unit_price: 11.2, line_total: 11.2,
      barcode: '', tax_letter: 'A',
      model_category: 'sweets', model_is_food: true,
    },
    {
      raw_text: 'Вода 1,5 л Buvette №7 природна лікувально-столова',
      quantity: 1, unit: 'шт', unit_price: 8.9, line_total: 8.9,
      barcode: '', tax_letter: 'A',
      model_category: 'drinks_water', model_is_food: true,
    },
  ],
  image_quality: { top_cut_off: true, bottom_cut_off: false, blurry: false },
};

/** Синтетичний випадок: службові рядки серед позицій. */
const WITH_SERVICE_LINES = {
  store: { name: 'Сільпо', address: '' },
  receipt: {
    date: '2026-08-10', time: '18:02', fiscal_number: '3000111222',
    total: 120, vat_amount: 20, vat_rate: 20,
  },
  lines: [
    {
      raw_text: 'Молоко 2,5% 900 г Яготинське т/п',
      quantity: 1, unit: 'шт', unit_price: 45, line_total: 45,
      barcode: '4820000000017', tax_letter: 'A',
      model_category: 'dairy_milk', model_is_food: true,
    },
    {
      raw_text: 'Шпинат 200 г свіжий',
      quantity: 1, unit: 'шт', unit_price: 35, line_total: 35,
      barcode: '', tax_letter: 'A',
      model_category: 'veg_leafy', model_is_food: true,
    },
    {
      raw_text: 'Пакет-майка',
      quantity: 2, unit: 'шт', unit_price: 2.5, line_total: 5,
      barcode: '', tax_letter: 'A',
      model_category: 'nonfood', model_is_food: false,
    },
    {
      raw_text: 'Фарш яловичий 400 г охолоджений',
      quantity: 1, unit: 'шт', unit_price: 35, line_total: 35,
      barcode: '', tax_letter: 'A',
      model_category: 'meat_raw', model_is_food: true,
    },
    // Службовий рядок, який модель помилково поклала в lines.
    {
      raw_text: 'Готівка 200,00',
      quantity: 1, unit: 'шт', unit_price: 0, line_total: 0,
      barcode: '', tax_letter: '',
      model_category: 'unknown', model_is_food: false,
    },
  ],
  image_quality: { top_cut_off: false, bottom_cut_off: false, blurry: false },
};

export { ATB_COMPLETE, CROPPED_RECEIPT, WITH_SERVICE_LINES };
