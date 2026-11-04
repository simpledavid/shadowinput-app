import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountWorkbench} from '../build/features/workbench/index.js';
import {openQuickWindow} from '../build/app/quick-window.js';
const pages=Object.fromEntries(await Promise.all(['quick','panel'].map(async page=>[page,await readFile(new URL(`../public/${page}.html`,import.meta.url),'utf8')])));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function advance(t,ms=700){t.mock.timers.tick(ms);await tick();await tick();}

function fixture(overrides={},page='quick') {
  const dom=new JSDOM(pages[page],{url:`https://fixture.invalid/${page}.html`}),calls=[],copied=[];
  for(const key of ['document','window','HTMLElement','HTMLSelectElement','HTMLTextAreaElement','HTMLButtonElement','HTMLParagraphElement','HTMLFormElement','Option'])globalThis[key]=dom.window[key];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'zh-CN',clipboard:{async writeText(text){copied.push(text);}}}});
  const values={settings:{locale:'zh',target:'zh-CN',model:'selected-model'},status:{connected:true,email:'test@example.invalid'},models:[{id:'selected-model',name:'Selected model'},{id:'other-model',name:'Other model'}],translate:'你好。',...overrides};
  globalThis.chrome={runtime:{async sendMessage(message){
    calls.push(message);const value=typeof values[message.type]==='function'?await values[message.type](message):values[message.type];
    return value instanceof Error?{ok:false,error:value.message}:{ok:true,data:value};
  }}};
  const get=id=>dom.window.document.getElementById(id);
  return {dom,calls,copied,values,get,
    input(text,composing=false){get('source').value=text;get('source').dispatchEvent(new dom.window.InputEvent('input',{isComposing:composing}));},
    change(id,value){get(id).value=value;get(id).dispatchEvent(new dom.window.Event('change'));},
    async start(){mountWorkbench();await tick();await tick();},
    close(){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}};
}

for(const page of ['quick','panel'])test(`${page} waits for typing to pause and translates the latest draft without action buttons`,async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture({},page);try {
    await f.start();await advance(t);
    assert.equal(f.get('source').value,'');assert.equal(f.get('result').value,'');
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.input('Hel');await advance(t,600);f.input('Hello.');await advance(t,699);
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    await advance(t,1);
    assert.deepEqual(f.calls.filter(call=>call.type==='translate'),[{type:'translate',text:'Hello.',target:'zh-CN',model:'selected-model'}]);
    assert.equal(f.get('result').value,'你好。');
    assert.equal(f.get('translate'),null);assert.equal(f.get('copy'),null);
    assert.deepEqual(f.copied,[],'automatic translation never writes the clipboard');
    assert.match(f.dom.window.document.querySelector('.privacy').textContent,/自动.*OpenAI/);
  } finally {f.close();}
});

test('IME composition is not translated until the committed text settles',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture();try {
    await f.start();f.input('ready');
    f.get('source').dispatchEvent(new f.dom.window.CompositionEvent('compositionstart'));
    f.input('nihao',true);await advance(t,2000);
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.get('source').value='你好';f.get('source').dispatchEvent(new f.dom.window.CompositionEvent('compositionend'));
    await advance(t,699);assert.equal(f.calls.some(call=>call.type==='translate'),false);
    await advance(t,1);assert.equal(f.calls.filter(call=>call.type==='translate').at(-1).text,'你好');
  } finally {f.close();}
});

test('new drafts cancel old work, await cancellation and never show stale output',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const old=deferred(),cancelled=deferred();
  const f=fixture({translate:message=>message.text==='Old'?old.promise:'最新译文',cancel:()=>cancelled.promise});
  try {
    await f.start();f.input('Old');await advance(t);
    f.input('Intermediate');f.input('Latest');await advance(t);
    assert.equal(f.calls.filter(call=>call.type==='cancel').length,1);
    old.resolve('旧译文');await tick();
    assert.equal(f.get('result').value,'');
    assert.equal(f.calls.filter(call=>call.type==='translate').length,1,'late cancellation cannot abort a new request');
    cancelled.resolve();await tick();await tick();
    assert.deepEqual(f.calls.filter(call=>call.type==='translate').map(call=>call.text),['Old','Latest']);
    assert.equal(f.get('result').value,'最新译文');
  } finally {old.resolve('');cancelled.resolve();f.close();}
});

