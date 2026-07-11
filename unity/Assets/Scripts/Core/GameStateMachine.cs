// -----------------------------------------------------------------------------
//  GameStateMachine.cs — лёгкая машина глобальных состояний игры.
//  Не содержит переходной логики экранов (это делает UIManager/GameFlow), а лишь
//  фиксирует текущее состояние и оповещает подписчиков (аналитика, музыка, пауза).
// -----------------------------------------------------------------------------
using Findoria.Core.Events;

namespace Findoria.Core
{
    public sealed class GameStateMachine
    {
        private readonly EventBus _bus;
        public GameState Current { get; private set; } = GameState.Boot;

        public GameStateMachine(EventBus bus) => _bus = bus;

        public void Set(GameState next)
        {
            if (next == Current) return;
            var prev = Current;
            Current = next;
            _bus.Publish(new GameStateChangedEvent(prev, next));
        }

        public bool Is(GameState state) => Current == state;
    }
}
