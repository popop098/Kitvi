import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { packageTheme } from '../sdk/tools/package-theme.mjs';
import { runVerification } from './process.mjs';
import { themePackageFixtures, writeThemePackageFixture } from '../tests/theme-package-fixtures.mjs';
const root = resolve(import.meta.dirname,'..'), profile = join(root,'.cache','theme-host-'+randomUUID());
await mkdir(profile,{recursive:true}); await mkdir(join(root,'verification/artifacts'),{recursive:true});
const fixtures = [];
for (const fixture of themePackageFixtures) {
  const generated = await writeThemePackageFixture(join(profile,'sources',fixture.key),fixture);
  await packageTheme(generated.source,join(profile,fixture.key+'.kitvi-plugin.zip'));
  fixtures.push(generated);
}
await writeFile(join(profile,'fixtures.json'),JSON.stringify(fixtures));
const env = {...process.env,KITVI_VERIFICATION_RUNNER:'1',KITVI_TEST_DATA_DIR:profile}; delete env.ELECTRON_RUN_AS_NODE;
const result = await runVerification({executable:createRequire(import.meta.url)('electron'),args:[join(root,'verification/theme-host-harness')],env,logPath:join(profile,'run.log'),timeoutMs:100000});
assert.equal(result.timedOut,false,'Theme host timed out: '+profile);
assert.equal(result.code,0,'Theme host exited '+result.code+': '+profile);
const report = JSON.parse(await readFile(join(root,'verification/artifacts/theme-host.json'),'utf8'));
assert.equal(report.result,'PASS',JSON.stringify(report)); console.log(JSON.stringify(report,null,2));
