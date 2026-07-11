// -----------------------------------------------------------------------------
//  ProgressService.cs — прогресс по уровням: звёзды, лучшее время, разблокировка.
//  Первый уровень открыт всегда; завершение уровня открывает следующий по порядку.
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using Findoria.Services;

namespace Findoria.Progression
{
    public sealed class ProgressService : IProgressService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly LevelProvider _levels;
        private PlayerData D => _save.Data;

        public ProgressService(ISaveService save, EventBus bus, LevelProvider levels)
        {
            _save = save;
            _bus = bus;
            _levels = levels;
        }

        public int TotalStars
        {
            get
            {
                int sum = 0;
                foreach (var e in D.LevelProgress) sum += e.Stars;
                return sum;
            }
        }

        public bool IsUnlocked(string levelId)
        {
            // Первый уровень в сквозном порядке открыт по умолчанию.
            if (_levels.Ordered.Count > 0 && _levels.Ordered[0].Id == levelId) return true;
            var entry = D.FindLevel(levelId);
            return entry != null && entry.Unlocked;
        }

        public int GetStars(string levelId) => D.FindLevel(levelId)?.Stars ?? 0;

        public float GetBestTime(string levelId)
        {
            var e = D.FindLevel(levelId);
            return e != null ? e.BestTime : 0f;
        }

        public string GetNextLevelId(string levelId) => _levels.GetNext(levelId)?.Id;

        public void RecordResult(string levelId, int stars, float time)
        {
            var entry = D.FindLevel(levelId);
            if (entry == null)
            {
                entry = new LevelProgressEntry { LevelId = levelId, Unlocked = true };
                D.LevelProgress.Add(entry);
            }

            entry.Completed = true;
            entry.Unlocked = true;
            if (stars > entry.Stars) entry.Stars = stars;
            if (entry.BestTime <= 0f || time < entry.BestTime) entry.BestTime = time;

            // Открыть следующий уровень.
            var nextId = GetNextLevelId(levelId);
            if (!string.IsNullOrEmpty(nextId))
            {
                var next = D.FindLevel(nextId);
                if (next == null)
                {
                    next = new LevelProgressEntry { LevelId = nextId, Unlocked = true };
                    D.LevelProgress.Add(next);
                    _bus.Publish(new LevelUnlockedEvent(nextId));
                }
                else if (!next.Unlocked)
                {
                    next.Unlocked = true;
                    _bus.Publish(new LevelUnlockedEvent(nextId));
                }
            }

            _save.Save();
        }
    }
}
