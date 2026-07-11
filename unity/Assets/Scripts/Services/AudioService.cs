// -----------------------------------------------------------------------------
//  AudioService.cs — воспроизведение музыки и звуковых эффектов.
//  MonoBehaviour: живёт в Bootstrap-сцене (нужны AudioSource'ы), регистрируется
//  в контейнере как IAudioService. Клипы задаются данными (список id→AudioClip).
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;

namespace Findoria.Services
{
    public sealed class AudioService : MonoBehaviour, IAudioService
    {
        [System.Serializable]
        public struct NamedClip { public string Id; public AudioClip Clip; }

        [Header("Банк клипов (данные вне кода)")]
        [SerializeField] private List<NamedClip> _clips = new();

        [Header("Источники")]
        [SerializeField] private AudioSource _musicSource;
        [SerializeField] private AudioSource _sfxSource;

        private readonly Dictionary<string, AudioClip> _index = new();
        private bool _musicOn = true, _sfxOn = true;

        private void Awake()
        {
            foreach (var c in _clips)
                if (!string.IsNullOrEmpty(c.Id) && c.Clip != null) _index[c.Id] = c.Clip;

            if (_musicSource == null)
            {
                _musicSource = gameObject.AddComponent<AudioSource>();
                _musicSource.loop = true;
                _musicSource.playOnAwake = false;
            }
            if (_sfxSource == null)
            {
                _sfxSource = gameObject.AddComponent<AudioSource>();
                _sfxSource.playOnAwake = false;
            }
        }

        public void PlaySfx(string clipId, float volume = 1f)
        {
            if (!_sfxOn || string.IsNullOrEmpty(clipId)) return;
            if (_index.TryGetValue(clipId, out var clip))
                _sfxSource.PlayOneShot(clip, Mathf.Clamp01(volume));
        }

        public void PlayMusic(string clipId, bool loop = true)
        {
            if (!_index.TryGetValue(clipId, out var clip)) return;
            _musicSource.clip = clip;
            _musicSource.loop = loop;
            if (_musicOn) _musicSource.Play();
        }

        public void StopMusic() => _musicSource.Stop();

        public void SetMusicEnabled(bool on)
        {
            _musicOn = on;
            if (!on) _musicSource.Pause();
            else if (_musicSource.clip != null) _musicSource.UnPause();
        }

        public void SetSfxEnabled(bool on) => _sfxOn = on;
    }
}
