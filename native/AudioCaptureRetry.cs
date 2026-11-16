// native/AudioCaptureRetry.cs — back off failed capture for one output device while allowing immediate device changes.
namespace FoliaLyrics;
internal sealed class AudioCaptureRetry
{
    private string failedDevice = "";
    private int failures;
    private long retryAt;
    private string? startedDevice;
    private long startedAt;
    internal bool CanAttempt(string device, long now) => failures == 0 || device != failedDevice || now >= retryAt;
    // Starting a worker is not proof of recovery: WASAPI can fail asynchronously immediately afterwards.
    internal void Started(string device, long now) { startedDevice = device; startedAt = now; }
    internal void Failed(string device, long now)
    {
        if (device == startedDevice && now - startedAt >= 5_000) failures = 0;
        failures = device == failedDevice ? Math.Min(failures + 1, 5) : 1;
        failedDevice = device;
        startedDevice = null;
        retryAt = now + Math.Min(60_000, 5_000L << (failures - 1));
    }
    internal void Reset() { failures = 0; failedDevice = ""; retryAt = 0; startedDevice = null; startedAt = 0; }
}
