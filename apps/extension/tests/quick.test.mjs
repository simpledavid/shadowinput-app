import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountWorkbench} from '../build/features/workbench/index.js';
import {openQuickWindow} from '../build/app/quick-window.js';
const html=await readFile(new URL('../public/quick.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(overrides={}) {
  const dom=new JSDOM(html,{url:'https://fixture.invalid/quick.html'}),calls=[],copied=[];
  for(const key of ['document','window','HTMLSelectElement','HTMLTextAreaElement','HTMLButtonElement','HTMLParagraphElement','HTMLFormElement','Option'])globalThis[key]=dom.window[key];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'zh-CN',clipboard:{async writeText(text){copied.push(text);}}}});
  const values={settings:{locale:'zh',target:'zh-CN',model:'selected-model'},status:{connected:true,email:'test@example.invalid'},models:[{id:'selected-model',name:'Selected model'}],translate:'你好。',...overrides};
  globalThis.chrome={runtime:{async sendMessage(message){
    calls.push(message);const value=typeof values[message.type]==='function'?await values[message.type](message):values[message.type];
    return value instanceof Error?{ok:false,error:value.message}:{ok:true,data:value};
  }}};
  const get=id=>dom.window.document.getElementById(id);
  return {dom,calls,copied,values,get,async start(){mountWorkbench();await tick();await tick();},close(){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}};
}

test('quick translation opens empty and only translates the explicitly submitted draft',async()=>{
  const f=fixture();try {
    await f.start();
    assert.equal(f.get('source').value,'');assert.equal(f.get('result').value,'');
    assert.equal(f.get('translate').disabled,true);
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.get('source').value='Hello.';f.get('source').dispatchEvent(new f.dom.window.Event('input'));
    f.get('translation-form').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));
    await tick();
    assert.deepEqual(f.calls.filter(call=>call.type==='translate'),[{type:'translate',text:'Hello.',target:'zh-CN',model:'selected-model'}]);
    assert.equal(f.get('result').value,'你好。');
    f.get('copy').click();await tick();assert.deepEqual(f.copied,['你好。']);
  } finally {f.close();}
});

test('quick translation exposes sign-in and can cancel without displaying a partial result',async()=>{
  const signedOut=fixture({status:{connected:false}});try {
    await signedOut.start();assert.equal(signedOut.get('connect').hidden,false);assert.equal(signedOut.get('translate').disabled,true);
    signedOut.get('connect').click();await tick();assert.ok(signedOut.calls.some(call=>call.type==='connect'));
  } finally {signedOut.close();}
  let finish;
  const f=fixture({translate:()=>new Promise(resolve=>{finish=resolve;}),cancel:()=>{finish(new Error('cancelled'));}});
  try {
    await f.start();f.get('source').value='Wait for translation.';f.get('source').dispatchEvent(new f.dom.window.Event('input'));
    f.get('translation-form').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();
    assert.equal(f.get('cancel').hidden,false);assert.equal(f.get('copy').disabled,true);
    f.get('cancel').click();await tick();await tick();
    assert.equal(f.get('result').value,'');assert.match(f.get('error').textContent,/已取消/);
  } finally {f.close();}
});

test('a failed window operation can be retried without retaining a rejected opening promise',async()=>{
  let attempts=0;
  globalThis.chrome={runtime:{getURL:()=> 'chrome-extension://fixture/quick.html',async getContexts(){return [];}},windows:{async create(){if(++attempts===1)throw new Error('window_failed');return {id:1};}}};
  await assert.rejects(openQuickWindow(),/window_failed/);
  await openQuickWindow();assert.equal(attempts,2);
});

test('quick-window model loading and failure never leave an empty actionable selector',async()=>{
  let finish;
  const f=fixture({models:()=>new Promise(resolve=>{finish=resolve;})});
  try {
    await f.start();
    assert.equal(f.get('model').disabled,true);assert.match(f.get('model').textContent,/加载/);
    finish(new Error('network_error'));await tick();await tick();
    assert.equal(f.get('model').disabled,true);assert.match(f.get('model').textContent,/未加载/);
    assert.equal(f.get('translate').disabled,true);
    f.values.models=[{id:'selected-model',name:'Selected model'}];
    f.get('refresh').click();await tick();
    assert.equal(f.get('model').disabled,false);assert.equal(f.get('model').value,'selected-model');
  } finally {if(finish)finish(new Error('cancelled'));await tick();f.close();}
});
