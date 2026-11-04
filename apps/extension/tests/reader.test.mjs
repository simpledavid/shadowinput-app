import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Reader} from '../build/features/reading/index.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const config={model:'synthetic-model',target:'zh-CN',locale:'zh',automatic:false};
function environment() {
  const dom=new JSDOM('<main><p>Hello world.</p></main>');
  globalThis.Element=dom.window.Element;globalThis.MutationObserver=dom.window.MutationObserver;
  return dom;
}
test('manual injection does not also start a saved automatic rule',async()=>{
  const dom=environment();let calls=0;
  const reader=new Reader(dom.window.document,async type=>{
    if(type==='contentConfig')return {...config,automatic:true};
    if(type==='translateBlock'){calls++;return 'Synthetic translation';}
  });
  await reader.initialize(false);
  assert.equal(calls,0);
  dom.window.close();
});
test('reader inserts bilingual text once and restores the same original paragraph',async()=>{
  const dom=environment(),document=dom.window.document,p=document.querySelector('p');
  let calls=0;
  const reader=new Reader(document,async type=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock'){calls++;return '你好，世界。';}
  });
  await reader.initialize();assert.equal(calls,0);
  await reader.action('toggle');
  assert.equal(calls,1);assert.ok(p.querySelector('[data-shadowinput]'));
  await reader.action('toggle');
  assert.equal(p.querySelector('[data-shadowinput]'),null);
  assert.equal(document.querySelector('p'),p);
  dom.window.close();
});
test('cancel then immediate retry owns a new run; the old response cannot stop or annotate it',async()=>{
  const dom=environment(),document=dom.window.document,replies=[];
  const reader=new Reader(document,async type=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock')return new Promise(resolve=>replies.push(resolve));
  });
  const first=reader.action('toggle');await tick();
  await reader.action('toggle');
  const second=reader.action('toggle');await tick();
  assert.equal(replies.length,2);
  replies[0]('Old translation');await first;
  assert.equal(document.querySelector('[data-shadowinput="translation"]'),null);
  replies[1]('New translation');await second;
  assert.ok(document.querySelector('[data-shadowinput="translation"]').shadowRoot.textContent.includes('New translation'));
  await reader.action('toggle');dom.window.close();
});

test('the webpage error card preserves safe translation diagnostics and stops further work',async()=>{
  const dom=environment(),roots=[];
  const attach=dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.push(root);return root;};
  const {DiagnosedError}=await import('../build/shared/diagnostics.js');
  let cancelled=0;
  const reader=new Reader(dom.window.document,async type=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock')throw new DiagnosedError({stage:'translation',code:'usage_limit',kind:'provider',reason:'subscription_sharing_usage_limit_exceeded'});
    if(type==='cancel')cancelled++;
  });
  try {
    await reader.action('toggle');
    const message=roots[0].querySelector('[role="status"]').textContent;
    assert.match(message,/已达到当前用量限制/);
    assert.match(message,/subscription_sharing_usage_limit_exceeded/);
    assert.equal(cancelled,1);
    assert.equal(dom.window.document.querySelector('[data-shadowinput="translation"]'),null);
  } finally {dom.window.close();}
});

test('completed item stream reaches bilingual reading and restores the original paragraph',async()=>{
  const {translate}=await import('../build/features/translate/index.js');
  const dom=environment(),document=dom.window.document,paragraph=document.querySelector('p');
  const events=[
    {type:'response.output_item.done',output_index:0,item:{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'你好，世界。'}]}},
    {type:'response.completed',response:{status:'completed',output:[]}},
  ];
  const reader=new Reader(document,async(type,fields)=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock')return translate('synthetic',fields.text,config.target,config.model,new AbortController().signal,
      async()=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')));
  });
  try {
    await reader.action('toggle');
    const translated=paragraph.querySelector('[data-shadowinput="translation"]');
    assert.ok(translated,'completed stream should insert a bilingual paragraph instead of an error card');
    assert.match(translated.shadowRoot.textContent,/你好，世界。/);
    assert.match(paragraph.textContent,/Hello world\./);
    await reader.action('toggle');
    assert.equal(document.querySelector('p'),paragraph);
    assert.equal(paragraph.textContent,'Hello world.');
  } finally {dom.window.close();}
});

