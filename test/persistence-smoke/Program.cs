using System.Text.Json;
using FoliaLyrics;

// test/persistence-smoke/Program.cs — actual file locks verify failed saves preserve disk data and retain useful live state.
var checks = 0;
void Check(bool passed, string message) { if (!passed) throw new InvalidOperationException(message); checks++; }
var root = Path.GetFullPath(DataFiles.Root);
Directory.CreateDirectory(root);
try
{
    var host = new MainWindow();
    Check(host.SaveTopmost(false), "initial preferences save succeeds");
    Check(host.Messages.Count == 1 && host.Messages[0].Type == "preferences", "successful saves publish preferences without an error notice");
    var preferencesPath = Path.Combine(root, "preferences.json");
    var previous = File.ReadAllText(preferencesPath);
    host.Messages.Clear();
    using (var held = File.Open(preferencesPath, FileMode.Open, FileAccess.Read, FileShare.None))
        Check(!host.SaveTopmost(true), "an exclusive file lock is reported as a failed save");
    Check(File.ReadAllText(preferencesPath) == previous, "failed replacement preserves the original preferences");
    Check(host.Messages.Single(message => message.Type == "preferences").Data.GetProperty("topmost").GetBoolean(), "the changed setting remains effective in the current session");
    Check(host.Messages.Single(message => message.Type == "notice").Data.GetProperty("text").GetString()!.Contains("未能保存"), "failed settings persistence emits a visible warning");
    Check(!Directory.EnumerateFiles(root, "*.tmp").Any(), "failed replacement cleans temporary files");
    host.Messages.Clear();
    Check(host.SaveTopmost(true), "saving can be retried after the lock clears");
    Check(DataFiles.Load("preferences.json", new Preferences()).Topmost, "the retried setting is persisted");
    Check(host.Messages.All(message => message.Type != "notice"), "a successful retry no longer emits a failure");

    var folder = Path.Combine(root, "lyrics"); Directory.CreateDirectory(folder);
    var first = Path.Combine(folder, "first.lrc");
    File.WriteAllText(first, "[ti:First]\n[ar:Artist]\n[00:01.00]first lyric");
    var song = new Song("song", "First", "Artist", "", "", false, 0, 180, 1, true, []);
    var library = new LyricLibrary();
    var imported = library.Import(first, song);
    Check(imported.Saved && imported.Lyrics.Content.Contains("first lyric"), "successful imports report their persistence result");
    var libraryPath = Path.Combine(root, "library.json");
    var savedLibrary = File.ReadAllText(libraryPath);
    var second = Path.Combine(folder, "second.lrc");
    File.WriteAllText(second, "[ti:Second]\n[ar:Artist]\n[00:01.00]second lyric");
    using (var held = File.Open(libraryPath, FileMode.Open, FileAccess.Read, FileShare.None))
    {
        var changed = library.Import(second, song);
        Check(!changed.Saved && changed.Lyrics.Content.Contains("second lyric"), "an unsaved import still returns the usable lyric and failure status");
        Check(library.HasSessionImportOverride(song), "the current session remembers its explicit imported choice despite saving failure");
        Check(library.Find(song)?.Content.Contains("second lyric") == true, "unsaved imported bindings remain available for this session");
        Check(!await library.Scan(folder, _ => { }, CancellationToken.None), "a completed scan reports failed persistence");
        Check(library.Find(song with { Title = "Second" })?.Content.Contains("second lyric") == true, "unsaved scans retain the current in-memory index");
    }
    Check(File.ReadAllText(libraryPath) == savedLibrary, "failed library updates preserve the saved bindings");
    Check(new LyricLibrary().Find(song)?.Content.Contains("first lyric") == true, "a new session reads the last successfully saved binding");
    Check(await library.Scan(folder, _ => { }, CancellationToken.None), "a scan saves successfully once the lock clears");
    Check(library.HasSessionImportOverride(song), "a successful scan does not cancel this session's explicit imported choice");
    Check(DataFiles.Errors.Count == 3, "each actual IO failure is passed to the logger");
    Check(!Directory.EnumerateFiles(root, "*.tmp").Any(), "library failures also clean their temporary files");
    await DiscoveryPersistenceChecks.Run(Check, root);
    Console.WriteLine($"Persistence smoke checks passed: {checks}");
}
finally
{
    // Only remove the unique direct child this test created beneath the system temporary directory.
    var temp = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
    if (Path.GetDirectoryName(root) == temp && Path.GetFileName(root).StartsWith("FoliaLyricsPersistence_", StringComparison.Ordinal))
        Directory.Delete(root, true);
}
