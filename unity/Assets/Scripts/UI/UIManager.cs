// -----------------------------------------------------------------------------
//  UIManager.cs — реализация навигации по экранам (INavigation).
//
//  Держит список экранов, индексирует их по ScreenId, ведёт историю переходов
//  (стек для кнопки «Назад») и умеет показывать всплывающие тосты. Регистрирует
//  себя в контейнере как INavigation, чтобы остальной код зависел от абстракции.
// -----------------------------------------------------------------------------
using System.Collections;
using System.Collections.Generic;
using Findoria.Core;
using Findoria.Core.Events;
using TMPro;
using UnityEngine;

namespace Findoria.UI
{
    /// <summary>Единая точка управления экранами и тостами.</summary>
    public sealed class UIManager : MonoBehaviour, INavigation
    {
        [Header("Экраны (заполняются в инспекторе Unity)")]
        [SerializeField] private List<BaseScreen> _screens = new();
        [Tooltip("Экран, показываемый на старте.")]
        [SerializeField] private ScreenId _defaultScreen = ScreenId.MainMenu;

        [Header("Тост (всплывающее сообщение)")]
        [SerializeField] private CanvasGroup _toastGroup;         // контейнер тоста
        [SerializeField] private TextMeshProUGUI _toastLabel;     // текст тоста
        [SerializeField] private float _toastDuration = 2f;

        // Индекс экранов и история переходов.
        private readonly Dictionary<ScreenId, BaseScreen> _map = new();
        private readonly Stack<ScreenId> _history = new();
        private ScreenId _current = ScreenId.Loading;
        private Coroutine _toastRoutine;

        public ScreenId Current => _current;

        private void Awake()
        {
            // Строим индекс ScreenId -> экран.
            foreach (var screen in _screens)
            {
                if (screen == null || _map.ContainsKey(screen.Id)) continue;
                _map[screen.Id] = screen;
            }

            // Прячем все экраны мгновенно, чтобы стартовать с чистого листа.
            foreach (var kv in _map) kv.Value.HideInstant();
            if (_toastGroup != null) _toastGroup.alpha = 0f;

            // Если сервисы уже готовы — регистрируемся сразу. Иначе Bootstrap
            // вызовет Register() вручную после инициализации контейнера.
            if (App.IsReady) Register();
        }

        private void Start()
        {
            // Показываем стартовый экран (после того как всё спрятано в Awake).
            Show(_defaultScreen);
        }

        /// <summary>Регистрация в контейнере. Может быть вызвана Bootstrap'ом явно.</summary>
        public void Register()
        {
            if (!App.IsReady) return;
            if (!App.Services.IsRegistered<INavigation>())
                App.Services.Register<INavigation>(this);
        }

        // ---- INavigation -----------------------------------------------------

        /// <summary>Показать экран: скрыть текущий, показать целевой, запушить в историю.</summary>
        public void Show(ScreenId screen)
        {
            ShowInternal(screen, pushHistory: true);
        }

        /// <summary>Вернуться на предыдущий экран из истории.</summary>
        public void Back()
        {
            if (_history.Count <= 1) return; // назад некуда
            _history.Pop();                  // снимаем текущий
            var previous = _history.Peek();  // предыдущий остаётся на вершине
            ShowInternal(previous, pushHistory: false);
        }

        /// <summary>Показать короткое всплывающее сообщение (~2 сек).</summary>
        public void Toast(string message)
        {
            if (_toastGroup == null || _toastLabel == null)
            {
                Debug.Log($"[Toast] {message}"); // fallback, если тост не сконфигурирован
                return;
            }

            _toastLabel.text = message;
            if (_toastRoutine != null) StopCoroutine(_toastRoutine);
            _toastRoutine = StartCoroutine(ToastRoutine());
        }

        // ---- Внутреннее ------------------------------------------------------

        private void ShowInternal(ScreenId screen, bool pushHistory)
        {
            if (!_map.TryGetValue(screen, out var target))
            {
                Debug.LogWarning($"[UIManager] Экран {screen} не найден в списке.");
                return;
            }

            // Скрываем текущий, если это другой экран.
            if (_map.TryGetValue(_current, out var current) && current != target)
                current.Hide();

            target.Show();

            if (pushHistory && (_history.Count == 0 || _history.Peek() != screen))
                _history.Push(screen);

            _current = screen;

            // Оповещаем систему о смене экрана (для аналитики/аудио и т.п.).
            if (App.IsReady) App.Bus.Publish(new ScreenChangedEvent(screen));
        }

        private IEnumerator ToastRoutine()
        {
            const float fade = 0.25f;
            // Появление.
            yield return FadeToast(0f, 1f, fade);
            // Удержание.
            yield return new WaitForSecondsRealtime(Mathf.Max(0f, _toastDuration - fade * 2f));
            // Затухание.
            yield return FadeToast(1f, 0f, fade);
            _toastRoutine = null;
        }

        private IEnumerator FadeToast(float from, float to, float duration)
        {
            float t = 0f;
            while (t < duration)
            {
                t += Time.unscaledDeltaTime;
                _toastGroup.alpha = Mathf.Lerp(from, to, Mathf.Clamp01(t / duration));
                yield return null;
            }
            _toastGroup.alpha = to;
        }
    }
}
