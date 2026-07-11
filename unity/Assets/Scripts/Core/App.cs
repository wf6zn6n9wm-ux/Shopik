// -----------------------------------------------------------------------------
//  Findoria — Hidden Objects (Unity 6, C#)
//  App.cs — единая точка доступа к глобальным сервисам (композиционный корень).
//
//  App не создаёт сервисы сам — их регистрирует GameBootstrap. Это тонкий
//  фасад над контейнером зависимостей и шиной событий, чтобы любой модуль мог
//  получить общие сервисы, не завися от конкретных реализаций (принцип DIP).
// -----------------------------------------------------------------------------
namespace Findoria.Core
{
    /// <summary>
    /// Глобальный локатор для уже собранного графа зависимостей.
    /// Заполняется один раз в <c>GameBootstrap</c> на старте приложения.
    /// </summary>
    public static class App
    {
        /// <summary>Контейнер зависимостей (Dependency Injection).</summary>
        public static IServiceContainer Services { get; private set; }

        /// <summary>Типобезопасная шина событий (Event Bus).</summary>
        public static EventBus Bus { get; private set; }

        /// <summary>Готово ли приложение к работе (сервисы зарегистрированы).</summary>
        public static bool IsReady => Services != null && Bus != null;

        /// <summary>Инициализация из корня композиции. Вызывать ровно один раз.</summary>
        public static void Initialize(IServiceContainer services, EventBus bus)
        {
            Services = services;
            Bus = bus;
        }

        /// <summary>Короткий помощник: разрешить сервис по интерфейсу.</summary>
        public static T Resolve<T>() where T : class => Services.Resolve<T>();

        /// <summary>Сброс (используется при выходе/перезапуске и в тестах).</summary>
        public static void Reset()
        {
            Services = null;
            Bus = null;
        }
    }
}
