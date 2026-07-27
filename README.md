# Shopik

Прототип платформи Shopik — магазин з Instagram/Telegram за 5 хвилин.

Зібрано на Vite + React + Tailwind (CDN).

## Адмін-панель платформи
Окрема сторінка `admin.html` — панель адміністрації всієї платформи (не панель
продавця): дашборд, фінанси, підписки, реклама, магазини, юзери, модерація,
зарплати команди, задачі, підтримка, розсилки, аудит і налаштування. Ролі
`owner → admin → manager` обмежують доступні вкладки й дії.

Відкривається за прямим посиланням `/admin.html`. Сторінка самодостатня
(React + Tailwind через CDN, іконки вбудовані інлайн-SVG). Перемикач ролей у
шапці показує, як змінюється доступ для різних ролей.

### Реальні дані (необов'язково)
За замовчуванням панель показує демонстраційні дані. Щоб підтягнути **справжні**
магазини, продавців і показники дашборда з Supabase — налаштуй serverless-функцію
`api/admin.js`. Вона читає всі магазини service-role ключем на сервері (у браузер
ключ не потрапляє) і пускає лише адміністраторів.

У **Vercel → Settings → Environment Variables** додай:

- `SUPABASE_SERVICE_ROLE_KEY` — service_role ключ із **Supabase → Settings → API**
  (тримати в секреті, це повний доступ до бази).
- `ADMIN_EMAILS` — пошти адмінів через кому, напр. `me@shop.com,partner@shop.com`.
  Лише ці акаунти зможуть увійти в адмінку.
