using System.Text.Json;
using FoliaLyrics;

// test/window-close-smoke/Program.cs — isolated persistence and caption-close checks; no visible window or real preferences.
internal static class WindowCloseChecks
{
    // Exercise real preferences and caption commands using a temporary file and unshown forms.
    [STAThread]
    private static void Main()
    {
        var count = 0;
        void Check(bool condition, string label)
        {
            if (!condition) throw new Exception(label);
            count++; Console.WriteLine("PASS " + label);
        }
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        Check(!new Preferences().CloseToTaskbar, "fresh preferences retain close-to-exit by default");
        var legacy = JsonSerializer.Deserialize<Preferences>("{\"topmost\":true,\"immersiveDelay\":5,\"source\":\"salt\"}", json)!;
        Check(!legacy.CloseToTaskbar && legacy.Topmost && legacy.ImmersiveDelay == 5 && legacy.Source == "salt", "legacy preferences preserve existing values and close-to-exit");
        var directory = Path.Combine(Path.GetTempPath(), "FoliaLyricsWindowCloseSmoke_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "preferences.json");
        try
        {
            foreach (var enabled in new[] { true, false })
            {
                legacy.CloseToTaskbar = enabled;
                var text = JsonSerializer.Serialize(legacy, json);
                using var payload = JsonDocument.Parse(text);
                Check(payload.RootElement.GetProperty("closeToTaskbar").GetBoolean() == enabled, "bridge serializes camel-case closeToTaskbar=" + enabled);
                File.WriteAllText(path, text);
                var loaded = JsonSerializer.Deserialize<Preferences>(File.ReadAllText(path), json)!;
                Check(loaded.CloseToTaskbar == enabled && loaded.Topmost && loaded.ImmersiveDelay == 5 && loaded.Source == "salt", "persisted option reloads without changing other preferences=" + enabled);
            }
            using (var window = new MainWindow(new Preferences()))
            {
                Check(!window.IsHandleCreated, "caption policy test starts without a native window");
                window.CaptionCommand("close");
                Check(window.IsDisposed, "caption close exits when the option is disabled");
            }
            var preferences = new Preferences { CloseToTaskbar = true };
            using (var window = new MainWindow(preferences))
            {
                window.CaptionCommand("close");
                Check(window.WindowState == FormWindowState.Minimized && !window.IsDisposed, "caption close minimizes and preserves the form when enabled");
                window.RefreshAudioCapture();
                Check(window.CaptureRequests.Last() == false, "caption minimize suspends audio capture without creating a native window");
                Check(window.ShowInTaskbar && !window.IsHandleCreated, "minimizing preserves the taskbar flag without opening a test window");
                window.WindowState = FormWindowState.Normal;
                Check(!window.IsDisposed, "restoring after caption minimize keeps the same form alive");
                window.RefreshAudioCapture();
                Check(window.CaptureRequests.Last() == true, "restoring resumes audio capture when enabled");
                preferences.AudioReactive = false;
                window.WindowState = FormWindowState.Minimized;
                window.WindowState = FormWindowState.Normal;
                window.RefreshAudioCapture();
                Check(window.CaptureRequests.Last() == false, "restoring never enables a disabled audio preference");
                preferences.AudioReactive = true;
                window.WindowState = FormWindowState.Maximized;
                window.CaptionCommand("close");
                Check(window.WindowState == FormWindowState.Minimized && !window.IsDisposed, "maximized caption close also minimizes");
                window.RefreshAudioCapture();
                Check(window.CaptureRequests.Last() == false, "periodic device maintenance cannot reopen capture while minimized");
                window.CaptionCommand("close");
                Check(window.WindowState == FormWindowState.Minimized && !window.IsDisposed, "repeated close cannot dispose an already minimized form");
                preferences.CloseToTaskbar = false;
                window.CaptionCommand("close");
                Check(window.IsDisposed, "disabling the option takes effect on the next caption close");
            }
            using (var window = new MainWindow(new Preferences { CloseToTaskbar = true }))
            {
                window.Close();
                Check(window.IsDisposed, "explicit exit bypasses the caption-close option");
            }
            using (var window = new MainWindow(new Preferences()))
            {
                window.CaptionCommand("minimize");
                Check(window.WindowState == FormWindowState.Minimized && !window.IsDisposed && window.ShowInTaskbar, "ordinary minimize remains available with the option disabled");
            }
            // Deliver the resize notification to the real hook without opening a window or audio device.
            using (var window = new MainWindow(new Preferences()))
            {
                window.CaptionCommand("minimize");
                window.ResizeNotification();
                Check(window.CaptureRequests.Count > 0 && window.CaptureRequests.Last() == false,
                    "minimize resize notification suspends capture through the window lifecycle hook");
                var requests = window.CaptureRequests.Count;
                window.WindowState = FormWindowState.Normal;
                window.ResizeNotification();
                Check(window.CaptureRequests.Count > requests && window.CaptureRequests.Last() == true,
                    "restore resize notification resumes capture through the window lifecycle hook");
                Check(!window.Visible && !window.IsHandleCreated, "audio lifecycle checks do not open a native test window");
                requests = window.CaptureRequests.Count;
                for (var i = 0; i < 100; i++) window.ResizeNotification();
                Check(window.CaptureRequests.Count == requests, "ordinary resize notifications do not repeatedly enumerate audio devices");
            }
            // Dragging a window edge raises WM_SIZE continuously; the page must only hear about real window-state changes.
            using (var window = new MainWindow(new Preferences()))
            {
                window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 1 && window.WindowStateMessages[0].Contains("\"maximized\":false"),
                    "the first resize notification reports the window state once");
                for (var i = 0; i < 100; i++) window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 1, "100 identical resize notifications send no further window-state messages");
                window.WindowState = FormWindowState.Maximized;
                window.ResizeNotification(); window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 2 && window.WindowStateMessages[1].Contains("\"maximized\":true"), "maximizing is reported exactly once");
                window.SetFullscreenForTest(true);
                window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 3 && window.WindowStateMessages[2].Contains("\"fullscreen\":true"), "entering fullscreen is reported");
                window.SetClickThroughForTest(true);
                window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 4 && window.WindowStateMessages[3].Contains("\"clickThrough\":true"), "enabling click-through is reported");
                window.ForgetSentWindowState();
                window.ResizeNotification();
                Check(window.WindowStateMessages.Count == 5, "a page that reloaded and sent ready again receives the current state");
                Check(!window.Visible && !window.IsHandleCreated, "window-state checks do not open a native test window");
            }
            // The hidden-window decisions are pure: WM_SIZE types map to minimized or not, and the spectrum timer follows them.
            Check(WindowBackgroundPolicy.MinimizedFrom(1) == true && WindowBackgroundPolicy.MinimizedFrom(0) == false
                && WindowBackgroundPolicy.MinimizedFrom(2) == false && WindowBackgroundPolicy.MinimizedFrom(3) is null
                && WindowBackgroundPolicy.MinimizedFrom(4) is null, "WM_SIZE minimize, restore and maximize map to the minimized state while pop-up sizes are ignored");
            Check(WindowBackgroundPolicy.SpectrumTimerWanted(true, true, false) && !WindowBackgroundPolicy.SpectrumTimerWanted(false, true, false)
                && !WindowBackgroundPolicy.SpectrumTimerWanted(true, false, false) && !WindowBackgroundPolicy.SpectrumTimerWanted(true, true, true),
                "the spectrum timer runs only while the page is ready, sound response is on and the window is not minimized");
            Console.WriteLine($"{count} window-close checks passed");
        }
        finally { File.Delete(path); Directory.Delete(directory); }
    }
}
