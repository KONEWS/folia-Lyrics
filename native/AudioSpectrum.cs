using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;
using System.Diagnostics;

// native/AudioSpectrum.cs
namespace FoliaLyrics;
internal sealed class AudioSpectrum : IDisposable
{
    private readonly object gate = new();
    private readonly AudioCaptureMaintenance maintenance;
    private volatile WasapiLoopbackCapture? capture;
    private MMDevice? device;
    private readonly float[] ring = new float[2048], smooth = new float[1024];
    private readonly Complex[] fft = new Complex[2048];
    private int cursor, resetRevision, readRevision; private long lastSamples; private string deviceId = "";
    private volatile bool capturing;
    private volatile string status = "声音响应未开启";
    private volatile int sampleRate = 48000;
    public string Status => status;
    public int SampleRate => sampleRate;
    public AudioSpectrum() => maintenance = new(EnsureDevice, DataFiles.Log);
    public void Ensure(bool enabled) => maintenance.Request(enabled);
    private void EnsureDevice(bool enabled)
    {
        if (!enabled) { Stop(); status = "声音响应已关闭"; return; }
        try
        {
            using var enumerator = new MMDeviceEnumerator(); using var candidate = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            if (capture is not null && capturing && candidate.ID == deviceId) return;
            Stop(); device = enumerator.GetDevice(candidate.ID); deviceId = candidate.ID;
            capture = new WasapiLoopbackCapture(device); sampleRate = capture.WaveFormat.SampleRate;
            capture.DataAvailable += OnData;
            capture.RecordingStopped += OnStopped;
            capturing = true; capture.StartRecording(); status = "系统声音响应已开启";
        }
        catch (Exception e) { Stop(); status = "无法读取输出声音（独占或 ASIO 模式可能不支持）"; DataFiles.Log(e); }
    }
    private void OnStopped(object? sender, StoppedEventArgs e)
    {
        if (!ReferenceEquals(sender, capture)) return;
        capturing = false;
        if (e.Exception is not null) status = "声音响应中断，正在重新连接";
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
        bool fresh;
        lock (gate)
        {
            // The capture worker owns device/ring reset; only this reader ever mutates FFT smoothing.
            if (readRevision != resetRevision) { Array.Clear(smooth); readRevision = resetRevision; }
            fresh = capturing && Stopwatch.GetElapsedTime(lastSamples).TotalSeconds < .3;
            if (fresh)
            {
                var window = AudioSpectrumWindow.Coefficients;
                for (var i = 0; i < 2048; i++)
                {
                    fft[i].X = (float)(ring[(cursor + i) & 2047] * window[i]); fft[i].Y = 0;
                }
            }
        }
        // With no fresh samples the original FFT is all zeros; preserve the same decay without transforming silence.
        if (fresh) FastFourierTransform.FFT(true, 11, fft);
        for (var i = 0; i < 1024; i++)
        {
            smooth[i] = (float)(smooth[i] * .6 + (fresh ? Math.Sqrt(fft[i].X * fft[i].X + fft[i].Y * fft[i].Y) : 0) * .4);
            result[i] = (byte)Math.Clamp((20 * Math.Log10(Math.Max(1e-9, smooth[i])) + 100) / 70 * 255, 0, 255);
        }
        return result;
    }
    private void Stop()
    {
        capturing = false;
        var previous = capture; capture = null;
        if (previous is not null)
        {
            previous.DataAvailable -= OnData; previous.RecordingStopped -= OnStopped;
            previous.StopRecording(); previous.Dispose();
        }
        device?.Dispose(); device = null; deviceId = "";
        lock (gate) { Array.Clear(ring); cursor = 0; lastSamples = 0; resetRevision++; }
    }
    public void Dispose() => maintenance.Dispose();
}
