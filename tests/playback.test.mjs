import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ThemePlaybackService, parseYouTubeVideoId, validatePlaybackViewport, youtubeErrorMessage, youtubeRequestHeaders, createElectronYouTubeSurface, isAllowedYouTubeFrameNavigation, isAllowedYouTubeResource } from '../electron/theme-playback.ts';

const theme = (hash = 'a'.repeat(64)) => ({ pluginId: 'demo-theme', name: 'Demo', version: '1.0.0', contentHash: hash,
  definition: { schemaVersion: 1, id: 'demo', name: 'Demo', modes: { light: {}, dark: {} }, bgm: { volume: 40, loop: false, tracks: [
    { id: 'local', title: 'Rain', source: { type: 'asset', path: 'audio/rain.mp3' } },
    { id: 'video', title: 'YouTube', source: { type: 'youtube', videoId: 'M7lc1UVf-VE' } },
  ] } } });
class Window extends EventEmitter {
  shown = true; minimized = false;
  isVisible() { return this.shown; } isMinimized() { return this.minimized; } isDestroyed() { return false; }
  getContentBounds() { return { x: 100, y: 100, width: 960, height: 640 }; }
}
function fixture(t, override = {}) {
  const window = new Window(), commands = [], surfaces = []; let runnable = true;
  const createYouTubeSurface = async ({ report }) => {
    const surface = { report, load: async (config) => commands.push(['load', config]), play: () => commands.push(['play']), pause: () => commands.push(['pause']), configure: (value) => commands.push(['configure', value]), setViewport: (value) => commands.push(['viewport', value]), dispose: () => commands.push(['dispose']) };
    surfaces.push(surface); return surface;
  };
  const service = new ThemePlaybackService({ window, canRun: () => runnable, createYouTubeSurface, ...override });
  service.setTheme(theme());
  t.after(() => service.dispose());
  return { service, window, commands, surfaces, revoke: () => { runnable = false; } };
}
const viewport = { x: 20, y: 120, width: 400, height: 225, visible: true };

test('YouTube source accepts only public video URLs or exact IDs', () => {
  for (const input of ['M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&list=ignored', 'https://youtu.be/M7lc1UVf-VE?t=2', 'https://youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube.com/embed/M7lc1UVf-VE']) assert.equal(parseYouTubeVideoId(input), 'M7lc1UVf-VE');
  for (const input of ['http://youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://u:p@youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com:444/watch?v=M7lc1UVf-VE', 'https://youtube.com/playlist?list=x', 'https://youtu.be/M7lc1UVf-VE/extra', 'javascript:alert(1)', '', 'x'.repeat(5000)]) assert.throws(() => parseYouTubeVideoId(input));
});

test('native viewport must meet size, header and full content boundaries', () => {
  assert.deepEqual(validatePlaybackViewport(viewport, { width: 960, height: 640 }), viewport);
  for (const value of [{ ...viewport, width: 199 }, { ...viewport, height: 199 }, { ...viewport, y: 57 }, { ...viewport, x: -1 }, { ...viewport, x: 800 }, { ...viewport, y: 500 }, { ...viewport, width: NaN }, { ...viewport, visible: false }]) assert.equal(validatePlaybackViewport(value, { width: 960, height: 640 }), null);
});

test('only official embed requests receive the real installed application Referer', () => {
  const headers = { 'User-Agent': 'Chromium', referer: 'https://untrusted.invalid/' };
  assert.deepEqual(youtubeRequestHeaders('https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1', headers), { 'User-Agent': 'Chromium', Referer: 'https://com.popop098.kitvi/' });
  assert.deepEqual(youtubeRequestHeaders('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE', {}), { Referer: 'https://com.popop098.kitvi/' });
  for (const url of ['https://www.youtube.com/iframe_api', 'https://youtube.com.evil.invalid/embed/M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE']) assert.deepEqual(youtubeRequestHeaders(url, headers), headers);
});

