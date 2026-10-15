using Microsoft.Win32;
using System.Text.Json;

// test/window-placement-smoke/TestWindow.cs — unshown forms use fixture monitors, never the user's windows or preference files.
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    private readonly Preferences preferences = new();
    private readonly UiDispatcher dispatcher;
    private bool ready = true, fullscreen;
    public readonly List<string> Notices = [];
    public MainWindow(WindowMonitor[] monitors)
    {
        dispatcher = new(Environment.CurrentManagedThreadId, action => action(), () => !IsDisposed);
        Bounds = new(100, 80, 1000, 600); MinimumSize = new(680, 450);
        InitializeWindowPlacement(); placementScreens = monitors; placementTracking = true;
    }
    public WindowPlacementState? Placement => preferences.WindowPlacement;
    public bool SaveScheduled => placementSaveTimer.Enabled;
    public void MoveTo(Rectangle bounds) => Bounds = bounds;
    public void Flush() => FlushWindowPlacement();
    public void CaptureNow() => CaptureWindowPlacement();
    public void EndGesture() => OnResizeEnd(EventArgs.Empty);
    public void ExitForTest() => OnFormClosing(new FormClosingEventArgs(CloseReason.UserClosing, false));
    public void ChangeTopmostPreference(bool value) => preferences.Topmost = value;
    public void SetReady(bool value) { ready = value; SendPendingWindowPlacementNotice(); }
    public void RestoreForTest(WindowPlacementState? placement)
    {
        placementTracking = false; preferences.WindowPlacement = placement; RestoreWindowPlacement(); placementTracking = true;
        CaptureWindowPlacement();
    }
    public void FullscreenForTest(bool enabled, Rectangle bounds)
    { SuspendWindowPlacement(); fullscreen = enabled; Bounds = bounds; ResumeWindowPlacement(); }
    public void ChangeMonitorsForTest(WindowMonitor[] monitors)
    { placementScreens = monitors; EnsureWindowPlacementVisible(); CaptureWindowPlacement(); }
    private void Send(string type, object data)
    { if (type == "notice") Notices.Add(JsonSerializer.SerializeToElement(data).GetProperty("text").GetString()!); }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { SystemEvents.DisplaySettingsChanged -= PlacementDisplaysChanged; placementSaveTimer.Dispose(); }
        base.Dispose(disposing);
    }
}
internal static class DataFiles
{
    internal static bool SaveSucceeds = true;
    internal static readonly List<(int Thread, Preferences Value)> Writes = [];
    internal static bool TrySave<T>(string name, T value)
    {
        if (name != "preferences.json") throw new InvalidOperationException("Unexpected save target.");
        Writes.Add((Environment.CurrentManagedThreadId, JsonSerializer.Deserialize<Preferences>(JsonSerializer.Serialize(value))!));
        return SaveSucceeds;
    }
}
