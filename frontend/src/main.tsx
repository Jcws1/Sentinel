import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WorkspaceBridge } from './features/workspace/workspaceBridge';
import './styles/index.css';
import { createRuntime } from './app/runtime';
import { OperationalContext } from './app/OperationalContext';

const bridge = new WorkspaceBridge();
const runtime = createRuntime();
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <OperationalContext.Provider value={runtime}>
      <App bridge={bridge} />
    </OperationalContext.Provider>
  </StrictMode>,
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
    bridge.dispose();
    runtime.dispose();
  });
