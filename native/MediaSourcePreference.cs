// native/MediaSourcePreference.cs — resolve a saved executable selection to its live GSMTC source without guessing between copies.
namespace FoliaLyrics;
internal sealed record SavedMediaExecutable(string Name, string Path);
internal static class MediaSourcePreference
{
    private static readonly StringComparer Compare = StringComparer.OrdinalIgnoreCase;
    private static string NormalizedPath(string value) => value.Replace('/', '\\').Trim();
    private static string FileName(string value) => NormalizedPath(value).Split('\\').LastOrDefault() ?? "";

    // A raw session ID keeps its legacy meaning; a saved executable path can wait for a matching session to appear.
    internal static string Resolve(string preferred, IEnumerable<string> sources, IEnumerable<SavedMediaExecutable> bindings)
    {
        if (string.IsNullOrWhiteSpace(preferred)) return "";
        var live = sources.Where(source => !string.IsNullOrWhiteSpace(source)).Distinct(Compare).ToArray();
        var exact = live.FirstOrDefault(source => Compare.Equals(source, preferred));
        if (exact is not null) return exact;

        var saved = bindings.Where(binding => !string.IsNullOrWhiteSpace(binding.Path))
            .DistinctBy(binding => NormalizedPath(binding.Path), Compare).ToArray();
        var target = saved.FirstOrDefault(binding => Compare.Equals(NormalizedPath(binding.Path), NormalizedPath(preferred)));
        if (target is null) return preferred;
        var fullPath = live.FirstOrDefault(source => Compare.Equals(NormalizedPath(source), NormalizedPath(target.Path)));
        if (fullPath is not null) return fullPath;

        var file = FileName(target.Path);
        if (file.Length == 0 || saved.Count(binding => Compare.Equals(FileName(binding.Path), file)) != 1) return preferred;
        var stem = Path.GetFileNameWithoutExtension(file);
        var catalog = MusicAppCatalog.Identify(target.Path, target.Name);
        var aliases = new[] { file, stem, target.Name }.Concat(catalog?.Aliases ?? []);
        var matching = live.Where(source => !source.Contains('\\') && !source.Contains('/') && !source.Contains('!')
            && aliases.Any(alias => alias.Length > 0 && Compare.Equals(source, alias))).ToArray();
        return matching.Length == 1 ? matching[0] : preferred;
    }
}
