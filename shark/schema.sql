-- ============================================================================
--  SHARK — схема базы данных (Supabase / PostgreSQL)
-- ============================================================================
--  Применить один раз: Supabase → SQL Editor → вставить этот файл → Run.
--
--  Принципы:
--   • Одна игровая валюта: stars (⭐). Ей играют, её покупают наборами.
--     Дробных звёзд не бывает — все суммы целые.
--   • Валюта uah остаётся в проверке леджера только ради истории первой
--     версии: старые строки переписывать нельзя. Новых начислений в ней не
--     бывает — shark_apply_ledger() принимает только stars.
--   • Обратного обмена звёзд на деньги в схеме нет и быть не может: заявка
--     на получение выигрыша (shark_claims) только резервирует звёзды, а что
--     именно выдано — решает человек за пределами приложения.
--   • Баланс = кэш в shark_users.stars_balance, а СМЫСЛ хранится
--     в леджере shark_ledger. Любое движение средств идёт через функцию
--     shark_apply_ledger(), которая атомарно пишет строку леджера и обновляет
--     кэш баланса. Идемпотентность — по уникальному ключу idem (двойное
--     начисление невозможно даже при ретраях).
--   • Доступ к БД — только из serverless-функций сервисным ключом. Клиент в БД
--     не ходит, поэтому RLS оставляем закрытым (по умолчанию нет политик =
--     ничего не доступно с anon-ключом; service_role обходит RLS).
-- ============================================================================

-- ---------- пользователи -----------------------------------------------------
create table if not exists shark_users (
  tg_id          bigint primary key,
  username       text,
  first_name     text,
  lang           text    not null default 'ru',
  stars_balance  bigint  not null default 0,          -- ⭐ игровой баланс
  won_stars      bigint  not null default 0,          -- суммарно выиграно ⭐ (профиль, лидеры)
  ref_code       text    unique,                       -- код этого юзера для приглашений
  ref_by         bigint  references shark_users(tg_id),-- кто пригласил
  banned         boolean not null default false,
  played         integer not null default 0,           -- сыграно раундов (для профиля/уровня)
  created_at     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);
-- для БД, созданных раньше
alter table shark_users add column if not exists stars_balance bigint not null default 0;
alter table shark_users add column if not exists won_stars     bigint not null default 0;

-- ---------- леджер (источник истины по движению средств) ---------------------
create table if not exists shark_ledger (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null references shark_users(tg_id),
  currency   text   not null check (currency in ('stars','uah')),
  amount     numeric(20,9) not null,                   -- + начисление, − списание
  kind       text   not null,                          -- referral|bet|win|claim_hold|claim_return|task|gift|topup|adjust
  ref        text,                                     -- ссылка на сущность (id вывода/раунда)
  idem       text   unique,                            -- ключ идемпотентности (может быть null для «всегда уникальных»)
  meta       jsonb  not null default '{}',
  balance_after numeric(20,9),                         -- баланс соответствующей валюты после операции
  created_at timestamptz not null default now()
);
create index if not exists shark_ledger_tg_idx on shark_ledger(tg_id, created_at desc);
-- Для БД, созданных раньше. Дробная точность колонки — наследство первой
-- версии (гривны с копейками); звёзды целые, но СУЖАТЬ тип не станем: это
-- молча округлило бы старые строки, а история должна остаться как есть.
alter table shark_ledger alter column amount        type numeric(20,9);
alter table shark_ledger alter column balance_after type numeric(20,9);
-- 'uah' в проверке остаётся историей, 'stars' — единственное, что двигается.
-- Если в базе всё же есть строки других валют, ALTER упадёт с ошибкой — это
-- лучше, чем принять их молча.
alter table shark_ledger drop constraint if exists shark_ledger_currency_check;
alter table shark_ledger add  constraint shark_ledger_currency_check
  check (currency in ('stars','uah'));

