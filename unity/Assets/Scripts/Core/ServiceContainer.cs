// -----------------------------------------------------------------------------
//  ServiceContainer.cs — минималистичный контейнер зависимостей (DI).
//
//  Регистрируем реализации по интерфейсу в GameBootstrap, а модули запрашивают
//  их через App.Resolve<T>(). Так соблюдаются принципы SOLID: код зависит от
//  абстракций, а не от конкретных классов.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;

namespace Findoria.Core
{
    /// <summary>Абстракция контейнера зависимостей.</summary>
    public interface IServiceContainer
    {
        void Register<TContract>(TContract implementation) where TContract : class;
        void RegisterLazy<TContract>(Func<TContract> factory) where TContract : class;
        TContract Resolve<TContract>() where TContract : class;
        bool TryResolve<TContract>(out TContract implementation) where TContract : class;
        bool IsRegistered<TContract>() where TContract : class;
    }

    /// <summary>Простая реализация контейнера: singleton-инстансы и ленивые фабрики.</summary>
    public sealed class ServiceContainer : IServiceContainer
    {
        private readonly Dictionary<Type, object> _instances = new();
        private readonly Dictionary<Type, Func<object>> _factories = new();

        public void Register<TContract>(TContract implementation) where TContract : class
        {
            if (implementation == null) throw new ArgumentNullException(nameof(implementation));
            _instances[typeof(TContract)] = implementation;
        }

        public void RegisterLazy<TContract>(Func<TContract> factory) where TContract : class
        {
            if (factory == null) throw new ArgumentNullException(nameof(factory));
            _factories[typeof(TContract)] = () => factory();
        }

        public TContract Resolve<TContract>() where TContract : class
        {
            if (TryResolve<TContract>(out var impl)) return impl;
            throw new InvalidOperationException($"[DI] Сервис {typeof(TContract).Name} не зарегистрирован.");
        }

        public bool TryResolve<TContract>(out TContract implementation) where TContract : class
        {
            var type = typeof(TContract);
            if (_instances.TryGetValue(type, out var existing))
            {
                implementation = (TContract)existing;
                return true;
            }
            if (_factories.TryGetValue(type, out var factory))
            {
                var created = factory();
                _instances[type] = created;          // ленивое кэширование
                implementation = (TContract)created;
                return true;
            }
            implementation = null;
            return false;
        }

        public bool IsRegistered<TContract>() where TContract : class =>
            _instances.ContainsKey(typeof(TContract)) || _factories.ContainsKey(typeof(TContract));
    }
}
