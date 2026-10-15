using Microsoft.Win32;
using System.Runtime.InteropServices;

// native/WindowPlacement.cs — keep window geometry on the UI thread and coalesce writes without capturing minimized/fullscreen bounds.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private static readonly Size OrdinaryWindowMinimum = new(680, 450);
    private readonly System.Windows.Forms.Timer placementSaveTimer = new() { Interval = 750 };
    private WindowMonitor[]? placementScreens;
    private bool placementTracking, placementSuspended, placementAdjusting, placementDirty, placementFailurePending, placementFailureReported;
    private void InitializeWindowPlacement()
    {
        Load += (_, _) => RestoreWindowPlacement();
        Shown += (_, _) => { placementTracking = true; CaptureWindowPlacement(); };
        LocationChanged += (_, _) => CaptureWindowPlacement();
        SizeChanged += (_, _) => CaptureWindowPlacement();
        ResizeEnd += (_, _) => FlushWindowPlacement();
        placementSaveTimer.Tick += (_, _) => FlushWindowPlacement();
        FormClosing += (_, _) => FlushWindowPlacement();
        SystemEvents.DisplaySettingsChanged += PlacementDisplaysChanged;
        FormClosed += (_, _) => { SystemEvents.DisplaySettingsChanged -= PlacementDisplaysChanged; placementSaveTimer.Dispose(); };
    }
    // A saved normal rectangle is applied before maximizing; first launch keeps the existing centered default size when it fits.
    private void RestoreWindowPlacement()
    {
        var screens = PlacementMonitors();
        var restored = WindowPlacementPolicy.Restore(preferences.WindowPlacement, screens, OrdinaryWindowMinimum);
        if (restored is not null)
        {
            MinimumSize = EffectiveWindowMinimum(restored.Monitor.WorkingArea); StartPosition = FormStartPosition.Manual;
            Bounds = restored.Bounds;
            if (restored.Maximized) WindowState = FormWindowState.Maximized;
        }
        else EnsureWindowPlacementVisible();
    }
    private void CaptureWindowPlacement(bool schedule = true)
    {
        if (!placementTracking || placementSuspended || placementAdjusting || fullscreen || WindowState == FormWindowState.Minimized) return;
        var normal = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        if (normal.Width <= 0 || normal.Height <= 0) return;
        var screen = WindowPlacementPolicy.Nearest(normal, PlacementMonitors());
        if (screen is null) return;
        var next = new WindowPlacementState(normal.X, normal.Y, normal.Width, normal.Height,
            WindowState == FormWindowState.Maximized, screen.Name, screen.Dpi, screen.WorkingArea.X, screen.WorkingArea.Y);
        if (preferences.WindowPlacement != next) { preferences.WindowPlacement = next; placementDirty = true; }
        if (placementDirty && schedule) { placementSaveTimer.Stop(); placementSaveTimer.Start(); }
    }
    // Writes use the current entire preferences object on the UI thread, just like SavePreferences; no stale worker snapshot can win.
    private void FlushWindowPlacement()
    {
        CaptureWindowPlacement(schedule: false); placementSaveTimer.Stop();
        if (!placementDirty) return;
        if (DataFiles.TrySave("preferences.json", preferences))
        { placementDirty = false; placementFailurePending = false; placementFailureReported = false; }
        else
        {
            placementFailurePending = !placementFailureReported;
            SendPendingWindowPlacementNotice();
        }
    }
    private void SendPendingWindowPlacementNotice()
    {
        if (!ready || !placementFailurePending) return;
        placementFailurePending = false; placementFailureReported = true;
        Send("notice", new { text = "窗口位置与大小已更新，但未能保存，下次启动可能恢复原位置。请检查磁盘空间或文件权限后重试。" });
    }
    private void SuspendWindowPlacement() { CaptureWindowPlacement(schedule: false); placementSuspended = true; placementSaveTimer.Stop(); }
    private void ResumeWindowPlacement()
    {
        placementSuspended = false; EnsureWindowPlacementVisible(); CaptureWindowPlacement();
        if (placementDirty) { placementSaveTimer.Stop(); placementSaveTimer.Start(); }
    }
    private void PlacementDisplaysChanged(object? sender, EventArgs args) => dispatcher.Run(() => { placementScreens = null; EnsureWindowPlacementVisible(); CaptureWindowPlacement(); });
    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        placementScreens = null;
        if (placementTracking) { EnsureWindowPlacementVisible(); CaptureWindowPlacement(); }
    }
    private void EnsureWindowPlacementVisible()
    {
        if (placementAdjusting || placementSuspended || fullscreen || WindowState == FormWindowState.Minimized) return;
        var target = WindowPlacementPolicy.Nearest(Bounds, PlacementMonitors());
        if (target is null) return;
        placementAdjusting = true;
        try
        {
            MinimumSize = EffectiveWindowMinimum(target.WorkingArea);
            if (WindowState == FormWindowState.Normal) Bounds = WindowPlacementPolicy.Clamp(Bounds, OrdinaryWindowMinimum, target.WorkingArea);
        }
        finally { placementAdjusting = false; }
    }
    private static Size EffectiveWindowMinimum(Rectangle area) => new(Math.Min(OrdinaryWindowMinimum.Width, area.Width), Math.Min(OrdinaryWindowMinimum.Height, area.Height));
    private WindowMonitor[] PlacementMonitors() => placementScreens ??= Screen.AllScreens.Select(screen => new WindowMonitor(screen.DeviceName, screen.WorkingArea, PlacementDpi(screen))).ToArray();
    private int PlacementDpi(Screen screen)
    {
        var monitor = PlacementMonitorFromPoint(new Point(screen.Bounds.Left, screen.Bounds.Top), 2);
        return PlacementGetDpiForMonitor(monitor, 0, out var x, out _) >= 0 && x is >= 48 and <= 768 ? (int)x : DeviceDpi;
    }
    [DllImport("user32.dll", EntryPoint = "MonitorFromPoint")] private static extern IntPtr PlacementMonitorFromPoint(Point point, uint flags);
    [DllImport("shcore.dll", EntryPoint = "GetDpiForMonitor")] private static extern int PlacementGetDpiForMonitor(IntPtr monitor, int kind, out uint x, out uint y);
}
