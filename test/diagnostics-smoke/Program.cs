using FoliaLyrics;

// test/diagnostics-smoke/Program.cs — real bounded log reads must retain useful status while excluding song text and private paths.
var checks = 0;
void Check(bool passed, string message) { if (!passed) throw new InvalidOperationException(message); checks++; }
var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "FoliaLyricsDiagnostics_" + Guid.NewGuid().ToString("N")));
var now = new DateTimeOffset(2026, 10, 15, 10, 0, 0, TimeSpan.Zero);
try
{
    var report = DesktopDiagnosticsReport.Build(new(), root, now);
    Check(report.Contains("未连接") && report.Contains("无可读记录"), "a disconnected app with no logs still produces a useful report");
    Check(!Directory.Exists(root), "copying status never creates missing log files or directories");
    Directory.CreateDirectory(root);
    const string secret = "PRIVATE_LYRIC_TEXT";
    var errors = Path.Combine(root, "errors.log");
    File.WriteAllText(errors, $"2026-10-15 09:00:00Z System.IO.IOException: C:\\Users\\PrivateUser\\Music\\{secret}.lrc\n    at Private.Path()\n");
    File.WriteAllText(Path.Combine(root, "media.log"), "source=test; session=private-session-token");
    var state = new DesktopDiagnosticState
    {
        Version = "0.4.38", WebView = "154.0", Platform = "Windows x64", Player = "C:\\PrivateFolder\\FixturePlayer.exe",
        Connected = true, Playing = false, Timeline = true, Controls = "Play=True Pause=True", LyricFormat = "qrc",
        OnlineProvider = "qq", Matching = false, AudioRequested = true, AudioCapturing = false, ClickThrough = true,
    };
    report = DesktopDiagnosticsReport.Build(state, root, now);
    Check(report.Contains("0.4.38") && report.Contains("154.0") && report.Contains("Windows x64"), "versions and platform are included");
    Check(report.Contains("FixturePlayer.exe") && !report.Contains("PrivateFolder"), "a path-shaped player identity is reduced to its application name");
    Check(report.Contains("时间轴：是") && report.Contains("播放中：否") && report.Contains("Play=True"), "connection and actual transport capabilities remain distinguishable");
    Check(report.Contains("声音响应已开启：是；正在采集：否"), "a saved audio preference is distinguishable from active capture");
    Check(report.Contains("System.IO.IOException") && report.Contains("2026-10-15 09:00:00Z"), "the latest error kind and timestamp are available");
    Check(!report.Contains(secret) && !report.Contains("PrivateUser") && !report.Contains("Private.Path") && !report.Contains("private-session-token"), "log messages, stack paths, lyrics and session tokens stay out of the copied report");
    Check(report.Contains("errors.log：") && report.Contains("media.log：") && report.Contains("errors.log.previous：无"), "the report distinguishes current, missing and rotated log files");
    using (var held = File.Open(errors, FileMode.Open, FileAccess.Read, FileShare.None))
        Check(DesktopDiagnosticsReport.Build(state, root, now).Contains("无可读记录"), "a temporarily locked log cannot prevent copying the other diagnostic fields");
    File.WriteAllText(errors, new string('x', 1_000_000) + "\n" + string.Join('\n', Enumerable.Range(0, 12)
        .Select(index => $"2026-10-15 09:00:{index:00}Z System.Error{index}Exception: {secret}")));
    report = DesktopDiagnosticsReport.Build(state, root, now);
    Check(report.Contains("Error11Exception") && report.Contains("Error7Exception") && !report.Contains("Error6Exception"), "only the five most recent error kinds are reported");
    Check(report.Length < 6000 && !report.Contains(secret), "large logs produce a bounded report without leaking error messages");
    report = DesktopDiagnosticsReport.Build(state with { Player = "Fixture\nInjected", Controls = new string('x', 20_000) }, root, now);
    Check(report.Contains("FixtureInjected") && report.Length < 6000, "host scalar fields cannot inject lines or expand the report without bounds");
    Console.WriteLine($"Diagnostics smoke checks passed: {checks}");
}
finally
{
    var temp = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
    if (Path.GetDirectoryName(root) == temp && Path.GetFileName(root).StartsWith("FoliaLyricsDiagnostics_", StringComparison.Ordinal) && Directory.Exists(root))
        Directory.Delete(root, true);
}
