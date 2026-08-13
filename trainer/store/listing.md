# PRO Trainer — тексты для App Store и Google Play

Всё готово к копированию — подставлять ничего не нужно. Домен, реквизиты и
адрес поддержки уже вписаны: `pro-trainer.pro`, ФОП Мозолевич Андрей,
andreymenedger01@gmail.com, чат `t.me/suport_uk`.

Скриншоты — `node trainer/store/shots.js` (см. в конце).

---

## Общее для обоих магазинов

| Поле | Значение |
|---|---|
| Bundle ID / applicationId | `com.protrainer.app` |
| Категория | App Store: **Business**, вторая — Health & Fitness · Google Play: **Business** |
| Возрастной рейтинг | 4+ / Everyone |
| Языки | українська, русский, English, polski |
| Support URL | `https://pro-trainer.pro/support` — страница с ответами и почтой, есть в деплое |
| Marketing URL | `https://pro-trainer.pro` — открывается само приложение, его можно потрогать в браузере |
| Privacy Policy URL | `https://pro-trainer.pro/privacy` — страница есть, отдаётся с деплоя |
| Terms (EULA) | `https://pro-trainer.pro/terms` — страница есть, отдаётся с деплоя |
| Data deletion URL (Google Play) | `https://pro-trainer.pro/delete` — обязательное поле, страница есть |

**Подписки** (те же ID, что в `PLANS`):

| Product ID | Длительность | Цена |
|---|---|---|
| `pro_trainer_monthly` | 1 месяц | $4.99 |
| `pro_trainer_quarterly` | 3 месяца | $12.99 |
| `pro_trainer_yearly` | 1 год | $49.99 |

Пробный период — 14 дней, полный доступ, оплата только после его окончания.

---

## App Privacy (Apple) и Data safety (Google)

Отвечать одинаково, и это правда — проверяется по коду:

- **Данные не собираются.** Клиенты, тренировки, оплаты и заметки лежат в
  хранилище приложения на устройстве. Синхронизация выключена по умолчанию;
  адрес сервера задаёт сам тренер в настройках.
- **Данные не передаются третьим сторонам** и не используются для рекламы и
  трекинга. Рекламных SDK в приложении нет.
- **Аккаунт**: почта или телефон — только как логин на устройстве. Пароль
  необязателен; если задан, хранится хешем с солью (SHA-256).
- **Оплаты**: обрабатывают App Store / Google Play (и LiqPay для оплаты на
  сайте). Данные карты приложение не видит и не хранит — только факт активной
  подписки и её срок.
- **Удаление**: тренер может удалить клиента с историей, очистить все данные
  приложения или сохранить резервную копию в файл.

Если включена оплата на сайте, в Data safety добавьте: «Email или номер
телефона передаётся платёжному сервису для привязки подписки».

---

## Украинский

**Назва (30):**
```
PRO Trainer: кабінет тренера
```

**Підзаголовок (30):**
```
Клієнти, розклад і гроші
```

**Короткий опис для Google Play (80):**
```
Клієнти, розклад, оплати й дохід персонального тренера. Працює без інтернету.
```

**Промотекст App Store (170):**
```
Відкрив застосунок — і за три секунди бачиш, скільки тренувань сьогодні і скільки заробив. Оборот, комісія залу й чисті рахуються самі.
```

