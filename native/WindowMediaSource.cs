// native/WindowMediaSource.cs — commit player changes without an intermediate empty lyrics page.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private long sourceIntent;

    // Fixing the same live player keeps its work; explicit Auto reconsiders playing sessions without clearing presentation.
    private async Task ChangeMediaSource(string source)
    {
        // Reselecting the current source still supersedes an earlier pending launch.
        sourceIntent++;
        if (string.Equals(preferences.Source, source, StringComparison.OrdinalIgnoreCase)) return;
        var resolved = MediaSourcePreference.Resolve(source, song?.Sources.Select(item => item.Id) ?? [],
            preferences.MusicApps.Where(app => app.LaunchKind != "store").Select(app => new SavedMediaExecutable(app.Name, app.Path)));
        var keepSession = source.Length > 0 && song is { SessionId.Length: > 0 }
            && string.Equals(resolved, song.Source, StringComparison.OrdinalIgnoreCase);
        preferences.Source = source;
        if (!keepSession)
        {
            StartWork(); sourceRevision++; mediaRead?.Cancel();
            if (source.Length == 0) media.ReevaluateSelection(); else media.Invalidate();
            song = null;
            // The target read decides whether existing lyrics can stay; cancelled unfinished lookup must restart.
            if (lyrics is null) lyricKey = "\0";
        }
        SavePreferences();
        await Poll();
    }
}
