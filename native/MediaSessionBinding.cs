// native/MediaSessionBinding.cs
namespace FoliaLyrics;
internal sealed record SessionCandidate<T>(T Value, nint Identity, string Source, bool Playing) where T : class;
// Keep a paused player selected; wrappers around the same COM session share one identity.
internal sealed class MediaSessionBinding<T> where T : class
{
    private nint identity; private string source = "";
    public string Id { get; private set; } = "";
    public SessionCandidate<T>? Select(SessionCandidate<T>[] sessions, nint current, string preferred)
    {
        var eligible = preferred.Length == 0 ? sessions : sessions.Where(s => s.Source == preferred).ToArray();
        var selected = Find(eligible, Id)
            ?? eligible.FirstOrDefault(s => s.Identity == current && s.Playing)
            ?? eligible.FirstOrDefault(s => s.Playing)
            ?? eligible.FirstOrDefault(s => s.Identity == current)
            ?? eligible.FirstOrDefault();
        if (selected is null) { Clear(); return null; }
        if (Id.Length == 0 || selected.Source != source || Find(eligible, Id) is null) Id = Guid.NewGuid().ToString("N");
        identity = selected.Identity; source = selected.Source;
        return selected;
    }
    public SessionCandidate<T>? Find(SessionCandidate<T>[] sessions, string id)
    {
        if (Id.Length == 0 || id != Id) return null;
        var exact = sessions.FirstOrDefault(s => s.Identity == identity && s.Source == source);
        if (exact is not null) return exact;
        // A player can recreate its session on pause. Rebind only one unambiguous app instance;
        // MediaTransport still validates the fresh song metadata immediately before dispatch.
        var sameSource = sessions.Where(s => s.Source == source).Take(2).ToArray();
        return sameSource.Length == 1 ? sameSource[0] : null;
    }
    public bool Contains(SessionCandidate<T>[] sessions, string id) => Find(sessions, id) is not null;
    public void Clear() { identity = 0; source = ""; Id = ""; }
}
