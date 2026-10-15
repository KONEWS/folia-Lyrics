// native/WindowTray.cs — tray commands reuse window controls and queue precise settings navigation until WebView is ready.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private TrayMenu? trayMenu;
    private string? pendingTraySettings;
    private void InitializeTray()
    {
        tray.Icon = Icon; tray.Text = recoveryHotkey.TrayText;
        tray.MouseUp += (_, eventArgs) =>
        {
            if (eventArgs.Button != MouseButtons.Right || IsDisposed || Disposing) return;
            trayMenu ??= new TrayMenu(ExecuteTrayAction);
            trayMenu.Open(Cursor.Position, preferences.Topmost, this, recoveryShortcutAvailable: recoveryHotkey.Registered);
        };
        tray.DoubleClick += (_, _) => RestoreInteraction(); tray.Visible = true;
    }
    private void ExecuteTrayAction(TrayMenuAction action)
    {
        if (IsDisposed || Disposing) return;
        switch (action)
        {
            case TrayMenuAction.Show:
            case TrayMenuAction.Restore: RestoreInteraction(); break;
            case TrayMenuAction.Topmost: TopMost = preferences.Topmost = !preferences.Topmost; SavePreferences(); break;
            case TrayMenuAction.LyricsSettings: OpenTraySettings("visual-settings"); break;
            case TrayMenuAction.MusicApps: OpenTraySettings("music-apps"); break;
            case TrayMenuAction.Exit: Close(); break;
        }
    }
    // openSettings already restores the web interaction state; one message avoids cancelling its lazy navigation request.
    private void OpenTraySettings(string target)
    {
        SetClickThrough(false); Show(); WindowState = FormWindowState.Normal; Activate();
        pendingTraySettings = target; SendPendingTraySettings();
    }
    private void SendPendingTraySettings()
    {
        if (!ready || pendingTraySettings is not { } target) return;
        pendingTraySettings = null; Send("openSettings", new { target = new { id = target } });
    }
}
