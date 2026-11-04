import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentSite,currentAction} from '../build/app/sites.js';

test('opening the popup queries reader-owned state without requesting translation',async()=>{
  const calls=[];
  globalThis.chrome={
    tabs:{async query(){return [{id:7,url:'https://example.invalid/article'}];},async get(){return {url:'https://example.invalid/article'};},
      async sendMessage(id,message){calls.push({id,...message});return {translated:true,hover:false};}},
    storage:{local:{async get(){return {sites:{}};}}},
    scripting:{async executeScript(options){calls.push(options);}},
  };
  assert.deepEqual(await currentSite(),{tabID:7,origin:'https://example.invalid',automatic:false,pinned:false,translated:true,hover:false});
  assert.deepEqual(calls.filter(call=>call.type),[{id:7,type:'readingState'}]);
  assert.equal(calls[0].args.length,1,'injection must carry only the manual marker');
  calls[0].func(calls[0].args[0]);
  assert.equal(globalThis[calls[0].args[0]],true);
  delete globalThis[calls[0].args[0]];
  await currentAction('restore');
  assert.deepEqual(calls.at(-1),{id:7,type:'reading',action:'restore'});
});

test('restricted pages cannot be inspected or injected',async()=>{
  let injected=0;
  globalThis.chrome={tabs:{async query(){return [{id:1,url:'chrome://extensions'}];}},
    scripting:{async executeScript(){injected++;}}};
  await assert.rejects(currentSite(),/unsupported_page/);
  assert.equal(injected,0);
});

test('pinning a button and automatic translation independently own one origin script',async()=>{
  const {setPinned,setAutomatic,contentConfig}=await import('../build/app/sites.js');
  const data={sites:{},buttons:{}},scripts=[];let granted=false;
  globalThis.chrome={permissions:{async contains(){return granted;}},storage:{local:{
    async get(key){return Array.isArray(key)?{...data}:{[key]:data[key]};},async set(values){Object.assign(data,values);}}},scripting:{
    async getRegisteredContentScripts(){return [...scripts];},async unregisterContentScripts(){scripts.length=0;},
    async registerContentScripts(values){scripts.push(...values);},
  }};
  const host='https://example.invalid';
  await assert.rejects(setPinned(host,true),/site_permission/);assert.equal(scripts.length,0);
  granted=true;
  await setPinned(host,true);assert.equal(scripts.length,1);
  assert.equal((await contentConfig(host+'/article')).automatic,false,'pinning never enables automatic translation');
  await setAutomatic(host,true);assert.equal(scripts.length,1);
  await setAutomatic(host,false);assert.equal(scripts.length,1,'a pinned launcher survives opting out of translation');
  await setPinned(host,false);assert.equal(scripts.length,0);
});

test('failed preference persistence restores the prior script registration',async()=>{
  const {setPinned}=await import('../build/app/sites.js');
  const scripts=[];
  globalThis.chrome={permissions:{async contains(){return true;}},storage:{local:{
    async get(){return {sites:{},buttons:{}};},async set(){throw new Error('storage_failed');}}},scripting:{
    async getRegisteredContentScripts(){return [...scripts];},async unregisterContentScripts(){scripts.length=0;},
    async registerContentScripts(values){scripts.push(...values);},
  }};
  await assert.rejects(setPinned('https://example.invalid',true),/storage_failed/);
  assert.equal(scripts.length,0);
});
