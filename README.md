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
