import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Reader} from '../build/features/reading/index.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(translation='你好，世界。') {
  const dom=new JSDOM('<main><p>Hello world.</p></main>'),document=dom.window.document,roots=[],calls=[];
  globalThis.Element=dom.window.Element;globalThis.MutationObserver=dom.window.MutationObserver;
  const attach=dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.push(root);return root;};
  const captures=new Map();
  dom.window.HTMLElement.prototype.setPointerCapture=function(id){captures.set(id,this);};
  dom.window.HTMLElement.prototype.hasPointerCapture=function(id){return captures.get(id)===this;};
  dom.window.HTMLElement.prototype.releasePointerCapture=function(id){captures.delete(id);};
  const reader=new Reader(document,async(type)=>{
    calls.push(type);
    if(type==='contentConfig')return {model:'synthetic',target:'zh-CN',locale:'zh',automatic:false};
    if(type==='translateBlock')return translation;
  },'https://fixture.invalid/icon.png');
  let root,host;
  const position=()=>({x:Number.parseFloat(host.style.left),y:Number.parseFloat(host.style.top)});
  return {dom,document,reader,calls,position,captures,
    get host(){return host;},get root(){return root;},get roots(){return roots;},
    async start(){await reader.initialize(false);root=roots.find(r=>r.host.dataset.shadowinput==='launcher');host=root.host;},
    pointer(node,type,x,y,extras={}){const event=new dom.window.MouseEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,...extras});Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});node.dispatchEvent(event);},
    resize(width,height){Object.defineProperties(dom.window,{innerWidth:{value:width,configurable:true},innerHeight:{value:height,configurable:true}});dom.window.dispatchEvent(new dom.window.Event('resize'));},
    close(){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}};
}

test('close hides only the launcher; reopening preserves translated content and position',async()=>{
  const f=fixture();try {
    await f.start();await f.reader.action('toggle');
    const close=f.root.querySelector('[data-action="close"]');assert.ok(close,'launcher exposes a close action');
    const before=f.position(),calls=f.calls.length;close.click();
    assert.equal(f.host.style.display,'none');assert.equal(f.calls.length,calls);
    assert.equal(f.reader.state().translated,true);assert.ok(f.document.querySelector('[data-shadowinput="translation"]'));
    await f.reader.initialize(false);
    assert.notEqual(f.host.style.display,'none');assert.deepEqual(f.position(),before);
    assert.equal(f.document.querySelectorAll('[data-shadowinput="launcher"]').length,1);
    assert.equal(f.root.querySelector('[data-action="page"]').getAttribute('aria-pressed'),'true');
  } finally {f.close();}
});

test('dragging an action moves the launcher without firing a quick or page action',async()=>{
  const f=fixture();try {
    await f.start();const button=f.root.querySelector('[data-action="quick"]'),before=f.position();
    f.pointer(button,'pointerdown',before.x+10,before.y+30);
    f.pointer(button,'pointermove',before.x-110,before.y+80);
    f.pointer(button,'pointerup',before.x-110,before.y+80);
    button.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));await tick();
    assert.deepEqual(f.position(),{x:before.x-120,y:before.y+50});
    assert.deepEqual(f.calls,['contentConfig']);assert.equal(f.captures.size,0);
    f.pointer(button,'pointerdown',20,20);f.pointer(button,'pointerup',20,20);button.click();await tick();
    assert.equal(f.calls.at(-1),'openQuick','a later click still works');
  } finally {f.close();}
});

test('minor pointer movement stays a click and non-primary buttons do not start dragging',async()=>{
  const f=fixture();try {
    await f.start();const button=f.root.querySelector('[data-action="quick"]'),before=f.position();
    f.pointer(button,'pointerdown',10,10);f.pointer(button,'pointermove',12,12);f.pointer(button,'pointerup',12,12);button.click();await tick();
    assert.deepEqual(f.position(),before);assert.equal(f.calls.at(-1),'openQuick');
    f.pointer(button,'pointerdown',10,10,{button:2});f.pointer(button,'pointermove',100,100);f.pointer(button,'pointerup',100,100);
    assert.deepEqual(f.position(),before);
  } finally {f.close();}
});

test('drag bounds and viewport resize keep every control visible',async()=>{
  const f=fixture();try {
    await f.start();const move=f.root.querySelector('[data-action="move"]');assert.ok(move);
    f.pointer(move,'pointerdown',10,10);f.pointer(move,'pointermove',-5000,-5000);f.pointer(move,'pointerup',-5000,-5000);
    assert.ok(f.position().x>=0 && f.position().y>=0);
    f.pointer(move,'pointerdown',10,10);f.pointer(move,'pointermove',5000,5000);f.pointer(move,'pointerup',5000,5000);
    f.resize(200,180);
    assert.ok(f.position().x+Number.parseFloat(f.host.style.width)<=200);
    assert.ok(f.position().y+Number.parseFloat(f.host.style.height)<=180);
    assert.deepEqual(f.calls,['contentConfig']);
  } finally {f.close();}
});

test('pointer cancellation restores position and keyboard movement remains available',async()=>{
  const f=fixture();try {
    await f.start();const move=f.root.querySelector('[data-action="move"]');assert.ok(move);const before=f.position();
    f.pointer(move,'pointerdown',10,10);f.pointer(move,'pointermove',-80,40);f.pointer(move,'pointercancel',-80,40);
    assert.deepEqual(f.position(),before);assert.equal(f.captures.size,0);
    move.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
    assert.ok(f.position().x<before.x);assert.deepEqual(f.calls,['contentConfig']);
    const close=f.root.querySelector('[data-action="close"]');
    f.pointer(close,'pointerdown',10,10);f.pointer(close,'pointerup',10,10);
    close.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
    assert.equal(f.host.style.display,'none');
  } finally {f.close();}
});


test('a completed translation does not reopen a launcher hidden while the request was pending',async()=>{
  let finish;const response=new Promise(resolve=>{finish=resolve;});const f=fixture(response);
  try {
    await f.start();const translating=f.reader.action('toggle');await tick();
    f.root.querySelector('[data-action="close"]').click();finish('completed translation');await translating;
    assert.equal(f.host.style.display,'none');assert.equal(f.reader.state().translated,true);
  } finally {finish('');f.close();}
});

test('the extension popup reading-state message reopens a closed launcher without translating',async()=>{
  const f=fixture();let listener;const calls=[];
  try {
    globalThis.document=f.document;
    globalThis.chrome={runtime:{id:'fixture-extension',getURL:path=>'https://fixture.invalid/'+path,
      onMessage:{addListener(value){listener=value;}},async sendMessage(message){
        calls.push(message.type);return {ok:true,data:{model:'synthetic',target:'zh-CN',locale:'en',automatic:false}};
      }}};
    await import('../build/app/content.js');await tick();await tick();
    const host=f.document.querySelector('[data-shadowinput="launcher"]');assert.ok(host);
    const root=f.roots.find(root=>root.host===host);
    assert.equal(root.querySelector('[data-action="close"]').getAttribute('aria-label'),'Close floating toolbar');
    root.querySelector('[data-action="close"]').click();let state;
    listener({type:'readingState'},{id:'fixture-extension'},value=>{state=value;});
    assert.equal(host.style.display,'block');assert.deepEqual(state,{translated:false,hover:false});
    assert.deepEqual(calls,['contentConfig']);
  } finally {f.close();}
});
