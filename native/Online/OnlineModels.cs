using System.Text.Json.Serialization;

// native/Online/OnlineModels.cs
namespace FoliaLyrics;
internal sealed record LyricQuery(string Title, string Artist, string Album, double Duration)
{
    public static LyricQuery From(Song song) => new(song.Title, song.Artist, song.Album, song.Duration);
}
internal sealed record LyricCandidate(string Provider, string Id, string Title, string Artist, string Album, double Duration,
    string Quality, bool Available = true, int Score = 0, bool AutoEligible = false)
{
    public string Key => Provider + ":" + Id;
    [JsonIgnore] public string AccessKey { get; init; } = "";
    [JsonIgnore] public string InlineContent { get; init; } = "";
}
internal sealed record OnlineSearchResult(LyricCandidate[] Candidates, string[] Errors);
internal sealed record OnlineState(string Key, bool Busy, string Message, LyricCandidate[] Candidates, string[] Errors, string SelectedKey = "");
internal interface IOnlineLyricProvider
{
    string Id { get; }
    string Name { get; }
    Task<LyricCandidate[]> Search(LyricQuery query, CancellationToken token);
    Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token);
}
