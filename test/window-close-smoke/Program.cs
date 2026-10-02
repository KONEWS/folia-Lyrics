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
                Check(window.ShowInTaskbar && !window.IsHandleCreated, "minimizing preserves the taskbar flag without opening a test window");
                window.WindowState = FormWindowState.Normal;
                Check(!window.IsDisposed, "restoring after caption minimize keeps the same form alive");
                window.WindowState = FormWindowState.Maximized;
                window.CaptionCommand("close");
                Check(window.WindowState == FormWindowState.Minimized && !window.IsDisposed, "maximized caption close also minimizes");
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
            Console.WriteLine($"{count} window-close checks passed");
        }
        finally { File.Delete(path); Directory.Delete(directory); }
    }
}
