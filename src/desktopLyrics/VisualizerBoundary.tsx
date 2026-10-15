import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { VisualizerMode } from '../types';
import i18n from '../i18n/config';
import { send } from './bridge';
import { desktopModeLabel } from './desktopModes';

// src/desktopLyrics/VisualizerBoundary.tsx
export default class VisualizerBoundary extends Component<{ children: ReactNode; mode: VisualizerMode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[DesktopVisualizer]', this.props.mode, error, info.componentStack);
    const message = error instanceof Error ? error.message : String(error), stack = error instanceof Error ? error.stack : undefined;
    send('rendererError', { mode: this.props.mode, message: message.slice(0, 8192), stack: stack?.slice(0, 16384), componentStack: info.componentStack?.slice(0, 16384) });
  }
  // Clear this boundary even when the fallback mode is already selected, so retry remounts its renderer.
  private recover = () => { this.setState({ failed: false }); this.props.onRecover(); };
  render() {
    const text = (key: string) => i18n.t(`desktopLyrics.recovery.${key}`, { lng: 'zh-CN', mode: desktopModeLabel('classic') });
    return this.state.failed ? <div className="waiting-screen" role="alert"><h1>{text('failed')}</h1>
      <button onClick={this.recover}>{text(this.props.mode === 'classic' ? 'retry' : 'fallback')}</button></div> : this.props.children;
  }
}
