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

async function automatic(host:string):Promise<boolean> {
  const sites=await automaticSites();
  return sites[host]===true && await chrome.permissions.contains({origins:[host+'/*']});
}

async function activeSite():Promise<{tabID:number;origin:string;automatic:boolean}> {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id===undefined || !tab.url)throw new Error('unsupported_page');
  const host=origin(tab.url);
  return {tabID:tab.id,origin:host,automatic:await automatic(host)};
}

export async function currentSite():Promise<{tabID:number;origin:string;automatic:boolean;translated:boolean;hover:boolean}> {
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

async function automaticSites():Promise<Record<string,unknown>> {
  const saved=await chrome.storage.local.get('sites');
  return saved.sites===undefined?{}:object(saved.sites);
}

export async function retireSiteScripts():Promise<void> {
  const registered=await chrome.scripting.getRegisteredContentScripts();
  const ids=registered.filter(script=>/^site-[a-f0-9]{64}$/.test(script.id)).map(script=>script.id);
  if(ids.length)await chrome.scripting.unregisterContentScripts({ids});
}

export async function setAutomatic(host:string,enabled:boolean):Promise<void> {
  if(origin(host)!==host)throw new Error('invalid_input');
  if(enabled && !await chrome.permissions.contains({origins:[host+'/*']}))throw new Error('site_permission');
  const sites={...await automaticSites()};
  if(enabled)sites[host]=true;else delete sites[host];
  await chrome.storage.local.set({sites});
}

export async function contentConfig(url:string):Promise<Settings&{automatic:boolean}> {
  const host=origin(url);
  return {...await preferences(),automatic:await automatic(host)};
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
