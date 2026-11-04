import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentSite,currentAction} from '../build/app/sites.js';

test('a saved automatic rule cannot send content after its origin permission is revoked',async()=>{
  const {contentConfig}=await import('../build/app/sites.js');
  globalThis.chrome={permissions:{async contains(){return false;}},storage:{local:{async get(){return {
    sites:{'https://example.invalid':true},settings:{model:'saved-model',target:'zh-CN',locale:'zh'},
  };}}}};
  assert.equal((await contentConfig('https://example.invalid/article')).automatic,false);
});

test('upgrading retires only legacy owned origin scripts without deleting preferences',async()=>{
  const {retireSiteScripts}=await import('../build/app/sites.js');
  const removed=[],id='site-'+'a'.repeat(64);
  globalThis.chrome={scripting:{async getRegisteredContentScripts(){return [{id},{id:'unrelated-script'},{id:'site-invalid'}];},
    async unregisterContentScripts(filter){removed.push(filter);}}};
  await retireSiteScripts();
  assert.deepEqual(removed,[{ids:[id]}]);
});

test('opening the popup queries reader-owned state without requesting translation',async()=>{
  const calls=[];
  globalThis.chrome={
    tabs:{async query(){return [{id:7,url:'https://example.invalid/article'}];},async get(){return {url:'https://example.invalid/article'};},
      async sendMessage(id,message){calls.push({id,...message});return {translated:true,hover:false};}},
    storage:{local:{async get(){return {sites:{}};}}},
    scripting:{async executeScript(options){calls.push(options);}},
  };
  assert.deepEqual(await currentSite(),{tabID:7,origin:'https://example.invalid',automatic:false,translated:true,hover:false});
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

test('automatic translation requires an origin grant and does not change toolbar registration',async()=>{
  const {setAutomatic,contentConfig}=await import('../build/app/sites.js');
  const data={sites:{},settings:{model:'saved-model',target:'zh-CN',locale:'zh'}};let granted=false;
  globalThis.chrome={permissions:{async contains(){return granted;}},storage:{local:{
    async get(key){return {[key]:data[key]};},async set(values){Object.assign(data,values);}}}};
  const host='https://example.invalid';
  assert.equal((await contentConfig(host+'/article')).automatic,false);
  await assert.rejects(setAutomatic(host,true),/site_permission/);
  assert.deepEqual(data.sites,{});
  granted=true;
  await setAutomatic(host,true);
  assert.equal((await contentConfig(host+'/article')).automatic,true);
  await setAutomatic(host,false);
  assert.equal((await contentConfig(host+'/article')).automatic,false);
});

test('failed automatic preference persistence leaves the previous rule intact',async()=>{
  const {setAutomatic}=await import('../build/app/sites.js');
  const sites={'https://example.invalid':true};
  globalThis.chrome={storage:{local:{async get(){return {sites};},async set(){throw new Error('storage_failed');}}}};
  await assert.rejects(setAutomatic('https://example.invalid',false),/storage_failed/);
  assert.deepEqual(sites,{'https://example.invalid':true});
});
