using FoliaLyrics;
using System.Drawing;
using System.Text.Json;

// test/tray-menu-smoke/Program.cs — actual tray routing, queued navigation and multi-monitor placement checks.
var count = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception("FAIL " + label);
    count++; Console.WriteLine("PASS " + label);
}
var window = new MainWindow(); window.Initialize();
Check(window.TrayVisible, "the notification icon is visible");
window.LeftClick(); Check(window.OpenCount == 0, "a single left click does not open the context menu");
window.RightClick(); Check(window.OpenCount == 1 && !window.LastPinned, "right click opens with current pin state");
window.DoubleClick(); Check(window.Calls.SequenceEqual(["restore"]), "double click uses the existing restore path");
window.Calls.Clear(); window.Action(TrayMenuAction.Show); window.Action(TrayMenuAction.Restore);
Check(window.Calls.SequenceEqual(["restore", "restore"]), "show and restore both recover interaction");
window.Calls.Clear(); window.Action(TrayMenuAction.Topmost); window.RightClick();
Check(window.TopMost && window.SavedPinned && window.LastPinned && window.Calls.SequenceEqual(["save"]), "pin changes the live window, persistence and next menu together");
window.Action(TrayMenuAction.Topmost); Check(!window.TopMost && !window.SavedPinned, "pin toggles back off");
window.Calls.Clear(); window.Action(TrayMenuAction.LyricsSettings);
Check(window.Messages.Count == 0 && window.Calls.SequenceEqual(["clickThrough=False", "show", "activate"])
    && window.WindowState == System.Windows.Forms.FormWindowState.Normal, "settings restore the native window while waiting for the page");
window.PageReady();
Check(window.Messages.Count == 1 && window.Messages[0].Type == "openSettings"
    && JsonSerializer.Serialize(window.Messages[0].Data) == "{\"target\":{\"id\":\"visual-settings\"}}", "queued lyrics settings use the precise navigation contract");
window.PageReady(); Check(window.Messages.Count == 1, "a repeated ready does not replay the queued navigation");
window.Action(TrayMenuAction.MusicApps);
Check(window.Messages.Count == 2 && JsonSerializer.Serialize(window.Messages[1].Data) == "{\"target\":{\"id\":\"music-apps\"}}", "music management navigates directly to its section");
Check(window.Messages.All(message => message.Type == "openSettings"), "settings navigation remains one message and cannot be cancelled by a second restore");
window.SetReady(false); window.Action(TrayMenuAction.LyricsSettings); window.Action(TrayMenuAction.MusicApps); window.PageReady();
Check(window.Messages.Count == 3 && JsonSerializer.Serialize(window.Messages[2].Data).Contains("music-apps"), "the most recent requested section wins during page startup");
window.Calls.Clear(); window.Action(TrayMenuAction.Exit); Check(window.Calls.SequenceEqual(["close"]), "exit uses the window close policy");
window.IsDisposed = true; window.Calls.Clear(); var opens = window.OpenCount; window.RightClick(); window.Action(TrayMenuAction.Exit);
Check(window.Calls.Count == 0 && window.OpenCount == opens, "closed windows ignore late tray input");
window.IsDisposed = false; window.Disposing = true; window.RightClick(); window.Action(TrayMenuAction.Topmost);
Check(window.Calls.Count == 0 && window.OpenCount == opens, "closing windows ignore late tray input");
Check(TrayMenuLayout.Labels.Length == Enum.GetValues<TrayMenuAction>().Length, "all six rows map to commands");
foreach (var scale in new[] { 1f, 1.25f, 1.5f, 2f })
{
    var size = new Size((int)Math.Ceiling(TrayMenuLayout.Width * scale), (int)Math.Ceiling(TrayMenuLayout.Height * scale));
    var rows = Enumerable.Range(0, 6).Select(index => TrayMenuLayout.Item(index, scale)).ToArray();
    Check(rows.All(row => new Rectangle(Point.Empty, size).Contains(row)) && rows.Zip(rows.Skip(1)).All(pair => pair.First.Bottom <= pair.Second.Top), $"rows fit without overlap at {scale * 100}% DPI");
    foreach (var area in new[] { new Rectangle(0, 0, 1920, 1040), new Rectangle(-1920, -400, 1920, 1040), new Rectangle(1920, 0, 2560, 1400) })
    {
        var anchors = new[] { area.Location, new Point(area.Right, area.Bottom), new Point(area.Left - 100, area.Top - 100) };
        Check(anchors.All(anchor => area.Contains(new Rectangle(TrayMenuLayout.Position(anchor, size, area), size))), $"menu stays in work area {area.Location} at {scale * 100}% DPI");
    }
}
Check(TrayMenuLayout.Next(5, 1) == 0 && TrayMenuLayout.Next(0, -1) == 5 && TrayMenuLayout.Next(-1, 1) == 0, "arrow navigation wraps across the menu ends");
var recoveryWindow = new MainWindow(); recoveryWindow.Initialize(); recoveryWindow.RegisterRecovery(false); recoveryWindow.RightClick();
Check(!recoveryWindow.MenuShortcutAvailable && !recoveryWindow.TrayText.Contains("Ctrl+Alt+L"), "failed registration hides the unavailable shortcut in both real tray routing and tooltip");
recoveryWindow.RegisterRecovery(true); recoveryWindow.RightClick();
Check(recoveryWindow.MenuShortcutAvailable && recoveryWindow.TrayText.Contains("Ctrl+Alt+L"), "successful registration passes shortcut availability to the tray menu");
RecoveryHotkeyChecks.Run(Check);
Console.WriteLine($"{count} tray-menu checks passed");
