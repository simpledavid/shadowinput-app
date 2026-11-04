import {toolbarCopy} from '../../shared/toolbar-copy.js';
import {readingCopy} from '../../shared/reading-copy.js';
import type {Locale} from '../../shared/copy.js';

function windowIcon(document:Document):SVGElement {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d','M4 4.5h16v15H4z M4 8.5h16 M8 12h8 M8 15.5h5');
  svg.append(path);return svg;
}

export function launcher(document:Document,iconURL:string,actions:{quick:()=>void;page:()=>void}) {
  const host=document.createElement('div');
  host.dataset.shadowinput='launcher';
  host.style.cssText='all:initial;position:fixed;z-index:2147483646;right:12px;top:min(60%,calc(100vh - 92px));width:36px;height:78px;';
  const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{color-scheme:light dark}section{display:flex;flex-direction:column;gap:6px}button{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:3px;background:#fffdf8;color:#25221e;border:1px solid #cec7b9;border-radius:10px;box-shadow:0 2px 8px #0002;cursor:pointer}button[data-action="page"]{background:#ffd000;color:#25221e;border-color:#25221e30}img{display:block;width:28px;height:28px;pointer-events:none}svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round;pointer-events:none}button:hover{box-shadow:0 2px 10px #0004}button:focus-visible{outline:2px solid #0866ff;outline-offset:3px}button[aria-pressed="true"]{outline:2px solid #736b61;outline-offset:2px}@media(prefers-color-scheme:dark){button{background:#211e1a;color:#f7f4ee;border-color:#62594c}button:focus-visible{outline-color:#8bb5ff}button[aria-pressed="true"]{outline-color:#b6aea2}}';
  const group=document.createElement('section'),quick=document.createElement('button'),page=document.createElement('button');
  quick.type='button';quick.dataset.action='quick';quick.append(windowIcon(document));
  page.type='button';page.dataset.action='page';
  const icon=document.createElement('img');icon.src=iconURL;icon.alt='';page.append(icon);
  quick.addEventListener('click',actions.quick);page.addEventListener('click',actions.page);
  group.append(quick,page);root.append(style,group);document.documentElement.append(host);
  return {update(locale:Locale,translated:boolean):void {
    quick.title=toolbarCopy[locale].quick;quick.setAttribute('aria-label',quick.title);
    page.title=translated?readingCopy[locale].restore:toolbarCopy[locale].page;
    page.setAttribute('aria-label',page.title);page.setAttribute('aria-pressed',String(translated));
  }};
}
