import {batchLimits} from '../../shared/translation-batch.js';
import {originalText} from './paragraphs.js';

type ParagraphGroup={text:string;nodes:Element[]};

function visible(node:Element):boolean {
  const rect=node.getBoundingClientRect(),height=node.ownerDocument.defaultView?.innerHeight ?? 0;
  return rect.bottom>=0 && rect.top<height;
}

export function paragraphBatches(nodes:Element[]):ParagraphGroup[][] {
  const grouped=new Map<string,ParagraphGroup>();
  for(const node of nodes) {
    const text=originalText(node);
    if(!text)continue;
    const group=grouped.get(text);
    if(group)group.nodes.push(node);else grouped.set(text,{text,nodes:[node]});
  }
  const groups=[...grouped.values()].sort((left,right)=>Number(right.nodes.some(visible))-Number(left.nodes.some(visible)));
  const first=groups.shift();
  if(!first)return [];
  // Keep the first result small; amortize request overhead across later paragraphs.
  const batches:ParagraphGroup[][]=[[first]];
  let batch:ParagraphGroup[]=[],characters=0;
  for(const group of groups) {
    if(batch.length && (batch.length>=batchLimits.paragraphs || characters+group.text.length>batchLimits.characters)) {
      batches.push(batch);batch=[];characters=0;
    }
    batch.push(group);characters+=group.text.length;
  }
  if(batch.length)batches.push(batch);
  return batches;
}
