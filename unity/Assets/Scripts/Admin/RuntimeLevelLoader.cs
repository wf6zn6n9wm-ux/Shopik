// -----------------------------------------------------------------------------
//  RuntimeLevelLoader.cs — рантайм-загрузка уровней из JSON без пересборки.
//
//  Резервный источник контента: уровни можно грузить прямо из JSON-текста
//  (например, TextAsset в Resources или скачанный файл), не создавая
//  ScriptableObject-ассеты и не пересобирая проект. Парсит LevelPackDto через
//  UnityEngine.JsonUtility и отдаёт готовый список LevelData через конвертер.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Data;

namespace Findoria.Admin
{
    /// <summary>
    /// Загрузчик пакета уровней из JSON. Все методы защищены от пустого/битого
    /// ввода и логируют ошибку через Debug.LogError вместо выброса исключений.
    /// </summary>
    public static class RuntimeLevelLoader
    {
        /// <summary>Путь по умолчанию к TextAsset с уровнями внутри Resources.</summary>
        public const string DefaultResourcePath = "Levels/levels";

        /// <summary>
        /// Разбирает JSON-строку в <see cref="LevelPackDto"/>.
        /// Возвращает null при пустом вводе или ошибке разбора.
        /// </summary>
        public static LevelPackDto ParsePack(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                Debug.LogError("[RuntimeLevelLoader] Пустая JSON-строка — нечего загружать.");
                return null;
            }

            try
            {
                var pack = JsonUtility.FromJson<LevelPackDto>(json);
                if (pack == null)
                {
                    Debug.LogError("[RuntimeLevelLoader] JsonUtility вернул null — проверьте формат JSON.");
                    return null;
                }
                return pack;
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[RuntimeLevelLoader] Ошибка разбора JSON уровней: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Загружает уровни из сырой JSON-строки и конвертирует их в
        /// список <see cref="LevelData"/>. Всегда возвращает непустой список-объект
        /// (пустой при ошибке).
        /// </summary>
        public static List<LevelData> LoadFromJson(string json)
        {
            var pack = ParsePack(json);
            return pack != null
                ? LevelDtoConverter.ToLevelData(pack)
                : new List<LevelData>();
        }

        /// <summary>
        /// Загружает уровни из TextAsset в Resources (по умолчанию
        /// <see cref="DefaultResourcePath"/>). Удобно как встроенный fallback-контент.
        /// </summary>
        public static List<LevelData> LoadFromResources(string resourcePath = DefaultResourcePath)
        {
            if (string.IsNullOrEmpty(resourcePath))
            {
                Debug.LogError("[RuntimeLevelLoader] Не задан путь Resources.");
                return new List<LevelData>();
            }

            var textAsset = Resources.Load<TextAsset>(resourcePath);
            if (textAsset == null)
            {
                Debug.LogError($"[RuntimeLevelLoader] TextAsset не найден в Resources: '{resourcePath}'.");
                return new List<LevelData>();
            }

            return LoadFromJson(textAsset.text);
        }
    }
}
