using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;
using System.Diagnostics;

// native/AudioSpectrum.cs
namespace FoliaLyrics;
internal sealed class AudioSpectrum : IDisposable
{
    private readonly object gate = new();
    private WasapiLoopbackCapture? capture;
    private MMDevice? device;
    private readonly float[] ring = new float[2048], smooth = new float[1024];
    private readonly Complex[] fft = new Complex[2048];
    private int cursor; private long lastSamples; private string deviceId = "";
    public string Status { get; private set; } = "声音响应未开启";
    public int SampleRate { get; private set; } = 48000;
    public void Ensure(bool enabled)
    {
        if (!enabled) { Stop(); Status = "声音响应已关闭"; return; }
        try
        {
            using var enumerator = new MMDeviceEnumerator(); using var candidate = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            if (capture is not null && candidate.ID == deviceId) return;
            Stop(); device = enumerator.GetDevice(candidate.ID); deviceId = candidate.ID;
            capture = new WasapiLoopbackCapture(device); SampleRate = capture.WaveFormat.SampleRate;
            capture.DataAvailable += OnData;
            capture.RecordingStopped += (_, e) => { deviceId = ""; if (e.Exception is not null) Status = "声音响应中断，正在重新连接"; };
            capture.StartRecording(); Status = "系统声音响应已开启";
        }
        catch (Exception e) { Stop(); Status = "无法读取输出声音（独占或 ASIO 模式可能不支持）"; DataFiles.Log(e); }
    }
    private void OnData(object? sender, WaveInEventArgs e)
    {
        if (sender is not WasapiLoopbackCapture source) return;
        var format = source.WaveFormat; var bytes = format.BitsPerSample / 8;
        var floating = format.Encoding == WaveFormatEncoding.IeeeFloat || format is WaveFormatExtensible ext && ext.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71");
        if (bytes is < 2 or > 4) return;
        lock (gate)
        {
            for (var offset = 0; offset + format.BlockAlign <= e.BytesRecorded; offset += format.BlockAlign)
            {
                float value = 0;
                for (var channel = 0; channel < format.Channels; channel++)
                {
                    var p = offset + channel * bytes;
                    value += floating && bytes == 4 ? BitConverter.ToSingle(e.Buffer, p) : bytes == 2 ? BitConverter.ToInt16(e.Buffer, p) / 32768f
                        : bytes == 4 ? BitConverter.ToInt32(e.Buffer, p) / 2147483648f : ((e.Buffer[p] << 8 | e.Buffer[p + 1] << 16 | e.Buffer[p + 2] << 24) >> 8) / 8388608f;
                }
                ring[cursor] = float.IsFinite(value) ? value / format.Channels : 0; cursor = (cursor + 1) & 2047;
            }
            lastSamples = Stopwatch.GetTimestamp();
        }
    }
    public byte[] Read()
    {
        var result = new byte[1024];
        lock (gate)
        {
            var fresh = capture is not null && Stopwatch.GetElapsedTime(lastSamples).TotalSeconds < .3;
            for (var i = 0; i < 2048; i++)
            {
                var window = .42 - .5 * Math.Cos(2 * Math.PI * i / 2048) + .08 * Math.Cos(4 * Math.PI * i / 2048);
                fft[i].X = fresh ? (float)(ring[(cursor + i) & 2047] * window) : 0; fft[i].Y = 0;
            }
        }
        FastFourierTransform.FFT(true, 11, fft);
        for (var i = 0; i < 1024; i++)
        {
            smooth[i] = (float)(smooth[i] * .6 + Math.Sqrt(fft[i].X * fft[i].X + fft[i].Y * fft[i].Y) * .4);
            result[i] = (byte)Math.Clamp((20 * Math.Log10(Math.Max(1e-9, smooth[i])) + 100) / 70 * 255, 0, 255);
        }
        return result;
    }
    private void Stop()
    {
        var previous = capture; capture = null;
        if (previous is not null) { previous.DataAvailable -= OnData; previous.StopRecording(); previous.Dispose(); }
        device?.Dispose(); device = null; deviceId = ""; lock (gate) { Array.Clear(ring); Array.Clear(smooth); }
    }
    public void Dispose() => Stop();
}
