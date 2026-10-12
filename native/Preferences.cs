using System.Text.Json.Serialization;

// native/Preferences.cs — desktop preferences shared by persistence and the WebView bridge.
namespace FoliaLyrics;
internal sealed class Preferences
{
    public bool Topmost { get; set; }
    public bool CloseToTaskbar { get; set; }
    public bool AudioReactive { get; set; } = true;
    public bool TransparentBackground { get; set; }
    public bool CoverTheme { get; set; } = true;
    public bool AutoImmersive { get; set; } = true;
    public int ImmersiveDelay { get; set; } = 30;
    public bool BottomHoverControls { get; set; } = true;
    public string Source { get; set; } = "";
    public MusicAppBinding[] MusicApps { get; set; } = [];
    public bool ShowMusicAppAddButton { get; set; } = true;
    public bool AutoDiscoverMusicApps { get; set; } = true;
    public MusicAppCandidate[] BlockedMusicApps { get; set; } = [];
    // Old releases added every removed shortcut here; this was never an explicit user block list.
    [JsonIgnore] public string[] ExcludedAutoMusicAppPaths { get; set; } = [];
    public bool OnlineEnabled { get; set; } = true;
    public string[] OnlineProviders { get; set; } = ["qq", "kugou", "netease", "lrclib"];
}

internal sealed record MusicAppBinding(int Slot, string Name, string Path, string Icon, string LaunchKind = "exe", string AppUserModelId = "");
internal sealed record MusicAppCandidate(string Id, string Name, string Path, string Icon, string LaunchKind = "exe", string AppUserModelId = "");
