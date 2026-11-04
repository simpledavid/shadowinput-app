import {toolbarCopy} from '../../shared/toolbar-copy.js';
import {readingCopy} from '../../shared/reading-copy.js';
import type {Locale} from '../../shared/copy.js';

type Point={x:number;y:number};
type Drag={id:number;start:Point;origin:Point;capture:HTMLElement;moved:boolean};
const WIDTH=44,HEIGHT=124,EDGE=8,DRAG_DISTANCE=5;
function icon(document:Document,pathData:string):SVGElement {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',pathData);svg.append(path);return svg;
}
function axis(value:number,extent:number,size:number):number {
  const available=Math.max(0,extent-size),margin=Math.min(EDGE,available/2);
  return Math.max(margin,Math.min(available-margin,value));
}

export function launcher(document:Document,iconURL:string,actions:{quick:()=>void;page:()=>void}) {
  const owner=document.defaultView;if(!owner)throw new Error('invalid_response');
  const view=owner;
  const host=document.createElement('div');
  host.dataset.shadowinput='launcher';
  host.style.cssText=`all:initial;position:fixed;display:block;z-index:2147483646;width:${WIDTH}px;height:${HEIGHT}px;`;
  const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{color-scheme:light dark}*{box-sizing:border-box}section{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px;border:1px solid #cec7b9;border-radius:12px;background:#fffdf8;box-shadow:0 2px 10px #0002;touch-action:none;user-select:none}button{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:100%;height:34px;padding:2px;background:transparent;color:#25221e;border:1px solid transparent;border-radius:8px;cursor:pointer}button[data-action="page"]{background:#ffd000;color:#25221e;border-color:#25221e30}button[data-action="move"]{height:14px;padding:0;cursor:grab;color:#736b61}button[data-action="move"] svg{width:16px;height:12px;stroke-width:3}button[data-action="close"]{width:20px;height:20px;padding:3px;border-radius:50%;color:#736b61}button[data-action="close"] svg{width:12px;height:12px}img{display:block;width:28px;height:28px;pointer-events:none}svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round;pointer-events:none}button:hover{border-color:#736b61}button:focus-visible{outline:2px solid #0866ff;outline-offset:1px}button[aria-pressed="true"]{outline:2px solid #736b61;outline-offset:1px}section[data-dragging="true"],section[data-dragging="true"] button{cursor:grabbing}@media(prefers-color-scheme:dark){section{background:#211e1a;border-color:#62594c}button{color:#f7f4ee}button[data-action="move"],button[data-action="close"]{color:#b6aea2}button:focus-visible{outline-color:#8bb5ff}button[aria-pressed="true"]{outline-color:#b6aea2}}';
  const group=document.createElement('section');
  function button(action:string):HTMLButtonElement {
    const node=document.createElement('button');node.type='button';node.dataset.action=action;return node;
  }
  const move=button('move'),quick=button('quick'),page=button('page'),close=button('close');
  move.append(icon(document,'M8 6h.01 M16 6h.01 M8 12h.01 M16 12h.01 M8 18h.01 M16 18h.01'));
  move.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight');
  quick.append(icon(document,'M4 4.5h16v15H4z M4 8.5h16 M8 12h8 M8 15.5h5'));
  const image=document.createElement('img');image.src=iconURL;image.alt='';page.append(image);
  close.append(icon(document,'M6 6l12 12 M18 6L6 18'));
  let position:Point={x:view.innerWidth-WIDTH-12,y:view.innerHeight*.6};
  let drag:Drag|undefined,suppressClick=false;
  function place(next:Point):void {
    position={x:axis(next.x,view.innerWidth,WIDTH),y:axis(next.y,view.innerHeight,HEIGHT)};
    host.style.left=position.x+'px';host.style.top=position.y+'px';
  }
  function finish(cancelled=false):void {
    if(!drag)return;
    const active=drag;drag=undefined;
    if(cancelled)place(active.origin);
    suppressClick=active.moved;delete group.dataset.dragging;
    if(active.capture.hasPointerCapture(active.id))active.capture.releasePointerCapture(active.id);
  }
  group.addEventListener('pointerdown',event=>{
    if(drag || event.button!==0 || !event.isPrimary)return;
    const target=event.target;
    if(!(target instanceof view.Element))return;
    const capture=target.closest('button') ?? group;
    suppressClick=false;
    if(capture===close)return;
    drag={id:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:position,capture,moved:false};
    capture.setPointerCapture(event.pointerId);
  });
  group.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.start.x,dy=event.clientY-drag.start.y;
    if(!drag.moved && Math.hypot(dx,dy)<DRAG_DISTANCE)return;
    drag.moved=true;group.dataset.dragging='true';event.preventDefault();
    place({x:drag.origin.x+dx,y:drag.origin.y+dy});
  });
  group.addEventListener('pointerup',event=>{if(event.pointerId===drag?.id)finish();});
  const cancelDrag=(event:PointerEvent)=>{if(event.pointerId===drag?.id)finish(true);};
  group.addEventListener('pointercancel',cancelDrag);group.addEventListener('lostpointercapture',cancelDrag);
  group.addEventListener('click',event=>{
    const suppress=suppressClick && event.detail>0;suppressClick=false;
    if(suppress){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  move.addEventListener('keydown',event=>{
    const steps:Record<string,Point>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
    const step=steps[event.key];if(!step)return;
    event.preventDefault();const distance=event.shiftKey?32:8;
    place({x:position.x+step.x*distance,y:position.y+step.y*distance});
  });
  group.addEventListener('keydown',event=>{if(event.key==='Escape' && drag){event.preventDefault();finish(true);}});
  quick.addEventListener('click',actions.quick);page.addEventListener('click',actions.page);
  close.addEventListener('click',()=>{finish(true);host.style.display='none';});
  view.addEventListener('resize',()=>{finish(true);place(position);});
  view.addEventListener('pagehide',()=>finish(true));
  group.append(move,quick,page,close);root.append(style,group);document.documentElement.append(host);place(position);
  return {
    show():void {host.style.display='block';place(position);},
    update(locale:Locale,translated:boolean):void {
      move.title=toolbarCopy[locale].move;move.setAttribute('aria-label',move.title);
      close.title=toolbarCopy[locale].closeLauncher;close.setAttribute('aria-label',close.title);
      quick.title=toolbarCopy[locale].quick;quick.setAttribute('aria-label',quick.title);
      page.title=translated?readingCopy[locale].restore:toolbarCopy[locale].page;
      page.setAttribute('aria-label',page.title);page.setAttribute('aria-pressed',String(translated));
    },
  };
}
