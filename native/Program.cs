using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

// native/Program.cs
namespace FoliaLyrics;
internal static class Program
{
    [STAThread] private static void Main()
    {
        using var instance = new Mutex(true, "Local\\FoliaDesktopLyrics", out var first);
        if (!first) { MessageBox.Show("程序已经运行，请双击系统托盘图标打开。", "Folia 桌面歌词"); return; }
        ApplicationConfiguration.Initialize();
        Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        Application.ThreadException += (_, e) => DataFiles.Log(e.Exception);
        try { Application.Run(new MainWindow()); }
        catch (Exception e) { DataFiles.Log(e); MessageBox.Show("启动失败：" + e.Message, "Folia 桌面歌词"); }
    }
}
internal static class DataFiles
{
    public static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FoliaLyrics");
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static T Load<T>(string name, T fallback)
    { try { return JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Root, name)), Json) ?? fallback; } catch { return fallback; } }
    public static void Save<T>(string name, T value)
    {
        Directory.CreateDirectory(Root); var path = Path.Combine(Root, name);
        File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(value, Json)); File.Move(path + ".tmp", path, true);
    }
    public static void Log(Exception e)
    {
        try { Directory.CreateDirectory(Root); File.AppendAllText(Path.Combine(Root, "errors.log"), $"{DateTime.Now:u} {e}\n"); } catch { }
    }
    public static string Assets()
    {
        using var input = Assembly.GetExecutingAssembly().GetManifestResourceStream("FoliaLyrics.web-assets.zip") ?? throw new IOException("缺少界面资源");
        using var bytes = new MemoryStream(); input.CopyTo(bytes);
        var hash = Convert.ToHexString(SHA256.HashData(bytes.ToArray()))[..16];
        var folder = Path.Combine(Root, "web", hash);
        if (File.Exists(Path.Combine(folder, ".ready"))) return folder;
        Directory.CreateDirectory(folder); bytes.Position = 0;
        using var zip = new ZipArchive(bytes); zip.ExtractToDirectory(folder, true);
        File.WriteAllText(Path.Combine(folder, ".ready"), hash); return folder;
    }
}
internal sealed class Preferences
{
    public bool Topmost { get; set; }
    public bool AudioReactive { get; set; } = true;
    public string Source { get; set; } = "";
    public bool OnlineEnabled { get; set; } = true;
    public string[] OnlineProviders { get; set; } = ["kugou", "qq", "netease", "lrclib"];
}
