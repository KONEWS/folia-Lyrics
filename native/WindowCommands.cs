using System.Runtime.InteropServices;
using System.Text.Json;

// native/WindowCommands.cs
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool fullscreen, clickThrough; private Rectangle restoreBounds; private FormWindowState restoreState;
    private async Task Command(JsonElement cmd)
    {
        switch (cmd.GetProperty("type").GetString())
        {
            case "ready": NormalizeMusicApps(); ready = true; UpdateAudioCapture(); FocusLyricsIfActive(); windowStateSent = false; SendWindowState(); presentedSong = null; SendAppearance(); Send("preferences", preferences); Send("library", library.Summary());
                if (song is not null) Send("session", song); if (lyrics is not null) Send("lyrics", lyrics); Send("online", onlineState); SendMusicAppDiscovery(); SendPendingTraySettings(); SendPendingRecoveryHotkeyNotice(); SendPendingWindowPlacementNotice(); mediaTimer.Start(); ApplyBackgroundStateForCurrentWindow(); StartMusicAppDiscovery(); await Poll(); break;
            case "import":
                using (var dialog = new OpenFileDialog { Title = "读取音乐文件中的歌词或独立歌词（不会播放）", Filter = "音乐或歌词|*.flac;*.mp3;*.m4a;*.mp4;*.ogg;*.opus;*.wav;*.ape;*.wma;*.aiff;*.lrc;*.ttml;*.yrc;*.qrc;*.fia|所有文件|*.*" })
                {
                    if (dialog.ShowDialog(this) == DialogResult.OK) await ImportLyrics(dialog.FileName);
                }
                break;
            case "addFolder":
                using (var dialog = new FolderBrowserDialog { Description = "选择音乐或歌词目录", UseDescriptionForTitle = true })
                    if (dialog.ShowDialog(this) == DialogResult.OK) await Scan(dialog.SelectedPath);
                break;
            case "rescan": await Scan(null); break;
            case "source":
                StartWork(); sourceRevision++; media.Invalidate();
                song = new("", "", "", "", "", false, 0, 0, 1, false, song?.Sources ?? [], Sequence: ++clockSequence);
                Send("session", song); preferences.Source = cmd.GetProperty("value").GetString() ?? "";
                lyricKey = "\0"; presentedSong = null; SavePreferences(); await Poll(); break;
            case "addMusicApp": await ChooseMusicApp(null); break;
            case "bindMusicApp": await ChooseMusicApp(MusicAppLauncher.ReadSlot(cmd)); break;
            case "removeMusicApp": RemoveMusicApp(MusicAppLauncher.ReadSlot(cmd)); break;
            case "launchMusicApp": await LaunchMusicApp(MusicAppLauncher.ReadSlot(cmd)); break;
            case "showMusicAppAddButton": preferences.ShowMusicAppAddButton = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "autoDiscoverMusicApps": SetMusicAppDiscovery(cmd.GetProperty("value").GetBoolean()); break;
            case "scanMusicApps": await DiscoverMusicApps(installed: true, notify: true); break;
            case "confirmMusicApps": ConfirmMusicApps(cmd.GetProperty("value")); break;
            case "dismissMusicAppDiscovery": DismissMusicAppDiscovery(cmd.GetProperty("value")); break;
            case "blockMusicApp": BlockMusicApp(cmd.GetProperty("value")); break;
            case "unblockMusicApp": await UnblockMusicApp(cmd.GetProperty("value")); break;
            case "window": WindowCommand(cmd.GetProperty("value")); break;
            case "mediaControl": await ControlMedia(cmd.GetProperty("value")); break;
            case "systemVolume": ChangeSystemVolume(cmd); break;
            case "topmost": TopMost = preferences.Topmost = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "closeToTaskbar": preferences.CloseToTaskbar = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "audioReactive": preferences.AudioReactive = cmd.GetProperty("value").GetBoolean(); UpdateAudioCapture(); ApplyBackgroundStateForCurrentWindow(); SavePreferences(); break;
            case "transparentBackground": preferences.TransparentBackground = cmd.GetProperty("value").GetBoolean(); ApplyAppearance(); SavePreferences(); break;
            case "coverTheme": preferences.CoverTheme = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "autoImmersive": preferences.AutoImmersive = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "bottomHoverControls": preferences.BottomHoverControls = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "immersiveDelay":
                if (cmd.GetProperty("value").TryGetInt32(out var delay) && delay is >= 1 and <= 3600) { preferences.ImmersiveDelay = delay; SavePreferences(); }
                break;
            case "fullscreen": ToggleFullscreen(); break;
            case "exitFullscreen": if (fullscreen) ToggleFullscreen(); break;
            case "clickThrough": SetClickThrough(!clickThrough); break;
            case "onlineEnabled": preferences.OnlineEnabled = cmd.GetProperty("value").GetBoolean(); OnlinePreferenceChanged(); break;
            case "onlineProvider":
                var value = cmd.GetProperty("value"); var provider = value.Text("id");
                if (!OnlineLyrics.ProviderIds.Contains(provider)) throw new IOException("未知歌词源");
                preferences.OnlineProviders = value.GetProperty("enabled").GetBoolean() ? EnabledSources().Append(provider).Distinct().ToArray() : EnabledSources().Where(p => p != provider).ToArray();
                OnlinePreferenceChanged(); break;
            case "searchOnline": await SearchOnline(cmd.GetProperty("value")); break;
            case "lyricInspection": CompleteLyricInspection(cmd.GetProperty("value")); break;
            case "rendererError": LogRendererError(cmd.GetProperty("value")); break;
            case "cancelOnline": CancelOnlineOperation(); break;
            case "copyDiagnostics": CopyDiagnostics(); break;
            case "openLogFolder": OpenLogFolder(); break;
            case "selectOnline": await SelectOnline(cmd.GetProperty("value")); break;
            case "resetOnline": await ResetOnline(); break;
        }
    }
    private async Task ControlMedia(JsonElement value)
    {
        var request = new MediaControlRequest(value.Text("requestId"), value.Text("sessionId"), value.Text("songKey"), value.Text("action"));
        if (request.RequestId.Length is 0 or > 80 || request.SessionId.Length > 80 || request.SongKey.Length > 8192) return;
        var currentRevision = sourceRevision;
        var result = await transport.Execute(request, () => media.Resolve(request),
            () => !IsDisposed && currentRevision == sourceRevision && song?.SessionId == request.SessionId && song.Key == request.SongKey && media.IsCurrent(request), lifetime.Token);
        MediaDiagnostics.Write($"action={request.Action}; success={result.Success}; result={result.Message}");
        Send("transport", result);
        RequestMediaPoll();
    }
    private async Task Scan(string? folder)
    {
        if (scanning) return; scanning = true; Send("scan", new { active = true, text = "正在扫描本地目录…" });
        try
        {
            var saved = await library.Scan(folder, text => Send("scan", new { active = true, text }), lifetime.Token);
            lyricKey = "\0"; Send("library", library.Summary());
            Send("notice", new { text = saved ? "目录已更新，歌词将自动匹配。" : "目录已更新，本次可自动匹配歌词，但未能保存，重启后可能恢复原目录记录。", target = new { id = "local-folders" } });
        }
        catch (OperationCanceledException) { }
        finally { scanning = false; Send("scan", new { active = false, text = "" }); }
    }
    // Renderer failures reach the same bounded, deduplicated native log as host errors.
    private static void LogRendererError(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object) return;
        string Field(string name, int limit) { var text = value.Text(name); return text.Length <= limit ? text : text[..limit]; }
        DataFiles.Log(new InvalidOperationException($"歌词动效 {Field("mode", 40)}：{Field("message", 1024)}\n{Field("stack", 8192)}\n{Field("componentStack", 8192)}"));
    }
    private void ToggleFullscreen()
    {
        SuspendWindowPlacement();
        try
        {
            if (fullscreen)
            {
                fullscreen = false; UpdateFrameStyles(); Bounds = restoreBounds; WindowState = restoreState;
            }
            else
            {
                restoreState = WindowState; restoreBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                WindowState = FormWindowState.Normal; fullscreen = true; UpdateFrameStyles(); Bounds = Screen.FromControl(this).Bounds;
            }
            ApplyAppearance(); SendWindowState();
        }
        finally { ResumeWindowPlacement(); }
    }
    private void SetClickThrough(bool enabled)
    {
        if (enabled && !preferences.TransparentBackground) { preferences.TransparentBackground = true; SavePreferences(); }
        clickThrough = enabled; var style = GetWindowLongPtr(Handle, -20).ToInt64();
        SetWindowLongPtr(Handle, -20, new IntPtr(enabled ? style | 0x20 | 0x80000 : style & ~(0x20 | 0x80000)));
        if (enabled) { SetLayeredWindowAttributes(Handle, 0, 255, 2); tray.ShowBalloonTip(4000, Text, ClickThroughRecoveryNotice, ToolTipIcon.Info); }
        ApplyAppearance(); SendWindowState();
    }
    private void RestoreInteraction() { SetClickThrough(false); Show(); WindowState = FormWindowState.Normal; Activate(); Send("restore", new { }); }
    protected override void WndProc(ref Message message)
    {
        if (HandleCustomFrame(ref message)) return;
        if (message.Msg == 0x312 && message.WParam.ToInt32() == 1) RestoreInteraction();
        base.WndProc(ref message);
        if (message.Msg is 0x31E or 0x31A or 0x1A) ApplyAppearance();
        // WM_SIZE: the size type says whether the window was minimized, restored or maximized.
        if (message.Msg == 0x5) OnSizeMessage(message.WParam.ToInt64());
    }
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll")] private static extern bool SetLayeredWindowAttributes(IntPtr window, uint color, byte alpha, uint flags);
}
