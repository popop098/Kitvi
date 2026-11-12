import { build, context } from 'esbuild';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await import('./create-icon.mjs');
await import('./licenses.mjs');
await mkdir(resolve(root, 'build/renderer'), { recursive: true });
await build({ entryPoints: [resolve(root, 'electron/main.ts'), resolve(root, 'electron/preload.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron', 'electron-updater'], outdir: resolve(root, 'build/electron'), outExtension: { '.js': '.cjs' }, sourcemap: false });
for (const file of ['index.html', 'design-preview.html']) {
  await writeFile(resolve(root, 'build/renderer', file), await readFile(resolve(root, 'renderer', file)));
}
await cp(resolve(root, 'assets/kitvi.ico'), resolve(root, 'build/renderer/kitvi.ico'));
await cp(resolve(root, 'assets/kitvi-icon.png'), resolve(root, 'build/renderer/kitvi-icon.png'));
await cp(resolve(root, 'licenses'), resolve(root, 'build/licenses'), { recursive: true });
const watchDesign = process.argv.includes('--watch-design');
const options = {
  entryPoints: { app: resolve(root, 'renderer/main.tsx'), 'design-preview': resolve(root, 'renderer/design/preview.tsx') },
  bundle: true, platform: 'browser', target: 'chrome130', format: 'iife', minify: true,
  outdir: resolve(root, 'build/renderer'), assetNames: 'assets/[name]-[hash]', loader: { '.woff2': 'file', '.woff': 'file' },
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info',
  plugins: watchDesign ? [{ name: 'design-ready', setup(builder) {
    builder.onEnd(async (result) => {
      if (result.errors.length) return;
      await writeFile(resolve(root, 'build/renderer/design-refresh.json'), JSON.stringify({ builtAt: Date.now() }));
      console.log('KITVI_DESIGN_READY');
    });
  } }] : [],
};
if (watchDesign) {
  const builder = await context(options);
  await builder.watch();
} else {
  await build(options);
  console.log('Electron and React build complete.');
}
