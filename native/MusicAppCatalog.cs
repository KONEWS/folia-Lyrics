// native/MusicAppCatalog.cs — known desktop music executables and bounded installation locations.
namespace FoliaLyrics;
internal sealed record MusicAppDefinition(string Name, string[] Executables, string[] Aliases, string[] Locations, string[]? PackageFamilies = null);
internal static class MusicAppCatalog
{
    internal static readonly MusicAppDefinition[] Apps =
    [
        new("QQ 音乐", ["QQMusic.exe"], ["QQ音乐", "QQ Music", "QQMusic"], [@"Tencent\QQMusic", "QQMusic"]),
        new("网易云音乐", ["cloudmusic.exe"], ["网易云音乐", "CloudMusic", "NetEase Cloud Music"], [@"NetEase\CloudMusic", "CloudMusic"]),
        new("酷狗音乐", ["KuGou.exe", "KuGouMusic.exe"], ["酷狗音乐", "KuGou"], [@"KuGou\KGMusic", "KuGou", "KGMusic"]),
        new("酷我音乐", ["KwMusic.exe", "KuwoMusic.exe"], ["酷我音乐", "Kuwo Music", "KuwoMusic"], [@"kuwo\kuwomusic", "KuwoMusic"]),
        new("foobar2000", ["foobar2000.exe"], ["foobar2000"], ["foobar2000"]),
        new("Spotify", ["Spotify.exe"], ["Spotify"], ["Spotify"], ["SpotifyAB.SpotifyMusic_zpdnekdrzrea0"]),
        new("MusicBee", ["MusicBee.exe"], ["MusicBee"], ["MusicBee"]),
        new("AIMP", ["AIMP.exe"], ["AIMP"], ["AIMP"]),
        new("椒盐音乐", ["SaltPlayer.exe", "Salt Player for Windows.exe", "MusicPlayer.exe"], ["椒盐音乐", "SaltPlayer", "Salt Player"], ["SaltPlayer", "Salt Player"], ["Sakawish.SaltPlayerforWindows_q65q631pyh094"]),
        new("YesPlayMusic", ["YesPlayMusic.exe"], ["YesPlayMusic"], ["YesPlayMusic"]),
        new("MusicFree", ["MusicFree.exe"], ["MusicFree"], ["MusicFree"]),
        new("洛雪音乐", ["lx-music-desktop.exe"], ["lx-music", "洛雪音乐"], ["lx-music-desktop"]),
        new("Listen1", ["Listen1.exe"], ["Listen1", "Listen 1"], ["Listen1"]),
        new("Apple Music", ["AppleMusic.exe"], ["Apple Music", "AppleMusic"], ["AppleMusic"]),
        new("Windows 媒体播放器", ["Microsoft.Media.Player.exe", "Music.UI.exe"], ["Microsoft.ZuneMusic"], [], ["Microsoft.ZuneMusic_8wekyb3d8bbwe"]),
    ];
    internal static IEnumerable<string> ExecutableNames => Apps.SelectMany(app => app.Executables).Distinct(StringComparer.OrdinalIgnoreCase);
    internal static MusicAppDefinition? Identify(string path, string? product = null)
    {
        var name = Path.GetFileName(path);
        var app = Apps.FirstOrDefault(app => app.Executables.Contains(name, StringComparer.OrdinalIgnoreCase));
        // A generic MusicPlayer filename needs music-app metadata before it can be discovered automatically.
        return name.Equals("MusicPlayer.exe", StringComparison.OrdinalIgnoreCase) && (app is null || !Matches(product, app)) ? null : app;
    }
    internal static bool Matches(string? displayName, MusicAppDefinition app) => !string.IsNullOrWhiteSpace(displayName)
        && app.Aliases.Any(alias => displayName.Contains(alias, StringComparison.OrdinalIgnoreCase));
    internal static MusicAppDefinition? IdentifyPackage(string packageName, string familyName) => Apps.FirstOrDefault(app =>
        app.PackageFamilies?.Contains(familyName, StringComparer.OrdinalIgnoreCase) == true || Matches(packageName, app));
}
