using System.Text;
using System.Text.RegularExpressions;

// native/DesktopDiagnosticsReport.cs — build a bounded support summary without copying song content or local paths.
namespace FoliaLyrics;
internal sealed record DesktopDiagnosticState
{
    public string Version { get; init; } = "";
    public string WebView { get; init; } = "";
    public string Platform { get; init; } = "";
    public string Player { get; init; } = "";
    public bool Connected { get; init; }
    public bool Playing { get; init; }
    public bool Timeline { get; init; }
    public string Controls { get; init; } = "";
    public string LyricFormat { get; init; } = "";
    public string OnlineProvider { get; init; } = "";
    public bool Matching { get; init; }
    public bool AudioRequested { get; init; }
    public bool AudioCapturing { get; init; }
    public bool ClickThrough { get; init; }
    public bool Topmost { get; init; }
}
internal static class DesktopDiagnosticsReport
{
    private static readonly string[] LogNames = ["errors.log", "errors.log.previous", "media.log", "media.log.previous"];
    private static readonly Regex ErrorKind = new(@"(?m)^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z) ([A-Za-z][A-Za-z0-9_.+`]*(?:Exception|Error))(?=[:\s])", RegexOptions.None, TimeSpan.FromMilliseconds(100));
    private static string Line(string value) => new(value.Take(160).Where(character => !char.IsControl(character)).ToArray());
    private static string Yes(bool value) => value ? "是" : "否";

    // Only known status fields and exception kinds are included; log messages and stacks can contain user file names or lyrics.
    public static string Build(DesktopDiagnosticState state, string root, DateTimeOffset now)
    {
        var player = state.Player.Replace('\\', '/').Split('/').LastOrDefault() ?? "";
        var report = new StringBuilder("folia-Lyrics 诊断信息\n");
        report.AppendLine($"时间（UTC）：{now.UtcDateTime:O}");
        report.AppendLine($"程序版本：{Line(state.Version)}");
        report.AppendLine($"系统：{Line(state.Platform)}");
        report.AppendLine($"WebView2：{Line(state.WebView)}");
        report.AppendLine($"播放器：{(player.Length == 0 ? "未连接" : Line(player))}");
        report.AppendLine($"已连接：{Yes(state.Connected)}；播放中：{Yes(state.Playing)}；提供时间轴：{Yes(state.Timeline)}");
        report.AppendLine($"播放控制能力：{Line(state.Controls)}");
        report.AppendLine($"歌词格式：{Line(state.LyricFormat)}；在线来源：{Line(state.OnlineProvider)}；匹配中：{Yes(state.Matching)}");
        report.AppendLine($"声音响应已开启：{Yes(state.AudioRequested)}；正在采集：{Yes(state.AudioCapturing)}");
        report.AppendLine($"鼠标穿透：{Yes(state.ClickThrough)}；窗口置顶：{Yes(state.Topmost)}");
        report.AppendLine("日志文件：");
        foreach (var name in LogNames)
        {
            try
            {
                var info = new FileInfo(Path.Combine(root, name));
                report.AppendLine(info.Exists ? $"  {name}：{info.Length} 字节；更新于 {info.LastWriteTimeUtc:O}" : $"  {name}：无");
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { report.AppendLine($"  {name}：暂不可读"); }
        }
        report.AppendLine("最近错误类型：");
        var recent = RecentErrors(Path.Combine(root, "errors.log"));
        report.AppendLine(recent.Length == 0 ? "  无可读记录" : recent);
        return report.ToString();
    }

    // Read only the final 8 KiB of the active log, sharing the writer's handle and keeping exception messages out of the clipboard.
    private static string RecentErrors(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            stream.Seek(Math.Max(0, stream.Length - 8192), SeekOrigin.Begin);
            using var reader = new StreamReader(stream);
            return string.Join('\n', ErrorKind.Matches(reader.ReadToEnd()).Cast<Match>().TakeLast(5)
                .Select(match => $"  {match.Groups[1].Value} {match.Groups[2].Value}"));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { return ""; }
    }
}
