import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Music2, Pause, Play, Volume2, Youtube } from 'lucide-react';
import type { KitviApi } from '../shared/contracts.ts';
import type { PlaybackState, PlaybackViewport } from '../shared/playback.ts';
import type { ThemeCatalogEntry } from '../shared/themes.ts';
import { themeError } from './ThemeRuntime.tsx';
import { viewportWithinClips, type ViewportRect } from './theme-runtime.ts';

const emptyPlayback: PlaybackState = { themeId:null, trackId:null, requestedTrackId:null, provider:null, phase:'idle', volume:50, loop:false, position:0, duration:null, error:null, generation:0, assetUrl:null };
const phaseLabels: Record<PlaybackState['phase'], string> = { idle:'재생할 배경음을 선택해 주세요.',loading:'배경음을 준비하고 있어요.',playing:'재생 중',paused:'일시 정지',error:'재생 확인 필요' };
const time = (seconds: number | null) => seconds == null || !Number.isFinite(seconds) ? '—' : `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export function usePlaybackState(api: KitviApi) {
  const [state, setState] = useState(emptyPlayback), [error, setError] = useState('');
  useEffect(() => {
    if (!api?.getPlaybackState) return;
    let live = true, revision = 0;
    const unsubscribe = api.onPlayback(next => { if (live) { revision++; setState(next); setError(''); } });
    const initialRevision = revision;
    void api.getPlaybackState().then(next => { if (live && revision === initialRevision) setState(next); }).catch(error => { if (live) setError(themeError(error)); });
    return () => { live = false; unsubscribe(); };
  }, [api]);
  return { playback:state, playbackError:error };
}

/** The transport stays mounted above page navigation and card layout changes. */
export function LocalThemeAudio({ api, state }: { api: KitviApi; state: PlaybackState }) {
  const audio = useRef<HTMLAudioElement>(null), latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.pause(); element.removeAttribute('src'); element.load();
    if (state.provider !== 'asset' || !state.assetUrl) return;
    const generation = state.generation, startPosition = state.position;
    let lastPositionReport = -1;
    const report = (phase: PlaybackState['phase'], error?: string) => {
      if (latest.current.generation !== generation) return;
      void api.reportLocalPlayback({ generation, phase, position:Number.isFinite(element.currentTime) ? element.currentTime : 0, duration:Number.isFinite(element.duration) ? element.duration : null, ...(error ? { error } : {}) }).catch(() => {});
    };
    const loaded = () => { if (startPosition > 0 && Number.isFinite(element.duration)) element.currentTime = Math.min(startPosition, element.duration); };
    const playing = () => report('playing'), paused = () => { if (!element.ended) report('paused'); }, ended = () => report('idle');
    const failed = () => report('error', '이 배경음을 재생하지 못했어요. 다른 곡을 선택하거나 다시 시도해 주세요.');
    const progress = () => { const second = Math.floor(element.currentTime); if (second !== lastPositionReport) { lastPositionReport = second; report(element.paused ? element.ended ? 'idle' : 'paused' : 'playing'); } };
    element.addEventListener('loadedmetadata', loaded); element.addEventListener('playing', playing); element.addEventListener('pause', paused); element.addEventListener('ended', ended); element.addEventListener('error', failed); element.addEventListener('timeupdate', progress);
    element.src = state.assetUrl; element.volume = state.volume / 100; element.loop = state.loop;
    return () => {
      element.removeEventListener('loadedmetadata', loaded); element.removeEventListener('playing', playing); element.removeEventListener('pause', paused); element.removeEventListener('ended', ended); element.removeEventListener('error', failed); element.removeEventListener('timeupdate', progress);
      element.pause(); element.removeAttribute('src'); element.load();
    };
  }, [api, state.generation, state.assetUrl, state.provider]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = state.volume / 100; element.loop = state.loop;
    if (state.provider !== 'asset') return;
    if (state.phase === 'loading') {
      const generation = state.generation;
      void element.play().catch(() => { if (latest.current.generation === generation) void api.reportLocalPlayback({ generation, phase:'error',position:element.currentTime || 0,duration:Number.isFinite(element.duration) ? element.duration : null,error:'배경음 재생을 시작하지 못했어요. 재생 버튼을 다시 눌러 주세요.' }).catch(() => {}); });
    } else if (state.phase !== 'playing') element.pause();
  }, [api, state.phase, state.volume, state.loop, state.provider, state.generation]);
  return <audio ref={audio} preload="metadata" aria-hidden="true" />;
}

function useYouTubeViewport(api: KitviApi, slot: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !slot.current) {
      void api.setPlaybackViewport({ x:0,y:58,width:0,height:0,visible:false }).catch(() => {});
      return;
    }
    const element = slot.current;
    let scheduled = 0, last = '';
    const measure = () => {
      scheduled = 0;
      const bounds = element.getBoundingClientRect();
      const rect: ViewportRect = { x:Math.ceil(bounds.x),y:Math.ceil(bounds.y),width:Math.floor(bounds.width),height:Math.floor(bounds.height) };
      const clips: ViewportRect[] = [{x:0,y:58,width:innerWidth,height:innerHeight - 58}];
      let parent = element.parentElement;
      let hidden = document.visibilityState === 'hidden' || !element.checkVisibility();
      while (parent) {
        const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (css.display === 'none' || css.visibility === 'hidden') hidden = true;
        if (/(auto|scroll|hidden|clip)/.test(`${css.overflowX} ${css.overflowY}`)) clips.push({x:box.x,y:box.y,width:parent.clientWidth,height:parent.clientHeight});
        parent = parent.parentElement;
      }
      const viewport: PlaybackViewport = { ...rect,visible:!hidden && viewportWithinClips(rect, clips, !!document.querySelector('dialog[open]')) };
      const key = JSON.stringify(viewport);
      if (key !== last) { last = key; void api.setPlaybackViewport(viewport).catch(() => {}); }
    };
    const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule); resize.observe(element);
    const mutation = new MutationObserver(schedule); mutation.observe(document.body, { subtree:true,attributes:true,attributeFilter:['open','hidden','class','style'],childList:true });
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true); document.addEventListener('visibilitychange', schedule);
    measure();
    return () => { cancelAnimationFrame(scheduled); resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); document.removeEventListener('visibilitychange', schedule); void api.setPlaybackViewport({x:0,y:58,width:0,height:0,visible:false}).catch(() => {}); };
  }, [api, slot, enabled]);
}

export function BgmWidget({ api, theme, state }: { api: KitviApi; theme: ThemeCatalogEntry; state: PlaybackState }) {
  const bgm = theme.definition.bgm;
  const [trackId, setTrackId] = useState(state.trackId || bgm?.tracks[0]?.id || '');
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false), mounted = useRef(false), slot = useRef<HTMLDivElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setTrackId(state.requestedTrackId || state.trackId || bgm?.tracks[0]?.id || ''); setError(''); }, [theme.pluginId, theme.contentHash, state.requestedTrackId, state.trackId]);
  const selected = bgm?.tracks.find(track => track.id === trackId);
  const showYouTube = selected?.source.type === 'youtube' || state.provider === 'youtube' || trackId === '__youtube_url__';
  useYouTubeViewport(api, slot, !!bgm && showYouTube);
  if (!bgm) return null;
  const run = async (action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(themeError(failure)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const isCurrent = state.trackId === trackId, playing = isCurrent && ['playing','loading'].includes(state.phase);
  return <section className="bgm-section" aria-labelledby="bgm-title"><Card className="bgm-card" padding={0}>
    <div className="bgm-heading"><Music2 size={20} aria-hidden="true" /><div><h2 id="bgm-title">{bgm.title}</h2><p>배경음은 직접 재생할 때만 시작해요.</p></div></div>
    <div className="bgm-controls"><label htmlFor="theme-bgm-track">배경음 선택</label><div className="bgm-track-row"><select id="theme-bgm-track" value={trackId} disabled={busy} onChange={event => setTrackId(event.target.value)}>{bgm.tracks.map(track => <option key={track.id} value={track.id}>{track.title}{track.source.type === 'youtube' ? ' · YouTube' : ''}</option>)}{(state.trackId === '__youtube_url__' || trackId === '__youtube_url__') && <option value="__youtube_url__">직접 선택한 YouTube 영상</option>}</select><Button label={playing ? '일시 정지' : '재생'} variant="primary" size="lg" icon={playing ? <Pause size={16} /> : <Play size={16} />} isDisabled={busy || !trackId} onClick={() => void run(() => playing ? api.pauseThemePlayback() : api.playThemeTrack(trackId))} /></div>
      <div className="bgm-status" role="status">{state.requestedTrackId ? '플러그인이 배경음을 선택했어요. 재생 버튼을 눌러 시작해 주세요.' : phaseLabels[state.phase]}{state.trackId && <span>{time(state.position)} / {time(state.duration)}</span>}</div>
      <div className="bgm-options"><label className="bgm-volume"><Volume2 size={17} aria-hidden="true" /><span className="sr-only">배경음 음량</span><input type="range" min="0" max="100" step="1" value={state.volume} onChange={event => { void api.setThemePlaybackVolume(Number(event.target.value)).catch(failure => setError(themeError(failure))); }} /><output>{Math.round(state.volume)}%</output></label><label className="bgm-loop"><input type="checkbox" checked={state.loop} onChange={event => { void api.setThemePlaybackLoop(event.target.checked).catch(failure => setError(themeError(failure))); }} />반복 재생</label></div>
      {(error || state.error) && <p className="theme-inline-error" role="alert">{error || state.error}</p>}
    </div>
    {showYouTube && <div className="youtube-region"><div ref={slot} className="youtube-player-slot" aria-label="YouTube 공식 플레이어"><Youtube size={30} aria-hidden="true" /><p>YouTube 플레이어</p></div><p className="feature-caption">화면에 플레이어 전체가 보일 때 재생돼요. 다른 화면으로 이동하거나 창을 최소화하면 일시 정지해요.</p></div>}
    <details className="bgm-youtube-source"><summary>YouTube 주소로 선택</summary><form onSubmit={event => { event.preventDefault(); void run(async () => { const next = await api.setYouTubeSource(url); if (mounted.current) setTrackId(next.trackId || ''); }); }}><label htmlFor="bgm-youtube-url">YouTube 영상 주소</label><div className="bgm-url-row"><input id="bgm-youtube-url" type="url" maxLength={2048} placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={event => setUrl(event.target.value)} required /><Button label="주소 선택" type="submit" size="lg" isDisabled={busy || !url.trim()} /></div><p className="feature-caption">선택 후 재생 버튼을 눌러 주세요. YouTube 연결에는 인터넷을 사용하며 YouTube의 개인정보처리방침이 적용돼요. 일부 영상은 임베드 재생이 제한될 수 있어요.</p></form></details>
  </Card></section>;
}
