using System.Text.Json;

// native/WindowOnline.cs: Cancel obsolete work while media-clock polling continues independently.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly OnlineLyrics online = new();
    private readonly OnlineCache onlineCache = new(Path.Combine(DataFiles.Root, "online-lyrics"));
    private readonly OnlineSessionChoices sessionOnlineChoices = new();
    internal TimeSpan ManualSelectionTimeout = TimeSpan.FromSeconds(15);
    private CancellationTokenSource? lyricWork;
    private int lyricRevision;
    private bool automaticLookup;
    private double lookupDuration;
    private string appliedOnlineKey = "";
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
    private void ApplyLyrics(Lyrics packet, string selectedKey = "") { lyrics = packet; appliedOnlineKey = selectedKey; lyricKey = song?.Key ?? ""; Send("lyrics", packet); }
    private void BeginResolve(Song target, bool clear)
    {
        var work = StartWork(); automaticLookup = true; lookupDuration = target.Duration;
        if (clear) { lyrics = null; appliedOnlineKey = ""; Send("lyrics", new Lyrics(target.Key, target.Title, target.Artist, "", "", "", false)); }
        OnlineStatus(new(target.Key, false, target.Title.Length == 0 ? "等待播放器提供歌名；也可手动搜索" : "正在匹配歌词…", [], [], Phase: target.Title.Length == 0 ? "idle" : "matching"));
        _ = ResolveLyrics(target, work);
    }
    private async Task ResolveLyrics(Song target, Work work)
    {
        try
        {
            if (target.Title.Length == 0) return;
            // Read cache and local files off the UI thread; debounce only requests that need the network.
            var resolved = await Task.Run(async () =>
            {
                work.Token.ThrowIfCancellationRequested();
                var workerSession = sessionOnlineChoices.Read(target);
                var workerCached = workerSession is null ? await onlineCache.ReadAsync(target).ConfigureAwait(false) : null;
                work.Token.ThrowIfCancellationRequested();
                Lyrics? workerLocal = null;
                // The latest explicit import remains selected for this session while an older online choice stays preserved on disk.
                if (workerSession is null && workerCached is not { Manual: true } || library.HasSessionImportOverride(target))
                {
                    try { workerLocal = library.Find(target); }
                    catch (Exception e) when (e is not OperationCanceledException) { DataFiles.Log(e); }
                }
                work.Token.ThrowIfCancellationRequested();
                return (Cached: workerCached, Local: workerLocal, Session: workerSession);
            }, work.Token);
            if (!Current(work, target)) return;
            var cached = resolved.Cached;
            if (resolved.Session is { } temporary && resolved.Local is null)
            {
                ApplyLyrics(temporary.Lyrics with { Key = target.Key }, temporary.CandidateKey);
                OnlineStatus(new(target.Key, false, temporary.Failed ? "本次已使用，但未记住；重启后可能恢复旧选择" : "已使用你选择的在线歌词（本次会话）", [], [], temporary.CandidateKey, "ready")); return;
            }
            if (cached is { Manual: true } && resolved.Local is null)
            {
                if (Current(work, target)) { ApplyLyrics(cached.Lyrics, cached.CandidateKey); OnlineStatus(new(target.Key, false, "已使用你选择的在线歌词（缓存）", [], [], cached.CandidateKey, "ready")); }
                return;
            }
            var local = resolved.Local;
            if (local is not null) { ApplyLyrics(local); OnlineStatus(new(target.Key, false, "已使用本地歌词；也可手动搜索在线版本", [], [], Phase: "ready")); return; }
            if (cached is not null)
            {
                if (preferences.OnlineEnabled && EnabledSources().Contains("qq")
                    && cached.PriorityPolicy < OnlineLyrics.PriorityPolicyVersion)
                    await RefreshPreferredCache(target, work, cached);
                else { ApplyLyrics(cached.Lyrics, cached.CandidateKey); OnlineStatus(new(target.Key, false, "已读取在线歌词缓存", [], [], cached.CandidateKey, "ready")); }
                return;
            }
            if (!preferences.OnlineEnabled) { OnlineStatus(new(target.Key, false, "在线匹配已关闭", [], [])); return; }
            await Task.Delay(350, work.Token);
            if (!Current(work, target)) return;
            OnlineStatus(new(target.Key, true, "正在搜索已启用的歌词源…", [], [], Phase: "matching"));
            var published = false;
            var result = await online.ResolveAutomatic(target, EnabledSources(), work.Token, InspectOnlineLyrics, async early =>
            {
                if (!Current(work, target) || early.Lyrics is not { } packet || early.Selected is not { } candidate) return;
                published = true; ApplyLyrics(packet, candidate.Key); await SaveOnline(target, packet, candidate.Key, false);
                if (Current(work, target)) OnlineStatus(new(target.Key, false, "已自动匹配 · " + packet.Source, early.Candidates, early.Errors, candidate.Key, "ready"));
            });
            if (!Current(work, target)) return;
            if (result.Lyrics is { } matched && result.Selected is { } selected)
            {
                if (!published) { ApplyLyrics(matched, selected.Key); await SaveOnline(target, matched, selected.Key, false); }
                if (Current(work, target)) OnlineStatus(new(target.Key, false, "已自动匹配 · " + matched.Source, result.Candidates, result.Errors, selected.Key, "ready"));
                return;
            }
            OnlineStatus(new(target.Key, false, result.Candidates.Length > 0 ? "没有找到可用的同步歌词，请选择其他版本或导入本地歌词" : "没有找到歌词，可修改歌名/歌手后搜索或导入本地歌词", result.Candidates, result.Errors, Phase: result.Candidates.Length > 0 ? "choice" : "failed"));
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { }
        catch (Exception e) { if (Current(work, target)) OnlineStatus(new(target.Key, false, "匹配暂未完成，请重试", [], [e.Message], Phase: "failed")); }
    }
    private string[] EnabledSources() => (preferences.OnlineProviders ?? []).Where(OnlineLyrics.ProviderIds.Contains).Distinct().ToArray();
    // Re-evaluate every older automatic cache under word-timing priority, including previous QQ line-timed downloads.
    private async Task RefreshPreferredCache(Song target, Work work, CachedOnline cached)
    {
        var errors = new List<string>(); LyricCandidate[] candidates = [];
        OnlineStatus(new(target.Key, true, "正在优先检查 QQ 音乐逐字歌词…", [], [], Phase: "matching"));
        try
        {
            var published = false;
            var result = await online.ResolveAutomatic(target, EnabledSources(), work.Token, InspectOnlineLyrics, async early =>
            {
                if (!Current(work, target) || early.Lyrics is not { } packet || early.Selected is not { } candidate) return;
                published = true; ApplyLyrics(packet, candidate.Key); await SaveOnline(target, packet, candidate.Key, false);
                if (Current(work, target)) OnlineStatus(new(target.Key, false, "已自动匹配 · " + packet.Source, early.Candidates, early.Errors, candidate.Key, "ready"));
            });
            if (!Current(work, target)) return;
            candidates = result.Candidates; errors.AddRange(result.Errors);
            if (result.Lyrics is { } packet && result.Selected is { } candidate)
            {
                if (!published) { ApplyLyrics(packet, candidate.Key); await SaveOnline(target, packet, candidate.Key, false); }
                if (Current(work, target)) OnlineStatus(new(target.Key, false, "已自动匹配 · " + packet.Source, candidates, errors.ToArray(), candidate.Key, "ready"));
                return;
            }
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { throw; }
        catch (Exception e) { errors.Add(e.Message); }
        if (!Current(work, target)) return;
        var cacheUsable = false;
        try { cacheUsable = (await InspectOnlineLyrics(cached.Lyrics, work.Token)).Usable; }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { throw; }
        catch (Exception e) { errors.Add(e.Message); }
        if (!Current(work, target)) return;
        if (!cacheUsable)
        {
            OnlineStatus(new(target.Key, false, "没有找到可用的同步歌词，请选择其他版本或导入本地歌词", candidates, errors.ToArray(), Phase: candidates.Length > 0 ? "choice" : "failed"));
            return;
        }
        ApplyLyrics(cached.Lyrics, cached.CandidateKey); await SaveOnline(target, cached.Lyrics, cached.CandidateKey, false);
        if (Current(work, target)) OnlineStatus(new(target.Key, false, "已读取在线歌词缓存；暂无可用的新匹配", candidates, errors.ToArray(), cached.CandidateKey, "ready"));
    }
    private async Task<bool> SaveOnline(Song target, Lyrics packet, string candidateKey, bool manual)
    {
        // A match made while QQ is disabled has not evaluated its priority; enabling QQ later must still allow the one-time refresh.
        var priorityPolicy = !manual && preferences.OnlineEnabled && EnabledSources().Contains("qq") ? OnlineLyrics.PriorityPolicyVersion : 0;
        try { return (await onlineCache.SaveAsync(target, packet, candidateKey, manual, priorityPolicy)).Saved; }
        catch (Exception e) { DataFiles.Log(e); return false; }
    }
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
            var packet = await ManualOnlineSelection.Read(online, candidate, target, ManualSelectionTimeout, InspectOnlineLyrics, work.Token);
            if (!Current(work, target)) return;
            library.ClearSessionImportOverride(target);
            var temporary = sessionOnlineChoices.Remember(target, packet, candidate.Key);
            ApplyLyrics(packet, candidate.Key); var saved = await SaveOnline(target, packet, candidate.Key, true);
            sessionOnlineChoices.CompleteSave(target, temporary, saved);
            if (!Current(work, target)) return;
            OnlineStatus(onlineState with { Busy = false, Message = saved ? "已使用 · " + packet.Source : "本次已使用，但未记住 · " + packet.Source, SelectedKey = candidate.Key, Phase = "ready" });
            if (!saved) Send("notice", new { text = "本次已使用，但未记住；切歌返回仍可使用，重启后可能恢复旧选择。", target = new { id = "online-results" } });
        }
        catch (OperationCanceledException) when (work.Token.IsCancellationRequested) { }
        catch (TimeoutException) { if (Current(work, target)) OnlineStatus(onlineState with { Busy = false, Message = "所选歌词获取或检测超时，请重试或选择其他版本", Phase = "failed" }); }
        catch (Exception e) { if (Current(work, target)) OnlineStatus(onlineState with { Busy = false, Message = e.Message, Phase = "failed" }); }
    }
    // Cancel the active request without discarding a lyric or selection already accepted by the user.
    private void CancelOnlineOperation()
    {
        if (!onlineState.Busy && onlineState.Phase != "matching") return;
        StartWork(); automaticLookup = false;
        var displayed = lyrics is { Content.Length: > 0 } && lyrics.Key == song?.Key;
        OnlineStatus(onlineState with { Busy = false, Message = "已取消当前歌词请求，保留正在显示的歌词。",
            SelectedKey = displayed ? appliedOnlineKey : "", Phase = displayed ? "ready" : onlineState.Candidates.Length > 0 ? "choice" : "idle" });
    }
    private void OnlinePreferenceChanged()
    {
        SavePreferences(); StartWork();
        OnlineStatus(onlineState with { Busy = false, Message = preferences.OnlineEnabled ? "歌词源设置已更新，可重新搜索" : "在线匹配已关闭；本地和已缓存歌词仍可使用", Phase = "idle" });
        if (preferences.OnlineEnabled && lyrics is null && song is not null) BeginResolve(song, false);
    }
    // Clear the cancelled lookup's busy state even when deleting a locked cache file fails.
    private async Task ResetOnline()
    {
        if (song is not { } target) return;
        var work = StartWork(); automaticLookup = false;
        try { await onlineCache.ForgetAsync(target); if (Current(work, target)) { sessionOnlineChoices.Clear(target); BeginResolve(target, true); } }
        catch (Exception e)
        {
            if (Current(work, target)) OnlineStatus(onlineState with { Busy = false, Message = "重新匹配失败：" + e.Message, Errors = [e.Message], Phase = "failed" });
            throw;
        }
    }
    // Import and cache invalidation share one revision so late failures cannot overwrite a newer song's status.
    private async Task ImportLyrics(string path)
    {
        var target = song; var work = StartWork(); automaticLookup = false;
        bool IsCurrentImport() => !IsDisposed && !work.Token.IsCancellationRequested && work.Revision == lyricRevision && song?.Key == target?.Key;
        try
        {
            var imported = await Task.Run(() => library.Import(path, target));
            var changedSong = imported.Saved ? "歌词已保存，播放器已切歌，未覆盖当前歌曲。" : "歌词已读取但未保存，播放器已切歌，未覆盖当前歌曲；请重新导入。";
            if (!IsCurrentImport()) { Send("notice", new { text = changedSong, target = new { id = "local-import" } }); return; }
            if (target is not null) sessionOnlineChoices.Clear(target);
            if (imported.Saved && target is not null) await onlineCache.ForgetAsync(target);
            if (!IsCurrentImport()) { Send("notice", new { text = changedSong, target = new { id = "local-import" } }); return; }
            OnlineStatus(new(song?.Key ?? "", false, "已使用导入的本地歌词", [], [], Phase: "ready"));
            ApplyLyrics(imported.Lyrics); Send("library", library.Summary());
            if (!imported.Saved) Send("notice", new { text = "本次导入有效，但未保存，重启后绑定可能丢失。", target = new { id = "local-import" } });
        }
        catch (Exception e)
        {
            if (IsCurrentImport()) OnlineStatus(onlineState with { Busy = false, Message = "歌词导入失败：" + e.Message, Errors = [e.Message], Phase = "failed" });
            throw;
        }
    }
}
