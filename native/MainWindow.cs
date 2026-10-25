using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

// native/MainWindow.cs
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    // Match the desktop theme while WebView starts or the system disables transparent materials.
    private static readonly Color DesktopBackground = Color.FromArgb(11, 13, 23);
    private readonly UiDispatcher dispatcher;
    private readonly WebView2 web = new() { DefaultBackgroundColor = Color.Transparent, BackColor = DesktopBackground };
    private readonly Preferences preferences = DataFiles.Load("preferences.json", new Preferences());
    private readonly Task<LyricLibrary> libraryLoad = Task.Run(() => new LyricLibrary());
    private LyricLibrary library = null!; private readonly MediaMonitor media = new(); private readonly AudioSpectrum audio = new();
    private readonly System.Windows.Forms.Timer mediaTimer = new() { Interval = 500 }, audioTimer = new() { Interval = 50 };
    private readonly CancellationTokenSource lifetime = new(); private readonly NotifyIcon tray = new();
    private bool ready, polling, scanning; private int ticks; private Song? song; private Lyrics? lyrics;
    private bool pollAgain; private int mediaRefreshQueued; private long clockSequence;
    private int sourceRevision;
    private CancellationTokenSource? mediaRead;
    private readonly MediaTransport transport = new(log: DataFiles.Log);
    private string lyricKey = "\0";
    private Song? presentedSong;
    // True once the last spectrum frame sent to the page was all zeros (nothing more to send until sound returns).
    private bool spectrumSilent;
    private readonly Queue<long> webReloads = new();
    private const string AppOrigin = "https://folia.local/";
    // The page only sends small control JSON (the largest field is a song key); anything near this size is not from the page.
    private const int MaxWebMessageChars = 1 << 20, MaxWebReloads = 3;
    private const long WebReloadWindowMs = 120_000;
    public MainWindow()
    {
        dispatcher = new(Environment.CurrentManagedThreadId, action => BeginInvoke(action), () => !IsDisposed && !Disposing && IsHandleCreated);
        Text = "Folia 桌面歌词"; ClientSize = new Size(1200, 760); MinimumSize = new Size(680, 450); FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen; BackColor = DesktopBackground;
        Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? SystemIcons.Application;
        Controls.Add(web); InitializeWebLayout(); InitializeBackgroundMemory(); TopMost = preferences.Topmost;
        InitializeLaunchForeground();
        InitializeTray();
        InitializeWindowPlacement();
        Shown += async (_, _) => await Initialize();
        Activated += (_, _) => FocusLyricsIfActive();
        mediaTimer.Tick += async (_, _) => await Poll();
        media.RefreshRequested += RequestMediaPoll;
        audioTimer.Tick += (_, _) => SendSpectrum();
        FormClosed += (_, _) => { lifetime.Cancel(); lyricWork?.Cancel(); online.Dispose(); media.Dispose(); mediaTimer.Dispose(); audioTimer.Dispose(); audio.Dispose(); tray.Visible = false; trayMenu?.Dispose(); tray.Dispose(); };
    }
    // 仅给当前前台歌词窗口补焦点，异步初始化完成时不抢其他程序的焦点。
    private void FocusLyricsIfActive()
    {
        if (ready && !clickThrough && ActiveForm == this && WindowState != FormWindowState.Minimized
            && !IsDisposed && !Disposing && web.CanFocus && !web.ContainsFocus) web.Focus();
    }
    private async Task Initialize()
    {
        try
        {
            Directory.CreateDirectory(DataFiles.Root);
            var browser = InitializeBrowser();
            var assets = Task.Run(DataFiles.Assets, lifetime.Token);
            await Task.WhenAll(browser, assets, libraryLoad);
            if (IsDisposed || Disposing || lifetime.IsCancellationRequested) return;
            library = await libraryLoad; var core = await browser;
            core.SetVirtualHostNameToFolderMapping("folia.local", await assets, CoreWebView2HostResourceAccessKind.DenyCors);
            InitializeVideoLayer(core);
            core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false; core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(AppOrigin, StringComparison.Ordinal)) e.Cancel = true; };
            core.ProcessFailed += (_, e) => OnWebProcessFailed(e);
            core.WebMessageReceived += (_, e) =>
            {
                if (!e.Source.StartsWith(AppOrigin, StringComparison.Ordinal)) return;
                try
                {
                    var json = e.WebMessageAsJson;
                    if (json.Length > MaxWebMessageChars) return;
                    using var message = JsonDocument.Parse(json); var command = message.RootElement.Clone();
                    // Leave the WebView callback before file dialogs or native move/resize loops.
                    BeginInvoke(async () =>
                    {
                        if (IsDisposed || Disposing) return;
                        try { await Command(command); }
                        catch (Exception error) { DataFiles.Log(error); Send("notice", new { text = error.Message, target = DesktopNoticeTargets.ForCommand(command) }); }
                    });
                }
                catch (Exception error) { DataFiles.Log(error); }
            };
            ApplyAppearance(); web.Source = new Uri(AppOrigin + "desktop.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (IsDisposed || Disposing) return;
            MessageBox.Show("需要 Microsoft Edge WebView2 Runtime 才能显示歌词。请安装微软 WebView2 Evergreen Runtime 后重新打开。\n\nhttps://developer.microsoft.com/microsoft-edge/webview2/", Text); Close();
        }
        catch (Exception e) { if (IsDisposed || Disposing) return; DataFiles.Log(e); MessageBox.Show("界面启动失败：" + e.Message, Text); Close(); }
    }
    // WebView initialization stays on the UI context while asset extraction and library loading run alongside it.
    private async Task<CoreWebView2> InitializeBrowser()
    {
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataFiles.Root, "browser"));
        await web.EnsureCoreWebView2Async(environment);
        return web.CoreWebView2;
    }
    private async Task Poll()
    {
        if (!ready || IsDisposed) return;
        if (polling) { pollAgain = true; return; }
        polling = true;
        using var read = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        mediaRead = read;
        try
        {
            var currentRevision = sourceRevision;
            var next = await MediaReadDeadline.Read(token => media.Read(preferences.Source, preferences.MusicApps, token), read.Token);
            if (IsDisposed || currentRevision != sourceRevision) return; song = next = next with { Sequence = ++clockSequence };
            if (!MediaPresentation.Same(presentedSong, next)) { presentedSong = next; Send("session", next); }
            Send("clock", new { next.Key, next.SessionId, next.Sequence, next.Position, next.Duration, next.Rate, next.Playing, next.HasTimeline });
            if (lyricKey != next.Key)
            {
                lyricKey = next.Key; BeginResolve(next, true);
            }
            else if (automaticLookup && lyrics is null && !onlineState.Busy && lookupDuration <= 0 && next.Duration > 0) BeginResolve(next, false);
            if (++ticks % 4 == 0) { UpdateAudioCapture(checkDevice: true); Send("audioStatus", new { text = audio.Status }); }
        }
        catch (OperationCanceledException) { }
        catch (TimeoutException e) { media.Reconnect(); DataFiles.Log(e); Send("connectionError", new { text = e.Message }); }
        catch (Exception e) { media.Reconnect(); DataFiles.Log(e); Send("connectionError", new { text = "系统媒体连接暂不可用：" + e.Message }); }
        finally { mediaRead = null; polling = false; if (pollAgain) { pollAgain = false; RequestMediaPoll(); } }
    }
    // Merge a burst of native events into one UI refresh and retain a request made during a slow first read.
    private void RequestMediaPoll()
    {
        if (Interlocked.Exchange(ref mediaRefreshQueued, 1) != 0) return;
        dispatcher.Run(() => BeginInvoke(async () =>
        {
            Interlocked.Exchange(ref mediaRefreshQueued, 0);
            if (!lifetime.IsCancellationRequested && !IsDisposed && !Disposing) await Poll();
        }));
    }
    // 发送一帧频谱。停止采集或声音归零后，页面已持有全零帧时不再重复发送（页面把超过 500 ms 的频谱视为静音并自行清零），
    // 静音时就不必每 50 ms 序列化并发送约 1.4 KB；声音恢复的第一帧立即发送。
    private void SendSpectrum()
    {
        try
        {
            if (!ready || !preferences.AudioReactive || WindowState == FormWindowState.Minimized) return;
            var bins = audio.Read();
            var silent = !bins.Any(value => value != 0);
            if (silent && spectrumSilent) return;
            spectrumSilent = silent;
            Send("spectrum", new { bins = Convert.ToBase64String(bins), sampleRate = audio.SampleRate });
        }
        catch (Exception error) { DataFiles.Log(error); }
    }
    // 渲染进程崩溃会让窗口一直空白：重新加载页面（页面加载后会重新发送 ready，宿主随即补发全部状态）。
    // 两分钟内最多重载 3 次，页面反复崩溃时不会无限循环；无响应只记录，因为解析超大歌词可能让页面暂时卡住。
    private void OnWebProcessFailed(CoreWebView2ProcessFailedEventArgs e)
    {
        DataFiles.Log(new InvalidOperationException($"WebView2 进程失败：{e.ProcessFailedKind}，原因 {e.Reason}，退出码 {e.ExitCode}"));
        if (e.ProcessFailedKind != CoreWebView2ProcessFailedKind.RenderProcessExited || IsDisposed || Disposing) return;
        var now = Environment.TickCount64;
        while (webReloads.Count > 0 && now - webReloads.Peek() > WebReloadWindowMs) webReloads.Dequeue();
        if (webReloads.Count >= MaxWebReloads) return;
        webReloads.Enqueue(now);
        BeginInvoke(() => { try { if (!IsDisposed && !Disposing) web.CoreWebView2?.Reload(); } catch (Exception error) { DataFiles.Log(error); } });
    }
    private void Send(string type, object data)
    {
        dispatcher.Run(() =>
        {
            if (!ready || web.IsDisposed || web.CoreWebView2 is null) return;
            web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type, data }, DataFiles.Json));
        });
    }
}
