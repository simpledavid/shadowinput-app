import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {manualInjectionMarker} from '../build/shared/config.js';

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
