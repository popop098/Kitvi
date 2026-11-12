import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../renderer/App.tsx';
import type { KitviApi } from '../shared/contracts.ts';
import type { ThemeCatalogEntry, ThemeState } from '../shared/themes.ts';
import type { PlaybackState } from '../shared/playback.ts';
import '../renderer/styles.css';

const colors = {canvas:'#f3f6f9',panel:'#ffffff',surface:'#e8edf3',text:'#172b3a',muted:'#4e6275',border:'#c6d3de',accent:'#165b73',accentText:'#ffffff',accentSoft:'#dbedf3',cpu:'#b24d5a',memory:'#726293',gpu:'#3d7c98'};
const themeEntry: ThemeCatalogEntry = {pluginId:'kitvi.theme-fixture',name:'Quiet harbor',version:'1.0.0',contentHash:'a'.repeat(64),definition:{schemaVersion:1,id:'kitvi.theme-fixture',name:'Quiet harbor',modes:{light:colors,dark:{...colors,canvas:'#15222c',panel:'#20323f',surface:'#29404f',text:'#e4eff5',muted:'#b0c3d0',border:'#425c6d',accent:'#86c5d8',accentText:'#132c34',accentSoft:'#2c4c5b'}},typography:{fontFamily:'custom',fontAsset:'fonts/theme.woff2',baseSize:16},shape:{radius:16,spacing:1.1},background:{asset:'images/harbor.png',opacity:.15,fit:'cover'},layout:{order:['bgm','summary','performance','storage','devices'],hidden:['displays'],columns:1},bgm:{title:'Harbor radio',volume:35,loop:false,tracks:[{id:'local',title:'Local fixture',source:{type:'asset',path:'audio/local.wav'}},{id:'youtube',title:'Official video fixture',source:{type:'youtube',videoId:'M7lc1UVf-VE'}}]}}};
const clone = <T,>(value: T): T => structuredClone(value);
const themeListeners = new Set<(state: ThemeState) => void>(), playbackListeners = new Set<(state: PlaybackState) => void>();
const calls: unknown[][] = [];
let theme: ThemeState = {selectedId:null,previewId:null,previewing:false,active:null,available:[themeEntry],message:null};
let playback: PlaybackState = {themeId:null,trackId:null,requestedTrackId:null,provider:null,phase:'idle',volume:35,loop:false,position:0,duration:null,error:null,generation:0,assetUrl:null};
let appearance = 'light', deferred = false, resolveInitial: (() => void) | null = null, appKey = 0;
const emitTheme = () => themeListeners.forEach(listener => listener(clone(theme)));
const emitPlayback = () => playbackListeners.forEach(listener => listener(clone(playback)));
const stop = () => { playback = {...playback,themeId:theme.active?.pluginId || null,provider:null,phase:'idle',trackId:null,requestedTrackId:null,assetUrl:null,generation:playback.generation + 1}; emitPlayback(); };
const updates = {phase:'idle',currentVersion:'0.7.0',availableVersion:null,autoCheck:false,checkedAt:null,progress:null,message:null,canInstall:true,releaseUrl:'https://github.com/popop098/Kitvi/releases'};
const pluginUpdates = {autoCheck:true,checking:false,checkedAt:null,plugins:[]};
const plugin = {apiVersion:2,kind:'theme',id:themeEntry.pluginId,name:themeEntry.name,version:'1.0.0',minKitviVersion:'0.7.0',description:'Declarative theme without an entry',author:'Fixture publisher',theme:'theme.json',permissions:['theme','playback'],enabled:true,source:'local',installedAt:new Date().toISOString(),contentHash:themeEntry.contentHash,needsConsent:false};
const pluginState = {system:{enabled:true,acceptedAt:new Date().toISOString()},plugins:[plugin],busy:false,message:null};
const noEvents = () => () => {};
const api = {
  getState:async () => ({snapshot:null,collector:{state:'error',message:'Fixture connection warning stays visible.',lastSnapshotAt:null}}),onState:noEvents,
  getWindow:async () => ({maximized:false,version:'0.7.0'}),onWindow:noEvents,getAppearance:async () => appearance,setAppearance:async (value: string) => {appearance = value;return value;},minimize:async () => {},toggleMaximize:async () => {},close:async () => {},refresh:async () => {},retryCollector:async () => {},
  getUpdateState:async () => updates,onUpdate:noEvents,getPluginUpdates:async () => pluginUpdates,onPluginUpdates:noEvents,getPlugins:async () => clone(pluginState),onPlugins:noEvents,
  getThemeState:() => {const captured = clone(theme);return deferred ? new Promise(resolve => {resolveInitial = () => resolve(captured);}) : Promise.resolve(captured);},onTheme:(listener: (state: ThemeState) => void) => {themeListeners.add(listener);return () => themeListeners.delete(listener);},
  previewTheme:async (id: string | null) => {calls.push(['preview',id]);theme = {...theme,previewId:id,previewing:true,active:id ? themeEntry : null};stop();emitTheme();return clone(theme);},
  applyTheme:async (id: string | null) => {calls.push(['apply',id]);theme = {...theme,selectedId:id,previewId:null,previewing:false,active:id ? themeEntry : null};stop();emitTheme();return clone(theme);},
  cancelThemePreview:async () => {calls.push(['cancel']);theme = {...theme,previewId:null,previewing:false,active:theme.selectedId ? themeEntry : null};stop();emitTheme();return clone(theme);},
  getPlaybackState:async () => clone(playback),onPlayback:(listener: (state: PlaybackState) => void) => {playbackListeners.add(listener);return () => playbackListeners.delete(listener);},
  playThemeTrack:async (id: string) => {calls.push(['play',id]);playback = {...playback,themeId:themeEntry.pluginId,trackId:id,requestedTrackId:null,provider:id === 'local' ? 'asset' : 'youtube',phase:'loading',generation:playback.generation + 1,assetUrl:id === 'local' ? `kitvi-plugin://${themeEntry.pluginId}/audio/local.wav?v=${themeEntry.contentHash}` : null};emitPlayback();return clone(playback);},
  pauseThemePlayback:async () => {calls.push(['pause']);playback = {...playback,phase:'paused',generation:playback.generation+1};emitPlayback();return clone(playback);},
  setThemePlaybackVolume:async (value: number) => {calls.push(['volume',value]);playback.volume = value;emitPlayback();return clone(playback);},
  setThemePlaybackLoop:async (value: boolean) => {calls.push(['loop',value]);playback.loop = value;emitPlayback();return clone(playback);},
  setYouTubeSource:async (url: string) => {calls.push(['youtube-source',url]);playback = {...playback,themeId:themeEntry.pluginId,trackId:'__youtube_url__',provider:'youtube',phase:'paused'};emitPlayback();return clone(playback);},
  setPlaybackViewport:async (rect: unknown) => {calls.push(['viewport',rect]);},reportLocalPlayback:async (report: Partial<PlaybackState>) => {calls.push(['local-report',report]);if(report.generation === playback.generation && ['loading','playing'].includes(playback.phase)){playback = {...playback,...report};emitPlayback();}return clone(playback);},
  checkPluginUpdates:async () => pluginUpdates,setPluginSystemEnabled:async () => pluginState,
} as unknown as KitviApi;
Object.assign(window, {kitvi:api});
const root = createRoot(document.getElementById('root')!);
const render = () => root.render(<App key={appKey} />);
Object.assign(window, {fixture:{calls,theme:() => clone(theme),playback:() => clone(playback),entry:themeEntry,
  revoke:() => {theme = {...theme,active:null,available:[],previewId:null,previewing:false,message:'플러그인 사용이 꺼져 기본 테마로 복원했어요.'};stop();emitTheme();},
  requestTrack:(id: string) => {playback.requestedTrackId = id;emitPlayback();},
  playing:() => {playback.phase = 'playing';emitPlayback();},
  restore:() => {theme = {...theme,available:[themeEntry],message:null};emitTheme();},
  staleRemount:() => {deferred = true;theme = {...theme,active:themeEntry,selectedId:themeEntry.pluginId,available:[themeEntry]};appKey++;render();},
  resolveInitial:() => {resolveInitial?.();deferred = false;},
}});
render();