test('page state belongs to the reader and restoring never needs a model or new config request',async()=>{
  const dom=environment();let offline=false,configs=0;
  const reader=new Reader(dom.window.document,async type=>{
    if(type==='contentConfig'){configs++;if(offline)throw new Error('network_error');return config;}
    if(type==='translateBlock')return '你好，世界。';
  });
  try {
    await reader.action('toggle');
    assert.equal(reader.state().translated,true);
    const before=configs;offline=true;
    await reader.action('restore');
    assert.equal(configs,before,'restore should work without account or model requests');
    assert.equal(reader.state().translated,false);
    assert.equal(dom.window.document.querySelector('[data-shadowinput="translation"]'),null);
  } finally {dom.window.close();}
});

test('the lower floating button translates on click and restores without another request',async()=>{
  const dom=environment(),document=dom.window.document,roots=[];let translations=0;
  const attach=dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.push(root);return root;};
  const reader=new Reader(document,async type=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock'){translations++;return '你好，世界。';}
  },'https://fixture.invalid/icon.png');
  try {
    await reader.initialize(false);await reader.initialize(false);
    assert.equal(document.querySelectorAll('[data-shadowinput="launcher"]').length,1);
    const root=roots.find(root=>root.host.dataset.shadowinput==='launcher');
    const button=root.querySelector('button[data-action="page"]');
    assert.ok(button,'page translation must be the separately named lower action');
    assert.equal(translations,0,'showing the launcher must not send page text');
    assert.equal(button.getAttribute('aria-label'),'翻译此页');
    button.click();await tick();await tick();
    assert.equal(translations,1);assert.equal(button.getAttribute('aria-label'),'恢复原文');
    button.click();await tick();
    assert.equal(translations,1);assert.equal(reader.state().translated,false);
    assert.equal(button.getAttribute('aria-label'),'翻译此页');
  } finally {dom.window.close();}
});

test('sixteen short paragraphs use five bounded requests while the first result stays small',async()=>{
  const dom=environment(),document=dom.window.document,requests=[];
  document.querySelector('main').innerHTML=Array.from({length:16},(_,i)=>'<p>Sentence '+i+'.</p>').join('');
  const reader=new Reader(document,async(type,fields)=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock'){requests.push([fields.text]);return 'Translated '+fields.text;}
    if(type==='translateBatch'){requests.push(fields.texts);return fields.texts.map(text=>'Translated '+text);}
  });
  try {
    await reader.action('translate');
    assert.equal(document.querySelectorAll('[data-shadowinput="translation"]').length,16);
    assert.equal(requests.length,5,'fixed provider overhead should be paid once per batch, not once per paragraph');
    assert.equal(requests[0].length,1,'the first visible result must not wait for a full batch');
    assert.ok(requests.every(texts=>texts.length<=4));
  } finally {await reader.action('restore');dom.window.close();}
});

test('the visible paragraph is translated first and duplicate text only makes one request',async()=>{
  const dom=environment(),document=dom.window.document,requests=[];
  document.querySelector('main').innerHTML='<p>Below the fold.</p><p>Visible sentence.</p><p>Visible sentence.</p>';
  const nodes=[...document.querySelectorAll('p')];
  nodes.forEach((node,index)=>node.getBoundingClientRect=()=>({top:index===0?2000:100,bottom:index===0?2040:140}));
  const reader=new Reader(document,async(type,fields)=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock'){requests.push(fields.text);return 'Translated '+fields.text;}
    if(type==='translateBatch'){requests.push(...fields.texts);return fields.texts.map(text=>'Translated '+text);}
  });
  try {
    await reader.action('translate');
    assert.equal(requests[0],'Visible sentence.');
    assert.equal(requests.filter(text=>text==='Visible sentence.').length,1);
    assert.equal(document.querySelectorAll('[data-shadowinput="translation"]').length,3);
  } finally {await reader.action('restore');dom.window.close();}
});

