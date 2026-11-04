import {object,requiredString} from './validation.js';

export const batchLimits={paragraphs:4,characters:6000} as const;

export function batchTexts(value:unknown):string[] {
  if(!Array.isArray(value) || !value.length || value.length>batchLimits.paragraphs)throw new Error('invalid_input');
  const texts=value.map(requiredString);
  if(texts.reduce((sum,text)=>sum+text.length,0)>batchLimits.characters)throw new Error('invalid_input');
  return texts;
}

export function translatedTexts(value:unknown,count:number):string[] {
  if(!Array.isArray(value) || value.length!==count)throw new Error('invalid_response');
  return value.map(requiredString);
}

export function batchOutput(text:string,count:number):string[] {
  let value:unknown;
  try {value=JSON.parse(text);}catch{throw new Error('invalid_response');}
  const items=object(value).translations;
  if(!Array.isArray(items) || items.length!==count)throw new Error('invalid_response');
  const result=new Map<number,string>();
  for(const raw of items) {
    const item=object(raw),id=item.id;
    if(typeof id!=='number' || !Number.isInteger(id) || id<0 || id>=count || result.has(id))throw new Error('invalid_response');
    result.set(id,requiredString(item.text));
  }
  return Array.from({length:count},(_,id)=>requiredString(result.get(id)));
}
