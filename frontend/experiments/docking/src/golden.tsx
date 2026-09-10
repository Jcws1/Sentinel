import { createRoot, type Root } from 'react-dom/client';
import { GoldenLayout, type ComponentContainer, type ComponentItem, type ContentItem, type LayoutConfig } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import { Probe } from './Probe';

export function startGolden(host: HTMLElement) {
  const roots = new Map<ComponentContainer, {root:Root;element:HTMLElement}>();
  const gl = new GoldenLayout(host, (container, config) => {
    const element = document.createElement('div'); element.className='golden-virtual';
    document.body.appendChild(element);
    const root = createRoot(element); roots.set(container,{root,element});
    root.render(<Probe id={String(config.componentState)} />);
    container.virtualRectingRequiredEvent = (c,w,h) => {
      const r=c.element.getBoundingClientRect();
      Object.assign(element.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${w}px`,height:`${h}px`});
    };
    container.virtualVisibilityChangeRequiredEvent = (_c,visible) => {element.style.display=visible?'':'none';};
    container.virtualZIndexChangeRequiredEvent = (_c,_logical,defaultZIndex) => {element.style.zIndex=defaultZIndex;};
    return {component:element,virtual:true};
  }, container => { const mounted=roots.get(container); if(mounted){mounted.root.unmount();mounted.element.remove();roots.delete(container);} });
  const tab = (id:string,title:string) => ({type:'component' as const,id,title,componentType:'probe',componentState:id});
  const configuration = (split:boolean):LayoutConfig => ({settings:{popInOnClose:true},root:split
    ? {type:'row',content:[{type:'stack',content:[tab('context','Context')]},{type:'stack',content:[tab('chart','Chart')]}]}
    : {type:'row',content:[{type:'stack',content:[tab('context','Context'),tab('chart','Chart')]}]}});
  if(!gl.isSubWindow) gl.loadLayout(configuration(false));
  const resize = new ResizeObserver(() => gl.setSize(host.clientWidth,host.clientHeight));resize.observe(host);
  const find = (id:string,item:ContentItem|undefined=gl.rootItem):ContentItem|undefined => item?.id===id ? item : item?.contentItems.map(child=>find(id,child)).find(Boolean);
  window.addEventListener('beforeunload',()=>gl.closeAllOpenPopouts());
  return {
    // Bounded spike: same view IDs, rebuilt layout; shared session survives remount.
    split:()=>gl.loadLayout(configuration(true)),
    popout:()=>find('chart')?.popout(),
    close:()=>{(find('chart') as ComponentItem|undefined)?.close();},
    open:()=>{ const existing=find('chart') as ComponentItem|undefined;if(existing)existing.focus();else gl.addItem(tab('chart','Chart')); },
    layout:()=>gl.saveLayout(),
  };
}
