// -----------------------------------------------------------------------------
//  WalletService.cs — монеты и кристаллы. Единственный владелец баланса.
//  Любое изменение публикует CurrencyChangedEvent, чтобы UI обновился сам.
// -----------------------------------------------------------------------------
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Economy
{
    public sealed class WalletService : IWalletService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private PlayerData D => _save.Data;

        public WalletService(ISaveService save, EventBus bus)
        {
            _save = save;
            _bus = bus;
        }

        public int Coins => D.Coins;
        public int Gems => D.Gems;

        public bool CanSpend(CurrencyType type, int amount) =>
            amount >= 0 && Balance(type) >= amount;

        public void Add(CurrencyType type, int amount)
        {
            if (amount == 0) return;
            SetBalance(type, Mathf.Max(0, Balance(type) + amount));
            _save.Save();
            _bus.Publish(new CurrencyChangedEvent(type, Balance(type), amount));
        }

        public bool TrySpend(CurrencyType type, int amount)
        {
            if (!CanSpend(type, amount)) return false;
            SetBalance(type, Balance(type) - amount);
            _save.Save();
            _bus.Publish(new CurrencyChangedEvent(type, Balance(type), -amount));
            return true;
        }

        private int Balance(CurrencyType t) => t == CurrencyType.Coins ? D.Coins : D.Gems;

        private void SetBalance(CurrencyType t, int v)
        {
            if (t == CurrencyType.Coins) D.Coins = v; else D.Gems = v;
        }
    }
}
