using FoliaLyrics;
using System.Text.Json;

// test/window-placement-smoke/Program.cs — verify monitor/DPI geometry and production save scheduling without showing a window.
internal static class PlacementChecks
{
    [STAThread]
    private static void Main()
    {
        var checks = 0;
        void Check(bool passed, string label) { if (!passed) throw new InvalidOperationException(label); checks++; }
        var minimum = new Size(680, 450);
        var primary = new WindowMonitor("primary", new(0, 0, 1920, 1040), 96);
        var secondary = new WindowMonitor("secondary", new(1920, -100, 2560, 1400), 144);
        WindowMonitor[] screens = [primary, secondary];
        var saved = new WindowPlacementState(2040, 20, 1000, 600, false, "secondary", 144, 1920, -100);
        var restored = WindowPlacementPolicy.Restore(saved, screens, minimum)!;
        Check(restored.Bounds == new Rectangle(2040, 20, 1000, 600) && !restored.Maximized, "the same monitor and DPI retain exact ordinary geometry");
        Check(WindowPlacementPolicy.Restore(null, screens, minimum) is null, "a first launch retains the existing centered default");
        Check(WindowPlacementPolicy.Restore(saved with { Width = 0 }, screens, minimum) is null, "invalid persisted dimensions fall back to the default");
        Check(WindowPlacementPolicy.Restore(saved, [], minimum) is null, "an empty display snapshot cannot fabricate window coordinates");
        var moved = secondary with { WorkingArea = new(-2560, 0, 2560, 1400) };
        Check(WindowPlacementPolicy.Restore(saved, [primary, moved], minimum)!.Bounds == new Rectangle(-2440, 120, 1000, 600),
            "a display moved in the desktop layout preserves the window's monitor-relative offset");
        var scaled = secondary with { WorkingArea = new(0, 0, 1920, 1040), Dpi = 192 };
        Check(WindowPlacementPolicy.Restore(saved, [scaled], minimum)!.Bounds == new Rectangle(160, 160, 1333, 800),
            "a DPI change scales ordinary size and relative offset once");
        restored = WindowPlacementPolicy.Restore(saved with { Maximized = true }, [primary], minimum)!;
        Check(restored.Maximized && restored.Bounds == new Rectangle(80, 80, 680, 450),
            "a disconnected display falls back visibly while retaining maximized and ordinary restore geometry separately");
        var small = primary with { WorkingArea = new(0, 25, 450, 275) };
        Check(WindowPlacementPolicy.Restore(saved with { Monitor = "primary" }, [small], minimum)!.Bounds == small.WorkingArea,
            "a work area smaller than the usual minimum keeps the entire window accessible");
        var corrupt = saved with { X = int.MaxValue, Y = int.MinValue, Width = int.MaxValue, Height = int.MaxValue, Monitor = "missing", Dpi = 0 };
        Check(primary.WorkingArea.Contains(WindowPlacementPolicy.Restore(corrupt, [primary], minimum)!.Bounds),
            "extreme saved coordinates and invalid DPI cannot overflow or hide the window");
        Check(WindowPlacementPolicy.Nearest(new(-1600, 100, 1000, 600), [primary, moved]) == moved,
            "negative-coordinate monitors are selected by actual overlap");
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var preferences = JsonSerializer.Deserialize<Preferences>("{\"topmost\":true,\"source\":\"fixture\"}", json)!;
        Check(preferences.WindowPlacement is null && preferences.Topmost && preferences.Source == "fixture", "legacy profiles retain other preferences and receive no invented placement");
        preferences.WindowPlacement = saved;
        Check(JsonSerializer.Deserialize<Preferences>(JsonSerializer.Serialize(preferences, json), json)!.WindowPlacement == saved,
            "all native-only placement metadata round-trips with preferences");

        DataFiles.Writes.Clear();
        using (var window = new MainWindow(screens))
        {
            for (var index = 0; index < 40; index++) window.MoveTo(new(100 + index, 80, 1000 + index, 600));
            Check(DataFiles.Writes.Count == 0 && window.SaveScheduled, "continuous move and resize events schedule one save without writing every pixel");
            var last = window.Placement;
            window.ChangeTopmostPreference(true); window.EndGesture();
            Check(DataFiles.Writes.Count == 1 && DataFiles.Writes[0].Value.Topmost && DataFiles.Writes[0].Value.WindowPlacement == last,
                "gesture completion persists the current whole preferences object rather than an old layout snapshot");
            Check(!window.SaveScheduled && DataFiles.Writes[0].Thread == Environment.CurrentManagedThreadId, "placement persistence remains serialized on the UI thread");
            window.Flush(); Check(DataFiles.Writes.Count == 1, "unchanged placement does not repeat disk writes");
            window.FullscreenForTest(true, primary.WorkingArea);
            Check(window.Placement == last, "entering fullscreen cannot replace ordinary geometry");
            window.Flush(); Check(DataFiles.Writes.Count == 1, "fullscreen rectangle changes do not dirty placement persistence");
            window.FullscreenForTest(false, new(last!.X, last.Y, last.Width, last.Height));
            window.WindowState = FormWindowState.Minimized; window.MoveTo(new(-32000, -32000, 160, 30)); window.Flush();
            Check(window.Placement == last && DataFiles.Writes.Count == 1, "minimization cannot save iconic coordinates or overwrite ordinary/maximized state");
            Check(!window.Visible, "lifecycle checks do not show a window");
        }
        using (var window = new MainWindow(screens))
        {
            window.MoveTo(new(150, 120, 900, 500)); window.WindowState = FormWindowState.Maximized; window.CaptureNow();
            Check(window.Placement is { Maximized: true, X: 150, Y: 120, Width: 900, Height: 500 },
                "maximizing records the ordinary restore rectangle independently from the maximized state");
            var maximized = window.Placement;
            window.WindowState = FormWindowState.Minimized; window.CaptureNow();
            Check(window.Placement == maximized, "minimizing a maximized window retains the maximized startup preference");
        }
        using (var window = new MainWindow(screens))
        {
            window.RestoreForTest(saved with { Maximized = true });
            Check(window.WindowState == FormWindowState.Maximized && window.RestoreBounds == new Rectangle(saved.X, saved.Y, saved.Width, saved.Height),
                "startup applies ordinary bounds before restoring the maximized state");
            Check(!window.Visible, "restoring maximized metadata does not show or activate the test form");
        }
        using (var window = new MainWindow(screens))
        {
            window.MoveTo(new(2100, 100, 900, 500)); window.ChangeMonitorsForTest([primary]); window.ExitForTest();
            Check(primary.WorkingArea.Contains(window.Bounds) && DataFiles.Writes.Last().Value.WindowPlacement!.Monitor == "primary",
                "display removal clamps the current window and exit flushes the corrected geometry");
        }
        using (var window = new MainWindow([primary]))
        {
            window.ChangeMonitorsForTest([small]);
            Check(window.MinimumSize == small.WorkingArea.Size && small.WorkingArea.Contains(window.Bounds),
                "a tiny live display lowers the managed minimum so native bounds can remain usable");
            DataFiles.SaveSucceeds = false; window.SetReady(false); window.Flush();
            Check(window.Notices.Count == 0, "save failure before page readiness remains queued");
            window.SetReady(true); window.Flush(); window.SetReady(true);
            Check(window.Notices.Count == 1 && window.Notices[0].Contains("未能保存"), "failed placement persistence warns once without crashing or repeated popups");
            DataFiles.SaveSucceeds = true; window.Flush();
            Check(!window.SaveScheduled && DataFiles.Writes.Last().Value.WindowPlacement == window.Placement,
                "a subsequent successful save retains the current layout after an IO failure");
        }
        Console.WriteLine($"Window placement checks passed: {checks}");
    }
}
