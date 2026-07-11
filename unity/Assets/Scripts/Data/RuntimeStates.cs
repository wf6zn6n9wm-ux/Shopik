// -----------------------------------------------------------------------------
//  RuntimeStates.cs — «живые» объекты состояния, которые UI показывает игроку.
//  Это связка «определение (ScriptableObject) + текущий прогресс (PlayerData)».
// -----------------------------------------------------------------------------
using Findoria.Core;

namespace Findoria.Data
{
    /// <summary>Текущее состояние задания = определение + прогресс + флаг награды.</summary>
    public sealed class QuestState
    {
        public QuestDefinition Definition;
        public int Progress;
        public bool Claimed;

        public string Id => Definition.Id;
        public int Target => Definition.Target;
        public bool Completed => Progress >= Target;
        public float Normalized => Target <= 0 ? 0f : UnityEngine.Mathf.Clamp01((float)Progress / Target);
    }

    /// <summary>Текущее состояние достижения.</summary>
    public sealed class AchievementState
    {
        public AchievementDefinition Definition;
        public int Progress;
        public bool Unlocked;
        public bool Claimed;

        public string Id => Definition.Id;
        public int Target => Definition.Target;
        public float Normalized => Target <= 0 ? 0f : UnityEngine.Mathf.Clamp01((float)Progress / Target);
    }

    /// <summary>Одна ячейка календаря ежедневных наград.</summary>
    public struct DailyRewardEntry
    {
        public int Day;
        public Reward Reward;
        public bool Claimed;
        public bool IsToday;
    }
}
