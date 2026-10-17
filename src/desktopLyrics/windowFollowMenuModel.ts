import type { MusicAppBinding } from '../types/desktopMusicApps';
import type { Session } from './bridge';

// src/desktopLyrics/windowFollowMenuModel.ts — combine live media sessions with saved shortcuts for the title menu.
export type FollowMenuOption = { id: string; label: string; status: string; running: boolean; playing: boolean; disabled: boolean; selected: boolean };
type FollowMenuSession = Pick<Session, 'source' | 'sources'>;

const comparable = (value: string) => value.trim().toLocaleLowerCase('en-US');
const pathKey = (value: string) => comparable(value.replaceAll('/', '\\'));
const executable = (path: string) => comparable(path.split(/[\\/]/).at(-1) ?? '').replace(/\.exe$/, '');

// A full media source path must identify the same executable; a basename or display alias needs one unique shortcut.
function matches(source: Session['sources'][number], app: MusicAppBinding) {
  if (app.appUserModelId && comparable(source.id) === comparable(app.appUserModelId)) return true;
  if (app.launchKind === 'store') return false;
  if (/[\\/]/.test(source.id)) return pathKey(source.id) === pathKey(app.path);
  const name = executable(app.path);
  const sourceName = comparable(source.id.split(/[\\/]/).at(-1) ?? '').replace(/\.exe$/, '');
  return Boolean(name && (name === sourceName || comparable(source.id) === comparable(app.name)
    || comparable(source.label) === comparable(app.name)));
}

// Prefer an exact saved identity; an ambiguous executable name must not select multiple shortcuts.
function boundApp(source: Session['sources'][number], apps: MusicAppBinding[]) {
  const id = comparable(source.id);
  const exact = apps.find(app => app.launchKind === 'store' ? comparable(app.appUserModelId || '') === id : pathKey(app.path) === pathKey(source.id));
  if (exact) return exact;
  const candidates = apps.filter(app => matches(source, app));
  return candidates.length === 1 ? candidates[0] : undefined;
}

// Resolve the caption without constructing offline choices or checking every pair of saved executables while the menu is closed.
export function followMenuSelectedLabel(session: FollowMenuSession, apps: MusicAppBinding[], preferred: string) {
  if (!preferred) return '自动跟随';
  const preferredId = comparable(preferred), remembered = boundApp({ id: preferred, label: preferred }, apps);
  const seen = new Set<string>();
  let rememberedLive = false;
  for (const source of session.sources) {
    if (!source.id) continue;
    const id = comparable(source.id);
    const app = boundApp(source, apps) ?? (remembered && id === comparable(session.source) ? remembered : undefined);
    if (app === remembered && remembered) rememberedLive = true;
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === preferredId || app && app === remembered && id === comparable(session.source)) return app?.name || source.label || source.id;
  }
  return remembered && !rememberedLive ? remembered.name || executable(remembered.path) || preferred : preferred;
}

export function buildFollowMenuOptions(session: FollowMenuSession, apps: MusicAppBinding[], preferred: string): FollowMenuOption[] {
  const live = session.sources.filter(source => Boolean(source.id));
  const rememberedBinding = preferred ? boundApp({ id: preferred, label: preferred }, apps) : undefined;
  const liveBindings = live.map(source => boundApp(source, apps)
    // The native host has already proved this selected session belongs to the saved executable, even if its ID is an alias.
    ?? (rememberedBinding && comparable(source.id) === comparable(session.source) ? rememberedBinding : undefined));
  const unique = new Set<string>();
  const running = live.flatMap((source, index) => {
    const id = comparable(source.id);
    if (unique.has(id)) return [];
    unique.add(id);
    const app = liveBindings[index];
    const selected = id === comparable(preferred) || Boolean(app && app === rememberedBinding && id === comparable(session.source));
    const optionId = selected && rememberedBinding ? preferred : source.id;
    unique.add(comparable(optionId));
    return [{ id: optionId, label: app?.name || source.label || source.id,
      status: source.playing ? '正在播放' : '未播放', running: true, playing: Boolean(source.playing),
      disabled: false, selected }];
  });
  const offline = apps.filter(app => !liveBindings.includes(app)).map(app => {
    const remembered = app === rememberedBinding ? preferred : '';
    const id = app.launchKind === 'store' ? app.appUserModelId || '' : remembered || app.path;
    const ambiguous = app.launchKind !== 'store' && apps.some(other => other !== app && other.launchKind !== 'store'
      && executable(other.path) === executable(app.path) && pathKey(other.path) !== pathKey(app.path));
    if (id) unique.add(comparable(id));
    return { id, label: app.name || executable(app.path) || id, status: id && comparable(id) === comparable(preferred)
      ? '未运行 · 已选择' : ambiguous ? '未运行 · 同名程序需完整会话路径' : id ? '未运行 · 可预选' : '未运行 · 启动后可切换',
      running: false, playing: false, disabled: !id, selected: Boolean(id && comparable(id) === comparable(preferred)) };
  });
  if (preferred && !unique.has(comparable(preferred))) offline.push({ id: preferred, label: preferred,
    status: '未运行 · 已选择', running: false, playing: false, disabled: false, selected: true });
  return running.concat(offline);
}
