using System.Text.Json;

// test/transport-smoke/TestDataFiles.cs — isolated persistence for the real directory scanner.
namespace FoliaLyrics;
internal static class DataFiles
{
    private static readonly Dictionary<string, string> files = [];
    public static T Load<T>(string name, T fallback) => files.TryGetValue(name, out var text) ? JsonSerializer.Deserialize<T>(text)! : fallback;
    public static void Save<T>(string name, T data) => files[name] = JsonSerializer.Serialize(data);
    public static void Log(Exception error) { }
}
