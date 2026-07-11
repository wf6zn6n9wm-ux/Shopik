// -----------------------------------------------------------------------------
//  QuestService.cs — ежедневные и еженедельные задания с детерминированной
//  ротацией. Активный набор заданий и «ключи периодов» хранятся прямо внутри
//  PlayerData.Quests: обычные записи — прогресс по выбранным заданиям, а две
//  специальные записи-маркера («#daily:<ключ>» и «#weekly:<ключ>») запоминают,
//  для какого дня/недели набор был собран. Так ротацию можно обнаружить без
//  добавления полей в PlayerData (Core/Data не трогаем).
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using Findoria.Economy;

namespace Findoria.Progression
{
    public sealed class QuestService : IQuestService
    {
        // Префиксы записей-маркеров периода. Обычные задания не могут иметь таких Id.
        private const string DailyMarker = "#daily:";
        private const string WeeklyMarker = "#weekly:";

        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly GameCatalog _catalog;
        private readonly IRewardService _rewards;

        private PlayerData D => _save.Data;

        public QuestService(ISaveService save, EventBus bus, GameCatalog catalog, IRewardService rewards)
        {
            _save = save;
            _bus = bus;
            _catalog = catalog;
            _rewards = rewards;
        }

        public System.Threading.Tasks.Task InitializeAsync()
        {
            RefreshIfNeeded();
            return System.Threading.Tasks.Task.CompletedTask;
        }

        // -------------------------------------------------------------- Ротация --

        public void RefreshIfNeeded()
        {
            if (D?.Quests == null) return;

            bool changed = false;
            string dailyKey = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            string weeklyKey = CurrentIsoWeekKey();

            // Ежедневный набор: пересобираем, если сменился день.
            if (StoredKey(DailyMarker) != dailyKey)
            {
                RotatePeriod(_catalog?.DailyQuestPool, DailySlots(), DailyMarker, dailyKey);
                changed = true;
            }

            // Еженедельный набор: пересобираем, если сменилась ISO-неделя.
            if (StoredKey(WeeklyMarker) != weeklyKey)
            {
                RotatePeriod(_catalog?.WeeklyQuestPool, WeeklySlots(), WeeklyMarker, weeklyKey);
                changed = true;
            }

            if (changed) _save.Save();
        }

        private int DailySlots() => _catalog != null ? _catalog.DailyQuestSlots : 0;
        private int WeeklySlots() => _catalog != null ? _catalog.WeeklyQuestSlots : 0;

        /// <summary>Пересобрать набор одного периода: убрать старые записи и маркер,
        /// выбрать новые задания и записать свежий маркер с ключом периода.</summary>
        private void RotatePeriod(List<QuestDefinition> pool, int slots, string marker, string key)
        {
            var poolIds = BuildPoolIds(pool);

            // Удаляем прежний маркер этого периода и записи прогресса выбранных ранее заданий.
            D.Quests.RemoveAll(q => q != null &&
                (q.QuestId != null && q.QuestId.StartsWith(marker, StringComparison.Ordinal) ||
                 poolIds.Contains(q.QuestId)));

            // Детерминированный выбор новых заданий под текущий ключ периода.
            foreach (var def in ChooseDeterministic(pool, slots, key))
                D.Quests.Add(new QuestSave { QuestId = def.Id, Progress = 0, Claimed = false });

            // Запоминаем, для какого ключа собран набор.
            D.Quests.Add(new QuestSave { QuestId = marker + key, Progress = 0, Claimed = false });
        }

        /// <summary>Выбрать до <paramref name="slots"/> различных заданий из пула,
        /// детерминированно по ключу периода (один и тот же ключ → тот же набор).</summary>
        private static List<QuestDefinition> ChooseDeterministic(List<QuestDefinition> pool, int slots, string key)
        {
            var result = new List<QuestDefinition>();
            if (pool == null || slots <= 0) return result;

            // Отбираем валидные и уникальные по Id определения.
            var valid = new List<QuestDefinition>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var def in pool)
                if (def != null && !string.IsNullOrEmpty(def.Id) && seen.Add(def.Id))
                    valid.Add(def);

            int take = Mathf.Clamp(slots, 0, valid.Count);
            if (take == 0) return result;

            // Частичная тасовка Фишера–Йетса с сидом от ключа периода.
            var rng = new System.Random(StableSeed(key));
            for (int i = 0; i < take; i++)
            {
                int j = rng.Next(i, valid.Count);
                (valid[i], valid[j]) = (valid[j], valid[i]);
                result.Add(valid[i]);
            }
            return result;
        }

        // ---------------------------------------------------------- Чтение набора --

