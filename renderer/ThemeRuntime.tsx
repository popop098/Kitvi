import React, { useEffect, useRef, useState } from 'react';
import type { Appearance, KitviApi } from '../shared/contracts.ts';
import type { ThemeState } from '../shared/themes.ts';
import { themeAssetUrl, themeFontFamily, themeStyle } from './theme-runtime.ts';
import './themes.css';

export const emptyThemeState: ThemeState = { selectedId:null, previewId:null, previewing:false, active:null, available:[], message:null };
export const themeError = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '') : '테마 요청을 처리하지 못했어요.';

export function useThemeState(api: KitviApi) {
  const [theme, setTheme] = useState<ThemeState>(emptyThemeState), [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    if (!api?.getThemeState) return;
    let live = true;
    const receive = (next: ThemeState) => { if (live) { revision.current++; setTheme(next); setError(''); } };
    const unsubscribe = api.onTheme(receive), initialRevision = revision.current;
    void api.getThemeState().then(next => { if (live && revision.current === initialRevision) setTheme(next); }).catch(error => { if (live) setError(themeError(error)); });
    return () => { live = false; unsubscribe(); };
  }, [api]);
  return { theme, setTheme, themeError:error };
}

/** Keep custom variables inside Astryx's provider so they win over its neutral scope. */
export function ThemeRuntime({ appearance, theme, className, children }: { appearance: Appearance; theme: ThemeState; className: string; children: React.ReactNode }) {
  const [fontError, setFontError] = useState('');
  const entry = theme.active;
  useEffect(() => {
    setFontError('');
    if (!entry || entry.definition.typography?.fontFamily !== 'custom' || !entry.definition.typography.fontAsset) return;
    let live = true;
    const font = new FontFace(themeFontFamily(entry), `url("${themeAssetUrl(entry, entry.definition.typography.fontAsset)}")`);
    void font.load().then(loaded => { if (live) document.fonts.add(loaded); }).catch(() => { if (live) setFontError('테마 글꼴을 불러오지 못해 기본 글꼴로 표시해요.'); });
    return () => { live = false; document.fonts.delete(font); };
  }, [entry?.pluginId, entry?.contentHash, entry?.definition.typography?.fontAsset]);
  return <div className={className} data-custom-theme={entry?.pluginId} style={themeStyle(entry, appearance) as React.CSSProperties}>
    {children}
    {fontError && <div className="theme-font-notice" role="status">{fontError}</div>}
  </div>;
}
