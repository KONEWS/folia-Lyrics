import { Component, type ReactNode } from 'react';

// src/desktopLyrics/VisualizerBoundary.tsx
export default class VisualizerBoundary extends Component<{ children: ReactNode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="waiting-screen"><h1>这个动效暂时无法显示</h1><button onClick={this.props.onRecover}>切回 Luminous</button></div> : this.props.children; }
}