test('official internal, consent and advertising subframes share the provider resource boundary', () => {
  for (const url of ['https://www.youtube.com/embed/M7lc1UVf-VE', 'https://www.youtube.com/embed/establish_zw', 'https://consent.youtube.com/m', 'https://googleads.g.doubleclick.net/pagead/html/r2026/frame.html', 'https://www.google.com/recaptcha/api2/anchor', 'https://i.ytimg.com/iframe.html']) {
    assert.equal(isAllowedYouTubeResource(url), true, url);
    assert.equal(isAllowedYouTubeFrameNavigation(url, false), true, url);
    assert.equal(isAllowedYouTubeFrameNavigation(url, true), false, 'the top wrapper cannot navigate');
  }
  for (const url of ['http://www.youtube.com/embed/M7lc1UVf-VE', 'https://example.com/', 'https://youtube.com.evil.invalid/embed/M7lc1UVf-VE', 'https://com.popop098.kitvi/player.html', 'https://u:p@www.youtube.com/embed/M7lc1UVf-VE', 'https://www.youtube.com:444/embed/M7lc1UVf-VE', 'javascript:alert(1)', 'about:blank']) {
    assert.equal(isAllowedYouTubeResource(url), false, url);
    assert.equal(isAllowedYouTubeFrameNavigation(url, false), false, url);
    assert.equal(isAllowedYouTubeFrameNavigation(url, true), false, url);
  }
});

test('theme activation never starts transport; local playback is artifact bound', async (t) => {
  const { service, commands } = fixture(t);
  assert.equal(service.state.phase, 'idle'); assert.equal(commands.length, 0);
  await service.playTrack('local');
  assert.equal(service.state.phase, 'loading'); assert.equal(service.state.provider, 'asset');
  assert.equal(service.state.assetUrl, `kitvi-plugin://demo-theme/audio/rain.mp3?v=${'a'.repeat(64)}`);
  assert.equal(service.state.volume, 40);
  const generation = service.state.generation;
  service.reportLocal({ generation, phase: 'playing', position: 2, duration: 120 });
  assert.equal(service.state.phase, 'playing'); assert.equal(service.state.position, 2);
  service.pause(); assert.equal(service.state.phase, 'paused');
  service.reportLocal({ generation, phase: 'playing', position: 3, duration: 120 });
  assert.equal(service.state.phase, 'paused', 'late browser playing events must not undo host pause');
});

test('plugin requests only select a known host track and never start audio', (t) => {
  const { service, commands } = fixture(t);
  service.requestTrack('video');
  assert.equal(service.state.requestedTrackId, 'video'); assert.equal(service.state.phase, 'idle'); assert.equal(commands.length, 0);
  assert.throws(() => service.requestTrack('unknown'));
});

test('old local callbacks cannot revive replaced or revoked playback', async (t) => {
  const { service, revoke } = fixture(t); await service.playTrack('local'); const generation = service.state.generation;
  service.setTheme(theme('b'.repeat(64))); service.reportLocal({ generation, phase: 'playing', position: 5, duration: 60 });
  assert.equal(service.state.phase, 'idle'); assert.equal(service.state.assetUrl, null);
  await service.playTrack('local'); revoke(); service.reportLocal({ generation: service.state.generation, phase: 'playing', position: 1, duration: 10 });
  assert.equal(service.state.phase, 'idle'); assert.equal(service.state.themeId, null);
  await assert.rejects(service.playTrack('local'));
});

test('local reports reject non-finite positions and cannot report a YouTube transport', async (t) => {
  const { service } = fixture(t); await service.playTrack('local');
  service.reportLocal({ generation: service.state.generation, phase: 'playing', position: Infinity, duration: 10 });
  assert.equal(service.state.phase, 'loading');
  service.setViewport(viewport); await service.playTrack('video');
  service.reportLocal({ generation: service.state.generation, phase: 'playing', position: 1, duration: 10 });
  assert.equal(service.state.phase, 'loading');
});

test('YouTube source selection does not create a player before explicit play', async (t) => {
  const { service, surfaces } = fixture(t);
  service.setYouTubeSource('https://youtu.be/M7lc1UVf-VE');
  assert.equal(service.state.trackId, '__youtube_url__'); assert.equal(service.state.phase, 'paused'); assert.equal(surfaces.length, 0);
  await assert.rejects(service.playTrack('__youtube_url__'), /200|표시/);
  service.setViewport(viewport); await service.playTrack('__youtube_url__');
  assert.equal(surfaces.length, 1); assert.equal(service.state.phase, 'loading');
});

