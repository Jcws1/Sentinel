import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore } from 'zustand/vanilla';
import { App } from '../../src/app/App';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import type { PaneLifecycleEvent } from '../../src/features/workspace/PaneHost';
import type { ViewId } from '../../src/features/workspace/viewRegistry';
import type { IJsonModel } from 'flexlayout-react';
import legacyAuthoringLayout from '../fixtures/orchestrator-legacy-layout.json';
import '../../src/styles/index.css';
import './probe.css';

// Deliberately isolated test state. No SessionState, entity, mission, replay or network logic.
const context = createStore(() => ({
  selection: 'sample-alpha',
  time: 120,
  sequence: 0,
}));
const bridge = new WorkspaceBridge({
  allowPopout: true,
  initialLayout: new URL(location.href).searchParams.has('legacy-authoring')
    ? (legacyAuthoringLayout as IJsonModel)
    : undefined,
});
const events: PaneLifecycleEvent[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let stoppedAt = 0;
function stop() {
  clearInterval(timer);
  timer = undefined;
  stoppedAt = performance.now();
}
function start() {
  stop();
  startedAt = performance.now();
  stoppedAt = 0;
  timer = setInterval(
    () =>
      context.setState((state) => ({
        time: state.time + 0.01,
        sequence: state.sequence + 1,
      })),
    10,
  );
}
function Probe({ id }: { id: ViewId }) {
  const snapshot = useSyncExternalStore(context.subscribe, context.getState);
  return (
    <div className="probe" data-probe={id}>
      <strong>Synthetic workspace probe — test data only</strong>
      <output data-probe-value>{JSON.stringify(snapshot)}</output>
      <div>
        <button onClick={() => context.setState({ selection: 'sample-bravo' })}>
          Select sample Bravo
        </button>
        <button onClick={() => bridge.popOut(id)}>Pop out test view</button>
      </div>
    </div>
  );
}
function onPaneEvent(event: PaneLifecycleEvent) {
  events.push(event);
}
function renderExtension(id: ViewId) {
  return <Probe id={id} />;
}
window.__workspaceTest = {
  start,
  stop,
  snapshot: () => ({
    context: context.getState(),
    workspace: bridge.getSnapshot(),
    layout: bridge.layoutModel.toJson(),
    events: [...events],
    elapsedMs: (stoppedAt || performance.now()) - startedAt,
  }),
};
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App
      bridge={bridge}
      onPaneEvent={onPaneEvent}
      renderExtension={renderExtension}
    />
  </StrictMode>,
);
window.addEventListener('beforeunload', stop);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stop();
    root.unmount();
    bridge.dispose();
  });

declare global {
  interface Window {
    __workspaceTest: {
      start: () => void;
      stop: () => void;
      snapshot: () => {
        context: { selection: string; time: number; sequence: number };
        workspace: ReturnType<WorkspaceBridge['getSnapshot']>;
        layout: ReturnType<WorkspaceBridge['layoutModel']['toJson']>;
        events: PaneLifecycleEvent[];
        elapsedMs: number;
      };
    };
  }
}
