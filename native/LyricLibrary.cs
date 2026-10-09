// native/LyricLibrary.cs
namespace FoliaLyrics;
internal sealed class LibraryState
{
    public List<string> Folders { get; set; } = [];
    public List<Entry> Entries { get; set; } = [];
    public Dictionary<string, string> Bindings { get; set; } = [];
}
internal sealed class LyricLibrary
{
    private readonly object gate = new();
    private readonly LibraryState state = DataFiles.Load("library.json", new LibraryState());
    private sealed record IndexedEntry(Entry Entry, string Artist);
    private Lazy<Dictionary<string, Entry[]>>? titleIndex;
    public object Summary() { lock (gate) return new { folders = state.Folders.ToArray(), count = state.Entries.Count }; }
    public Task Scan(string? folder, Action<string> progress, CancellationToken token)
    {
        string[] folders;
        lock (gate) { folders = folder is null ? state.Folders.ToArray() : state.Folders.Append(folder).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(); }
        return Task.Run(() =>
        {
            var result = new List<Entry>(); var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var failures = 0;
            foreach (var root in folders)
            {
                if (!Directory.Exists(root)) continue;
                foreach (var path in Directory.EnumerateFiles(root, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
                {
                    token.ThrowIfCancellationRequested(); if (!LyricFiles.Supported(path) || !seen.Add(path)) continue;
                    try { result.Add(LyricFiles.Inspect(path)); } catch { failures++; }
                    if (seen.Count % 40 == 0) progress($"已扫描 {seen.Count} 个文件，{failures} 个无法读取");
                }
            }
            progress($"扫描完成：{result.Count} 个文件，{failures} 个无法读取");
            token.ThrowIfCancellationRequested();
            // Commit the scan on its worker too; serializing a large library must not resume on the UI thread.
            lock (gate) { state.Folders = folders.ToList(); state.Entries = result; titleIndex = null; DataFiles.Save("library.json", state); }
        }, token);
    }
    public Lyrics? Find(Song song)
    {
        var title = LyricFiles.Normalize(song.Title); var artist = LyricFiles.Normalize(song.Artist); string? binding;
        lock (gate) { state.Bindings.TryGetValue(title + "|" + artist, out binding); }
        if (binding is not null && File.Exists(binding)) return LyricFiles.Read(binding, song.Key, song.Title, song.Artist);
        if (title.Length == 0) return null;
        Lazy<Dictionary<string, Entry[]>> lookup;
        lock (gate) { lookup = titleIndex ??= CreateIndex(state.Entries.ToArray()); }
        if (!lookup.Value.TryGetValue(title, out var matching)) return null;
        var candidates = matching.Select(e => new IndexedEntry(e, LyricFiles.Normalize(e.Artist)))
            .OrderBy(e => LyricFiles.Audio.Contains(Path.GetExtension(e.Entry.Path)) ? 1 : 0).ToArray();
        var exact = candidates.Where(e => artist.Length > 0 && e.Artist == artist).ToArray();
        if (exact.Length > 0) candidates = exact;
        else
        {
            var groups = candidates.Select(e => e.Artist).Distinct().Take(2).ToArray();
            if (groups.Length > 1 || artist.Length > 0 && groups.Length == 1 && groups[0].Length > 0 && groups[0] != artist) return null;
        }
        foreach (var candidate in candidates)
        {
            try { var packet = LyricFiles.Read(candidate.Entry.Path, song.Key, song.Title, song.Artist); if (!string.IsNullOrWhiteSpace(packet.Content)) return packet; }
            catch (Exception e) { DataFiles.Log(e); }
        }
        return null;
    }
    // Build once on the first lookup worker; scan/import replace the lazy snapshot before the next lookup.
    private static Lazy<Dictionary<string, Entry[]>> CreateIndex(Entry[] entries) => new(() =>
        entries.GroupBy(e => LyricFiles.Normalize(e.Title)).ToDictionary(g => g.Key, g => g.ToArray()));
    public Lyrics Import(string path, Song? song)
    {
        var entry = LyricFiles.Inspect(path); var title = song is { Title.Length: > 0 } ? song.Title : entry.Title;
        var artist = song is { Title.Length: > 0 } ? song.Artist : entry.Artist;
        var packet = LyricFiles.Read(path, song?.Key ?? "", title, artist);
        if (string.IsNullOrWhiteSpace(packet.Content)) throw new IOException("文件中没有歌词，请导入带内嵌歌词的音乐或时间轴歌词文件。");
        lock (gate)
        {
            state.Bindings[LyricFiles.Key(title, artist)] = path; state.Entries.RemoveAll(e => e.Path.Equals(path, StringComparison.OrdinalIgnoreCase));
            state.Entries.Add(entry); titleIndex = null; DataFiles.Save("library.json", state);
        }
        return packet;
    }
}
