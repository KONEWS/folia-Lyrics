using System.Text.Json;
using FoliaLyrics;

// test/transport-smoke/Program.cs
var checks = new List<string>();
void Check(bool condition, string name) { if (!condition) throw new Exception(name); checks.Add(name); Console.WriteLine("PASS " + name); }
MediaControlRequest Request(string action = "pause") => new(Guid.NewGuid().ToString(), "session-a", "song-a", action);
Task<MediaControlResult> Run(FakeTarget target, string action = "pause") => new MediaTransport().Execute(Request(action), () => target, () => true);

foreach (var action in new[] { "play", "pause", "previous", "next" })
{
    var target = new FakeTarget { Playing = action != "play" };
    var result = await Run(target, action);
    Check(result.Success && target.Sent.SequenceEqual([action]), "routes " + action + " only to selected target");
}
foreach (var action in new[] { "play", "pause" })
{
    var target = new FakeTarget { Playing = action != "play", Caps = new(false, false, true, false, false) };
    var result = await Run(target, action);
    Check(result.Success && target.Sent.SequenceEqual(["toggle"]), "toggle-only player supports " + action);
    target = new() { Playing = action == "play" };
    result = await Run(target, action);
    Check(result.Success && target.Sent.Count == 0, "fresh " + action + " state is idempotent");
}
{
    var target = new FakeTarget { Caps = new(false, false, false, false, false) };
    Check(!(await Run(target)).Success && target.Sent.Count == 0, "unsupported operation never sent");
    target = new() { Key = "song-b" };
    Check(!(await Run(target)).Success && target.Sent.Count == 0, "stale song never controlled");
    target = new() { Id = "session-b" };
    Check(!(await Run(target)).Success && target.Sent.Count == 0, "replaced session never controlled");
    var result = await new MediaTransport().Execute(Request(), () => null, () => true);
    Check(!result.Success, "disconnected player rejected");
}
{
    var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var target = new FakeTarget { ReadGate = gate.Task }; var current = true;
    var pending = new MediaTransport().Execute(Request(), () => target, () => current);
    current = false; gate.SetResult();
    Check(!(await pending).Success && target.Sent.Count == 0, "source change during async lookup blocks dispatch");
}
{
    var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var target = new FakeTarget { ReadGate = gate.Task }; var transport = new MediaTransport();
    var first = transport.Execute(Request(), () => target, () => true);
    var second = await transport.Execute(Request("next"), () => target, () => true);
    gate.SetResult();
    Check(!second.Success && (await first).Success && target.Sent.SequenceEqual(["pause"]), "rapid clicks rejected without a stale queue");
    Check((await transport.Execute(Request("next"), () => target, () => true)).Success, "completed operation unlocks controls");
}
{
    var target = new FakeTarget { Accepted = false };
    Check(!(await Run(target)).Success, "player rejection is reported");
    target = new() { Failure = new IOException("Disconnected") };
    Check(!(await Run(target)).Success, "native exception is reported");
    target = new();
    Check(!(await Run(target, "record")).Success && target.Sent.Count == 0, "unrecognized actions rejected");
}
{
    var target = new FakeTarget { WaitForCancellation = true };
    var result = await new MediaTransport(TimeSpan.FromMilliseconds(80)).Execute(Request(), () => target, () => true);
    Check(!result.Success && target.TokenCancelled && target.Sent.Count == 0, "deadline cancels lookup and does not dispatch");
    using var lifetime = new CancellationTokenSource(); lifetime.Cancel();
    target = new();
    result = await new MediaTransport().Execute(Request(), () => target, () => true, lifetime.Token);
    Check(!result.Success && target.Sent.Count == 0, "shutdown prevents dispatch");
}
{
    var binding = new MediaSessionBinding<object>();
    SessionCandidate<object> Candidate(nint id, string source = "salt", bool playing = true) => new(new object(), id, source, playing);
    var first = binding.Select([Candidate(1)], 1, ""); var id = binding.Id;
    var pausedWrapper = Candidate(1, playing: false);
    Check(ReferenceEquals(binding.Select([pausedWrapper], 1, "")?.Value, pausedWrapper.Value) && binding.Id == id,
        "fresh managed wrapper keeps native session token on pause");
    Check(binding.Select([pausedWrapper, Candidate(2, "browser")], 2, "")?.Source == "salt" && binding.Id == id,
        "paused player stays bound when another app becomes current and playing");
    var recreated = Candidate(3, playing: false);
    Check(ReferenceEquals(binding.Find([recreated], id)?.Value, recreated.Value), "unique player session recreation resolves fresh target before next poll");
    Check(binding.Select([recreated], 3, "")?.Source == "salt" && binding.Id == id, "unique same-app recreation preserves paused control token");
    Check(binding.Find([Candidate(4), Candidate(5)], id) is null, "ambiguous same-app replacement cannot receive an old command");
    binding.Select([recreated, Candidate(2, "browser")], 2, "browser");
    Check(binding.Id != id && !binding.Contains([recreated], id), "explicit player change invalidates old command");
    binding.Select([], 0, ""); Check(binding.Id.Length == 0, "closed player clears binding");
    binding.Select([recreated], 3, ""); Check(binding.Id != id, "player reopening after observed disconnect receives new token");
}
{
    var actions = new System.Collections.Concurrent.ConcurrentQueue<Action>();
    var owner = Environment.CurrentManagedThreadId; var aliveReads = 0; var sends = 0; var alive = true;
    var dispatcher = new UiDispatcher(owner, actions.Enqueue, () => {
        Check(Environment.CurrentManagedThreadId == owner, "UI readiness is read only on owning thread"); aliveReads++; return alive;
    });
    var worker = new Thread(() => dispatcher.Run(() => {
        Check(Environment.CurrentManagedThreadId == owner, "WebView message is sent only on owning thread"); sends++;
    }));
    worker.Start(); worker.Join(); Check(aliveReads == 0 && sends == 0 && actions.Count == 1, "worker progress marshals before touching any UI property");
    while (actions.TryDequeue(out var action)) action(); Check(sends == 1, "marshalled scan progress reaches UI");
    alive = false; dispatcher.Run(() => sends++); Check(sends == 1, "queued send is discarded after window disposal");
    var unavailable = new UiDispatcher(owner + 100, _ => throw new InvalidOperationException("Handle destroyed"), () => true);
    unavailable.Run(() => throw new Exception("must not run")); Check(true, "handle destruction while queueing does not crash scanner");
}
{
    var target = new FakeTarget(); var transport = new MediaTransport();
    var paused = await transport.Execute(Request(), () => target, () => true);
    target.Playing = false;
    var resumed = await transport.Execute(Request("play"), () => target, () => true);
    target.Playing = true;
    var next = await transport.Execute(Request("next"), () => target, () => true);
    Check(paused.Success && resumed.Success && next.Success && target.Sent.SequenceEqual(["pause", "play", "next"]), "pause then resume then next remains controllable");
}
{
    var root = Path.Combine(Path.GetTempPath(), "folia-scan-" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(root);
    try
    {
        var files = Path.Combine(root, "lyrics"); Directory.CreateDirectory(files);
        await File.WriteAllTextAsync(Path.Combine(files, "one.lrc"), "[ti:One]\n[ar:Test]\n[00:01.00]one");
        var library = new LyricLibrary(); var progress = new List<string>();
        await library.Scan(files, progress.Add, CancellationToken.None);
        Check(progress.Count == 1 && JsonSerializer.Serialize(library.Summary()).Contains("\"count\":1"), "one-file directory scan completes and saves its index");
        for (var i = 0; i < 44; i++) await File.WriteAllTextAsync(Path.Combine(files, i + ".lrc"), "[00:01.00]line");
        var owner = Environment.CurrentManagedThreadId;
        var actions = new System.Collections.Concurrent.ConcurrentQueue<Action>(); var updates = 0;
        var ui = new UiDispatcher(owner, actions.Enqueue, () => true);
        // Block the test thread, not a production UI: drain queued reports afterward on the owner.
        library.Scan(null, _ => ui.Run(() => { if (Environment.CurrentManagedThreadId != owner) throw new Exception("off UI thread"); updates++; }), CancellationToken.None).GetAwaiter().GetResult();
        while (actions.TryDequeue(out var action)) action();
        Check(updates == 2 && JsonSerializer.Serialize(library.Summary()).Contains("\"count\":45"), "45-file scan marshals intermediate and final progress and commits index");
        var previous = JsonSerializer.Serialize(library.Summary());
        using var cancel = new CancellationTokenSource();
        var failedFolder = Path.Combine(root, "cancelled"); Directory.CreateDirectory(failedFolder);
        try { await library.Scan(failedFolder, _ => cancel.Cancel(), cancel.Token); throw new Exception("must cancel"); }
        catch (OperationCanceledException) { }
        Check(JsonSerializer.Serialize(library.Summary()) == previous, "cancelled scan preserves prior folders and lyric index");
    }
    finally { Directory.Delete(root, true); }
}
Directory.CreateDirectory("test-results/transport");
await File.WriteAllTextAsync("test-results/transport/native.json", JsonSerializer.Serialize(new { checks, failures = 0 }, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"{checks.Count} checks passed");

sealed class FakeTarget : IMediaControlTarget
{
    public string Id = "session-a", Key = "song-a";
    public bool Playing = true, Accepted = true, WaitForCancellation;
    private CancellationToken receivedToken;
    public bool TokenCancelled => receivedToken.IsCancellationRequested;
    public Exception? Failure;
    public Task? ReadGate;
    public MediaCapabilities Caps = new(true, true, true, true, true);
    public List<string> Sent = [];
    public async Task<MediaControlSnapshot> Read(CancellationToken token)
    {
        receivedToken = token;
        if (ReadGate is not null) await ReadGate.WaitAsync(token);
        if (WaitForCancellation)
        {
            await Task.Delay(Timeout.Infinite, token);
        }
        token.ThrowIfCancellationRequested();
        return new(Id, Key, Playing, Caps);
    }
    public Task<bool> Send(string action, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (Failure is not null) throw Failure;
        Sent.Add(action); return Task.FromResult(Accepted);
    }
}
