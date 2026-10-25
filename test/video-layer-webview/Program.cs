using System.Text.Json;
using FoliaLyrics;

// A real, isolated WebView2 decoder and the production resource handler; no main app, player or user profile.
internal static class Program
{
    [STAThread] private static int Main(string[] args)
    {
        if (args.Length != 1 || !File.Exists(args[0])) throw new ArgumentException("Provide a short local MP4 or WebM test video.");
        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(DataFiles.Root);
        var path = Path.Combine(DataFiles.Root, "sample" + Path.GetExtension(args[0]));
        File.Copy(Path.GetFullPath(args[0]), path);
        using var window = new MainWindow(path);
        Application.Run(window);
        Console.WriteLine(JsonSerializer.Serialize(new { window.Checks, window.Failure, profile = DataFiles.Root }));
        return window.Failure is null ? 0 : 1;
    }
}

namespace FoliaLyrics
{
    internal static class DataFiles
    {
        internal static readonly string Root = Path.Combine(Path.GetTempPath(), "FoliaVideoWebView_" + Guid.NewGuid().ToString("N"));
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
        internal static T Load<T>(string name, T fallback) => File.Exists(Path.Combine(Root, name)) ? JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Root, name)), Json) ?? fallback : fallback;
        internal static bool TrySave<T>(string name, T value) => AtomicJsonFile.TrySave(Root, name, value, Json, Log);
        internal static void Log(Exception exception) => Console.Error.WriteLine(exception);
    }
    internal static class JsonText
    {
        internal static string Text(this JsonElement value, string key) => value.TryGetProperty(key, out var found) && found.ValueKind == JsonValueKind.String ? found.GetString() ?? "" : "";
    }
}
