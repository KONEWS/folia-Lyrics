using Microsoft.Web.WebView2.Core;
using System.Text.Json;

// native/WindowVideoLayer.cs — persistent native video picker; the page receives an opaque URL, never a path.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    // Folder-mapped hosts bypass WebResourceRequested; media uses its own unmapped resource origin.
    private const string VideoLayerOrigin = "https://folia-video.local/";
    private const string VideoLayerCors = "Access-Control-Allow-Origin: https://folia.local\r\nAccess-Control-Expose-Headers: Content-Range\r\n";
    private string videoLayerPath = "", videoLayerToken = "";
    private bool videoLayerLoaded;
    private readonly List<WeakReference<Stream>> videoLayerStreams = [];

    private void InitializeVideoLayer(CoreWebView2 core)
    {
        core.IsMuted = true;
        core.AddWebResourceRequestedFilter(VideoLayerOrigin + "__video/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += ServeVideoLayer;
        FormClosed += (_, _) => CloseVideoLayerStreams();
    }

    // Selection is always a host dialog. No command accepts a renderer-supplied path.
    private Task<bool> HandleVideoLayerCommand(JsonElement command)
    {
        var type = command.Text("type");
        if (type is not ("videoLayerRestore" or "videoLayerSelect" or "videoLayerClear")) return Task.FromResult(false);
        if (!videoLayerLoaded)
        {
            videoLayerLoaded = true;
            videoLayerPath = DataFiles.Load(VideoLayerFileStore.FileName, "");
            if (videoLayerPath.Length > 0) videoLayerToken = Guid.NewGuid().ToString("N");
        }
        var picked = false;
        string? error = null;
        try
        {
            if (type == "videoLayerSelect")
            {
                using var dialog = new OpenFileDialog { Title = "选择歌词后方的视频", Filter = "视频|*.mp4;*.webm;*.mov;*.m4v;*.mkv;*.ogv", CheckFileExists = true, Multiselect = false };
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    if (VideoLayerFileStore.ContentType(dialog.FileName).Length == 0) throw new IOException("Unsupported video type.");
                    using (File.Open(dialog.FileName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) { }
                    CloseVideoLayerStreams();
                    videoLayerPath = Path.GetFullPath(dialog.FileName); videoLayerToken = Guid.NewGuid().ToString("N"); picked = true;
                    if (!DataFiles.TrySave(VideoLayerFileStore.FileName, videoLayerPath)) error = "desktopVisual.videoFileSaveFailed";
                }
            }
            else if (type == "videoLayerClear")
            {
                CloseVideoLayerStreams(); videoLayerPath = ""; videoLayerToken = "";
                if (!DataFiles.TrySave(VideoLayerFileStore.FileName, "")) error = "desktopVisual.videoFileSaveFailed";
            }
        }
        catch (Exception exception) { DataFiles.Log(exception); error = "desktopVisual.videoFileReadFailed"; }
        PublishVideoLayerFile(error, picked);
        return Task.FromResult(true);
    }

    private void PublishVideoLayerFile(string? error = null, bool picked = false)
    {
        var selected = videoLayerPath.Length > 0;
        var exists = selected && File.Exists(videoLayerPath) && VideoLayerFileStore.ContentType(videoLayerPath).Length > 0;
        Send("videoLayerFile", new
        {
            status = !selected ? "none" : exists ? "ready" : "missing",
            name = selected ? Path.GetFileName(videoLayerPath) : null,
            source = exists ? VideoLayerOrigin + "__video/" + videoLayerToken : null,
            error = error ?? (selected && !exists ? "desktopVisual.videoFileMissing" : null), picked
        });
    }

    // Only the current random token is served, with byte-range support for browser seeking and loops.
    private void ServeVideoLayer(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (!args.Request.Uri.StartsWith(VideoLayerOrigin + "__video/", StringComparison.Ordinal)) return;
        var environment = web.CoreWebView2.Environment;
        void Empty(int status, string reason, string headers = "") => args.Response = environment.CreateWebResourceResponse(null, status, reason, VideoLayerCors + headers);
        if (videoLayerToken.Length == 0 || args.Request.Uri != VideoLayerOrigin + "__video/" + videoLayerToken) { Empty(404, "Not Found"); return; }
        if (args.Request.Method is not ("GET" or "HEAD")) { Empty(405, "Method Not Allowed", "Allow: GET, HEAD"); return; }
        FileStream? file = null;
        try
        {
            file = File.Open(videoLayerPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var length = file.Length;
            var range = args.Request.Headers.Contains("Range") ? args.Request.Headers.GetHeader("Range") : null;
            if (!VideoLayerFileStore.TryRange(range, length, out var start, out var count))
            {
                file.Dispose(); Empty(416, "Range Not Satisfiable", $"Content-Range: bytes */{length}"); return;
            }
            var headers = $"Content-Type: {VideoLayerFileStore.ContentType(videoLayerPath)}\r\nContent-Length: {count}\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff";
            if (range is not null) headers += $"\r\nContent-Range: bytes {start}-{start + count - 1}/{length}";
            if (args.Request.Method == "HEAD") { file.Dispose(); Empty(range is null ? 200 : 206, range is null ? "OK" : "Partial Content", headers); return; }
            var stream = new VideoLayerReadStream(file, start, count);
            videoLayerStreams.RemoveAll(reference => !reference.TryGetTarget(out _));
            videoLayerStreams.Add(new(stream));
            args.Response = environment.CreateWebResourceResponse(stream, range is null ? 200 : 206, range is null ? "OK" : "Partial Content", VideoLayerCors + headers);
        }
        catch (Exception exception)
        {
            file?.Dispose(); DataFiles.Log(exception); Empty(404, "Not Found"); PublishVideoLayerFile("desktopVisual.videoFileReadFailed");
        }
    }

    private void CloseVideoLayerStreams()
    {
        foreach (var reference in videoLayerStreams) if (reference.TryGetTarget(out var stream)) stream.Dispose();
        videoLayerStreams.Clear();
    }
}
