using System.Runtime.InteropServices;
using System.Text.Json;

// test/window-close-smoke/TestWindow.cs — an unshown Form runs the real caption command without media or WebView services.
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    private readonly Preferences preferences;
    private readonly Control web = new();
    private readonly object? dispatcher = new();
    private readonly bool ready = true;
    private readonly AudioSpectrum audio = new();
    private bool fullscreen = false, clickThrough = false;
    public MainWindow(Preferences preferences) { this.preferences = preferences; InitializeWebLayout(); }
    public void CaptionCommand(string action) => WindowCommand(JsonSerializer.SerializeToElement(new { action }));
    public IReadOnlyList<bool> CaptureRequests => audio.Requests;
    public void RefreshAudioCapture() => UpdateAudioCapture(checkDevice: true);
    public void ResizeNotification() => OnResize(EventArgs.Empty);
    // The real SendWindowState runs against this recorder, so the checks see exactly what the page would be sent.
    private readonly List<string> windowStateMessages = [];
    public IReadOnlyList<string> WindowStateMessages => windowStateMessages;
    public void SetFullscreenForTest(bool value) => fullscreen = value;
    public void SetClickThroughForTest(bool value) => clickThrough = value;
    // What the page's ready message does after a (re)load: the next window state is sent again.
    public void ForgetSentWindowState() => windowStateSent = false;
    private void Send(string type, object data) { if (type == "windowState") windowStateMessages.Add(JsonSerializer.Serialize(data)); }
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
}
internal sealed class AudioSpectrum
{
    public readonly List<bool> Requests = [];
    public void Ensure(bool enabled) => Requests.Add(enabled);
}
internal static class TestJsonText
{
    public static string Text(this JsonElement value, string key) => value.TryGetProperty(key, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() ?? "" : "";
}
