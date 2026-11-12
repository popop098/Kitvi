import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { packageTheme } from '../sdk/tools/package-theme.mjs';
const root = resolve(import.meta.dirname,'..'), output = join(root,'sdk/packages'), lines = [];
await mkdir(output,{recursive:true});
for (const [folder,name] of [['cozy-desk','Cozy-Desk-1.0.0.kitvi-plugin.zip'],['midnight-grid','Midnight-Grid-1.0.0.kitvi-plugin.zip']]) {
  const file = join(output,name); await packageTheme(join(root,'sdk/examples',folder),file);
  lines.push(createHash('sha256').update(await readFile(file)).digest('hex')+'  '+name);
}
await writeFile(join(output,'SHA256SUMS.txt'),lines.join('\n')+'\n');
console.log('Packaged two reproducible theme examples in sdk/packages.');
