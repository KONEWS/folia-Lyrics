using System.Diagnostics;
using System.Runtime.InteropServices;

// native/WindowDiagnostics.cs — explicit user actions for copying current status and opening the local log directory.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private void CopyDiagnostics()
    {
        try
        {
            var version = typeof(MainWindow).Assembly.GetName().Version;
            var controls = song?.Controls;
            var provider = onlineState.SelectedKey?.Split(':')[0] ?? "";
            var state = new DesktopDiagnosticState
            {
                Version = version is null ? "未知" : $"{version.Major}.{version.Minor}.{version.Build}",
                WebView = web.CoreWebView2?.Environment.BrowserVersionString ?? "未连接",
                Platform = $"{Environment.OSVersion.VersionString} ({RuntimeInformation.ProcessArchitecture})",
                Player = song?.Source ?? "", Connected = !string.IsNullOrEmpty(song?.Key), Playing = song?.Playing == true,
                Timeline = song?.HasTimeline == true,
                Controls = controls is null ? "未知" : $"播放={controls.Play} 暂停={controls.Pause} 切换={controls.Toggle} 上一首={controls.Previous} 下一首={controls.Next}",
                LyricFormat = lyrics?.Format ?? "无", OnlineProvider = OnlineLyrics.ProviderIds.Contains(provider) ? provider : "无",
                Matching = onlineState.Busy, AudioRequested = preferences.AudioReactive, AudioCapturing = audio.IsCapturing,
                ClickThrough = clickThrough, Topmost = preferences.Topmost,
            };
            Clipboard.SetText(DesktopDiagnosticsReport.Build(state, DataFiles.Root, DateTimeOffset.UtcNow));
            Send("notice", new { text = "诊断信息已复制。", target = new { id = "diagnostics" } });
        }
        catch (Exception error)
        {
            DataFiles.Log(error);
            Send("notice", new { text = "未能复制诊断信息，请稍后重试。", target = new { id = "diagnostics" } });
        }
    }
    private void OpenLogFolder()
    {
        Directory.CreateDirectory(DataFiles.Root);
        Process.Start(new ProcessStartInfo { FileName = DataFiles.Root, UseShellExecute = true });
    }
}
