// test/desktop-bridge-mock.mjs — shared in-memory WebView fixture for desktop UI and performance verification.
export async function installDesktopBridgeMock(page) {
  await page.addInitScript(() => {
    const listeners = new Set();
    let windowState = { maximized: false, fullscreen: false, clickThrough: false };
    const prefs = { topmost: false, audioReactive: true, transparentBackground: false, coverTheme: true, autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true, closeToTaskbar: false, source: '', onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'],
      ...JSON.parse(sessionStorage.getItem('folia.test.mockPreferences') || '{}') };
    window.__foliaMockPreferences = () => ({ ...prefs });
    window.__foliaSetMockPreferences = values => { Object.assign(prefs, values); window.__foliaEmit('preferences', { ...prefs }); };
    window.__foliaCommands = [];
    window.__foliaReadyAt = null;
    window.__foliaEmit = (type, data) => {
      if (type === 'windowState') windowState = { ...windowState, ...data };
      listeners.forEach(fn => fn({ data: { type, data } }));
    };
    window.chrome ||= {};
    window.chrome.webview = {
      postMessage: m => {
        window.__foliaCommands.push(m);
        if (m.type === 'ready') window.__foliaReadyAt ??= performance.now();
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
        if (['topmost', 'audioReactive', 'source', 'onlineEnabled', 'transparentBackground', 'coverTheme', 'autoImmersive', 'immersiveDelay', 'bottomHoverControls', 'closeToTaskbar'].includes(m.type)) {
          prefs[m.type] = m.value;
          queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
          if(m.type==='transparentBackground') queueMicrotask(()=>window.__foliaEmit('appearance',{acrylic:!m.value,transparent:m.value,solid:false,highContrast:false}));
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
