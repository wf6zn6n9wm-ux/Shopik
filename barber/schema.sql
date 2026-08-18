-- ============================================================================
--  ПРО БАРБЕР — схема базы данных (Supabase / PostgreSQL)
-- ============================================================================
--  Применить один раз: Supabase → SQL Editor → вставить этот файл → Run.
--
--  Что здесь лежит и чего здесь НЕТ.
--
--  Сервер нужен ровно для одного: чтобы клиент мог записаться со своего
--  телефона, а барбер увидел заявку в кабинете. Поэтому на сервере живёт
--  только витрина (услуги, график) и заявки. Клиентская база, история
--  визитов, заметки и деньги остаются в кабинете барбера и никуда не
--  уезжают.
--
--  Публичная страница отдаёт занятое время БЕЗ имён: посторонний видит
--  «занято с 11:30 на час», но не кто именно придёт.
--
--  Доступ к БД — только из serverless-функций сервисным ключом. Клиент в
--  базу не ходит, поэтому RLS оставляем закрытым (нет политик = с anon-
--  ключом недоступно; service_role обходит RLS).
-- ============================================================================

-- ---------- барбер (витрина) -------------------------------------------------
create table if not exists barber_shops (
  slug        text primary key,                    -- адрес страницы записи: /barber/book?b=slug
  token       text not null,                       -- секрет кабинета (в браузер клиента не попадает)
  shop        text not null default 'Про Барбер',
  name        text not null default '',            -- имя барбера
  role        text not null default 'Барбер',
  about       text not null default '',
  address     text not null default '',
  phone       text not null default '',
  photo       text not null default '',
  currency    text not null default 'USD',
  lang        text not null default 'ru',
  step        int  not null default 30,            -- шаг сетки записи, минуты
  hours       jsonb not null default '{}'::jsonb,  -- {mon:{on,from,to}, …}
  services    jsonb not null default '[]'::jsonb,  -- [{id,name,price,dur}] — только видимые
  tg_chat_id  bigint,                              -- куда слать уведомления (привязка через бота)
  tg_link_code text,                               -- одноразовый код привязки чата
  plan_sent_for date,                              -- за какой день уже отправлен вечерний план
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- занятое время ----------------------------------------------------
--  Кабинет публикует только интервалы, без имён и услуг. Живёт коротко:
--  прошлое чистится при каждой публикации.
create table if not exists barber_busy (
  slug  text not null references barber_shops(slug) on delete cascade,
  date  date not null,
  "time" text not null,                            -- 'HH:MM'
  dur   int  not null,
  primary key (slug, date, "time")
);
create index if not exists barber_busy_day on barber_busy (slug, date);

-- ---------- заявки с публичной страницы --------------------------------------
--  Заявка — это ещё не запись. Барбер подтверждает её в кабинете, и только
--  тогда она становится записью в его календаре.
create table if not exists barber_requests (
  id          text primary key,                    -- 'rq_…', генерит сервер
  slug        text not null references barber_shops(slug) on delete cascade,
  name        text not null,
  phone       text not null,
  phone_key   text not null,                       -- только цифры, для антиспама
  service_id  text not null,
  service     text not null,                       -- название на момент заявки
  price       numeric(10,2) not null default 0,
  dur         int not null default 30,
  date        date not null,
  "time"      text not null,
  note        text not null default '',
  status      text not null default 'new',         -- new | accepted | declined
  created_at  timestamptz not null default now(),
  pulled_at   timestamptz                          -- когда кабинет забрал заявку
);
create index if not exists barber_requests_open on barber_requests (slug, status, created_at);
create index if not exists barber_requests_spam on barber_requests (slug, phone_key, created_at);