**Опис:**
```
PRO Trainer — не фітнес-трекер, а робочий кабінет персонального тренера:
клієнти, розклад, гроші й продажі в одному місці.

ВАШ ДЕНЬ — НА ОДНОМУ ЕКРАНІ
Скільки тренувань сьогодні, скільки ви заробили, хто ще не заплатив і кому час
написати. Відмітити «Проведено» — один дотик просто зі списку.

ГРОШІ РАХУЮТЬСЯ САМІ
Оборот, комісія залу (відсоток, фіксована сума або без неї) і чисті —
рахуються автоматично. Ціну за тренування ви вводите самі, а за постійним
клієнтом можна закріпити свою.

КЛІЄНТИ Й РОЗКЛАД
Картка клієнта з історією, боргами, абонементом і нотатками. Календар на день,
тиждень і місяць. Нове тренування — за кілька дотиків.

ТОВАРИ Й АБОНЕМЕНТИ
Протеїн, шейкери, резинки: залишок і прибуток рахуються самі. Абонемент
списується автоматично з кожним проведеним тренуванням.

НАГАДУВАННЯ
За годину, 30, 15 або 5 хвилин до тренування. Плюс борги, клієнти, які давно
не приходили, абонементи, що закінчуються, і залишки товарів.

ФІНАНСИ Й СТАТИСТИКА
Дохід за день, тиждень, місяць, рік або свій період. Звідки дохід, борги
клієнтів, середній чек, навантаження по днях. Вивантаження в CSV для
бухгалтера.

ДАНІ ЗАЛИШАЮТЬСЯ У ВАС
Усе зберігається на пристрої й працює без інтернету. Ми не збираємо дані ваших
клієнтів і не передаємо їх нікому. За бажанням базу можна зашифрувати
PIN-кодом (AES-256) і будь-коли зробити резервну копію у файл.

14 днів повного доступу безкоштовно. Далі — підписка; дані нікуди не зникають
навіть після її завершення.
```

**Ключові слова (100):**
```
тренер,персональний,клієнти,розклад,дохід,абонемент,фітнес,облік,зал,тренування,запис,борги
```

**Що нового:**
```
• Інтерфейс чотирма мовами: українська, російська, англійська, польська
• Вивантаження фінансів у CSV для бухгалтера
• Нагадування плануються на тижні наперед
• Фото клієнтів стискаються — база більше не переповнюється
```

**Підписи до скриншотів:**
1. Ваш день — на одному екрані
2. Розклад, який завжди під рукою
3. Уся історія клієнта в одній картці
4. Гроші рахуються самі
5. Товари й абонементи — теж дохід

---

## Русский

**Название (30):**
```
PRO Trainer: кабинет тренера
```

**Подзаголовок (30):**
```
Клиенты, расписание, деньги
```

**Краткое описание для Google Play (80):**
```
Клиенты, расписание, оплаты и доход тренера. Работает без интернета.
```

**Промотекст App Store (170):**
```
Открыл приложение — и за три секунды видишь, сколько тренировок сегодня и сколько заработал. Оборот, комиссия зала и чистыми считаются сами.
```

**Описание:**
```
PRO Trainer — не фитнес-трекер, а рабочий кабинет персонального тренера:
клиенты, расписание, деньги и продажи в одном месте.

ВАШ ДЕНЬ — НА ОДНОМ ЭКРАНЕ
Сколько тренировок сегодня, сколько вы заработали, кто ещё не заплатил и кому
пора написать. Отметить «Проведено» — одно касание прямо из списка.

ДЕНЬГИ СЧИТАЮТСЯ САМИ
Оборот, комиссия зала (процент, фиксированная сумма или без неё) и чистыми —
считаются автоматически. Цену за тренировку вы вводите сами, а за постоянным
клиентом можно закрепить свою.

КЛИЕНТЫ И РАСПИСАНИЕ
Карточка клиента с историей, долгами, абонементом и заметками. Календарь на
день, неделю и месяц. Новая тренировка — за пару касаний.

ТОВАРЫ И АБОНЕМЕНТЫ
Протеин, шейкеры, резинки: остаток и прибыль считаются сами. Абонемент
списывается автоматически с каждой проведённой тренировкой.

НАПОМИНАНИЯ
За час, 30, 15 или 5 минут до тренировки. Плюс долги, клиенты, которые давно
не приходили, заканчивающиеся абонементы и остатки товаров.

ФИНАНСЫ И СТАТИСТИКА
Доход за день, неделю, месяц, год или свой период. Откуда доход, долги
клиентов, средний чек, нагрузка по дням. Выгрузка в CSV для бухгалтера.

ДАННЫЕ ОСТАЮТСЯ У ВАС
Всё хранится на устройстве и работает без интернета. Мы не собираем данные
ваших клиентов и никому их не передаём. По желанию базу можно зашифровать
PIN-кодом (AES-256) и в любой момент сохранить резервную копию в файл.

14 дней полного доступа бесплатно. Дальше — подписка; данные никуда не
исчезают даже после её окончания.
```

