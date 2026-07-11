// -----------------------------------------------------------------------------
//  LevelImportDtos.cs — DTO для импорта уровней из JSON.
//  Плоские сериализуемые классы под JsonUtility. Админ-инструмент (Editor)
//  превращает их в ScriptableObject-ассеты, а рантайм может грузить их напрямую
//  из Resources/StreamingAssets как fallback без пересборки.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;

namespace Findoria.Data
{
    [Serializable]
    public sealed class LevelPackDto
    {
        public List<LevelDto> levels = new();
    }

    [Serializable]
    public sealed class LevelDto
    {
        public string id;
        public string title;
        public string worldId;
        public string description;
        public string background;      // адрес Addressables
        public string thumbnail;
        public string difficulty;      // "Easy" | "Normal" | "Hard" | "Expert"
        public float timeLimit;
        public int mistakesAllowed;
        public int rewardCoins;
        public int rewardXp;
        public float threeStarTime;
        public float twoStarTime;
        public List<ItemPlacementDto> items = new();
    }

    [Serializable]
    public sealed class ItemPlacementDto
    {
        public string itemId;
        public float x;
        public float y;
        public float radius;
        public float rotation;
        public int count;              // для автогенерации требований
    }
}
