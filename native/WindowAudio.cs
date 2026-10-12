// native/WindowAudio.cs — keep audio capture aligned with the window lifecycle and saved preference.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool? captureEnabled;
    // Resize events are frequent; only lifecycle transitions should request immediate driver maintenance.
    private void UpdateAudioCapture(bool checkDevice = false)
    {
        if (!ready || IsDisposed || Disposing) return;
        var enabled = preferences.AudioReactive && WindowState != FormWindowState.Minimized;
        if (captureEnabled == enabled && !checkDevice) return;
        captureEnabled = enabled; audio.Ensure(enabled);
    }
}