test('YouTube pauses when hidden, clipped, minimized and never auto resumes', async (t) => {
  const { service, window, surfaces, commands } = fixture(t); service.setViewport(viewport); await service.playTrack('video');
  surfaces[0].report({ generation: service.state.generation, phase: 'playing', position: 2, duration: 10 }); assert.equal(service.state.phase, 'playing');
  service.setViewport({ ...viewport, visible: false }); assert.equal(service.state.phase, 'paused');
  const plays = commands.filter(([kind]) => kind === 'play').length;
  service.setViewport(viewport); assert.equal(service.state.phase, 'paused'); assert.equal(commands.filter(([kind]) => kind === 'play').length, plays);
  await service.playTrack('video'); window.minimized = true; window.emit('minimize'); assert.equal(service.state.phase, 'paused');
  window.minimized = false; window.emit('restore'); assert.equal(service.state.phase, 'paused');
});

test('packaged audio keeps playing when window hides', async (t) => {
  const { service, window } = fixture(t); await service.playTrack('local'); const generation = service.state.generation;
  service.reportLocal({ generation, phase: 'playing', position: 1, duration: 20 }); window.shown = false; window.emit('hide');
  assert.equal(service.state.phase, 'playing');
});

test('revocation during asynchronous player creation destroys the stale surface', async (t) => {
  let release; const disposed = [];
  const pending = new Promise((resolve) => { release = resolve; });
  const { service } = fixture(t, { createYouTubeSurface: () => pending }); service.setViewport(viewport);
  const play = service.playTrack('video'); service.setTheme(null);
  release({ load: async () => assert.fail('stale player must not load'), play() {}, pause() {}, configure() {}, setViewport() {}, dispose: () => disposed.push(true) });
  await play; assert.equal(disposed.length, 1); assert.equal(service.state.phase, 'idle');
});

test('volume and loop are bounded, and unavailable embed errors are useful', (t) => {
  const { service } = fixture(t); assert.throws(() => service.setVolume(101)); assert.throws(() => service.setVolume(NaN)); assert.throws(() => service.setLoop('yes'));
  service.setVolume(20); service.setLoop(true); assert.equal(service.state.volume, 20); assert.equal(service.state.loop, true);
  for (const code of [0, 100, 101, 150, 153]) assert.match(youtubeErrorMessage(code), /YouTube/);
  assert.match(youtubeErrorMessage(153), /153/);
});

test('dispose invalidates callbacks and destroys the native surface', async (t) => {
  const { service, surfaces, commands } = fixture(t); service.setViewport(viewport); await service.playTrack('video'); const generation = service.state.generation;
  service.dispose(); surfaces[0].report({ generation, phase: 'playing', position: 3, duration: 10 });
  assert.equal(service.state.phase, 'idle'); assert(commands.some(([kind]) => kind === 'dispose'));
  await assert.rejects(service.playTrack('video'), /종료/);
});

test('official player error survives the load cancellation caused by its cleanup', async (t) => {
  const { service } = fixture(t, { createYouTubeSurface: async ({ report }) => ({
    load: async (config) => { report({ generation: config.generation, phase: 'error', position: 0, duration: null, error: youtubeErrorMessage(153) }); throw new Error('load cancelled after cleanup'); },
    play() {}, pause() {}, configure() {}, setViewport() {}, dispose() {},
  }) });
  service.setViewport(viewport); await service.playTrack('video');
  assert.match(service.state.error, /153/);
});

test('autoplay blocking keeps the authorized official player available for a direct click', async (t) => {
  const { service, surfaces, commands } = fixture(t); service.setViewport(viewport); await service.playTrack('video');
  const generation = service.state.generation;
  surfaces[0].report({ generation, phase: 'paused', position: 0, duration: 10, error: 'YouTube 플레이어의 재생 버튼을 눌러 주세요.' });
  assert.equal(service.state.phase, 'paused'); assert.match(service.state.error, /재생 버튼/);
  service.setViewport(viewport); assert.deepEqual(commands.filter(([kind]) => kind === 'viewport').at(-1)[1], viewport);
  surfaces[0].report({ generation, phase: 'playing', position: 1, duration: 10 });
  assert.equal(service.state.phase, 'playing'); assert.equal(service.state.error, null);
  service.pause(); surfaces[0].report({ generation, phase: 'playing', position: 2, duration: 10 });
  assert.equal(service.state.phase, 'paused');
});

test('a closed window cannot create a new native player during shutdown', async () => {
  await assert.rejects(createElectronYouTubeSurface({ window: { isDestroyed: () => true }, report() {}, log() {} }), /종료/);
});
