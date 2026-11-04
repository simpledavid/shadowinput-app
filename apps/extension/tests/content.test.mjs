import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {manualInjectionMarker} from '../build/shared/config.js';

const manifest=JSON.parse(await readFile(new URL('../public/manifest.json',import.meta.url),'utf8'));
const bundled=await build({entryPoints:[new URL('../build/app/content.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'});
const script=bundled.outputFiles[0].text;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('ordinary page navigation starts the complete toolbar without opening the popup or translating',async()=>{
  const entry=manifest.content_scripts?.find(entry=>entry.js.includes('content.js'));
  assert.ok(entry,'a fresh page must have a declared automatic entry point');
  assert.deepEqual(entry.matches,['http://*/*','https://*/*']);
  assert.equal(entry.all_frames,false);
  for(const host of ['auth.openai.com','api.openai.com','127.0.0.1'])assert.ok(entry.exclude_matches.some(pattern=>pattern.includes(host)));
  const dom=new JSDOM('<main><p>Private page text must stay on this device until translation is requested.</p></main>',{url:'https://example.invalid/article',runScripts:'outside-only'});
  const calls=[],roots=[],listeners=[];
  const attach=dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.push(root);return root;};
  dom.window.chrome={runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
    onMessage:{addListener(listener){listeners.push(listener);}},async sendMessage(message){calls.push(message);return {ok:true,data:{model:'',target:'zh-CN',locale:'zh',automatic:false}};}}};
  try {
    dom.window.eval(script);await tick();
    const toolbar=dom.window.document.querySelector('[data-shadowinput="launcher"]');
    assert.ok(toolbar);assert.equal(toolbar.hidden,false);
    assert.ok(roots[0].querySelector('button[title="快捷翻译（新窗口）"]'));
    assert.ok(roots[0].querySelector('button[title="翻译此页"]'));
    assert.deepEqual(calls.map(message=>message.type),['contentConfig']);
    assert.doesNotMatch(JSON.stringify(calls),/Private page text/);
    dom.window.eval(script);await tick();
    assert.equal(dom.window.document.querySelectorAll('[data-shadowinput="launcher"]').length,1);
    assert.equal(listeners.length,1,'legacy dynamic and static injection must not duplicate listeners');
  } finally {dom.window.close();}
});

test('toolbar state inspection initializes no automatic work and reveals only two booleans',async()=>{
  const dom=new JSDOM('<main><p>Private document fixture.</p></main>');
  for(const key of ['document','Element','MutationObserver'])globalThis[key]=dom.window[key];
  globalThis[manualInjectionMarker]=true;
  const calls=[];let listener;
  globalThis.chrome={runtime:{id:'fixture',getURL:()=>"https://fixture.invalid/icon.png",onMessage:{addListener(fn){listener=fn;}},async sendMessage(message){
    calls.push(message.type);
    return {ok:true,data:{model:'test',locale:'zh',target:'zh-CN',automatic:true}};
  }}};
  try {
    await import('../build/app/content.js');
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['contentConfig']);
    let state;
    listener({type:'readingState'},{id:'other'},value=>{state=value;});
    assert.equal(state,undefined);
    listener({type:'readingState'},{id:'fixture'},value=>{state=value;});
    assert.deepEqual(state,{translated:false,hover:false});
    assert.doesNotMatch(JSON.stringify(state),/Private|model|account/);
  } finally {dom.window.close();}
});
