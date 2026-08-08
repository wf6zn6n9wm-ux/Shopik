-- StarsHash: база. Выполнить один раз в Supabase → SQL Editor.
--
-- Повторный запуск безопасен: всё через if not exists.
--
-- Главное правило: деньги живут здесь, а не в телефоне. Клиент рисует то,
-- что отдал сервер, и не может изменить ни баланс, ни исход раунда.

-- ── Игроки ───────────────────────────────────────────────────────────
-- Заводятся сами при первом открытии: Telegram присылает подписанные
-- данные, регистрировать вручную нечего.
create table if not exists sh_users (
  tg_id       bigint primary key,
  name        text,
  photo_url   text,
  lang        text default 'ru',

  bal         numeric(20,6) not null default 0,   -- звёзды на счету
  inv         numeric(20,6) not null default 0,   -- вложено в мощность
  mined       numeric(20,6) not null default 0,   -- намайнено за всё время

  ref_by      bigint,                             -- кто пригласил
  ref_earned  numeric(20,6) not null default 0,   -- заработано на рефералах

  streak      int not null default 0,             -- день ежедневного бонуса
  bonus_day   date,                               -- когда бонус взят последний раз

  plays       int not null default 0,
  wins        int not null default 0,
  wagered     numeric(20,6) not null default 0,
  won         numeric(20,6) not null default 0,
  best_win    numeric(20,6) not null default 0,
  best_x      numeric(10,2) not null default 0,

  tasks       jsonb not null default '{}'::jsonb, -- разовые задания
  daily       jsonb not null default '{}'::jsonb, -- задания дня + дата

  banned      boolean not null default false,     -- закрыт доступ
  note        text,                               -- пометка админа

  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now(), -- от неё считается майнинг
  accrued_at  timestamptz not null default now()
);

create index if not exists sh_users_ref_by  on sh_users(ref_by);
create index if not exists sh_users_seen    on sh_users(seen_at desc);
create index if not exists sh_users_created on sh_users(created_at desc);

