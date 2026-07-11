// -----------------------------------------------------------------------------
//  BoosterService.cs — инвентарь бустеров (по типу -> количество).
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Economy
{
    public sealed class BoosterService : IBoosterService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private PlayerData D => _save.Data;

        public BoosterService(ISaveService save, EventBus bus)
        {
            _save = save;
            _bus = bus;
        }

        public int GetCount(BoosterType type) => D.Boosters.Get(type.ToString());

        public void Add(BoosterType type, int amount)
        {
            if (amount == 0) return;
            D.Boosters.Add(type.ToString(), amount);
            _save.Save();
            _bus.Publish(new BoosterCountChangedEvent(type, GetCount(type)));
        }

        public bool TryConsume(BoosterType type)
        {
            int count = GetCount(type);
            if (count <= 0) return false;
            D.Boosters.Set(type.ToString(), count - 1);
            _save.Save();
            _bus.Publish(new BoosterCountChangedEvent(type, count - 1));
            return true;
        }
    }
}
