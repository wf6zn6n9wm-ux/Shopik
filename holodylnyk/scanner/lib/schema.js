// Схема витягу з фото чека.
//
// Модель віддає ТІЛЬКИ сире прочитане: рядки як надруковано, числа, штрихкоди.
// Нормалізацією («МЛК ЯГОТ 2,5%» → «Молоко») займається словник у коді —
// саме тому вона детермінована й тестована.
//
// Порожні значення позначаються "" і 0, а не null: строга схема
// структурованого виводу не любить nullable-типи, а чек із сумою 0 не існує.

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Назва мережі, напр. «АТБ». "" якщо не видно.' },
        address: { type: 'string', description: 'Адреса магазину або "".' },
      },
      required: ['name', 'address'],
      additionalProperties: false,
    },
    receipt: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Дата чека у форматі YYYY-MM-DD. "" якщо не видно. Це дата покупки, а не сьогоднішня.',
        },
        time: { type: 'string', description: 'HH:MM або "".' },
        fiscal_number: { type: 'string', description: 'ФН касового апарата або "".' },
        total: { type: 'number', description: 'Підсумок «Сума» / «До сплати». 0 якщо не видно.' },
        vat_amount: { type: 'number', description: 'Сума ПДВ. 0 якщо не видно.' },
        vat_rate: { type: 'number', description: 'Ставка ПДВ у відсотках, зазвичай 20. 0 якщо не видно.' },
      },
      required: ['date', 'time', 'fiscal_number', 'total', 'vat_amount', 'vat_rate'],
      additionalProperties: false,
    },
    lines: {
      type: 'array',
      description: 'Тільки товарні позиції. Не включай рядки «Сума», «Готівка», «Решта», «ПДВ», «Знижка».',
      items: {
        type: 'object',
        properties: {
          raw_text: {
            type: 'string',
            description:
              'Назва позиції ТОЧНО як надруковано, зі скороченнями та грамажем. ' +
              'Не виправляй, не розшифровуй, не перекладай.',
          },
          quantity: { type: 'number', description: 'Кількість. 1 якщо не вказано.' },
          unit: { type: 'string', description: 'шт, кг, л тощо.' },
          unit_price: { type: 'number', description: 'Ціна за одиницю. 0 якщо не вказано.' },
          line_total: { type: 'number', description: 'Сума по рядку — саме те число, що надруковано праворуч.' },
          barcode: { type: 'string', description: 'Штрихкод, якщо надрукований поруч. Інакше "".' },
          tax_letter: { type: 'string', description: 'Літера ставки ПДВ (A, Б, В...) або "".' },
          model_category: {
            type: 'string',
            description:
              'Твоя оцінка категорії. Використовується ТІЛЬКИ якщо словник не знає першого слова. ' +
              'Одне з: meat_raw, meat_processed, meat_snack, poultry, fish_raw, fish_smoked, ' +
              'dairy_milk, dairy_yogurt, dairy_cheese_hard, dairy_cheese_soft, dairy_sourcream, ' +
              'dairy_butter, eggs, veg_leafy, veg_root, veg_other, fruit, berries, bread, sweets, ' +
              'snacks, frozen, drinks_water, drinks_juice, drinks_soda, grocery_dry, oil, sauces, ' +
              'canned, spices, nonfood, unknown.',
          },
          model_is_food: {
            type: 'boolean',
            description: 'true — їстівне. false — побутова хімія, канцтовари, пакет, корм для тварин.',
          },
        },
        required: [
          'raw_text', 'quantity', 'unit', 'unit_price', 'line_total',
          'barcode', 'tax_letter', 'model_category', 'model_is_food',
        ],
        additionalProperties: false,
      },
    },
    image_quality: {
      type: 'object',
      properties: {
        top_cut_off: {
          type: 'boolean',
          description: 'true, якщо стрічка обрізана зверху — перший видимий рядок починається посеред позиції.',
        },
        bottom_cut_off: {
          type: 'boolean',
          description: 'true, якщо не видно підсумку та фіскальних реквізитів.',
        },
        blurry: { type: 'boolean', description: 'true, якщо частину тексту довелося вгадувати.' },
      },
      required: ['top_cut_off', 'bottom_cut_off', 'blurry'],
      additionalProperties: false,
    },
  },
  required: ['store', 'receipt', 'lines', 'image_quality'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Ти читаєш фото українського касового чека.

Твоє завдання — прочитати, а не інтерпретувати. Назви позицій переписуй
точно так, як надруковано: зі скороченнями, грамажем і маркерами мережі.
«Батончик 90 г Nestle Lion King м/у п» лишається саме таким рядком —
розшифровкою займається окремий словник.

Що важливо:
- Штрихкод часто друкується ОКРЕМИМ рядком НАД назвою позиції. Прив'яжи
  його до тієї позиції, до якої він належить.
- Кількість теж буває окремим рядком перед назвою («2. X 24,90 =»).
- line_total — це число праворуч від позиції, а не ціна за одиницю.
- Службові рядки (Сума, Готівка, Решта, ПДВ, Знижка, реквізити) у lines
  не потрапляють.
- Якщо стрічка обрізана і перша видима позиція починається посеред рядка —
  постав top_cut_off. Це критично: краще чесно сказати, що чек неповний,
  ніж мовчки віддати три позиції з дванадцяти.
- Дата — та, що на чеку. Не сьогоднішня.

Якщо чогось не видно — став "" або 0. Не вигадуй.`;

export { RECEIPT_SCHEMA, SYSTEM_PROMPT };
