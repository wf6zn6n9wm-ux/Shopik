-- ============================================================================
--  РАЗОВАЯ МИГРАЦИЯ: переход на TON-экономику
-- ============================================================================
--  Выполнить ОДИН раз в Supabase → SQL Editor, ПОСЛЕ того как применён
--  обновлённый schema.sql (он добавляет ton_balance и расширяет точность).
--
--  В отличие от schema.sql этот файл НЕ безопасен для повторного запуска
--  вслепую: он меняет данные, а не структуру. Поэтому стоит защита — если
--  миграция уже отмечена в shark_config, скрипт ничего не делает и скажет об
--  этом. Запускать повторно можно без вреда.
--
--  Что делает:
--   1. Обнуляет балансы звёзд. Звёзды перестают быть игровой валютой и вообще
--      не хранятся: кейс покупается счётом в Stars в момент покупки.
--   2. Обнуляет гривневые балансы. Гривна из экономики уходит.
--   3. Пишет в леджер строку списания на каждый ненулевой баланс — чтобы
--      обнуление не выглядело как пропажа денег, а имело след в истории.
--
--  Балансы TON не трогаются: до этого момента их не существовало.
-- ============================================================================

do $$
declare
  v_done   boolean;
  v_stars  bigint  := 0;
  v_money  numeric := 0;
  v_users  integer := 0;
  r        record;
begin
  select coalesce((data->>'ton_migration_done')::boolean, false) into v_done
    from shark_config where id = 1;

  if coalesce(v_done, false) then
    raise notice 'Миграция уже выполнялась — ничего не делаю.';
    return;
  end if;

  -- след в истории: почему баланс обнулился
  for r in
    select tg_id, stars_balance, money_balance
      from shark_users
     where stars_balance <> 0 or money_balance <> 0
  loop
    v_users := v_users + 1;

    if r.stars_balance <> 0 then
      v_stars := v_stars + r.stars_balance;
      insert into shark_ledger(tg_id, currency, amount, kind, ref, idem, meta, balance_after)
      values (r.tg_id, 'stars', -r.stars_balance, 'adjust', 'ton_migration',
              'ton_migration_stars:' || r.tg_id,
              jsonb_build_object('reason', 'stars_no_longer_game_currency'), 0)
      on conflict (idem) do nothing;
    end if;

    if r.money_balance <> 0 then
      v_money := v_money + r.money_balance;
      insert into shark_ledger(tg_id, currency, amount, kind, ref, idem, meta, balance_after)
      values (r.tg_id, 'uah', -r.money_balance, 'adjust', 'ton_migration',
              'ton_migration_uah:' || r.tg_id,
              jsonb_build_object('reason', 'uah_removed'), 0)
      on conflict (idem) do nothing;
    end if;
  end loop;

  update shark_users
     set stars_balance = 0, money_balance = 0
   where stars_balance <> 0 or money_balance <> 0;

  -- отметка, чтобы повторный запуск был безвредным
  insert into shark_config(id, data) values (1, jsonb_build_object('ton_migration_done', true))
  on conflict (id) do update set data = shark_config.data || jsonb_build_object('ton_migration_done', true);

  raise notice 'Готово. Затронуто пользователей: %, списано звёзд: %, списано грн: %', v_users, v_stars, v_money;
end $$;
