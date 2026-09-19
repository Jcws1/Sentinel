import { ConductorPane } from '../conductor/ConductorPane';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TabNode } from 'flexlayout-react';
import type { WorkspaceBridge } from './workspaceBridge';
import { viewRegistry, viewKind, viewTitle, type ViewId } from './viewRegistry';
import { OperationalReadout } from '../mission/OperationalReadout';
import {
  PaneVisibilityContext,
  useOperationalRuntime,
} from '../../app/OperationalContext';
import { TacticalMap } from '../map/TacticalMap';
import { Credits } from '../credits/Credits';
import { TracksBrowser } from '../entities/TracksBrowser';
import { EntityInspector } from '../entities/EntityInspector';
import { EntityDetails } from '../entities/EntityDetails';
import { MovementPane } from '../movement/MovementPane';
import { UnitsPane } from '../units/UnitsPane';
import { DisplaySettings } from '../settings/DisplaySettings';
import { CockpitPane } from '../cockpit/CockpitPane';
import { DecisionSuggestions } from '../entities/DecisionSuggestions';

export type PaneLifecycleEvent =
  | { type: 'mount' | 'dispose'; viewId: ViewId }
  | { type: 'visibility'; viewId: ViewId; visible: boolean }
  | { type: 'resize'; viewId: ViewId; width: number; height: number };
export interface PaneHooks {
  onPaneEvent?: (event: PaneLifecycleEvent) => void;
  renderExtension?: (id: ViewId) => ReactNode;
}

export function PaneHost({
  id,
  node,
  bridge,
  onPaneEvent,
  renderExtension,
}: PaneHooks & {
  id: ViewId;
  node: TabNode;
  bridge: WorkspaceBridge;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => node.isVisible());
  const runtime = useOperationalRuntime();
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const owner = element.ownerDocument.defaultView!;
    onPaneEvent?.({ type: 'mount', viewId: id });
    onPaneEvent?.({
      type: 'visibility',
      viewId: id,
      visible: node.isVisible(),
    });
    node.setEventListener('visibility', ({ visible }: { visible: boolean }) => {
      setVisible(visible);
      onPaneEvent?.({ type: 'visibility', viewId: id, visible });
    });
    // FlexLayout can select a newly reopened tab between render and this effect.
    // Reconcile after installing the listener so that transition cannot be missed.
    setVisible(node.isVisible());
    let frame = 0;
    let previous = '';
    const Observer = (owner as Window & typeof globalThis).ResizeObserver;
    const observer = new Observer(() => {
      owner.cancelAnimationFrame(frame);
      frame = owner.requestAnimationFrame(() => {
        const { width, height } = element.getBoundingClientRect();
        const size = `${width}:${height}`;
        if (size !== previous) {
          previous = size;
          onPaneEvent?.({ type: 'resize', viewId: id, width, height });
        }
      });
    });
    observer.observe(element);
    return () => {
      owner.cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener('visibility');
      onPaneEvent?.({ type: 'dispose', viewId: id });
    };
  }, [id, node, onPaneEvent]);
  const kind = viewKind(id);
  const title = runtime ? bridge.getViewTitle(id) : viewTitle(id);
  const view = viewRegistry[kind];
  const tactical =
    (kind === 'tactical' || kind === 'three-d') && runtime !== null;
  return (
    <section
      ref={host}
      className="pane"
      data-view={id}
      data-view-kind={kind}
      aria-label={`${title} view`}
      onKeyDown={(event) => {
        // FlexLayout portals do not bubble React events through their DOM tabpanel ancestor.
        // Handle the content-to-tab half here; Layout handles the tab-to-content half.
        if (
          event.key === 'F6' &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          bridge.focus(id);
        }
      }}
    >
      <PaneVisibilityContext.Provider value={visible}>
        {kind === 'suggestions' && runtime ? (
          <DecisionSuggestions bridge={bridge} />
        ) : kind === 'cockpit' && runtime ? (
          <CockpitPane bridge={bridge} visible={visible} />
        ) : kind === 'settings' && runtime ? (
          <DisplaySettings bridge={bridge} />
        ) : kind === 'credits' ? (
          <Credits />
        ) : kind === 'conductor' && runtime ? (
          <ConductorPane bridge={bridge} visible={visible} />
        ) : kind === 'units' && runtime ? (
          <UnitsPane bridge={bridge} />
        ) : kind === 'movement' && runtime ? (
          <MovementPane bridge={bridge} />
        ) : kind === 'tracks' && runtime ? (
          <TracksBrowser bridge={bridge} />
        ) : kind === 'details' && runtime ? (
          <EntityDetails bridge={bridge} />
        ) : kind === 'inspector' && runtime ? (
          <EntityInspector id={id} bridge={bridge} />
        ) : tactical ? (
          <TacticalMap viewId={id} visible={visible} bridge={bridge} />
        ) : (
          <div className="placeholder">
            <span className="constraint-tag">NOT IMPLEMENTED</span>
            <OperationalReadout
              view={{ ...view, title }}
              viewId={id}
              bridge={bridge}
            />
            {renderExtension?.(id)}
          </div>
        )}
      </PaneVisibilityContext.Provider>
    </section>
  );
}
