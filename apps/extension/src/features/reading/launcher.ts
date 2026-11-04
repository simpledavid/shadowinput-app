import {toolbarCopy} from '../../shared/toolbar-copy.js';
import {readingCopy} from '../../shared/reading-copy.js';
import type {Locale} from '../../shared/copy.js';

export function launcher(document:Document,iconURL:string,action:()=>void) {
  const host=document.createElement('div');
  host.dataset.shadowinput='launcher';
  host.style.cssText='all:initial;position:fixed;z-index:2147483646;right:12px;top:60%;width:36px;height:36px;';
  const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{color-scheme:light dark}button{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:3px;background:#ffd000;color:#25221e;border:1px solid #25221e30;border-radius:10px;box-shadow:0 2px 8px #0002;cursor:pointer}img{display:block;width:28px;height:28px;pointer-events:none}button:hover{box-shadow:0 2px 10px #0004}button:focus-visible{outline:2px solid #0866ff;outline-offset:3px}button[aria-pressed="true"]{outline:2px solid #736b61;outline-offset:2px}@media(prefers-color-scheme:dark){button:focus-visible{outline-color:#8bb5ff}button[aria-pressed="true"]{outline-color:#b6aea2}}';
  const button=document.createElement('button'),icon=document.createElement('img');
  button.type='button';icon.src=iconURL;icon.alt='';button.append(icon);
  button.addEventListener('click',action);
  root.append(style,button);document.documentElement.append(host);
  return {update(locale:Locale,translated:boolean):void {
    const label=translated?readingCopy[locale].restore:toolbarCopy[locale].page;
    button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(translated));
  }};
}
