using System.Reflection;
using System.Text.Json;
using FoliaLyrics;

// test/lyric-performance/OnlineCacheChecks.cs — isolated regressions for persistent user choices and cache eviction.
internal static class OnlineCacheChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        var root = Path.Combine(Path.GetTempPath(), "FoliaLyricsOnlineCacheChecks_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            await CheckRetention(Path.Combine(root, "retention"), check);
            await CheckLegacyMigration(Path.Combine(root, "legacy"), check);
            await CheckUnreadableLegacy(Path.Combine(root, "unreadable-legacy"), check);
            await CheckUnreadableBinding(Path.Combine(root, "unreadable-binding"), check);
            await CheckOrdering(Path.Combine(root, "ordering"), check);
            await CheckPriorityCompatibility(Path.Combine(root, "priority-policy"), check);
        }
        finally
        {
            var cleanup = Path.GetFullPath(root);
            if (!cleanup.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(cleanup).StartsWith("FoliaLyricsOnlineCacheChecks_", StringComparison.Ordinal))
                throw new IOException("Unexpected cache check cleanup path");
            Directory.Delete(cleanup, true);
        }
    }

    // Old cache records remain readable while evaluated automatic choices retain their source policy after restarting.
    private static async Task CheckPriorityCompatibility(string root, Action<bool, string> check)
    {
        Directory.CreateDirectory(root); var cache = new OnlineCache(root); var legacy = SongOf("LegacyPriority");
        File.WriteAllText(CacheFile(cache, legacy), JsonSerializer.Serialize(new { lyrics = Packet(legacy, "old cached lyric"), candidateKey = "kugou:legacy", manual = false }, DataFiles.Json));
        check(await cache.ReadAsync(legacy) is { PriorityPolicy: 0, CandidateKey: "kugou:legacy", Manual: false },
            "existing cache JSON without a priority field remains readable and awaits the new source policy");
        await cache.SaveAsync(legacy, Packet(legacy, "evaluated fallback"), "kugou:legacy", false, OnlineLyrics.PriorityPolicyVersion);
        check((await new OnlineCache(root).ReadAsync(legacy))?.PriorityPolicy == OnlineLyrics.PriorityPolicyVersion,
            "evaluated cache policy persists across cache instances without changing lyric identity");
    }

    // Allow deletion but deny competing readers, reproducing the legacy migration failure without relying on timing.
    private static async Task CheckUnreadableLegacy(string root, Action<bool, string> check)
    {
        Directory.CreateDirectory(root); var cache = new OnlineCache(root); var chosen = SongOf("LockedLegacy");
        var legacyFile = CacheFile(cache, chosen);
        File.WriteAllText(legacyFile, JsonSerializer.Serialize(new CachedOnline(Packet(chosen, "legacy choice"), "qq:legacy-locked", true), DataFiles.Json));
        File.SetLastWriteTimeUtc(legacyFile, DateTime.UtcNow.AddYears(-2));
        for (var i = 0; i < 501; i++)
        {
            var song = SongOf("BeforeLock" + i);
            File.WriteAllText(CacheFile(cache, song), JsonSerializer.Serialize(new CachedOnline(Packet(song, "automatic"), "qq:auto" + i, false), DataFiles.Json));
        }
        var malformed = CacheFile(cache, SongOf("Malformed")); File.WriteAllText(malformed, "{invalid json");
        File.SetLastWriteTimeUtc(malformed, DateTime.UtcNow.AddYears(-3));
        var fresh = SongOf("DuringLock"); var newChoice = SongOf("NewChoiceDuringLock");
        using (var locked = new FileStream(legacyFile, FileMode.Open, FileAccess.Read, FileShare.Delete))
        {
            try { File.ReadAllText(legacyFile); throw new Exception("Legacy lock fixture allowed a competing read"); }
            catch (IOException) { check(true, "legacy lock fixture denies reads while allowing deletion"); }
            check(await cache.ReadAsync(chosen) is null, "an unreadable legacy cache remains a temporary cache miss");
            await cache.SaveAsync(fresh, Packet(fresh, "fresh"), "qq:fresh", false);
            check(File.Exists(legacyFile) && Directory.GetFiles(root, "*.json").Length > 500,
                "a temporarily unreadable legacy choice suspends eviction instead of being deleted");
            check(await cache.ReadAsync(fresh) is { Manual: false, CandidateKey: "qq:fresh" }, "new automatic downloads can still be saved during a blocked migration");
            await cache.SaveAsync(chosen, Packet(chosen, "unwanted replacement"), "qq:replacement", false);
            check(File.Exists(legacyFile) && !File.Exists(BindingFile(cache, chosen)), "an automatic save cannot overwrite an unreadable legacy choice for the same song");
            await cache.SaveAsync(newChoice, Packet(newChoice, "new manual"), "qq:new-manual", true);
            check(await cache.ReadAsync(newChoice) is { Manual: true, CandidateKey: "qq:new-manual" }, "new user choices remain writable while legacy migration is blocked");
        }
        await cache.SaveAsync(fresh, Packet(fresh, "fresh"), "qq:fresh", false);
        check(await new OnlineCache(root).ReadAsync(chosen) is { Manual: true, CandidateKey: "qq:legacy-locked" }
            && !File.Exists(legacyFile) && File.Exists(BindingFile(cache, chosen)), "the same cache retries migration after unlock and retains the original user choice on disk");
        check(Directory.GetFiles(root, "*.json").Length == 500 && !File.Exists(malformed),
            "successful migration resumes the 500-entry limit and malformed records cannot block recovery");
    }

    // An unreadable newer binding must never be replaced by its older readable legacy copy during an opportunistic read.
    private static async Task CheckUnreadableBinding(string root, Action<bool, string> check)
    {
        Directory.CreateDirectory(Path.Combine(root, "bindings")); var cache = new OnlineCache(root); var chosen = SongOf("LockedNewerBinding");
        var legacyFile = CacheFile(cache, chosen); var binding = BindingFile(cache, chosen);
        File.WriteAllText(legacyFile, JsonSerializer.Serialize(new CachedOnline(Packet(chosen, "old manual"), "qq:old", true), DataFiles.Json));
        File.WriteAllText(binding, JsonSerializer.Serialize(new CachedOnline(Packet(chosen, "newer manual"), "qq:newer", true), DataFiles.Json));
        using (var locked = new FileStream(binding, FileMode.Open, FileAccess.Read, FileShare.Delete))
        {
            check(await cache.ReadAsync(chosen) is { Manual: true, CandidateKey: "qq:old" } && File.Exists(legacyFile),
                "failed read-time migration can serve the legacy choice without replacing a locked newer binding");
            var fresh = SongOf("DuringBindingLock"); await cache.SaveAsync(fresh, Packet(fresh, "fresh"), "qq:fresh", false);
            check(File.Exists(legacyFile), "save-time migration also preserves a locked newer binding and its legacy fallback");
        }
        var next = SongOf("AfterBindingLock"); await cache.SaveAsync(next, Packet(next, "next"), "qq:next", false);
        check(await new OnlineCache(root).ReadAsync(chosen) is { Manual: true, CandidateKey: "qq:newer" } && !File.Exists(legacyFile),
            "unlocking a newer binding retries migration without restoring the older user choice");
    }

    private static Song SongOf(string title) => new(title, title, "Test", "", "", false, 0, 180, 1, true, [], "Album");
    private static Lyrics Packet(Song song, string content) => new(song.Key, song.Title, song.Artist, "[00:01.00]" + content, "test", "", false);
    private static string CacheFile(OnlineCache cache, Song song) => (string)typeof(OnlineCache)
        .GetMethod("FileName", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(cache, [song])!;
    private static string BindingFile(OnlineCache cache, Song song) => Path.Combine(Path.GetDirectoryName(CacheFile(cache, song))!, "bindings", Path.GetFileName(CacheFile(cache, song)));

    // More than one cache capacity of automatic writes must leave an older user choice intact on disk.
    private static async Task CheckRetention(string root, Action<bool, string> check)
    {
        var cache = new OnlineCache(root); var chosen = SongOf("Chosen");
        await cache.SaveAsync(chosen, Packet(chosen, "manual"), "qq:chosen", true);
        File.SetLastWriteTimeUtc(BindingFile(cache, chosen), DateTime.UtcNow.AddYears(-2));
        for (var i = 0; i < 505; i++)
        {
            var song = SongOf("Automatic" + i);
            await cache.SaveAsync(song, Packet(song, "automatic"), "qq:auto" + i, false);
            if (i == 0) File.SetLastWriteTimeUtc(CacheFile(cache, song), DateTime.UtcNow.AddYears(-1));
        }
        check(Directory.GetFiles(root, "*.json").Length == 500, "automatic online downloads retain the 500-entry limit");
        check(await cache.ReadAsync(SongOf("Automatic0")) is null, "automatic cache eviction still removes the oldest download");
        var restarted = new OnlineCache(root); var currentSession = chosen with { Key = "new-player-session" };
        check(await restarted.ReadAsync(currentSession) is { Manual: true, CandidateKey: "qq:chosen", Lyrics.Key: "new-player-session" },
            "a user choice survives more than 500 automatic writes and a cache restart with the current song key");
        await cache.SaveAsync(chosen, Packet(chosen, "automatic replacement"), "qq:replacement", false);
        check(await cache.ReadAsync(chosen) is { Manual: true, CandidateKey: "qq:chosen" }, "an automatic cache record cannot replace the separate user choice");
        await cache.ForgetAsync(chosen);
        check(await restarted.ReadAsync(chosen) is null && !File.Exists(CacheFile(cache, chosen)) && !File.Exists(BindingFile(cache, chosen)),
            "forgetting a song removes both its user choice and its ordinary download");
        check(!Directory.EnumerateFiles(root, "*.tmp", SearchOption.AllDirectories).Any(), "successful binding and cache saves leave no unfinished atomic-write files");
    }

    // The first eviction migrates old choices even if those songs have not been read since upgrading.
    private static async Task CheckLegacyMigration(string root, Action<bool, string> check)
    {
        Directory.CreateDirectory(root); var cache = new OnlineCache(root);
        var unread = SongOf("LegacyUnread"); var read = SongOf("LegacyRead"); var duplicate = SongOf("LegacyDuplicate");
        foreach (var song in new[] { unread, read, duplicate })
        {
            File.WriteAllText(CacheFile(cache, song), JsonSerializer.Serialize(new CachedOnline(Packet(song, "legacy"), "qq:legacy", true), DataFiles.Json));
            File.SetLastWriteTimeUtc(CacheFile(cache, song), DateTime.UtcNow.AddYears(-2));
        }
        check(await cache.ReadAsync(read) is { Manual: true, CandidateKey: "qq:legacy" } && File.Exists(BindingFile(cache, read)) && !File.Exists(CacheFile(cache, read)),
            "reading an old manual cache transparently migrates its binding without requesting new lyrics");
        File.WriteAllText(BindingFile(cache, duplicate), JsonSerializer.Serialize(new CachedOnline(Packet(duplicate, "new choice"), "qq:new-choice", true), DataFiles.Json));
        for (var i = 0; i < 501; i++)
        {
            var song = SongOf("OldAutomatic" + i);
            File.WriteAllText(CacheFile(cache, song), JsonSerializer.Serialize(new CachedOnline(Packet(song, "automatic"), "qq:auto" + i, false), DataFiles.Json));
        }
        var fresh = SongOf("Fresh"); await cache.SaveAsync(fresh, Packet(fresh, "fresh"), "qq:fresh", false);
        check(await new OnlineCache(root).ReadAsync(unread) is { Manual: true, CandidateKey: "qq:legacy" }
            && !File.Exists(CacheFile(cache, unread)) && Directory.GetFiles(root, "*.json").Length == 500,
            "first eviction protects an unread legacy user choice while pruning automatic downloads");
        check(await cache.ReadAsync(duplicate) is { Manual: true, CandidateKey: "qq:new-choice" } && !File.Exists(CacheFile(cache, duplicate)),
            "a newer separate user choice wins over an older legacy manual record during migration");
        var forgottenLegacy = SongOf("ForgottenLegacy");
        File.WriteAllText(CacheFile(cache, forgottenLegacy), JsonSerializer.Serialize(new CachedOnline(Packet(forgottenLegacy, "legacy"), "qq:legacy", true), DataFiles.Json));
        await cache.ForgetAsync(forgottenLegacy);
        check(await cache.ReadAsync(forgottenLegacy) is null, "forgetting also removes a legacy choice before it has been migrated");
    }

    // Queue saves, reads and resets behind the real cache gate to expose any persistence reordering.
    private static async Task CheckOrdering(string root, Action<bool, string> check)
    {
        var cache = new OnlineCache(root); var song = SongOf("Ordered");
        var gate = (SemaphoreSlim)typeof(OnlineCache).GetField("gate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(cache)!;
        await gate.WaitAsync();
        var automatic = cache.SaveAsync(song, Packet(song, "automatic"), "qq:auto", false);
        var manual = cache.SaveAsync(song, Packet(song, "manual"), "qq:manual", true);
        var automaticAfterChoice = cache.SaveAsync(song, Packet(song, "late automatic"), "qq:late", false);
        var readBeforeForget = cache.ReadAsync(song); var forget = cache.ForgetAsync(song); var readAfterForget = cache.ReadAsync(song);
        check(!automatic.IsCompleted && !manual.IsCompleted && !forget.IsCompleted && !readAfterForget.IsCompleted,
            "binding persistence continues yielding while an earlier cache operation is pending");
        gate.Release(); await Task.WhenAll(automatic, manual, automaticAfterChoice, forget);
        check(await readBeforeForget is { Manual: true, CandidateKey: "qq:manual" }, "queued reads prefer the manual choice even after a later automatic save");
        check(await readAfterForget is null, "queued forget deletes both files after older automatic and manual saves");
        await gate.WaitAsync();
        var resetBeforeChoice = cache.ForgetAsync(song); var newChoice = cache.SaveAsync(song, Packet(song, "new choice"), "qq:new", true);
        var readNewChoice = cache.ReadAsync(song); gate.Release(); await Task.WhenAll(resetBeforeChoice, newChoice);
        check(await readNewChoice is { Manual: true, CandidateKey: "qq:new" }, "a manual choice queued after reset remains persisted in request order");
    }
}
