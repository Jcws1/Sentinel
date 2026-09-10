import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WorkspaceBridge } from './features/workspace/workspaceBridge';
import './styles/index.css';

const bridge = new WorkspaceBridge();
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App bridge={bridge} />
  </StrictMode>,
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
    bridge.dispose();
  });
