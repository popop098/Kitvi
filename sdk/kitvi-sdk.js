/* Kitvi Plugin SDK. MIT. Legacy tool bridge + declarative theme helpers. */
(() => {
  'use strict';
  const pending = new Map(), listeners = new Set();
  let sequence = 0, latestState;
  const request = (method, params = {}) => {
    if (typeof method !== 'string' || !method.length || method.length > 80) return Promise.reject(new TypeError('Invalid SDK method.'));
    if (pending.size >= 20) return Promise.reject(new Error('Too many pending requests.'));
    const requestId = `kitvi-${Date.now()}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Kitvi request timed out.')); }, method === 'media.installEngine' ? 400000 : 100000);
      pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage({ type: 'kitvi:request', requestId, method, params }, '*');
    });
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'kitvi:response' && typeof data.requestId === 'string') {
      const call = pending.get(data.requestId); if (!call) return;
      clearTimeout(call.timer); pending.delete(data.requestId);
      data.ok === true ? call.resolve(data.result) : call.reject(new Error(typeof data.error === 'string' ? data.error : 'Kitvi request failed.'));
    }
    if (data.type === 'kitvi:state' && data.state && typeof data.state === 'object') {
      latestState = data.state;
      for (const listener of listeners) { try { listener(latestState); } catch (error) { console.error(error); } }
    }
  });
  window.kitviPlugin = Object.freeze({
    request,
    theme: Object.freeze({ getState: () => request('theme.getState') }),
    playback: Object.freeze({
      getState: () => request('playback.getState'),
      requestTrack: trackId => request('playback.requestTrack', { trackId }),
      pause: () => request('playback.pause'),
      setVolume: volume => request('playback.setVolume', { volume }),
    }),
    onState(listener) {
      if (typeof listener !== 'function') throw new TypeError('A state listener is required.');
      listeners.add(listener); if (latestState) listener(latestState);
      return () => listeners.delete(listener);
    },
    ready() { window.parent.postMessage({ type: 'kitvi:hello' }, '*'); },
  });
})();