test('batches stay within limits and preserve long single paragraphs',async()=>{
  const dom=environment(),document=dom.window.document,requests=[];
  const texts=['First.','a'.repeat(3500),'b'.repeat(3500),'c'.repeat(8000),'Last.'];
  document.querySelector('main').replaceChildren(...texts.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  const reader=new Reader(document,async(type,fields)=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock'){requests.push({type,texts:[fields.text]});return 'Translated.';}
    if(type==='translateBatch'){requests.push({type,texts:fields.texts});return fields.texts.map(()=> 'Translated.');}
  });
  try {
    await reader.action('translate');
    assert.equal(document.querySelectorAll('[data-shadowinput="translation"]').length,texts.length);
    for(const request of requests)if(request.type==='translateBatch')assert.ok(request.texts.length<=4 && request.texts.join('').length<=6000);
    assert.ok(requests.some(request=>request.type==='translateBlock' && request.texts[0].length===8000));
  } finally {await reader.action('restore');dom.window.close();}
});

test('batch completions reject changed paragraphs and cancelled work never returns to the page',async()=>{
  const dom=environment(),document=dom.window.document,replies=[];let active=0,peak=0;
  document.querySelector('main').innerHTML=Array.from({length:10},(_,i)=>'<p>Sentence '+i+'.</p>').join('');
  const nodes=[...document.querySelectorAll('p')];
  const reader=new Reader(document,async(type,fields)=>{
    if(type==='contentConfig')return config;
    if(type==='translateBlock' || type==='translateBatch'){
      active++;peak=Math.max(peak,active);
      return new Promise(resolve=>replies.push(()=>{active--;resolve(type==='translateBlock'?'Translated first.':fields.texts.map(text=>'Translated '+text));}));
    }
  });
  const run=reader.action('translate');await tick();
  assert.equal(replies.length,2);assert.equal(peak,2);
  nodes[1].textContent='Changed draft.';
  replies[1]();await tick();
  assert.equal(nodes[1].querySelector('[data-shadowinput="translation"]'),null);
  assert.ok(nodes[2].querySelector('[data-shadowinput="translation"]'));
  await reader.action('restore');
  for(const resolve of replies)resolve();
  await run;
  assert.equal(document.querySelector('[data-shadowinput="translation"]'),null);
  assert.equal(peak,2,'batching must not increase concurrent provider work');
  assert.equal(replies.length,3,'cancelled work must not schedule more batches');
  dom.window.close();
});


test('upper quick action opens a window without reading or translating page content',async()=>{
  const dom=environment(),document=dom.window.document,roots=[],calls=[];
  const attach=dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow=function(options){const root=attach.call(this,options);roots.push(root);return root;};
  const reader=new Reader(document,async(type,fields)=>{
    calls.push({type,fields});if(type==='contentConfig')return config;
  },'https://fixture.invalid/icon.png');
  try {
    await reader.initialize(false);
    const root=roots.find(root=>root.host.dataset.shadowinput==='launcher');
    const buttons=[...root.querySelectorAll('button')];
    assert.equal(buttons.length,2);
    assert.equal(buttons[0].getAttribute('aria-label'),'快捷翻译（新窗口）');
    buttons[0].click();await tick();
    assert.deepEqual(calls.slice(1),[{type:'openQuick',fields:undefined}]);
    assert.equal(document.querySelector('[data-shadowinput="translation"]'),null);
    assert.equal(reader.state().translated,false);
  } finally {dom.window.close();}
});
