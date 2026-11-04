import {copy,type Locale} from '../../shared/copy.js';
import {toolbarCopy} from '../../shared/toolbar-copy.js';
import {errorCode} from '../../shared/errors.js';
import {request} from '../../shared/rpc.js';
import {object,requiredString} from '../../shared/validation.js';
import {settings} from '../../shared/settings.js';
import {diagnosticOf,diagnosticText} from '../../shared/diagnostics.js';
import {AutomaticTranslation,type TranslationState} from './automatic.js';

function element<T extends HTMLElement>(id: string, constructor: {new(): T}): T {
  const found = document.getElementById(id);
  if (!(found instanceof constructor)) throw new Error('missing_element');
  return found;
}

export function mountWorkbench(): void {
  const locale: Locale = navigator.language.startsWith('zh') ? 'zh' : 'en';
  const language = element('language',HTMLSelectElement);
  language.value=locale;
  let t = copy[language.value === 'zh' ? 'zh' : 'en'];
  const source = element('source',HTMLTextAreaElement);
  const result = element('result',HTMLTextAreaElement);
  const model = element('model',HTMLSelectElement);
  const target = element('target',HTMLSelectElement);
  const activity = element('translation-activity',HTMLElement);
  const progress = element('translation-status',HTMLParagraphElement);
  const cancel = element('cancel',HTMLButtonElement);
  const retry = element('retry',HTMLButtonElement);
  const connect = element('connect',HTMLButtonElement);
  const logout = element('logout',HTMLButtonElement);
  const cancelSignIn = element('cancel-sign-in',HTMLButtonElement);
  const status = element('status',HTMLParagraphElement);
  const error = element('error',HTMLParagraphElement);
  let connected = false, loadingModels = false, lastNotice = '';
  let savedModel='',composing=false,closed=false;
  let translationState:TranslationState={kind:'idle'};
  const translation=new AutomaticTranslation({
    translate:async draft=>requiredString(await request('translate',draft)),
    cancel:()=>request('cancel'),
  },state=>{translationState=state;error.textContent='';renderTranslation();});

  function schedule():void {
    if(closed)return;
    const ready=connected && !loadingModels && !model.disabled && !!model.value && !composing && !!source.value.trim();
    translation.update(ready?{text:source.value,target:target.value,model:model.value}:undefined);
  }
  function renderTranslation():void {
    if(closed)return;
    const state=translationState,working=state.kind==='waiting' || state.kind==='translating';
    result.value=state.kind==='complete'?state.text:'';
    result.setAttribute('aria-busy',String(working));
    progress.textContent=state.kind==='waiting'?t.settling:state.kind==='translating'?t.translating:'';
    cancel.hidden=!working;retry.hidden=state.kind!=='error';
    activity.hidden=!working && state.kind!=='error';
    if(state.kind==='error')showError(state.reason);
  }
  async function save():Promise<void> {
    await request('saveSettings',{settings:{target:target.value,model:model.value,locale:language.value}});
  }
  function applyCopy(): void {
    t = copy[language.value === 'zh' ? 'zh' : 'en'];
    document.documentElement.lang = language.value === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll<HTMLElement>('[data-copy]').forEach(node=>{
      const key = node.dataset.copy;
      for (const [name,value] of Object.entries(t)) if (name === key && typeof value === 'string') node.textContent = value;
    });
    language.ariaLabel = t.language;
    source.placeholder = t.placeholder; result.placeholder = t.empty;
    Array.from(target.options).forEach((option,index)=>{option.textContent=t.languages[index] ?? '';});
    lastNotice = '';
    if(model.disabled || !model.options.length)modelPlaceholder();
    renderTranslation();
  }
  async function run(action:()=>Promise<void>): Promise<void> {
    error.textContent = '';
    try {await action();} catch (reason) {showError(reason);}
  }
  function showError(reason:unknown):void {
    if(!closed)error.textContent=t.errors[errorCode(reason)]+diagnosticText(diagnosticOf(reason),t.stages);
  }
  function modelPlaceholder():void {
    const labels=toolbarCopy[language.value==='zh'?'zh':'en'];
    model.replaceChildren(new Option(loadingModels?labels.loading:connected?labels.unavailable:labels.signedOut,''));
    model.disabled=true;
  }
  async function loadModels(): Promise<void> {
    if (loadingModels) return;
    savedModel=model.value || savedModel;
    loadingModels = true;modelPlaceholder();schedule();
    try {
      const list = await request('models');
      if(closed || !connected)return;
      if (!Array.isArray(list)) throw new Error('invalid_response');
      if (!list.length) throw new Error('plan_permission');
      const options = list.map(value=>{
        const item=object(value);
        return new Option(requiredString(item.name),requiredString(item.id));
      });
      model.replaceChildren(...options);model.disabled=false;
      if (options.some(option=>option.value === savedModel)) model.value=savedModel;
      await save();
    } catch(reason) {loadingModels=false;modelPlaceholder();throw reason;}
    finally {loadingModels=false;schedule();}
  }
  async function refresh(): Promise<void> {
    const data=object(await request('status'));
    if(closed)return;
    const wasConnected=connected;
    connected=data.connected === true;
    if(!connected && !loadingModels)modelPlaceholder();
    if(wasConnected && !connected)schedule();
    connect.hidden=connected || data.pending === true || data.notice === 'verifying';
    logout.hidden=!connected;
    cancelSignIn.hidden=data.pending !== true;
    status.textContent=data.notice === 'waiting' ? t.waiting : data.notice === 'verifying' ? t.verifying :
      connected ? (typeof data.email === 'string' && data.email ? data.email : t.connected) : t.signedOut;
    if (typeof data.notice === 'string' && lastNotice !== data.notice) {
      lastNotice=data.notice;
      if (data.notice in t.errors) error.textContent=t.errors[errorCode(new Error(data.notice))]+diagnosticText(data.diagnostic,t.stages);
    }
    if (!wasConnected && connected) await loadModels();
  }
  language.addEventListener('change',()=>{applyCopy();void run(async()=>{await save();await refresh();});});
  connect.addEventListener('click',()=>void run(async()=>{await request('connect');await refresh();}));
  cancelSignIn.addEventListener('click',()=>void run(async()=>{await request('cancelSignIn');await refresh();}));
  logout.addEventListener('click',()=>void run(async()=>{translation.update();await request('logout');model.replaceChildren();await refresh();}));
  element('refresh',HTMLButtonElement).addEventListener('click',()=>void run(loadModels));
  source.addEventListener('compositionstart',()=>{composing=true;translation.update();});
  source.addEventListener('compositionend',()=>{composing=false;schedule();});
  source.addEventListener('input',event=>{
    if('isComposing' in event && event.isComposing===true){translation.update();return;}
    schedule();
  });
  for(const control of [model,target])control.addEventListener('change',()=>{schedule();void run(save);});
  element('translation-form',HTMLFormElement).addEventListener('submit',event=>event.preventDefault());
  cancel.addEventListener('click',()=>translation.update());
  retry.addEventListener('click',schedule);
  applyCopy();
  void run(async()=>{
    const config=settings(await request('settings'));
    if(closed)return;
    language.value=config.locale;target.value=config.target;savedModel=config.model;applyCopy();
    await refresh();
  });
  const timer=setInterval(()=>void refresh().catch(showError),2000);
  window.addEventListener('pagehide',()=>{closed=true;clearInterval(timer);translation.dispose();},{once:true});
}
