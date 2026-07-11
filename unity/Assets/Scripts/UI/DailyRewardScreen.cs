// -----------------------------------------------------------------------------
//  DailyRewardScreen.cs — экран ежедневных наград.
//
//  Строит календарь серии (обычно 7 дней) из IDailyRewardService.Calendar.
//  Кнопка «Забрать» вызывает TryClaimToday; забранные дни отмечаются и
//  становятся неактивными; полученная награда проигрывает анимацию.
// -----------------------------------------------------------------------------
using System.Collections;
using Findoria.Core;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class DailyRewardScreen : BaseScreen
    {
        [Header("Календарь")]
        [SerializeField] private Transform _content;
        [Tooltip("Префаб ячейки дня с компонентом DailyDayView. Назначается в инспекторе.")]
        [SerializeField] private DailyDayView _dayPrefab;

        [Header("Управление")]
        [SerializeField] private Button _claimButton;
        [SerializeField] private Button _closeButton;
        [SerializeField] private TextMeshProUGUI _statusLabel;

        protected override void Awake()
        {
            base.Awake();
            if (_claimButton) _claimButton.onClick.AddListener(OnClaim);
            if (_closeButton) _closeButton.onClick.AddListener(() =>
            {
                if (App.IsReady) App.Resolve<INavigation>().Back();
            });
        }

        protected override void OnShow() => Refresh();

        /// <summary>Пересобрать календарь и обновить состояние кнопки.</summary>
        public void Refresh()
        {
            if (!App.IsReady || _content == null || _dayPrefab == null) return;
            if (!App.Services.TryResolve<IDailyRewardService>(out var daily)) return;

            for (int i = _content.childCount - 1; i >= 0; i--)
                Destroy(_content.GetChild(i).gameObject);

            foreach (var entry in daily.Calendar)
            {
                var view = Instantiate(_dayPrefab, _content);
                view.Render(entry.Day, DailyRewardScreen.Describe(entry.Reward), entry.Claimed, entry.IsToday);
            }

            if (_claimButton) _claimButton.interactable = daily.CanClaimToday;
            if (_statusLabel)
                _statusLabel.text = daily.CanClaimToday ? "Награда доступна!" : "Возвращайтесь завтра";
        }

        private void OnClaim()
        {
            if (!App.IsReady || !App.Services.TryResolve<IDailyRewardService>(out var daily)) return;

            if (daily.TryClaimToday(out var reward))
            {
                // Награда выдаётся сервисом; здесь только визуальная реакция.
                App.Resolve<INavigation>().Toast($"Получено: {Describe(reward)}");
                if (isActiveAndEnabled) StartCoroutine(CelebrateRoutine());
            }
            Refresh();
        }

        // Небольшая «пульсация» кнопки как подтверждение получения.
        private IEnumerator CelebrateRoutine()
        {
            if (_claimButton == null) yield break;
            var tr = _claimButton.transform;
            float t = 0f;
            while (t < 0.3f)
            {
                t += Time.unscaledDeltaTime;
                tr.localScale = Vector3.one * (1f + 0.15f * Mathf.Sin(t / 0.3f * Mathf.PI));
                yield return null;
            }
            tr.localScale = Vector3.one;
        }

        /// <summary>Человекочитаемое описание награды (DRY-хелпер для UI наград).</summary>
        public static string Describe(Reward reward)
        {
            return reward.Kind switch
            {
                RewardKind.Coins => $"{reward.Amount} монет",
                RewardKind.Gems => $"{reward.Amount} кристаллов",
                RewardKind.Xp => $"{reward.Amount} XP",
                RewardKind.Life => $"{reward.Amount} жизнь",
                RewardKind.Booster => $"{reward.BoosterType} ×{reward.Amount}",
                RewardKind.RemoveAds => "Без рекламы",
                _ => reward.ToString()
            };
        }
    }

    /// <summary>Ячейка одного дня календаря. Виджеты связываются в инспекторе.</summary>
    public sealed class DailyDayView : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI _dayLabel;
        [SerializeField] private TextMeshProUGUI _rewardLabel;
        [SerializeField] private GameObject _claimedOverlay;   // «галочка» на забранном дне
        [SerializeField] private GameObject _todayHighlight;   // подсветка текущего дня

        public void Render(int day, string rewardText, bool claimed, bool isToday)
        {
            if (_dayLabel) _dayLabel.text = $"День {day + 1}";
            if (_rewardLabel) _rewardLabel.text = rewardText;
            if (_claimedOverlay) _claimedOverlay.SetActive(claimed);
            if (_todayHighlight) _todayHighlight.SetActive(isToday && !claimed);
        }
    }
}
