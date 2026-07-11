// -----------------------------------------------------------------------------
//  HiddenItemView.cs — интерактивная «горячая зона» одного спрятанного предмета.
//  Это UI-элемент (Image + Button) поверх иллюстрации. По нажатию сообщает
//  контроллеру, кто был нажат. Умеет анимации: появление, «найдено», подсказка.
// -----------------------------------------------------------------------------
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.Gameplay
{
    [RequireComponent(typeof(RectTransform))]
    public sealed class HiddenItemView : MonoBehaviour
    {
        [SerializeField] private Image _image;     // прозрачная кликабельная зона (в релизе — прозрачна)
        [SerializeField] private Image _highlight; // кольцо подсветки для подсказки

        private RectTransform _rt;
        private Action<HiddenItemView> _onTap;
        private Coroutine _anim;

        public string ItemId { get; private set; }
        public bool Found { get; private set; }

        private void Awake()
        {
            _rt = (RectTransform)transform;
            if (_image == null) _image = GetComponent<Image>();
            if (_image != null)
            {
                _image.raycastTarget = true;
                // Зона невидима, но ловит нажатия. Небольшая альфа помогает при отладке.
                var c = _image.color; c.a = 0f; _image.color = c;
            }
        }

        /// <summary>Настроить зону под конкретное размещение предмета.</summary>
        public void Setup(string itemId, Vector2 anchoredPos, float size, float rotation,
                          Action<HiddenItemView> onTap)
        {
            ItemId = itemId;
            Found = false;
            _onTap = onTap;

            _rt.anchoredPosition = anchoredPos;
            _rt.sizeDelta = new Vector2(size, size);
            _rt.localRotation = Quaternion.Euler(0, 0, rotation);
            _rt.localScale = Vector3.one;

            if (_highlight != null) _highlight.enabled = false;
            gameObject.SetActive(true);

            // Вешаем обработчик клика (Button надёжнее ручного raycast).
            var btn = GetComponent<Button>();
            if (btn == null) btn = gameObject.AddComponent<Button>();
            btn.onClick.RemoveAllListeners();
            btn.onClick.AddListener(HandleTap);
        }

        private void HandleTap()
        {
            if (Found) return;
            _onTap?.Invoke(this);
        }

        /// <summary>Анимация «предмет найден»: всплеск и исчезновение.</summary>
        public void PlayFound(Action onComplete)
        {
            Found = true;
            if (_anim != null) StopCoroutine(_anim);
            _anim = StartCoroutine(FoundRoutine(onComplete));
        }

        private IEnumerator FoundRoutine(Action onComplete)
        {
            if (_highlight != null) _highlight.enabled = false;

            float t = 0f;
            const float dur = 0.35f;
            var start = Vector3.one;
            var peak = Vector3.one * 1.6f;
            while (t < dur)
            {
                t += Time.deltaTime;
                float k = t / dur;
                // Bounce вверх, затем к нулю.
                _rt.localScale = k < 0.4f
                    ? Vector3.Lerp(start, peak, k / 0.4f)
                    : Vector3.Lerp(peak, Vector3.zero, (k - 0.4f) / 0.6f);
                yield return null;
            }
            _rt.localScale = Vector3.zero;
            onComplete?.Invoke();
        }

        /// <summary>Подсветить зону (бустер «Подсказка»): пульсирующее кольцо.</summary>
        public void PlayHint(float seconds = 2.2f)
        {
            if (Found) return;
            if (_anim != null) StopCoroutine(_anim);
            _anim = StartCoroutine(HintRoutine(seconds));
        }

        private IEnumerator HintRoutine(float seconds)
        {
            if (_highlight != null) _highlight.enabled = true;
            float t = 0f;
            while (t < seconds && !Found)
            {
                t += Time.deltaTime;
                float pulse = 1f + 0.25f * Mathf.Sin(t * 8f);
                _rt.localScale = Vector3.one * pulse;
                yield return null;
            }
            _rt.localScale = Vector3.one;
            if (_highlight != null) _highlight.enabled = false;
        }
    }
}
