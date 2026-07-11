// -----------------------------------------------------------------------------
//  LocalSaveService.cs — локальное сохранение (JSON на диск) + точка расширения
//  для облака. Держит единственный экземпляр PlayerData в памяти.
//
//  Cloud Save: метод SaveCloudAsync/LoadCloudAsync оставлены как швы — сюда
//  подключается Unity Cloud Save / Google Play Games / iCloud без изменения
//  остального кода (реализация за интерфейсом ICloudBackend).
// -----------------------------------------------------------------------------
using System;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Progression
{
    /// <summary>Абстракция облачного бэкенда (подключается опционально).</summary>
    public interface ICloudBackend
    {
        bool IsAvailable { get; }
        Task<string> LoadAsync();          // вернуть JSON или null
        Task SaveAsync(string json);
    }

    /// <summary>Заглушка облака по умолчанию — «облака нет», всё работает локально.</summary>
    public sealed class NullCloudBackend : ICloudBackend
    {
        public bool IsAvailable => false;
        public Task<string> LoadAsync() => Task.FromResult<string>(null);
        public Task SaveAsync(string json) => Task.CompletedTask;
    }

    public sealed class LocalSaveService : ISaveService
    {
        private const string FileName = "player.save.json";
        private readonly ICloudBackend _cloud;
        private readonly GameConfig _config;
        private string FilePath => Path.Combine(Application.persistentDataPath, FileName);

        public PlayerData Data { get; private set; } = new();
        public event Action Saved;

        public LocalSaveService(GameConfig config, ICloudBackend cloud = null)
        {
            _config = config;
            _cloud = cloud ?? new NullCloudBackend();
        }

        public async Task InitializeAsync() => await LoadAsync();

        public async Task LoadAsync()
        {
            // 1) пробуем облако, 2) локальный файл, 3) новый профиль
            if (_cloud.IsAvailable)
            {
                try
                {
                    var cloudJson = await _cloud.LoadAsync();
                    if (!string.IsNullOrEmpty(cloudJson)) { Data = Deserialize(cloudJson); return; }
                }
                catch (Exception e) { Debug.LogWarning($"[Save] Облако недоступно: {e.Message}"); }
            }

            if (File.Exists(FilePath))
            {
                try { Data = Deserialize(File.ReadAllText(FilePath)); return; }
                catch (Exception e) { Debug.LogError($"[Save] Повреждён файл сохранения: {e.Message}"); }
            }

            Data = CreateNew();
            Save();
        }

        public void Save()
        {
            try
            {
                File.WriteAllText(FilePath, JsonUtility.ToJson(Data, prettyPrint: false));
                Saved?.Invoke();
            }
            catch (Exception e) { Debug.LogError($"[Save] Ошибка записи: {e.Message}"); }
        }

        public async Task SaveCloudAsync()
        {
            Save();
            if (_cloud.IsAvailable)
            {
                try { await _cloud.SaveAsync(JsonUtility.ToJson(Data)); }
                catch (Exception e) { Debug.LogWarning($"[Save] Не удалось выгрузить в облако: {e.Message}"); }
            }
        }

        public void ResetProgress()
        {
            Data = CreateNew();
            Save();
        }

        private PlayerData CreateNew()
        {
            var d = new PlayerData();
            if (_config != null)
            {
                d.Coins = _config.StartCoins;
                d.Gems = _config.StartGems;
                d.MaxLives = _config.MaxLives;
                d.Lives = _config.MaxLives;
            }
            return d;
        }

        private static PlayerData Deserialize(string json)
        {
            var data = JsonUtility.FromJson<PlayerData>(json);
            return data ?? new PlayerData();
        }
    }
}
