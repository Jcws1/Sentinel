import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as echarts from 'echarts';
import { session } from './session';

export function Probe({ id }: { id: string }) {
  const state = useSyncExternalStore(session.subscribe, session.get);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (id !== 'chart' || !host.current) return;
    const element = host.current;
    const ownerWindow=element.ownerDocument.defaultView!;
    let instance:echarts.ECharts|undefined;
    let pending=0;
    const resize = () => {
      pending=0;
      if(!element.clientWidth || !element.clientHeight)return;
      if(!instance){
        instance=echarts.init(element,undefined,{renderer:'canvas'});chart.current=instance;
        const time=session.get().time;
        instance.setOption({animation:false,tooltip:{},xAxis:{type:'category',data:['A','B']},yAxis:{},series:[{type:'bar',data:[10+time,20+time]}]});
        element.dataset.values=JSON.stringify([10+time,20+time]);
        instance.on('click',p=>session.change({selection:p.name==='A'?'ENTITY-A':'ENTITY-B'}));
      }else if(instance.getWidth()!==element.clientWidth || instance.getHeight()!==element.clientHeight){
        instance.resize();
      }
      element.dataset.chartWidth = String(instance.getWidth());
      element.dataset.chartHeight = String(instance.getHeight());
    };
    const schedule=()=>{if(!pending)pending=ownerWindow.requestAnimationFrame(resize);};
    const observer = new ResizeObserver(schedule);
    observer.observe(element); schedule();
    return () => { observer.disconnect();ownerWindow.cancelAnimationFrame(pending); instance?.dispose(); chart.current = null; };
  }, [id]);
  useEffect(() => {
    chart.current?.setOption({ series: [{data:[10 + state.time,20 + state.time]}] });
    if(host.current) host.current.dataset.values = JSON.stringify([10+state.time,20+state.time]);
  }, [state.time]);
  return <section className="probe" data-probe={id}>
    <strong>{id === 'chart' ? 'ECharts probe' : 'Shared context probe'}</strong>
    <output data-selection>{state.selection}</output>
    <output data-time>Time {state.time}</output>
    <output data-revision>Revision {state.revision}</output>
    <div><button onClick={() => session.change({selection:state.selection === 'ENTITY-A' ? 'ENTITY-B':'ENTITY-A'})}>Toggle selection</button>
      <button onClick={() => session.change({time:state.time+1})}>Advance time</button></div>
    {id === 'chart' && <div ref={host} className="chart" data-chart />}
  </section>;
}
