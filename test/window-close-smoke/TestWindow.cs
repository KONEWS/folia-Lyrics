using System.Runtime.InteropServices;
using System.Text.Json;

// test/window-close-smoke/TestWindow.cs — an unshown Form runs the real caption command without media or WebView services.
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    private readonly Preferences preferences;
    private readonly object? dispatcher = null;
    private bool fullscreen = false, clickThrough = false;
    public MainWindow(Preferences preferences) => this.preferences = preferences;
    public void CaptionCommand(string action) => WindowCommand(JsonSerializer.SerializeToElement(new { action }));
    private void Send(string type, object data) { }
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
}
internal static class TestJsonText
{
    public static string Text(this JsonElement value, string key) => value.TryGetProperty(key, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() ?? "" : "";
}
