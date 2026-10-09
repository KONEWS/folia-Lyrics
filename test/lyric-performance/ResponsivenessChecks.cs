using System.Diagnostics;
using System.Reflection;
using FoliaLyrics;

// test/lyric-performance/ResponsivenessChecks.cs — offline checks for UI responsiveness and ordered persistence.
internal static class ResponsivenessChecks
{
    public static async Task Run(Action<bool, string> check, Dictionary<string, object> measurements)
    {
        DataFiles.Reset();
        var song = new Song("responsive", "Responsive", "Test", "", "", false, 0, 180, 1, true, []);
        var packet = new Lyrics(song.Key, song.Title, song.Artist, "[00:01.00]cached", "test", "", false);
        var cache = new OnlineCache(Path.Combine(DataFiles.Root, "responsive-cache"));
        var cacheGate = (SemaphoreSlim)typeof(OnlineCache).GetField("gate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(cache)!;
        await cacheGate.WaitAsync();
        var automatic = cache.SaveAsync(song, packet, "qq:auto", false);
        var manual = cache.SaveAsync(song, packet with { Content = "[00:01.00]manual" }, "qq:manual", true);
        var queuedRead = cache.ReadAsync(song);
        check(!automatic.IsCompleted && !manual.IsCompleted && !queuedRead.IsCompleted, "pending cache IO yields to the caller instead of blocking it");
        cacheGate.Release(); await Task.WhenAll(automatic, manual);
        check(await queuedRead is { Manual: true, CandidateKey: "qq:manual" }, "a queued manual choice replaces older automatic persistence before the next read");
        await cacheGate.WaitAsync();
        var saveBeforeReset = cache.SaveAsync(song, packet, "qq:old", false);
        var reset = cache.ForgetAsync(song); var afterReset = cache.ReadAsync(song);
        cacheGate.Release(); await Task.WhenAll(saveBeforeReset, reset);
        check(await afterReset is null, "reset remains ordered after pending saves and cannot be resurrected by them");

        // A paused UI context cannot execute queued continuations: worker-side scanning must still finish and persist.
        var scanRoot = Path.Combine(DataFiles.Root, "responsive-scan"); Directory.CreateDirectory(scanRoot);
        File.WriteAllText(Path.Combine(scanRoot, "one.lrc"), "[ti:Responsive]\n[ar:Test]\n[00:01.00]local");
        var library = new LyricLibrary(); var ui = new PausedResolverContext();
        var previous = SynchronizationContext.Current; Task scan;
        try { SynchronizationContext.SetSynchronizationContext(ui); scan = library.Scan(scanRoot, _ => { }, CancellationToken.None); }
        finally { SynchronizationContext.SetSynchronizationContext(previous); }
        await scan.WaitAsync(TimeSpan.FromSeconds(3));
        check(new LyricLibrary().Find(song)?.Content.Contains("local") == true && !ui.Posted.Task.IsCompleted,
            "scan persistence completes on its worker without requiring a UI continuation");

        DataFiles.Reset();
        var invoked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var searchContexts = new System.Collections.Concurrent.ConcurrentQueue<SynchronizationContext?>();
        TestProviders.SearchHandler = async (query, enabled, _) =>
        {
            searchContexts.Enqueue(SynchronizationContext.Current); invoked.TrySetResult(); await release.Task;
            return new([new(enabled.Single(), "responsive", query.Title, query.Artist, "", query.Duration, "timed")], []);
        };
        using (var facade = new OnlineLyrics())
        {
            TestProviders.Attach(facade); Task<OnlineSearchResult> search;
            try { SynchronizationContext.SetSynchronizationContext(ui); search = facade.Search(LyricQuery.From(song), ["qq"], CancellationToken.None); }
            finally { SynchronizationContext.SetSynchronizationContext(previous); }
            await invoked.Task.WaitAsync(TimeSpan.FromSeconds(3));
            check(searchContexts.All(context => context is null), "provider search and response decoding start outside the host UI context");
            release.SetResult();
            var deadline = Stopwatch.StartNew();
            while (!search.IsCompleted)
            {
                if (deadline.Elapsed > TimeSpan.FromSeconds(3)) throw new TimeoutException("Provider search did not complete after releasing its response");
                ui.Drain(); await Task.Delay(1);
            }
            var found = await search;
            SynchronizationContext? fetchContext = ui;
            TestProviders.FetchHandler = (_, _, _) => { fetchContext = SynchronizationContext.Current; return Task.FromResult<Lyrics?>(packet); };
            Task<Lyrics?> fetch;
            try { SynchronizationContext.SetSynchronizationContext(ui); fetch = facade.Fetch(found.Candidates.Single(), song, CancellationToken.None); }
            finally { SynchronizationContext.SetSynchronizationContext(previous); }
            check(await fetch.WaitAsync(TimeSpan.FromSeconds(3)) == packet && fetchContext is null,
                "provider lyric decoding and validation finish without a UI continuation");
        }

        DataFiles.Reset();
        TestProviders.SearchHandler = (query, enabled, _) => Task.FromResult(new OnlineSearchResult([new(enabled.Single(), "save-race", query.Title, query.Artist, "", query.Duration, "timed")], []));
        DataFiles.Save("library.json", new LibraryState { Entries = [new(Path.Combine(scanRoot, "one.lrc"), song.Title, song.Artist)] });
        using (var host = new MainWindow())
        {
            await host.Search("Previous", "Test");
            var hostCache = (OnlineCache)typeof(MainWindow).GetField("onlineCache", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
            var hostGate = (SemaphoreSlim)typeof(OnlineCache).GetField("gate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(hostCache)!;
            await hostGate.WaitAsync();
            var selected = host.Select("qq:save-race", "");
            await host.FirstPacket.Task.WaitAsync(TimeSpan.FromSeconds(3));
            var replacement = host.Resolve(song); hostGate.Release();
            await Task.WhenAll(selected, replacement).WaitAsync(TimeSpan.FromSeconds(3));
            check(host.Status.Key == song.Key && host.Packets.Last().Key == song.Key && host.Packets.Last().Content.Contains("local"),
                "switching songs during a pending cache save cannot restore the old selection status");
        }

        // Measure only how long the UI caller spends enqueueing a realistically large cache write.
        var largePacket = packet with { Content = "[00:01.00]" + new string('字', 350_000) };
        var watch = Stopwatch.StartNew(); var pendingSave = cache.SaveAsync(song, largePacket, "qq:large", false); watch.Stop();
        measurements["largeCacheEnqueueMs"] = watch.Elapsed.TotalMilliseconds;
        await pendingSave;
        check((await cache.ReadAsync(song))?.Lyrics.Content == largePacket.Content, "large asynchronous cache writes preserve the entire lyric payload");
        await CheckFailures(check, song, packet, scanRoot);
    }

    // Lock the actual cache file to exercise deletion failures without touching user files or injecting production hooks.
    private static async Task CheckFailures(Action<bool, string> check, Song song, Lyrics packet, string scanRoot)
    {
        foreach (var import in new[] { false, true })
        {
            DataFiles.Reset();
            using var host = new MainWindow();
            await host.Resolve(song);
            var hostCache = (OnlineCache)typeof(MainWindow).GetField("onlineCache", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
            await hostCache.SaveAsync(song, packet, "qq:locked", false);
            var file = (string)typeof(OnlineCache).GetMethod("FileName", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(hostCache, [song])!;
            using var locked = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            var heldSearch = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            TestProviders.SearchHandler = (_, _, _) => heldSearch.Task;
            var pendingSearch = host.Search(song.Title, song.Artist);
            check(host.Status.Busy && host.Status.Phase == "matching", "failure fixture begins with a busy search: import=" + import);
            try
            {
                await (import ? host.Import(Path.Combine(scanRoot, "one.lrc")) : host.Reset());
                throw new Exception("Locked cache deletion unexpectedly succeeded");
            }
            catch (IOException)
            {
                check(!host.Status.Busy && host.Status.Phase == "failed" && host.Status.Errors.Length == 1 && host.Status.Message.Contains(host.Status.Errors[0]),
                    "locked cache deletion reports failed and clears the cancelled lookup's busy state: import=" + import);
            }
            finally { heldSearch.TrySetResult(new([], [])); }
            await pendingSearch.WaitAsync(TimeSpan.FromSeconds(3));
            check(host.Status.Phase == "failed", "late cancelled search cannot replace cache deletion failure: import=" + import);
        }

        DataFiles.Reset();
        using (var host = new MainWindow())
        {
            await host.Resolve(song);
            var heldSearch = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            TestProviders.SearchHandler = (_, _, _) => heldSearch.Task;
            var pendingSearch = host.Search(song.Title, song.Artist);
            try { await host.Import(Path.Combine(scanRoot, "missing.lrc")); throw new Exception("Missing import unexpectedly succeeded"); }
            catch (IOException) { check(!host.Status.Busy && host.Status.Phase == "failed" && host.Status.Errors.Length == 1, "unreadable local import also clears the cancelled search busy state"); }
            finally { heldSearch.TrySetResult(new([], [])); }
            await pendingSearch.WaitAsync(TimeSpan.FromSeconds(3));
        }

        DataFiles.Reset();
        DataFiles.Save("library.json", new LibraryState { Entries = [new(Path.Combine(scanRoot, "one.lrc"), song.Title, song.Artist)] });
        using (var host = new MainWindow())
        {
            var oldSong = song with { Key = "locked-old", Title = "LockedOld" };
            await host.Resolve(oldSong);
            var hostCache = (OnlineCache)typeof(MainWindow).GetField("onlineCache", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
            await hostCache.SaveAsync(oldSong, packet, "qq:locked-old", false);
            var file = (string)typeof(OnlineCache).GetMethod("FileName", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(hostCache, [oldSong])!;
            using var locked = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            var cacheGate = (SemaphoreSlim)typeof(OnlineCache).GetField("gate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(hostCache)!;
            await cacheGate.WaitAsync();
            var resetting = host.Reset(); var replacement = host.Resolve(song); cacheGate.Release();
            try { await resetting; throw new Exception("Locked old cache deletion unexpectedly succeeded"); }
            catch (IOException) { }
            await replacement.WaitAsync(TimeSpan.FromSeconds(3));
            check(host.Status.Key == song.Key && host.Status.Phase == "ready" && host.Status.Errors.Length == 0,
                "obsolete cache deletion failure leaves the new song's ready state intact");
        }
    }
}
