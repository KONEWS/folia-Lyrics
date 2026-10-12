using System.Text.Json;
using FoliaLyrics;

// test/music-app-smoke/InboxChecks.cs — exercises host-owned candidates, session dismissal, unbinding and restart behavior offline.
internal static class InboxChecks
{
    internal static void Run(Action<bool, string> check, Action<Action, string> reject, JsonSerializerOptions json, MusicAppBinding executable)
    {
        var first = executable with { Slot = 0, Name = "Detected Player" };
        var second = new MusicAppBinding(0, "Salt", "", "", "store", "Sakawish.SaltPlayerforWindows_q65q631pyh094!SaltPlayerforWindows");
        var firstId = MusicAppDiscoveryPolicy.Id(first); var secondId = MusicAppDiscoveryPolicy.Id(second);
        var preferences = new Preferences { Topmost = true, MusicApps = [executable with { Slot = 3, Name = "Custom existing", Icon = "custom-icon" }] };
        var inbox = new MusicAppDiscoveryInbox();
        var before = JsonSerializer.Serialize(preferences, json);
        var running = new Dictionary<string, string> { [secondId] = "42:1000" };
        inbox.Update(new([first, second], running), preferences.MusicApps, [], manual: false);
        check(inbox.Candidates.Length == 1 && inbox.Candidates[0].Id == secondId && JsonSerializer.Serialize(preferences, json) == before,
            "scanning only publishes unbound candidates and never changes preferences");
        using (var selected = Payload(json, new { inbox.BatchId, ids = new[] { secondId }, path = "untrusted.exe", appUserModelId = "untrusted" }))
            check(inbox.Resolve(selected.RootElement, multiple: true).Single().AppUserModelId == second.AppUserModelId,
                "confirmation resolves only the host candidate and ignores supplied launch data");
        foreach (var invalid in new object[] { new { batchId = "stale", ids = new[] { secondId } }, new { inbox.BatchId, ids = new[] { new string('0', 64) } },
            new { inbox.BatchId, ids = new[] { "not-an-id" } }, new { inbox.BatchId, ids = Array.Empty<string>() },
            new { inbox.BatchId, ids = Enumerable.Repeat(secondId, 257).ToArray() } })
        {
            using var payload = Payload(json, invalid);
            reject(() => inbox.Resolve(payload.RootElement, multiple: true), "stale, unknown, malformed or excessive confirmation is rejected");
        }
        using (var later = Payload(json, new { inbox.BatchId })) inbox.Dismiss(later.RootElement);
        check(inbox.Candidates.Length == 0, "later clears the current pending batch");
        inbox.Update(new([], running), preferences.MusicApps, [], manual: false);
        check(inbox.Candidates.Length == 0, "same running instance remains dismissed during automatic scans");
        inbox.Update(new([second], running), preferences.MusicApps, [], manual: true);
        check(inbox.Candidates.Length == 1, "manual scans bypass session dismissal");
        using (var later = Payload(json, new { inbox.BatchId })) inbox.Dismiss(later.RootElement);
        inbox.Update(new([], new Dictionary<string, string> { [secondId] = "42:2000" }), preferences.MusicApps, [], manual: false);
        check(inbox.Candidates.Length == 1, "PID reuse with a new start time restores automatic discovery");
        inbox.Reconcile(preferences.MusicApps, [MusicAppDiscoveryPolicy.Candidate(second)]);
        inbox.Update(new([second], running), preferences.MusicApps, [MusicAppDiscoveryPolicy.Candidate(second)], manual: true);
        check(inbox.Candidates.Length == 0, "explicit blocks suppress candidates even during manual scans");
        inbox.Update(new([second], running), preferences.MusicApps, [], manual: true);
        check(inbox.Candidates.Length == 1, "removing a block restores a candidate after rescan");
        var newHost = new MusicAppDiscoveryInbox();
        newHost.Update(new([second], running), [], [], manual: false);
        check(newHost.Candidates.Length == 1, "session dismissal does not survive a new host");
        CheckDeferred(check, json, first, firstId);
        CheckDeferredRestarts(check, first, firstId);
        CheckPartialConfirmation(check, json, first, second);
    }

