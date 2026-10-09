using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;

// native/Online/OnlineHttp.cs: Shared, bounded, cancellable transport for the provider adapters.
namespace FoliaLyrics;
internal sealed class OnlineHttp : IDisposable
{
    private readonly HttpClient client;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> gates = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> nextRequest = new();
    public OnlineHttp(HttpMessageHandler? handler = null)
    {
        client = new(handler ?? new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All }) { Timeout = TimeSpan.FromSeconds(12) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("folia-Lyrics/0.4.30 (+https://github.com/KONEWS/folia-Lyrics; standalone-derivative)");
    }
    public static string Url(string endpoint, params (string, object)[] parameters) => endpoint + "?" + string.Join('&', parameters.Select(p =>
        Uri.EscapeDataString(p.Item1) + "=" + Uri.EscapeDataString(Convert.ToString(p.Item2, CultureInfo.InvariantCulture) ?? "")));
    public Task<JsonDocument> Get(string url, CancellationToken token, string? referer = null) => Request(url, token, referer, null);
    public Task<JsonDocument> PostQq(object body, CancellationToken token) => Request("https://u.y.qq.com/cgi-bin/musicu.fcg", token, "https://y.qq.com/", body);
    private async Task<JsonDocument> Request(string url, CancellationToken token, string? referer, object? body)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(15)); token = timeout.Token;
        var host = new Uri(url).Host;
        var gate = gates.GetOrAdd(host, _ => new(1, 1)); await gate.WaitAsync(token);
        try
        {
            if (nextRequest.TryGetValue(host, out var next) && next > DateTimeOffset.UtcNow)
            {
                var delay = next - DateTimeOffset.UtcNow;
                if (delay > TimeSpan.FromSeconds(2)) throw new IOException("服务暂时限流，请稍后重试");
                if (delay > TimeSpan.Zero) await Task.Delay(delay, token);
            }
            using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, url);
            if (referer is not null) request.Headers.Referrer = new Uri(referer);
            if (body is not null)
            {
                request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                request.Headers.UserAgent.ParseAdd("okhttp/3.14.9"); request.Headers.Add("Cookie", "tmeLoginType=-1;");
            }
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
            nextRequest[host] = DateTimeOffset.UtcNow.AddMilliseconds(300);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                var retry = response.Headers.RetryAfter;
                nextRequest[host] = retry?.Date ?? DateTimeOffset.UtcNow.Add(retry?.Delta ?? TimeSpan.FromMinutes(1));
                throw new IOException("服务限流，请稍后重试");
            }
            response.EnsureSuccessStatusCode();
            const int limit = 4_000_000;
            if (response.Content.Headers.ContentLength > limit) throw new IOException("歌词响应过大");
            using var stream = await response.Content.ReadAsStreamAsync(token); using var buffer = new MemoryStream();
            var block = new byte[16384]; int length;
            while ((length = await stream.ReadAsync(block, token)) > 0)
            {
                if (buffer.Length + length > limit) throw new IOException("歌词响应过大");
                buffer.Write(block, 0, length);
            }
            return JsonDocument.Parse(buffer.ToArray());
        }
        finally { gate.Release(); }
    }
    public void Dispose() => client.Dispose();
}
internal static class JsonFields
{
    public static JsonElement Field(this JsonElement e, string key) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) ? v : default;
    public static string Text(this JsonElement e, string key) { var v = e.Field(key); return v.ValueKind is JsonValueKind.String or JsonValueKind.Number ? v.ToString() : ""; }
    public static double Number(this JsonElement e, string key) => double.TryParse(e.Text(key), NumberStyles.Any, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n) ? n : 0;
    public static JsonElement[] Items(this JsonElement e) => e.ValueKind == JsonValueKind.Array ? e.EnumerateArray().ToArray() : [];
}
