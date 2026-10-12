using NAudio.CoreAudioApi;
using System.Text.Json;

// native/SystemVolume.cs
namespace FoliaLyrics;
internal static class SystemVolume
{
    // 每次读取当前默认输出设备与实时音量，避免设备切换或外部调节后使用旧值。
    public static SystemVolumeState Adjust(int delta)
    {
        if (!SystemVolumePolicy.IsValidDelta(delta)) throw new ArgumentOutOfRangeException(nameof(delta));
        using var enumerator = new MMDeviceEnumerator();
        using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        var endpoint = device.AudioEndpointVolume;
        endpoint.MasterVolumeLevelScalar = SystemVolumePolicy.AdjustScalar(endpoint.MasterVolumeLevelScalar, delta);
        return new(SystemVolumePolicy.ToPercent(endpoint.MasterVolumeLevelScalar), endpoint.Mute);
    }
}

internal sealed record SystemVolumeState(int Percent, bool Muted);

// 单一后台工作线程串行执行音量调整：COM 调用进行期间到达的增量会累加，结束后一次性应用；
// 任何时刻最多一个 adjust 在运行，结果按应用顺序依次发布。
internal sealed class SystemVolumeWorker(Func<int, SystemVolumeState> adjust, Action<SystemVolumeState> publish,
    Action<Exception> failed, Action<Exception> log, Func<bool> alive)
{
    // One full sweep of the slider is enough; a larger backlog (stuck driver) is clamped instead of growing without bound.
    private const int MaximumPending = 100 / SystemVolumePolicy.PercentPerStep;
    private readonly object gate = new();
    private int pending;
    private bool running;

    // Queue a validated, non-zero delta; starts the worker unless one is already draining.
    public void Request(int delta)
    {
        lock (gate)
        {
            pending = Math.Clamp(pending + delta, -MaximumPending, MaximumPending);
            if (running) return;
            running = true;
        }
        try { Task.Run(Drain); }
        catch { lock (gate) { running = false; pending = 0; } throw; }
    }

    // Apply the accumulated delta in chunks the policy accepts; a net-zero backlog needs no device call at all.
    private void Drain()
    {
        var released = false;
        try
        {
            while (true)
            {
                int step;
                lock (gate)
                {
                    if (pending == 0 || !alive()) { pending = 0; running = false; released = true; return; }
                    step = Math.Clamp(pending, -SystemVolumePolicy.MaximumSteps, SystemVolumePolicy.MaximumSteps);
                    pending -= step;
                }
                SystemVolumeState state;
                try { state = adjust(step); }
                catch (Exception error)
                {
                    // A broken output device would only repeat the same error for the rest of the backlog.
                    lock (gate) pending = 0;
                    failed(error);
                    continue;
                }
                publish(state);
            }
        }
        catch (Exception error) { log(error); }
        finally { if (!released) lock (gate) { pending = 0; running = false; } }
    }
}

internal sealed partial class MainWindow
{
    private SystemVolumeWorker? volumeWorker;
    // The device is touched on the worker thread, never on the UI thread; results come back through Send, which marshals to the UI.
    private void ChangeSystemVolume(JsonElement command)
    {
        if (!command.TryGetProperty("value", out var value) || !SystemVolumePolicy.TryReadDelta(value, out var delta)) return;
        volumeWorker ??= new(SystemVolume.Adjust, state => Send("systemVolume", state),
            error => { DataFiles.Log(error); Send("notice", new { text = "无法调整系统音量，请检查默认输出设备。", target = new { id = "audio" } }); },
            DataFiles.Log, () => !lifetime.IsCancellationRequested);
        volumeWorker.Request(delta);
    }
}
