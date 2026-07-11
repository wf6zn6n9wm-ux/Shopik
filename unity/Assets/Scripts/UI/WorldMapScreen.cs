// -----------------------------------------------------------------------------
//  WorldMapScreen.cs — карта миров/уровней.
//
//  Строит прокручиваемый список кнопок уровней из ILevelProvider.Worlds. Каждая
//  кнопка показывает название, замок (если не разблокирован) и заработанные
//  звёзды. Тап по разблокированному уровню запускает игру, если есть жизни.
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class WorldMapScreen : BaseScreen
    {
        [Header("Список уровней")]
        [Tooltip("Контейнер (обычно content у ScrollRect), куда добавляются кнопки.")]
        [SerializeField] private Transform _content;
        [Tooltip("Префаб кнопки уровня с компонентом LevelButtonView. Назначается в инспекторе.")]
        [SerializeField] private LevelButtonView _levelButtonPrefab;

        [Header("Прочее")]
        [SerializeField] private Button _backButton;

        protected override void Awake()
        {
            base.Awake();
            if (_backButton) _backButton.onClick.AddListener(() =>
            {
                if (App.IsReady) App.Resolve<INavigation>().Back();
            });
        }

        // Перестраиваем список при каждом показе — прогресс мог измениться.
        protected override void OnShow() => Refresh();

        /// <summary>Полностью пересобрать список кнопок уровней.</summary>
        public void Refresh()
        {
            if (!App.IsReady || _content == null || _levelButtonPrefab == null) return;

            // Чистим старые кнопки.
            for (int i = _content.childCount - 1; i >= 0; i--)
                Destroy(_content.GetChild(i).gameObject);

            var levels = App.Resolve<ILevelProvider>();
            var progress = App.Services.TryResolve<IProgressService>(out var p) ? p : null;

            foreach (var world in levels.Worlds)
            {
                if (world == null) continue;
                foreach (var level in world.Levels)
                {
                    if (level == null) continue;

                    bool unlocked = progress?.IsUnlocked(level.Id) ?? false;
                    int stars = progress?.GetStars(level.Id) ?? 0;

                    var view = Instantiate(_levelButtonPrefab, _content);
                    string id = level.Id; // локальная копия для замыкания
                    view.Render(level.Title, unlocked, stars);
                    view.Bind(() => OnLevelClicked(id, unlocked));
                }
            }
        }

        private void OnLevelClicked(string levelId, bool unlocked)
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();

            if (!unlocked)
            {
                nav.Toast("Уровень пока закрыт");
                return;
            }

            // Нужна хотя бы одна жизнь, чтобы играть.
            if (App.Services.TryResolve<ILivesService>(out var lives) && !lives.HasLife)
            {
                nav.Toast("Нет жизней — подождите восстановления");
                return;
            }

            App.Resolve<IGameFlow>().StartLevel(levelId);
            nav.Show(ScreenId.Game);
        }
    }

    /// <summary>
    /// Вид одной кнопки уровня. Вешается на префаб; внутренние виджеты связываются
    /// в инспекторе Unity. Отделяет разметку от логики экрана (SRP).
    /// </summary>
    public sealed class LevelButtonView : MonoBehaviour
    {
        [SerializeField] private Button _button;
        [SerializeField] private TextMeshProUGUI _titleLabel;
        [SerializeField] private Image _lockIcon;
        [Tooltip("Иконки звёзд по порядку (до 3 штук).")]
        [SerializeField] private Image[] _stars;

        /// <summary>Заполнить визуал: название, замок, звёзды.</summary>
        public void Render(string title, bool unlocked, int stars)
        {
            if (_titleLabel) _titleLabel.text = title;
            if (_lockIcon) _lockIcon.gameObject.SetActive(!unlocked);
            if (_button) _button.interactable = true; // клик обрабатывается всегда (покажем тост, если закрыт)

            if (_stars != null)
                for (int i = 0; i < _stars.Length; i++)
                    if (_stars[i]) _stars[i].enabled = unlocked && i < stars;
        }

        /// <summary>Назначить обработчик клика.</summary>
        public void Bind(UnityEngine.Events.UnityAction onClick)
        {
            if (!_button) return;
            _button.onClick.RemoveAllListeners();
            _button.onClick.AddListener(onClick);
        }
    }
}
