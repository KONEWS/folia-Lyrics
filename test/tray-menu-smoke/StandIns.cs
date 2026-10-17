using System.Drawing;
using System.Windows.Forms;

// test/tray-menu-smoke/StandIns.cs — in-memory tray and window controls with no real configuration, UI or audio.
namespace System.Windows.Forms
{
    internal enum MouseButtons { Left, Right }
    internal enum FormWindowState { Normal, Minimized }
    internal static class Cursor { public static Point Position => new(950, 740); }
    internal sealed class MouseEventArgs(MouseButtons button) : EventArgs { public MouseButtons Button => button; }
    internal sealed class NotifyIcon
    {
        public object? Icon; public string Text = ""; public bool Visible;
        public event EventHandler<MouseEventArgs>? MouseUp;
        public event EventHandler? DoubleClick;
        public void Click(MouseButtons button) => MouseUp?.Invoke(this, new(button));
        public void Double() => DoubleClick?.Invoke(this, EventArgs.Empty);
    }
}
namespace FoliaLyrics
{
    internal sealed class TrayMenu(Action<TrayMenuAction> execute)
    {
        public readonly List<(Point Point, bool Pinned)> Opens = [];
        public bool RecoveryShortcutAvailable;
        public void Open(Point position, bool pinned, object owner, bool solid = false, bool recoveryShortcutAvailable = true)
        { RecoveryShortcutAvailable = recoveryShortcutAvailable; Opens.Add((position, pinned)); }
        public void Execute(TrayMenuAction action) => execute(action);
    }
    internal sealed class Preferences { public bool Topmost; }
    internal sealed partial class MainWindow
    {
        private readonly NotifyIcon tray = new(); private readonly Preferences preferences = new(); private bool ready;
        private readonly RecoveryHotkeyPolicy recoveryHotkey = new();
        public object Icon = new(); public bool IsDisposed, Disposing, TopMost;
        public FormWindowState WindowState = FormWindowState.Minimized;
        public readonly List<string> Calls = []; public readonly List<(string Type, object Data)> Messages = [];
        public void Initialize() => InitializeTray();
        public void RightClick() => tray.Click(MouseButtons.Right);
        public void LeftClick() => tray.Click(MouseButtons.Left);
        public void DoubleClick() => tray.Double();
        public void Action(TrayMenuAction action) => ExecuteTrayAction(action);
        public void PageReady() { ready = true; SendPendingTraySettings(); }
        public void SetReady(bool value) => ready = value;
        public bool TrayVisible => tray.Visible;
        public int OpenCount => trayMenu?.Opens.Count ?? 0;
        public bool LastPinned => trayMenu?.Opens.Last().Pinned ?? false;
        public bool MenuShortcutAvailable => trayMenu?.RecoveryShortcutAvailable ?? false;
        public string TrayText => tray.Text;
        public void RegisterRecovery(bool result) { recoveryHotkey.Register(() => result, () => 1409, _ => { }); tray.Text = recoveryHotkey.TrayText; }
        public bool SavedPinned => preferences.Topmost;
        private void RestoreInteraction() => Calls.Add("restore");
        private void SavePreferences() => Calls.Add("save");
        private void SetTopmostPreference(bool enabled) { TopMost = preferences.Topmost = enabled; SavePreferences(); }
        private void SetClickThrough(bool value) => Calls.Add("clickThrough=" + value);
        private void Show() => Calls.Add("show");
        private void Activate() => Calls.Add("activate");
        private void Close() => Calls.Add("close");
        private void Send(string type, object data) => Messages.Add((type, data));
    }
}
