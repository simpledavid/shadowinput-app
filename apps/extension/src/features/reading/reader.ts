import {copy} from '../../shared/copy.js';
import {readingCopy} from '../../shared/reading-copy.js';
import {errorCode} from '../../shared/errors.js';
import {diagnosticOf,diagnosticText} from '../../shared/diagnostics.js';
import {settings,type Settings} from '../../shared/settings.js';
import {object,requiredString} from '../../shared/validation.js';
import {paragraphs,originalText,annotate,restore} from './paragraphs.js';
import {paragraphBatches} from './batches.js';
import {translatedTexts} from '../../shared/translation-batch.js';
import {draft} from './draft.js';
import {card} from './card.js';
import {launcher} from './launcher.js';

type Send=(type:string,fields?:Record<string,unknown>)=>Promise<unknown>;
export class Reader {
  private config:Settings={target:'zh-CN',model:'',locale:'zh'};
  private enabled=false;
  private generation=0;
  private seen=new WeakSet<Element>();
  private cache=new Map<string,string>();
  private count=0;
  private activeScan:number|undefined;
  private hovered:Element|null=null;
  private hoverEnabled=false;
  private hoverTimer:ReturnType<typeof setTimeout>|undefined;
  private mutationTimer:ReturnType<typeof setTimeout>|undefined;
  private observer:MutationObserver;
  private floating:ReturnType<typeof launcher>|undefined;
  constructor(private document:Document,private send:Send,private iconURL?:string) {
    this.observer=new MutationObserver(changes=>{
      if(!this.enabled || changes.every(change=>Array.from(change.addedNodes).every(node=>node instanceof Element && node.hasAttribute('data-shadowinput'))))return;
      clearTimeout(this.mutationTimer);
      this.mutationTimer=setTimeout(()=>void this.scan(),400);
    });
    this.observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('pointerover',event=>this.hover(event));
  }
  async initialize(automatic=true):Promise<void> {
    const config=object(await this.send('contentConfig'));
    this.config=settings(config);
    if(this.iconURL && !this.floating)this.floating=launcher(this.document,this.iconURL,{
      quick:()=>void this.send('openQuick').catch(error=>this.showError(error)),
      page:()=>void this.action('toggle').catch(error=>this.showError(error)),
    });
    this.updateLauncher();
    if(automatic && config.automatic===true)await this.action('toggle');
  }
  private updateLauncher():void {this.floating?.update(this.config.locale,this.state().translated);}
  private get text(){return readingCopy[this.config.locale];}
  state():{translated:boolean;hover:boolean} {
    return {translated:this.enabled || !!this.document.querySelector('[data-shadowinput="translation"]'),hover:this.hoverEnabled};
  }
  private error(error:unknown):string {
    const text=copy[this.config.locale];
    return text.errors[errorCode(error)]+diagnosticText(diagnosticOf(error),text.stages);
  }
  showError(error:unknown):void{this.panel('shadowinput').body.textContent=this.error(error);}
  private panel(title:string) {
    return card(this.document,this.config.locale,title,()=>{});
  }
  private async results(texts:string[]):Promise<string[]> {
    const generation=this.generation,prefix=this.config.model+'|'+this.config.target+'|';
    const resolved=new Map<string,string>();
    for(const text of texts){const cached=this.cache.get(prefix+text);if(cached)resolved.set(text,cached);}
    const missing=texts.filter(text=>!resolved.has(text));
    if(missing.length) {
      const fields={id:crypto.randomUUID()};
      const values=missing.length===1?[requiredString(await this.send('translateBlock',{...fields,text:missing[0]}))]:
        translatedTexts(await this.send('translateBatch',{...fields,texts:missing}),missing.length);
      if(generation!==this.generation)throw new Error('cancelled');
      missing.forEach((text,index)=>{
        const value=requiredString(values[index]);resolved.set(text,value);
        if(this.cache.size>=200)this.cache.delete(this.cache.keys().next().value ?? '');
        this.cache.set(prefix+text,value);
      });
    }
    return texts.map(text=>requiredString(resolved.get(text)));
  }
  private async result(text:string):Promise<string> {return requiredString((await this.results([text]))[0]);}
  async action(action:string):Promise<void> {
    if(action==='restore' || (action==='toggle' && this.state().translated)){this.stop();return;}
    const started=this.generation;
    try {
      this.config=settings(await this.send('contentConfig'));
      if(!this.config.model)throw new Error('sign_in_required');
      if(action==='toggle' || action==='translate') {
        if(this.state().translated)return;
        this.enabled=true;this.updateLauncher();this.count=0;this.seen=new WeakSet();this.generation++;
        await this.scan();
      } else if(action==='selection')await this.selection();
      else if(action==='input')await this.input();
      else if(action==='hover') {
        this.hoverEnabled=!this.hoverEnabled;
        this.panel('shadowinput').body.textContent=this.hoverEnabled?this.text.hoverReady:this.text.close;
      }
    } catch(error){if(started===this.generation)this.panel('shadowinput').body.textContent=this.error(error);}
    finally {this.updateLauncher();}
  }
  private stop():void {
    this.enabled=false;this.generation++;this.activeScan=undefined;this.observer.takeRecords();
    restore(this.document);this.updateLauncher();this.cache.clear();this.seen=new WeakSet();
    void this.send('cancel').catch(error=>{this.panel('shadowinput').body.textContent=this.error(error);});
    this.document.querySelector('[data-shadowinput="panel"]')?.remove();
  }
  private async scan():Promise<void> {
    if(this.activeScan===this.generation || !this.enabled || this.count>=120)return;
    const generation=this.generation;
    this.activeScan=generation;
    const nodes=paragraphs(this.document).filter(node=>!this.seen.has(node)).slice(0,120-this.count);
    if(!nodes.length){this.activeScan=undefined;return;}
    const batches=paragraphBatches(nodes);
    nodes.forEach(node=>this.seen.add(node));
    const panel=card(this.document,this.config.locale,this.text.pageTitle,()=>this.stop());
    panel.button(this.text.restore,()=>this.stop());
    panel.body.textContent=this.text.working;
    let cursor=0;
    const work=async()=>{
      while(cursor<batches.length && this.enabled && generation===this.generation) {
        const batch=batches[cursor++];if(!batch)break;
        const values=await this.results(batch.map(group=>group.text));
        if(!this.enabled || generation!==this.generation)return;
        batch.forEach((group,index)=>{
          for(const node of group.nodes)if(annotate(node,group.text,requiredString(values[index])))this.count++;
        });
        panel.body.textContent=this.count+' '+this.text.progress+(this.count>=120?' · '+this.text.limited:'');
      }
    };
    try{await Promise.all([work(),work()]);}
    catch(error){
      if(generation===this.generation) {
        panel.body.textContent=this.error(error);this.enabled=false;this.generation++;await this.send('cancel');
      }
    }
    finally{if(this.activeScan===generation)this.activeScan=undefined;this.updateLauncher();}
  }
  private async selection():Promise<void> {
    const selected=this.document.getSelection()?.toString().trim() ?? '';
    const panel=this.panel(this.text.selectionTitle);
    if(!selected){panel.body.textContent=this.text.noSelection;return;}
    panel.body.textContent=this.text.working;
    const result=await this.result(selected);
    if(!panel.host.isConnected)return;
    panel.body.textContent=result;
    const button=panel.button(this.text.copy,()=>void navigator.clipboard.writeText(result).then(()=>{button.textContent=this.text.copied;},error=>{panel.body.textContent=this.error(error);}));
  }
  private async input():Promise<void> {
    const pending=draft(this.document.activeElement);
    const panel=this.panel(this.text.inputTitle);
    if(!pending){panel.body.textContent=this.text.noInput;return;}
    panel.body.textContent=this.text.working;
    const result=await this.result(pending.text);
    if(!panel.host.isConnected)return;
    panel.body.textContent=result;
    const apply=panel.button(this.text.apply,()=>{
      if(pending.apply(result))panel.host.remove();
      else {panel.body.textContent=copy[this.config.locale].errors.draft_changed;apply.disabled=true;}
    });
  }
  private hover(event:PointerEvent):void {
    clearTimeout(this.hoverTimer);
    if(!this.hoverEnabled || !event.shiftKey || !(event.target instanceof Element))return;
    const node=event.target.closest('p,li,blockquote,h1,h2,h3,td');
    if(!node || node.closest('[data-shadowinput]') || node===this.hovered)return;
    this.hovered=node;
    this.hoverTimer=setTimeout(()=>{
      const generation=this.generation;
      const text=originalText(node);
      if(!text)return;
      void this.result(text).then(result=>{if(generation===this.generation)annotate(node,text,result);},error=>{this.panel('shadowinput').body.textContent=this.error(error);});
    },300);
  }
}