    private static void CheckDeferred(Action<bool, string> check, JsonSerializerOptions json, MusicAppBinding binding, string id)
    {
        var inbox = new MusicAppDiscoveryInbox();
        inbox.DeferBinding(binding, deferredAtUtcTicks: 150);
        var running = new Dictionary<string, string> { [id] = "9:100" };
        inbox.Update(new([binding], running), [], [], manual: false);
        check(inbox.Candidates.Length == 0, "unbind/replacement records current process baseline without permanently blocking");
        inbox.Update(new([], running), [], [], manual: false);
        check(inbox.Candidates.Length == 0, "automatic scans do not immediately restore an unbound current instance");
        inbox.Update(new([binding], running), [], [], manual: true);
        check(inbox.Candidates.Length == 1, "manual scanning can immediately restore an unbound app");
        using (var later = Payload(json, new { inbox.BatchId })) inbox.Dismiss(later.RootElement);
        inbox.Update(new([], new Dictionary<string, string> { [id] = "9:200" }), [], [], manual: false);
        check(inbox.Candidates.Length == 1, "unbound app is automatically rediscovered after process restart");
    }

    // Exercise the interval between an unbind action and the next background scan, including previously unseen processes.
    private static void CheckDeferredRestarts(Action<bool, string> check, MusicAppBinding binding, string id)
    {
        foreach (var hadSnapshot in new[] { false, true })
        {
            var inbox = new MusicAppDiscoveryInbox();
            if (hadSnapshot) inbox.Update(new([], new Dictionary<string, string> { [id] = "9:100" }), [binding], [], manual: false);
            inbox.DeferBinding(binding, deferredAtUtcTicks: 150);
            inbox.Update(new([], new Dictionary<string, string> { [id] = "9:200" }), [], [], manual: false);
            check(inbox.Candidates.Single().Id == id,
                "restart before the first post-unbind scan remains discoverable; prior snapshot=" + hadSnapshot);
        }
        var multiple = new MusicAppDiscoveryInbox();
        multiple.DeferBinding(binding, deferredAtUtcTicks: 150);
        multiple.Update(new([], new Dictionary<string, string> { [id] = "9:100|10:200" }), [], [], manual: false);
        check(multiple.Candidates.Single().Id == id, "a new instance alongside the deferred instance restores discovery");
        var installed = new MusicAppDiscoveryInbox();
        installed.DeferBinding(binding, deferredAtUtcTicks: 150);
        installed.Update(new([binding], new Dictionary<string, string>()), [], [], manual: false);
        check(installed.Candidates.Length == 0, "unbinding a stopped installation keeps automatic installation results deferred");
        installed.Update(new([], new Dictionary<string, string> { [id] = "10:200" }), [], [], manual: false);
        check(installed.Candidates.Single().Id == id, "opening a previously stopped unbound app restores discovery");
    }

    private static void CheckPartialConfirmation(Action<bool, string> check, JsonSerializerOptions json, MusicAppBinding first, MusicAppBinding second)
    {
        var inbox = new MusicAppDiscoveryInbox();
        inbox.Update(new([first, second], new Dictionary<string, string>()), [], [], manual: true);
        using var payload = Payload(json, new { inbox.BatchId, ids = new[] { MusicAppDiscoveryPolicy.Id(first) } });
        var bindings = MusicAppDiscoveryPolicy.Merge([], inbox.Resolve(payload.RootElement, true).Select(app => MusicAppDiscoveryPolicy.Binding(app)), []);
        inbox.Reconcile(bindings, []);
        check(bindings.Length == 1 && inbox.Candidates.Single().Id == MusicAppDiscoveryPolicy.Id(second),
            "confirming a selection retains the unselected pending candidate");
    }

    private static JsonDocument Payload(JsonSerializerOptions json, object value) => JsonDocument.Parse(JsonSerializer.Serialize(value, json));
}
