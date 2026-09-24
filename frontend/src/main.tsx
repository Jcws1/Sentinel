import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WorkspaceBridge } from './features/workspace/workspaceBridge';
import './styles/index.css';
import { createRuntime } from './app/runtime';
import { OperationalContext } from './app/OperationalContext';
import {
  publicDemoConnection,
  requestPrivateAccess,
} from './services/privateDemo';

async function bootstrap() {
  const base = import.meta.env.VITE_SENTINEL_CLOUD_API?.trim();
  const connection = base
    ? import.meta.env.VITE_SENTINEL_PRIVATE_DEMO === '1'
      ? await requestPrivateAccess(base)
      : publicDemoConnection(base)
    : {};
  const bridge = new WorkspaceBridge();
  const runtime = createRuntime(connection);
  if (import.meta.env.MODE === 'verification')
    Object.assign(globalThis, {
      __sentinelAnalyticsTest: {
        inspect: () => ({
          ...runtime.analytics.diagnostics(),
          missionId: runtime.getSnapshot().missionId,
          frameId: runtime.getSnapshot().presentation.frame?.frameId,
          recordedAt: runtime.getSnapshot().presentation.frame?.recordedAt,
          sourceAt: runtime.getSnapshot().presentation.frame?.effectiveAt,
          observed: {
            status: runtime.getSnapshot().observed.status,
            points:
              runtime
                .getSnapshot()
                .observed.data?.segments.reduce(
                  (n, s) => n + s.points.length,
                  0,
                ) ?? 0,
          },
          selected: runtime.getSnapshot().session.selection,
          motion: runtime.motion.diagnostics(),
          audit: runtime.audit.get().status,
        }),
      },
    });
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
}
void bootstrap();