**Ключевые слова (100):**
```
тренер,персональный,клиенты,расписание,доход,абонемент,фитнес,учет,зал,тренировки,запись,долги
```

**Что нового:**
```
• Интерфейс на четырёх языках: украинский, русский, английский, польский
• Выгрузка финансов в CSV для бухгалтера
• Напоминания планируются на недели вперёд
• Фото клиентов сжимаются — база больше не переполняется
```

**Подписи к скриншотам:**
1. Ваш день — на одном экране
2. Расписание всегда под рукой
3. Вся история клиента в одной карточке
4. Деньги считаются сами
5. Товары и абонементы — тоже доход

---

## English

**Name (30):**
```
PRO Trainer: Coach Business
```

**Subtitle (30):**
```
Clients, schedule, income
```

**Short description for Google Play (80):**
```
Clients, schedule, payments and income for personal trainers. Works offline.
```

**Promotional text (170):**
```
Open the app and in three seconds you see how many sessions you have today and how much you earned. Turnover, the gym's cut and your net are calculated for you.
```

**Description:**
```
PRO Trainer is not a fitness tracker. It is the back office of a personal
trainer: clients, schedule, money and sales in one place.

YOUR DAY ON ONE SCREEN
How many sessions today, how much you earned, who still owes you and who to
text. Marking a session as completed takes one tap, straight from the list.

THE MONEY COUNTS ITSELF
Turnover, the gym's cut (percentage, fixed fee or none) and your net are
calculated automatically. You enter the price per session yourself, and you
can pin a separate price to a regular client.

CLIENTS AND SCHEDULE
A client card with history, debts, packages and notes. Day, week and month
calendar. A new session takes a few taps.

PRODUCTS AND PACKAGES
Protein, shakers, bands: stock and profit are tracked for you. A package is
deducted automatically with every completed session.

REMINDERS
An hour, 30, 15 or 5 minutes before a session. Plus debts, clients who have
not come for a while, packages running out and low stock.

FINANCES AND STATISTICS
Income by day, week, month, year or a custom range. Where the income comes
from, client debts, average check, workload by weekday. CSV export for your
bookkeeper.

YOUR DATA STAYS YOURS
Everything is stored on the device and works without internet. We do not
collect your clients' data and never pass it on. You can encrypt the database
with a PIN (AES-256) and save a backup to a file at any time.

14 days of full access for free. After that it is a subscription — and your
data stays put even when the subscription ends.
```

**Keywords (100):**
```
trainer,coach,personal training,clients,schedule,income,fitness,gym,booking,payments,invoice,crm
```

**What's New:**
```
• Interface in four languages: Ukrainian, Russian, English, Polish
• CSV export of finances for your bookkeeper
• Reminders are now scheduled weeks ahead
• Client photos are compressed — the database no longer fills up
```

**Screenshot captions:**
1. Your day on one screen
2. A schedule that is always at hand
3. The whole client history in one card
4. The money counts itself
5. Products and packages are income too

---

## Polski

**Nazwa (30):**
```
PRO Trainer: gabinet trenera
```

**Podtytuł (30):**
```
Klienci, grafik i pieniądze
```

**Krótki opis dla Google Play (80):**
```
Klienci, grafik, płatności i dochód trenera. Działa bez internetu.
```

**Tekst promocyjny (170):**
```
Otwierasz aplikację i w trzy sekundy widzisz, ile masz dziś treningów i ile zarobiłeś. Obrót, prowizja klubu i kwota netto liczą się same.
```

