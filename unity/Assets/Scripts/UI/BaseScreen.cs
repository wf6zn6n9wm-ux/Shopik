// -----------------------------------------------------------------------------
//  BaseScreen.cs — базовый класс любого экрана UI.
//
//  Инкапсулирует общую механику показа/скрытия: включение GameObject и плавное
//  появление через CanvasGroup (alpha 0→1) с лёгким «подпрыгиванием» масштаба
//  (0.9→1.0). Наследники переопределяют OnShow/OnHide, не заботясь об анимации
//  (принцип единственной ответственности + переиспользование, DRY).
// -----------------------------------------------------------------------------
using System.Collections;
using Findoria.Core;
using UnityEngine;

namespace Findoria.UI
{
    /// <summary>Абстрактный экран. Управляется навигацией (UIManager).</summary>
    [RequireComponent(typeof(CanvasGroup))]
    public abstract class BaseScreen : MonoBehaviour
    {
        [Tooltip("Идентификатор экрана — по нему навигация его находит.")]
        public ScreenId Id;

        [Header("Анимация появления")]
        [SerializeField] private float _fadeDuration = 0.22f;
        [SerializeField] private float _startScale = 0.9f;

        // CanvasGroup получаем автоматически в Awake — управляет прозрачностью и кликами.
        private CanvasGroup _canvasGroup;
        private Coroutine _animation;

        /// <summary>Видим ли экран сейчас.</summary>
        public bool IsVisible { get; private set; }

        protected virtual void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
            if (_canvasGroup == null) _canvasGroup = gameObject.AddComponent<CanvasGroup>();
        }

        /// <summary>Показать экран с плавной анимацией.</summary>
        public void Show()
        {
            gameObject.SetActive(true);
            IsVisible = true;
            OnShow(); // даём наследнику наполнить данные ДО анимации

            if (_animation != null) StopCoroutine(_animation);
            _animation = StartCoroutine(AppearRoutine());
        }

        /// <summary>Скрыть экран с плавным затуханием, затем деактивировать.</summary>
        public void Hide()
        {
            if (!gameObject.activeSelf) { IsVisible = false; return; }
            OnHide();
            IsVisible = false;

            if (_animation != null) StopCoroutine(_animation);
            _animation = StartCoroutine(DisappearRoutine());
        }

        /// <summary>Мгновенно спрятать без анимации (используется навигацией на старте).</summary>
        public void HideInstant()
        {
            if (_animation != null) { StopCoroutine(_animation); _animation = null; }
            IsVisible = false;
            if (_canvasGroup != null) _canvasGroup.alpha = 0f;
            gameObject.SetActive(false);
        }

        // ---- Хуки для наследников -------------------------------------------
        /// <summary>Вызывается при показе — подписки/наполнение данными.</summary>
        protected virtual void OnShow() { }
        /// <summary>Вызывается при скрытии — очистка/отписки при необходимости.</summary>
        protected virtual void OnHide() { }

        // ---- Корутины анимации ----------------------------------------------
        private IEnumerator AppearRoutine()
        {
            float t = 0f;
            _canvasGroup.alpha = 0f;
            transform.localScale = Vector3.one * _startScale;

            while (t < _fadeDuration)
            {
                t += Time.unscaledDeltaTime; // unscaled — работает даже на паузе
                float k = Mathf.Clamp01(t / _fadeDuration);
                _canvasGroup.alpha = k;
                // EaseOutBack даёт лёгкий «отскок» при появлении.
                transform.localScale = Vector3.one * Mathf.Lerp(_startScale, 1f, EaseOutBack(k));
                yield return null;
            }

            _canvasGroup.alpha = 1f;
            transform.localScale = Vector3.one;
            _animation = null;
        }

        private IEnumerator DisappearRoutine()
        {
            float t = 0f;
            float from = _canvasGroup.alpha;

            while (t < _fadeDuration)
            {
                t += Time.unscaledDeltaTime;
                _canvasGroup.alpha = Mathf.Lerp(from, 0f, Mathf.Clamp01(t / _fadeDuration));
                yield return null;
            }

            _canvasGroup.alpha = 0f;
            _animation = null;
            gameObject.SetActive(false);
        }

        /// <summary>Функция сглаживания с небольшим перелётом за 1.0 (эффект «пружины»).</summary>
        private static float EaseOutBack(float x)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(x - 1f, 3f) + c1 * Mathf.Pow(x - 1f, 2f);
        }
    }
}
