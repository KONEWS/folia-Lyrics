using FoliaLyrics;

// test/persistence-smoke/DiscoveryPersistenceChecks.cs — restore under a real file lock must still scan without hiding the persistence warning.
internal static class DiscoveryPersistenceChecks
{
    internal static async Task Run(Action<bool, string> check, string root)
    {
        var player = new MusicAppBinding(0, "Fixture Player", Path.Combine(root, "fixture-player.exe"), "");
        var blocked = MusicAppDiscoveryPolicy.Candidate(player);
        var preferencesPath = Path.Combine(root, "preferences.json");
        var empty = new MusicAppScan([], new Dictionary<string, string>());
        var found = new MusicAppScan([player], new Dictionary<string, string>());
        var host = Prepare(); var scans = 0; var installedScan = false; string[] ignored = [];
        MusicAppDiscovery.Scan = (installed, ignoredIds, _) =>
        {
            Interlocked.Increment(ref scans); installedScan = installed; ignored = ignoredIds;
            return Task.FromResult(found);
        };
        using (var held = File.Open(preferencesPath, FileMode.Open, FileAccess.Read, FileShare.None))
            await host.RestoreDiscovery(blocked.Id);
        check(scans == 1 && installedScan && !ignored.Contains(blocked.Id), "failed persistence still executes the explicitly requested installed scan with the restored identity");
        check(host.DiscoveredApps.Single().Id == blocked.Id, "restored discovery updates the real candidate inbox even while automatic discovery is disabled");
        check(!host.Messages.Single(message => message.Type == "preferences").Data.GetProperty("autoDiscoverMusicApps").GetBoolean()
            && host.Messages.Single(message => message.Type == "preferences").Data.GetProperty("blockedMusicApps").GetArrayLength() == 0,
            "failed persistence publishes the unblocked live preference while retaining the disabled automatic-discovery setting");
        check(DataFiles.Load("preferences.json", new Preferences()).BlockedMusicApps.Single().Id == blocked.Id,
            "the locked write preserves the previously saved blocked identity for the next session");
        CheckWarning(host, "successful discovery does not replace the failed-save warning");

        host = Prepare(); scans = 0;
        MusicAppDiscovery.Scan = (_, _, _) => { Interlocked.Increment(ref scans); return Task.FromResult(empty); };
        using (var held = File.Open(preferencesPath, FileMode.Open, FileAccess.Read, FileShare.None))
            await host.RestoreDiscovery(blocked.Id);
        check(scans == 1 && host.DiscoveredApps.Length == 0, "a restore with no discovery candidates still performs its explicit scan after a failed save");
        CheckWarning(host, "the empty-result notice cannot hide the failed-save warning");

        host = Prepare(); scans = 0; var errors = DataFiles.Errors.Count;
        MusicAppDiscovery.Scan = (_, _, _) => { Interlocked.Increment(ref scans); throw new IOException("Fixture installation scan failed."); };
        using (var held = File.Open(preferencesPath, FileMode.Open, FileAccess.Read, FileShare.None))
            await host.RestoreDiscovery(blocked.Id);
        check(scans == 1 && DataFiles.Errors.Count == errors + 2 && DataFiles.Errors.Last().Message == "Fixture installation scan failed.",
            "a scan error after a failed save remains logged without skipping the requested scan");
        CheckWarning(host, "a scan error notice cannot replace the failed-save warning");

        // Hold one real discovery route at its IO seam so restore must use the production pending-scan queue.
        host = Prepare(); scans = 0;
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource<MusicAppScan>(TaskCreationOptions.RunContinuationsAsynchronously);
        MusicAppDiscovery.Scan = (_, _, token) =>
        {
            if (Interlocked.Increment(ref scans) > 1) return Task.FromResult(empty);
            started.SetResult(); return release.Task.WaitAsync(token);
        };
        var active = host.ScanApps(manual: true, notifyResult: false);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        using (var held = File.Open(preferencesPath, FileMode.Open, FileAccess.Read, FileShare.None))
            await host.RestoreDiscovery(blocked.Id);
        check(scans == 1, "restore during an active scan queues its work instead of starting overlapping scans");
        release.SetResult(empty); await active.WaitAsync(TimeSpan.FromSeconds(5));
        check(scans == 2 && host.DiscoveredApps.Length == 0,
            "a queued restore still runs as a manual scan when automatic discovery is disabled");
        CheckWarning(host, "the queued scan retains its suppressed-notice setting after failed persistence");

        host = Prepare(); scans = 0;
        MusicAppDiscovery.Scan = (_, _, _) => { Interlocked.Increment(ref scans); return Task.FromResult(empty); };
        await host.ScanApps(manual: false);
        check(scans == 0 && host.Messages.Count == 0, "a background scan still respects disabled automatic discovery");
        await host.ScanApps(manual: true);
        check(scans == 1 && host.Messages.Single(message => message.Type == "notice").Data.GetProperty("text").GetString()!.Contains("没有发现"),
            "a regular explicit scan still reports its empty result");

        MainWindow Prepare()
        {
            var window = new MainWindow(); window.ConfigureDiscovery(blocked);
            check(window.SaveTopmost(false), "fixture preferences save succeeds before locking its private file");
            window.Messages.Clear(); return window;
        }
        void CheckWarning(MainWindow window, string label)
        {
            var notices = window.Messages.Where(message => message.Type == "notice").ToArray();
            check(notices.Length == 1 && notices[0].Data.GetProperty("text").GetString()!.Contains("未能保存"), label);
        }
    }
}
