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

## Вхід продавців (email + пароль)
Коли Supabase підключено, з'являється екран входу/реєстрації. Кожен продавець
бачить і редагує **лише свої** магазини (захищено RLS-політикою вище).

- Реєстрація / вхід — вбудований Supabase Auth (пошта + пароль).
- Щоб під час тестування не підтверджувати пошту щоразу, у Supabase:
  **Authentication → Providers → Email** вимкни *Confirm email*.
- Для входу через Google додай провайдера в тому ж розділі (окремий крок).
