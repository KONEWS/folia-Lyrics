using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;

// test/lyric-performance/TestServices.cs — real local/cache/resolver code uses isolated persistence and a network-free provider.
namespace FoliaLyrics;
internal static class DataFiles
{
    public static readonly string Root = Path.Combine(Path.GetTempPath(), "FoliaLyricsLyricPerf_" + Guid.NewGuid().ToString("N"));
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly ConcurrentDictionary<string, string> files = new();
    public static readonly ConcurrentQueue<Exception> Errors = new();
    public static T Load<T>(string name, T fallback) => files.TryGetValue(name, out var value) ? JsonSerializer.Deserialize<T>(value, Json)! : fallback;
    public static void Save<T>(string name, T value) => files[name] = JsonSerializer.Serialize(value, Json);
    public static void Log(Exception error) => Errors.Enqueue(error);
    public static void Reset() { files.Clear(); while (Errors.TryDequeue(out _)) { } TestProviders.Reset(); }
}
internal static class TestProviders
{
    public static readonly ConcurrentQueue<string[]> Searches = new();
    public static readonly ConcurrentQueue<string> Fetches = new();
    public static Func<LyricQuery, string[], CancellationToken, Task<OnlineSearchResult>>? SearchHandler;
    public static Func<LyricCandidate, Song, CancellationToken, Task<Lyrics?>>? FetchHandler;
    public static async Task<LyricCandidate[]> Search(string provider, LyricQuery query, CancellationToken token)
    {
        Searches.Enqueue([provider]);
        var result = SearchHandler is null ? new OnlineSearchResult([], []) : await SearchHandler(query, [provider], token);
        return result.Candidates;
    }
    public static Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token)
    {
        Fetches.Enqueue(candidate.Provider);
        return FetchHandler?.Invoke(candidate, song, token) ?? Task.FromResult<Lyrics?>(new(song.Key, song.Title, song.Artist, "[00:01.00]online", candidate.Provider, "", false));
    }
    public static void Reset() { Searches.Clear(); Fetches.Clear(); SearchHandler = null; FetchHandler = null; }
    public static void Attach(OnlineLyrics facade) => typeof(OnlineLyrics).GetField("providers", BindingFlags.NonPublic | BindingFlags.Instance)!
        .SetValue(facade, OnlineLyrics.ProviderIds.Select(id => (IOnlineLyricProvider)new TestProvider(id)).ToArray());
    private sealed class TestProvider(string id) : IOnlineLyricProvider
    {
        public string Id => id;
        public string Name => id;
        public Task<LyricCandidate[]> Search(LyricQuery query, CancellationToken token) => TestProviders.Search(id, query, token);
        public Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token) => TestProviders.Fetch(candidate, song, token);
    }
}
internal sealed partial class MainWindow : IDisposable
{
    private readonly CancellationTokenSource lifetime = new();
    private readonly Preferences preferences;
    private readonly LyricLibrary library = new();
    private Song? song;
    private Lyrics? lyrics;
    private string lyricKey = "";
    public bool IsDisposed { get; private set; }
    public readonly ConcurrentQueue<Lyrics> Packets = new();
    public readonly TaskCompletionSource<Lyrics> FirstPacket = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public readonly TaskCompletionSource<OnlineState> FirstSelection = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public MainWindow(Preferences? preferences = null) { this.preferences = preferences ?? new(); TestProviders.Attach(online); }
    public Task Resolve(Song target) { song = target; return ResolveLyrics(target, StartWork()); }
    public Task Select(string id, string key) => SelectOnline(JsonSerializer.SerializeToElement(new { id, songKey = key }));
    public Task Search(string title, string artist) => SearchOnline(JsonSerializer.SerializeToElement(new { title, artist }));
    public Task Reset() => ResetOnline();
    public Task Import(string path) => ImportLyrics(path);
    public OnlineState Status => onlineState;
    public (bool Automatic, double Duration, string AppliedKey) LookupSnapshot => (automaticLookup, lookupDuration, lyricKey);
    private void Send(string type, object data)
    {
        if (type == "lyrics" && data is Lyrics packet) { Packets.Enqueue(packet); FirstPacket.TrySetResult(packet); }
        if (type == "online" && data is OnlineState state && state.SelectedKey.Length > 0) FirstSelection.TrySetResult(state);
    }
    private void SavePreferences() { }
    public void Dispose() { IsDisposed = true; lifetime.Cancel(); lyricWork?.Cancel(); lyricWork?.Dispose(); lifetime.Dispose(); online.Dispose(); }
}
