import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal-state"><h1>화면을 불러오지 못했어요</h1><p>다시 불러와 PC 연결을 확인해 주세요.</p><button onClick={() => window.location.reload()}>다시 불러오기</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
