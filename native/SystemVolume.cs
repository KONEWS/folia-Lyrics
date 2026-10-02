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

internal sealed partial class MainWindow
{
    private void ChangeSystemVolume(JsonElement command)
    {
        if (!command.TryGetProperty("value", out var value) || !SystemVolumePolicy.TryReadDelta(value, out var delta)) return;
        try { Send("systemVolume", SystemVolume.Adjust(delta)); }
        catch (Exception error)
        {
            DataFiles.Log(error);
            Send("notice", new { text = "无法调整系统音量，请检查默认输出设备。" });
        }
    }
}
