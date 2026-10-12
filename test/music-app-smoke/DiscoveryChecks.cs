using System.Text.Json;
using FoliaLyrics;

// test/music-app-smoke/DiscoveryChecks.cs — discovery identity, local registration parsing and explicit confirmation checks.
internal static class DiscoveryChecks
{
    internal static void Run(Action<bool, string> check, string directory)
    {
        var executable = Path.Combine(directory, "QQMusic.exe");
        File.WriteAllBytes(executable, []);
        try
        {
            check(MusicAppCatalog.Identify(executable)?.Name == "QQ 音乐", "known music executable is recognized");
            check(MusicAppCatalog.Identify(Path.Combine(directory, "Game.exe")) is null, "unrelated executable is never discovered");
            check(MusicAppCatalog.Identify(Path.Combine(directory, "MusicPlayer.exe")) is null, "generic music-player name needs metadata");
            check(MusicAppCatalog.Identify(Path.Combine(directory, "MusicPlayer.exe"), "Salt Player")?.Name == "椒盐音乐", "generic player is recognized with matching metadata");
            check(MusicAppCatalog.Identify(Path.Combine(directory, "Salt Player for Windows.exe"))?.Name == "椒盐音乐", "Salt packaged desktop process filename is recognized");
            check(MusicAppCatalog.IdentifyPackage("Sakawish.SaltPlayerforWindows", "Sakawish.SaltPlayerforWindows_q65q631pyh094")?.Name == "椒盐音乐", "Salt Store package family is recognized");
            check(MusicAppInstalledPaths.RegisteredExecutable('"' + executable + '"') == executable, "quoted App Paths entry resolves exactly");
            check(MusicAppInstalledPaths.RegisteredExecutable('"' + executable + "\",-3", icon: true) == executable, "DisplayIcon accepts an integer resource index");
            check(MusicAppInstalledPaths.RegisteredExecutable(executable + " --play") is null, "registration launch arguments are rejected");
            check(MusicAppInstalledPaths.RegisteredExecutable(@"\\server\share\QQMusic.exe") is null, "remote registration never scans a network share");
            check(MusicAppInstalledPaths.RegisteredExecutable(executable + ",bad", icon: true) is null, "noninteger icon suffix is rejected");
            var discovered = MusicAppDiscovery.FromPaths([executable, executable.ToUpperInvariant(), Path.Combine(directory, "missing.exe"), executable + " --play"], [], CancellationToken.None);
            check(discovered.Length == 1 && discovered[0].Name == "QQ 音乐" && discovered[0].Path == executable, "actual discovery metadata pipeline validates and deduplicates fixture paths");
            check(MusicAppDiscovery.FromPaths([executable], [executable.Replace('\\', '/').ToUpperInvariant()], CancellationToken.None).Length == 0,
                "ignored fixture paths skip metadata work before classification");
            check(MusicAppDiscovery.FromPaths([@"C:\Program Files\WindowsApps\Sakawish.SaltPlayer_1.0.0.0\Salt Player for Windows.exe"], [], CancellationToken.None).Length == 0,
                "versioned WindowsApps executables never become path-based discovery candidates");
            var saved = new MusicAppBinding(3, "Custom player name", executable, "saved-icon");
            var other = new MusicAppBinding(0, "foobar2000", Path.Combine(directory, "foobar2000.exe"), "found-icon");
            var excluded = new MusicAppBinding(0, "Spotify", Path.Combine(directory, "Spotify.exe"), "spotify-icon");
            var found = new[] { saved with { Name = "Detected QQ", Slot = 0 }, other, other with { Path = other.Path.ToUpperInvariant() }, excluded };
            var merged = MusicAppDiscoveryPolicy.Merge([saved], found, [MusicAppDiscoveryPolicy.Id(excluded)]);
            check(merged.Length == 2 && merged.Single(app => app.Slot == 3) == saved, "saved identity/name/icon survive explicit confirmation");
            check(merged[0] == other && merged[0].Slot == 0, "new player fills the smallest identity gap");
            check(MusicAppDiscoveryPolicy.Merge(merged, found, [MusicAppDiscoveryPolicy.Id(excluded)]).SequenceEqual(merged), "repeat confirmation is idempotent and skips explicitly blocked identities");
            check(MusicAppDiscoveryPolicy.PathKey(executable.Replace('\\', '/')).Equals(executable, StringComparison.OrdinalIgnoreCase), "slash variants share a single identity");
            var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            var legacy = JsonSerializer.Deserialize<Preferences>("{}", json)!;
            check(legacy.AutoDiscoverMusicApps && legacy.BlockedMusicApps.Length == 0, "legacy profiles enable discovery without explicit blocks");
            legacy.AutoDiscoverMusicApps = false; legacy.BlockedMusicApps = [MusicAppDiscoveryPolicy.Candidate(excluded)]; legacy.MusicApps = merged;
            var restored = JsonSerializer.Deserialize<Preferences>(JsonSerializer.Serialize(legacy, json), json)!;
            check(!restored.AutoDiscoverMusicApps && restored.BlockedMusicApps.SequenceEqual(legacy.BlockedMusicApps)
                && restored.MusicApps.SequenceEqual(merged), "discovery switch/explicit blocks/bindings round trip independently");
            var many = Enumerable.Range(0, 20).Select(i => other with { Path = Path.Combine(directory, $"Player{i}.exe") });
            check(MusicAppDiscoveryPolicy.Merge([], many, []).Length == 20, "explicit confirmation has no former shortcut-count limit");
            using var canceled = new CancellationTokenSource(); canceled.Cancel();
            try { MusicAppDiscovery.ScanAsync(true, [], canceled.Token).GetAwaiter().GetResult(); throw new Exception("canceled discovery did not stop"); }
            catch (OperationCanceledException) { check(true, "discovery cancellation exits before installation/process reads"); }
        }
        finally { File.Delete(executable); }
    }
}
