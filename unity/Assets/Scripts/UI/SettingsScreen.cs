// -----------------------------------------------------------------------------
//  SettingsScreen.cs — настройки.
//
//  Тумблеры музыки/звука/вибрации пишут значения прямо в PlayerData (через
//  ISaveService), публикуют SettingsChangedEvent и дублируют их в IAudioService.
//  Кнопки: восстановить покупки, сбросить прогресс, закрыть/приватность.
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class SettingsScreen : BaseScreen
    {
        [Header("Тумблеры")]
        [SerializeField] private Toggle _musicToggle;
        [SerializeField] private Toggle _sfxToggle;
        [SerializeField] private Toggle _vibrationToggle;

        [Header("Кнопки")]
        [SerializeField] private Button _restoreButton;
        [SerializeField] private Button _resetProgressButton;
        [SerializeField] private Button _privacyButton;
        [SerializeField] private Button _closeButton;

        protected override void Awake()
        {
            base.Awake();
            if (_musicToggle) _musicToggle.onValueChanged.AddListener(_ => ApplySettings());
            if (_sfxToggle) _sfxToggle.onValueChanged.AddListener(_ => ApplySettings());
            if (_vibrationToggle) _vibrationToggle.onValueChanged.AddListener(_ => ApplySettings());

            if (_restoreButton) _restoreButton.onClick.AddListener(OnRestore);
            if (_resetProgressButton) _resetProgressButton.onClick.AddListener(OnResetProgress);
            if (_privacyButton) _privacyButton.onClick.AddListener(OnPrivacy);
            if (_closeButton) _closeButton.onClick.AddListener(OnClose);
        }

        // При показе подтягиваем сохранённые значения в тумблеры.
        protected override void OnShow()
        {
            if (!App.IsReady || !App.Services.TryResolve<ISaveService>(out var save)) return;
            var data = save.Data;
            // Меняем флаг без вызова обработчиков, чтобы не перезаписать сразу же.
            SetToggleSilently(_musicToggle, data.MusicOn);
            SetToggleSilently(_sfxToggle, data.SfxOn);
            SetToggleSilently(_vibrationToggle, data.VibrationOn);
        }

        private void ApplySettings()
        {
            if (!App.IsReady || !App.Services.TryResolve<ISaveService>(out var save)) return;
            var data = save.Data;

            data.MusicOn = _musicToggle == null || _musicToggle.isOn;
            data.SfxOn = _sfxToggle == null || _sfxToggle.isOn;
            data.VibrationOn = _vibrationToggle == null || _vibrationToggle.isOn;
            save.Save();

            // Сообщаем всем заинтересованным (аудио, гаптика) о новых настройках.
            App.Bus.Publish(new SettingsChangedEvent(data.MusicOn, data.SfxOn, data.VibrationOn));

            // Дублируем напрямую в аудиосервис для мгновенного эффекта.
            if (App.Services.TryResolve<IAudioService>(out var audio))
            {
                audio.SetMusicEnabled(data.MusicOn);
                audio.SetSfxEnabled(data.SfxOn);
            }
        }

        private void OnRestore()
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();
            if (!App.Services.TryResolve<IPurchaseService>(out var purchases)) { nav.Toast("Недоступно"); return; }
            purchases.Restore(result =>
                nav.Toast(result == OperationResult.Success ? "Покупки восстановлены" : "Нечего восстанавливать"));
        }

        private void OnResetProgress()
        {
            if (!App.IsReady) return;
            if (App.Services.TryResolve<ISaveService>(out var save))
            {
                save.ResetProgress();
                App.Resolve<INavigation>().Toast("Прогресс сброшен");
                OnShow(); // обновляем тумблеры под дефолтные значения
            }
        }

        private void OnPrivacy()
        {
            // TODO: открыть ссылку политики конфиденциальности (Application.OpenURL).
            if (App.IsReady) App.Resolve<INavigation>().Toast("Политика конфиденциальности");
        }

        private void OnClose()
        {
            if (App.IsReady) App.Resolve<INavigation>().Back();
        }

        private static void SetToggleSilently(Toggle toggle, bool value)
        {
            if (toggle) toggle.SetIsOnWithoutNotify(value);
        }
    }
}
