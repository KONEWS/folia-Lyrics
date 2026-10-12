using FoliaLyrics;

// test/transport-smoke/MediaClockChecks.cs — deterministic transport timelines without opening a player.
internal static class MediaClockChecks
{
    public static void Run(Action<bool, string> check)
    {
        var epoch = new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.Zero);
        var clock = new MediaPlaybackClock();
        var sample = new MediaTimelineSample(42, 180, epoch, true, 1);
        double Read(double now, MediaTimelineSample current, string song = "song-a", nint session = 1)
            => clock.Read(session, song, current, now, epoch.AddSeconds(now)).Position;
        bool Near(double value, double expected) => Math.Abs(value - expected) < 0.000001;
        check(Near(Read(0, sample), 42), "native clock seeds a fresh timeline sample");
        check(Near(Read(.5, sample), 42.5), "repeated playing samples advance from the monotonic anchor");
        sample = sample with { Playing = false };
        check(Near(Read(.8, sample), 42.8), "pause with old 42.0 sample freezes the displayed 42.8 position");
        check(Near(Read(4, sample), 42.8) && Near(Read(10, sample), 42.8), "duplicate paused samples cannot rewind or keep advancing");
        sample = sample with { UpdatedAt = epoch.AddSeconds(11) };
        check(Near(Read(11, sample), 42.8), "restamping an unchanged paused position cannot undo the fractional freeze");
        sample = sample with { Playing = true };
        check(Near(Read(12, sample), 42.8) && Near(Read(12.4, sample), 43.2), "resume excludes the full paused interval when the old timeline is reused");
        sample = sample with { Rate = 2 };
        check(Near(Read(12.5, sample), 43.3) && Near(Read(12.75, sample), 43.8), "rate change preserves elapsed old-rate progress before applying the new rate");
        sample = sample with { Position = 10, UpdatedAt = epoch.AddSeconds(12.75) };
        check(Near(Read(12.75, sample), 10), "a new playing timeline accepts a real backward seek");
        check(Near(Read(13, sample with { Position = 90, UpdatedAt = epoch.AddSeconds(12) }), 10.5), "an older dated timeline cannot overwrite the current seek");
        sample = sample with { Playing = false };
        check(Near(Read(13.2, sample), 10.9), "pause after a seek freezes the newly advanced clock");
        sample = sample with { Position = 2, UpdatedAt = epoch.AddSeconds(13.3) };
        check(Near(Read(13.3, sample), 2), "new paused timeline permits backward seek without a no-rewind clamp");
        sample = sample with { Position = 80, UpdatedAt = epoch.AddSeconds(13.4) };
        check(Near(Read(13.4, sample), 80) && Near(Read(14, sample), 80), "new paused timeline permits forward seek and remains frozen");
        sample = sample with { Position = 70 };
        check(Near(Read(14.1, sample), 70), "players that omit timestamp changes can still seek using a changed position");
        sample = new(0, 100, epoch.AddSeconds(15), true, 1);
        check(Near(Read(15, sample, "song-b"), 0), "changing songs resets the previous song's anchor");
        check(Near(Read(16, sample with { Playing = false }, "song-b", 2), 0), "recreated native session cannot inherit a same-title song clock");
        clock.Clear();
        check(Near(Read(17, sample with { Position = 3, Playing = false }, "song-b", 2), 3), "reconnection discards all previous clock state");
        sample = new(99.8, 100, epoch.AddSeconds(18), true, 2);
        Read(18, sample);
        check(Near(Read(18.5, sample), 100), "extrapolation stays inside the track duration");
        clock.Clear();
        sample = new(20, 100, epoch, true, 1);
        check(Near(Read(.8, sample), 20.8), "initial playing sample compensates for a valid native sample age");
        check(Near(clock.Read(1, "song-a", sample, 1.8, epoch.AddHours(-1)).Position, 21.8), "wall-clock changes cannot rewind an accepted monotonic timeline");
        clock.Clear();
        var invalid = clock.Read(1, "song-a", new(double.NaN, double.PositiveInfinity, epoch.AddSeconds(30), false, 0), 20, epoch.AddSeconds(20));
        check(invalid.Position == 0 && invalid.Duration == 0 && invalid.Rate == 1, "invalid timeline numbers cannot contaminate the clock");
        clock.Clear();
        sample = new(42, 180, epoch, true, 1);
        Read(0, sample);
        sample = sample with { Playing = false, UpdatedAt = epoch.AddSeconds(.8) };
        check(Near(Read(.8, sample), 42.8), "pause preserves progress even when the player re-stamps its unchanged whole-second sample");
        sample = sample with { Playing = true, UpdatedAt = epoch.AddSeconds(10) };
        check(Near(Read(10, sample), 42.8) && Near(Read(10.2, sample), 43), "resume with a re-stamped old position neither rewinds nor counts the paused time");
    }
}