**Opis:**
```
PRO Trainer to nie tracker fitness, tylko zaplecze trenera personalnego:
klienci, grafik, pieniądze i sprzedaż w jednym miejscu.

TWÓJ DZIEŃ NA JEDNYM EKRANIE
Ile treningów dzisiaj, ile zarobiłeś, kto jeszcze nie zapłacił i do kogo
napisać. Oznaczenie treningu jako odbytego to jedno dotknięcie, prosto z listy.

PIENIĄDZE LICZĄ SIĘ SAME
Obrót, prowizja klubu (procent, stała kwota albo brak) i kwota netto liczone
automatycznie. Cenę za trening wpisujesz sam, a stałemu klientowi możesz
przypisać własną.

KLIENCI I GRAFIK
Karta klienta z historią, długami, karnetem i notatkami. Kalendarz dzienny,
tygodniowy i miesięczny. Nowy trening w kilka dotknięć.

TOWARY I KARNETY
Odżywki, shakery, gumy: stan i zysk liczą się same. Karnet odlicza się
automatycznie przy każdym odbytym treningu.

PRZYPOMNIENIA
Godzinę, 30, 15 albo 5 minut przed treningiem. Plus długi, klienci, których
dawno nie było, kończące się karnety i niskie stany towarów.

FINANSE I STATYSTYKI
Dochód dzienny, tygodniowy, miesięczny, roczny lub za własny okres. Skąd
pochodzi dochód, długi klientów, średni rachunek, obciążenie w tygodniu.
Eksport CSV dla księgowej.

TWOJE DANE ZOSTAJĄ U CIEBIE
Wszystko jest przechowywane na urządzeniu i działa bez internetu. Nie zbieramy
danych Twoich klientów i nikomu ich nie przekazujemy. Bazę można zaszyfrować
PIN-em (AES-256) i w każdej chwili zapisać kopię zapasową do pliku.

14 dni pełnego dostępu za darmo. Potem subskrypcja — a dane zostają na miejscu
nawet po jej zakończeniu.
```

**Słowa kluczowe (100):**
```
trener,personalny,klienci,grafik,dochód,karnet,fitness,siłownia,rezerwacja,płatności,treningi,crm
```

**Co nowego:**
```
• Interfejs w czterech językach: ukraiński, rosyjski, angielski, polski
• Eksport finansów do CSV dla księgowej
• Przypomnienia planowane na tygodnie do przodu
• Zdjęcia klientów są kompresowane — baza się nie przepełnia
```

**Podpisy pod zrzutami:**
1. Twój dzień na jednym ekranie
2. Grafik zawsze pod ręką
3. Cała historia klienta w jednej karcie
4. Pieniądze liczą się same
5. Towary i karnety to też dochód

---

## Скриншоты

```bash
node trainer/store/shots.js          # все языки
node trainer/store/shots.js uk en    # только выбранные
```

Кладутся в `trainer/store/out/<язык>/`:

- `ios-*.png` — **1290×2796**, App Store 6.7" (iPhone 15/16 Pro Max). Apple
  принимает этот набор и для остальных размеров iPhone.
- `play-*.png` — **1080×1920**, Google Play. Нужно минимум 2, лучше 5.

Снимается настоящее приложение: скрипт проходит онбординг, включает демоданные
и открывает нужный экран, потом вкладывает кадр в рамку с заголовком. Заголовки
берутся из `CAPTION` в `shots.js` — те же, что в списке подписей выше.

`trainer/index.html` берёт React и Babel с unpkg, поэтому скрипту нужен
интернет. Если его нет, укажите самодостаточную сборку:
`APP=/путь/к/app.html node trainer/store/shots.js`.

---

## Перед отправкой на ревью

Проверки по магазинам расписаны в `trainer/native/README.md`. Коротко, что
нельзя забыть:

1. Перечитать `trainer/legal/terms.md` и `privacy.md` — тексты написаны без
   юриста, и что в них может не сойтись с вашей ситуацией, перечислено в
   README, раздел «Юридические документы».
2. Подписать Paid Apps Agreement, заполнить банковские и налоговые данные —
   без этого покупки не работают даже в sandbox.
3. Ссылки на «Умови» и «Політику» указать и в метаданных, не только в
   приложении.
4. Скриншот экрана оплаты приложить к заявке на ревью.
5. Если оставляете кнопку «Активувати у WEB» в iOS-сборке — нужен External
   Purchase Link Entitlement. Без него уберите домен из `WEB.base`, и кнопка
   не появится.
