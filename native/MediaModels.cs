// native/MediaModels.cs
namespace FoliaLyrics;
internal sealed record MediaSource(string Id, string Label, bool Playing = false);
internal static class MediaSourceStatus
{
    // Collapse multiple sessions from one app into one menu item that plays whenever any session plays.
    public static MediaSource[] Collect<T>(IEnumerable<T> sessions, Func<T, string> source, Func<T, bool> playing)
    {
        var sources = new Dictionary<string, MediaSource>(StringComparer.OrdinalIgnoreCase);
        foreach (var session in sessions)
        {
            var id = source(session);
            if (string.IsNullOrWhiteSpace(id)) continue;
            var active = playing(session);
            if (sources.TryGetValue(id, out var existing))
            {
                if (active && !existing.Playing) sources[id] = existing with { Playing = true };
            }
            else sources.Add(id, new(id, Label(id), active));
        }
        return sources.Values.ToArray();
    }

    // Correct the selected app immediately, retaining any playing sibling session and reusing unchanged snapshots.
    public static MediaSource[] RefreshSelected<T>(MediaSource[] sources, string sourceId, bool selectedPlaying,
        IEnumerable<T> siblings, Func<T, bool> playing)
    {
        var index = Array.FindIndex(sources, item => item.Id.Equals(sourceId, StringComparison.OrdinalIgnoreCase));
        if (index < 0) return sources;
        var active = selectedPlaying || siblings.Any(playing);
        if (sources[index].Playing == active) return sources;
        var updated = (MediaSource[])sources.Clone();
        updated[index] = sources[index] with { Playing = active };
        return updated;
    }

    public static string Label(string id)
    {
        var separator = id.LastIndexOf('!');
        var app = separator >= 0 ? id[(separator + 1)..] : Path.GetFileName(id);
        if (app.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) app = app[..^4];
        return string.IsNullOrWhiteSpace(app) ? id : app;
    }
}
internal sealed record MediaCapabilities(bool Play, bool Pause, bool Toggle, bool Previous, bool Next);
internal sealed record Song(string Key, string Title, string Artist, string Cover, string Source, bool Playing,
    double Position, double Duration, double Rate, bool HasTimeline, MediaSource[] Sources, string Album = "",
    string SessionId = "", MediaCapabilities? Controls = null, long Sequence = 0);
