const {app,BrowserWindow,dialog,net} = require('electron');
const {join,resolve} = require('node:path');
const {readFileSync,writeFileSync} = require('node:fs');
const assert = require('node:assert/strict');
if(process.env.KITVI_VERIFICATION_RUNNER!=='1'||!process.env.KITVI_TEST_DATA_DIR)app.exit(2);
const root=resolve(__dirname,'..'),report={result:'FAIL',checks:[]},errors=[];
const check=text=>report.checks.push(text);
const fixtures=JSON.parse(readFileSync(join(process.env.KITVI_TEST_DATA_DIR,'fixtures.json'),'utf8'));
const [localFixture,youtubeFixture]=fixtures;
let selected=localFixture.key;
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[join(process.env.KITVI_TEST_DATA_DIR,selected+'.kitvi-plugin.zip')]});
require(join(root,'build/electron/main.cjs'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)); let win;
const js=async code=>{const value=await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (${code})}}catch(e){return {error:e.stack||String(e)}}})()`);if(value.error)throw Error(code.slice(0,120)+': '+value.error);return value.value;};
async function until(action,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await action())return;await wait(60);}throw Error('Timeout: '+label);}
const click=async label=>{const selector=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;await until(()=>js(`(()=>{const b=${selector};return !!b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'})()`),'button '+label);await js(`(${selector}).click()`);};
app.whenReady().then(async()=>{
try{
 await until(()=>{win=BrowserWindow.getAllWindows()[0];return win&&!win.webContents.isLoading();},'app window');
 win.webContents.on('console-message',(_event,details)=>{if(details?.level==='error')errors.push(details.message);});
 await until(async()=>!!(await js('window.kitvi.getState()')).snapshot?.cpu.name,'actual collector');
 assert.equal((await js('window.kitvi.getWindow()')).version,'0.7.0');
 for(const fixture of fixtures){
  selected=fixture.key;
  await js(`(async()=>{const preview=await window.kitvi.previewLocalPlugin();return window.kitvi.confirmPlugin(preview.token)})()`);
 }
 assert.equal((await js('window.kitvi.getThemeState()')).available.length,0);
 await js('window.kitvi.setPluginSystemEnabled(true,true)');
 for(const {id} of fixtures) await js(`window.kitvi.getPlugins().then(s=>window.kitvi.acceptPlugin(${JSON.stringify(id)},s.plugins.find(p=>p.id===${JSON.stringify(id)}).contentHash))`);
 assert.equal((await js('window.kitvi.getThemeState()')).available.length,2);
 await js(`window.kitvi.previewTheme(${JSON.stringify(localFixture.id)})`);
 await until(()=>js(`document.querySelector('.app-shell')?.dataset.customTheme===${JSON.stringify(localFixture.id)}`),'preview skin');
 assert.equal((await js('window.kitvi.getThemeState()')).selectedId,null);
 assert.equal((await js('window.kitvi.getPlaybackState()')).phase,'idle');
 await js('window.kitvi.cancelThemePreview()'); await until(()=>js('!document.querySelector("[data-custom-theme]")'),'cancel preview');
 await js(`window.kitvi.applyTheme(${JSON.stringify(localFixture.id)})`);
 await until(()=>js('!!document.querySelector("#bgm-title")'),'local BGM card');
 assert.equal(await js('document.querySelectorAll("iframe").length'),0);
 assert.equal(await js('getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--canvas").trim()'),localFixture.canvas);
 check('synthetic SDK2 ZIP install, two consent gates, skin preview/cancel/apply, layout and no theme iframe');
 await click('재생');
 await until(async()=>(await js('window.kitvi.getPlaybackState()')).phase==='playing','real packaged audio playback');
 assert.equal(await js('document.querySelector("audio").paused'),false);
 assert((await js('window.kitvi.getPlaybackState()')).duration>0);
 await js('(()=>{window.__audioBefore=document.querySelector("audio");return true})()');
 await click('설정'); assert.equal(await js('window.__audioBefore===document.querySelector("audio")'),true);
 assert.equal(await js('document.querySelector("audio").paused'),false);
 await js('window.kitvi.pauseThemePlayback()'); await until(()=>js('document.querySelector("audio").paused'),'audio pause');
 check('real packaged WAV plays, reports duration and survives page navigation');
 await js(`window.kitvi.applyTheme(${JSON.stringify(youtubeFixture.id)})`);
 await click('PC 상태'); await until(()=>js('!!document.querySelector(".youtube-player-slot")'),'YouTube slot');
 await js('document.querySelector(".dashboard-scroll").scrollTop=0'); await wait(400);
 assert.equal((await js('window.kitvi.getPlaybackState()')).phase,'idle');
 if(process.env.KITVI_VERIFY_YOUTUBE==='1'){
  await click('재생');
  await until(async()=>{const p=await js('window.kitvi.getPlaybackState()');if(p.phase==='error')throw Error(p.error);return p.phase==='playing';},'actual host YouTube playback',40000);
  check('actual application host Play reaches official YouTube playing state');
  win.minimize(); await until(async()=>(await js('window.kitvi.getPlaybackState()')).phase==='paused','minimize pauses YouTube');
  win.restore(); await wait(500); assert.equal((await js('window.kitvi.getPlaybackState()')).phase,'paused');
  check('minimize pauses official player and restore never resumes automatically');
 }else check('YouTube source selection keeps transport idle before user Play');
 await js('window.kitvi.setPluginSystemEnabled(false)');
 await until(()=>js('!document.querySelector("[data-custom-theme]")'),'global off restores default');
 assert.equal((await js('window.kitvi.getPlaybackState()')).provider,null);
 assert.equal((await net.fetch(`kitvi-plugin://${localFixture.id}/${localFixture.audioAsset}`)).status,404);
 await js('window.kitvi.setPluginSystemEnabled(true)');
 await until(()=>js(`document.querySelector('.app-shell')?.dataset.customTheme===${JSON.stringify(youtubeFixture.id)}`),'reenable restores saved skin');
 assert.equal((await js('window.kitvi.getPlaybackState()')).phase,'idle');
 await js('window.kitvi.applyTheme(null)'); await until(()=>js('!document.querySelector("[data-custom-theme]")'),'default reset');
 assert.equal((await js('window.kitvi.getThemeState()')).selectedId,null);
 check('global off revokes audio/resources; reenable restores skin without music; default reset remains available');
 report.result='PASS'; report.consoleErrors=errors;
}catch(error){report.error=error.stack||String(error);report.consoleErrors=errors;}
writeFileSync(join(root,'verification/artifacts/theme-host.json'),JSON.stringify(report,null,2));app.quit();
});
