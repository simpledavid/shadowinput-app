import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTranslation,translate,models} from '../build/features/translate/index.js';

function stream(events, split = 9) {
  const bytes=new TextEncoder().encode(events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({start(controller){
    for(let n=0;n<bytes.length;n+=split)controller.enqueue(bytes.slice(n,n+split));
    controller.close();
  }}));
}
test('translation handles split UTF-8 and only returns after provider completion',async()=>{
  const result=await readTranslation(stream([
    {type:'response.output_text.delta',delta:'你好，'},
    {type:'response.output_text.delta',delta:'世界。'},
    {type:'response.completed',response:{status:'completed'}},
  ]));
  assert.equal(result,'你好，世界。');
});
test('truncated, refused, failed and incomplete text can never be applied',async()=>{
  const delta={type:'response.output_text.delta',delta:'partial'};
  for(const tail of [[],[{type:'response.incomplete'}],[{type:'response.refusal.delta'}],[{type:'response.failed'}],[{type:'response.completed',response:{status:'incomplete'}}]]) {
    await assert.rejects(readTranslation(stream([delta,...tail])));
  }
});
test('oversized and malformed provider output is rejected',async()=>{
  await assert.rejects(readTranslation(stream([{type:'response.output_text.delta',delta:'a'.repeat(256001)},{type:'response.completed',response:{status:'completed'}}], 8192)));
  await assert.rejects(readTranslation(new Response('data: invalid\n\n')));
});

test('translation submits only the requested text using the documented plan request shape',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization,'Bearer synthetic');
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.input,[{role:'user',content:'Hello'}]);
    assert.equal(body.store,false);assert.equal(body.stream,true);
    assert.equal(body.temperature,undefined);assert.equal(body.max_output_tokens,undefined);
    return stream([{type:'response.output_text.delta',delta:'你好'},{type:'response.completed',response:{status:'completed'}}]);
  };
  const signal=new AbortController().signal;
  assert.equal(await translate('synthetic','Hello','zh-CN','model-test',signal,fetcher),'你好');
  for(const args of [['','zh-CN','model-test'],['a'.repeat(8001),'en','model-test'],['Hello','invalid','model-test'],['Hello','en','']]) {
    await assert.rejects(translate('synthetic',...args,signal,fetcher),/invalid_input/);
  }
  assert.equal(calls,1);
});

test('model picker uses only the authorized visible catalog',async()=>{
  const list=await models('synthetic',async()=>Response.json({models:[{slug:'allowed',display_name:'Allowed',visibility:'list'},{slug:'hidden',display_name:'Hidden',visibility:'hidden'}]}));
  assert.deepEqual(list,[{id:'allowed',name:'Allowed'}]);
  await assert.rejects(models('synthetic',async()=>Response.json({models:[]})),/plan_permission/);
  await assert.rejects(models('synthetic',async()=>new Response('',{status:401})),/sign_in_required/);
});

test('a completed response supplies authoritative text even without text deltas',async()=>{
  const completed={type:'response.completed',response:{status:'completed',output:[
    {type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'完整译文。'}]},
  ]}};
  assert.equal(await readTranslation(stream([completed])),'完整译文。');
  assert.equal(await readTranslation(stream([{type:'response.output_text.delta',delta:'不完整'},completed])),'完整译文。');
  const refused=structuredClone(completed);
  refused.response.output[0].content=[{type:'refusal',refusal:'private-refusal-canary'}];
  await assert.rejects(readTranslation(stream([refused])),/translation_refused/);
});

test('stream failures distinguish plan usage, availability, permission and model errors',async()=>{
  const cases=[
    ['subscription_sharing_usage_limit_exceeded','usage_limit'],
    ['rate_limit_exceeded','usage_limit'],
    ['subscription_sharing_usage_unavailable','service_unavailable'],
    ['subscription_sharing_user_unavailable','service_unavailable'],
    ['server_error','service_unavailable'],
    ['subscription_sharing_user_not_eligible','plan_restricted'],
    ['subscription_sharing_unsupported_capability','request_rejected'],
    ['model_not_found','model_unavailable'],
    ['model_not_available','model_unavailable'],
  ];
  for(const [code,expected] of cases) {
    for(const event of [{type:'response.failed',response:{error:{code,message:'private-message-canary'}}},{type:'error',code,message:'private-message-canary'}]) {
      await assert.rejects(translate('synthetic','Hello','zh-CN','model-test',new AbortController().signal,async()=>stream([event])),error=>{
        assert.equal(error.message,expected);
        assert.equal(error.diagnostic.reason,code);
        assert.doesNotMatch(JSON.stringify(error),/private-message-canary/);
        return true;
      });
    }
  }
});

