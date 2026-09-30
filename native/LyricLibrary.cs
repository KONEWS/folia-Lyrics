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
    public object Summary() { lock (gate) return new { folders = state.Folders.ToArray(), count = state.Entries.Count }; }
    public async Task Scan(string? folder, Action<string> progress, CancellationToken token)
    {
        string[] folders;
        lock (gate) { folders = folder is null ? state.Folders.ToArray() : state.Folders.Append(folder).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(); }
        var entries = await Task.Run(() =>
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
            progress($"扫描完成：{result.Count} 个文件，{failures} 个无法读取"); return result;
        }, token);
        token.ThrowIfCancellationRequested();
        lock (gate) { state.Folders = folders.ToList(); state.Entries = entries; DataFiles.Save("library.json", state); }
    }
    public Lyrics? Find(Song song)
    {
        Entry[] entries; string? binding;
        lock (gate) { entries = state.Entries.ToArray(); state.Bindings.TryGetValue(LyricFiles.Key(song.Title, song.Artist), out binding); }
        if (binding is not null && File.Exists(binding)) return LyricFiles.Read(binding, song.Key, song.Title, song.Artist);
        var title = LyricFiles.Normalize(song.Title); if (title.Length == 0) return null;
        var artist = LyricFiles.Normalize(song.Artist); var candidates = entries.Where(e => LyricFiles.Normalize(e.Title) == title).ToArray();
        var exact = candidates.Where(e => artist.Length > 0 && LyricFiles.Normalize(e.Artist) == artist).ToArray();
        if (exact.Length > 0) candidates = exact;
        else
        {
            var groups = candidates.GroupBy(e => LyricFiles.Normalize(e.Artist)).ToArray();
            if (groups.Length > 1 || artist.Length > 0 && groups.Length == 1 && groups[0].Key.Length > 0 && groups[0].Key != artist) return null;
        }
        foreach (var candidate in candidates.OrderBy(e => LyricFiles.Audio.Contains(Path.GetExtension(e.Path)) ? 1 : 0))
        {
            try { var packet = LyricFiles.Read(candidate.Path, song.Key, song.Title, song.Artist); if (!string.IsNullOrWhiteSpace(packet.Content)) return packet; }
            catch (Exception e) { DataFiles.Log(e); }
        }
        return null;
    }
    public Lyrics Import(string path, Song? song)
    {
        var entry = LyricFiles.Inspect(path); var title = song is { Title.Length: > 0 } ? song.Title : entry.Title;
        var artist = song is { Title.Length: > 0 } ? song.Artist : entry.Artist;
        var packet = LyricFiles.Read(path, song?.Key ?? "", title, artist);
        if (string.IsNullOrWhiteSpace(packet.Content)) throw new IOException("文件中没有歌词，请导入带内嵌歌词的音乐或时间轴歌词文件。");
        lock (gate)
        {
            state.Bindings[LyricFiles.Key(title, artist)] = path; state.Entries.RemoveAll(e => e.Path.Equals(path, StringComparison.OrdinalIgnoreCase));
            state.Entries.Add(entry); DataFiles.Save("library.json", state);
        }
        return packet;
    }
}
