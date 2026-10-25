using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

// Drive the actual native streaming handler from a private WebView with no test double for HTTP or decoding.
namespace FoliaLyrics;
internal sealed partial class MainWindow : Form
{
    private const string AppOrigin = "https://folia.local/";
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private JsonElement lastMessage;
    internal readonly List<string> Checks = [];
    internal string? Failure;
    internal MainWindow(string sample)
    {
        ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000); Size = new Size(320, 240);
        Controls.Add(web);
        Shown += async (_, _) =>
        {
            try { await Verify(sample); }
            catch (Exception exception) { Failure = exception.ToString(); }
            finally { Close(); }
        };
    }
    private void Send(string type, object data) { if (type == "videoLayerFile") lastMessage = JsonSerializer.SerializeToElement(data); }
    private void Check(bool passed, string message) { if (!passed) throw new InvalidOperationException(message); Checks.Add(message); }
    private Task<bool> Command(string type) => HandleVideoLayerCommand(JsonSerializer.SerializeToElement(new { type }));

    private async Task<JsonElement> Evaluate(string script)
    {
        var completion = new TaskCompletionSource<JsonElement>();
        void Receive(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            if (!document.RootElement.TryGetProperty("videoTest", out var value)) return;
            completion.TrySetResult(value.Clone());
        }
        web.CoreWebView2.WebMessageReceived += Receive;
        try
        {
            await web.CoreWebView2.ExecuteScriptAsync("Promise.resolve().then(async()=>{" + script + "}).then(value=>chrome.webview.postMessage({videoTest:value})).catch(error=>chrome.webview.postMessage({videoTest:{error:String(error)}}));");
            var result = await completion.Task.WaitAsync(TimeSpan.FromSeconds(20));
            if (result.ValueKind == JsonValueKind.Object && result.TryGetProperty("error", out var error)) throw new InvalidOperationException(error.ToString());
            return result;
        }
        finally { web.CoreWebView2.WebMessageReceived -= Receive; }
    }

    private async Task Verify(string sample)
    {
        var assets = Path.Combine(DataFiles.Root, "assets"); Directory.CreateDirectory(assets);
        File.WriteAllText(Path.Combine(assets, "index.html"), "<!doctype html><html><body>Isolated video test</body></html>");
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataFiles.Root, "browser"));
        await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.SetVirtualHostNameToFolderMapping("folia.local", assets, CoreWebView2HostResourceAccessKind.DenyCors);
        web.CoreWebView2.PermissionRequested += (_, args) => args.State = CoreWebView2PermissionState.Deny;
        InitializeVideoLayer(web.CoreWebView2);
        Check(web.CoreWebView2.IsMuted, "the native WebView cannot output audio even if a media element is accidentally unmuted");
        var navigated = new TaskCompletionSource();
        web.NavigationCompleted += (_, _) => navigated.TrySetResult();
        web.Source = new Uri(AppOrigin + "index.html"); await navigated.Task.WaitAsync(TimeSpan.FromSeconds(20));
        DataFiles.TrySave(VideoLayerFileStore.FileName, sample);
        await Command("videoLayerRestore");
        var source = lastMessage.GetProperty("source").GetString()!;
        Check(lastMessage.GetProperty("status").GetString() == "ready" && !source.Contains(Path.GetFileName(sample)), "saved local file restores as an opaque URL");
        var quoted = JsonSerializer.Serialize(source);
        var range = await Evaluate($"const r=await fetch({quoted},{{headers:{{Range:'bytes=5-24'}}}});return {{status:r.status,range:r.headers.get('content-range'),bytes:[...new Uint8Array(await r.arrayBuffer())]}};");
        Check(range.GetProperty("status").GetInt32() == 206 && range.GetProperty("range").GetString() == $"bytes 5-24/{new FileInfo(sample).Length}", "WebView2 receives HTTP 206 and the exact Content-Range");
        Check(range.GetProperty("bytes").EnumerateArray().Select(value => value.GetByte()).SequenceEqual(File.ReadAllBytes(sample).Skip(5).Take(20)), "WebView2 reads the exact requested bytes");
        var denied = await Evaluate($"return (await fetch({quoted}+ '?path=C:/Windows/win.ini')).status;");
        Check(denied.GetInt32() == 404, "an altered token or appended path cannot read another file");
        var media = await Evaluate($"const v=document.createElement('video');window.video=v;v.muted=true;v.loop=true;document.body.append(v);v.src={quoted};await new Promise((ok,fail)=>{{v.onloadedmetadata=ok;v.onerror=()=>fail(Error('decode '+v.error?.code));}});await v.play();await new Promise(ok=>setTimeout(ok,350));v.pause();return {{duration:v.duration,time:v.currentTime,muted:v.muted,paused:v.paused}};");
        Check(media.GetProperty("duration").GetDouble() > 0 && media.GetProperty("time").GetDouble() > 0 && media.GetProperty("muted").GetBoolean() && media.GetProperty("paused").GetBoolean(), "real video decodes, advances muted and pauses");
        var seek = await Evaluate("const v=window.video;v.currentTime=v.duration*.6;await new Promise(ok=>v.addEventListener('seeked',ok,{once:true}));const t=v.currentTime;await new Promise(ok=>setTimeout(ok,250));return {time:v.currentTime,target:v.duration*.6,drift:Math.abs(v.currentTime-t)};");
        Check(Math.Abs(seek.GetProperty("time").GetDouble() - seek.GetProperty("target").GetDouble()) < .1 && seek.GetProperty("drift").GetDouble() < .01, "real decoder seeks through the native range stream and stays paused");
        web.Visible = false; await Task.Delay(150);
        Check((await Evaluate("return document.hidden;")).GetBoolean(), "minimizing the WebView exposes the document.hidden pause signal");
        web.Visible = true; await Task.Delay(150);
        Check(!(await Evaluate("return document.hidden;")).GetBoolean(), "restoring the WebView clears the document.hidden pause signal");
        await Evaluate("window.video.removeAttribute('src');window.video.load();return true;");
        await Command("videoLayerClear");
        Check(lastMessage.GetProperty("status").GetString() == "none" && DataFiles.Load(VideoLayerFileStore.FileName, "missing") == "", "clear revokes the source and saves the empty selection");
        Check((await Evaluate($"return (await fetch({quoted})).status;")).GetInt32() == 404, "cleared video URL can no longer be read");
        DataFiles.TrySave(VideoLayerFileStore.FileName, Path.Combine(DataFiles.Root, "missing.mp4")); videoLayerLoaded = false;
        await Command("videoLayerRestore");
        Check(lastMessage.GetProperty("status").GetString() == "missing" && lastMessage.GetProperty("error").GetString() == "desktopVisual.videoFileMissing", "missing restored file produces an actionable error");
        Check(!await Command("videoLayerReadPath"), "unknown file-access commands are rejected");
    }
}
