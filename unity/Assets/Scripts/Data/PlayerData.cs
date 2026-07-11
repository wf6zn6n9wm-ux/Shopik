// -----------------------------------------------------------------------------
//  PlayerData.cs — вся сохраняемая модель игрока (POCO, сериализуется в JSON).
//
//  Unity JsonUtility не умеет Dictionary, поэтому карты хранятся как списки пар
//  (см. SerializableMap). Данные полностью отделены от кода: сервисы читают/пишут
//  этот объект, а на диск его кладёт ISaveService.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;

namespace Findoria.Data
{
    [Serializable]
    public sealed class PlayerData
    {
        public int SchemaVersion = 1;

        // --- Экономика ---
        public int Coins = 250;
        public int Gems = 10;

        // --- Опыт / уровень ---
        public int TotalXp = 0;
        public int PlayerLevel = 1;

        // --- Жизни ---
        public int Lives = 5;
        public int MaxLives = 5;
        public long LastLifeLostUnix = 0;   // время потери последней жизни (для реген-таймера)

        // --- Бустеры (BoosterType -> количество) ---
        public SerializableIntMap Boosters = new();

        // --- Прогресс уровней (levelId -> результат) ---
        public List<LevelProgressEntry> LevelProgress = new();

        // --- Накопительная статистика (для достижений: TotalItemsFound, LevelsCompleted и т.п.) ---
        public SerializableIntMap Stats = new();

        // --- Мета-прогресс ---
        public int LoginStreak = 0;
        public string LastLoginDate = "";       // yyyy-MM-dd
        public int DailyRewardDay = 0;           // индекс в календаре ежедневных наград
        public string LastDailyClaimDate = "";

        public List<QuestSave> Quests = new();
        public List<string> UnlockedAchievements = new();
        public List<string> ClaimedAchievements = new();
        public SerializableIntMap AchievementProgress = new();

        // --- Монетизация ---
        public bool RemoveAds = false;
        public bool BattlePassOwned = false;
        public int BattlePassTier = 0;

        // --- Настройки ---
        public bool MusicOn = true;
        public bool SfxOn = true;
        public bool VibrationOn = true;

        /// <summary>Найти запись прогресса по уровню (или null).</summary>
        public LevelProgressEntry FindLevel(string levelId) =>
            LevelProgress.Find(e => e.LevelId == levelId);
    }

    [Serializable]
    public sealed class LevelProgressEntry
    {
        public string LevelId;
        public bool Unlocked;
        public bool Completed;
        public int Stars;
        public float BestTime;
    }

    [Serializable]
    public sealed class QuestSave
    {
        public string QuestId;
        public int Progress;
        public bool Claimed;
    }

    // -------------------------------------------------------------------------
    //  Простые сериализуемые карты (замена Dictionary для JsonUtility).
    // -------------------------------------------------------------------------

    [Serializable]
    public sealed class SerializableIntMap
    {
        [Serializable] public struct Pair { public string Key; public int Value; }
        public List<Pair> Entries = new();

        public int Get(string key)
        {
            for (int i = 0; i < Entries.Count; i++)
                if (Entries[i].Key == key) return Entries[i].Value;
            return 0;
        }

        public void Set(string key, int value)
        {
            for (int i = 0; i < Entries.Count; i++)
                if (Entries[i].Key == key) { var p = Entries[i]; p.Value = value; Entries[i] = p; return; }
            Entries.Add(new Pair { Key = key, Value = value });
        }

        public void Add(string key, int delta) => Set(key, Get(key) + delta);
    }
}