        public IReadOnlyList<QuestState> ActiveQuests
        {
            get
            {
                var list = new List<QuestState>();
                if (D?.Quests == null) return list;

                foreach (var save in D.Quests)
                {
                    if (save == null || IsMarker(save.QuestId)) continue;
                    var def = FindDefinition(save.QuestId);
                    if (def == null) continue; // задание исчезло из пула — пропускаем

                    list.Add(new QuestState
                    {
                        Definition = def,
                        Progress = save.Progress,
                        Claimed = save.Claimed
                    });
                }
                return list;
            }
        }

        // ------------------------------------------------------------- Прогресс ----

        public void Report(QuestMetric metric, int amount = 1)
        {
            if (amount <= 0 || D?.Quests == null) return;

            bool changed = false;
            // Собираем события отдельно и публикуем после сохранения (согласованное состояние).
            List<QuestProgressEvent> events = null;

            foreach (var save in D.Quests)
            {
                if (save == null || save.Claimed || IsMarker(save.QuestId)) continue;
                var def = FindDefinition(save.QuestId);
                if (def == null || def.Metric != metric) continue;

                int target = def.Target;
                int updated = Mathf.Clamp(save.Progress + amount, 0, Mathf.Max(0, target));
                if (updated == save.Progress) continue;

                save.Progress = updated;
                changed = true;
                (events ??= new List<QuestProgressEvent>())
                    .Add(new QuestProgressEvent(def.Id, updated, target, updated >= target));
            }

            if (!changed) return;
            _save.Save();
            if (events != null)
                foreach (var e in events) _bus.Publish(e);
        }

        // -------------------------------------------------------------- Награда ----

        public bool TryClaim(string questId, out Reward reward)
        {
            reward = default;
            if (string.IsNullOrEmpty(questId) || D?.Quests == null) return false;

            var save = D.Quests.Find(q => q != null && q.QuestId == questId);
            if (save == null || save.Claimed) return false;

            var def = FindDefinition(questId);
            if (def == null || save.Progress < def.Target) return false;

            save.Claimed = true;
            _rewards.Grant(def.Reward);
            _save.Save();
            reward = def.Reward;
            return true;
        }

        // --------------------------------------------------------------- Утилиты ---

        private static bool IsMarker(string questId) =>
            questId != null &&
            (questId.StartsWith(DailyMarker, StringComparison.Ordinal) ||
             questId.StartsWith(WeeklyMarker, StringComparison.Ordinal));

        /// <summary>Вернуть сохранённый ключ периода из записи-маркера (или пустую строку).</summary>
        private string StoredKey(string marker)
        {
            if (D?.Quests == null) return string.Empty;
            var m = D.Quests.Find(q => q != null && q.QuestId != null &&
                                       q.QuestId.StartsWith(marker, StringComparison.Ordinal));
            return m == null ? string.Empty : m.QuestId.Substring(marker.Length);
        }

        private QuestDefinition FindDefinition(string id)
        {
            var def = FindInPool(_catalog?.DailyQuestPool, id);
            return def != null ? def : FindInPool(_catalog?.WeeklyQuestPool, id);
        }

        private static QuestDefinition FindInPool(List<QuestDefinition> pool, string id)
        {
            if (pool == null || string.IsNullOrEmpty(id)) return null;
            foreach (var def in pool)
                if (def != null && def.Id == id) return def;
            return null;
        }

        private static HashSet<string> BuildPoolIds(List<QuestDefinition> pool)
        {
            var set = new HashSet<string>(StringComparer.Ordinal);
            if (pool == null) return set;
            foreach (var def in pool)
                if (def != null && !string.IsNullOrEmpty(def.Id)) set.Add(def.Id);
            return set;
        }

        /// <summary>Стабильный (не зависящий от рантайма) 32-битный хеш строки — FNV-1a.
        /// Нужен, чтобы сид выбора был одинаковым в любых сессиях и на любой платформе.</summary>
        private static int StableSeed(string s)
        {
            unchecked
            {
                const uint offset = 2166136261;
                const uint prime = 16777619;
                uint hash = offset;
                if (s != null)
                    foreach (char c in s) { hash ^= c; hash *= prime; }
                return (int)hash;
            }
        }

        /// <summary>Ключ текущей ISO-8601 недели вида «2026-W28» (неделя относится к
        /// году своего четверга). Считаем вручную, без внешних зависимостей.</summary>
        private static string CurrentIsoWeekKey()
        {
            var date = DateTime.UtcNow.Date;
            int mondayBased = ((int)date.DayOfWeek + 6) % 7; // Пн=0 … Вс=6
            var thursday = date.AddDays(3 - mondayBased);
            int year = thursday.Year;
            var jan1 = new DateTime(year, 1, 1);
            int week = (int)Math.Floor((thursday - jan1).TotalDays / 7) + 1;
            return string.Format(CultureInfo.InvariantCulture, "{0}-W{1:D2}", year, week);
        }
    }
}
