using System.Text;
using System.Text.RegularExpressions;

// native/Online/OnlineLyrics.cs: Explicit cross-provider facade; UI never sees raw service responses.
namespace FoliaLyrics;
internal sealed class OnlineLyrics : IDisposable
{
    private readonly OnlineHttp http;
    private readonly IOnlineLyricProvider[] providers;
    public static readonly string[] ProviderIds = ["kugou", "qq", "netease", "lrclib"];
    public OnlineLyrics(OnlineHttp? transport = null)
    { http = transport ?? new(); providers = [new KugouLyricProvider(http), new QqLyricProvider(http), new NeteaseLyricProvider(http), new LrclibLyricProvider(http)]; }
    public async Task<OnlineSearchResult> Search(LyricQuery query, string[] enabled, CancellationToken token)
    {
        var pages = await Task.WhenAll(providers.Where(p => enabled.Contains(p.Id)).Select(async p =>
        {
            try { return (Candidates: await p.Search(query, token), Error: ""); }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
            catch (Exception e) { return (Candidates: Array.Empty<LyricCandidate>(), Error: $"{p.Name}：{(e is OperationCanceledException ? "请求超时" : e.Message)}"); }
        }));
        token.ThrowIfCancellationRequested();
        var candidates = pages.SelectMany(p => p.Candidates).Select(c => Rank(c, query)).DistinctBy(c => c.Key)
            .OrderByDescending(c => c.Score).ThenBy(c => Array.IndexOf(ProviderIds, c.Provider)).Take(40).ToArray();
        return new(candidates, pages.Where(p => p.Error.Length > 0).Select(p => p.Error).ToArray());
    }
    public async Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token)
    {
        var provider = providers.First(p => p.Id == candidate.Provider);
        var result = await provider.Fetch(candidate, song, token); token.ThrowIfCancellationRequested();
        if (result is null) return null;
        if (result.Format == "qq-qrc") return result.Content.Length > 16 && Regex.IsMatch(result.Content, "^[0-9a-fA-F]+$") ? result : null;
        if (!Regex.IsMatch(result.Content, @"\[\d+(?::\d+|,\d+)[^\]]*\]")) return null;
        return result;
    }
    public static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).ToLowerInvariant(), @"[^\p{L}\p{N}]", "");
    internal static LyricCandidate Rank(LyricCandidate c, LyricQuery q)
    {
        var title = Normalize(q.Title); var artist = Normalize(q.Artist); var album = Normalize(q.Album);
        var titleMatch = title.Length > 0 && title == Normalize(c.Title);
        var artistMatch = artist.Length > 0 && artist == Normalize(c.Artist);
        var albumMatch = album.Length > 0 && album == Normalize(c.Album);
        var durationMatch = q.Duration > 0 && c.Duration > 0 && Math.Abs(c.Duration - q.Duration) <= 2;
        var eligible = titleMatch && artistMatch && c.Available && (durationMatch || q.Duration <= 0 && albumMatch);
        var score = (titleMatch ? 45 : 0) + (artistMatch ? 30 : 0) + (durationMatch ? 15 : 0) + (albumMatch ? 8 : 0) + (c.Available ? 2 : 0);
        return c with { Score = score, AutoEligible = eligible };
    }
    public void Dispose() => http.Dispose();
}
