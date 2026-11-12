import React, { useEffect, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Activity, CircuitBoard, Cpu, Disc3, Info, Minus, Moon, RefreshCw, Square, Sun, X, Copy, Check, Puzzle, Settings } from 'lucide-react';
import type { Appearance, DashboardState, MetricSample, WindowInfo } from '../shared/contracts.ts';
import type { PluginUpdatesState, UpdateState } from '../shared/features.ts';
import { formatBytes, formatUptime } from '../shared/format.ts';
import { appendHistory } from '../shared/history.ts';
import { collectionFreshness } from '../shared/freshness.ts';
import { MetricChart } from './MetricChart.tsx';
import { DevicesPanel, DisplaysPanel, StoragePanel } from './InventoryPanels.tsx';
import { AstryxProvider } from './design/AstryxProvider.tsx';
import { PluginsPanel, SettingsPanel } from './FeaturePanels.tsx';
import './features.css';

function Brand() {
  return <img className="brand-mark" src="kitvi-icon.png" width="30" height="30" alt="" draggable={false} />;
}
function Spec({ icon, label, title, children }: { icon: React.ReactNode; label: string; title: string; children: React.ReactNode }) {
  return <section className="spec-card"><div className="spec-label">{icon}<span>{label}</span></div><h2 title={title}>{title}</h2><div className="spec-detail">{children}</div></section>;
}
const starting: DashboardState = { snapshot: null, collector: { state: 'starting', message: null, lastSnapshotAt: null } };
export function App() {
  const [state, setState] = useState<DashboardState>(starting);
  const [history, setHistory] = useState<MetricSample[]>([]);
  const [appearance, setAppearance] = useState<Appearance>(document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light');
  const [windowInfo, setWindowInfo] = useState<WindowInfo>({ maximized: false, version: '0.5.0' });
  const [page, setPage] = useState<'pc'|'plugins'|'settings'>('pc');
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<PluginUpdatesState | null>(null);
  const [selectedGpuId, setSelectedGpuId] = useState('');
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const api = window.kitvi;
  useEffect(() => {
    if (!api) { setError('앱 연결을 준비하지 못했어요. Kitvi를 다시 실행해 주세요.'); return; }
    let active = true;
    const receive = (next: DashboardState) => {
      if (!active) return;
      setState(next);
      if (next.snapshot) setHistory((old) => appendHistory(old, next.snapshot!));
    };
    const unsubscribe = api.onState(receive);
    const unsubscribeWindow = api.onWindow((next) => { if (active) setWindowInfo(next); });
    const unsubscribeUpdate = api.onUpdate((next) => { if (active) setUpdate(next); });
    const unsubscribePluginUpdates = api.onPluginUpdates((next) => { if (active) setPluginUpdates(next); });
    void api.getState().then(receive).catch(() => { if (active) setError('PC 연결 상태를 확인하지 못했어요.'); });
    void api.getWindow().then((info) => { if (active) setWindowInfo(info); }).catch(() => {});
    void api.getAppearance().then((value) => { if (active) setAppearance(value); }).catch(() => {});
    void api.getUpdateState().then((next) => { if (active) setUpdate(next); }).catch(() => {});
    void api.getPluginUpdates().then((next) => { if (active) setPluginUpdates(next); }).catch(() => {});
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; unsubscribe(); unsubscribeWindow(); unsubscribeUpdate(); unsubscribePluginUpdates(); window.clearInterval(timer); };
  }, [api]);
  useEffect(() => { document.documentElement.dataset.appearance = appearance; }, [appearance]);
  const snapshot = state.snapshot;
  useEffect(() => {
    const gpus = snapshot?.gpus || [];
    if (!gpus.some((item) => item.id === selectedGpuId)) setSelectedGpuId(gpus[0]?.id || '');
  }, [snapshot?.gpus, selectedGpuId]);
  const run = async (action: () => Promise<unknown>) => {
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요.'); }
  };
  const refresh = async () => {
    if (working || !api) return;
    setWorking(true); setError('');
    try { await api.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : '새로고침하지 못했어요.'); }
    finally { setWorking(false); }
  };
  const toggleAppearance = () => run(async () => {
    const next = await api.setAppearance(appearance === 'dark' ? 'light' : 'dark'); setAppearance(next);
  });
  const gpu = snapshot?.gpus.find((item) => item.id === selectedGpuId) || snapshot?.gpus[0];
  const ready = state.collector.state === 'running';
  const stale = state.collector.state === 'error' || state.collector.state === 'reconnecting' || !!snapshot?.metricsAt && now - Date.parse(snapshot.metricsAt) > 5000;
  const fixedLoading = !snapshot || snapshot.sections.hardware.status === 'loading';
  const missing = fixedLoading ? '정보를 불러오는 중' : '정보 없음';
  const gpuMissing = !snapshot || snapshot.sections.gpus.status === 'loading' ? '정보를 불러오는 중' : snapshot.sections.gpus.status === 'error' ? '정보를 읽지 못했어요' : '표시할 GPU 없음';
  const gpuReading = gpu?.usage || { value: null, status: !snapshot || snapshot.sections.gpus.status === 'loading' ? 'loading' as const : 'unavailable' as const, updatedAt: null };
  const gpuFreshness = collectionFreshness(snapshot?.sections.gpus, now, 45000);
  const inventoryDelayed = !!snapshot && (['gpus', 'storage', 'displays', 'devices'] as const).some((key) => ['stale', 'error'].includes(collectionFreshness(snapshot.sections[key], now, key === 'storage' ? 15000 : 45000)));
  const stateLabel = state.collector.state === 'starting' ? 'PC에 연결 중' : state.collector.state === 'reconnecting' ? '다시 연결 중' : state.collector.state === 'error' ? '연결 확인 필요' : stale ? '갱신 지연' : inventoryDelayed ? '일부 정보 확인 필요' : '실시간';
  const lastReceived = state.collector.lastSnapshotAt ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(state.collector.lastSnapshotAt)) : null;
  const gpuSelector = snapshot && snapshot.gpus.length > 1 ? <select className="gpu-select" aria-label="GPU 선택" title="표시할 GPU 선택" value={gpu?.id || ''} onChange={(event) => setSelectedGpuId(event.target.value)}>
    {snapshot.gpus.map((item, index) => <option key={item.id} value={item.id}>GPU {index + 1} · {item.name}</option>)}
  </select> : undefined;

  return <AstryxProvider appearance={appearance}><div className={`app-shell ${windowInfo.maximized ? 'maximized' : ''}`}>
    <header className="app-header">
      <div className="header-brand"><Brand /><strong>Kitvi</strong><span>v{windowInfo.version}</span></div>
      <nav className="app-navigation" aria-label="주 메뉴">
        <button aria-current={page === 'pc' ? 'page' : undefined} onClick={() => setPage('pc')}><Activity size={16} />PC 상태</button>
        <button data-update-available={pluginUpdates?.plugins.some((item) => item.status === 'available') || undefined} aria-current={page === 'plugins' ? 'page' : undefined} onClick={() => setPage('plugins')}><Puzzle size={16} />플러그인</button>
        <button data-update-available={!!update?.availableVersion || undefined} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}><Settings size={16} />설정</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button theme-button" disabled={!api} onClick={toggleAppearance} aria-label={appearance === 'dark' ? '화이트 모드로 전환' : '다크 모드로 전환'} title={appearance === 'dark' ? '화이트 모드' : '다크 모드'}>{appearance === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="window-buttons" aria-label="창 조작">
          <button onClick={() => run(() => api.minimize())} aria-label="최소화" title="최소화"><Minus size={17} /></button>
          <button onClick={() => run(() => api.toggleMaximize())} aria-label={windowInfo.maximized ? '복원' : '최대화'} title={windowInfo.maximized ? '복원' : '최대화'}>{windowInfo.maximized ? <Copy size={14} /> : <Square size={14} />}</button>
          <button className="close-button" onClick={() => run(() => api.close())} aria-label="닫기" title="닫기"><X size={18} /></button>
        </div>
      </div>
    </header>
    <main className="dashboard-scroll"><div className="dashboard-content">
      {page === 'plugins' && <PluginsPanel api={api} appearance={appearance} />}
      {page === 'settings' && <SettingsPanel api={api} />}
      <div hidden={page !== 'pc'}>
      {update?.availableVersion && <div className="notice" role="status"><Info size={19} /><span>Kitvi {update.availableVersion} 업데이트{update.phase === 'downloaded' ? '를 설치할 준비가 되었어요.' : '가 있어요.'}</span><Button label="설정에서 확인" size="lg" onClick={() => setPage('settings')} /></div>}
      <div className="page-heading">
        <div><div className="page-title"><h1>PC 상태</h1><span role="status"><Badge label={stateLabel} variant={state.collector.state === 'error' ? 'error' : stale || inventoryDelayed ? 'warning' : ready ? 'success' : 'neutral'} /></span></div><p>지금의 사용량과 연결된 하드웨어를 확인해요.</p></div>
        <div className="page-actions"><span className="last-received">{lastReceived ? `최근 수신 ${lastReceived}` : 'PC 정보를 준비하고 있어요.'}</span><Button className="refresh-button" label="새로고침" variant="primary" size="lg" icon={<RefreshCw size={17} />} onClick={refresh} isDisabled={!ready} isLoading={working} /></div>
      </div>
      {error && <div className="notice error-notice" role="alert"><Info size={19} aria-hidden="true" /><span>{error}</span><button aria-label="알림 닫기" onClick={() => setError('')}><X size={16} /></button></div>}
      {(state.collector.state === 'error' || state.collector.state === 'reconnecting') && <div className="notice connection-notice" role="status"><Info size={19} aria-hidden="true" /><div><strong>{state.collector.state === 'error' ? 'PC 정보를 가져오지 못했어요' : 'PC에 다시 연결하고 있어요'}</strong><p>{state.collector.message}{snapshot && ' 마지막으로 받은 정보를 표시하고 있어요.'}</p></div>{state.collector.state === 'error' && <Button label="다시 연결" size="lg" onClick={() => run(() => api.retryCollector())} />}</div>}
      <section aria-label="하드웨어 요약"><Card className="spec-grid" padding={0}>
        <Spec icon={<Cpu size={18} aria-hidden="true" />} label="CPU" title={snapshot?.cpu.name || missing}><p>{snapshot?.cpu.cores != null ? `${snapshot.cpu.cores} 코어` : '코어 정보 없음'}<span className="text-separator">·</span>{snapshot?.cpu.threads != null ? `${snapshot.cpu.threads} 스레드` : '스레드 정보 없음'}</p></Spec>
        <Spec icon={<Disc3 size={18} aria-hidden="true" />} label="GPU" title={gpu?.name || gpuMissing}><p>전용 메모리 {formatBytes(gpu?.dedicatedMemoryBytes)}</p><p className="driver-text">드라이버 {gpu?.driverVersion || '정보 없음'}</p>{gpu && ['stale', 'error'].includes(gpuFreshness) && <p className="warning-text">마지막으로 확인한 GPU 정보예요.</p>}</Spec>
        <Spec icon={<CircuitBoard size={18} aria-hidden="true" />} label="메모리" title={formatBytes(snapshot?.memory.totalBytes)}><p>{formatBytes(snapshot?.memory.usedBytes)} 사용 중</p><p>전체 물리 메모리 기준</p></Spec>
        <Spec icon={<WindowMark />} label="시스템" title={snapshot?.os.name || missing}><p>{snapshot?.os.version || '버전 정보 없음'}{snapshot?.os.build && ` · ${snapshot.os.build}`}</p><p>켜진 시간 {formatUptime(snapshot?.os.uptimeSeconds)}</p></Spec>
      </Card></section>
      <section className="performance-section" aria-labelledby="performance-title">
        <div className="section-heading"><h2 id="performance-title">실시간 성능</h2><span>최근 60초<span className="text-separator">·</span>1초 간격</span></div>
        <div className="chart-grid">
          <MetricChart kind="cpu" label="CPU" detail="전체 프로세서" reading={snapshot?.cpu.usage} samples={history} value={(sample) => sample.cpu} now={now} stale={stale} />
          <MetricChart kind="memory" label="메모리" detail="물리 메모리" reading={snapshot?.memory.usage} samples={history} value={(sample) => sample.memory} now={now} stale={stale} />
          <MetricChart kind="gpu" label="GPU" detail={gpu?.name || gpuMissing} toolbar={gpuSelector} reading={gpuReading} samples={history} value={(sample) => gpu ? sample.gpus[gpu.id] ?? null : null} now={now} stale={stale} />
        </div>
      </section>
      <div className="detail-grid"><StoragePanel drives={snapshot?.storage || []} info={snapshot?.sections.storage} now={now} /><DisplaysPanel displays={snapshot?.displays || []} info={snapshot?.sections.displays} now={now} /></div>
      <DevicesPanel devices={snapshot?.devices || []} info={snapshot?.sections.devices} now={now} />
      <footer className="dashboard-footer"><span><Check size={15} aria-hidden="true" />PC 정보는 이 기기에서만 처리돼요.</span><span>Kitvi {windowInfo.version}</span></footer>
      </div>
    </div></main>
  </div></AstryxProvider>;
}
function WindowMark() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M2 6h14M6 6v10" stroke="currentColor" strokeWidth="1.6" /></svg>; }
