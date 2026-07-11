// -----------------------------------------------------------------------------
//  EventBus.cs — типобезопасная шина событий.
//
//  Модули общаются через события, не зная друг о друге напрямую (слабая связность).
//  Пример:
//      App.Bus.Subscribe<ItemFoundEvent>(OnItemFound);
//      App.Bus.Publish(new ItemFoundEvent(itemId, reward));
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;

namespace Findoria.Core
{
    /// <summary>Маркерный интерфейс любого события в игре.</summary>
    public interface IEvent { }

    /// <summary>
    /// Реестр обработчиков по типу события. Публикация синхронная.
    /// Потокобезопасность не требуется — работаем в главном потоке Unity.
    /// </summary>
    public sealed class EventBus
    {
        private readonly Dictionary<Type, Delegate> _handlers = new();

        /// <summary>Подписаться на событие типа <typeparamref name="T"/>.</summary>
        public void Subscribe<T>(Action<T> handler) where T : IEvent
        {
            if (handler == null) return;
            var type = typeof(T);
            _handlers[type] = _handlers.TryGetValue(type, out var existing)
                ? Delegate.Combine(existing, handler)
                : handler;
        }

        /// <summary>Отписаться. Обязательно вызывать в OnDisable/OnDestroy.</summary>
        public void Unsubscribe<T>(Action<T> handler) where T : IEvent
        {
            if (handler == null) return;
            var type = typeof(T);
            if (!_handlers.TryGetValue(type, out var existing)) return;

            var reduced = Delegate.Remove(existing, handler);
            if (reduced == null) _handlers.Remove(type);
            else _handlers[type] = reduced;
        }

        /// <summary>Опубликовать событие всем подписчикам.</summary>
        public void Publish<T>(T evt) where T : IEvent
        {
            if (_handlers.TryGetValue(typeof(T), out var d) && d is Action<T> typed)
                typed.Invoke(evt);
        }

        /// <summary>Очистить все подписки (например, при выходе из сессии).</summary>
        public void Clear() => _handlers.Clear();
    }
}
