// -----------------------------------------------------------------------------
//  LevelData.cs — ScriptableObject одного уровня.
//  Содержит большую иллюстрацию (по адресу Addressables), список предметов с
//  координатами, сложность и награды. Никакой логики — только данные.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;

namespace Findoria.Data
{
    /// <summary>Размещение одного предмета на иллюстрации (нормализованные координаты 0..1).</summary>
    [Serializable]
    public struct ItemPlacement
    {
        public string ItemId;        // ссылка на HiddenItemData.Id
        [Range(0f, 1f)] public float X;
        [Range(0f, 1f)] public float Y;
        [Range(0.01f, 0.2f)] public float Radius;   // радиус зоны попадания, доля ширины
        public float Rotation;        // поворот спрайта, градусы

        public Vector2 Normalized => new(X, Y);
    }

    /// <summary>Требование по предмету: сколько экземпляров нужно найти.</summary>
    [Serializable]
    public struct ItemRequirement
    {
        public string ItemId;
        public int Count;
    }

    [CreateAssetMenu(fileName = "Level_", menuName = "Findoria/Level", order = 10)]
    public sealed class LevelData : ScriptableObject
    {
        [Header("Идентификация")]
        public string Id = "level_001";
        public string Title = "Новый уровень";
        public string WorldId = "world_meadow";
        [TextArea] public string Description;

        [Header("Графика")]
        public AssetRef Background;      // большая иллюстрация сцены (Addressable)
        public AssetRef Thumbnail;       // превью для карты уровней

        [Header("Правила")]
        public Difficulty Difficulty = Difficulty.Normal;
        [Tooltip("0 = без ограничения времени")]
        public float TimeLimitSeconds = 120f;
        [Tooltip("Сколько неверных нажатий (жизней уровня) допустимо")]
        public int MistakesAllowed = 3;

        [Header("Предметы")]
        public List<ItemRequirement> RequiredItems = new();
        public List<ItemPlacement> Placements = new();

        [Header("Награды и звёзды")]
        public int RewardCoins = 100;
        public int RewardXp = 50;
        public List<Reward> BonusRewards = new();
        [Tooltip("Порог времени для 3★ и 2★ (сек). Меньше = быстрее = больше звёзд")]
        public float ThreeStarTime = 60f;
        public float TwoStarTime = 100f;

        /// <summary>Всего предметов для поиска (сумма требований).</summary>
        public int TotalItems
        {
            get
            {
                int sum = 0;
                for (int i = 0; i < RequiredItems.Count; i++) sum += Mathf.Max(1, RequiredItems[i].Count);
                return sum;
            }
        }

        /// <summary>Сколько звёзд за прохождение за указанное время.</summary>
        public int EvaluateStars(float timeSeconds)
        {
            if (TimeLimitSeconds <= 0f && ThreeStarTime <= 0f) return 3;
            if (timeSeconds <= ThreeStarTime) return 3;
            if (timeSeconds <= TwoStarTime) return 2;
            return 1;
        }
    }
}
