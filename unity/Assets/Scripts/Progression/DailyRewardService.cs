// -----------------------------------------------------------------------------
//  DailyRewardService.cs — календарь ежедневных наград. Игрок забирает награду
//  раз в календарные сутки (UTC); индекс дня растёт и циклически проходит по
//  таблице наград. Всё состояние — в PlayerData (DailyRewardDay, LastDailyClaimDate).
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using System.Globalization;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using Findoria.Economy;

namespace Findoria.Progression
{
    public sealed class DailyRewardService : IDailyRewardService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly GameCatalog _catalog;
        private readonly IRewardService _rewards;

        private PlayerData D => _save.Data;

        public DailyRewardService(ISaveService save, EventBus bus, GameCatalog catalog, IRewardService rewards)
        {
            _save = save;
            _bus = bus;
            _catalog = catalog;
            _rewards = rewards;
        }

        public System.Threading.Tasks.Task InitializeAsync() => System.Threading.Tasks.Task.CompletedTask;

        private List<Reward> Days => _catalog != null && _catalog.DailyRewards != null
            ? _catalog.DailyRewards.Days
            : null;

        private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        // Текущий индекс дня в календаре (зациклен по числу наград).
        public int CurrentDay
        {
            get
            {
                int count = Days?.Count ?? 0;
                return count > 0 ? Mod(D.DailyRewardDay, count) : 0;
            }
        }

        public bool CanClaimToday => D != null && D.LastDailyClaimDate != Today;

        public IReadOnlyList<DailyRewardEntry> Calendar
        {
            get
            {
                var list = new List<DailyRewardEntry>();
                var days = Days;
                if (days == null) return list;

                int today = CurrentDay;
                bool canClaim = CanClaimToday;
                for (int i = 0; i < days.Count; i++)
                {
                    list.Add(new DailyRewardEntry
                    {
                        Day = i + 1,                       // человекочитаемый номер дня
                        Reward = days[i],
                        Claimed = i < today,               // дни до текущего в этом цикле уже получены
                        IsToday = i == today && canClaim
                    });
                }
                return list;
            }
        }

        public bool TryClaimToday(out Reward reward)
        {
            reward = default;
            var days = Days;
            if (days == null || days.Count == 0) return false;
            if (!CanClaimToday) return false;

            int index = CurrentDay;
            reward = days[index];

            _rewards.Grant(reward);
            D.LastDailyClaimDate = Today;
            D.DailyRewardDay += 1;
            _save.Save();

            _bus.Publish(new DailyRewardClaimedEvent(index, reward));
            return true;
        }

        // Неотрицательный остаток (на случай отрицательных значений в сохранении).
        private static int Mod(int value, int mod)
        {
            int r = value % mod;
            return r < 0 ? r + mod : r;
        }
    }
}
