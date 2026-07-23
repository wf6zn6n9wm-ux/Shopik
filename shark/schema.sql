-- ============================================================================
--  SHARK — схема базы данных (Supabase / PostgreSQL)
-- ============================================================================
--  Применить один раз: Supabase → SQL Editor → вставить этот файл → Run.
--
--  Принципы:
--   • Две НЕзависимые валюты: uah (грн, реальные, выводятся) и stars (⭐, игровые,
--     НЕ выводятся — тратятся на подарки/игры). Нет ни одной операции, которая
--     конвертирует stars → uah.
--   • Баланс = кэш в shark_users.money_balance / stars_balance, а СМЫСЛ хранится
--     в леджере shark_ledger. Любое движение денег/звёзд идёт через функцию
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
  money_balance  numeric(14,2) not null default 0,   -- грн, доступно к выводу
  stars_balance  bigint  not null default 0,          -- ⭐, игровая валюта
  ref_code       text    unique,                       -- код этого юзера для приглашений
  ref_by         bigint  references shark_users(tg_id),-- кто пригласил
  banned         boolean not null default false,
  played         integer not null default 0,           -- сыграно раундов (для профиля/уровня)
  won_stars      bigint  not null default 0,           -- суммарно выиграно ⭐
  created_at     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);

-- ---------- леджер (источник истины по движению средств) ---------------------
create table if not exists shark_ledger (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null references shark_users(tg_id),
  currency   text   not null check (currency in ('uah','stars')),
  amount     numeric(14,2) not null,                   -- + начисление, − списание
  kind       text   not null,                          -- referral|bet|win|withdraw|withdraw_refund|gift|topup|adjust
  ref        text,                                     -- ссылка на сущность (id вывода/раунда)
  idem       text   unique,                            -- ключ идемпотентности (может быть null для «всегда уникальных»)
  meta       jsonb  not null default '{}',
  balance_after numeric(14,2),                         -- баланс соответствующей валюты после операции
  created_at timestamptz not null default now()
);
create index if not exists shark_ledger_tg_idx on shark_ledger(tg_id, created_at desc);

-- ---------- заявки на вывод (ручное подтверждение) ---------------------------
create table if not exists shark_withdrawals (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  method      text   not null,                          -- card_ua | usdt_trc20 | usdt_ton | usdt_bep20
  requisites  text   not null,
  amount_uah  numeric(14,2) not null,
  amount_usdt numeric(14,2),                            -- справочно, если метод USDT
  status      text   not null default 'pending'         -- pending | approved | rejected | paid
              check (status in ('pending','approved','rejected','paid')),
  admin_note  text,
  admin_msg_id bigint,                                  -- id сообщения-карточки у админа (чтобы отредактировать кнопки)
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint
);
create index if not exists shark_wd_status_idx on shark_withdrawals(status, created_at desc);

-- ---------- рефералы ---------------------------------------------------------
create table if not exists shark_referrals (
  inviter_tg bigint not null references shark_users(tg_id),
  invited_tg bigint not null references shark_users(tg_id),
  earned     numeric(14,2) not null default 0,          -- сколько всего капнуло пригласившему с этого друга
  created_at timestamptz not null default now(),
  primary key (inviter_tg, invited_tg)
);

-- ---------- ставки / раунды игр (звёзды) -------------------------------------
create table if not exists shark_bets (
  id          bigint generated always as identity primary key,
  tg_id       bigint not null references shark_users(tg_id),
  game        text   not null,                          -- roulette | crash | pvp
  bet_stars   bigint not null default 0,
  payout      bigint not null default 0,                -- выплата в ⭐ (0 = проигрыш)
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

-- ---------- покупки подарков -------------------------------------------------
create table if not exists shark_gifts (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null references shark_users(tg_id),
  name       text not null,
  emoji      text,
  cost_stars bigint not null,
  status     text not null default 'pending',           -- pending | sent
  created_at timestamptz not null default now()
);

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
  "usdt_rate": 45,
  "min_withdraw": 100,
  "referral_bonus": 10,
  "referral_share": 0.10
}') on conflict (id) do nothing;

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
  -- идемпотентность: если такой idem уже есть — вернуть текущий баланс, не двигая
  if p_idem is not null then
    if exists (select 1 from shark_ledger where idem = p_idem) then
      if p_currency = 'uah' then
        select money_balance into v_balance from shark_users where tg_id = p_tg;
      else
        select stars_balance into v_balance from shark_users where tg_id = p_tg;
      end if;
      return v_balance;
    end if;
  end if;

  -- блокируем строку пользователя и обновляем нужный баланс
  if p_currency = 'uah' then
    update shark_users
       set money_balance = money_balance + p_amount,
           last_seen = now()
     where tg_id = p_tg
    returning money_balance into v_balance;
  elsif p_currency = 'stars' then
    update shark_users
       set stars_balance = stars_balance + p_amount::bigint,
           last_seen = now()
     where tg_id = p_tg
    returning stars_balance into v_balance;
  else
    raise exception 'bad currency %', p_currency;
  end if;

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
