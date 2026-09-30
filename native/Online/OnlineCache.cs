using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// native/Online/OnlineCache.cs: Separate files preserve user music and avoid duplicate downloads.
namespace FoliaLyrics;
internal sealed record CachedOnline(Lyrics Lyrics, string CandidateKey, bool Manual);
internal sealed class OnlineCache(string root)
{
    private string FileName(Song song)
    {
        var q = LyricQuery.From(song);
        var identity = OnlineLyrics.Normalize(q.Title) + "\n" + OnlineLyrics.Normalize(q.Artist) + "\n" + OnlineLyrics.Normalize(q.Album) + "\n" + Math.Round(q.Duration);
        return Path.Combine(root, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))) + ".json");
    }
    public CachedOnline? Read(Song song)
    {
        try { var cached = JsonSerializer.Deserialize<CachedOnline>(File.ReadAllText(FileName(song)), DataFiles.Json); return cached is null ? null : cached with { Lyrics = cached.Lyrics with { Key = song.Key } }; }
        catch { return null; }
    }
    public void Save(Song song, Lyrics lyrics, string candidateKey, bool manual)
    {
        if (song.Title.Length == 0) return; Directory.CreateDirectory(root); var file = FileName(song);
        File.WriteAllText(file + ".tmp", JsonSerializer.Serialize(new CachedOnline(lyrics, candidateKey, manual), DataFiles.Json)); File.Move(file + ".tmp", file, true);
        foreach (var old in new DirectoryInfo(root).GetFiles("*.json").OrderByDescending(f => f.LastWriteTimeUtc).Skip(500)) old.Delete();
    }
    public void Forget(Song song) { var file = FileName(song); if (File.Exists(file)) File.Delete(file); }
}
