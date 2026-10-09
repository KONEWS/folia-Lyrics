using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using FoliaLyrics;
using NAudio.Dsp;

// test/startup-performance/Program.cs — isolated real asset-cache and spectrum checks; never opens a sound device or the app profile.
var workspace = Path.GetFullPath(args.Length > 0 ? args[0] : ".");
var temporary = Path.Combine(Path.GetTempPath(), "FoliaLyrics-startup-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temporary);
var checks = new List<string>();
try
{
    CheckCache();
    CheckSpectrum();
    if (args.Contains("--checks-only")) { Console.WriteLine($"PASS {checks.Count} startup/audio checks"); return; }
    var archivePath = Path.Combine(workspace, "native", "web-assets.zip");
    var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(archivePath)));
    var baselineRoot = Path.Combine(temporary, "baseline");
    var optimizedRoot = Path.Combine(temporary, "optimized");
    Func<Stream> open = () => File.OpenRead(archivePath);
    BaselineAssets(baselineRoot, open); DesktopAssets.Resolve(optimizedRoot, digest, open);
    var baselineWarm = Measure(() => BaselineAssets(baselineRoot, open), 7);
    var optimizedWarm = Measure(() => DesktopAssets.Resolve(optimizedRoot, digest, open), 7);
    var baselineCold = Measure(() => BaselineAssets(Path.Combine(temporary, Guid.NewGuid().ToString("N")), open), 3);
    var optimizedCold = Measure(() => DesktopAssets.Resolve(Path.Combine(temporary, Guid.NewGuid().ToString("N")), digest, open), 3);
    var signal = Enumerable.Range(0, 2048).Select(i => (float)(Math.Sin(i * .17) * .7)).ToArray();
    var destination = new float[2048];
    // Warm both JIT paths before sampling; one packet can leave tiered compilation in the first measured batch.
    for (var i = 0; i < 1000; i++) { Window(signal, destination, false); Window(signal, destination, true); }
    var baselineWindow = Measure(() => { for (var i = 0; i < 1000; i++) Window(signal, destination, false); }, 7);
    var optimizedWindow = Measure(() => { for (var i = 0; i < 1000; i++) Window(signal, destination, true); }, 7);
    using var audio = new AudioSpectrum();
    var baselineSmooth = new float[1024]; var baselineFft = new Complex[2048];
    for (var i = 0; i < 1000; i++) { audio.Read(); SilentBaseline(baselineSmooth, baselineFft); }
    var baselineSilent = Measure(() => { for (var i = 0; i < 1000; i++) SilentBaseline(baselineSmooth, baselineFft); }, 7);
    var optimizedSilent = Measure(() => { for (var i = 0; i < 1000; i++) audio.Read(); }, 7);
    var result = new {
        scope = "Isolated cache/window/silence components, not whole EXE startup or WASAPI capture. Same archive, no app preferences/music/device access.",
        framework = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        archiveBytes = new FileInfo(archivePath).Length, archiveSha256 = digest, checks,
        assets = new { baselineWarm, optimizedWarm, baselineCold, optimizedCold },
        spectrum = new { packetsPerBatch = 1000, baselineWindow, optimizedWindow, baselineSilent, optimizedSilent }
    };
    var output = Path.Combine(workspace, "validation", "performance", "startup-assets-audio.json");
    Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    File.WriteAllText(output, JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine(File.ReadAllText(output));
}
finally
{
    var resolved = Path.GetFullPath(temporary);
    var parent = Path.GetFullPath(Path.GetTempPath());
    if (!resolved.StartsWith(parent, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(resolved).StartsWith("FoliaLyrics-startup-"))
        throw new IOException("Unexpected test cleanup path");
    Directory.Delete(resolved, true);
}

void Check(bool condition, string name)
{
    if (!condition) throw new Exception(name);
    checks.Add(name);
}

// Exercise partial-cache recovery with disposable ZIP data; the warm callback must never run.
void CheckCache()
{
    byte[] zip;
    using (var buffer = new MemoryStream())
    {
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, true))
        {
            using (var entry = new StreamWriter(archive.CreateEntry("desktop.html").Open())) entry.Write("desktop fixture");
            using (var entry = new StreamWriter(archive.CreateEntry("assets/file.js").Open())) entry.Write("asset fixture");
        }
        zip = buffer.ToArray();
    }
    var digest = Convert.ToHexString(SHA256.HashData(zip)); var opens = 0;
    var root = Path.Combine(temporary, "correctness");
    Stream Open() { opens++; return new MemoryStream(zip); }
    var folder = DesktopAssets.Resolve(root, digest, Open);
    Check(opens == 1 && File.ReadAllText(Path.Combine(folder, "assets/file.js")) == "asset fixture", "cold extraction");
    Check(File.ReadAllText(Path.Combine(folder, ".ready")) == digest, "full build digest marker");
    Check(DesktopAssets.Resolve(root, digest, () => throw new Exception("warm ZIP opened")) == folder, "warm cache opens no ZIP");
    File.WriteAllText(Path.Combine(folder, ".ready"), digest[..16]);
    DesktopAssets.Resolve(root, digest, Open);
    Check(opens == 2, "old/invalid marker repaired");
    File.Delete(Path.Combine(folder, "desktop.html"));
    DesktopAssets.Resolve(root, digest, Open);
    Check(opens == 3 && File.Exists(Path.Combine(folder, "desktop.html")), "missing entry point repaired");
    File.WriteAllText(Path.Combine(folder, ".ready"), "invalid");
    try { DesktopAssets.Resolve(root, digest, () => new MemoryStream([1, 2, 3])); throw new Exception("bad ZIP accepted"); }
    catch (InvalidDataException) { Check(!File.Exists(Path.Combine(folder, ".ready")), "failed extraction has no success marker"); }
    DesktopAssets.Resolve(root, digest, Open);
    Check(opens == 4, "retry after incomplete extraction");
    try { DesktopAssets.Resolve(root, "../invalid", Open); throw new Exception("bad digest accepted"); }
    catch (IOException) { Check(opens == 4, "invalid digest rejected before archive open"); }
}

