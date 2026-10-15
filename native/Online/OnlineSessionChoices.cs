using System.Collections.Concurrent;

// native/Online/OnlineSessionChoices.cs — keep pending or unsaved manual choices without replacing an older durable binding.
namespace FoliaLyrics;
internal sealed class SessionOnlineChoice(Lyrics lyrics, string candidateKey)
{
    private int outcome = -1;
    public Lyrics Lyrics { get; } = lyrics;
    public string CandidateKey { get; } = candidateKey;
    public bool Failed => Volatile.Read(ref outcome) == 0;
    public void Complete(bool saved) => Interlocked.Exchange(ref outcome, saved ? 1 : 0);
}
internal sealed class OnlineSessionChoices
{
    private readonly ConcurrentDictionary<string, SessionOnlineChoice> choices = new();
    public SessionOnlineChoice Remember(Song song, Lyrics lyrics, string candidateKey)
    {
        var choice = new SessionOnlineChoice(lyrics, candidateKey); choices[OnlineCache.Identity(song)] = choice; return choice;
    }
    public SessionOnlineChoice? Read(Song song) => choices.TryGetValue(OnlineCache.Identity(song), out var choice) ? choice : null;
    // A late save cannot clear a newer choice or recreate one replaced by an import/reset.
    public void CompleteSave(Song song, SessionOnlineChoice choice, bool saved)
    {
        choice.Complete(saved);
        if (saved) choices.TryRemove(new KeyValuePair<string, SessionOnlineChoice>(OnlineCache.Identity(song), choice));
    }
    public void Clear(Song song) => choices.TryRemove(OnlineCache.Identity(song), out _);
}