-- ---------- заявки на получение выигрыша -------------------------------------
--  Что именно выдано по заявке, приложение не знает и не решает: оно только
--  фиксирует обращение и показывает статус. Выдачу делает человек в боте.
--
--  Звёзды при создании заявки РЕЗЕРВИРУЮТСЯ (списываются с баланса строкой
--  claim_hold), а не «обмениваются»: иначе один и тот же выигрыш можно было бы
--  предъявить дважды, пока заявка на рассмотрении. Отказ возвращает резерв
--  строкой claim_return.
create table if not exists shark_claims (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  stars       bigint not null,                         -- сколько ⭐ зарезервировано
  note        text,                                    -- комментарий игрока
  status      text   not null default 'new'            -- new | in_review | done | rejected
              check (status in ('new','in_review','done','rejected')),
  admin_msg_id bigint,                                 -- карточка у админа
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint
);
create index if not exists shark_claims_tg_idx on shark_claims(tg_id, created_at desc);
create index if not exists shark_claims_status_idx on shark_claims(status, created_at desc);
-- Одна открытая заявка на игрока: две параллельные путают и игрока, и того,
-- кто их разбирает. Частичный уникальный индекс — самая надёжная защита.
create unique index if not exists shark_claims_one_open_idx
  on shark_claims(tg_id) where status in ('new','in_review');

