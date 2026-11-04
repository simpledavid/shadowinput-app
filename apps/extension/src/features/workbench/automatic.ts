export type TranslationDraft={text:string;target:string;model:string};
export type TranslationState=
  | {kind:'idle'|'waiting'|'translating'}
  | {kind:'complete';text:string}
  | {kind:'error';reason:unknown};
type TranslationClient={translate:(draft:TranslationDraft)=>Promise<string>;cancel:()=>Promise<unknown>};
type Pending={revision:number;draft:TranslationDraft};
type Active={cancellation?:Promise<void>};
const SETTLE_MS=700;

// Own the debounce, one active request and at most one replacement draft.
export class AutomaticTranslation {
  private revision=0;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private pending:Pending|undefined;
  private active:Active|undefined;
  private disposed=false;
  constructor(private client:TranslationClient,private changed:(state:TranslationState)=>void){}

  update(draft?:TranslationDraft):void {
    if(this.disposed)return;
    this.invalidate();
    this.changed({kind:draft?'waiting':'idle'});
    this.cancelActive();
    if(!draft)return;
    const pending={revision:this.revision,draft};
    this.timer=setTimeout(()=>{
      this.timer=undefined;this.pending=pending;void this.startPending();
    },SETTLE_MS);
  }

  dispose():void {
    this.disposed=true;this.invalidate();this.cancelActive();
  }

  private invalidate():void {
    this.revision++;clearTimeout(this.timer);this.timer=undefined;this.pending=undefined;
  }

  private cancelActive():void {
    const active=this.active;
    if(!active || active.cancellation)return;
    active.cancellation=this.client.cancel().then(()=>undefined,reason=>{
      if(this.disposed)return;
      this.invalidate();this.changed({kind:'error',reason});
    });
  }

  private async startPending():Promise<void> {
    if(this.disposed || this.active || !this.pending)return;
    const pending=this.pending,active:Active={};
    this.pending=undefined;this.active=active;
    this.changed({kind:'translating'});
    try {
      const text=await this.client.translate(pending.draft);
      if(!this.disposed && pending.revision===this.revision)this.changed({kind:'complete',text});
    } catch(reason) {
      if(!this.disposed && pending.revision===this.revision)this.changed({kind:'error',reason});
    } finally {
      // A late document-wide cancellation must finish before starting its replacement.
      await active.cancellation;
      this.active=undefined;
      void this.startPending();
    }
  }
}
