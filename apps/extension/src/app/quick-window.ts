let opening:Promise<void>|undefined;

async function focusOrCreate():Promise<void> {
  const url=chrome.runtime.getURL('quick.html');
  const contexts=await chrome.runtime.getContexts({documentUrls:[url]});
  const existing=contexts.find(context=>context.documentUrl===url && context.windowId>=0);
  if(existing)await chrome.windows.update(existing.windowId,{focused:true});
  else await chrome.windows.create({url,type:'popup',focused:true,width:680,height:620});
}

export function openQuickWindow():Promise<void> {
  if(!opening)opening=focusOrCreate().finally(()=>{opening=undefined;});
  return opening;
}
