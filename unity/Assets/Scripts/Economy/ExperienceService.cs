// -----------------------------------------------------------------------------
//  ExperienceService.cs — опыт и уровни игрока.
//  Кривая опыта задаётся в GameConfig (данные вне кода). При переходе на новый
//  уровень публикуется PlayerLeveledUpEvent.
// -----------------------------------------------------------------------------
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Economy
{
    public sealed class ExperienceService : IExperienceService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly GameConfig _config;
        private PlayerData D => _save.Data;

        public ExperienceService(ISaveService save, EventBus bus, GameConfig config)
        {
            _save = save;
            _bus = bus;
            _config = config;
        }

        public int PlayerLevel => D.PlayerLevel;
        public int TotalXp => D.TotalXp;
        public int XpIntoLevel => D.TotalXp - _config.TotalXpForLevel(D.PlayerLevel);
        public int XpForNextLevel => _config.XpForLevelStep(D.PlayerLevel);

        public void AddXp(int amount)
        {
            if (amount <= 0) return;
            D.TotalXp += amount;

            bool leveled = false;
            // Может подняться сразу на несколько уровней.
            while (D.TotalXp >= _config.TotalXpForLevel(D.PlayerLevel + 1))
            {
                D.PlayerLevel++;
                leveled = true;
                _bus.Publish(new PlayerLeveledUpEvent(D.PlayerLevel));
            }

            _save.Save();
            _bus.Publish(new XpChangedEvent(D.TotalXp, XpIntoLevel, XpForNextLevel));
            if (leveled) Debug.Log($"[XP] Новый уровень игрока: {D.PlayerLevel}");
        }
    }
}
