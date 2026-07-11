// -----------------------------------------------------------------------------
//  SpriteLoader.cs — асинхронная загрузка спрайтов с кэшем и подсчётом ссылок.
//
//  По умолчанию работает через Resources (без внешних пакетов). Если включён
//  символ компиляции FINDORIA_ADDRESSABLES и подключён пакет com.unity.addressables,
//  используется Addressables (стриминг тяжёлых иллюстраций, выгрузка из памяти).
//  Так соблюдается требование Addressables + минимальное потребление памяти.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using Findoria.Core;
using Findoria.Data;
#if FINDORIA_ADDRESSABLES
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
#endif

namespace Findoria.Services
{
    public sealed class SpriteLoader : ISpriteLoader
    {
        // Кэш загруженных спрайтов + счётчик держателей, чтобы не выгружать используемое.
        private readonly Dictionary<string, Sprite> _cache = new();
        private readonly Dictionary<string, int> _refCount = new();
#if FINDORIA_ADDRESSABLES
        private readonly Dictionary<string, AsyncOperationHandle<Sprite>> _handles = new();
#endif

        public async Task<Sprite> LoadAsync(AssetRef reference)
        {
            if (!reference.IsValid) return null;
            var key = reference.Address;

            _refCount[key] = _refCount.TryGetValue(key, out var c) ? c + 1 : 1;
            if (_cache.TryGetValue(key, out var cached)) return cached;

#if FINDORIA_ADDRESSABLES
            var handle = Addressables.LoadAssetAsync<Sprite>(key);
            await handle.Task;
            if (handle.Status == AsyncOperationStatus.Succeeded)
            {
                _handles[key] = handle;
                _cache[key] = handle.Result;
                return handle.Result;
            }
            Debug.LogError($"[SpriteLoader] Addressables не смог загрузить '{key}'.");
            return null;
#else
            // Fallback через Resources: адрес трактуется как путь в папке Resources.
            var request = Resources.LoadAsync<Sprite>(key);
            while (!request.isDone) await Task.Yield();
            var sprite = request.asset as Sprite;
            if (sprite == null) Debug.LogWarning($"[SpriteLoader] В Resources нет спрайта '{key}'.");
            else _cache[key] = sprite;
            return sprite;
#endif
        }

        public void Release(AssetRef reference)
        {
            if (!reference.IsValid) return;
            var key = reference.Address;
            if (!_refCount.TryGetValue(key, out var c)) return;

            c--;
            if (c > 0) { _refCount[key] = c; return; }

            _refCount.Remove(key);
            _cache.Remove(key);
#if FINDORIA_ADDRESSABLES
            if (_handles.TryGetValue(key, out var handle))
            {
                Addressables.Release(handle);
                _handles.Remove(key);
            }
#endif
        }

        public void ReleaseAll()
        {
#if FINDORIA_ADDRESSABLES
            foreach (var h in _handles.Values) Addressables.Release(h);
            _handles.Clear();
#endif
            _cache.Clear();
            _refCount.Clear();
        }
    }
}
