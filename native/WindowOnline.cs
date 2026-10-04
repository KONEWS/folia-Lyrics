using System.Text.Json;

// native/WindowOnline.cs: Cancel obsolete work while media-clock polling continues independently.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly OnlineLyrics online = new();
    private readonly OnlineCache onlineCache = new(Path.Combine(DataFiles.Root, "online-lyrics"));
    private CancellationTokenSource? lyricWork;
    private int lyricRevision;
    private bool automaticLookup;
    private double lookupDuration;
    private OnlineState onlineState = new("", false, "播放歌曲后自动匹配在线歌词", [], []);
    private readonly record struct Work(int Revision, CancellationToken Token);
    private Work StartWork()
    {
        lyricWork?.Cancel(); lyricWork?.Dispose();
        lyricWork = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        return new(++lyricRevision, lyricWork.Token);
    }
    private bool Current(Work work, Song target) => !IsDisposed && !work.Token.IsCancellationRequested && work.Revision == lyricRevision && (song?.Key ?? "") == target.Key;
    private void OnlineStatus(OnlineState state) { onlineState = state; Send("online", state); }
    private void ApplyLyrics(Lyrics packet) { lyrics = packet; lyricKey = song?.Key ?? ""; Send("lyrics", packet); }
    private void BeginResolve(Song target, bool clear)
    {
        var work = StartWork(); automaticLookup = true; lookupDuration = target.Duration;
        if (clear) { lyrics = null; Send("lyrics", new Lyrics(target.Key, target.Title, target.Artist, "", "", "", false)); }
        OnlineStatus(new(target.Key, false, target.Title.Length == 0 ? "等待播放器提供歌名；也可手动搜索" : "正在匹配歌词…", [], [], Phase: target.Title.Length == 0 ? "idle" : "matching"));
        _ = ResolveLyrics(target, work);
    }
    private async Task ResolveLyrics(Song target, Work work)
    {
        try
        {
            if (target.Title.Length == 0) return;
            // Read cache and local files off the UI thread; debounce only requests that need the network.
            var resolved = await Task.Run(() =>
            {
                work.Token.ThrowIfCancellationRequested();
                var workerCached = onlineCache.Read(target);
                Lyrics? workerLocal = null;
                if (workerCached is not { Manual: true })
                {
                    try { workerLocal = library.Find(target); }
                    catch (Exception e) when (e is not OperationCanceledException) { DataFiles.Log(e); }
                }
                work.Token.ThrowIfCancellationRequested();
                return (Cached: workerCached, Local: workerLocal);
            }, work.Token);
            if (!Current(work, target)) return;
            var cached = resolved.Cached;
            if (cached is { Manual: true })
            {
                if (Current(work, target)) { ApplyLyrics(cached.Lyrics); OnlineStatus(new(target.Key, false, "已使用你选择的在线歌词（缓存）", [], [], cached.CandidateKey, "ready")); }
                return;
            }
            var local = resolved.Local;
            if (local is not null) { ApplyLyrics(local); OnlineStatus(new(target.Key, false, "已使用本地歌词；也可手动搜索在线版本", [], [], Phase: "ready")); return; }
            if (cached is not null) { ApplyLyrics(cached.Lyrics); OnlineStatus(new(target.Key, false, "已读取在线歌词缓存", [], [], cached.CandidateKey, "ready")); return; }
            if (!preferences.OnlineEnabled) { OnlineStatus(new(target.Key, false, "在线匹配已关闭", [], [])); return; }
            await Task.Delay(350, work.Token);
            if (!Current(work, target)) return;
            OnlineStatus(new(target.Key, true, "正在搜索已启用的歌词源…", [], [], Phase: "matching"));
            var errors = new List<string>(); Lyrics? matched = null; LyricCandidate? selectedCandidate = null; var selectedKey = "";
            var result = await online.SearchProgressive(LyricQuery.From(target), EnabledSources(), work.Token, async page =>
            {
                foreach (var candidate in page.Where(c => c.AutoEligible).Take(2))
                {
                    try
                    {
                        var packet = await online.Fetch(candidate, target, work.Token);
                        if (!Current(work, target)) return false;
                        if (packet is null) continue;
                        matched = packet; selectedCandidate = candidate; selectedKey = candidate.Key;
                        ApplyLyrics(packet); SaveOnline(target, packet, candidate.Key, false);
                        OnlineStatus(new(target.Key, false, "已自动匹配 · " + packet.Source + "；正在补全其他搜索结果", page, errors.ToArray(), candidate.Key, "ready")); return true;
                    }
                    catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { throw; }
                    catch (Exception e) { errors.Add(candidate.Provider + "：" + e.Message); }
                }
                return false;
            });
            if (!Current(work, target)) return;
            errors.InsertRange(0, result.Errors);
            if (matched is not null)
            {
                var completed = result.Candidates;
                // Keep the early selection visible when later high-scoring pages fill the 40-row result limit.
                if (selectedCandidate is not null && !completed.Any(c => c.Key == selectedKey)) completed = completed.Take(39).Append(selectedCandidate)
                    .OrderByDescending(c => c.Score).ThenBy(c => Array.IndexOf(OnlineLyrics.ProviderIds, c.Provider)).ToArray();
                OnlineStatus(new(target.Key, false, "已自动匹配 · " + matched.Source, completed, errors.ToArray(), selectedKey, "ready")); return;
            }
            OnlineStatus(new(target.Key, false, result.Candidates.Length > 0 ? "未找到足够可靠的自动匹配，请选择一个搜索结果" : "没有找到歌词，可修改歌名/歌手后搜索或导入本地歌词", result.Candidates, errors.ToArray(), Phase: result.Candidates.Length > 0 ? "choice" : "failed"));
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { }
        catch (Exception e) { if (Current(work, target)) OnlineStatus(new(target.Key, false, "匹配暂未完成，请重试", [], [e.Message], Phase: "failed")); }
    }
    private string[] EnabledSources() => (preferences.OnlineProviders ?? []).Where(OnlineLyrics.ProviderIds.Contains).Distinct().ToArray();
    private void SaveOnline(Song target, Lyrics packet, string candidateKey, bool manual)
    { try { onlineCache.Save(target, packet, candidateKey, manual); } catch (Exception e) { DataFiles.Log(e); } }
    private async Task SearchOnline(JsonElement value)
    {
        if (!preferences.OnlineEnabled) return;
        var title = value.Text("title").Trim(); var artist = value.Text("artist").Trim();
        if (title.Length == 0 || title.Length > 200 || artist.Length > 200) throw new IOException("请填写不超过 200 字的歌名和歌手");
        var target = song ?? new Song("", "", "", "", "", false, 0, 0, 1, false, []);
        var work = StartWork(); automaticLookup = false;
        OnlineStatus(new(target.Key, true, "正在搜索已启用的歌词源…", [], [], Phase: "matching"));
        try
        {
            var result = await online.Search(new(title, artist, target.Album, target.Duration), EnabledSources(), work.Token);
            if (Current(work, target)) OnlineStatus(new(target.Key, false, result.Candidates.Length > 0 ? "选择与你播放版本相符的歌词；选择会自动记住" : "没有搜索结果，请检查歌名/歌手或换一个歌词源", result.Candidates, result.Errors, Phase: result.Candidates.Length > 0 ? "choice" : "failed"));
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { }
        catch (Exception e) { if (Current(work, target)) OnlineStatus(new(target.Key, false, "搜索失败，请重试", [], [e.Message], Phase: "failed")); }
    }
    private async Task SelectOnline(JsonElement value)
    {
        if (!preferences.OnlineEnabled) return;
        var target = song ?? new Song("", "", "", "", "", false, 0, 0, 1, false, []);
        var candidate = onlineState.Key == target.Key ? onlineState.Candidates.FirstOrDefault(c => c.Key == value.Text("id")) : null;
        if (candidate is null || value.Text("songKey") != target.Key || !EnabledSources().Contains(candidate.Provider)) throw new IOException("搜索结果已过期，请重新搜索");
        if (!candidate.Available) throw new IOException("这个结果没有同步时间轴，请选择其他版本");
        var work = StartWork(); automaticLookup = false;
        OnlineStatus(onlineState with { Busy = true, Message = "正在获取你选择的歌词…", Phase = "matching" });
        try
        {
            var packet = await online.Fetch(candidate, target, work.Token);
            if (!Current(work, target)) return;
            if (packet is null) throw new IOException("这个版本没有可用的同步歌词，请尝试其他结果");
            ApplyLyrics(packet); SaveOnline(target, packet, candidate.Key, true);
            OnlineStatus(onlineState with { Busy = false, Message = "已使用 · " + packet.Source, SelectedKey = candidate.Key, Phase = "ready" });
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { }
        catch (Exception e) { if (Current(work, target)) OnlineStatus(onlineState with { Busy = false, Message = e.Message, Phase = "failed" }); }
    }
    private void OnlinePreferenceChanged()
    {
        SavePreferences(); StartWork();
        OnlineStatus(onlineState with { Busy = false, Message = preferences.OnlineEnabled ? "歌词源设置已更新，可重新搜索" : "在线匹配已关闭；本地和已缓存歌词仍可使用", Phase = "idle" });
        if (preferences.OnlineEnabled && lyrics is null && song is not null) BeginResolve(song, false);
    }
}
