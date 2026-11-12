import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLayout, themeStyle, themeAssetUrl, viewportWithinClips } from '../renderer/theme-runtime.ts';

const light = { canvas:'#fafafa',panel:'#ffffff',surface:'#eeeeee',text:'#171717',muted:'#555555',border:'#dddddd',accent:'#a12640',accentText:'#ffffff',accentSoft:'#ffeef2',cpu:'#a12640',memory:'#745599',gpu:'#336699' };
const entry = { pluginId:'kitvi.theme-test', contentHash:'a'.repeat(64), name:'Test',version:'1.0.0',definition:{schemaVersion:1,id:'test',name:'Test',modes:{light,dark:{...light,canvas:'#111111',text:'#eeeeee'}},typography:{fontFamily:'custom',fontAsset:'fonts/test.woff2',baseSize:18},shape:{radius:16,spacing:1.1},background:{asset:'images/bg.png',opacity:.25,fit:'cover'},layout:{order:['bgm','performance','summary'],hidden:['displays'],columns:1}} };

test('theme maps Astryx and Kitvi colors together, changes appearance and fully resets', () => {
  const style = themeStyle(entry, 'light');
  assert.equal(style['--canvas'], '#fafafa');
  assert.equal(style['--color-background-body'], style['--canvas']);
  assert.equal(style['--color-background-card'], style['--panel']);
  assert.equal(style['--color-text-primary'], style['--ink']);
  assert.equal(style['--color-accent'], style['--accent']);
  assert.equal(style['--color-on-accent'], '#ffffff');
  assert.equal(style['--chart-cpu'], '#a12640');
  assert.equal(style['--theme-spacing-scale'], 1.1);
  assert.equal(style['--theme-font-scale'], 18 / 16);
  assert.equal(themeStyle(entry, 'dark')['--canvas'], '#111111');
  assert.deepEqual(themeStyle(null, 'dark'), {});
});
test('dashboard order uses semantic sections and preserves omitted sections without restoring hidden ones', () => {
  const layout = dashboardLayout(entry);
  assert.deepEqual(layout.order, ['bgm','performance','summary','storage','devices']);
  assert.equal(layout.columns, 1);
  assert.deepEqual(dashboardLayout(null).order, ['summary','performance','storage','displays','devices','bgm']);
});
test('local theme resources keep package identity and encode every path segment', () => {
  assert.equal(themeAssetUrl(entry, 'images/night sky.png'), 'kitvi-plugin://kitvi.theme-test/images/night%20sky.png?v=' + 'a'.repeat(64));
});
test('native player is visible only when fully inside every scrolling clip and no modal is open', () => {
  const rect = {x:40,y:100,width:320,height:220};
  assert.equal(viewportWithinClips(rect, [{x:0,y:58,width:1000,height:700}], false), true);
  assert.equal(viewportWithinClips(rect, [{x:0,y:110,width:1000,height:700}], false), false);
  assert.equal(viewportWithinClips(rect, [{x:0,y:58,width:1000,height:700}], true), false);
  assert.equal(viewportWithinClips({...rect,width:199}, [{x:0,y:58,width:1000,height:700}], false), false);
});
