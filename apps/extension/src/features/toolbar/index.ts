import {copy} from '../../shared/copy.js';
import {readingCopy} from '../../shared/reading-copy.js';
import {toolbarCopy} from '../../shared/toolbar-copy.js';
import {request} from '../../shared/rpc.js';
import {errorCode} from '../../shared/errors.js';
import {settings} from '../../shared/settings.js';
import {object,requiredString} from '../../shared/validation.js';
import {diagnosticOf,diagnosticText} from '../../shared/diagnostics.js';

type Site={origin:string;automatic:boolean;pinned:boolean;hover:boolean};
type ModelState='loading'|'ready'|'failed';
function element<T extends HTMLElement>(id:string,constructor:{new():T}):T {
  const node=document.getElementById(id);
  if(!(node instanceof constructor))throw new Error('invalid_response');
  return node;
}

export async function mountToolbar():Promise<void> {
  let config=settings(await request('settings'));
  const t=copy[config.locale],reading=readingCopy[config.locale],text=toolbarCopy[config.locale];
  const target=element('target',HTMLSelectElement),model=element('model',HTMLSelectElement);
  const pinned=element('pinned',HTMLInputElement),automatic=element('automatic',HTMLInputElement),hover=element('hover',HTMLInputElement);
  const status=element('status',HTMLParagraphElement),accountLink=element('account',HTMLButtonElement);
  const refresh=element('refresh',HTMLButtonElement),input=element('input',HTMLButtonElement);
  let site:Site|undefined,connected=false,checking=true,models:ModelState='loading',busy=false;
  let initializingFailed=false,signingIn=false;
  let notice:{text:string;error:boolean}|undefined;
  document.documentElement.lang=config.locale==='zh'?'zh-CN':'en';
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach(node=>{
    for(const [key,value] of Object.entries({...t,...reading,...text}))if(key===node.dataset.copy && typeof value==='string')node.textContent=value;
  });
  Array.from(target.options).forEach((option,index)=>{option.textContent=t.languages[index] ?? '';});
  target.value=config.target;
  accountLink.title=text.account;
  automatic.title=reading.autoHint;

  function render():void {
    const canTranslate=connected && models==='ready';
    target.disabled=busy || checking || (connected && models==='loading');
    model.disabled=busy || models!=='ready' || !connected;
    refresh.textContent=models==='failed' && connected?text.retry:text.refresh;
    refresh.disabled=busy || checking || !connected || models==='loading';
    automatic.disabled=busy || !site || (!site.automatic && !canTranslate);
    pinned.disabled=busy || !site;
    hover.disabled=busy || !canTranslate;
    input.disabled=busy || !canTranslate;
    element('page-tools',HTMLElement).hidden=!site;
    const group=document.querySelector('.site-setting');
    if(group instanceof HTMLElement)group.hidden=!site;
    element('automatic-hint',HTMLElement).hidden=!site?.automatic;
    accountLink.disabled=busy || checking;
    accountLink.textContent=checking?text.checking:initializingFailed?text.retry:signingIn?text.progress:connected?text.connected:text.signedOut;
    status.textContent=notice?.text ?? (!checking && !site?reading.noPage:'');
    status.classList.toggle('error',notice?.error===true);
  }
  function showError(error:unknown):void {
    notice={text:t.errors[errorCode(error)]+diagnosticText(diagnosticOf(error),t.stages),error:true};render();
  }
  async function run(action:()=>Promise<void>):Promise<void> {
    if(busy)return;
    busy=true;notice=undefined;render();
    try{await action();}catch(error){showError(error);}finally{busy=false;render();}
  }
  async function openWorkbench(anchor:string):Promise<void> {
    await chrome.tabs.create({url:chrome.runtime.getURL('panel.html')+'#'+anchor});window.close();
  }
  async function save():Promise<void> {
    const next=settings({...config,target:target.value,model:model.value || config.model});
    try {await request('saveSettings',{settings:next});config=next;}
    catch(error){target.value=config.target;model.value=config.model;throw error;}
  }
  async function loadModels():Promise<void> {
    models='loading';model.replaceChildren(new Option(text.loading,''));render();
    try {
      const list=await request('models');
      if(!Array.isArray(list))throw new Error('invalid_response');
      if(!list.length)throw new Error('plan_permission');
      const options=list.map(value=>{const item=object(value);return new Option(requiredString(item.name),requiredString(item.id));});
      model.replaceChildren(...options);
      if(options.some(option=>option.value===config.model))model.value=config.model;
      if(model.value!==config.model)await save();
      models='ready';
    } catch(error) {
      models='failed';model.replaceChildren(new Option(text.unavailable,''));
      if(errorCode(error)==='sign_in_required')connected=false;
      showError(error);
    }
    render();
  }
  element('text',HTMLButtonElement).addEventListener('click',()=>void run(()=>openWorkbench('translation-form')));
  accountLink.addEventListener('click',()=>void run(async()=>{
    if(initializingFailed)await initialize();
    else if(signingIn || connected)await openWorkbench('account');
    else {await request('connect');window.close();}
  }));
  target.addEventListener('change',()=>void run(save));
  model.addEventListener('change',()=>void run(save));
  refresh.addEventListener('click',()=>void run(loadModels));
  function siteSwitch(control:HTMLInputElement,key:'automatic'|'pinned',operation:string):void {
    control.addEventListener('change',()=>{
      if(!site || busy)return;
      const selected=site,enabled=control.checked;
      // Request only this origin directly from the explicit user gesture.
      const grant=enabled?chrome.permissions.request({origins:[selected.origin+'/*']}):Promise.resolve(true);
      void run(async()=>{
        try {
          if(!await grant)throw new Error('site_permission');
          await request(operation,{origin:selected.origin,enabled});selected[key]=enabled;
        } finally {control.checked=selected[key];}
      });
    });
  }
  siteSwitch(automatic,'automatic','setAutomatic');
  siteSwitch(pinned,'pinned','setPinned');
  hover.addEventListener('change',()=>void run(async()=>{
    if(!site)return;
    try {await request('pageAction',{action:'hover'});site.hover=hover.checked;window.close();}
    finally {hover.checked=site.hover;}
  }));
  input.addEventListener('click',()=>void run(async()=>{await request('pageAction',{action:'input'});window.close();}));
  async function initialize():Promise<void> {
    checking=true;initializingFailed=false;signingIn=false;site=undefined;notice=undefined;render();
    const [account,current]=await Promise.allSettled([request('status'),request('currentSite')]);
    if(current.status==='fulfilled') {
      const value=object(current.value);
      site={origin:requiredString(value.origin),automatic:value.automatic===true,pinned:value.pinned===true,hover:value.hover===true};
      automatic.checked=site.automatic;pinned.checked=site.pinned;hover.checked=site.hover;
      const host=element('host',HTMLParagraphElement);host.textContent=new URL(site.origin).hostname;host.title=host.textContent;
    } else if(errorCode(current.reason)!=='unsupported_page'){initializingFailed=true;showError(current.reason);}
    checking=false;
    if(account.status==='rejected'){initializingFailed=true;showError(account.reason);render();return;}
    const identity=object(account.value);
    connected=identity.connected===true;signingIn=identity.pending===true || identity.notice==='verifying';
    if(connected)await loadModels();
    else {models='failed';model.replaceChildren(new Option(text.signedOut,''));}
    render();
  }
  await initialize();
}
