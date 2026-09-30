// native/MediaModels.cs
namespace FoliaLyrics;
internal sealed record MediaSource(string Id, string Label);
internal sealed record MediaCapabilities(bool Play, bool Pause, bool Toggle, bool Previous, bool Next);
internal sealed record Song(string Key, string Title, string Artist, string Cover, string Source, bool Playing,
    double Position, double Duration, double Rate, bool HasTimeline, MediaSource[] Sources, string Album = "",
    string SessionId = "", MediaCapabilities? Controls = null);
