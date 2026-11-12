import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ArrowLeft, Download, ExternalLink, FolderOpen, Info, Package, Plus, RefreshCw, RotateCw, Trash2, X } from 'lucide-react';
import type { Appearance, KitviApi } from '../shared/contracts.ts';
import type { InstalledPlugin, MediaState, PluginPermission, PluginPreview, PluginState, PluginUpdatesState, PluginUpdateStatus, UpdateState } from '../shared/features.ts';
import type { ThemeState } from '../shared/themes.ts';
import { ThemeSettings } from './ThemeSettings.tsx';

const errorMessage = (error: unknown) => error instanceof Error && error.message
  ? error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
  : '요청을 처리하지 못했어요. 다시 시도해 주세요.';
const updateFailureMessage = (error: unknown) => {
  const detail = errorMessage(error), response = /^GitHub returned HTTP (\d+)\.?$/.exec(detail);
  return response ? `GitHub 응답 ${response[1]}. 잠시 뒤 업데이트를 다시 시도해 주세요.` : `플러그인을 업데이트하지 못했어요. ${detail}`;
};
const permissionCopy: Record<PluginPermission, { name: string; description: string }> = {
  storage: { name: '설정 저장', description: '이 플러그인 전용 공간에 설정을 저장하고 읽어요.' },
  downloads: { name: '다운로드 폴더', description: '직접 선택한 폴더에 파일을 저장하고 폴더를 열어요.' },
  media: { name: '미디어 다운로드', description: '미디어 엔진을 설치하고, 주소를 분석하거나 다운로드를 실행해요.' },
  theme: { name: '앱 테마', description: '직접 선택하면 앱의 색상, 배경, 글꼴과 PC 상태 카드 배치를 바꿔요.' },
  playback: { name: '배경음 재생', description: '호스트 재생 버튼으로 패키지 배경음이나 화면에 보이는 YouTube 영상을 재생해요.' },
};
function FeatureNotice({ children, error = false, onClose }: { children: React.ReactNode; error?: boolean; onClose?: () => void }) {
  return <div className={`feature-notice ${error ? 'feature-notice-error' : ''}`} role={error ? 'alert' : 'status'}><Info size={19} aria-hidden="true" /><span>{children}</span>{onClose && <button className="icon-button" aria-label="알림 닫기" onClick={onClose}><X size={17} /></button>}</div>;
}
function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return <label className={`feature-switch ${disabled ? 'is-disabled' : ''}`}><input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /></label>;
}
function PluginPermissions({ permissions, added = [] }: { permissions: PluginPermission[]; added?: PluginPermission[] }) {
  return permissions.length ? <ul className="plugin-permission-list">{permissions.map((permission) => <li className={added.includes(permission) ? 'is-added' : undefined} key={permission}><strong>{permissionCopy[permission].name}{added.includes(permission) && <span className="plugin-permission-new">새 권한</span>}</strong><span>{permissionCopy[permission].description}</span></li>)}</ul> : <p className="feature-caption">추가 권한을 요청하지 않아요.</p>;
}
function PluginIdentity({ author, authorEmail, source }: { author: string; authorEmail?: string; source: string }) {
  return <dl className="plugin-source-details"><div><dt>제작자</dt><dd>{author}</dd></div><div><dt>연락처</dt><dd>{authorEmail || '연락처 미등록'}</dd></div><div><dt>가져온 위치</dt><dd>{source === 'local' ? '이 PC의 ZIP 파일' : source}</dd></div></dl>;
}
const publisherNotice = '제작자 이름과 연락처는 제작자가 직접 입력한 정보예요. Kitvi가 제작자의 신원이나 플러그인의 안전성을 검증한 정보가 아니에요.';
function PluginConsentDialog({ title, description, busy, onClose, children }: { title: string; description: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, trigger = document.activeElement;
    let live = true;
    const show = () => { if (live) element?.showModal(); };
    // Hide the native player before placing trusted consent above renderer content.
    const hidePlayer = window.kitvi?.setPlaybackViewport;
    if (hidePlayer) void hidePlayer({x:0,y:58,width:0,height:0,visible:false}).then(show, show); else show();
    return () => { live = false; element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="plugin-consent-dialog" aria-labelledby="plugin-consent-title" aria-describedby="plugin-consent-description" aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}><div className="plugin-consent-heading"><Info size={22} aria-hidden="true" /><h2 id="plugin-consent-title">{title}</h2></div><p id="plugin-consent-description" className="plugin-consent-description">{description}</p>{children}</dialog>;
}
type PluginDialogState = { kind: 'system-enable' | 'system-disable' } | { kind: 'plugin'; id: string; contentHash: string; action: 'activate' | 'details' };
const pluginCanRun = (state: PluginState | null, plugin: InstalledPlugin) => state?.system.enabled === true && !!state.system.acceptedAt && plugin.enabled && plugin.needsConsent === false;
const updateLabels: Record<UpdateState['phase'], string> = { idle: '업데이트 확인', checking: '새 버전 확인 중', available: '새 버전이 있어요', downloading: '업데이트 다운로드 중', downloaded: '다시 시작할 준비 완료', 'up-to-date': '최신 버전이에요', error: '업데이트 확인 필요', disabled: '직접 설치가 필요해요' };
const pluginUpdateLabels: Record<PluginUpdateStatus, string> = { idle: '업데이트를 아직 확인하지 않았어요.', checking: '새 버전을 확인하고 있어요.', current: '최신 버전이에요.', available: '새 버전으로 업데이트할 수 있어요.', unsupported: '로컬 ZIP은 새 파일을 선택해 업데이트해 주세요.', error: '새 버전을 확인하지 못했어요. 다시 확인해 주세요.' };

export function SettingsPanel({ api, theme }: { api: KitviApi; theme?: ThemeState }) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<PluginUpdatesState | null>(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [pluginPending, setPluginPending] = useState(false), [pluginError, setPluginError] = useState('');
  const mounted = useRef(false), actionPending = useRef(false), pluginActionPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = api.onUpdate((next) => { if (mounted.current) setState(next); });
    const unsubscribePluginUpdates = api.onPluginUpdates((next) => { if (mounted.current) setPluginUpdates(next); });
    void api.getUpdateState().then((next) => { if (mounted.current) setState(next); }).catch((failure: unknown) => { if (mounted.current) setError(errorMessage(failure)); });
    void api.getPluginUpdates().then((next) => { if (mounted.current) setPluginUpdates(next); }).catch((failure: unknown) => { if (mounted.current) setPluginError(errorMessage(failure)); });
    return () => { mounted.current = false; unsubscribe(); unsubscribePluginUpdates(); };
  }, [api]);
  const run = async (name: string, action: () => Promise<UpdateState | void>) => {
    if (actionPending.current) return;
    actionPending.current = true; setPending(name); setError('');
    try { const result = await action(); if (mounted.current && result) setState(result); }
    catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally { actionPending.current = false; if (mounted.current) setPending(''); }
  };
  const runPluginSettings = async (action: () => Promise<PluginUpdatesState>) => {
    if (pluginActionPending.current) return;
    pluginActionPending.current = true; setPluginPending(true); setPluginError('');
    try { const next = await action(); if (mounted.current) setPluginUpdates(next); }
    catch (failure) { if (mounted.current) setPluginError(errorMessage(failure)); }
    finally { pluginActionPending.current = false; if (mounted.current) setPluginPending(false); }
  };
  const busy = !!pending || state?.phase === 'checking' || state?.phase === 'downloading';
  const checkedAt = state?.checkedAt && Number.isFinite(Date.parse(state.checkedAt)) ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(state.checkedAt)) : '아직 확인하지 않았어요';
  return <div className="feature-page settings-page">
    <div className="page-heading"><div><div className="page-title"><h1>설정</h1></div><p>앱 모양과 업데이트를 관리해요.</p></div></div>
    {theme && <ThemeSettings api={api} theme={theme} />}
    {error && <FeatureNotice error onClose={() => setError('')}>{error}</FeatureNotice>}
    <section aria-labelledby="update-settings-title"><Card className="feature-card" padding={0}>
      <div className="feature-card-heading"><div><h2 id="update-settings-title">앱 업데이트</h2><p>GitHub Releases에 공개된 Preview 버전까지 확인해요.</p></div><span className="feature-version">{state ? `현재 버전 ${state.currentVersion}` : '버전 확인 중'}</span></div>
      <div className="feature-setting-row"><div><h3 id="auto-check-label">시작할 때 새 버전 확인</h3><p id="auto-check-description">새 버전을 알려드려요. 다운로드와 다시 시작은 직접 선택해요.</p></div><Toggle label="시작할 때 새 버전 확인" checked={state?.autoCheck ?? true} disabled={!state || !!pending} onChange={(value) => void run('auto', () => api.setAutoCheck(value))} /></div>
      <div className="update-status" aria-live="polite" aria-atomic="true"><div className="update-status-heading"><span className={`update-indicator phase-${state?.phase || 'idle'}`} aria-hidden="true" /><h3>{state ? updateLabels[state.phase] : error ? '업데이트 상태를 불러오지 못했어요' : '업데이트 상태를 준비하고 있어요'}</h3>{state?.availableVersion && <span className="feature-version">{state.availableVersion}</span>}</div>
        <p>{state?.message || (state ? '새 버전이 있는지 지금 확인할 수 있어요.' : '잠시만 기다려 주세요.')}</p>
        {state?.phase === 'downloading' && <div className="update-progress"><progress max={100} value={state.progress ?? undefined} aria-label="업데이트 다운로드 진행률" /><span>{state.progress == null ? '다운로드 중' : `${Math.round(state.progress)}%`}</span></div>}
        <span className="feature-caption">최근 확인 · {checkedAt}</span>
      </div>
      <div className="feature-card-actions">
        {!state ? <Button label="다시 불러오기" size="lg" icon={<RefreshCw size={17} />} isLoading={pending === 'reload'} onClick={() => void run('reload', () => api.getUpdateState())} /> : <>
          <Button label="새 버전 확인" size="lg" icon={<RefreshCw size={17} />} isDisabled={busy || state.phase === 'disabled' || state.phase === 'downloaded'} isLoading={pending === 'check' || state.phase === 'checking'} onClick={() => void run('check', () => api.checkUpdates())} />
          {state.canInstall && state.availableVersion && ['available', 'error'].includes(state.phase) && <Button label="업데이트 다운로드" variant="primary" size="lg" icon={<Download size={17} />} isDisabled={busy} isLoading={pending === 'download'} onClick={() => void run('download', () => api.downloadUpdate())} />}
          {state.canInstall && state.phase === 'downloaded' && <Button label="다시 시작하여 설치" variant="primary" size="lg" icon={<RotateCw size={17} />} isDisabled={!!pending} isLoading={pending === 'install'} onClick={() => void run('install', () => api.installUpdate())} />}
        </>}
        <Button label="GitHub Releases 열기" size="lg" icon={<ExternalLink size={17} />} isDisabled={!!pending} onClick={() => void run('release', () => api.openReleasePage())} />
      </div>
    </Card></section>
    <p className="feature-footnote">포터블 ZIP과 기존 0.3.0 사용자는 설치 파일로 한 번 전환하면 이후 앱에서 업데이트할 수 있어요.</p>
    <section className="plugin-update-settings" aria-labelledby="plugin-update-settings-title"><Card className="feature-card" padding={0}>
      <div className="feature-card-heading"><div><h2 id="plugin-update-settings-title">플러그인 업데이트</h2><p>설치한 GitHub 플러그인의 새 버전을 알려드려요.</p></div></div>
      <div className="feature-setting-row"><div><h3>플러그인 업데이트 자동 확인</h3><p>플러그인 사용이 켜져 있을 때 앱 시작 시와 6시간마다 확인해요. 업데이트 적용은 플러그인 목록에서 직접 선택해요.</p></div><Toggle label="플러그인 업데이트 자동 확인" checked={pluginUpdates?.autoCheck ?? true} disabled={!pluginUpdates || pluginPending} onChange={(value) => void runPluginSettings(() => api.setPluginAutoCheck(value))} /></div>
      {pluginError && <div className="plugin-settings-feedback"><FeatureNotice error onClose={() => setPluginError('')}>{pluginError}</FeatureNotice><Button label="다시 불러오기" size="lg" icon={<RefreshCw size={17} />} isDisabled={pluginPending} isLoading={pluginPending} onClick={() => void runPluginSettings(() => api.getPluginUpdates())} /></div>}
      {pluginUpdates?.checking && <p className="plugin-settings-status feature-caption" role="status">설치한 플러그인의 새 버전을 확인하고 있어요.</p>}
    </Card></section>
  </div>;
}

