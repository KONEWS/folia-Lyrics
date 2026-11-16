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
    private readonly AudioCaptureRetry retry = new();
    private volatile WasapiLoopbackCapture? capture;
    private Exception? captureError;
    private long captureStoppedAt;
    private MMDevice? device;
    private readonly float[] ring = new float[2048], smooth = new float[1024];
    private readonly Complex[] fft = new Complex[2048];
    private int cursor, resetRevision, readRevision; private long lastSamples; private string deviceId = "";
    private volatile bool capturing;
    private volatile string status = "声音响应未开启";
    private volatile int sampleRate = 48000;
    public string Status => status;
    public bool IsCapturing => capturing;
    public int SampleRate => sampleRate;
    public AudioSpectrum() => maintenance = new(EnsureDevice, DataFiles.Log);
    public void Ensure(bool enabled) => maintenance.Request(enabled);
    private void EnsureDevice(bool enabled)
    {
        if (!enabled) { Stop(); retry.Reset(); status = "声音响应已关闭"; return; }
        var attemptedDevice = "";
        try
        {
            if (capture is not null && !capturing)
            {
                var error = captureError;
                retry.Failed(deviceId, captureStoppedAt); Stop();
                if (error is not null) DataFiles.Log(error);
            }
            using var enumerator = new MMDeviceEnumerator(); using var candidate = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            attemptedDevice = candidate.ID;
            if (!retry.CanAttempt(attemptedDevice, Environment.TickCount64)) return;
            if (capture is not null && capturing && candidate.ID == deviceId) return;
            Stop(); device = enumerator.GetDevice(candidate.ID); deviceId = candidate.ID;
            capture = new WasapiLoopbackCapture(device); sampleRate = capture.WaveFormat.SampleRate;
            capture.DataAvailable += OnData;
            capture.RecordingStopped += OnStopped;
            retry.Started(deviceId, Environment.TickCount64);
            capturing = true; capture.StartRecording();
            lock (gate) { if (capturing) status = "系统声音响应已开启"; }
        }
        catch (Exception e)
        {
            Stop(); status = "无法读取输出声音（独占或 ASIO 模式可能不支持）";
            if (!retry.CanAttempt(attemptedDevice, Environment.TickCount64)) return;
            retry.Failed(attemptedDevice, Environment.TickCount64); DataFiles.Log(e);
        }
    }
    private void OnStopped(object? sender, StoppedEventArgs e)
    {
        lock (gate)
        {
            if (!ReferenceEquals(sender, capture)) return;
            captureError = e.Exception; captureStoppedAt = Environment.TickCount64; capturing = false;
            if (e.Exception is not null) status = "声音响应中断，正在重新连接";
        }
    }
    // Runs on the NAudio capture thread: a malformed packet is dropped and logged, an exception here must never escape
    // (it would end the recording) and the frame loop must always advance while the lock is held.
    private void OnData(object? sender, WaveInEventArgs e)
    {
        try
        {
            if (sender is not WasapiLoopbackCapture source) return;
            var format = source.WaveFormat; var bytes = format.BitsPerSample / 8;
            // BlockAlign <= 0 would make "offset += BlockAlign" spin forever inside the lock; zero channels would divide by zero.
            if (format.BlockAlign <= 0 || format.Channels <= 0) return;
            var floating = format.Encoding == WaveFormatEncoding.IeeeFloat || format is WaveFormatExtensible ext && ext.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71");
            if (bytes is < 2 or > 4) return;
            lock (gate)
            {
                if (!ReferenceEquals(source, capture)) return;
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
        catch (Exception error) { try { DataFiles.Log(error); } catch { } }
    }
    public byte[] Read()
    {
        var result = new byte[1024];
        var hasSignal = false;
        lock (gate)
        {
            // The capture worker owns device/ring reset; only this reader ever mutates FFT smoothing.
            if (readRevision != resetRevision) { Array.Clear(smooth); readRevision = resetRevision; }
            var fresh = capturing && Stopwatch.GetElapsedTime(lastSamples).TotalSeconds < .3;
            if (fresh)
            {
                var window = AudioSpectrumWindow.Coefficients;
                for (var i = 0; i < 2048; i++)
                {
                    fft[i].X = (float)(ring[(cursor + i) & 2047] * window[i]); fft[i].Y = 0;
                    hasSignal |= fft[i].X != 0;
                }
            }
        }
        // With no fresh samples the original FFT is all zeros; preserve the same decay without transforming silence.
        // Fresh all-zero packets have the same result, including when a driver keeps sending packets during silence.
        if (hasSignal) FastFourierTransform.FFT(true, 11, fft);
        for (var i = 0; i < 1024; i++)
        {
            smooth[i] = (float)(smooth[i] * .6 + (hasSignal ? Math.Sqrt(fft[i].X * fft[i].X + fft[i].Y * fft[i].Y) : 0) * .4);
            // At or below -100 dB the original clamp is zero; keep smoothing but skip its logarithm.
            result[i] = smooth[i] <= 1e-5 ? (byte)0 : (byte)Math.Clamp((20 * Math.Log10(smooth[i]) + 100) / 70 * 255, 0, 255);
        }
        return result;
    }
    // Detach callbacks under the ring lock, then release the driver outside it so a stopped callback can finish.
    private void Stop()
    {
        WasapiLoopbackCapture? previous;
        lock (gate)
        {
            capturing = false;
            previous = capture; capture = null; captureError = null; captureStoppedAt = 0;
            Array.Clear(ring); cursor = 0; lastSamples = 0; resetRevision++;
        }
        var previousDevice = device; device = null; deviceId = "";
        void Release(Action action) { try { action(); } catch (Exception error) { DataFiles.Log(error); } }
        if (previous is not null)
        {
            previous.DataAvailable -= OnData; previous.RecordingStopped -= OnStopped;
            Release(previous.StopRecording); Release(previous.Dispose);
        }
        if (previousDevice is not null) Release(previousDevice.Dispose);
    }
    public void Dispose() => maintenance.Dispose();
}
