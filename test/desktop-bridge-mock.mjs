// test/desktop-bridge-mock.mjs — shared in-memory WebView fixture for desktop UI and performance verification.
export async function installDesktopBridgeMock(page) {
  await page.addInitScript(() => {
    const listeners = new Set();
    let windowState = { maximized: false, fullscreen: false, clickThrough: false };
    let discovery = { batchId: 'mock-empty', busy: false, candidates: [] }, discoverySequence = 0;
    const discoveredApps = new Map();
    const prefs = { topmost: false, audioReactive: true, transparentBackground: false, coverTheme: true, autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true, closeToTaskbar: false, source: '', onlineEnabled: true, onlineProviders: ['qq', 'kugou', 'netease', 'lrclib'], musicApps: [], blockedMusicApps: [],
      ...JSON.parse(sessionStorage.getItem('folia.test.mockPreferences') || '{}') };
    const identity = app => (app.launchKind === 'store' ? `store:${app.appUserModelId}` : `exe:${app.path}`).toLowerCase();
    const nextBatch = () => `mock-batch-${++discoverySequence}`;
    // Apply host replies to the fixture inbox; explicit scans continue to receive test-supplied results.
    const replyMusicApps = () => queueMicrotask(() => {
      window.__foliaEmit('preferences', { ...prefs });
      window.__foliaEmit('musicAppDiscovery', { ...discovery, candidates: [...discovery.candidates] });
    });
    const removeCandidates = ids => {
      discovery = { ...discovery, candidates: discovery.candidates.filter(app => !ids.includes(app.id)) };
      if (!discovery.candidates.length) discovery.batchId = nextBatch();
    };
    window.__foliaMockPreferences = () => ({ ...prefs });
    window.__foliaSetMockPreferences = values => { Object.assign(prefs, values); window.__foliaEmit('preferences', { ...prefs }); };
    window.__foliaCommands = [];
    window.__foliaReadyAt = null;
    window.__foliaEmit = (type, data) => {
      if (type === 'windowState') windowState = { ...windowState, ...data };
      if (type === 'musicAppDiscovery') {
        discovery = { ...data, candidates: [...data.candidates] };
        discovery.candidates.forEach(app => discoveredApps.set(app.id, app));
      }
      listeners.forEach(fn => fn({ data: { type, data } }));
    };
    window.chrome ||= {};
    window.chrome.webview = {
      postMessage: m => {
        window.__foliaCommands.push(m);
        if (m.type === 'ready') window.__foliaReadyAt ??= performance.now();
        if (m.type === 'querySystemFonts') queueMicrotask(() => window.__foliaEmit('systemFonts', {
          requestId: m.value.requestId, families: ['Arial', 'Microsoft YaHei', 'Segoe UI', 'SimSun'],
        }));
        if (m.type === 'ready') queueMicrotask(() => {
          const readyPreferences = { ...prefs };
          if (sessionStorage.getItem('folia.test.legacyClosePreference') === 'true') delete readyPreferences.closeToTaskbar;
          window.__foliaReadyPreferences = { ...readyPreferences };
          window.__foliaEmit('preferences', readyPreferences);
          window.__foliaEmit('windowState', { ...windowState });
        });
        if (m.type === 'fullscreen' || m.type === 'exitFullscreen') {
          windowState = { ...windowState, fullscreen: m.type === 'fullscreen' ? !windowState.fullscreen : false };
          queueMicrotask(() => window.__foliaEmit('windowState', { ...windowState }));
        }
        if (['topmost', 'audioReactive', 'source', 'onlineEnabled', 'transparentBackground', 'coverTheme', 'autoImmersive', 'immersiveDelay', 'bottomHoverControls', 'closeToTaskbar', 'showMusicAppAddButton', 'autoDiscoverMusicApps'].includes(m.type)) {
          prefs[m.type] = m.value;
          queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
          if(m.type==='transparentBackground') queueMicrotask(()=>window.__foliaEmit('appearance',{acrylic:!m.value,transparent:m.value,solid:false,highContrast:false}));
        }
        // Discovery results are supplied explicitly by each test, just like a native scanner reply.
        if (m.type === 'scanMusicApps') queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
        if (m.type === 'confirmMusicApps' && m.value?.batchId === discovery.batchId && Array.isArray(m.value.ids)) {
          const selected = discovery.candidates.filter(app => m.value.ids.includes(app.id));
          for (const app of selected) {
            if (prefs.musicApps.some(bound => identity(bound) === identity(app)) || prefs.blockedMusicApps.some(blocked => identity(blocked) === identity(app))) continue;
            let slot = 0;
            while (prefs.musicApps.some(bound => bound.slot === slot)) slot++;
            const { id, ...binding } = app;
            prefs.musicApps = [...prefs.musicApps, { ...binding, slot }];
          }
          removeCandidates(selected.map(app => app.id)); replyMusicApps();
        }
        if (m.type === 'dismissMusicAppDiscovery' && m.value?.batchId === discovery.batchId) {
          discovery = { batchId: nextBatch(), busy: false, candidates: [] }; replyMusicApps();
        }
        if (m.type === 'blockMusicApp') {
          const bound = Number.isInteger(m.value?.slot) ? prefs.musicApps.find(app => app.slot === m.value.slot) : null;
          const candidate = bound
            ? [...discoveredApps.values()].find(app => identity(app) === identity(bound)) || { ...bound, id: `mock-binding-${bound.slot}` }
            : m.value?.batchId === discovery.batchId ? discovery.candidates.find(app => app.id === m.value.id) : null;
          if (candidate) {
            discoveredApps.set(candidate.id, candidate);
            if (!prefs.blockedMusicApps.some(app => app.id === candidate.id)) prefs.blockedMusicApps = [...prefs.blockedMusicApps, candidate];
            removeCandidates([candidate.id]); replyMusicApps();
          }
        }
        if (m.type === 'unblockMusicApp') {
          const candidate = prefs.blockedMusicApps.find(app => app.id === m.value?.id);
          if (candidate) {
            prefs.blockedMusicApps = prefs.blockedMusicApps.filter(app => app.id !== candidate.id);
            // A successful mock rescan returns restored identities only when they are not already bound.
            if (!prefs.musicApps.some(app => identity(app) === identity(candidate))) discovery = { batchId: nextBatch(), busy: false, candidates: [...discovery.candidates, candidate] };
            replyMusicApps();
          }
        }
        if (m.type === 'onlineProvider') {
          prefs.onlineProviders = m.value.enabled ? [...new Set([...prefs.onlineProviders, m.value.id])] : prefs.onlineProviders.filter(id => id !== m.value.id);
          queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
        }
        if (m.type === 'searchOnline') {
          queueMicrotask(() => window.__foliaEmit('online', { key: 'test', busy: false, message: '选择与你播放版本相符的歌词', errors: [], selectedKey: '', candidates: [
            { key: 'qq:1', provider: 'qq', id: '1', title: 'Reborn', artist: 'Girls Archives.', album: 'Reborn', duration: 169, quality: '逐字 / 逐行', available: true, score: 92, autoEligible: true },
            { key: 'lrclib:2', provider: 'lrclib', id: '2', title: 'Reborn', artist: 'Girls Archives.', album: '', duration: 169, quality: '无同步时间轴', available: false, score: 90, autoEligible: false },
          ] }));
        }
        if (m.type === 'selectOnline') {
          queueMicrotask(() => window.__foliaEmit('lyrics', { key: 'test', title: 'Reborn', artist: 'Girls Archives.', content: '[00:01.00]测试歌词\n[00:36.00]同步显示\n[01:20.00]下一行', source: 'QQ 音乐 · 测试桥', cover: '', embedded: false, format: 'lrc' }));
        }
      },
      addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    };
  });
}
