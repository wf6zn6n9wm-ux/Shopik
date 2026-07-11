// -----------------------------------------------------------------------------
//  AchievementService.cs — накопительные достижения за всё время игры.
//  Прогресс монотонно растёт (берём максимум из уже накопленного и нового
//  тотального значения). При достижении цели достижение «разблокируется», а
//  награду игрок забирает отдельно (TryClaim). Всё хранится в PlayerData.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using Findoria.Economy;

namespace Findoria.Progression
{
    public sealed class AchievementService : IAchievementService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly GameCatalog _catalog;
        private readonly IRewardService _rewards;

        private PlayerData D => _save.Data;

        public AchievementService(ISaveService save, EventBus bus, GameCatalog catalog, IRewardService rewards)
        {
            _save = save;
            _bus = bus;
            _catalog = catalog;
            _rewards = rewards;
        }

        public System.Threading.Tasks.Task InitializeAsync() => System.Threading.Tasks.Task.CompletedTask;

        // ------------------------------------------------------------- Чтение ------

        public IReadOnlyList<AchievementState> All
        {
            get
            {
                var list = new List<AchievementState>();
                var defs = _catalog?.Achievements;
                if (defs == null || D == null) return list;

                foreach (var def in defs)
                {
                    if (def == null || string.IsNullOrEmpty(def.Id)) continue;
                    list.Add(new AchievementState
                    {
                        Definition = def,
                        Progress = D.AchievementProgress.Get(def.Id),
                        Unlocked = D.UnlockedAchievements.Contains(def.Id),
                        Claimed = D.ClaimedAchievements.Contains(def.Id)
                    });
                }
                return list;
            }
        }

        // ------------------------------------------------------------- Прогресс ----

        public void Report(AchievementMetric metric, int totalValue)
        {
            var defs = _catalog?.Achievements;
            if (defs == null || D == null) return;

            bool changed = false;
            List<string> unlockedNow = null;

            foreach (var def in defs)
            {
                if (def == null || string.IsNullOrEmpty(def.Id) || def.Metric != metric) continue;

                // Прогресс — тотальный, поэтому только не уменьшаем.
                int current = D.AchievementProgress.Get(def.Id);
                int updated = Mathf.Max(current, totalValue);
                if (updated != current)
                {
                    D.AchievementProgress.Set(def.Id, updated);
                    changed = true;
                }

                if (updated >= def.Target && !D.UnlockedAchievements.Contains(def.Id))
                {
                    D.UnlockedAchievements.Add(def.Id);
                    changed = true;
                    (unlockedNow ??= new List<string>()).Add(def.Id);
                }
            }

            if (!changed) return;
            _save.Save();
            if (unlockedNow != null)
                foreach (var id in unlockedNow) _bus.Publish(new AchievementUnlockedEvent(id));
        }

        // -------------------------------------------------------------- Награда ----

        public bool TryClaim(string achievementId, out Reward reward)
        {
            reward = default;
            if (string.IsNullOrEmpty(achievementId) || D == null) return false;
            if (!D.UnlockedAchievements.Contains(achievementId)) return false;
            if (D.ClaimedAchievements.Contains(achievementId)) return false;

            var def = FindDefinition(achievementId);
            if (def == null) return false;

            D.ClaimedAchievements.Add(achievementId);
            _rewards.Grant(def.Reward);
            _save.Save();
            reward = def.Reward;
            return true;
        }

        private AchievementDefinition FindDefinition(string id)
        {
            var defs = _catalog?.Achievements;
            if (defs == null) return null;
            foreach (var def in defs)
                if (def != null && def.Id == id) return def;
            return null;
        }
    }
}
