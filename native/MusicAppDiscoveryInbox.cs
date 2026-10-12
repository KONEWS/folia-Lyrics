using System.Text.Json;

// native/MusicAppDiscoveryInbox.cs — host-owned discovery batches, confirmation validation and session-only dismissal.
namespace FoliaLyrics;
internal sealed class MusicAppDiscoveryInbox
{
    private readonly Dictionary<string, MusicAppCandidate> known = new(StringComparer.Ordinal);
    private readonly Dictionary<string, MusicAppCandidate> pending = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> dismissed = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> deferredUntilSnapshot = new(StringComparer.Ordinal);
    private IReadOnlyDictionary<string, string> running = new Dictionary<string, string>();
    internal string BatchId { get; private set; } = Guid.NewGuid().ToString("N");
    internal MusicAppCandidate[] Candidates => pending.Values.OrderBy(app => app.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
    internal IEnumerable<string> KnownIds => known.Keys;

    // A dismissed identity returns automatically only when a new running instance is observed; manual scans bypass dismissal.
    internal void Update(MusicAppScan scan, IEnumerable<MusicAppBinding> bindings, IEnumerable<MusicAppCandidate> blocked, bool manual)
    {
        Reconcile(bindings, blocked);
        running = scan.RunningInstances;
        foreach (var (id, deferredAt) in deferredUntilSnapshot)
            dismissed[id] = InstancesStartedBefore(running.GetValueOrDefault(id, ""), deferredAt);
        deferredUntilSnapshot.Clear();
        var additions = scan.Candidates.Select(MusicAppDiscoveryPolicy.Candidate).ToArray();
        var excluded = new HashSet<string>(bindings.Select(MusicAppDiscoveryPolicy.Id).Concat(blocked.Select(app => app.Id)));
        foreach (var app in additions)
            if (!excluded.Contains(app.Id)) known[app.Id] = app;
        foreach (var app in additions.Concat(known.Values.Where(app => running.ContainsKey(app.Id))).DistinctBy(app => app.Id))
        {
            if (excluded.Contains(app.Id)) continue;
            var instance = running.GetValueOrDefault(app.Id, "");
            if (!manual && dismissed.TryGetValue(app.Id, out var previous) && (instance.Length == 0 || instance == previous)) continue;
            dismissed.Remove(app.Id);
            pending[app.Id] = app;
        }
    }

    internal void Reconcile(IEnumerable<MusicAppBinding> bindings, IEnumerable<MusicAppCandidate> blocked)
    {
        foreach (var id in bindings.Select(MusicAppDiscoveryPolicy.Id).Concat(blocked.Select(app => app.Id)).ToArray()) Remove(id);
    }

    internal MusicAppCandidate[] Resolve(JsonElement value, bool multiple)
    {
        ValidateBatch(value);
        string[] ids;
        if (multiple)
        {
            if (!value.TryGetProperty("ids", out var items) || items.ValueKind != JsonValueKind.Array || items.GetArrayLength() is 0 or > 256)
                throw new IOException("请选择要添加的音乐软件。");
            ids = items.EnumerateArray().Select(ReadId).Distinct(StringComparer.Ordinal).ToArray();
        }
        else ids = [ReadId(value.TryGetProperty("id", out var id) ? id : default)];
        return ids.Select(id => pending.TryGetValue(id, out var app) ? app : throw new IOException("候选列表已更新，请重新选择音乐软件。")).ToArray();
    }

    internal void Dismiss(JsonElement value)
    {
        ValidateBatch(value);
        foreach (var app in pending.Values) dismissed[app.Id] = running.GetValueOrDefault(app.Id, "");
        pending.Clear();
        BatchId = Guid.NewGuid().ToString("N");
    }

    // Removal/replacement defers the currently running instance while keeping manual scans and later restarts discoverable.
    internal void DeferBinding(MusicAppBinding binding, long? deferredAtUtcTicks = null)
    {
        var candidate = MusicAppDiscoveryPolicy.Candidate(binding);
        known[candidate.Id] = candidate;
        dismissed[candidate.Id] = running.GetValueOrDefault(candidate.Id, "");
        deferredUntilSnapshot[candidate.Id] = deferredAtUtcTicks ?? DateTime.UtcNow.Ticks;
        if (pending.Remove(candidate.Id) && pending.Count == 0) BatchId = Guid.NewGuid().ToString("N");
    }

    internal void Remove(string id)
    {
        known.Remove(id); dismissed.Remove(id); deferredUntilSnapshot.Remove(id);
        if (pending.Remove(id) && pending.Count == 0) BatchId = Guid.NewGuid().ToString("N");
    }

    // Capture only instances already alive at removal; a restart before the next scan must remain discoverable.
    private static string InstancesStartedBefore(string instances, long deferredAt) => string.Join("|", instances.Split('|')
        .Where(instance => long.TryParse(instance.AsSpan(instance.IndexOf(':') + 1), out var startedAt) && startedAt <= deferredAt));

    private void ValidateBatch(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("batchId", out var batch)
            || batch.ValueKind != JsonValueKind.String || batch.GetString() != BatchId)
            throw new IOException("候选列表已更新，请重新选择音乐软件。");
    }

    internal static string ReadId(JsonElement value) => value.ValueKind == JsonValueKind.String && value.GetString() is { Length: 64 } id
        && id.All(char.IsAsciiHexDigit) ? id : throw new IOException("音乐软件候选标识无效。");
}
