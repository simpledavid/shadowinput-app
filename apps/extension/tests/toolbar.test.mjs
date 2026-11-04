import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountToolbar} from '../build/features/toolbar/index.js';

const html=await readFile(new URL('../public/popup.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}) {
  const dom=new JSDOM(html,{url:'https://fixture.invalid/'}),calls=[];
  for(const name of ['document','window','HTMLElement','HTMLParagraphElement','HTMLSelectElement','HTMLInputElement','HTMLButtonElement','Option'])globalThis[name]=dom.window[name];
  let closed=false;
  dom.window.close=()=>{closed=true;};
  const values={settings:{target:'zh-CN',locale:'zh',model:'saved-model'},status:{connected:true},
    currentSite:{origin:'https://example.invalid',automatic:false,translated:false,hover:false},
    models:[{id:'first-model',name:'First model'},{id:'saved-model',name:'Saved model'}],...overrides};
  globalThis.chrome={runtime:{getURL:path=>'chrome-extension://fixture/'+path,async sendMessage(message){
    calls.push(message);
    const value=typeof values[message.type]==='function'?await values[message.type](message):values[message.type];
    return value instanceof Error?{ok:false,error:value.message}:{ok:true,data:value};
  }},permissions:{async request(){return false;}},tabs:{async create(value){calls.push({type:'openTab',...value});}}};
  return {dom,calls,values,closed:()=>closed,start:()=>mountToolbar(),get:id=>dom.window.document.getElementById(id)};
}
function visible(element){return element && !element.closest('[hidden]');}

test('ready home has one page action; model and optional tools live in settings',async()=>{
  const f=fixture();await f.start();
  assert.equal(f.get('page-action')?.textContent,'翻译此页');
  assert.equal(f.get('page-action').disabled,false);
  assert.equal([...f.dom.window.document.querySelectorAll('[data-action]')].filter(visible).length,1);
  assert.equal(visible(f.get('model')),false);
  f.get('settings').click();
  assert.equal(visible(f.get('model')),true);
  assert.equal(f.get('model').value,'saved-model');
  assert.equal(f.get('settings').getAttribute('aria-expanded'),'true');
  f.get('settings').click();assert.equal(visible(f.get('model')),false);
});

test('restore remains available when the model catalog fails, without saving or generating',async()=>{
  const f=fixture({currentSite:{origin:'https://example.invalid',translated:true,automatic:false},models:new Error('network_error')});
  await f.start();
  assert.equal(f.get('page-action')?.textContent,'恢复原文');
  assert.equal(f.get('page-action').disabled,false);
  f.get('page-action').click();await tick();
  assert.deepEqual(f.calls.filter(call=>call.type==='pageAction'),[{type:'pageAction',action:'restore'}]);
  assert.equal(f.calls.some(call=>call.type==='saveSettings'),false);
  assert.equal(f.closed(),true);
});

test('loading state replaces an empty model menu and failure offers an explicit retry',async()=>{
  let finish;
  const f=fixture({models:()=>new Promise(resolve=>{finish=resolve;})});
  const mounting=f.start();await tick();
  assert.equal(f.get('page-action')?.textContent,'加载模型中…');
  assert.equal(f.get('page-action').disabled,true);
  assert.match(f.get('model').textContent,/加载/);
  finish(new Error('network_error'));await mounting;
  assert.equal(f.get('page-action').textContent,'重试连接');
  assert.equal(f.get('page-action').disabled,false);
  f.values.models=[{id:'recovered',name:'Recovered model'}];
  f.get('page-action').click();await tick();
  assert.equal(f.get('page-action').textContent,'翻译此页');
  assert.equal(f.calls.some(call=>call.type==='pageAction'),false,'retry must not send webpage text');
});

test('signed-out home offers sign-in and unsupported pages offer text translation',async()=>{
  const f=fixture({status:{connected:false}});await f.start();
  assert.equal(f.get('page-action')?.textContent,'使用 ChatGPT 继续');
  assert.equal(f.calls.some(call=>call.type==='models'),false);
  f.get('page-action').click();await tick();assert.equal(f.calls.at(-1).type,'connect');
  const other=fixture({currentSite:new Error('unsupported_page')});await other.start();
  assert.equal(other.get('page-action').textContent,'打开文本翻译');
  assert.equal(visible(other.get('automatic')),false);
  assert.match(other.get('status').textContent,/切换到/);
  assert.equal(other.get('status').classList.contains('error'),false);
});

test('target changes preserve the chosen model and model changes remain saved',async()=>{
  const f=fixture();await f.start();
  f.get('target').value='en';f.get('target').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.deepEqual(f.calls.filter(call=>call.type==='saveSettings').at(-1).settings,{target:'en',locale:'zh',model:'saved-model'});
  f.get('model').value='first-model';f.get('model').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.equal(f.calls.filter(call=>call.type==='saveSettings').at(-1).settings.model,'first-model');
});

test('denied origin permission rolls the switch back without enabling automatic translation',async()=>{
  const f=fixture();await f.start();
  f.get('automatic').checked=true;f.get('automatic').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.equal(f.get('automatic').checked,false);
  assert.equal(f.calls.some(call=>call.type==='setAutomatic'),false);
  assert.match(f.get('status').textContent,/授予/);
});

test('an existing authorization shows progress instead of starting another login',async()=>{
  const f=fixture({status:{connected:false,pending:true,notice:'waiting'}});await f.start();
  assert.equal(f.get('page-action').textContent,'查看登录进度');
  f.get('page-action').click();await tick();
  assert.equal(f.calls.some(call=>call.type==='connect'),false);
  assert.match(f.calls.find(call=>call.type==='openTab').url,/#account$/);
});

test('account lookup failure retries status instead of starting authorization',async()=>{
  const f=fixture({status:new Error('storage_failed')});await f.start();
  assert.equal(f.get('page-action').textContent,'重试连接');
  f.values.status={connected:true};
  f.get('page-action').click();await tick();
  assert.equal(f.get('page-action').textContent,'翻译此页');
  assert.equal(f.calls.some(call=>call.type==='connect'),false);
});

test('pinning requests only the current origin and never enables automatic translation',async()=>{
  const f=fixture();const grants=[];
  globalThis.chrome.permissions.request=async grant=>{grants.push(grant);return true;};
  await f.start();f.get('settings').click();
  f.get('pinned').checked=true;f.get('pinned').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.deepEqual(grants,[{origins:['https://example.invalid/*']}]);
  assert.deepEqual(f.calls.filter(call=>call.type==='setPinned'),[{type:'setPinned',origin:'https://example.invalid',enabled:true}]);
  assert.equal(f.calls.some(call=>call.type==='setAutomatic' || call.type==='pageAction'),false);
  assert.equal(f.get('automatic').checked,false);
});
