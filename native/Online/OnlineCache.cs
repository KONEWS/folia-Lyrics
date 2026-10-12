using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// native/Online/OnlineCache.cs: Separate files preserve user music and avoid duplicate downloads.
namespace FoliaLyrics;
internal sealed record CachedOnline(Lyrics Lyrics, string CandidateKey, bool Manual, int PriorityPolicy = 0);
internal sealed class OnlineCache(string root)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private bool legacyBindingsMigrated;
    private string BindingFile(string cacheFile) => Path.Combine(root, "bindings", Path.GetFileName(cacheFile));
    private string FileName(Song song)
    {
        var q = LyricQuery.From(song);
        var identity = OnlineLyrics.Normalize(q.Title) + "\n" + OnlineLyrics.Normalize(q.Artist) + "\n" + OnlineLyrics.Normalize(q.Album) + "\n" + Math.Round(q.Duration);
        return Path.Combine(root, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))) + ".json");
    }
    public Task<CachedOnline?> ReadAsync(Song song) => Run(() =>
    {
        try
        {
            var file = FileName(song);
            var cached = ReadFile(BindingFile(file));
            if (cached is null)
            {
                cached = ReadFile(file);
                if (cached is { Manual: true })
                {
                    try { MigrateBinding(file); }
                    catch { /* A read-only cache can still serve the previously chosen lyrics. */ }
                }
            }
            return cached is null ? null : cached with { Lyrics = cached.Lyrics with { Key = song.Key } };
        }
        catch { return null; }
    });
    public Task SaveAsync(Song song, Lyrics lyrics, string candidateKey, bool manual, int priorityPolicy = 0) => Run(() =>
    {
        if (song.Title.Length == 0) return false;
        Directory.CreateDirectory(root); var migrated = MigrateLegacyBindings();
        var cacheFile = FileName(song); var file = manual ? BindingFile(cacheFile) : cacheFile;
        if (!manual && !migrated)
        {
            // New downloads may still be saved, but never replace an unreadable or unmigrated user choice.
            try { if (ReadFileStrict(cacheFile) is { Manual: true }) return false; }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return false; }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file + ".tmp", JsonSerializer.Serialize(new CachedOnline(lyrics, candidateKey, manual, priorityPolicy), DataFiles.Json)); File.Move(file + ".tmp", file, true);
        if (manual && File.Exists(cacheFile)) File.Delete(cacheFile);
        if (migrated) foreach (var old in new DirectoryInfo(root).GetFiles("*.json").OrderByDescending(f => f.LastWriteTimeUtc).Skip(500)) old.Delete();
        return true;
    });
    public Task ForgetAsync(Song song) => Run(() =>
    {
        var file = FileName(song); if (File.Exists(file)) File.Delete(file);
        var binding = BindingFile(file); if (File.Exists(binding)) File.Delete(binding);
        return true;
    });

    private static CachedOnline? ReadFile(string file)
    {
        try { return File.Exists(file) ? ReadFileStrict(file) : null; }
        catch { return null; }
    }

    // Missing or malformed records are cache misses; IO failures must remain visible to migration so they cannot authorize eviction.
    private static CachedOnline? ReadFileStrict(string file)
    {
        try
        {
            var cached = JsonSerializer.Deserialize<CachedOnline>(File.ReadAllText(file), DataFiles.Json);
            return cached is { Lyrics: not null } ? cached : null;
        }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        catch (JsonException) { return null; }
    }

    // Move legacy choices before the first eviction, including songs that have not been played since upgrading.
    private bool MigrateLegacyBindings()
    {
        if (legacyBindingsMigrated) return true;
        var complete = true;
        foreach (var file in Directory.GetFiles(root, "*.json"))
        {
            try { if (ReadFileStrict(file) is { Manual: true }) MigrateBinding(file); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { complete = false; }
        }
        // A temporarily unreadable record pauses eviction; the next save retries the scan after its lock is released.
        return legacyBindingsMigrated = complete;
    }

    private void MigrateBinding(string file)
    {
        var binding = BindingFile(file); Directory.CreateDirectory(Path.GetDirectoryName(binding)!);
        if (ReadFileStrict(binding) is { Manual: true }) File.Delete(file);
        else File.Move(file, binding, true);
    }

    // Queue file operations in request order before leaving the UI thread, so a reset or manual choice cannot be undone by an older save.
    private async Task<T> Run<T>(Func<T> operation)
    {
        await gate.WaitAsync().ConfigureAwait(false);
        try { return await Task.Run(operation).ConfigureAwait(false); }
        finally { gate.Release(); }
    }
}
