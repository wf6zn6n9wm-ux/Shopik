// -----------------------------------------------------------------------------
//  AssetRef.cs — ссылка на ассет по адресу Addressables.
//  Позволяет хранить в данных только строковый ключ, а грузить спрайт асинхронно
//  через ISpriteLoader — тяжёлые иллюстрации не держатся в памяти постоянно.
// -----------------------------------------------------------------------------
using System;

namespace Findoria.Data
{
    /// <summary>Адрес ассета в системе Addressables (или путь в Resources как fallback).</summary>
    [Serializable]
    public struct AssetRef : IEquatable<AssetRef>
    {
        public string Address;

        public AssetRef(string address) { Address = address; }
        public bool IsValid => !string.IsNullOrEmpty(Address);

        public bool Equals(AssetRef other) => Address == other.Address;
        public override bool Equals(object obj) => obj is AssetRef o && Equals(o);
        public override int GetHashCode() => Address?.GetHashCode() ?? 0;
        public override string ToString() => Address ?? "<none>";
    }
}
