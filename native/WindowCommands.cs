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
            case "ready": ready = true; FocusLyricsIfActive(); SendWindowState(); statusKey = ""; SendAppearance(); Send("preferences", preferences); Send("library", library.Summary());
                if (song is not null) Send("session", song); if (lyrics is not null) Send("lyrics", lyrics); Send("online", onlineState); mediaTimer.Start(); audioTimer.Start(); await Poll(); break;
            case "import":
                using (var dialog = new OpenFileDialog { Title = "读取音乐文件中的歌词或独立歌词（不会播放）", Filter = "音乐或歌词|*.flac;*.mp3;*.m4a;*.mp4;*.ogg;*.opus;*.wav;*.ape;*.wma;*.aiff;*.lrc;*.ttml;*.yrc;*.qrc;*.fia|所有文件|*.*" })
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK) return; var target = song; var work = StartWork(); automaticLookup = false;
                    var imported = await Task.Run(() => library.Import(dialog.FileName, target));
                    if (song?.Key != target?.Key || work.Revision != lyricRevision) { Send("notice", new { text = "歌词已保存，播放器已切歌，未覆盖当前歌曲。" }); return; }
                    if (target is not null) onlineCache.Forget(target); OnlineStatus(new(song?.Key ?? "", false, "已使用导入的本地歌词", [], []));
                    lyrics = imported; lyricKey = song?.Key ?? ""; Send("lyrics", imported); Send("library", library.Summary());
                }
                break;
            case "addFolder":
                using (var dialog = new FolderBrowserDialog { Description = "选择音乐或歌词目录", UseDescriptionForTitle = true })
                    if (dialog.ShowDialog(this) == DialogResult.OK) await Scan(dialog.SelectedPath);
                break;
            case "rescan": await Scan(null); break;
            case "source":
                StartWork(); sourceRevision++; media.Invalidate();
                song = new("", "", "", "", "", false, 0, 0, 1, false, song?.Sources ?? []);
                Send("session", song); preferences.Source = cmd.GetProperty("value").GetString() ?? "";
                lyricKey = "\0"; statusKey = ""; SavePreferences(); await Poll(); break;
            case "window": WindowCommand(cmd.GetProperty("value")); break;
            case "mediaControl": await ControlMedia(cmd.GetProperty("value")); break;
            case "systemVolume": ChangeSystemVolume(cmd); break;
            case "topmost": TopMost = preferences.Topmost = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "closeToTaskbar": preferences.CloseToTaskbar = cmd.GetProperty("value").GetBoolean(); SavePreferences(); break;
            case "audioReactive": preferences.AudioReactive = cmd.GetProperty("value").GetBoolean(); audio.Ensure(preferences.AudioReactive); SavePreferences(); break;
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
            case "selectOnline": await SelectOnline(cmd.GetProperty("value")); break;
            case "resetOnline": if (song is not null) { onlineCache.Forget(song); BeginResolve(song, true); } break;
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
        await Poll();
    }
    private async Task Scan(string? folder)
    {
        if (scanning) return; scanning = true; Send("scan", new { active = true, text = "正在扫描本地目录…" });
        try { await library.Scan(folder, text => Send("scan", new { active = true, text }), lifetime.Token); lyricKey = "\0"; Send("library", library.Summary()); Send("notice", new { text = "目录已更新，歌词将自动匹配。" }); }
        catch (OperationCanceledException) { }
        finally { scanning = false; Send("scan", new { active = false, text = "" }); }
    }
    private void SavePreferences() { DataFiles.Save("preferences.json", preferences); Send("preferences", preferences); }
    private void ToggleFullscreen()
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
    private void SetClickThrough(bool enabled)
    {
        if (enabled && !preferences.TransparentBackground) { preferences.TransparentBackground = true; SavePreferences(); }
        clickThrough = enabled; var style = GetWindowLongPtr(Handle, -20).ToInt64();
        SetWindowLongPtr(Handle, -20, new IntPtr(enabled ? style | 0x20 | 0x80000 : style & ~(0x20 | 0x80000)));
        if (enabled) { SetLayeredWindowAttributes(Handle, 0, 255, 2); tray.ShowBalloonTip(4000, Text, "已启用鼠标穿透。按 Ctrl+Alt+L 或双击托盘图标恢复操作。", ToolTipIcon.Info); }
        ApplyAppearance(); SendWindowState();
    }
    private void RestoreInteraction() { SetClickThrough(false); Show(); WindowState = FormWindowState.Normal; Activate(); Send("restore", new { }); }
    protected override void WndProc(ref Message message)
    {
        if (HandleCustomFrame(ref message)) return;
        if (message.Msg == 0x312 && message.WParam.ToInt32() == 1) RestoreInteraction();
        base.WndProc(ref message);
        if (message.Msg is 0x31E or 0x31A or 0x1A) ApplyAppearance();
    }
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll")] private static extern bool SetLayeredWindowAttributes(IntPtr window, uint color, byte alpha, uint flags);
}
