// test/transport-smoke/PreferenceChecks.cs — executable preselection must resolve without taking another player's session.
namespace FoliaLyrics;
internal static class PreferenceChecks
{
    internal static void Run(Action<bool, string> check)
    {
        const string foobar = @"C:\Music\foobar2000.exe";
        const string copy = @"D:\Music\foobar2000.exe";
        const string qq = @"C:\Music\QQMusic.exe";
        var saved = new[] { new SavedMediaExecutable("foobar2000", foobar), new SavedMediaExecutable("QQ 音乐", qq) };
        check(MediaSourcePreference.Resolve("", ["foobar2000.exe"], saved) == "", "automatic source preference remains automatic");
        check(MediaSourcePreference.Resolve("Foobar2000.EXE", ["foobar2000.exe"], saved) == "foobar2000.exe",
            "legacy raw source preference keeps its original meaning");
        check(MediaSourcePreference.Resolve(foobar, [], saved) == foobar, "offline executable path remains selected for a future session");
        check(MediaSourcePreference.Resolve(foobar, ["FOOBAR2000.EXE"], saved) == "FOOBAR2000.EXE",
            "executable preselection follows a case-insensitive filename source");
        check(MediaSourcePreference.Resolve(foobar, ["foobar2000"], saved) == "foobar2000",
            "executable preselection follows a unique extensionless source alias");
        check(MediaSourcePreference.Resolve(qq, ["QQ Music"], saved) == "QQ Music",
            "known player metadata alias resolves its executable preselection");
        check(MediaSourcePreference.Resolve(foobar, [@"C:/Music/foobar2000.exe"], saved) == @"C:/Music/foobar2000.exe",
            "full source path uses the exact saved executable across slash styles");
        check(MediaSourcePreference.Resolve(foobar, ["spotify.exe"], saved) == foobar,
            "unrelated running player cannot replace an offline preselection");
        var duplicated = saved.Append(new SavedMediaExecutable("Another foobar", copy)).ToArray();
        check(MediaSourcePreference.Resolve(foobar, ["foobar2000.exe"], duplicated) == foobar,
            "same-named executable copies cannot be guessed from a filename-only session");
        check(MediaSourcePreference.Resolve(foobar, [copy], duplicated) == foobar,
            "another copy's full path cannot satisfy the selected executable");
        check(MediaSourcePreference.Resolve(foobar, [foobar, copy], duplicated) == foobar,
            "the selected full path remains usable despite same-named copies");
        check(MediaSourcePreference.Resolve(foobar, ["foobar2000.exe", "foobar2000"], saved) == foobar,
            "multiple plausible sessions cannot be chosen arbitrarily");
    }
}
