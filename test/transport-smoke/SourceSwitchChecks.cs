using FoliaLyrics;

// test/transport-smoke/SourceSwitchChecks.cs — use the real source handover with an isolated window and stalled OS request.
internal static class SourceSwitchChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        Song active = new("song-a", "Title", "Artist", "artwork", "SaltPlayer", true, 24, 180, 1, true,
            [new("SaltPlayer", "Salt"), new("OtherPlayer", "Other")], SessionId: "active-session");
        var window = new MainWindow(active);
        await window.SelectSource("");
        check(window.Saves == 0 && window.Polls == 0 && window.Cancellations == 0,
            "selecting the existing source preference does no persistence, polling or lyric work");
        check(window.Intent == 1,
            "selecting the current auto option still records a newer source intent for pending launches");
        await window.SelectSource("SaltPlayer");
        check(window.ReadSong == active && window.Invalidations == 0 && window.Revision == 0 && window.Cancellations == 0,
            "fixing the player already followed automatically preserves its session, artwork and lyric request");
        var currentIntent = window.Intent;
        var currentSaves = window.Saves;
        var currentPolls = window.Polls;
        await window.SelectSource("saltplayer");
        check(window.Intent == currentIntent + 1 && window.Saves == currentSaves && window.Polls == currentPolls
            && window.Cancellations == 0 && window.ReadSong == active,
            "selecting the same fixed player records intent without restarting media or lyrics");
        window.BindExecutable(new(0, "Salt", @"C:\Players\SaltPlayer.exe", ""));
        await window.SelectSource(@"C:\Players\SaltPlayer.exe");
        check(window.ReadSong == active && window.Invalidations == 0 && window.Cancellations == 0,
            "selecting the current player's saved executable alias also avoids a session reload");
        using var oldRead = new CancellationTokenSource();
        window.SetRead(oldRead);
        var blocked = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var stale = MediaReadDeadline.Read(_ => blocked.Task, oldRead.Token);
        await window.SelectSource("OtherPlayer");
        check(window.ReadSong is null && window.Invalidations == 1 && window.Revision == 1 && window.Cancellations == 1,
            "different player invalidates old controls and lyric work before polling the new target");
        check(window.Messages.All(type => type != "session") && window.VisibleSong == active && window.ReadLyricKey == active.Key,
            "source handover keeps the displayed song and prepared lyrics until the target read commits");
        try { await stale.WaitAsync(TimeSpan.FromSeconds(3)); throw new Exception("source change left the old read blocking"); }
        catch (OperationCanceledException) { check(!blocked.Task.IsCompleted, "source change releases an uncooperative OS read without waiting for its timeout"); }
        blocked.SetResult("stale-song");
        var waiting = new MainWindow(active, hasLyrics: false);
        await waiting.SelectSource("OtherPlayer");
        check(waiting.ReadLyricKey == "\0", "a cancelled unfinished lyric lookup will restart even if the replacement reports the same song key");
        var offline = new MainWindow(active with { SessionId = "" });
        await offline.SelectSource("SaltPlayer");
        check(offline.Invalidations == 1, "a source label without a live session cannot incorrectly preserve a stale binding");
        var paused = active with { Playing = false };
        var auto = new MainWindow(paused);
        auto.ConfigureSessions("SaltPlayer", [new(new object(), 1, "SaltPlayer", false), new(new object(), 2, "OtherPlayer", true)], 2);
        await auto.SelectSource("");
        check(auto.SelectedSource == "OtherPlayer" && auto.Reevaluations == 1 && auto.Invalidations == 0,
            "explicit manual-to-auto chooses playing A instead of retaining manually fixed paused B");
        check(auto.ReadSong is null && auto.VisibleSong == paused && auto.Messages.All(type => type != "session"),
            "auto selection reconsideration invalidates old controls while preserving the visible lyrics until target commit");
        var sameAuto = new MainWindow(active);
        sameAuto.ConfigureSessions("SaltPlayer", [new(new object(), 1, "SaltPlayer", true)], 1);
        await sameAuto.SelectSource("");
        check(sameAuto.SelectedSource == "SaltPlayer" && sameAuto.Reevaluations == 1 && sameAuto.Invalidations == 0,
            "auto can reselect the same player without dropping metadata, artwork or clock caches");
    }
}

namespace FoliaLyrics
{
    // The source helper sends no real messages and does not touch user preferences or native media devices.
    internal sealed partial class MainWindow
    {
        private readonly Preferences preferences = new();
        private readonly SourceSwitchMonitor media = new();
        private CancellationTokenSource? mediaRead;
        private int sourceRevision;
        private Song? song;
        private Lyrics? lyrics;
        private string lyricKey;
        public readonly Song VisibleSong;
        public readonly List<string> Messages = [];
        public int Saves, Polls, Cancellations;
        public Song? ReadSong;
        public string ReadLyricKey = "";
        public int Invalidations => media.Invalidations;
        public int Reevaluations => media.Reevaluations;
        public int Revision => sourceRevision;
        public long Intent => sourceIntent;
        public string? SelectedSource;
        public MainWindow(Song active, bool hasLyrics = true)
        {
            VisibleSong = active; song = active; lyricKey = active.Key;
            if (hasLyrics) lyrics = new(active.Key, active.Title, active.Artist, "lrc", "[00:01]line", "local", false);
        }
        public Task SelectSource(string source) => ChangeMediaSource(source);
        public void BindExecutable(MusicAppBinding binding) => preferences.MusicApps = [binding];
        public void SetRead(CancellationTokenSource request) => mediaRead = request;
        public void ConfigureSessions(string preferred, SessionCandidate<object>[] candidates, nint current)
        { preferences.Source = preferred; media.Configure(preferred, candidates, current); }
        private void StartWork() => Cancellations++;
        private bool SavePreferences() { Saves++; Messages.Add("preferences"); return true; }
        private Task Poll()
        { Polls++; ReadSong = song; ReadLyricKey = lyricKey; SelectedSource = media.Select(preferences.Source); return Task.CompletedTask; }
        private sealed class SourceSwitchMonitor
        {
            private readonly MediaSessionBinding<object> binding = new();
            private SessionCandidate<object>[] candidates = [];
            private nint current;
            public int Invalidations, Reevaluations;
            public void Configure(string preferred, SessionCandidate<object>[] next, nint selected)
            { candidates = next; current = selected; binding.Select(candidates, current, preferred); }
            public string? Select(string preferred) => binding.Select(candidates, current, preferred)?.Source;
            public void Invalidate() { Invalidations++; binding.Clear(); }
            public void ReevaluateSelection() { Reevaluations++; binding.Clear(); }
        }
    }
}
