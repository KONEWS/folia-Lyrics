using System.Text;
using System.Text.Json;

// native/AtomicJsonFile.cs — replace JSON atomically and report IO failures without changing the caller's in-memory state.
namespace FoliaLyrics;
internal static class AtomicJsonFile
{
    // Write beside the target, flush to disk, then replace it; a failed replacement preserves the previous file.
    public static bool TrySave<T>(string root, string name, T value, JsonSerializerOptions json, Action<Exception> log)
    {
        string? temp = null;
        try
        {
            var bytes = new UTF8Encoding(false).GetBytes(JsonSerializer.Serialize(value, json));
            Directory.CreateDirectory(root); var path = Path.Combine(root, name);
            temp = $"{path}.{Guid.NewGuid():N}.tmp";
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(bytes); stream.Flush(true); }
            File.Move(temp, path, true); temp = null;
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log(e); return false; }
        finally { if (temp is not null) try { File.Delete(temp); } catch { } }
    }
}
