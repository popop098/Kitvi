import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const result = spawnSync(process.execPath, [resolve(root,'node_modules/typescript/bin/tsc'), '-p', resolve(root,'sdk/tsconfig.types.json')], {cwd:root,stdio:'inherit',windowsHide:true});
if (result.error || result.status !== 0) throw result.error || Error('SDK type generation failed.');
