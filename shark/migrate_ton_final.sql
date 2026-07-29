-- ============================================================================
--  SHARK — Э6: удаление остатков старой экономики
-- ============================================================================
--  Запускать ОДИН РАЗ и ТОЛЬКО ПОСЛЕ migrate_ton.sql (который обнулил гривны
--  и звёздные балансы) и после schema.sql свежей версии.
--
--  Что делает:
--    1. закрывает незакрытые заявки на вывод старой экономики;
--    2. убеждается, что на грн/звёздных балансах ноль, — и только тогда
--       удаляет сами колонки;
--    3. удаляет неиспользуемые поля ставок и реферальных лимитов.
--
--  Чего НЕ делает: не трогает строки леджера. История движения средств —
--  это учётный документ, её не переписывают. Строки 'uah'/'stars' останутся
--  навсегда, читать их можно, создавать новые — уже нет (см. shark_apply_ledger).
--
--  Скрипт идемпотентен: повторный запуск ничего не ломает.
-- ============================================================================

-- ---------- 1. заявки старой экономики --------------------------------------
--  Возвращать по ним нечего: балансы, с которых списывали, обнулены миграцией
--  Э3. Поэтому закрываем их явно, а не оставляем висеть «pending» навсегда —
--  иначе админ однажды нажмёт «отклонить» и получит ошибку без объяснений.
do $$
declare v_n integer;
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'shark_withdrawals' and column_name = 'amount_uah') then
    update shark_withdrawals
       set status = 'rejected',
           admin_note = coalesce(admin_note, '') || ' [закрыта миграцией Э6: экономика переведена на TON]',
           decided_at = now()
     where status = 'pending' and amount_ton is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise notice 'Э6: закрыто заявок старой экономики: %', v_n; end if;
  end if;
end $$;

-- Все оставшиеся заявки — в TON, поэтому сумма обязана быть заполнена.
do $$ begin
  if exists (select 1 from shark_withdrawals where amount_ton is null) then
    raise notice 'Э6: остались заявки без amount_ton — колонку not null не ставим';
  else
    alter table shark_withdrawals alter column amount_ton set not null;
  end if;
end $$;

alter table shark_withdrawals drop column if exists amount_uah;
alter table shark_withdrawals drop column if exists amount_usdt;

-- ---------- 2. балансы старой экономики -------------------------------------
--  Колонку с деньгами удалять вслепую нельзя: если там остались ненулевые
--  значения, это чей-то невыведенный баланс, и drop уничтожит его без следа.
--  Поэтому сначала проверяем, а при находке — громко отказываемся.
do $$
declare v_money numeric := 0; v_stars numeric := 0; v_has boolean;
begin
  select exists (select 1 from information_schema.columns
                 where table_name = 'shark_users' and column_name = 'money_balance') into v_has;
  if v_has then execute 'select coalesce(sum(money_balance),0) from shark_users' into v_money; end if;

  select exists (select 1 from information_schema.columns
                 where table_name = 'shark_users' and column_name = 'stars_balance') into v_has;
  if v_has then execute 'select coalesce(sum(stars_balance),0) from shark_users' into v_stars; end if;

  if v_money <> 0 or v_stars <> 0 then
    raise exception 'Э6 остановлен: на старых балансах ещё есть средства (грн: %, звёзд: %). Сначала запустите migrate_ton.sql', v_money, v_stars;
  end if;

  alter table shark_users drop column if exists money_balance;
  alter table shark_users drop column if exists stars_balance;
  alter table shark_users drop column if exists won_stars;
  -- суточный лимит реферальных звёзд: доля считается от рейка, лимита нет
  alter table shark_users drop column if exists ref_day;
  alter table shark_users drop column if exists ref_stars_today;
end $$;

-- ---------- 3. ставки ---------------------------------------------------------
--  bet_stars / payout хранили звёзды уже сыгранных раундов. Переносить их в
--  нанотоны нельзя — это разные величины, а не разные единицы одной; строки
--  той эпохи остаются в леджере, а колонки уходят.
alter table shark_bets drop column if exists bet_stars;
alter table shark_bets drop column if exists payout;

-- ---------- 4. проверка -------------------------------------------------------
do $$
declare v_left text;
begin
  select string_agg(table_name || '.' || column_name, ', ')
    into v_left
    from information_schema.columns
   where table_name in ('shark_users','shark_bets','shark_withdrawals')
     and column_name in ('money_balance','stars_balance','won_stars','ref_day',
                         'ref_stars_today','bet_stars','payout','amount_uah','amount_usdt');
  if v_left is null then
    raise notice 'Э6: старая экономика удалена полностью';
  else
    raise notice 'Э6: остались колонки — %', v_left;
  end if;
end $$;
