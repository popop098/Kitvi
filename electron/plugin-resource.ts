import type { PluginManager } from './plugins.ts';
export async function readAuthorizedPluginResource(manager: PluginManager, runtimeEnabled: () => boolean, id: string, path: string, expectedHash: string | null = null) {
  const installed = manager.get(id);
  if (!runtimeEnabled() || !manager.canRun(id) || !installed || expectedHash && expectedHash !== installed.contentHash) throw new Error('Plugin resource access is disabled.');
  const resource = await manager.readResource(id, path);
  if (!runtimeEnabled() || !manager.canRun(id) || manager.get(id)?.contentHash !== installed.contentHash) throw new Error('Plugin resource authorization changed or was revoked.');
  return resource;
}

/** Audio needs a declared byte length and byte ranges for duration/seek discovery. */
export function pluginResourceResponse(resource: { data: Buffer; mime: string }, range: string | null): Response {
  const headers = new Headers({ 'Content-Type':resource.mime, 'Access-Control-Allow-Origin':'*', 'X-Content-Type-Options':'nosniff' });
  const size = resource.data.byteLength; let start = 0, end = size - 1, status = 200;
  if (resource.mime.startsWith('audio/')) {
    headers.set('Accept-Ranges','bytes');
    if (range !== null) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const invalid = () => { headers.set('Content-Range',`bytes */${size}`); headers.set('Content-Length','0'); return new Response(null,{status:416,headers}); };
      if (!match || !size || !match[1] && !match[2]) return invalid();
      if (!match[1]) {
        const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid(); start = Math.max(0,size - suffix);
      } else {
        start = Number(match[1]); end = match[2] ? Number(match[2]) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return invalid();
        end = Math.min(end,size - 1);
      }
      status = 206; headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
    }
  }
  const body = resource.data.subarray(start,end + 1); headers.set('Content-Length',String(body.byteLength));
  return new Response(new Uint8Array(body),{status,headers});
}
