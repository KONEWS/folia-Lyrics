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
    public bool OnlineEnabled { get; set; } = true;
    public string[] OnlineProviders { get; set; } = ["kugou", "qq", "netease", "lrclib"];
}
