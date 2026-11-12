import React from 'react';
import { createRoot } from 'react-dom/client';
import { PluginsPanel } from '../renderer/FeaturePanels.tsx';
import { AstryxProvider } from '../renderer/design/AstryxProvider.tsx';
import type { KitviApi } from '../shared/contracts.ts';
import '../renderer/styles.css';
import '../renderer/features.css';

const plugin = { apiVersion: 1, id: 'kitvi.consent-test', name: 'Consent fixture', version: '1.0.0', minKitviVersion: '0.4.0', description: 'Consent UI verification', author: 'Example publisher', authorEmail: 'publisher@example.com', entry: 'ui/index.html', permissions: ['storage', 'downloads'], source: 'example/consent-fixture', installedAt: new Date().toISOString(), contentHash: 'a'.repeat(64), enabled: false, needsConsent: true };
const listeners = new Set<(state: unknown) => void>();
let current = { system: { enabled: false, acceptedAt: null as string | null }, plugins: [] as typeof plugin[], busy: false, message: null };
let key = 0, deferred = false, resolveInitial: (() => void) | undefined;
const clone = <T,>(value: T): T => structuredClone(value);
const calls: unknown[][] = [];
const emit = () => listeners.forEach(listener => listener(clone(current)));
const updates = { autoCheck: true, checking: false, checkedAt: null, plugins: [] };
const api = {
  getPlugins: () => { const captured = clone(current); return deferred ? new Promise(resolve => { resolveInitial = () => resolve(captured); }) : Promise.resolve(captured); },
  onPlugins: (listener: (state: unknown) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  getPluginUpdates: async () => updates, onPluginUpdates: () => () => {}, checkPluginUpdates: async () => { calls.push(['updates']); return updates; },
  setPluginSystemEnabled: async (enabled: boolean, accepted?: boolean) => { calls.push(['system', enabled, accepted]); current.system = { enabled, acceptedAt: current.system.acceptedAt || (accepted ? new Date().toISOString() : null) }; emit(); return clone(current); },
  acceptPlugin: async (id: string, hash: string) => { calls.push(['accept', id, hash]); Object.assign(current.plugins[0], { needsConsent: false, enabled: true }); emit(); return clone(current); },
  setPluginEnabled: async (id: string, enabled: boolean) => { calls.push(['toggle', id, enabled]); current.plugins[0].enabled = enabled; emit(); return clone(current); },
  previewPlugin: async () => ({ token: 'fixture-preview', source: 'example/consent-fixture', permissions: plugin.permissions, manifest: plugin }),
  confirmPlugin: async () => { calls.push(['install']); current.plugins.push(clone(plugin)); emit(); return clone(current); },
  getPluginMedia: async () => ({ engine: { phase: 'missing', version: null, progress: null, message: null }, jobs: [], folder: null }),
  onMedia: () => () => {}, invokePlugin: async (...args: unknown[]) => { calls.push(['invoke', ...args]); return null; },
} as unknown as KitviApi;
const root = createRoot(document.getElementById('root')!);
const render = () => root.render(<AstryxProvider appearance={document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light'}><PluginsPanel key={key} api={api} appearance="light" /></AstryxProvider>);
Object.assign(window, { fixture: {
  calls, state: () => clone(current),
  emit: (patch: Partial<typeof current>) => { current = { ...current, ...patch }; emit(); },
  changePlugin: (patch: Partial<typeof plugin>) => { Object.assign(current.plugins[0], patch); emit(); },
  staleRemount: () => { deferred = true; current.system.enabled = true; key++; render(); },
  resolveInitial: () => { resolveInitial?.(); deferred = false; },
  theme: (appearance: 'light' | 'dark') => { document.documentElement.dataset.appearance = appearance; render(); },
} });
render();
