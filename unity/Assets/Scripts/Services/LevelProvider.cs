// -----------------------------------------------------------------------------
//  LevelProvider.cs — источник контента уровней из GameCatalog.
//  Может быть дополнен уровнями из JSON (RuntimeLevelLoader) без пересборки.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using System.Threading.Tasks;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Services
{
    public sealed class LevelProvider : ILevelProvider
    {
        private readonly GameCatalog _catalog;
        private readonly List<WorldData> _worlds = new();
        private readonly Dictionary<string, LevelData> _levelIndex = new();
        private readonly List<LevelData> _ordered = new();   // сквозной порядок для прогрессии

        public LevelProvider(GameCatalog catalog)
        {
            _catalog = catalog;
        }

        public IReadOnlyList<WorldData> Worlds => _worlds;

        public Task InitializeAsync()
        {
            _worlds.Clear();
            _levelIndex.Clear();
            _ordered.Clear();

            foreach (var world in _catalog.Worlds)
            {
                if (world == null) continue;
                _worlds.Add(world);
                foreach (var level in world.Levels)
                {
                    if (level == null || string.IsNullOrEmpty(level.Id)) continue;
                    if (_levelIndex.ContainsKey(level.Id)) continue;
                    _levelIndex[level.Id] = level;
                    _ordered.Add(level);
                }
            }
            return Task.CompletedTask;
        }

        /// <summary>Добавить уровни, загруженные в рантайме из JSON (fallback-контент).</summary>
        public void AddRuntimeLevels(IEnumerable<LevelData> levels)
        {
            foreach (var level in levels)
            {
                if (level == null || _levelIndex.ContainsKey(level.Id)) continue;
                _levelIndex[level.Id] = level;
                _ordered.Add(level);
            }
        }

        public LevelData GetLevel(string levelId) =>
            !string.IsNullOrEmpty(levelId) && _levelIndex.TryGetValue(levelId, out var l) ? l : null;

        public IReadOnlyList<LevelData> GetLevelsForWorld(string worldId)
        {
            var result = new List<LevelData>();
            var world = _worlds.Find(w => w.Id == worldId);
            if (world != null) result.AddRange(world.Levels);
            return result;
        }

        /// <summary>Сквозной список всех уровней в порядке прохождения.</summary>
        public IReadOnlyList<LevelData> Ordered => _ordered;

        /// <summary>Следующий по порядку уровень (или null, если это последний).</summary>
        public LevelData GetNext(string levelId)
        {
            int idx = _ordered.FindIndex(l => l.Id == levelId);
            return idx >= 0 && idx + 1 < _ordered.Count ? _ordered[idx + 1] : null;
        }
    }
}
