// native/MediaPlaybackClock.cs — keep transport state changes independent of stale player timeline samples.
namespace FoliaLyrics;
internal readonly record struct MediaTimelineSample(double Position, double Duration, DateTimeOffset UpdatedAt, bool Playing, double Rate);
internal readonly record struct MediaClockSnapshot(double Position, double Duration, bool Playing, double Rate);
internal sealed class MediaPlaybackClock
{
    private const double PauseTransitionDriftSeconds = 1.5;
    private nint session;
    private string song = "";
    private bool initialized, playing;
    private double position, received, rate = 1;
    private MediaTimelineSample timeline;
    private DateTimeOffset resumedAt = DateTimeOffset.MinValue;

    // Monotonic time advances the accepted anchor; wall time is used only to date a genuinely new sample.
    public MediaClockSnapshot Read(nint sessionIdentity, string songKey, MediaTimelineSample sample, double now, DateTimeOffset utcNow)
    {
        var duration = double.IsFinite(sample.Duration) ? Math.Max(0, sample.Duration) : 0;
        sample = sample with { Position = double.IsFinite(sample.Position) ? Math.Max(0, sample.Position) : 0,
            Duration = duration, Rate = double.IsFinite(sample.Rate) && sample.Rate > 0 ? sample.Rate : 1 };
        var reset = !initialized || session != sessionIdentity || song != songKey;
        if (reset) resumedAt = DateTimeOffset.MinValue;
        var projected = position + (playing ? Math.Max(0, now - received) * rate : 0);
        // A player may re-stamp the last whole-second position on pause/resume. Only a changed position
        // establishes a new anchor; a timestamp-only update must not undo already displayed progress.
        var fresh = reset || sample.UpdatedAt >= timeline.UpdatedAt && sample.Position != timeline.Position;
        var pausing = !reset && playing && !sample.Playing;
        if (!reset && !playing && sample.Playing) resumedAt = utcNow;
        if (fresh)
        {
            var datedAt = sample.UpdatedAt > resumedAt ? sample.UpdatedAt : resumedAt;
            var elapsed = (utcNow - datedAt).TotalSeconds;
            var sampled = sample.Position + (sample.Playing && elapsed is >= 0 and < 21600 ? elapsed * sample.Rate : 0);
            // Only the playback-to-pause sample is known to race the final playing frame. Later changed
            // samples may be a paused seek, so they must remain authoritative even immediately after pause.
            var stalePause = pausing && sampled < projected && projected - sampled <= PauseTransitionDriftSeconds;
            position = stalePause ? projected : sampled;
        }
        else position = projected;
        if (reset || sample.UpdatedAt >= timeline.UpdatedAt) timeline = sample;
        position = duration > 0 ? Math.Clamp(position, 0, duration) : Math.Max(0, position);
        session = sessionIdentity; song = songKey; received = now; playing = sample.Playing; rate = sample.Rate; initialized = true;
        return new(position, duration, playing, rate);
    }

    public void Clear() { initialized = false; session = 0; song = ""; position = received = 0; playing = false; rate = 1; resumedAt = DateTimeOffset.MinValue; }
}
