import { createRoot } from 'react-dom/client';
import { Actions, DockLocation, Layout, Model } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { Probe } from './Probe';

export function startFlex(host: HTMLElement) {
  const model = Model.fromJson({ global: {tabEnablePopout:true,tabEnablePopoutIcon:true}, borders:[], layout:{type:'row',children:[{type:'tabset',id:'main',children:[
    {type:'tab',id:'context',name:'Context',component:'probe'},
    {type:'tab',id:'chart',name:'Chart',component:'probe'}]}]} });
  createRoot(host).render(<Layout model={model} factory={node => <Probe id={node.getId()} />} popoutURL="/popout.html" />);
  return {
    split: () => model.doAction(Actions.moveNode('chart','main',DockLocation.RIGHT,-1)),
    popout: () => model.doAction(Actions.popoutTab('chart','window')),
    close: () => {if(model.getNodeById('chart'))model.doAction(Actions.deleteTab('chart'));},
    open: () => { if (!model.getNodeById('chart')) model.doAction(Actions.addNode({type:'tab',id:'chart',name:'Chart',component:'probe'},'main',DockLocation.CENTER,-1)); else model.doAction(Actions.selectTab('chart')); },
    layout: () => model.toJson(),
  };
}
