// -----------------------------------------------------------------------------
//  RewardService.cs — единая точка выдачи наград (Reward).
//  Задания, достижения, ежедневные награды, реклама и магазин зовут Grant(...),
//  а он раскладывает награду по нужным сервисам (DRY — логика начисления одна).
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using Findoria.Core;

namespace Findoria.Economy
{
    public interface IRewardService
    {
        void Grant(Reward reward);
        void GrantAll(IEnumerable<Reward> rewards);
    }

    public sealed class RewardService : IRewardService
    {
        private readonly IWalletService _wallet;
        private readonly IExperienceService _xp;
        private readonly ILivesService _lives;
        private readonly IBoosterService _boosters;

        public RewardService(IWalletService wallet, IExperienceService xp,
                             ILivesService lives, IBoosterService boosters)
        {
            _wallet = wallet;
            _xp = xp;
            _lives = lives;
            _boosters = boosters;
        }

        public void Grant(Reward reward)
        {
            switch (reward.Kind)
            {
                case RewardKind.Coins:   _wallet.Add(CurrencyType.Coins, reward.Amount); break;
                case RewardKind.Gems:    _wallet.Add(CurrencyType.Gems, reward.Amount); break;
                case RewardKind.Xp:      _xp.AddXp(reward.Amount); break;
                case RewardKind.Life:    _lives.Add(reward.Amount); break;
                case RewardKind.Booster: _boosters.Add(reward.BoosterType, reward.Amount); break;
                case RewardKind.RemoveAds: /* обрабатывается в PurchaseService */ break;
            }
        }

        public void GrantAll(IEnumerable<Reward> rewards)
        {
            if (rewards == null) return;
            foreach (var r in rewards) Grant(r);
        }
    }
}
