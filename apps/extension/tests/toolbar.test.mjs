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
  const values={settings:{target:'zh-CN',locale:'zh',model:'saved-model'},status:{connected:true,email:'demo@example.invalid'},
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

test('all controls are visible without a settings page or large page action',async()=>{
  const f=fixture();await f.start();
  assert.equal(f.get('page-action'),null);
  assert.equal(f.get('settings'),null);
  assert.equal(f.dom.window.document.querySelector('footer'),null);
  for(const id of ['target','model','refresh','automatic','pinned','hover','input'])assert.equal(visible(f.get(id)),true,id);
  assert.equal(f.get('model').value,'saved-model');
  assert.equal(f.calls.some(call=>call.type==='pageAction'),false,'opening controls must not translate');
});

test('model failures remain recoverable without any page translation action',async()=>{
  let finish;
  const f=fixture({models:()=>new Promise(resolve=>{finish=resolve;})});
  const mounting=f.start();await tick();
  assert.match(f.get('model').textContent,/加载/);
  assert.equal(f.get('refresh').disabled,true);
  finish(new Error('network_error'));await mounting;
  assert.equal(f.get('refresh').textContent,'重试连接');
  assert.equal(f.get('refresh').disabled,false);
  f.values.models=[{id:'recovered',name:'Recovered model'}];
  f.get('refresh').click();await tick();
  assert.equal(f.get('model').value,'recovered');
  assert.equal(f.calls.some(call=>call.type==='pageAction'),false,'retry must not send webpage text');
});

test('account entry signs in and unsupported pages keep account and model controls available',async()=>{
  const f=fixture({status:{connected:false}});await f.start();
  assert.equal(f.get('account').textContent,'连接 ChatGPT');
  assert.equal(f.calls.some(call=>call.type==='models'),false);
  f.get('account').click();await tick();assert.equal(f.calls.at(-1).type,'connect');
  const other=fixture({currentSite:new Error('unsupported_page')});await other.start();
  assert.equal(visible(other.get('automatic')),false);
  assert.match(other.get('status').textContent,/切换到/);
  assert.equal(other.get('status').classList.contains('error'),false);
  assert.equal(visible(other.get('account')),true);
  assert.equal(other.get('model').disabled,false);
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
  assert.equal(f.get('account').textContent,'查看登录进度');
  f.get('account').click();await tick();
  assert.equal(f.calls.some(call=>call.type==='connect'),false);
  assert.match(f.calls.find(call=>call.type==='openTab').url,/#account$/);
});

test('account lookup failure retries status instead of starting authorization',async()=>{
  const f=fixture({status:new Error('storage_failed')});await f.start();
  assert.equal(f.get('account').textContent,'重试连接');
  f.values.status={connected:true};
  f.get('account').click();await tick();
  assert.equal(f.get('account').textContent,'退出登录');
  assert.equal(f.calls.some(call=>call.type==='connect'),false);
});

test('the popup shows the account and plan even on an unsupported page',async()=>{
  const f=fixture({currentSite:new Error('unsupported_page')});await f.start();
  assert.equal(visible(f.get('account-card')),true);
  assert.equal(f.get('account-email').textContent,'demo@example.invalid');
  assert.match(f.get('account-plan').textContent,/套餐.*用量限制/);
  assert.equal(visible(f.get('account-plan')),true);
  assert.equal(f.get('account').textContent,'退出登录');
  assert.equal(f.calls.some(call=>call.type==='openTab' || call.type==='translate'),false);
});

test('signing out clears the popup identity and models and permits another sign-in',async()=>{
  let finish;
  const f=fixture({logout:()=>new Promise(resolve=>{finish=resolve;})});await f.start();
  f.get('account').click();await tick();
  assert.equal(f.calls.at(-1).type,'logout');
  assert.equal(f.get('account').disabled,true);
  f.get('account').click();
  assert.equal(f.calls.filter(call=>call.type==='logout').length,1);
  finish();await tick();
  assert.equal(f.get('account-email').textContent,'');
  assert.equal(visible(f.get('account-email')),false);
  assert.equal(visible(f.get('account-plan')),false);
  assert.equal(f.get('model').disabled,true);
  assert.equal(f.get('model').value,'');
  assert.equal(f.get('account').textContent,'连接 ChatGPT');
  assert.equal(f.closed(),false);
  f.get('account').click();await tick();
  assert.equal(f.calls.at(-1).type,'connect');
});

test('a failed sign-out keeps account controls and allows a retry',async()=>{
  const f=fixture({logout:new Error('storage_failed')});await f.start();
  f.get('account').click();await tick();
  assert.equal(f.calls.at(-1).type,'logout');
  assert.equal(f.get('account-email').textContent,'demo@example.invalid');
  assert.equal(f.get('model').value,'saved-model');
  assert.equal(f.get('account').textContent,'退出登录');
  assert.equal(f.get('account').disabled,false);
  assert.equal(f.get('status').classList.contains('error'),true);
});

test('pinning requests only the current origin and never enables automatic translation',async()=>{
  const f=fixture();const grants=[];
  globalThis.chrome.permissions.request=async grant=>{grants.push(grant);return true;};
  await f.start();
  f.get('pinned').checked=true;f.get('pinned').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.deepEqual(grants,[{origins:['https://example.invalid/*']}]);
  assert.deepEqual(f.calls.filter(call=>call.type==='setPinned'),[{type:'setPinned',origin:'https://example.invalid',enabled:true}]);
  assert.equal(f.calls.some(call=>call.type==='setAutomatic' || call.type==='pageAction'),false);
  assert.equal(f.get('automatic').checked,false);
});
