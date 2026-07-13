# Nova — Базовый стек (заморожен)

Текущая архитектура зафиксирована как базовая. **Не менять без критической
необходимости** (обоснование + оценка влияния на масштабируемость обязательны).

## Технологии

| Слой | Решение | Статус |
|---|---|---|
| UI / клиент | **Flutter** (iOS · Android · Web · Desktop) | заморожен |
| State | **Riverpod 2.x** | заморожен |
| Навигация | **go_router** (URL, deep links, web) | заморожен |
| Хранилище | **Drift (SQLite)**, local-first / offline-first | заморожен |
| Архитектура | **ports & adapters + модули**, repository pattern | заморожен |
| CI/CD | GitHub Actions (format · analyze · test), self-healing формат | заморожен |

## Принципы (обязательны для каждой новой фичи)

- Local-first · Offline-first · Multi-tenant (`businessId` везде) · Feature-first
- Repository pattern (UI ↔ порты, никогда напрямую к БД)
- Универсальность: сущности нейтральны к отрасли (Business/Service/Client/
  Appointment/Resource/Staff/Location). Специфику даёт **данные** (IndustryCatalog),
  а не код. Никаких beauty-привязанных имён таблиц/моделей/экранов.
- Каждая фича сразу: Entitlements (подписки) · аналитика событий · локализация ·
  Web + iOS + Android · мультивалюта/язык/таймзона. Без временных решений.

## Готовность к росту (без переписывания)

Мультифилиальность (`Locations`), команда/роли (`StaffMembers` + права),
несколько календарей/ресурсов (`Resource`-сущность), мультивалюта (`Money`/
`Currency` + `Business.currency`), мультиязык (i18n), мультизона (`Clock` +
`Business.timeZone`) — заложены в схеме и портах с первого дня.

Изменение стека — только через явное решение с обоснованием и оценкой рисков.
