import type { CollectionInfo } from './contracts.ts';
export function collectionFreshness(info: CollectionInfo | undefined, now: number, maxAge: number): 'loading' | 'ready' | 'stale' | 'error' {
  if (!info || info.status === 'loading') return 'loading';
  if (info.status === 'error' || info.status === 'unavailable') return 'error';
  const updated = info.updatedAt ? Date.parse(info.updatedAt) : NaN;
  return !Number.isFinite(updated) || now - updated > maxAge || updated - now > 5000 ? 'stale' : 'ready';
}