-- ── Журнал движений ──────────────────────────────────────────────────
-- Пишем каждое изменение баланса. Без журнала нельзя ни разобрать спор с
-- игроком, ни заметить, что деньги утекают не туда.
--
-- kind: mine | bonus | task | ref | invest | uninvest | bet | win |
--       topup | withdraw | admin
create table if not exists sh_tx (
  id         bigserial primary key,
  tg_id      bigint not null references sh_users(tg_id) on delete cascade,
  kind       text not null,
  amount     numeric(20,6) not null,              -- со знаком: минус — списание
  bal_after  numeric(20,6) not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sh_tx_user on sh_tx(tg_id, created_at desc);
create index if not exists sh_tx_kind on sh_tx(kind, created_at desc);

-- ── Открытый раунд Краша ─────────────────────────────────────────────
-- Точку обрыва выбирает сервер и держит при себе: если её отдать
-- телефону, игрок будет забирать за миг до обрыва каждый раз.
--
-- Один открытый раунд на игрока — больше и не нужно, а ключ по игроку
-- сам не даёт поставить дважды на один раунд.
create table if not exists sh_rounds (
  tg_id      bigint primary key references sh_users(tg_id) on delete cascade,
  bet        numeric(20,6) not null,
  target     numeric(10,2) not null,             -- секрет до расчёта
  auto       numeric(10,2),                      -- авто-вывод, если включён
  started_at timestamptz not null default now()
);

-- ── Приглашения ──────────────────────────────────────────────────────
-- Связь односторонняя и на всю жизнь: перепривязать себя к другому
-- пригласившему нельзя, поэтому ключ — приглашённый.
create table if not exists sh_refs (
  invitee    bigint primary key references sh_users(tg_id) on delete cascade,
  inviter    bigint not null references sh_users(tg_id) on delete cascade,
  earned     numeric(20,6) not null default 0,
  created_at timestamptz not null default now(),
  check (invitee <> inviter)
);

create index if not exists sh_refs_inviter on sh_refs(inviter);

-- ── Заявки на вывод ──────────────────────────────────────────────────
-- Вывод не мгновенный: игрок оставляет заявку, деньги тут же снимаются с
-- баланса и висят в удержании, а человек-админ рассматривает её в
-- профиле. Отказ возвращает сумму на баланс — списывать за отклонённую
-- заявку нельзя.
--
-- amount — что списано с баланса (комиссия уже внутри); net — что уйдёт
-- получателю в звёздах; fee — удержанная доля. Способ (stars | gram)
-- определяет, куда именно платить, но арифметика везде одна.
--
-- status: pending — ждёт; done — выплачено; rejected — отклонено (сумма
-- возвращена).
create table if not exists sh_withdrawals (
  id          bigserial primary key,
  tg_id       bigint not null references sh_users(tg_id) on delete cascade,
  method      text not null,                        -- stars | gram
  amount      numeric(20,6) not null,               -- списано с баланса
  fee         numeric(20,6) not null,               -- удержанная комиссия
  net         numeric(20,6) not null,               -- к выдаче, в звёздах
  dest        text not null,                        -- @username или GRAM-кошелёк
  status      text not null default 'pending',      -- pending | done | rejected
  note        text,                                 -- пометка админа при решении
  decided_by  bigint,                               -- админ, закрывший заявку
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Таблица с таким именем могла остаться от прежней задумки вывода — с
-- другим набором столбцов. Тогда `create table if not exists` её молча
-- пропустит, и следующий же указатель упадёт на столбце, которого нет.
-- Поэтому недостающее дописываем: так повторный запуск доводит базу до
-- нужного вида, а не падает. Данные при этом целы — столбцы только
-- добавляются.
alter table sh_withdrawals add column if not exists method     text;
alter table sh_withdrawals add column if not exists amount     numeric(20,6);
alter table sh_withdrawals add column if not exists fee        numeric(20,6);
alter table sh_withdrawals add column if not exists net        numeric(20,6);
alter table sh_withdrawals add column if not exists dest       text;
alter table sh_withdrawals add column if not exists status     text not null default 'pending';
alter table sh_withdrawals add column if not exists note       text;
alter table sh_withdrawals add column if not exists decided_by bigint;
alter table sh_withdrawals add column if not exists decided_at timestamptz;
alter table sh_withdrawals add column if not exists created_at timestamptz not null default now();

create index if not exists sh_wd_user   on sh_withdrawals(tg_id, created_at desc);
create index if not exists sh_wd_status  on sh_withdrawals(status, created_at desc);

-- ── Таблица лидеров ──────────────────────────────────────────────────
-- Считаем по журналу: намайнено за день, за неделю, за всё время.
-- Представлением, а не отдельной таблицей — иначе её пришлось бы
-- поддерживать в согласии с журналом, и рано или поздно они разъедутся.
create or replace view sh_top_all as
  select u.tg_id, u.name, u.photo_url, u.mined as v
    from sh_users u
   where not u.banned and u.mined > 0
   order by u.mined desc;

create or replace view sh_top_day as
  select t.tg_id, u.name, u.photo_url, sum(t.amount) as v
    from sh_tx t join sh_users u on u.tg_id = t.tg_id
   where t.kind = 'mine' and t.created_at >= date_trunc('day', now()) and not u.banned
   group by t.tg_id, u.name, u.photo_url
  having sum(t.amount) > 0
   order by 4 desc;

create or replace view sh_top_week as
  select t.tg_id, u.name, u.photo_url, sum(t.amount) as v
    from sh_tx t join sh_users u on u.tg_id = t.tg_id
   where t.kind = 'mine' and t.created_at >= date_trunc('week', now()) and not u.banned
   group by t.tg_id, u.name, u.photo_url
  having sum(t.amount) > 0
   order by 4 desc;

-- ── Доступ ───────────────────────────────────────────────────────────
-- Ходить в базу разрешено только серверной функции: она держит
-- service-role ключ, который в браузер не попадает. На всякий случай
-- закрываем таблицы и от анонимного ключа тоже — если он утечёт,
-- прочитать чужие балансы всё равно не выйдет.
alter table sh_users enable row level security;
alter table sh_tx    enable row level security;
alter table sh_refs  enable row level security;
alter table sh_rounds enable row level security;
alter table sh_withdrawals enable row level security;

-- Разрешающих правил не создаём ни одного: при включённом RLS это значит
-- «нельзя никому». Ключ service_role защиту обходит — им и ходит сервер.

-- Права выдаём явно, а не полагаемся на переключатель «Automatically
-- expose new tables» при создании проекта: он может стоять и так и эдак,
-- а база должна работать одинаково.
grant usage on schema public to service_role;
grant select, insert, update, delete on sh_users, sh_tx, sh_refs, sh_rounds, sh_withdrawals to service_role;
grant select on sh_top_all, sh_top_day, sh_top_week to service_role;
grant usage, select on sequence sh_tx_id_seq to service_role;
grant usage, select on sequence sh_withdrawals_id_seq to service_role;

-- А у публичных ролей забираем всё: пусть утёкший анонимный ключ упрётся
-- в отсутствие прав, а не только в RLS.
revoke all on sh_users, sh_tx, sh_refs, sh_rounds, sh_withdrawals from anon, authenticated;
revoke all on sh_top_all, sh_top_day, sh_top_week from anon, authenticated;
