using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;
using FoliaLyrics;

// test/lyric-performance/Program.cs — compare linked baseline/optimized sources without network requests or user data.
var checks = new List<string>();
void Check(bool condition, string label) { if (!condition) throw new Exception(label); checks.Add(label); Console.WriteLine("PASS " + label); }
Song SongOf(string title, string artist = "Test", string? key = null) => new(key ?? title, title, artist, "", "salt", false, 0, 180, 1, true, [], "Album", "session");
string WriteLyric(string name, string title, string artist, string line = "local")
{
    var path = Path.Combine(DataFiles.Root, name);
    File.WriteAllText(path, $"[ti:{title}]\n[ar:{artist}]\n[00:01.00]{line}"); return path;
}
void Seed(params Entry[] entries) => DataFiles.Save("library.json", new LibraryState { Entries = entries.ToList() });
// Exercise private production entry points without changing the existing isolated MainWindow fixture.
void InvokeHost(MainWindow host, string method, params object[] values) => typeof(MainWindow)
    .GetMethod(method, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(host, values);
var measurements = new Dictionary<string, object>();
measurements["processorCount"] = Environment.ProcessorCount;
measurements["runtimeVersion"] = Environment.Version.ToString();
measurements["runTimestampUtc"] = DateTimeOffset.UtcNow;
var baseline = args.Contains("--baseline");
var logicOnly = args.Contains("--logic-only");
Directory.CreateDirectory(DataFiles.Root);
try
{
    DataFiles.Reset();
    var a = WriteLyric("a.lrc", "Ｍａｔｃｈ！", "Ａｒｔｉｓｔ", "exact");
    var b = WriteLyric("b.lrc", "Match", "Other", "other");
    Seed(new(a, "Ｍａｔｃｈ！", "Ａｒｔｉｓｔ"), new(b, "Match", "Other"));
    var library = new LyricLibrary();
    Check(library.Find(SongOf("match", "artist"))?.Content.Contains("exact") == true, "normalized title and artist retain exact matching");
    Check(library.Find(SongOf("match", "")) is null, "multiple artists remain ambiguous without an artist");
    Check(library.Find(SongOf("match", "Unknown")) is null, "mismatched artists are never guessed");
    Check(library.Find(SongOf("missing")) is null, "missing title returns no local lyrics");
    Check(library.Find(SongOf("")) is null, "empty title returns no local lyrics");
    var imported = WriteLyric("import.lrc", "New", "Singer", "imported");
    library.Import(imported, SongOf("Match", "Unknown", "binding"));
    Check(library.Find(SongOf("Match", "Unknown", "binding"))?.Content.Contains("imported") == true, "manual local binding takes priority over ambiguous titles");
    Check(library.Find(SongOf("New", "Singer"))?.Content.Contains("imported") == true, "import invalidates a previously built lookup index");
    File.WriteAllText(imported, "[ti:New]\n[ar:Singer]\n[00:01.00]edited");
    Check(library.Find(SongOf("New", "Singer"))?.Content.Contains("edited") == true, "external lyric edits are read afresh");
    File.Delete(imported);
    Check(library.Find(SongOf("New", "Singer")) is null, "deleted lyric files cannot return stale content");
    var scanRoot = Path.Combine(DataFiles.Root, "scan"); Directory.CreateDirectory(scanRoot);
    var scanned = Path.Combine(scanRoot, "scan.lrc"); File.WriteAllText(scanned, "[ti:Scan]\n[ar:Test]\n[00:01.00]scan");
    await library.Scan(scanRoot, _ => { }, CancellationToken.None);
    Check(library.Find(SongOf("Scan"))?.Content.Contains("scan") == true && library.Find(SongOf("Match", "Artist")) is null, "completed scan invalidates the index and replaces old entries");
    var beforeCancel = JsonSerializer.Serialize(library.Summary());
    using (var cancellation = new CancellationTokenSource())
    {
        try { await library.Scan(null, _ => cancellation.Cancel(), cancellation.Token); throw new Exception("scan did not cancel"); }
        catch (OperationCanceledException) { }
    }
    Check(JsonSerializer.Serialize(library.Summary()) == beforeCancel && library.Find(SongOf("Scan")) is not null, "cancelled scan preserves the previous index");
    DataFiles.Reset(); Seed(new(a, "Ｍａｔｃｈ！", "Ａｒｔｉｓｔ"), new(b, "Match", "Other"));
    var concurrent = new LyricLibrary();
    var found = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => concurrent.Find(SongOf("Match", "Artist")))));
    Check(found.All(packet => packet?.Content.Contains("exact") == true), "concurrent first lookups share a valid immutable index");
    DataFiles.Reset(); Seed(new Entry(a, "Match", "Artist"));
    Check(new LyricLibrary().Find(SongOf("Match", ""))?.Content.Contains("exact") == true, "single known artist remains eligible when the player omits its artist");
    DataFiles.Reset(); Seed(new Entry(a, "Match", ""));
    Check(new LyricLibrary().Find(SongOf("Match", "Player Artist"))?.Content.Contains("exact") == true, "single untagged local artist retains the existing fallback");
    DataFiles.Reset(); Seed(new Entry(Path.Combine(DataFiles.Root, "invalid.MP3"), "Match", "Artist"), new Entry(a, "Match", "Artist"));
    Check(new LyricLibrary().Find(SongOf("Match", "Artist"))?.Content.Contains("exact") == true && DataFiles.Errors.IsEmpty, "standalone lyrics are preferred without reading a matching audio container");

    const string encodedContent = "[ti:编码]\n[ar:测试]\n[00:01.00]こんにちは 中文 🎵";
    foreach (var encoding in new Encoding[] { new UTF8Encoding(false), new UTF8Encoding(true), Encoding.Unicode, Encoding.BigEndianUnicode })
    {
        var path = Path.Combine(DataFiles.Root, encoding.CodePage + "-" + encoding.GetPreamble().Length + ".lrc");
        File.WriteAllBytes(path, [.. encoding.GetPreamble(), .. encoding.GetBytes(encodedContent)]);
        Check(LyricFiles.Read(path, "encoded", "编码", "测试").Content == encodedContent, "BOM/encoding compatibility remains intact: " + encoding.WebName + "/" + encoding.GetPreamble().Length);
    }
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    var gbk = Path.Combine(DataFiles.Root, "gbk.lrc");
    const string gbkText = "[00:01.00]中文歌词"; File.WriteAllBytes(gbk, Encoding.GetEncoding(936).GetBytes(gbkText));
    Check(LyricFiles.Read(gbk, "gbk", "GBK", "Test").Content == gbkText, "legacy GBK fallback remains intact");
    var oversized = Path.Combine(DataFiles.Root, "oversized.lrc");
    using (var file = File.Create(oversized)) file.SetLength(8_000_001);
    try { LyricFiles.Read(oversized, "oversized", "Oversized", "Test"); throw new Exception("oversized text accepted"); }
    catch (IOException) { Check(true, "text files larger than 8 MB retain the size guard"); }

    // Every resolver check runs the real WindowOnline logic with deterministic, offline provider replies.
    var target = SongOf("Resolve", key: "resolve-session");
    var localPath = WriteLyric("resolve.lrc", target.Title, target.Artist);
    var cache = new OnlineCache(Path.Combine(DataFiles.Root, "online-lyrics"));
    Lyrics Cached(string line) => new("old-session", target.Title, target.Artist, "[00:01.00]" + line, "cache", "", false);
    DataFiles.Reset(); Seed(new Entry(localPath, target.Title, target.Artist)); await cache.SaveAsync(target, Cached("manual"), "qq:manual", true);
    using (var host = new MainWindow())
    {
        var elapsed = Stopwatch.StartNew(); await host.Resolve(target); elapsed.Stop();
        measurements["manualCacheResolveMs"] = elapsed.Elapsed.TotalMilliseconds;
        Check(host.Packets.Single().Content.Contains("manual") && host.Packets.Single().Key == target.Key, "manual online cache beats local and receives the current song key");
        Check(TestProviders.Searches.IsEmpty, "manual cache avoids all provider requests");
        if (!baseline) Check(host.Status.Phase == "ready" && !host.Status.Busy, "manual cached lyrics publish ready without changing Busy");
    }
    DataFiles.Reset(); Seed(new Entry(localPath, target.Title, target.Artist)); await cache.SaveAsync(target, Cached("automatic"), "qq:auto", false);
    using (var host = new MainWindow())
    {
        var elapsed = Stopwatch.StartNew(); await host.Resolve(target); elapsed.Stop();
        measurements["localResolveMs"] = elapsed.Elapsed.TotalMilliseconds;
        Check(host.Packets.Single().Content.Contains("local"), "local lyrics beat automatic online cache");
        Check(TestProviders.Searches.IsEmpty, "local lyrics avoid all provider requests");
        if (!baseline) Check(host.Status.Phase == "ready" && !host.Status.Busy, "local lyrics publish ready without changing Busy");
    }
    DataFiles.Reset(); Seed();
    using (var host = new MainWindow(new Preferences { OnlineEnabled = false }))
    {
        var elapsed = Stopwatch.StartNew(); await host.Resolve(target); elapsed.Stop();
        measurements["automaticCacheResolveMs"] = elapsed.Elapsed.TotalMilliseconds;
        Check(host.Packets.Single().Content.Contains("automatic"), "automatic online cache works when networking is disabled");
        Check(TestProviders.Searches.IsEmpty, "disabled networking never invokes providers");
        if (!baseline) Check(host.Status.Phase == "ready" && !host.Status.Busy, "automatic cache publishes ready even when networking is disabled");
    }
    if (!baseline)
    {
        Check(new OnlineState("legacy", false, "legacy", [], []).Phase == "idle", "old OnlineState construction defaults to idle");
        DataFiles.Reset(); Seed();
        var phasePreferences = new Preferences();
        using (var host = new MainWindow(phasePreferences))
        {
            var precheck = new PausedResolverContext();
            var previousContext = SynchronizationContext.Current;
            typeof(MainWindow).GetField("song", BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(host, SongOf("PhasePrecheck", key: "phase-precheck"));
            try
            {
                SynchronizationContext.SetSynchronizationContext(precheck);
                InvokeHost(host, "BeginResolve", SongOf("PhasePrecheck", key: "phase-precheck"), false);
            }
            finally { SynchronizationContext.SetSynchronizationContext(previousContext); }
            Check(host.Status.Phase == "matching" && !host.Status.Busy && host.LookupSnapshot.Automatic,
                "BeginResolve exposes local precheck as matching while Busy remains false");
            phasePreferences.OnlineEnabled = false; InvokeHost(host, "OnlinePreferenceChanged");
            await precheck.Posted.Task.WaitAsync(TimeSpan.FromSeconds(3)); precheck.Drain();
            Check(host.Status.Phase == "idle" && !host.Status.Busy && TestProviders.Searches.IsEmpty && host.Packets.IsEmpty,
                "disabling online matching cancels the precheck without retaining matching or publishing late lyrics");
        }
        DataFiles.Reset(); Seed();
        using (var host = new MainWindow())
        {
            await host.Resolve(SongOf("NoPhaseResults", key: "no-phase-results"));
            Check(host.Status.Phase == "failed" && !host.Status.Busy && host.Status.Candidates.Length == 0 && host.Status.Errors.Length == 0,
                "automatic search with no candidates and no errors still publishes failed");
            await host.Search("NoPhaseResults", "Test");
            Check(host.Status.Phase == "failed" && !host.Status.Busy && host.Status.Candidates.Length == 0 && host.Status.Errors.Length == 0,
                "manual search with no candidates and no errors still publishes failed");
        }
    }
    await cache.ForgetAsync(target); DataFiles.Reset(); Seed(new Entry(localPath, target.Title, target.Artist));
    using (var host = new MainWindow())
    {
        var old = host.Resolve(SongOf("Uncached", key: "old"));
        await Task.Delay(30);
        await host.Resolve(target); await old;
        Check(TestProviders.Searches.IsEmpty && host.Packets.All(packet => packet.Key == target.Key), "changing songs during debounce cancels old network work");
    }
    DataFiles.Reset(); Seed(new Entry(localPath, target.Title, target.Artist));
    var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    TestProviders.SearchHandler = async (_, _, _) => { entered.TrySetResult(); await release.Task; return new([new("kugou", "late", "Old", "Test", "Album", 180, "timed", true, 100, true)], []); };
    using (var host = new MainWindow())
    {
        var old = host.Resolve(SongOf("Old", key: "old-request"));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await host.Resolve(target); release.SetResult(); await old;
        Check(host.Packets.Single().Key == target.Key && TestProviders.Fetches.IsEmpty, "late obsolete search cannot fetch or replace current local lyrics");
    }
    DataFiles.Reset(); Seed();
    TestProviders.SearchHandler = (query, enabled, _) => Task.FromResult(new OnlineSearchResult(enabled.Reverse().Select(provider => new LyricCandidate(provider, "selected", query.Title, query.Artist, query.Album, query.Duration, "timed", true, 100, true)).ToArray(), []));
    using (var host = new MainWindow(new Preferences { OnlineProviders = ["qq", "netease"] }))
    {
        await host.Resolve(SongOf("OnlyOnline", key: "online"));
        Check(TestProviders.Searches.SelectMany(page => page).Order().SequenceEqual(new[] { "qq", "netease" }.Order()), "enabled provider selection remains unchanged");
        Check(TestProviders.Fetches.Single() == "qq", "automatic selection retains configured provider priority");
        try { await host.Select("qq:selected", "old-key"); throw new Exception("stale selection accepted"); }
        catch (IOException) { Check(true, "manual selections retain song identity checks"); }
    }

    DataFiles.Reset(); Seed();
    TestProviders.SearchHandler = async (query, providers, token) =>
    {
        var provider = providers.Single();
        if (provider == "lrclib") await Task.Delay(800, token);
        if (provider == "netease") throw new IOException("synthetic provider failure");
        return new([new(provider, "slow-benchmark", query.Title, query.Artist, query.Album, query.Duration, "timed")], []);
    };
    using (var host = new MainWindow())
    {
        var elapsed = Stopwatch.StartNew(); var pending = host.Resolve(SongOf("ProgressiveBench", key: "progressive-benchmark"));
        await host.FirstPacket.Task.WaitAsync(TimeSpan.FromSeconds(4));
        measurements["onlineFirstPacketMs"] = elapsed.Elapsed.TotalMilliseconds;
        measurements["onlineReplyDelayMs"] = 800;
        measurements["onlinePendingAfterFirstPacket"] = !pending.IsCompleted;
        await pending; measurements["onlineCompleteResultsMs"] = elapsed.Elapsed.TotalMilliseconds;
        Check(host.Packets.Single().Source == "kugou", "online first match retains highest provider priority");
        Check(host.Status.Candidates.Length == 3 && host.Status.Errors.Length == 1, "late complete results preserve every successful source and provider error");
    }

    DataFiles.Reset(); Seed();
    var highGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var lowerReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    TestProviders.SearchHandler = async (query, providers, _) =>
    {
        var provider = providers.Single();
        if (provider == "kugou") await highGate.Task;
        else lowerReady.TrySetResult();
        return new([new(provider, "priority", query.Title, query.Artist, query.Album, query.Duration, "timed")], []);
    };
    using (var host = new MainWindow())
    {
        var pending = host.Resolve(SongOf("Priority", key: "priority"));
        await lowerReady.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Check(TestProviders.Fetches.IsEmpty, "faster lower-priority source waits for a higher-priority search");
        highGate.SetResult(); await pending;
        Check(host.Packets.Single().Source == "kugou", "slow but eligible preferred source still wins");
    }

    DataFiles.Reset(); Seed();
    TestProviders.SearchHandler = (query, providers, _) => Task.FromResult(new OnlineSearchResult(providers.Single() == "kugou"
        ? Enumerable.Range(1, 3).Select(i => new LyricCandidate("kugou", "attempt" + i, query.Title, query.Artist, query.Album, query.Duration, "timed")).ToArray()
        : [new(providers.Single(), "fallback", query.Title, query.Artist, query.Album, query.Duration, "timed")], []));
    TestProviders.FetchHandler = (candidate, song, _) => candidate.Provider == "kugou"
        ? candidate.Id == "attempt1" ? Task.FromResult<Lyrics?>(null) : Task.FromException<Lyrics?>(new IOException("synthetic fetch failure"))
        : Task.FromResult<Lyrics?>(new(song.Key, song.Title, song.Artist, "[00:01.00]fallback", candidate.Provider, "", false));
    using (var host = new MainWindow())
    {
        await host.Resolve(SongOf("Fallback", key: "fallback"));
        Check(TestProviders.Fetches.Count(provider => provider == "kugou") == 2 && host.Packets.Single().Source == "qq", "automatic fetch retains two attempts per source and falls through to the next priority");
        Check(host.Status.Errors.Any(error => error.Contains("synthetic fetch failure")), "automatic fetch errors remain in the completed result");
    }

    DataFiles.Reset(); Seed();
    TestProviders.SearchHandler = (query, providers, _) => Task.FromResult(new OnlineSearchResult([new(providers.Single(), "wrong-duration", query.Title, query.Artist, query.Album, query.Duration + 3, "timed")], []));
    using (var host = new MainWindow())
    {
        await host.Resolve(SongOf("Strict", key: "strict"));
        Check(host.Packets.IsEmpty && TestProviders.Fetches.IsEmpty && host.Status.Candidates.All(candidate => !candidate.AutoEligible), "progressive automatic matching retains strict duration eligibility");
        if (!baseline) Check(host.Status.Phase == "choice" && !host.Status.Busy, "ineligible automatic candidates publish choice without fetching them");
    }

    // Hold the low-priority source explicitly to prove early display and both supersession paths without timing thresholds.
    if (!baseline)
    {
        DataFiles.Reset(); Seed();
        TestProviders.SearchHandler = (query, providers, _) =>
        {
            var provider = providers.Single();
            return Task.FromResult(new OnlineSearchResult(provider == "kugou"
                ? [new(provider, "early-low-score", query.Title, query.Artist, "", query.Duration, "timed")]
                : Enumerable.Range(0, 30).Select(i => new LyricCandidate(provider, "high-score" + i, query.Title, query.Artist, query.Album, query.Duration, "timed")).ToArray(), []));
        };
        using (var host = new MainWindow())
        {
            await host.Resolve(SongOf("MoreThanForty", key: "many-results"));
            Check(host.Packets.Single().Source == "kugou" && host.Status.SelectedKey == "kugou:early-low-score", "automatic matching retains an early preferred selection with more than 40 results");
            Check(host.Status.Candidates.Length == 40 && host.Status.Candidates.Any(candidate => candidate.Key == host.Status.SelectedKey), "completed automatic results retain the selected row within the 40-result limit");
            Check(host.Status.Candidates.Select(candidate => candidate.Key).Distinct().Count() == 40, "retaining the selected row cannot duplicate a completed result");
        }
        foreach (var manual in new[] { false, true })
        {
            DataFiles.Reset(); Seed(new Entry(localPath, target.Title, target.Artist));
            var lowGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            TestProviders.SearchHandler = async (query, providers, _) =>
            {
                var provider = providers.Single(); if (provider == "lrclib") await lowGate.Task;
                return new([new(provider, "early", query.Title, query.Artist, query.Album, query.Duration, "timed"), new(provider, "alternative", query.Title, query.Artist, query.Album, query.Duration, "timed")], []);
            };
            TestProviders.FetchHandler = (candidate, song, _) => Task.FromResult<Lyrics?>(new(song.Key, song.Title, song.Artist, "[00:01.00]" + candidate.Id, candidate.Provider, "", false));
            using var host = new MainWindow(); var progressiveSong = SongOf(manual ? "EarlyManual" : "EarlySwitch", key: manual ? "early-manual" : "early-switch");
            var pending = host.Resolve(progressiveSong);
            try
            {
                await host.FirstPacket.Task.WaitAsync(TimeSpan.FromSeconds(3));
                await host.FirstSelection.Task.WaitAsync(TimeSpan.FromSeconds(3));
                Check(!pending.IsCompleted && host.Status.SelectedKey == "kugou:early", "preferred lyrics appear while a lower-priority result is held: manual=" + manual);
                Check(host.Status.Phase == "ready" && !host.Status.Busy, "early automatic lyrics remain ready while lower-priority results are pending: manual=" + manual);
                if (manual)
                {
                    await host.Select("kugou:alternative", progressiveSong.Key);
                    Check(await cache.ReadAsync(progressiveSong) is { Manual: true }, "early manual selection is persisted as a manual binding");
                }
                else await host.Resolve(target);
            }
            finally { lowGate.TrySetResult(); }
            await pending;
            Check(manual ? host.Status.SelectedKey == "kugou:alternative" && host.Packets.Last().Content.Contains("alternative") : host.Status.Key == target.Key && host.Packets.Last().Key == target.Key,
                "late result completion cannot overwrite " + (manual ? "a manual selection" : "the new song"));
        }
    }

    DataFiles.Reset(); Seed();
    var manualGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var manualStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    TestProviders.SearchHandler = async (query, providers, _) =>
    {
        var provider = providers.Single(); manualStarted.TrySetResult(); if (provider == "lrclib") await manualGate.Task;
        return new([new(provider, "manual-result", query.Title, query.Artist, query.Album, query.Duration, "timed")], []);
    };
    using (var host = new MainWindow())
    {
        var pending = host.Search("ManualSearch", "Test");
        await manualStarted.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Check(!pending.IsCompleted && host.Packets.IsEmpty && TestProviders.Fetches.IsEmpty, "manual search continues waiting for the complete result set");
        if (!baseline) Check(host.Status.Phase == "matching" && host.Status.Busy, "manual search publishes matching while Busy remains true");
        manualGate.SetResult(); await pending;
        Check(host.Status.Candidates.Length == 4 && TestProviders.Fetches.IsEmpty, "manual search retains all four sources without automatic fetching");
        if (!baseline)
        {
            Check(host.Status.Phase == "choice" && !host.Status.Busy, "complete manual results publish choice without automatic selection");
            var fetchGate = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously);
            TestProviders.FetchHandler = (_, _, _) => fetchGate.Task;
            var selected = host.Select("kugou:manual-result", "");
            Check(host.Status.Phase == "matching" && host.Status.Busy && host.Status.Candidates.Length == 4,
                "manual selection publishes matching while fetching and retains the candidate list");
            fetchGate.SetResult(new("", "ManualSearch", "Test", "[00:01.00]selected", "kugou", "", false)); await selected;
            Check(host.Status.Phase == "ready" && !host.Status.Busy && host.Status.SelectedKey == "kugou:manual-result" && host.Packets.Single().Content.Contains("selected"),
                "successful manual selection publishes ready with the selected identity and lyrics");
            TestProviders.FetchHandler = (_, _, _) => Task.FromResult<Lyrics?>(null);
            await host.Select("qq:manual-result", "");
            Check(host.Status.Phase == "failed" && !host.Status.Busy && host.Status.Candidates.Length == 4 && host.Status.SelectedKey == "kugou:manual-result" && host.Packets.Count == 1,
                "failed manual selection publishes failed while preserving prior lyrics and candidates");
        }
    }

    if (!baseline) await ResponsivenessChecks.Run(Check, measurements);

    // Measure lookup work separately; --logic-only preserves the previously recorded baseline and optimized data.
    if (!logicOnly)
    {
        DataFiles.Reset();
        var benchmarkPath = WriteLyric("benchmark.lrc", "Benchmark19999", "Benchmark Artist");
        Seed(Enumerable.Range(0, 20_000).Select(i => new Entry(i == 19_999 ? benchmarkPath : Path.Combine(DataFiles.Root, i + ".lrc"), "Benchmark" + i, "Benchmark Artist")).ToArray());
        var benchmarkLibrary = new LyricLibrary(); var benchmarkSong = SongOf("Benchmark19999", "Benchmark Artist");
        var first = Stopwatch.StartNew(); Check(benchmarkLibrary.Find(benchmarkSong) is not null, "large-library initial match succeeds"); first.Stop();
        measurements["libraryEntryCount"] = 20_000; measurements["firstLookupMs"] = first.Elapsed.TotalMilliseconds;
        var allocationBefore = GC.GetAllocatedBytesForCurrentThread(); var cpuBefore = Process.GetCurrentProcess().TotalProcessorTime; var warm = Stopwatch.StartNew();
        for (var i = 0; i < 150; i++) if (benchmarkLibrary.Find(benchmarkSong) is null) throw new Exception("warm lookup missing");
        warm.Stop(); measurements["warmLookupCount"] = 150; measurements["warmLookupTotalMs"] = warm.Elapsed.TotalMilliseconds;
        measurements["warmLookupAllocatedBytes"] = GC.GetAllocatedBytesForCurrentThread() - allocationBefore;
        measurements["warmLookupCpuMs"] = (Process.GetCurrentProcess().TotalProcessorTime - cpuBefore).TotalMilliseconds;
        var utf16 = Path.Combine(DataFiles.Root, "large-utf16.lrc");
        File.WriteAllText(utf16, "[00:01.00]" + new string('字', 900_000), Encoding.Unicode);
        var readWatch = Stopwatch.StartNew();
        for (var i = 0; i < 12; i++) Check(LyricFiles.Read(utf16, "large", "Large", "Test").Content.Length > 900_000, "large UTF-16 read " + (i + 1));
        readWatch.Stop(); measurements["utf16ReadCount"] = 12; measurements["utf16ReadTotalMs"] = readWatch.Elapsed.TotalMilliseconds;
    }
    measurements["logicOnly"] = logicOnly;
    measurements["failures"] = 0;
    var output = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.Combine("validation", "performance", "lyric-optimized.json");
    Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    File.WriteAllText(output, JsonSerializer.Serialize(new { checks, measurements }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine(JsonSerializer.Serialize(measurements)); Console.WriteLine($"{checks.Count} lyric checks passed");
}

finally
{
    var cleanup = Path.GetFullPath(DataFiles.Root);
    if (!cleanup.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(cleanup).StartsWith("FoliaLyricsLyricPerf_", StringComparison.Ordinal)) throw new IOException("Unexpected test cleanup path");
    Directory.Delete(cleanup, true);
}

// Hold production async continuations until the precheck status and preference cancellation are inspected.
sealed class PausedResolverContext : SynchronizationContext
{
    private readonly ConcurrentQueue<(SendOrPostCallback Callback, object? State)> pending = new();
    public readonly TaskCompletionSource Posted = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public override void Post(SendOrPostCallback callback, object? state) { pending.Enqueue((callback, state)); Posted.TrySetResult(); }
    public void Drain() { while (pending.TryDequeue(out var item)) item.Callback(item.State); }
}
