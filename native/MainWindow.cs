using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

// native/MainWindow.cs
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    private readonly UiDispatcher dispatcher;
    private readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Transparent };
    private readonly Preferences preferences = DataFiles.Load("preferences.json", new Preferences());
    private readonly Task<LyricLibrary> libraryLoad = Task.Run(() => new LyricLibrary());
    private LyricLibrary library = null!; private readonly MediaMonitor media = new(); private readonly AudioSpectrum audio = new();
    private readonly System.Windows.Forms.Timer mediaTimer = new() { Interval = 500 }, audioTimer = new() { Interval = 50 };
    private readonly CancellationTokenSource lifetime = new(); private readonly NotifyIcon tray = new();
    private bool ready, polling, scanning; private int ticks; private Song? song; private Lyrics? lyrics;
    private int sourceRevision;
    private readonly MediaTransport transport = new(log: DataFiles.Log);
    private string lyricKey = "\0";
    private Song? presentedSong;
    public MainWindow()
    {
        dispatcher = new(Environment.CurrentManagedThreadId, action => BeginInvoke(action), () => !IsDisposed && !Disposing && IsHandleCreated);
        Text = "Folia 桌面歌词"; ClientSize = new Size(1200, 760); MinimumSize = new Size(680, 450); FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(9, 11, 18);
        Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? SystemIcons.Application;
        Controls.Add(web); TopMost = preferences.Topmost;
        tray.Icon = Icon; tray.Text = "Folia 桌面歌词 · Ctrl+Alt+L 恢复操作";
        var menu = new ContextMenuStrip(); menu.Items.Add("显示窗口 / 解除鼠标穿透", null, (_, _) => RestoreInteraction()); menu.Items.Add("退出", null, (_, _) => Close());
        tray.ContextMenuStrip = menu; tray.DoubleClick += (_, _) => RestoreInteraction(); tray.Visible = true;
        Shown += async (_, _) => await Initialize();
        Activated += (_, _) => FocusLyricsIfActive();
        mediaTimer.Tick += async (_, _) => await Poll();
        audioTimer.Tick += (_, _) => { if (ready && preferences.AudioReactive && WindowState != FormWindowState.Minimized) Send("spectrum", new { bins = Convert.ToBase64String(audio.Read()), sampleRate = audio.SampleRate }); };
        FormClosed += (_, _) => { lifetime.Cancel(); lyricWork?.Cancel(); online.Dispose(); media.Dispose(); mediaTimer.Dispose(); audioTimer.Dispose(); audio.Dispose(); tray.Visible = false; tray.Dispose(); };
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
            core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false; core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith("https://folia.local/", StringComparison.Ordinal)) e.Cancel = true; };
            core.WebMessageReceived += (_, e) =>
            {
                if (!e.Source.StartsWith("https://folia.local/", StringComparison.Ordinal)) return;
                try
                {
                    using var message = JsonDocument.Parse(e.WebMessageAsJson); var command = message.RootElement.Clone();
                    // Leave the WebView callback before file dialogs or native move/resize loops.
                    BeginInvoke(async () =>
                    {
                        if (IsDisposed || Disposing) return;
                        try { await Command(command); }
                        catch (Exception error) { DataFiles.Log(error); Send("notice", new { text = error.Message }); }
                    });
                }
                catch (Exception error) { DataFiles.Log(error); }
            };
            ApplyAppearance(); web.Source = new Uri("https://folia.local/desktop.html");
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
        if (!ready || polling || IsDisposed) return; polling = true;
        try
        {
            var currentRevision = sourceRevision; var next = await media.Read(preferences.Source, lifetime.Token);
            if (IsDisposed || currentRevision != sourceRevision) return; song = next;
            if (!MediaPresentation.Same(presentedSong, next)) { presentedSong = next; Send("session", next); }
            Send("clock", new { next.Position, next.Duration, next.Rate, next.Playing, next.HasTimeline });
            if (lyricKey != next.Key)
            {
                lyricKey = next.Key; BeginResolve(next, true);
            }
            else if (automaticLookup && lyrics is null && !onlineState.Busy && lookupDuration <= 0 && next.Duration > 0) BeginResolve(next, false);
            if (++ticks % 4 == 0) { audio.Ensure(preferences.AudioReactive); Send("audioStatus", new { text = audio.Status }); }
        }
        catch (OperationCanceledException) { }
        catch (Exception e) { media.Invalidate(); DataFiles.Log(e); Send("connectionError", new { text = "系统媒体连接暂不可用：" + e.Message }); }
        finally { polling = false; }
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
