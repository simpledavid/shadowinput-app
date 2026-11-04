import {settings,type Settings} from '../shared/settings.js';
import {object} from '../shared/validation.js';
import {manualInjectionMarker} from '../shared/config.js';

export function origin(value:string):string {
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol) || ['auth.openai.com','api.openai.com'].includes(url.hostname))throw new Error('unsupported_page');
  return url.origin;
}

export async function preferences():Promise<Settings> {
  const saved=await chrome.storage.local.get('settings');
  return settings(saved.settings);
}
export async function savePreferences(value:unknown):Promise<void> {
  await chrome.storage.local.set({settings:settings(value)});
}

async function activeSite():Promise<{tabID:number;origin:string;automatic:boolean;pinned:boolean}> {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id===undefined || !tab.url)throw new Error('unsupported_page');
  const host=origin(tab.url),saved=await siteMaps();
  const enabled=saved.sites[host]===true || saved.buttons[host]===true;
  const granted=enabled && await chrome.permissions.contains({origins:[host+'/*']});
  return {tabID:tab.id,origin:host,automatic:saved.sites[host]===true && granted,pinned:saved.buttons[host]===true && granted};
}

export async function currentSite():Promise<{tabID:number;origin:string;automatic:boolean;pinned:boolean;translated:boolean;hover:boolean}> {
  const site=await activeSite();
  await prepareReader(site.tabID);
  const state=object(await chrome.tabs.sendMessage(site.tabID,{type:'readingState'}));
  if(typeof state.translated!=='boolean' || typeof state.hover!=='boolean')throw new Error('invalid_response');
  return {...site,translated:state.translated,hover:state.hover};
}

export async function currentAction(action:string):Promise<void> {
  const site=await activeSite();
  return sendAction(site.tabID,action);
}

async function siteMaps():Promise<{sites:Record<string,unknown>;buttons:Record<string,unknown>}> {
  const saved=await chrome.storage.local.get(['sites','buttons']);
  return {sites:saved.sites===undefined?{}:object(saved.sites),buttons:saved.buttons===undefined?{}:object(saved.buttons)};
}

async function registerSite(id:string,host:string,enabled:boolean):Promise<void> {
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:[id]});
  if(!!registered.length===enabled)return;
  if(enabled)await chrome.scripting.registerContentScripts([{id,matches:[host+'/*'],js:['content.js'],runAt:'document_idle',persistAcrossSessions:true}]);
  else await chrome.scripting.unregisterContentScripts({ids:[id]});
}

async function setSiteOption(host:string,enabled:boolean,key:'sites'|'buttons'):Promise<void> {
  if(origin(host)!==host)throw new Error('invalid_input');
  if(enabled && !await chrome.permissions.contains({origins:[host+'/*']}))throw new Error('site_permission');
  const saved=await siteMaps(),next={...saved,[key]:{...saved[key]}};
  if(enabled)next[key][host]=true;else delete next[key][host];
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(host)));
  const id='site-'+Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join('');
  const previous=!!(await chrome.scripting.getRegisteredContentScripts({ids:[id]})).length;
  await registerSite(id,host,next.sites[host]===true || next.buttons[host]===true);
  try {await chrome.storage.local.set({[key]:next[key]});}
  catch(error){await registerSite(id,host,previous);throw error;}
}
export function setAutomatic(host:string,enabled:boolean):Promise<void> {return setSiteOption(host,enabled,'sites');}
export function setPinned(host:string,enabled:boolean):Promise<void> {return setSiteOption(host,enabled,'buttons');}

export async function contentConfig(url:string):Promise<Settings&{automatic:boolean}> {
  const host=origin(url),saved=await chrome.storage.local.get('sites');
  const sites=saved.sites===undefined?{}:object(saved.sites);
  return {...await preferences(),automatic:sites[host]===true};
}

async function prepareReader(tabID:number):Promise<void> {
  const tab=await chrome.tabs.get(tabID);
  origin(tab.url ?? '');
  await chrome.scripting.executeScript({target:{tabId:tabID},func:(key:string)=>{Reflect.set(globalThis,key,true);},args:[manualInjectionMarker]});
  await chrome.scripting.executeScript({target:{tabId:tabID},files:['content.js']});
}

export async function sendAction(tabID:number,action:string):Promise<void> {
  await prepareReader(tabID);
  await chrome.tabs.sendMessage(tabID,{type:'reading',action});
}
