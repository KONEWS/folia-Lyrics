using System.Text.Json;

// test/persistence-smoke/StandIns.cs — isolate IO and capture host messages while linking the real writer and save handler.
namespace FoliaLyrics;
internal static class DataFiles
{
    public static readonly string Root = Path.Combine(Path.GetTempPath(), "FoliaLyricsPersistence_" + Guid.NewGuid().ToString("N"));
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static readonly List<Exception> Errors = [];
    public static T Load<T>(string name, T fallback) => File.Exists(Path.Combine(Root, name))
        ? JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Root, name)), Json)! : fallback;
    public static bool TrySave<T>(string name, T value) => AtomicJsonFile.TrySave(Root, name, value, Json, Log);
    public static void Log(Exception error) => Errors.Add(error);
}
internal sealed partial class MainWindow
{
    private readonly Preferences preferences = new();
    public readonly List<(string Type, JsonElement Data)> Messages = [];
    public bool SaveTopmost(bool value) { preferences.Topmost = value; return SavePreferences(); }
    private void Send(string type, object data) => Messages.Add((type, JsonSerializer.SerializeToElement(data, DataFiles.Json)));
}