- `SUPABASE_URL` — *(необов'язково)* URL проєкту; за замовчуванням береться з коду.

Після Redeploy: відкрий `/admin.html`, увійди своєю поштою (той самий акаунт
Supabase, що й у продавця) — і розділи **Магазини**, **Продавці** та лічильники
**Дашборда** заповняться реальними даними. Решта розділів (фінанси, підписки,
реклама, зарплати, підтримка, модерація, аудит, розсилки) лишаються
демонстраційними — таких даних у базі поки немає.

Якщо змінні не задані або функція недоступна — панель м'яко відкочується в
демо-режим (позначено плашкою внизу), сторінка не ламається. Дії в панелі
(бан/схвалення тощо) поки що не зберігаються в базу — це наступний крок.

## Запуск локально
```
npm install
npm run dev
```

## Деплой
Підключи репозиторій до Vercel — збирання автоматичне (`npm run build`).

## База даних (необов'язково)
За замовчуванням усі дані (магазини, товари, замовлення, кошик, налаштування)
зберігаються локально в браузері через `localStorage`. Щоб увімкнути хмарну
синхронізацію між пристроями, підключи безкоштовний Supabase:

1. Створи проєкт на https://supabase.com
2. У **SQL Editor** виконай:
   ```sql
   create table shops (
     id bigint primary key,
     owner uuid references auth.users default auth.uid(),
     data jsonb
   );
   alter table shops enable row level security;
   create policy "own shops" on shops for all
     using (auth.uid() = owner) with check (auth.uid() = owner);
   ```
3. У **Settings → API** скопіюй *Project URL* та *anon (public) key*
4. Встав їх у `index.html` у константи `SUPABASE_URL` та `SUPABASE_ANON_KEY`

Якщо ключі не вказані — застосунок працює локально (без входу), як раніше.

## AI-розпізнавання фото товарів (необов'язково)
На лендингу («Створити магазин із фото») та в панелі («Фото → товари з AI»)
продавець завантажує фото товарів, а Claude (vision) сам пише назву, ціну й опис
до кожного. Це працює через serverless-функцію `api/ai-products.js`.

Щоб увімкнути: у **Vercel → Settings → Environment Variables** додай змінну
`ANTHROPIC_API_KEY` (ключ з https://console.anthropic.com) і зроби Redeploy.

Якщо ключ не заданий — фото все одно завантажаться, але картки заповняться
запасними значеннями (назва/ціна-заглушка), які легко відредагувати вручну.

## Вхід продавців (email + пароль)
Коли Supabase підключено, з'являється екран входу/реєстрації. Кожен продавець
бачить і редагує **лише свої** магазини (захищено RLS-політикою вище).

- Реєстрація / вхід — вбудований Supabase Auth (пошта + пароль).
- Щоб під час тестування не підтверджувати пошту щоразу, у Supabase:
  **Authentication → Providers → Email** вимкни *Confirm email*.
- Для входу через Google додай провайдера в тому ж розділі (окремий крок).

---

# Доля — учёт совместной прибыли магазина (папка `profit/`)

**Самостоятельное приложение** (Telegram Mini App / PWA) для двоих: **владельца**
и **управляющей** магазина. Ведёт **склад кроссовок** (модели, размеры, остатки)
и совместную прибыль с продажи каждой пары в заданной пропорции.

Живёт в папке `profit/` (один самодостаточный `index.html` — чистый JS + CSS,
без зависимостей). Разворачивается **отдельным Vercel-проектом**
(Root Directory: `profit`), Shopik и PARA не затрагиваются. Без ключей — демо-режим
(данные в `localStorage`); с ключами — общий склад, синхронный у обоих (см. ниже).

## Как это работает (модель «Склад»)

- **Владелец** заводит **модель** (📷 фото + название) и добавляет **пары по
  размерам**: у каждого лота своя **закупка за пару**, позже добавляется
  **доставка за пару**. Себестоимость пары = закупка + доставка. **Товар оплачивает
  владелец.** Видно наличие: напр. 44 → 2 шт, 45 → 1 шт.
- **Управляющая** продаёт: выбирает из списка **модель + размер**, вносит **цену
  продажи** и **зарплату** → приложение считает прибыль, **остаток −1**.
- Расчёт: **чистая прибыль = продажа − себестоимость − зарплата**, делится
  **30 % управляющей / 70 % владельцу** (процент настраивается ползунком 0–100 %).
  Владельцу возвращается вложенная себестоимость + его доля; управляющей — зарплата
  + её доля. (Проверка: суммы всегда складываются в цену продажи.)

## Что видит каждый

- **Управляющая** — заработано (ЗП + доля), зарплата всего, пар на складе и главное
  — **«можно забрать сейчас»** (ЗП + доля по непосчитанным продажам).
- **Владелец** — **вложено в склад**, оборот, чистая прибыль, его доля и
  **«к получению от управляющей»** (возврат себестоимости + доля).

Кнопка **«Рассчитаться»** на продаже фиксирует, что деньги распределены.

## Настройки

Процент доли (ползунок + пресеты 20/30/40/50 %), валюта; в демо-режиме — имена сторон.
Пример расчёта (закупка 2000 + доставка 200 → продажа 4000, ЗП 200) показан в приложении.

## Общая синхронизация двоих (backend)

По умолчанию (без ключей) приложение работает в **демо-режиме**: данные хранятся
на этом устройстве, роль переключается вручную. Чтобы владелец и управляющая
вели **общий учёт** и видели синхронные данные каждый со своего телефона,
подключается serverless-функция `profit/api/profit.js` + **отдельный** проект
Supabase и Telegram-бот. Вход — по подписи Telegram `initData` (HMAC токеном
бота, подделать чужой аккаунт нельзя); доступ к базе — только с сервера
service-role ключом (в браузер не попадает).

Кто входит через ссылку-приглашение первым и создаёт магазин — становится
**владельцем**; кто входит по коду — **управляющей**. Права: владелец ведёт склад
(модели, размеры, закупка/доставка) и задаёт процент; продажу пары может провести
любой участник. Ключевые события шлют пуш второму участнику (присоединение,
поступление на склад, продажа с суммами долей, «рассчитано»).

### 1. Создай отдельный проект Supabase и выполни SQL

```sql
create extension if not exists pgcrypto;

create table profit_shops (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  owner_tg   bigint,
  share_pct  int  default 30,      -- доля управляющей от прибыли, %
  salary_pct int  default 0,       -- зарплата управляющей, % от цены продажи (авто)
  currency   text default 'грн',
  created_at timestamptz default now()
);

create table profit_members (
  shop_id  uuid references profit_shops(id) on delete cascade,
  tg_id    bigint not null,
  name     text,
  photo_url text,
  role     text check (role in ('owner','manager')),
  joined_at timestamptz default now(),
  primary key (shop_id, tg_id)
);
-- один пользователь = один магазин (MVP)
create unique index profit_members_tg on profit_members(tg_id);

-- Папка склада (категория): группирует модели
create table profit_folders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references profit_shops(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);

-- Модель (позиция склада): фото + название + папка (необязательно)
create table profit_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references profit_shops(id) on delete cascade,
  folder_id uuid references profit_folders(id) on delete set null,
  name text,
  photo text,                      -- сжатое фото (data URL)
  created_at timestamptz default now()
);

-- Лот: размер, количество пар, закупка и доставка ЗА ПАРУ
create table profit_stock (
  id uuid primary key default gen_random_uuid(),
  shop_id    uuid references profit_shops(id) on delete cascade,
  product_id uuid references profit_products(id) on delete cascade,
  size     text,
  qty      int    default 1,
  purchase bigint default 0,       -- закупка за пару
  shipping bigint,                 -- доставка за пару (null = ещё не внесена)
  created_at timestamptz default now()
);

-- Продажа одной пары (со снимком себестоимости на момент продажи)
create table profit_sales (
  id uuid primary key default gen_random_uuid(),
  shop_id    uuid references profit_shops(id) on delete cascade,
  product_id uuid references profit_products(id) on delete set null,
  name text,                       -- снимок названия
  size text,
  sale   bigint default 0,
  salary bigint default 0,
  cost   bigint default 0,         -- себестоимость пары (закупка+доставка)
  settled boolean default false,
  sold_at    timestamptz default now(),
  settled_at timestamptz
);

-- RLS можно включить: доступ к таблицам идёт только из profit/api/profit.js
-- service-role ключом (в браузер не попадает).
alter table profit_shops    enable row level security;
alter table profit_members  enable row level security;
alter table profit_folders  enable row level security;
alter table profit_products enable row level security;
alter table profit_stock    enable row level security;
alter table profit_sales    enable row level security;
```

Миграция для папок (если склад создан до их появления):
```sql
create table if not exists profit_folders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references profit_shops(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);
alter table profit_products add column if not exists folder_id uuid references profit_folders(id) on delete set null;
alter table profit_folders enable row level security;
```
(Бэкенд читает `folder_id`/папки мягко — без миграции работает, просто папки недоступны.)

> Если у тебя уже создан магазин по старой схеме (таблица `profit_deals`),
> выполни в SQL Editor только блок с тремя новыми таблицами
> `profit_products` / `profit_stock` / `profit_sales` (и их `alter table … enable
> row level security`). Старую `profit_deals` можно удалить: `drop table profit_deals;`.
>
> Миграция для авто-зарплаты (если магазин создан до её появления):
> `alter table profit_shops add column if not exists salary_pct int default 0;`
> (Бэкенд читает столбец мягко — без него работает, просто % зарплаты недоступен.)

### 2. Заведи Telegram-бота

1. У **@BotFather**: `/newbot` → получи **токен бота**.
2. `/newapp` (или `/setmenubutton`) → привяжи **Mini App** к домену «Доли».
3. Ссылка-приглашение вида `https://t.me/<bot>?startapp=<КОД>` открывает
   приложение сразу со входом в магазин по коду (управляющая входит одним
   касанием, код вводить не нужно).

### 3. Задай переменные окружения (Vercel → Settings → Environment Variables)

- `PROFIT_SUPABASE_URL` — URL проекта Supabase для «Доли».
- `PROFIT_SUPABASE_SERVICE_ROLE_KEY` — service_role ключ этого проекта (секрет!).
- `PROFIT_BOT_TOKEN` — токен Telegram-бота от @BotFather.
- `PROFIT_BOT_USERNAME` — *(необяз.)* юзернейм бота для ссылок-приглашений.
- `PROFIT_APP_URL` — *(необяз.)* URL мини-аппа для кнопок «Открыть».

*(Если отдельные `PROFIT_*` не заданы, функция читает и `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / `BOT_TOKEN`. Для чистоты рекомендуются отдельные.)*

Пока ключи не заданы, `api/profit.js` возвращает `not_configured`, а `index.html`
мягко откатывается в демо-режим — страница не ломается.

### Что покрыто тестами

`api/profit.js` проверен: подпись `initData` (валидная принимается,
поддельная/с чужим токеном — отклоняются) и раздел прибыли (себест. 2200 = закупка
2000 + доставка 200, продажа 4000, ЗП 200: чистая 1600, управляющей 480, владельцу
1120; управляющей к получению 680, владельцу 3320; сумма = цена продажи). Фронтенд
проверен end-to-end в обоих режимах: демо (localStorage) и онлайн (онбординг →
создание магазина → приглашение по коду → модель → размеры/остатки → доставка →
продажа выбором из списка → уменьшение остатка → расчёт).

---

# PARA — приложение для пары (папка `para/`)

**Самостоятельный продукт**, отдельный от Shopik: Telegram Mini App / PWA для
двоих. Живёт в папке `para/` (`para/index.html` + `para/api/para.js`) и
разворачивается **отдельным Vercel-проектом со своим доменом** — Shopik не
затрагивается. Экраны: **Сегодня** (вопрос дня, отсчёт до дат), **Желания**,
**Квесты**, **Даты**, **Мы**. `index.html` самодостаточный (чистый JS + CSS,
без внешних зависимостей); вне Telegram работает в локальном демо-режиме.

## Деплой отдельным проектом Vercel

1. Vercel → **Add New… → Project** → импортируй этот же репозиторий.
2. В настройках проекта задай **Root Directory: `para`** — Vercel соберёт
   только папку PARA: `index.html` отдастся по корню домена, `api/para.js`
   станет функцией `/api/para`.
3. Подключи свой домен (напр. `para.app`) в **Settings → Domains**.

Так у PARA свой домен, свои переменные окружения и своя база — с Shopik
ничего не пересекается.

## Настоящая связь пары (backend)

Реализована сквозная фича **пейринг + «Вопрос дня»** через serverless-функцию
`para/api/para.js` и **отдельный** проект Supabase. Внутри Telegram
пользователь подтверждается подписью
`initData` (HMAC токеном бота — подделать чужой аккаунт нельзя), пара
связывается по коду-приглашению, а ответ партнёра на вопрос дня открывается
только после твоего (async-разблокировка). Партнёру уходит пуш от бота.

### 1. Создай отдельный проект Supabase и выполни SQL

```sql
create extension if not exists pgcrypto;

create table para_couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_at timestamptz default now()
);

create table para_members (
  couple_id uuid references para_couples(id) on delete cascade,
  tg_id     bigint not null,
  name      text,
  photo_url text,
  slot      text check (slot in ('a','b')),
  joined_at timestamptz default now(),
  primary key (couple_id, tg_id)
);
-- один пользователь = одна пара (MVP)
create unique index para_members_tg on para_members(tg_id);

create table para_answers (
  couple_id  uuid references para_couples(id) on delete cascade,
  day        date not null,
  tg_id      bigint not null,
  answer     text not null,
  created_at timestamptz default now(),
  primary key (couple_id, day, tg_id)
);

-- RLS можно включить: доступ к таблицам идёт только из api/para.js
-- service-role ключом (в браузер не попадает).
alter table para_couples enable row level security;
alter table para_members enable row level security;
alter table para_answers enable row level security;
```

### 2. Заведи Telegram-бота

1. У **@BotFather**: `/newbot` → получи **токен бота**.
2. `/newapp` (или `/setmenubutton`) → привяжи **Mini App** к домену PARA
   (корень, напр. `https://para.app/`).
3. Ссылка-приглашение вида `https://t.me/<bot>?startapp=<КОД>` открывает
   Mini App сразу на шаге присоединения по коду.

### 3. Задай переменные окружения (Vercel → Settings → Environment Variables)

- `PARA_SUPABASE_URL` — URL проекта Supabase для PARA.
- `PARA_SUPABASE_SERVICE_ROLE_KEY` — service_role ключ этого проекта (секрет!).
- `PARA_BOT_TOKEN` — токен бота PARA от @BotFather.

*(Если отдельные `PARA_*` не заданы, функция читает и `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / `BOT_TOKEN`. Для чистоты рекомендуются отдельные.)*

Пока ключи не заданы, `api/para.js` возвращает `not_configured`, а `para.html`
мягко откатывается в демо-режим — страница не ломается.

### Что уже покрыто тестами

`api/para.js` проверен: подпись `initData` (валидная принимается,
поддельная/протухшая/с чужим токеном — отклоняются) и полный онлайн-флоу
(создание пары → присоединение → ответы обоих) с корректной
async-разблокировкой и пушами партнёру.

### Дальше по плану (MVP)

Настроение/чек-ин · общий стрик (со «заморозкой») · авто-воспоминания из
ответов · умные напоминания о датах · движок квестов. Подключаются к уже
готовому фундаменту пары.