-- ---------- забранные награды за задания --------------------------------------
--  Уникальный idem — это и есть защита от двойного начисления: дневное задание
--  получает ключ с датой, разовое — без неё, поэтому «забрать дважды» ломается
--  на индексе, а не на проверке в коде.
create table if not exists shark_task_claims (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null references shark_users(tg_id),
  task_key   text   not null,
  idem       text   not null unique,
  reward     bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shark_task_claims_tg_idx on shark_task_claims(tg_id, created_at desc);

-- ---------- заказы на наборы звёзд -------------------------------------------
--  Нужны только для оплаты через Telegram Stars: зачисление приходит вебхуком,
--  и по charge_id надо понять, за какой набор заплатили. Оплата через
--  @CryptoBot заказа не требует — там всё есть в payload инвойса.
create table if not exists shark_topups (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null references shark_users(tg_id),
  pack_key   text   not null,
  stars      bigint not null,                          -- сколько зачислим
  method     text   not null default 'xtr',            -- xtr | ton | usdt
  price      numeric(14,2) not null,                   -- цена в выбранном способе
  status     text   not null default 'pending'         -- pending | paid | failed | refunded
             check (status in ('pending','paid','failed','refunded')),
  charge_id  text   unique,                            -- telegram_payment_charge_id
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
create index if not exists shark_topups_tg_idx on shark_topups(tg_id, created_at desc);

-- ---------- рефералы ---------------------------------------------------------
create table if not exists shark_referrals (
  inviter_tg bigint not null references shark_users(tg_id),
  invited_tg bigint not null references shark_users(tg_id),
  earned     numeric(20,9) not null default 0,          -- сколько ⭐ всего капнуло пригласившему с этого друга (тип — наследство первой версии)
  created_at timestamptz not null default now(),
  primary key (inviter_tg, invited_tg)
);

-- ---------- ставки / раунды игр ----------------------------------------------
create table if not exists shark_bets (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  game        text   not null,                          -- roulette | crash | pvp
  bet_stars   bigint not null default 0,                -- вход в игру, ⭐
  payout      bigint not null default 0,                -- выплата, ⭐ (0 = проигрыш)
  detail      jsonb  not null default '{}',             -- {prize, mult, crash_point, ...}
  -- provably-fair (для краша): сервер фиксирует seed заранее
  server_seed text,
  seed_hash   text,
  crash_point numeric(8,2),
  started_at  timestamptz,                              -- время старта полёта (для расчёта множителя)
  status      text not null default 'done',             -- open (краш в полёте) | done
  created_at  timestamptz not null default now()
);
create index if not exists shark_bets_tg_idx on shark_bets(tg_id, created_at desc);
-- для БД, созданных раньше
alter table shark_bets add column if not exists bet_stars bigint not null default 0;
alter table shark_bets add column if not exists payout    bigint not null default 0;

-- Подарки жили здесь же во времена звёздного магазина. Таблица не удалена, а
-- переехала ниже, к кейсам, и там же доращивается до нового вида: определение
-- обязано быть ровно одно, иначе `create table if not exists` тихо оставит
-- старую форму и вставка подарка упадёт на первом же оплаченном кейсе.

-- ---------- PVP: общие раунды-джекпот (несколько живых игроков) --------------
-- Один активный раунд за раз: игроки скидываются в общий банк, по таймеру
-- сервер честно (provably-fair) выбирает победителя взвешенно по ставке.
-- Резолв ленивый: раунд разыгрывается, когда кто-то опрашивает состояние
-- после resolve_at (плюс cron-бэкстоп api/cron).
create table if not exists shark_pvp_rounds (
  id          bigint generated always as identity primary key,
  status      text not null default 'waiting'
              check (status in ('waiting','countdown','resolving','done')),
  resolve_at  timestamptz,                         -- дедлайн раунда (когда стартовал отсчёт)
  seed        text not null,                       -- provably-fair seed (раскрывается после)
  seed_hash   text not null,                       -- хэш seed (публикуется заранее)
  rake        numeric(4,3) not null default 0.05,  -- комиссия дома
  pot         bigint not null default 0,           -- фиксируется на резолве
  winner      jsonb,                               -- {name, av, tg_id, stake, pct, payout}
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists shark_pvp_rounds_status_idx on shark_pvp_rounds(status, id desc);

-- ставки в раунде: по одной строке на участника (tg_id = null для ботов)
create table if not exists shark_pvp_bets (
  id         bigint generated always as identity primary key,
  round_id   bigint not null references shark_pvp_rounds(id),
  tg_id      bigint,                                -- null для бота
  name       text not null,
  av         text,
  stake      bigint not null,
  created_at timestamptz not null default now()
);
-- один реальный игрок — одна ставка в раунде
create unique index if not exists shark_pvp_bets_real_uni on shark_pvp_bets(round_id, tg_id) where tg_id is not null;
create index if not exists shark_pvp_bets_round_idx on shark_pvp_bets(round_id);

-- ---------- конфиг (singleton) -----------------------------------------------
create table if not exists shark_config (
  id     integer primary key default 1,
  data   jsonb not null default '{}',
  check (id = 1)
);
insert into shark_config(id, data) values (1, '{
  "star_bets": [25, 50, 100],
  "claim_min_stars": 500,
  "claim_hours": 24,
  "referral_share_percent": 10,
  "referral_bonus_stars": 50
}') on conflict (id) do nothing;
-- для БД, заведённых раньше: досыпать новые ключи, старые не трогая
update shark_config set data = jsonb_build_object(
    'star_bets',        '[25, 50, 100]'::jsonb,
    'claim_min_stars',  500,
    'claim_hours',      24,
    'referral_bonus_stars', 50,
    'referral_share_percent', 10
  ) || data
 where id = 1 and not (data ? 'star_bets');

-- ---------- кейсы с подарками (за Telegram Stars) ---------------------------
--  Звёзды НЕ хранятся на балансе: кейс покупается счётом в XTR в момент
--  нажатия. Заказ заводится ДО оплаты и хранит seed исхода — так исход
--  зафиксирован раньше, чем известно, кто и сколько заплатил. Клиенту сразу
--  отдаётся только хэш seed; сам seed раскрывается после оплаты, и любой может
--  пересчитать выпадение. Тот же приём, что в краше и PVP.
create table if not exists shark_case_orders (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  case_key    text   not null,
  star_price  integer not null,
  seed        text   not null,                        -- раскрывается после оплаты
  seed_hash   text   not null,                        -- публикуется заранее
  status      text   not null default 'pending'       -- pending | paid | failed | refunded
              check (status in ('pending','paid','failed','refunded')),
  charge_id   text   unique,                          -- telegram_payment_charge_id: защита от повтора
  gift_id     bigint,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists shark_case_orders_tg_idx on shark_case_orders(tg_id, created_at desc);

-- ---------- инвентарь подарков ----------------------------------------------
--  Выдача подарка сейчас ручная — как и выплаты: бот присылает админу карточку,
--  админ отправляет подарок в Telegram и отмечает. Поэтому у записи есть
--  состояние доставки, а не только факт выпадения.
create table if not exists shark_gifts (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  order_id    bigint references shark_case_orders(id),
  case_key    text,
  name        text   not null,
  emoji       text,
  star_value  integer not null default 0,             -- цена подарка в звёздах
  rarity      text,                                   -- common | rare | epic | legendary
  status      text   not null default 'held'          -- held | sending | sent
              check (status in ('held','sending','sent')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists shark_gifts_tg_idx on shark_gifts(tg_id, created_at desc);
create index if not exists shark_gifts_status_idx on shark_gifts(status, created_at desc);

-- Доращивание базы, где таблица осталась со времён звёздного магазина
-- (id, tg_id, name, emoji, cost_stars, status pending|sent). `create table if
-- not exists` там ничего не сделал, поэтому недостающее добавляем явно.
alter table shark_gifts add column if not exists order_id   bigint references shark_case_orders(id);
alter table shark_gifts add column if not exists case_key   text;
alter table shark_gifts add column if not exists star_value integer not null default 0;
alter table shark_gifts add column if not exists rarity     text;
alter table shark_gifts add column if not exists sent_at    timestamptz;
-- Старая cost_stars была not null, а новые вставки её не заполняют. На чистой
-- базе колонки нет вовсе, поэтому трогаем её только если она действительно есть.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'shark_gifts' and column_name = 'cost_stars') then
    alter table shark_gifts alter column cost_stars drop not null;
    alter table shark_gifts alter column cost_stars set default 0;
    update shark_gifts set star_value = cost_stars
     where star_value = 0 and cost_stars is not null;
  end if;
end $$;
update shark_gifts set status = 'held' where status = 'pending';
alter table shark_gifts alter column status set default 'held';
do $$ begin
  alter table shark_gifts add constraint shark_gifts_status_chk
    check (status in ('held','sending','sent'));
exception when duplicate_object then null; end $$;
-- кто именно отметил выдачу: ручные действия должны быть именными
alter table shark_gifts add column if not exists sent_by bigint;

-- ============================================================================
--  Атомарное движение средств: пишет строку леджера и обновляет кэш баланса
--  за одну транзакцию. Идемпотентность по p_idem (повторный вызов с тем же
--  ключом ничего не делает и возвращает текущий баланс).
--  Возвращает баланс соответствующей валюты после операции.
-- ============================================================================
create or replace function shark_apply_ledger(
  p_tg       bigint,
  p_currency text,
  p_amount   numeric,
  p_kind     text,
  p_ref      text default null,
  p_idem     text default null,
  p_meta     jsonb default '{}'
) returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
begin
  -- Единственная валюта, которую можно двигать, — stars. Строки 'uah'
  -- в леджере остались историей и читаются, но создать новую нельзя.
  if p_currency <> 'stars' then
    raise exception 'currency % is read-only history; only stars can move', p_currency;
  end if;
  -- дробных звёзд не бывает: 0.5 ⭐ в базе — это уже расхождение с Telegram
  if p_amount <> trunc(p_amount) then
    raise exception 'stars must be whole, got %', p_amount;
  end if;

  -- идемпотентность: если такой idem уже есть — вернуть текущий баланс, не двигая
  if p_idem is not null then
    if exists (select 1 from shark_ledger where idem = p_idem) then
      select stars_balance into v_balance from shark_users where tg_id = p_tg;
      return v_balance;
    end if;
  end if;

  -- блокируем строку пользователя и обновляем баланс
  update shark_users
     set stars_balance = stars_balance + p_amount::bigint,
         last_seen = now()
   where tg_id = p_tg
  returning stars_balance into v_balance;

  if v_balance is null then
    raise exception 'user % not found', p_tg;
  end if;
  if v_balance < 0 then
    raise exception 'insufficient funds' using errcode = 'check_violation';
  end if;

  insert into shark_ledger(tg_id, currency, amount, kind, ref, idem, meta, balance_after)
  values (p_tg, p_currency, p_amount, p_kind, p_ref, p_idem, coalesce(p_meta,'{}'), v_balance);

  return v_balance;
end;
$$;
