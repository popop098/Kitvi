const { app, BrowserWindow, dialog, session, net } = require('electron');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
if (process.env.KITVI_VERIFICATION_RUNNER !== '1' || !process.env.KITVI_TEST_DATA_DIR) app.exit(2);
const root = resolve(__dirname, '..'), report = { result: 'FAIL', checks: [] }, errors = [];
const check = text => report.checks.push(text);
// This harness only installs its generated local ZIP; no release or media traffic.
global.fetch = async () => { throw Error('External network disabled in host fixture'); };
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(process.env.KITVI_TEST_DATA_DIR, 'fixture.kitvi-plugin.zip')] });
app.on('web-contents-created', (_event, contents) => contents.on('console-message', (_event, details) => { if (details?.level === 'error') errors.push(details.message); }));
require(join(root, 'build/electron/main.cjs'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const js = async code => {
  const response = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (${code})}}catch(error){return {error:error.stack||String(error)}}})()`);
  if (response.error) throw Error(code.slice(0, 140) + ': ' + response.error);
  return response.value;
};
async function until(action, label) { for (let i = 0; i < 150; i++) { if (await action()) return; await wait(60); } throw Error('Timeout: ' + label); }
const click = async label => {
  const selector = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
  await until(() => js(`(()=>{const button=${selector};return !!button&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'})()`), 'button ' + label);
  await js(`(${selector}).click()`);
};
app.whenReady().then(async () => {
  try {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(kitvi:|kitvi-plugin:|file:|data:)/.test(details.url) }));
    await until(() => { win = BrowserWindow.getAllWindows()[0]; return win && !win.webContents.isLoading(); }, 'window');
    assert.equal((await js('window.kitvi.getWindow()')).version, '0.6.0');
    await until(async () => !!(await js('window.kitvi.getState()')).snapshot?.cpu.name, 'live collector');
    await click('플러그인'); await until(() => js('!!document.querySelector(".plugin-source-form")'), 'plugin page');
    assert.equal((await js('window.kitvi.getPlugins()')).system.enabled, false);
    assert.equal(await js('window.kitvi.setPluginSystemEnabled(true).then(()=>false,()=>true)'), true);
    await click('ZIP 파일 선택'); await until(() => js('!!document.querySelector(".plugin-preview")'), 'local review');
    await click('확인하고 설치'); await until(async () => (await js('window.kitvi.getPlugins()')).plugins.length === 1, 'install');
    await until(() => js(`!document.querySelector('input[aria-label="플러그인 사용"]').disabled`), 'idle plugin system switch');
    assert.equal(await js('window.kitvi.invokePlugin("kitvi.consent-check","storage.get",{key:"sample"}).then(()=>false,()=>true)'), true);
    assert.equal((await net.fetch('kitvi-plugin://kitvi.consent-check/ui/index.html')).status, 404);
    check('default off denies RPC, resources and implicit global enable');
    await js(`document.querySelector('input[aria-label="플러그인 사용"]').click()`);
    await until(() => js('!!document.querySelector("dialog[open]")'), 'global warning');
    await click('확인하고 플러그인 사용'); await until(async () => (await js('window.kitvi.getPlugins()')).system.enabled, 'global accepted');
    assert.equal(await js('window.kitvi.invokePlugin("kitvi.consent-check","storage.get",{key:"sample"}).then(()=>false,()=>true)'), true);
    assert.equal(await js('document.querySelectorAll("iframe").length'), 0);
    await js(`document.querySelector('input[aria-label="Host consent fixture 사용"]').click()`);
    await until(() => js('!!document.querySelector("dialog[open]")'), 'individual warning');
    assert.match(await js('document.querySelector("dialog").textContent'), /fixture@example.com/);
    await click('동의하고 활성화'); await until(async () => (await js('window.kitvi.getPlugins()')).plugins[0].enabled, 'activated');
    await click('열기'); await until(() => js('!!document.querySelector("iframe") && !document.querySelector(".plugin-connection-status")'), 'iframe handshake');
    const frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('kitvi-plugin:'));
    assert(frame); assert.equal(await frame.executeJavaScript('typeof require'), 'undefined');
    await frame.executeJavaScript('window.request("storage.set",{key:"sample",value:42})');
    assert.equal(await frame.executeJavaScript('window.request("storage.get",{key:"sample"})'), 42);
    check('both accepted gates allow sandboxed plugin with declared storage only');
    const acceptedAt = (await js('window.kitvi.getPlugins()')).system.acceptedAt;
    await js('window.kitvi.setPluginSystemEnabled(false)');
    await until(() => js('!document.querySelector("iframe")'), 'off removes iframe');
    assert.equal(await js('window.kitvi.invokePlugin("kitvi.consent-check","storage.get",{key:"sample"}).then(()=>false,()=>true)'), true);
    assert.equal((await net.fetch('kitvi-plugin://kitvi.consent-check/ui/index.html')).status, 404);
    await js('window.kitvi.setPluginSystemEnabled(true)');
    assert.equal((await js('window.kitvi.getPlugins()')).system.acceptedAt, acceptedAt);
    assert.equal(await js('window.kitvi.invokePlugin("kitvi.consent-check","storage.get",{key:"sample"})'), 42);
    assert.equal((await js('window.kitvi.getPluginMedia("kitvi.consent-check")')).jobs.length, 0);
    assert((await js('window.kitvi.getState()')).snapshot.cpu.name);
    assert.equal((await js('window.kitvi.getUpdateState()')).phase, 'disabled');
    check('global off revokes and reenable preserves data without replay; collector and core updater remain independent');
    // Expected blocked fetches can produce Chromium resource errors; persist all for diagnosis.
    report.consoleErrors = errors; report.result = 'PASS';
  } catch (error) { report.error = error.stack || String(error); report.consoleErrors = errors; }
  writeFileSync(join(root, 'verification/artifacts/plugin-host.json'), JSON.stringify(report, null, 2));
  app.quit();
});