export function PluginsPanel({ api, appearance, onThemeSettings }: { api: KitviApi; appearance: Appearance; onThemeSettings?: () => void }) {
  const [state, setState] = useState<PluginState | null>(null);
  const [updates, setUpdates] = useState<PluginUpdatesState | null>(null);
  const [repository, setRepository] = useState('popop098/kitvi-YT-downloader');
  const [preview, setPreview] = useState<PluginPreview | null>(null);
  const [pending, setPending] = useState(''), [error, setError] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false), [updatesError, setUpdatesError] = useState('');
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({}), [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(''), [removeId, setRemoveId] = useState('');
  const [dialog, setDialog] = useState<PluginDialogState | null>(null);
  const mounted = useRef(false), actionPending = useRef(false), checkPending = useRef(false);
  const latestState = useRef<PluginState | null>(null), stateRevision = useRef(0);
  const previewPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    const receive = (next: PluginState) => {
      if (!mounted.current) return;
      stateRevision.current++; latestState.current = next; setState(next);
      setSelectedId((id) => next.plugins.some((plugin) => plugin.id === id && pluginCanRun(next, plugin)) ? id : '');
    };
    const unsubscribe = api.onPlugins(receive);
    const unsubscribeUpdates = api.onPluginUpdates((next) => { if (mounted.current) setUpdates(next); });
    const initialRevision = stateRevision.current;
    void api.getPlugins().then((next) => { if (mounted.current && stateRevision.current === initialRevision) receive(next); }).catch((failure: unknown) => { if (mounted.current && stateRevision.current === initialRevision) setError(errorMessage(failure)); });
    void api.getPluginUpdates().then((next) => { if (mounted.current) setUpdates(next); }).catch((failure: unknown) => { if (mounted.current) setUpdatesError(errorMessage(failure)); });
    return () => { mounted.current = false; latestState.current = null; unsubscribe(); unsubscribeUpdates(); };
  }, [api]);
  useEffect(() => { if (preview) previewPanel.current?.focus(); }, [preview?.token]);
  useEffect(() => {
    if (dialog?.kind === 'plugin' && state && !state.plugins.some((plugin) => plugin.id === dialog.id && plugin.contentHash === dialog.contentHash)) {
      setDialog(null); setNotice('플러그인 정보가 바뀌었어요. 제작자와 권한을 다시 확인해 주세요.');
    }
  }, [state, dialog]);
  const run = async (name: string, action: (commit: (next: PluginState) => void) => Promise<void>) => {
    if (actionPending.current) return;
    actionPending.current = true; setPending(name); setError(''); setNotice('');
    const revision = stateRevision.current;
    const commit = (next: PluginState) => { if (mounted.current && revision === stateRevision.current) { latestState.current = next; setState(next); } };
    try { await action(commit); } catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally { actionPending.current = false; if (mounted.current) setPending(''); }
  };
  const checkUpdates = async () => {
    if (checkPending.current) return;
    checkPending.current = true; setCheckingUpdates(true); setUpdatesError(''); setUpdateErrors({});
    try { const next = await api.checkPluginUpdates(); if (mounted.current) setUpdates(next); }
    catch (failure) { if (mounted.current) setUpdatesError(errorMessage(failure)); }
    finally { checkPending.current = false; if (mounted.current) setCheckingUpdates(false); }
  };
  const applyUpdate = (plugin: InstalledPlugin) => run(`update:${plugin.id}`, async (commit) => {
    setUpdateErrors((previous) => { const next = { ...previous }; delete next[plugin.id]; return next; });
    try {
      const result = await api.applyPluginUpdate(plugin.id);
      if (!mounted.current) return;
      if (result.kind === 'review') setPreview(result.preview);
      else {
        commit(result.state); setPreview(null);
        const updated = result.state.plugins.find((installed) => installed.id === plugin.id);
        setNotice(`${plugin.name} 플러그인을 ${updated?.version ?? plugin.version} 버전으로 업데이트했어요.`);
      }
    } catch (failure) { if (mounted.current) setUpdateErrors((previous) => ({ ...previous, [plugin.id]: updateFailureMessage(failure) })); }
  });
  const busy = !!pending || state?.busy === true;
  const updateCheckBusy = checkingUpdates || updates?.checking === true;
  const systemEnabled = state?.system.enabled === true;
  const selected = state?.plugins.find((plugin) => plugin.id === selectedId && pluginCanRun(state, plugin));
  const consentPlugin = dialog?.kind === 'plugin' ? state?.plugins.find((plugin) => plugin.id === dialog.id && plugin.contentHash === dialog.contentHash) : undefined;
  const previewInstalled = state?.plugins.find((plugin) => plugin.id === preview?.manifest.id);
  const addedPermissions = preview?.permissions.filter((permission) => previewInstalled && !previewInstalled.permissions.includes(permission)) ?? [];
  const previewRepository = () => run('preview', async () => {
    const source = repository.trim();
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source) || source.length > 160) throw new Error('GitHub 저장소를 소유자/저장소 형식으로 입력해 주세요.');
    const next = await api.previewPlugin(source); if (mounted.current) setPreview(next);
  });
  const changeSystemEnabled = (enabled: boolean) => {
    if (!state || busy) return;
    if (!enabled) setDialog({ kind: 'system-disable' });
    else if (!state.system.acceptedAt) setDialog({ kind: 'system-enable' });
    else void run('system', async (commit) => { commit(await api.setPluginSystemEnabled(true)); });
  };
  const changePluginEnabled = (plugin: InstalledPlugin, enabled: boolean) => {
    if (!systemEnabled || busy) return;
    if (enabled && plugin.needsConsent) setDialog({ kind: 'plugin', id: plugin.id, contentHash: plugin.contentHash, action: 'activate' });
    else void run(`toggle:${plugin.id}`, async (commit) => { commit(await api.setPluginEnabled(plugin.id, enabled)); });
  };
  const systemControl = <section className="plugin-system-settings" aria-labelledby="plugin-system-title"><Card className="feature-card" padding={0}><div className="feature-setting-row"><div><h2 id="plugin-system-title">플러그인 사용</h2><p>{systemEnabled ? '동의하고 활성화한 플러그인만 실행할 수 있어요.' : '현재 꺼져 있어요. 플러그인을 가져오고 정보를 확인할 수 있어요.'}</p></div><Toggle label="플러그인 사용" checked={systemEnabled} disabled={!state || busy} onChange={changeSystemEnabled} /></div></Card></section>;
  return <>{selected ? <div className="feature-page plugin-workspace"><div className="plugin-workspace-heading"><Button label="플러그인 목록" size="lg" icon={<ArrowLeft size={17} />} onClick={() => setSelectedId('')} /><div className="plugin-workspace-title"><h1>{selected.name}</h1><span>{selected.version} · {selected.author}</span></div></div>{systemControl}{selected.entry ? <PluginFrame key={`${selected.id}:${selected.contentHash}`} api={api} appearance={appearance} plugin={selected} runtimeState={latestState} /> : <FeatureNotice>이 테마는 별도 화면 없이 앱에 적용돼요.{onThemeSettings && <Button label="테마 설정" size="lg" onClick={onThemeSettings} />}</FeatureNotice>}</div> : <div className="feature-page plugins-page">
    <div className="page-heading"><div><div className="page-title"><h1>플러그인</h1></div><p>필요한 기능을 추가하고 관리해요.</p></div><div className="plugin-page-actions"><span className="feature-caption">{state ? `${state.plugins.length}개 설치됨` : '목록을 불러오는 중'}</span><Button label="업데이트 확인" size="lg" icon={<RefreshCw size={17} />} isDisabled={busy || updateCheckBusy || !state || !systemEnabled} isLoading={updateCheckBusy} onClick={() => void checkUpdates()} /></div></div>
    {error && <FeatureNotice error onClose={() => setError('')}>{error}</FeatureNotice>}
    {updatesError && <FeatureNotice error onClose={() => setUpdatesError('')}>플러그인 업데이트를 확인하지 못했어요. {updatesError}</FeatureNotice>}
    {(notice || state?.message) && !error && <FeatureNotice>{notice || state?.message}</FeatureNotice>}
    {systemControl}
    <section aria-labelledby="add-plugin-title"><Card className="feature-card plugin-add-card" padding={0}>
      <div className="feature-card-heading"><div><h2 id="add-plugin-title">플러그인 추가</h2><p>GitHub 저장소 또는 이 PC의 ZIP 파일에서 가져와요.</p></div><Plus size={21} aria-hidden="true" /></div>
      <form className="plugin-source-form" onSubmit={(event) => { event.preventDefault(); void previewRepository(); }}><label htmlFor="plugin-repository">GitHub 저장소</label><div className="plugin-source-controls"><input id="plugin-repository" value={repository} onChange={(event) => setRepository(event.target.value)} maxLength={160} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="소유자/저장소" disabled={busy} aria-describedby="plugin-repository-help" /><Button label="가져오기" type="submit" size="lg" isDisabled={busy || !repository.trim()} isLoading={pending === 'preview'} /><Button label="ZIP 파일 선택" size="lg" icon={<FolderOpen size={17} />} isDisabled={busy} isLoading={pending === 'local'} onClick={() => void run('local', async () => { const next = await api.previewLocalPlugin(); if (mounted.current && next) setPreview(next); })} /></div><p id="plugin-repository-help">예제: popop098/kitvi-YT-downloader. 가져온 뒤 권한을 확인하고 설치해요.</p></form>
      {preview && <div ref={previewPanel} className="plugin-preview" role="region" aria-labelledby="plugin-preview-title" tabIndex={-1}>
        <div className="plugin-preview-heading"><Info size={21} aria-hidden="true" /><div><h3 id="plugin-preview-title">{preview.manifest.name} {previewInstalled ? '업데이트' : '설치'} 전 확인</h3><p>{previewInstalled && <>{previewInstalled.version} → </>}{preview.manifest.version}</p></div></div>
        <p className="plugin-description">{preview.manifest.description}</p>
        <PluginIdentity author={preview.manifest.author} authorEmail={preview.manifest.authorEmail} source={preview.source} />
        <p className="feature-caption">최소 Kitvi 버전 · {preview.manifest.minKitviVersion}</p>
        <h4>요청하는 권한</h4>
        {addedPermissions.length > 0 && <p className="plugin-added-permissions-copy">이 업데이트에서 추가된 권한을 확인해 주세요.</p>}
        <PluginPermissions permissions={preview.permissions} added={addedPermissions} />
        <p className="plugin-trust-copy">{publisherNotice}</p>
        <p className="plugin-install-copy">{previewInstalled ? '제작자·연락처·권한이 바뀌거나 로컬 ZIP 파일을 교체하면 활성화 전에 다시 동의해야 해요.' : '설치 후 제작자와 권한에 동의하고 활성화해야 실행돼요.'}{!systemEnabled && ' 먼저 플러그인 사용을 켜 주세요.'}</p>
        <div className="feature-inline-actions"><Button label={previewInstalled ? '권한 확인 후 업데이트' : '확인하고 설치'} variant="primary" size="lg" icon={<Download size={17} />} isDisabled={busy} isLoading={pending === 'install'} onClick={() => void run('install', async (commit) => { const next = await api.confirmPlugin(preview.token); if (mounted.current) { commit(next); setPreview(null); setNotice(previewInstalled ? `${preview.manifest.name} 플러그인을 ${preview.manifest.version} 버전으로 업데이트했어요.` : `${preview.manifest.name} 플러그인을 설치했어요. 제작자와 권한에 동의하고 활성화해 주세요.`); } })} /><Button label="취소" size="lg" isDisabled={busy} onClick={() => setPreview(null)} /></div>
      </div>}
    </Card></section>
    <section className="installed-plugins" aria-labelledby="installed-plugin-title"><div className="section-heading"><h2 id="installed-plugin-title">설치한 플러그인</h2></div>
      {!state ? <Card className="feature-empty" padding={0}><p>{error ? '플러그인 목록을 불러오지 못했어요.' : '설치한 플러그인을 확인하고 있어요.'}</p>{error && <Button label="다시 불러오기" size="lg" onClick={() => void run('reload', async (commit) => { commit(await api.getPlugins()); })} />}</Card> : !state.plugins.length ? <Card className="feature-empty" padding={0}><Package size={28} strokeWidth={1.4} aria-hidden="true" /><h3>아직 설치한 플러그인이 없어요</h3><p>위에서 예제 저장소를 가져오거나 ZIP 파일을 선택해 보세요.</p></Card> : <div className="plugin-list">{state.plugins.map((plugin) => {
        const info = updates?.plugins.find((update) => update.id === plugin.id);
        const updateStatus = info?.status ?? (plugin.source === 'local' ? 'unsupported' : updateCheckBusy ? 'checking' : 'idle');
        const availableVersion = info?.currentVersion === plugin.version && info.availableVersion !== plugin.version ? info.availableVersion : null;
        const canUpdate = !!availableVersion && (updateStatus === 'available' || updateStatus === 'error');
        const applying = pending === `update:${plugin.id}`;
        const updateError = updateErrors[plugin.id];
        return <Card className="installed-plugin" padding={0} key={plugin.id}>
          <div className="installed-plugin-summary"><span className="plugin-glyph" aria-hidden="true"><Package size={23} strokeWidth={1.5} /></span><div><div className="installed-plugin-title"><h3>{plugin.name}</h3><span>{plugin.version}</span></div><p>{plugin.description}</p><span className="plugin-activation-status">{plugin.needsConsent ? '활성화 전 동의 필요' : !systemEnabled ? '플러그인 사용 꺼짐' : plugin.enabled ? '사용 중' : '사용 안 함'}</span><PluginIdentity author={plugin.author} authorEmail={plugin.authorEmail} source={plugin.source} /></div><Toggle checked={!plugin.needsConsent && plugin.enabled} disabled={busy || !systemEnabled} label={`${plugin.name} 사용`} onChange={(enabled) => changePluginEnabled(plugin, enabled)} /></div>
          <div className={`installed-plugin-update ${updateError || updateStatus === 'error' ? 'has-error' : ''}`}>
            <div className="plugin-update-summary" aria-live="polite" aria-atomic="true"><div className="plugin-update-versions"><span>현재 {plugin.version}</span>{availableVersion && <><span aria-hidden="true">→</span><strong>새 버전 {availableVersion}</strong></>}</div><p>{!systemEnabled ? '플러그인 사용을 켜면 새 버전을 확인하고 업데이트할 수 있어요.' : applying ? '새 버전을 내려받고 적용하고 있어요.' : updateError || info?.message || pluginUpdateLabels[updateStatus]}</p></div>
            {(canUpdate || applying) ? <Button label={updateError ? '업데이트 다시 시도' : '업데이트'} variant="primary" size="lg" icon={<Download size={17} />} isDisabled={busy || !systemEnabled || updateStatus === 'checking'} isLoading={applying} onClick={() => void applyUpdate(plugin)} /> : (updateStatus === 'error' || updateError) && <Button label="다시 확인" size="lg" icon={<RefreshCw size={17} />} isDisabled={busy || !systemEnabled || updateCheckBusy} isLoading={updateCheckBusy} onClick={() => void checkUpdates()} />}
          </div>
          <div className="installed-plugin-actions"><div className="plugin-permission-summary"><span className="feature-caption">{plugin.permissions.map((permission) => permissionCopy[permission].name).join(' · ') || '추가 권한 없음'}</span><Button label="제작자·권한 확인" size="lg" icon={<Info size={16} />} isDisabled={busy} onClick={() => setDialog({ kind: 'plugin', id: plugin.id, contentHash: plugin.contentHash, action: 'details' })} /></div>{removeId === plugin.id ? <div className="feature-inline-actions"><span>이 플러그인을 삭제할까요?</span><Button label="삭제" className="feature-danger-button" size="lg" isDisabled={busy} isLoading={pending === `remove:${plugin.id}`} onClick={() => void run(`remove:${plugin.id}`, async (commit) => { const next = await api.removePlugin(plugin.id); if (mounted.current) { commit(next); setRemoveId(''); } })} /><Button label="취소" size="lg" isDisabled={busy} onClick={() => setRemoveId('')} /></div> : <div className="feature-inline-actions">{plugin.apiVersion === 2 && plugin.kind === 'theme' && onThemeSettings && <Button label="테마 설정" size="lg" isDisabled={busy || !pluginCanRun(state, plugin)} onClick={onThemeSettings} />}{plugin.entry && <Button label={plugin.apiVersion === 2 && plugin.kind === 'theme' ? '설정 화면 열기' : '열기'} size="lg" isDisabled={busy || !pluginCanRun(state, plugin)} onClick={() => setSelectedId(plugin.id)} />}<Button label="삭제" size="lg" icon={<Trash2 size={16} />} isDisabled={busy} onClick={() => setRemoveId(plugin.id)} /></div>}</div>
        </Card>;
      })}</div>}
    </section>
  </div>}
    {dialog?.kind === 'system-enable' && <PluginConsentDialog title="플러그인 사용 전 확인" description="플러그인은 외부 개발자가 작성한 코드를 실행해요." busy={busy} onClose={() => setDialog(null)}><p className="plugin-consent-copy">활성화한 플러그인은 허용한 권한으로 설정을 저장하거나, 파일·미디어 기능을 사용할 수 있어요. 개별 플러그인의 제작자, 가져온 위치와 권한을 확인한 뒤 활성화해 주세요.</p><p className="plugin-trust-copy">{publisherNotice}</p>{error && <FeatureNotice error>{error}</FeatureNotice>}<div className="plugin-consent-actions"><Button label="취소" size="lg" isDisabled={busy} onClick={() => setDialog(null)} /><Button label="확인하고 플러그인 사용" variant="primary" size="lg" isDisabled={busy} isLoading={pending === 'system'} onClick={() => void run('system', async (commit) => { commit(await api.setPluginSystemEnabled(true, true)); if (mounted.current) setDialog(null); })} /></div></PluginConsentDialog>}
    {dialog?.kind === 'system-disable' && <PluginConsentDialog title="플러그인 사용을 끌까요?" description="열린 플러그인 화면이 닫히고 진행 중인 플러그인 작업이 중단돼요." busy={busy} onClose={() => setDialog(null)}>{error && <FeatureNotice error>{error}</FeatureNotice>}<div className="plugin-consent-actions"><Button label="취소" size="lg" isDisabled={busy} onClick={() => setDialog(null)} /><Button label="플러그인 사용 끄기" className="feature-danger-button" size="lg" isDisabled={busy} isLoading={pending === 'system'} onClick={() => void run('system', async (commit) => { commit(await api.setPluginSystemEnabled(false)); if (mounted.current) { setSelectedId(''); setDialog(null); } })} /></div></PluginConsentDialog>}
    {dialog?.kind === 'plugin' && consentPlugin && <PluginConsentDialog key={`${consentPlugin.id}:${consentPlugin.contentHash}`} title={`${consentPlugin.name} ${dialog.action === 'activate' ? '활성화 전 확인' : '제작자와 권한'}`} description="이 플러그인은 외부 개발자가 작성한 코드를 실행해요. 제작자와 가져온 위치, 허용할 권한을 확인해 주세요." busy={busy} onClose={() => setDialog(null)}><PluginIdentity author={consentPlugin.author} authorEmail={consentPlugin.authorEmail} source={consentPlugin.source} /><h3>허용하는 권한</h3><PluginPermissions permissions={consentPlugin.permissions} /><p className="plugin-trust-copy">{publisherNotice}</p>{!systemEnabled && <p className="plugin-install-copy">활성화하려면 먼저 플러그인 사용을 켜 주세요.</p>}{error && <FeatureNotice error>{error}</FeatureNotice>}<div className="plugin-consent-actions"><Button label={consentPlugin.needsConsent ? '취소' : '닫기'} size="lg" isDisabled={busy} onClick={() => setDialog(null)} />{consentPlugin.needsConsent && <Button label="동의하고 활성화" variant="primary" size="lg" isDisabled={busy || !systemEnabled} isLoading={pending === `accept:${consentPlugin.id}`} onClick={() => void run(`accept:${consentPlugin.id}`, async (commit) => { commit(await api.acceptPlugin(consentPlugin.id, consentPlugin.contentHash)); if (mounted.current) { setDialog(null); setNotice(`${consentPlugin.name} 플러그인을 활성화했어요.`); } })} />}</div></PluginConsentDialog>}
  </>;
}

