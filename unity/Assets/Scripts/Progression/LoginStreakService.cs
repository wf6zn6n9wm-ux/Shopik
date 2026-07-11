// -----------------------------------------------------------------------------
//  LoginStreakService.cs — серия ежедневных заходов. Заход в тот же день ничего
//  не меняет; заход на следующий календарный день (UTC) продлевает серию; любой
//  пропуск сбрасывает её на 1. Состояние — в PlayerData (LoginStreak, LastLoginDate).
// -----------------------------------------------------------------------------
using System;
using System.Globalization;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Progression
{
    public sealed class LoginStreakService : ILoginStreakService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;

        private PlayerData D => _save.Data;

        public LoginStreakService(ISaveService save, EventBus bus)
        {
            _save = save;
            _bus = bus;
        }

        public int StreakDays => D != null ? D.LoginStreak : 0;

        public System.Threading.Tasks.Task InitializeAsync()
        {
            RegisterLogin();
            return System.Threading.Tasks.Task.CompletedTask;
        }

        public void RegisterLogin()
        {
            if (D == null) return;

            var todayDate = DateTime.UtcNow.Date;
            string today = todayDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (D.LastLoginDate == today) return; // уже отметились сегодня

            string yesterday = todayDate.AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            D.LoginStreak = D.LastLoginDate == yesterday ? D.LoginStreak + 1 : 1;
            D.LastLoginDate = today;

            _save.Save();
            _bus.Publish(new LoginStreakChangedEvent(D.LoginStreak));
        }
    }
}
