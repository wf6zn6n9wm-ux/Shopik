# Shopik

Прототип платформи Shopik — магазин з Instagram/Telegram за 5 хвилин.

Зібрано на Vite + React + Tailwind (CDN).

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
   create table shops (id bigint primary key, data jsonb);
   alter table shops enable row level security;
   create policy "public" on shops for all using (true) with check (true);
   ```
3. У **Settings → API** скопіюй *Project URL* та *anon (public) key*
4. Встав їх у `index.html` у константи `SUPABASE_URL` та `SUPABASE_ANON_KEY`

Після цього локальні дані автоматично мігрують у хмару при першому запуску.
Якщо ключі не вказані — застосунок працює як раніше, локально.

> ⚠️ Політика `using (true)` робить дані публічними (зручно для прототипу).
> Для продакшну налаштуй автентифікацію та суворіші RLS-політики.