test('changing language or model invalidates the result and translates with the new choices',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture();try {
    await f.start();f.input('Hello');await advance(t);
    f.change('target','ja');f.change('model','other-model');
    assert.equal(f.get('result').value,'');await advance(t);
    assert.deepEqual(f.calls.filter(call=>call.type==='translate').at(-1),{type:'translate',text:'Hello',target:'ja',model:'other-model'});
  } finally {f.close();}
});

test('clearing, cancelling and closing remove queued or active translations',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const response=deferred();const f=fixture({translate:()=>response.promise});
  try {
    await f.start();f.input('pending');f.input('  ');await advance(t);
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.input('cancel before sending');f.get('cancel').click();await advance(t);
    assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.input('running');await advance(t);f.input('');
    response.resolve('outdated');await tick();await tick();
    assert.equal(f.get('result').value,'');assert.ok(f.calls.some(call=>call.type==='cancel'));
    f.input('never sent');f.close();await advance(t);
    assert.equal(f.calls.filter(call=>call.type==='translate').length,1);
  } finally {response.resolve('');f.close();}
});

test('translation failures wait for explicit retry instead of looping',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture({translate:new Error('usage_limit')});try {
    await f.start();f.input('Hello');await advance(t);
    assert.match(f.get('error').textContent,/用量限制/);assert.equal(f.get('retry').hidden,false);
    await advance(t,10000);assert.equal(f.calls.filter(call=>call.type==='translate').length,1);
    f.values.translate='你好';f.get('retry').click();await advance(t);
    assert.equal(f.get('result').value,'你好');assert.equal(f.get('retry').hidden,true);
  } finally {f.close();}
});

test('cancellation failure stops queued work and permits a deliberate retry after settlement',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const old=deferred();const f=fixture({translate:()=>old.promise,cancel:new Error('network_error')});
  try {
    await f.start();f.input('Old');await advance(t);f.input('New');await advance(t);
    old.resolve('outdated');await tick();await tick();
    assert.equal(f.get('result').value,'');assert.match(f.get('error').textContent,/连接/);
    assert.equal(f.calls.filter(call=>call.type==='translate').length,1);
    f.values.translate='new result';f.get('retry').click();await advance(t);
    assert.equal(f.get('result').value,'new result');
  } finally {old.resolve('');f.close();}
});

test('signed-out or unavailable models cannot send a draft; a model refresh restores automatic translation',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const signedOut=fixture({status:{connected:false}});try {
    await signedOut.start();signedOut.input('Hello');await advance(t);
    assert.equal(signedOut.calls.some(call=>call.type==='translate'),false);
    signedOut.get('connect').click();await tick();assert.ok(signedOut.calls.some(call=>call.type==='connect'));
  } finally {signedOut.close();}
  const models=deferred();const f=fixture({models:()=>models.promise});
  try {
    await f.start();f.input('Hello');await advance(t);
    assert.equal(f.get('model').disabled,true);assert.match(f.get('model').textContent,/加载/);
    models.resolve(new Error('network_error'));await tick();await tick();
    assert.match(f.get('model').textContent,/未加载/);assert.equal(f.calls.some(call=>call.type==='translate'),false);
    f.values.models=[{id:'selected-model',name:'Selected model'}];f.get('refresh').click();await tick();await advance(t);
    assert.equal(f.get('result').value,'你好。');
  } finally {models.resolve(new Error('cancelled'));f.close();}
});

test('closing an active translation cancels it and ignores its late response',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const response=deferred();const f=fixture({translate:()=>response.promise});
  await f.start();f.input('Hello');await advance(t);const result=f.get('result');
  f.close();response.resolve('must not appear');await tick();await tick();
  assert.ok(f.calls.some(call=>call.type==='cancel'));assert.equal(result.value,'');
});

test('losing the connected account cancels queued work and clears the old result',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const response=deferred();const f=fixture({translate:()=>response.promise});
  try {
    await f.start();f.input('Hello');await advance(t);
    f.values.status={connected:false};await advance(t,2000);
    response.resolve('must not appear');await tick();await tick();
    assert.equal(f.get('result').value,'');assert.equal(f.get('connect').hidden,false);
    assert.ok(f.calls.some(call=>call.type==='cancel'));
  } finally {response.resolve('');f.close();}
});

test('a failed window operation can be retried without retaining a rejected opening promise',async()=>{
  let attempts=0;
  globalThis.chrome={runtime:{getURL:()=> 'chrome-extension://fixture/quick.html',async getContexts(){return [];}},windows:{async create(){if(++attempts===1)throw new Error('window_failed');return {id:1};}}};
  await assert.rejects(openQuickWindow(),/window_failed/);
  await openQuickWindow();assert.equal(attempts,2);
});
