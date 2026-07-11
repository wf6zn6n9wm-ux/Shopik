// -----------------------------------------------------------------------------
//  LivesService.cs — жизни с восстановлением по таймеру.
//  Одна жизнь регенерируется каждые GameConfig.LifeRegenMinutes. Время потери
//  запоминается в PlayerData (переживает перезапуск игры). Tick вызывает Bootstrap.
// -----------------------------------------------------------------------------
using System;
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Economy
{
    public sealed class LivesService : ILivesService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly GameConfig _config;
        private PlayerData D => _save.Data;
        private float _publishTimer;

        public LivesService(ISaveService save, EventBus bus, GameConfig config)
        {
            _save = save;
            _bus = bus;
            _config = config;
            CatchUpRegen();
        }

        public int Current => D.Lives;
        public int Max => D.MaxLives;
        public bool HasLife => D.Lives > 0;

        private long RegenSeconds => (long)_config.LifeRegenMinutes * 60;

        public float SecondsToNextLife
        {
            get
            {
                if (D.Lives >= D.MaxLives) return 0f;
                long elapsed = NowUnix() - D.LastLifeLostUnix;
                long rem = RegenSeconds - (elapsed % RegenSeconds);
                return Mathf.Max(0, rem);
            }
        }

        public bool TryConsume()
        {
            if (!HasLife) return false;
            if (D.Lives == D.MaxLives) D.LastLifeLostUnix = NowUnix(); // запускаем таймер с полного
            D.Lives--;
            _save.Save();
            Publish();
            return true;
        }

        public void Add(int amount)
        {
            if (amount <= 0) return;
            D.Lives = Mathf.Min(D.MaxLives, D.Lives + amount);
            _save.Save();
            Publish();
        }

        public void RefillFull()
        {
            D.Lives = D.MaxLives;
            _save.Save();
            Publish();
        }

        public void Tick(float dt)
        {
            if (D.Lives < D.MaxLives) CatchUpRegen();

            // Периодически шлём событие, чтобы UI обновлял обратный отсчёт.
            _publishTimer += dt;
            if (_publishTimer >= 1f)
            {
                _publishTimer = 0f;
                Publish();
            }
        }

        /// <summary>Начисляет жизни, накопившиеся за прошедшее реальное время.</summary>
        private void CatchUpRegen()
        {
            if (D.Lives >= D.MaxLives) return;
            long elapsed = NowUnix() - D.LastLifeLostUnix;
            if (elapsed <= 0) return;

            int gained = (int)(elapsed / RegenSeconds);
            if (gained <= 0) return;

            D.Lives = Mathf.Min(D.MaxLives, D.Lives + gained);
            // Сдвигаем «якорь» таймера на отработанные интервалы.
            D.LastLifeLostUnix += gained * RegenSeconds;
            if (D.Lives >= D.MaxLives) D.LastLifeLostUnix = NowUnix();
            _save.Save();
        }

        private void Publish() => _bus.Publish(new LivesChangedEvent(D.Lives, D.MaxLives, SecondsToNextLife));
        private static long NowUnix() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }
}
