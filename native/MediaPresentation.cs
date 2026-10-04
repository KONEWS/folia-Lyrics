// native/MediaPresentation.cs — session packets follow visible metadata changes; clocks remain separate.
namespace FoliaLyrics;
internal static class MediaPresentation
{
    public static bool Same(Song? previous, Song next) => previous is not null
        && previous.Key == next.Key && previous.Title == next.Title && previous.Artist == next.Artist
        && previous.Album == next.Album && previous.Cover == next.Cover && previous.Source == next.Source
        && previous.SessionId == next.SessionId && previous.Controls == next.Controls
        && previous.Playing == next.Playing && previous.Duration == next.Duration && previous.Rate == next.Rate
        && previous.HasTimeline == next.HasTimeline && previous.Sources.SequenceEqual(next.Sources);
}
