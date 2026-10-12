using System.Reflection;
using System.Text;
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
        // Faults on non-UI threads used to leave no trace; they are only logged here, the runtime still reacts as before.
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            DataFiles.LogFatal(e.ExceptionObject as Exception ?? new InvalidOperationException("Unhandled non-exception object: " + e.ExceptionObject));
        TaskScheduler.UnobservedTaskException += (_, e) => DataFiles.Log(e.Exception);
        AppDomain.CurrentDomain.ProcessExit += (_, _) => DataFiles.FlushLog();
        try { Application.Run(new MainWindow()); }
        catch (Exception e) { DataFiles.Log(e); MessageBox.Show("启动失败：" + e.Message, "Folia 桌面歌词"); }
    }
}
internal static class DataFiles
{
    public static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FoliaLyrics");
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    // errors.log rolls over above 256 KB; an identical error is written once per 30 s window.
    private const long LogRolloverBytes = 256 * 1024, LogRepeatWindowMs = 30_000;
    private const int LogTrackedKinds = 64, CorruptCopiesKept = 3;
    private static readonly object logGate = new();
    private static readonly Dictionary<string, LogRepeat> logRepeats = new();
    private sealed class LogRepeat(long writtenAt) { public readonly long WrittenAt = writtenAt; public int Suppressed; }
    // A missing file silently yields the fallback; an unreadable or unparsable one is copied aside (newest 3 kept) and logged first,
    // so the next Save cannot destroy the only copy of the user's data.
    public static T Load<T>(string name, T fallback)
    {
        var path = Path.Combine(Root, name);
        try { return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Json) ?? fallback; }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException) { return fallback; }
        catch (Exception e) { Log(e); KeepCorruptCopy(path); return fallback; }
    }
    // Copy a file that failed to load to <name>.corrupt-<yyyyMMddHHmmss> and trim older copies; best effort, never throws.
    private static void KeepCorruptCopy(string path)
    {
        try
        {
            var info = new FileInfo(path);
            if (info.Exists && info.Length > 0) File.Copy(path, $"{path}.corrupt-{DateTime.Now:yyyyMMddHHmmss}", true);
        }
        catch (Exception e) { Log(e); }
        try
        {
            var copies = Directory.EnumerateFiles(Path.GetDirectoryName(path)!, Path.GetFileName(path) + ".corrupt-*")
                .OrderByDescending(copy => copy, StringComparer.Ordinal).Skip(CorruptCopiesKept).ToArray();
            foreach (var copy in copies) File.Delete(copy);
        }
        catch { }
    }
    // Write to a unique temp file next to the target, flush it to disk, then swap it in. Disk failures are logged and
    // reported as false instead of being thrown into the caller (the in-memory state stays authoritative for this session).
    public static bool TrySave<T>(string name, T value)
    {
        string? temp = null;
        try
        {
            var bytes = new UTF8Encoding(false).GetBytes(JsonSerializer.Serialize(value, Json));
            Directory.CreateDirectory(Root); var path = Path.Combine(Root, name);
            temp = $"{path}.{Guid.NewGuid():N}.tmp";
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(bytes); stream.Flush(true); }
            File.Move(temp, path, true); temp = null;
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Log(e); return false; }
        finally { if (temp is not null) try { File.Delete(temp); } catch { } }
    }
    public static void Save<T>(string name, T value) => TrySave(name, value);
    // Append an entry to errors.log. The same exception (type + message) is written once per 30 s; the occurrences suppressed
    // meanwhile are summarized later by one "(repeated N times)" line. Never throws, whatever happens to the disk.
    public static void Log(Exception e) => WriteLog(e, false);
    // Fatal faults are always written, even if an identical entry was logged moments ago.
    public static void LogFatal(Exception e) => WriteLog(e, true);
    // Write the "(repeated N times)" lines that are still pending (called when the process exits).
    public static void FlushLog()
    {
        try { lock (logGate) { var text = new StringBuilder(); DrainRepeats(text, long.MaxValue); AppendLog(text); } }
        catch { }
    }
    private static void WriteLog(Exception e, bool always)
    {
        try
        {
            var kind = Describe(e); var now = Environment.TickCount64;
            lock (logGate)
            {
                if (!always && logRepeats.TryGetValue(kind, out var seen) && now - seen.WrittenAt < LogRepeatWindowMs) { seen.Suppressed++; return; }
                var text = new StringBuilder();
                DrainRepeats(text, now, kind);
                text.Append($"{DateTime.Now:u} {e}\n");
                logRepeats[kind] = new LogRepeat(now);
                AppendLog(text);
            }
        }
        catch { }
    }
    // One-line identity of an exception for de-duplication: type plus message, bounded in length.
    private static string Describe(Exception e)
    {
        string message; try { message = e.Message; } catch { message = ""; }
        var kind = (e.GetType().FullName + ": " + message).ReplaceLineEndings(" ");
        return kind.Length <= 300 ? kind : kind[..300];
    }
    // Emit summary lines for kinds whose 30 s window has ended (and for the kind about to be written) and forget them;
    // an oversized table is flushed completely.
    private static void DrainRepeats(StringBuilder text, long now, string? current = null)
    {
        var flushAll = logRepeats.Count >= LogTrackedKinds;
        foreach (var (kind, repeat) in logRepeats.ToArray())
        {
            if (!flushAll && kind != current && now - repeat.WrittenAt < LogRepeatWindowMs) continue;
            if (repeat.Suppressed > 0) text.Append($"{DateTime.Now:u} (repeated {repeat.Suppressed} times) {kind}\n");
            logRepeats.Remove(kind);
        }
    }
    // Append to errors.log, first moving a log above 256 KB to errors.log.previous (replacing an older one).
    private static void AppendLog(StringBuilder text)
    {
        if (text.Length == 0) return;
        Directory.CreateDirectory(Root);
        var path = Path.Combine(Root, "errors.log");
        try { var info = new FileInfo(path); if (info.Exists && info.Length > LogRolloverBytes) File.Move(path, path + ".previous", true); } catch { }
        File.AppendAllText(path, text.ToString());
    }
    public static string Assets()
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var version = assembly.GetManifestResourceStream("FoliaLyrics.web-assets.sha256") ?? throw new IOException("缺少界面资源版本");
        using var reader = new StreamReader(version);
        var folder = DesktopAssets.Resolve(Root, reader.ReadToEnd().Trim(),
            () => assembly.GetManifestResourceStream("FoliaLyrics.web-assets.zip") ?? throw new IOException("缺少界面资源"));
        // Folders of earlier builds are removed in the background, well after the window is up, so startup I/O is not contended.
        _ = Task.Run(async () => { await Task.Delay(TimeSpan.FromSeconds(15)); DesktopAssets.RemoveStale(Root, folder); });
        return folder;
    }
}
