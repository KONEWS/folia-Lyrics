using System.Reflection;
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
        var assembly = Assembly.GetExecutingAssembly();
        using var version = assembly.GetManifestResourceStream("FoliaLyrics.web-assets.sha256") ?? throw new IOException("缺少界面资源版本");
        using var reader = new StreamReader(version);
        return DesktopAssets.Resolve(Root, reader.ReadToEnd().Trim(),
            () => assembly.GetManifestResourceStream("FoliaLyrics.web-assets.zip") ?? throw new IOException("缺少界面资源"));
    }
}
