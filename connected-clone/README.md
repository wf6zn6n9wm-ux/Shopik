# Connected.com.ua — клон головної сторінки

Реплі́ка лендингу онлайн-школи підготовки до **ЄВІ, ТЗНК, ЄФВВ та ЄВВ**,
зібрана на **Next.js 14 (App Router) + TypeScript + Tailwind CSS** у стилі shadcn/ui.

> Оригінал `connected.com.ua` закритий захистом від ботів, тож структуру
> відтворено за макетом (14 секцій), а тексти/цифри — реалістичні приклади.
> Кольори бренду й фото — приблизні плейсхолдери, які легко замінити.

## Запуск локально

```bash
cd connected-clone
npm install
npm run dev
```

Відкрийте http://localhost:3000

## Збірка

```bash
npm run build
npm run start
```

## Структура

```
app/
  layout.tsx        # метадані (lang="uk"), підключення стилів
  page.tsx          # збирає всі секції згори донизу
  globals.css       # шрифти (Work Sans + Caveat), базові стилі
components/
  Header.tsx        # липка шапка + випадаюче меню «Курси»
  PromoBanner.tsx   # синій банер вебінару
  Hero.tsx          # заголовок, фото засновника, блок статистики
  Courses.tsx       # таби Магістратура/Аспірантура + кольорові картки
  WhyChoose.tsx     # панелі 93% / 150+
  MoreThanPrep.tsx  # 3 переваги + цитата засновника
  Steps.tsx         # 5 кроків навчання
  Reviews.tsx       # карусель відгуків + відео-відгук
  Universities.tsx  # біжуча стрічка ВНЗ + CTA-панель
  ExamSchedule.tsx  # таймлайн 2026 + стікер
  Faq.tsx           # акордеон питань
  MoreQuestions.tsx # CTA + блок YouTube
  CoursesSecondary.tsx # «Наші курси»
  Footer.tsx        # темний футер: посилання, соцмережі, оплата
  ui/               # shadcn-style примітиви (button, accordion, tabs)
lib/
  data.ts           # увесь контент: курси, кроки, відгуки, ВНЗ, FAQ, розклад
  utils.ts          # хелпер cn()
```

## Що варто замінити під реальний бренд

- `tailwind.config.ts` → секція `colors.brand` (точні кольори бренду)
- `app/globals.css` → шрифти (`Work Sans` + фірмовий «SixHands Marker»)
- фото засновника в `Hero.tsx` та `MoreThanPrep.tsx`
- логотипи ВНЗ у `Universities.tsx`
- тексти й ціни в `lib/data.ts`
