import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..'), seen=new Set(), notices=[];
await mkdir(join(root,'licenses/npm'),{recursive:true});
async function visit(file) {
  const pkg=JSON.parse(await readFile(file,'utf8')), key=pkg.name+'@'+pkg.version;
  if(seen.has(key)) return; seen.add(key);
  const directory=dirname(file), files=(await readdir(directory)).filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  if(!files.length) {
    // lazy-val's npm package and upstream repository declare MIT but ship no text.
    // Retain the exact upstream declaration/author and the referenced SPDX text.
    if(key!=='lazy-val@1.0.5') throw Error('Missing dependency license: '+key);
    const source=await readFile(join(root,'licenses/lazy-val-NOTICE.txt'),'utf8');
    await writeFile(join(root,'licenses/npm/lazy-val@1.0.5-NOTICE.txt'),source);
  }
  for(const name of files) await copyFile(join(directory,name),join(root,'licenses/npm',key.replaceAll('/','_')+'-'+name));
  notices.push({name:pkg.name,version:pkg.version,license:pkg.license,notices:files});
  const require=createRequire(file);
  for(const name of Object.keys(pkg.dependencies||{})) await visit(require.resolve(name+'/package.json'));
}
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')), require=createRequire(join(root,'package.json'));
for(const name of Object.keys(pkg.dependencies||{})) await visit(require.resolve(name+'/package.json'));
await writeFile(join(root,'licenses/npm/dependencies.json'),JSON.stringify(notices,null,2)+'\n');
console.log('Collected licenses for '+notices.length+' runtime dependency versions.');