// Exact bit comparisons keep the original window/FFT inputs and decay rather than asserting only a similar picture.
void CheckSpectrum()
{
    var window = AudioSpectrumWindow.Coefficients;
    Check(window.Length == 2048, "original FFT window length");
    for (var i = 0; i < 2048; i++)
    {
        var old = .42 - .5 * Math.Cos(2 * Math.PI * i / 2048) + .08 * Math.Cos(4 * Math.PI * i / 2048);
        if (BitConverter.DoubleToInt64Bits(old) != BitConverter.DoubleToInt64Bits(window[i])) throw new Exception($"Window changed at {i}");
    }
    Check(true, "2048 window coefficients bit-identical");
    foreach (var kind in new[] { "silence", "tone", "impulse", "mixed" })
    {
        var signal = Enumerable.Range(0, 2048).Select(i => kind switch {
            "tone" => (float)Math.Sin(i * .37), "impulse" => i == 511 ? 1f : 0f,
            "mixed" => (float)(Math.Sin(i * .11) * .8 + Math.Cos(i * .51) * .2), _ => 0f
        }).ToArray();
        var a = new float[2048]; var b = new float[2048];
        Window(signal, a, false); Window(signal, b, true);
        Check(a.SequenceEqual(b), $"{kind}: identical fresh FFT inputs");
    }
    using var audio = new AudioSpectrum();
    var smooth = (float[])typeof(AudioSpectrum).GetField("smooth", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(audio)!;
    for (var i = 0; i < smooth.Length; i++) smooth[i] = (float)(.02 + i / 12000d);
    var oldSmooth = smooth.ToArray(); var fft = new Complex[2048];
    for (var frame = 0; frame < 24; frame++)
    {
        if (!SilentBaseline(oldSmooth, fft).SequenceEqual(audio.Read()) || !oldSmooth.SequenceEqual(smooth))
            throw new Exception($"Silence decay changed at {frame}");
    }
    Check(true, "24 no-signal packets: actual AudioSpectrum.Read byte/float equality");
    var beforeReset = smooth.ToArray();
    typeof(AudioSpectrum).GetMethod("Stop", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(audio, null);
    Check(smooth.SequenceEqual(beforeReset), "device reset leaves reader-owned smoothing untouched");
    Check(audio.Read().All(value => value == 0) && smooth.All(value => value == 0), "spectrum reader consumes device reset before publishing its next packet");
}

static void Window(float[] signal, float[] target, bool cached)
{
    var coefficients = AudioSpectrumWindow.Coefficients;
    for (var i = 0; i < 2048; i++) target[i] = (float)(signal[i] * (cached ? coefficients[i]
        : .42 - .5 * Math.Cos(2 * Math.PI * i / 2048) + .08 * Math.Cos(4 * Math.PI * i / 2048)));
}

static byte[] SilentBaseline(float[] smooth, Complex[] fft)
{
    var result = new byte[1024]; Array.Clear(fft); FastFourierTransform.FFT(true, 11, fft);
    for (var i = 0; i < 1024; i++)
    {
        smooth[i] = (float)(smooth[i] * .6 + Math.Sqrt(fft[i].X * fft[i].X + fft[i].Y * fft[i].Y) * .4);
        result[i] = (byte)Math.Clamp((20 * Math.Log10(Math.Max(1e-9, smooth[i])) + 100) / 70 * 255, 0, 255);
    }
    return result;
}

// The previous startup path copied and hashed the embedded archive even when its cache was ready.
static string BaselineAssets(string root, Func<Stream> open)
{
    using var stream = open(); using var buffer = new MemoryStream(); stream.CopyTo(buffer);
    var id = Convert.ToHexString(SHA256.HashData(buffer.ToArray()))[..16];
    var folder = Path.Combine(root, "web", id); var marker = Path.Combine(folder, ".ready");
    if (File.Exists(marker) && File.Exists(Path.Combine(folder, "desktop.html"))) return folder;
    Directory.CreateDirectory(folder);
    using var zipStream = new MemoryStream(buffer.ToArray()); using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read);
    zip.ExtractToDirectory(folder, true); File.WriteAllText(marker, id); return folder;
}

// Report medians and raw elapsed/allocation samples for one isolated component, excluding explicit pre-run GC.
static object Measure(Action action, int repetitions)
{
    var samples = new List<(double Milliseconds, long AllocatedBytes)>();
    for (var i = 0; i < repetitions; i++)
    {
        GC.Collect(); GC.WaitForPendingFinalizers();
        var allocation = GC.GetAllocatedBytesForCurrentThread(); var watch = Stopwatch.StartNew();
        action(); watch.Stop(); samples.Add((watch.Elapsed.TotalMilliseconds, GC.GetAllocatedBytesForCurrentThread() - allocation));
    }
    return new {
        medianMs = samples.Select(x => x.Milliseconds).Order().ElementAt(samples.Count / 2),
        medianAllocatedBytes = samples.Select(x => x.AllocatedBytes).Order().ElementAt(samples.Count / 2),
        samples = samples.Select(x => new { milliseconds = x.Milliseconds, allocatedBytes = x.AllocatedBytes })
    };
}

namespace FoliaLyrics
{
    internal static class DataFiles { public static void Log(Exception error) => throw new Exception("Unexpected device/log access", error); }
}