test('interrupted, limited and unknown streams expose safe distinct reasons',async()=>{
  const cases=[
    [[{type:'response.output_text.delta',delta:'partial'}],'incomplete_response','stream_interrupted'],
    [[{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}],'output_limit','max_output_tokens'],
    [[{type:'response.refusal.done',refusal:'private-refusal-canary'}],'translation_refused','refusal'],
    [[{type:'response.failed',response:{error:{code:'private-code-canary',message:'private-message-canary'}}}],'incomplete_response','provider_failed'],
  ];
  for(const [events,code,reason] of cases) {
    await assert.rejects(translate('synthetic','Hello','zh-CN','model-test',new AbortController().signal,async()=>stream(events)),error=>{
      assert.equal(error.message,code);
      assert.equal(error.diagnostic.reason,reason);
      assert.doesNotMatch(JSON.stringify(error),/private-|partial/);
      return true;
    });
  }
});

test('final output never turns partial, refused or empty assistant content into a translation',async()=>{
  const partial={type:'response.output_text.delta',delta:'partial-canary'};
  const message={type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Final translation'}]};
  for(const output of [[],[{...message,status:'incomplete'}],[{...message,content:[{type:'refusal'}]}],[{type:'reasoning',summary:[]}]]) {
    await assert.rejects(readTranslation(stream([partial,{type:'response.completed',response:{status:'completed',output}}])));
  }
  const output=[{...message,phase:'commentary',content:[{type:'output_text',text:'private-commentary-canary'}]},message];
  assert.equal(await readTranslation(stream([partial,{type:'response.completed',response:{status:'completed',output}}])),'Final translation');
});

function item(text, extra={}) {
  return {type:'message',id:'synthetic-message',role:'assistant',status:'completed',content:[{type:'output_text',text}],...extra};
}
function itemDone(message, index=0) {
  return {type:'response.output_item.done',output_index:index,item:message};
}
const emptyCompletion={type:'response.completed',response:{status:'completed',output:[]}};

test('completed item translation survives an empty terminal output without accepting raw deltas',async()=>{
  const events=[
    {type:'response.output_text.delta',delta:'partial-canary'},
    itemDone(item('你好，世界。')),
    emptyCompletion,
  ];
  assert.equal(await translate('synthetic','Hello, world.','zh-CN','model-test',new AbortController().signal,async()=>stream(events)),'你好，世界。');
});

test('item-only completion preserves message order and excludes commentary without duplication',async()=>{
  const events=[
    itemDone(item('private-commentary-canary',{phase:'commentary'}),0),
    itemDone(item('第二段',{phase:'final_answer'}),2),
    itemDone(item('第一段',{phase:'final_answer'}),1),
    itemDone(item('第一段',{phase:'final_answer'}),1),
    emptyCompletion,
  ];
  assert.equal(await readTranslation(stream(events,1)),'第一段\n第二段');
});

test('item completion never bypasses a failed, interrupted or incomplete response',async()=>{
  const done=itemDone(item('partial-canary'));
  for(const tail of [[],[{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}],
    [{type:'response.incomplete'}],[{type:'response.refusal.done'}]]) {
    await assert.rejects(readTranslation(stream([done,...tail])));
  }
  for(const message of [item('partial-canary',{status:'incomplete'}),item('',{content:[{type:'refusal'}]}),item('private-commentary-canary',{phase:'commentary'})]) {
    await assert.rejects(readTranslation(stream([itemDone(message),emptyCompletion])));
  }
});

test('an explicit final message remains authoritative over earlier completed items',async()=>{
  const prior=itemDone(item('old-canary'));
  assert.equal(await readTranslation(stream([prior,{type:'response.completed',response:{status:'completed',output:[item('Final translation')]}}])),'Final translation');
  for(const message of [item(''),item('partial',{status:'incomplete'}),item('',{content:[{type:'refusal'}]}),item('commentary',{phase:'commentary'})]) {
    await assert.rejects(readTranslation(stream([prior,{type:'response.completed',response:{status:'completed',output:[message]}}])));
  }
});

test('unfinished item state, malformed indices and oversized done text cannot be applied',async()=>{
  const added={type:'response.output_item.added',output_index:1,item:item('partial',{status:'in_progress'})};
  await assert.rejects(readTranslation(stream([itemDone(item('first')),added,emptyCompletion])),/incomplete_response/);
  for(const index of [-1,0.5,'0',1024])await assert.rejects(readTranslation(stream([itemDone(item('text'),index),emptyCompletion])),/invalid_response/);
  await assert.rejects(readTranslation(stream([itemDone(item('x'.repeat(256001))),emptyCompletion],8192)),/incomplete_response/);
  await assert.rejects(readTranslation(stream([itemDone(item('private-commentary-canary',{phase:'commentary'})),{type:'response.completed',response:{status:'completed'}}])),/incomplete_response/);
});

test('empty output diagnostics distinguish missing completion from absent final text without retaining content',async()=>{
  const cases=[
    [[], 'empty_output'],
    [[{type:'response.output_text.delta',delta:'private-delta-canary'}],'missing_completed_text'],
    [[itemDone(item('private-commentary-canary',{phase:'commentary'}))],'no_final_text'],
  ];
  for(const [events,reason] of cases) {
    await assert.rejects(translate('synthetic','hello','zh-CN','model-test',new AbortController().signal,async()=>stream([...events,emptyCompletion])),error=>{
      assert.equal(error.diagnostic.reason,reason);
      assert.doesNotMatch(JSON.stringify(error),/private-|hello/);
      return true;
    });
  }
});

test('a paragraph batch sends one bounded request and maps returned ids to the original order',async()=>{
  const {translateBatch}=await import('../build/features/translate/index.js');
  let calls=0;
  const fetcher=async(_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.deepEqual(JSON.parse(body.input[0].content),[{id:0,text:'One.'},{id:1,text:'Two.'}]);
    assert.equal(body.store,false);assert.equal(body.stream,true);
    assert.match(body.instructions,/Simplified Chinese/);
    assert.equal(body.model,'chosen-model');
    return stream([{type:'response.completed',response:{status:'completed',output:[item(JSON.stringify({translations:[{id:1,text:'二。'},{id:0,text:'一。'}]}))]}}]);
  };
  assert.deepEqual(await translateBatch('synthetic',['One.','Two.'],'zh-CN','chosen-model',new AbortController().signal,fetcher),['一。','二。']);
  assert.equal(calls,1);
  for(const texts of [[],Array(5).fill('Text'),['x'.repeat(6001)],['ok',''],['ok',3]]) {
    await assert.rejects(translateBatch('synthetic',texts,'zh-CN','chosen-model',new AbortController().signal,fetcher));
  }
  assert.equal(calls,1,'invalid batches must not reach the provider');
});

test('batch results cannot drop, duplicate, invent or apply incomplete paragraphs',async()=>{
  const {translateBatch}=await import('../build/features/translate/index.js');
  const request=events=>translateBatch('synthetic',['One.','Two.'],'zh-CN','chosen-model',new AbortController().signal,async()=>stream(events));
  const invalid=[
    {translations:[{id:0,text:'one'}]},
    {translations:[{id:0,text:'one'},{id:0,text:'two'}]},
    {translations:[{id:0,text:'one'},{id:2,text:'two'}]},
    {translations:[{id:'0',text:'one'},{id:1,text:'two'}]},
    {translations:[{id:0,text:'one'},{id:1,text:''}]},
    ['one','two'],
  ];
  for(const result of invalid)await assert.rejects(request([{type:'response.completed',response:{status:'completed',output:[item(JSON.stringify(result))]}}]),/invalid_response/);
  await assert.rejects(request([{type:'response.completed',response:{status:'completed',output:[item('private-canary-not-json')]}}]),error=>{
    assert.equal(error.message,'invalid_response');assert.doesNotMatch(JSON.stringify(error),/private-canary/);return true;
  });
  await assert.rejects(request([{type:'response.output_text.delta',delta:JSON.stringify({translations:[{id:0,text:'one'},{id:1,text:'two'}]})}]));
});
