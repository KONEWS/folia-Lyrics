using System.Text.Json;

// native/WindowLyricInspection.cs: Reuse the displayed lyric parser to verify downloaded content before automatic selection.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly LyricInspectionRequests lyricInspections = new();
    private Task<LyricContentQuality> InspectOnlineLyrics(Lyrics packet, CancellationToken token) =>
        lyricInspections.Inspect(packet, (id, lyrics) => Send("inspectLyrics", new { requestId = id, packet = lyrics }), token);

    private void CompleteLyricInspection(JsonElement value)
    {
        if (!value.TryGetProperty("usable", out var usable) || usable.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
            || !value.TryGetProperty("wordTimed", out var wordTimed) || wordTimed.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return;
        lyricInspections.Complete(value.Text("requestId"), value.Text("key"), new(usable.GetBoolean(), wordTimed.GetBoolean()));
    }
}
