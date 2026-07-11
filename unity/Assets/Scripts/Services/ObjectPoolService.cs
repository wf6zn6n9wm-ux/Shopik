// -----------------------------------------------------------------------------
//  ObjectPoolService.cs — пул переиспользуемых GameObject'ов.
//  Убирает частые Instantiate/Destroy (меньше GC-фризов, стабильные 60 FPS).
//  Ключ пула — исходный префаб; экземпляры помечаются PooledObject для возврата.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;

namespace Findoria.Services
{
    /// <summary>Метка на заспавненном объекте: помнит, из какого префаба он создан.</summary>
    public sealed class PooledObject : MonoBehaviour
    {
        public GameObject SourcePrefab;
    }

    public sealed class ObjectPoolService : IObjectPoolService
    {
        private readonly Dictionary<GameObject, Stack<GameObject>> _pools = new();
        private readonly Transform _root;

        public ObjectPoolService()
        {
            var go = new GameObject("[Pool]");
            Object.DontDestroyOnLoad(go);
            go.SetActive(true);
            _root = go.transform;
        }

        public void Prewarm(GameObject prefab, int count)
        {
            if (prefab == null || count <= 0) return;
            var stack = GetStack(prefab);
            for (int i = 0; i < count; i++)
            {
                var inst = CreateInstance(prefab);
                inst.SetActive(false);
                inst.transform.SetParent(_root, false);
                stack.Push(inst);
            }
        }

        public GameObject Spawn(GameObject prefab, Transform parent = null)
        {
            if (prefab == null) return null;
            var stack = GetStack(prefab);
            var inst = stack.Count > 0 ? stack.Pop() : CreateInstance(prefab);
            inst.transform.SetParent(parent, false);
            inst.SetActive(true);
            return inst;
        }

        public void Despawn(GameObject instance)
        {
            if (instance == null) return;
            instance.SetActive(false);
            instance.transform.SetParent(_root, false);

            var marker = instance.GetComponent<PooledObject>();
            if (marker != null && marker.SourcePrefab != null)
                GetStack(marker.SourcePrefab).Push(instance);
            else
                Object.Destroy(instance); // не из пула — просто уничтожаем
        }

        public void Clear()
        {
            foreach (var stack in _pools.Values)
                while (stack.Count > 0) Object.Destroy(stack.Pop());
            _pools.Clear();
        }

        private Stack<GameObject> GetStack(GameObject prefab)
        {
            if (!_pools.TryGetValue(prefab, out var stack))
            {
                stack = new Stack<GameObject>();
                _pools[prefab] = stack;
            }
            return stack;
        }

        private GameObject CreateInstance(GameObject prefab)
        {
            var inst = Object.Instantiate(prefab);
            var marker = inst.GetComponent<PooledObject>();
            if (marker == null) marker = inst.AddComponent<PooledObject>();
            marker.SourcePrefab = prefab;
            return inst;
        }
    }
}
