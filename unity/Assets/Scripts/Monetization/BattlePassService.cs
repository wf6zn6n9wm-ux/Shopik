// -----------------------------------------------------------------------------
//  BattlePassService.cs — небольшой ОПЦИОНАЛЬНЫЙ сервис боевого пропуска.
//
//  Держит владение пропуском и текущий тир (оба поля уже есть в PlayerData),
//  выдаёт награды по тирам из внутренней таблицы. Это компактная заготовка:
//  таблица наград зашита в код, а множество «уже забранных тиров» хранится лишь
//  в памяти (см. пометку PROD ниже) — в бою его следует персистить в PlayerData.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Monetization
{
    public sealed class BattlePassService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly Findoria.Economy.IRewardService _rewards;

        private PlayerData D => _save.Data;

        // Заглушечная таблица наград по тирам (индекс = номер тира).
        // В бою это переехало бы в GameCatalog/ScriptableObject.
        private static readonly Reward[] TierRewards =
        {
            Reward.Coins(100),
            Reward.Gems(3),
            Reward.Booster(BoosterType.Hint, 2),
            Reward.Coins(300),
            Reward.Gems(10),
        };

        // PROD: PlayerData не содержит поля под забранные тиры, поэтому храним их
        // только в памяти (после перезапуска можно забрать повторно). В продакшене
        // добавьте, напр., List<int> ClaimedBattlePassTiers в PlayerData и пишите туда.
        private readonly HashSet<int> _claimedTiers = new();

        public BattlePassService(ISaveService save, EventBus bus,
                                 Findoria.Economy.IRewardService rewards)
        {
            _save = save;
            _bus = bus;
            _rewards = rewards;
        }

        public bool IsOwned => D.BattlePassOwned;
        public int Tier => D.BattlePassTier;

        /// <summary>Продвинуть прогресс пропуска на несколько тиров.</summary>
        public void AddProgress(int tiers)
        {
            if (tiers <= 0) return;
            D.BattlePassTier += tiers;
            _save.Save();
        }

        /// <summary>Разблокировать (купить) боевой пропуск.</summary>
        public void Unlock()
        {
            if (D.BattlePassOwned) return;
            D.BattlePassOwned = true;
            _save.Save();
        }

        /// <summary>
        /// Забрать награду за тир. Выдаём, только если пропуск куплен, тир достигнут
        /// и ещё не был забран. Возвращает true и награду через out при успехе.
        /// </summary>
        public bool TryClaimTier(int tier, out Reward reward)
        {
            reward = default;
            if (!IsOwned) return false;                              // пропуск не куплен
            if (tier < 0 || tier >= TierRewards.Length) return false; // нет такого тира в таблице
            if (tier > D.BattlePassTier) return false;               // тир ещё не достигнут
            if (!_claimedTiers.Add(tier)) return false;              // уже забран (Add == false)

            reward = TierRewards[tier];
            _rewards.Grant(reward);
            return true;
        }
    }
}
