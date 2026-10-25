using FoliaLyrics;

// Verify media seeks and range bounds with the actual native streaming classes and a private file.
var checks = 0;
void Check(bool passed, string message) { if (!passed) throw new InvalidOperationException(message); checks++; }
void Range(string? value, long length, long start, long count)
{
    Check(VideoLayerFileStore.TryRange(value, length, out var actualStart, out var actualCount) && actualStart == start && actualCount == count,
        $"range {value ?? "full"} selects the requested bytes");
}
Range(null, 100, 0, 100);
Range("bytes=10-19", 100, 10, 10);
Range("bytes=90-", 100, 90, 10);
Range("bytes=-20", 100, 80, 20);
Range("bytes=-200", 100, 0, 100);
Range("bytes=90-999999999999", 100, 90, 10);
Range("bytes=0-9223372036854775807", long.MaxValue, 0, long.MaxValue);
foreach (var bad in new[] { "bytes=100-", "bytes=20-10", "bytes=-0", "bytes=0-1,5-9", "bytes=-", "bytes=-1-2", "bytes=+1-9", "items=1-9", "bytes=999999999999999999999-" })
    Check(!VideoLayerFileStore.TryRange(bad, 100, out _, out _), $"invalid range rejected: {bad}");
Check(!VideoLayerFileStore.TryRange(null, 0, out _, out _), "empty media is rejected");
Check(VideoLayerFileStore.ContentType("video.MP4") == "video/mp4", "video extension matching is case insensitive");
Check(VideoLayerFileStore.ContentType("page.html") == "", "HTML is never served as selected media");
var temporary = Path.Combine(Path.GetTempPath(), "FoliaVideoRange_" + Guid.NewGuid().ToString("N") + ".mp4");
try
{
    File.WriteAllBytes(temporary, Enumerable.Range(0, 100).Select(value => (byte)value).ToArray());
    var file = File.OpenRead(temporary);
    using (var stream = new VideoLayerReadStream(file, 10, 20))
    {
        var buffer = new byte[100];
        Check(stream.Length == 20 && stream.Read(buffer, 2, 100 - 2) == 20, "stream exposes only the selected range");
        Check(buffer.Skip(2).Take(20).SequenceEqual(Enumerable.Range(10, 20).Select(value => (byte)value)), "range stream returns the correct bytes");
        Check(stream.Read(buffer, 0, 1) == 0, "range ends before the rest of the file");
        Check(stream.Seek(-3, SeekOrigin.End) == 17 && stream.Read(buffer, 0, 8) == 3 && buffer[0] == 27, "range seek is relative to the selected range");
        Check(stream.Seek(0, SeekOrigin.Begin) == 0 && stream.Read(buffer, 0, 2) == 2 && buffer[0] == 10, "repeated media reads rewind correctly");
        var rejected = false; try { stream.Seek(-1, SeekOrigin.Begin); } catch (IOException) { rejected = true; }
        Check(rejected, "negative media seeks are rejected");
    }
    Check(!file.CanRead, "disposing the response releases the file handle");
    Console.WriteLine($"Video layer smoke checks passed: {checks}");
}
finally { File.Delete(temporary); }
