import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Eye, Palette, RotateCcw } from 'lucide-react';
import type { KitviApi } from '../shared/contracts.ts';
import type { ThemeState } from '../shared/themes.ts';
import { themeError } from './ThemeRuntime.tsx';

export function ThemeSettings({ api, theme }: { api: KitviApi; theme: ThemeState }) {
  const [choice, setChoice] = useState(theme.previewId || theme.selectedId || '');
  const [pending, setPending] = useState(''), [error, setError] = useState('');
  const actionPending = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setChoice(theme.previewing ? theme.previewId || '' : theme.selectedId || '');
  }, [theme.previewId, theme.previewing, theme.selectedId]);
  useEffect(() => { setChoice(current => !current || theme.available.some(item => item.pluginId === current) ? current : ''); }, [theme.available]);
  const run = async (name: string, action: () => Promise<ThemeState>) => {
    if (actionPending.current) return;
    actionPending.current = true; setPending(name); setError('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(themeError(failure)); }
    finally { actionPending.current = false; if (mounted.current) setPending(''); }
  };
  const chosen = theme.available.find(item => item.pluginId === choice);
  return <section className="theme-settings" aria-labelledby="theme-settings-title"><Card className="feature-card" padding={0}>
    <div className="feature-card-heading"><div><h2 id="theme-settings-title">앱 테마</h2><p>색상, 배경, 글꼴과 PC 상태 카드 배치를 함께 바꿔요.</p></div><Palette size={21} aria-hidden="true" /></div>
    <div className="theme-settings-body">
      <div className="theme-current"><span>현재 적용</span><strong>{theme.active?.name || 'Kitvi 기본 테마'}</strong>{theme.previewing && <span className="theme-preview-label">미리보기 중</span>}</div>
      <label htmlFor="app-theme-select">사용할 테마</label>
      <select id="app-theme-select" value={choice} disabled={!!pending} onChange={event => setChoice(event.target.value)} aria-describedby="theme-select-help">
        <option value="">Kitvi 기본 테마</option>
        {theme.available.map(item => <option key={item.pluginId} value={item.pluginId}>{item.name} · {item.version}</option>)}
      </select>
      <p id="theme-select-help" className="feature-caption">플러그인 사용을 켜고 제작자·권한에 동의해 활성화한 테마가 여기에 표시돼요. 배경음은 재생 버튼을 눌러 시작해요.</p>
      {chosen && <div className="theme-details"><div className="theme-palette" aria-label="테마 색상 미리보기">{(['canvas', 'panel', 'accent', 'cpu', 'memory', 'gpu'] as const).map(key => <span key={key} title={key} style={{ backgroundColor:chosen.definition.modes.light[key] }} />)}</div><span className="feature-caption">{chosen.definition.layout ? `${chosen.definition.layout.columns}열 배치 · 카드 ${6 - chosen.definition.layout.hidden.length}개` : '기본 카드 배치'}{chosen.definition.bgm ? ` · ${chosen.definition.bgm.tracks.length}개 배경음` : ''}</span></div>}
      {!theme.available.length && <p className="theme-empty-copy">설치한 테마 플러그인을 활성화하면 미리보고 적용할 수 있어요.</p>}
      {error && <p className="theme-inline-error" role="alert">{error}</p>}
    </div>
    <div className="feature-card-actions">
      <Button label="미리보기" size="lg" icon={<Eye size={17} />} isDisabled={!!pending} isLoading={pending === 'preview'} onClick={() => void run('preview', () => api.previewTheme(choice || null))} />
      <Button label="테마 적용" variant="primary" size="lg" isDisabled={!!pending || choice === theme.selectedId && !theme.previewing || !choice && !theme.selectedId && !theme.previewing} isLoading={pending === 'apply'} onClick={() => void run('apply', () => api.applyTheme(choice || null))} />
      {theme.previewing && <Button label="미리보기 취소" size="lg" isDisabled={!!pending} isLoading={pending === 'cancel'} onClick={() => void run('cancel', () => api.cancelThemePreview())} />}
      <Button label="기본 테마로 복원" size="lg" icon={<RotateCcw size={17} />} isDisabled={!!pending || !theme.selectedId && !theme.active && !theme.previewing} isLoading={pending === 'reset'} onClick={() => void run('reset', () => api.applyTheme(null))} />
    </div>
  </Card></section>;
}