const bridgeMethods = new Set(['storage.get', 'storage.set', 'downloads.chooseFolder', 'downloads.openFolder', 'media.status', 'media.installEngine', 'media.analyze', 'media.start', 'media.cancel', 'theme.getState', 'playback.getState', 'playback.pause', 'playback.setVolume', 'playback.requestTrack']);
function PluginFrame({ api, appearance, plugin, runtimeState }: { api: KitviApi; appearance: Appearance; plugin: InstalledPlugin; runtimeState: React.RefObject<PluginState | null> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latestAppearance = useRef(appearance);
  const sendState = useRef<() => void>(() => {});
  const loadCount = useRef(0), bridgeRevoked = useRef(false);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [revoked, setRevoked] = useState(false);
  useEffect(() => { latestAppearance.current = appearance; sendState.current(); }, [appearance]);
  useEffect(() => {
    let active = true, media: MediaState | null = null, refreshing = false, refreshAgain = false;
    let windowStart = Date.now(), requestCount = 0;
    const inFlight = new Set<string>();
    const allowed = () => {
      const current = runtimeState.current, installed = current?.plugins.find((item) => item.id === plugin.id);
      return active && !bridgeRevoked.current && !!installed && installed.contentHash === plugin.contentHash && pluginCanRun(current, installed);
    };
    const postState = () => {
      if (allowed() && media) frame.current?.contentWindow?.postMessage({ type: 'kitvi:state', state: { appearance: latestAppearance.current, media, plugin: { id: plugin.id, name: plugin.name, version: plugin.version } } }, '*');
    };
    sendState.current = postState;
    const refreshMedia = async () => {
      if (!allowed()) return;
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      try {
        // Never forward the broad host event: it can contain other plugins' jobs/folders.
        const next = await api.getPluginMedia(plugin.id);
        if (allowed()) { media = { ...next, jobs: next.jobs.filter((job) => job.pluginId === plugin.id) }; postState(); }
      } catch (failure) { if (allowed()) setError(errorMessage(failure)); }
      finally { refreshing = false; if (allowed() && refreshAgain) { refreshAgain = false; void refreshMedia(); } }
    };
    const handshakeTimeout = window.setTimeout(() => { if (allowed()) setError('플러그인 연결이 늦어지고 있어요. 목록으로 돌아간 뒤 다시 열어 주세요.'); }, 10000);
    const receive = (event: MessageEvent<unknown>) => {
      const source = frame.current?.contentWindow;
      if (!allowed() || !source || event.source !== source || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return;
      const packet = event.data as Record<string, unknown>;
      try { if (JSON.stringify(packet).length > 32768) return; } catch { return; }
      if (packet.type === 'kitvi:hello') { window.clearTimeout(handshakeTimeout); setReady(true); setError(''); postState(); if (!media) void refreshMedia(); return; }
      if (packet.type !== 'kitvi:request' || typeof packet.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,80}$/.test(packet.requestId) || typeof packet.method !== 'string' || packet.method.length > 64) return;
      const requestId = packet.requestId, method = packet.method;
      const reply = (payload: Record<string, unknown>) => { if (allowed() && frame.current?.contentWindow === source) source.postMessage({ type: 'kitvi:response', requestId, ...payload }, '*'); };
      if (!bridgeMethods.has(method)) { reply({ ok: false, error: '지원하지 않는 플러그인 요청이에요.' }); return; }
      if (Date.now() - windowStart >= 5000) { windowStart = Date.now(); requestCount = 0; }
      if (++requestCount > 80 || inFlight.size >= 8 || inFlight.has(requestId)) { reply({ ok: false, error: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.' }); return; }
      inFlight.add(requestId);
      void (async () => {
        try {
          // Bind the id to this selected, enabled iframe; never accept one from a packet.
          const result = await api.invokePlugin(plugin.id, method, packet.params);
          reply({ ok: true, result });
          if (method.startsWith('media.') || method === 'downloads.chooseFolder') void refreshMedia();
        } catch (failure) { reply({ ok: false, error: errorMessage(failure) }); }
        finally { inFlight.delete(requestId); }
      })();
    };
    window.addEventListener('message', receive);
    const unsubscribe = api.onMedia(() => { void refreshMedia(); });
    void refreshMedia();
    return () => { active = false; sendState.current = () => {}; window.clearTimeout(handshakeTimeout); window.removeEventListener('message', receive); unsubscribe(); };
  }, [api, plugin.id, plugin.name, plugin.version, plugin.contentHash, runtimeState]);
  const entry = (plugin.entry || '').split('/').map(encodeURIComponent).join('/');
  const loaded = () => {
    if (++loadCount.current > 1) {
      // A WindowProxy survives navigation, including CSP error documents. Revoke
      // synchronously before React removes the frame so no further RPC can pass.
      bridgeRevoked.current = true;
      sendState.current = () => {};
      setRevoked(true); setReady(false);
      setError('플러그인이 다른 화면으로 이동하여 연결을 종료했어요. 플러그인 목록으로 돌아가 다시 열어 주세요.');
      return;
    }
    sendState.current();
  };
  return <div className="plugin-frame-shell">{error && <FeatureNotice error>{error}</FeatureNotice>}{!ready && !error && <p className="plugin-connection-status" role="status">플러그인을 연결하고 있어요.</p>}{!revoked && <iframe ref={frame} className="plugin-frame" title={`${plugin.name} 플러그인`} src={`kitvi-plugin://${encodeURIComponent(plugin.id)}/${entry}`} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={loaded} onError={() => { if (!bridgeRevoked.current) setError('플러그인 화면을 열지 못했어요. 다시 열어 주세요.'); }} />}</div>;
}
