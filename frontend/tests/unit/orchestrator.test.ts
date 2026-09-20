import { afterEach, beforeEach, expect, it } from 'vitest';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import { normalizeOrchestratorLayout } from '../../src/features/workspace/orchestratorLayout';
import { viewIds } from '../../src/features/workspace/viewRegistry';
import { modules } from '../../src/app/moduleRegistry';
import { createScenarioClient } from '../../src/services/scenarioClient';
import { scenarioDeletionImpact } from '../../src/world/scenarioSelection';
import type { ScenarioContent } from '../../src/contracts/generated';
import fixture from '../fixtures/scenario-location/remote-20v20.json';
import { createRuntime } from '../../src/app/runtime';

const cleanup: (() => void)[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function client(content: ScenarioContent) {
  const c = createScenarioClient({
    base: '/api',
    publish: () => {},
    storage: sessionStorage,
    fetcher: async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  });
  cleanup.push(() => c.dispose());
  c.enter();
  c.update(content);
  return c;
}
const content = () => structuredClone(fixture) as ScenarioContent;

it('has one navigation entry and normalizes both legacy open paths without duplicate panes', () => {
  expect(
    viewIds.filter((id) => ['units', 'conductor', 'orchestrator'].includes(id)),
  ).toEqual(['orchestrator']);
  expect(
    modules.filter((m) =>
      ['units', 'conductor', 'orchestrator'].includes(m.id),
    ),
  ).toHaveLength(1);
  const b = new WorkspaceBridge();
  cleanup.push(() => b.dispose());
  b.open('units');
  b.open('conductor');
  expect(
    b.getSnapshot().views.filter((v) => v.id === 'orchestrator'),
  ).toHaveLength(1);
  expect(b.getSnapshot().orchestratorTab).toBe('conductor');
  b.close('units');
  expect(b.getSnapshot().views.some((v) => v.id === 'orchestrator')).toBe(
    false,
  );
  b.open('orchestrator');
  expect(b.getSnapshot().orchestratorTab).toBe('conductor');
});
it('migrates the active legacy tab in place, removes its duplicate, preserves adjacent layout data and source bytes', () => {
  const layout = {
    global: { tabSetMinWidth: 301 },
    borders: [
      {
        type: 'border' as const,
        location: 'left' as const,
        selected: -1,
        children: [
          {
            type: 'tab' as const,
            id: 'details',
            name: 'Details',
            component: 'details',
          },
        ],
      },
    ],
    layout: {
      type: 'row' as const,
      children: [
        {
          type: 'tabset' as const,
          id: 'map-group',
          selected: 0,
          weight: 65,
          children: [
            { type: 'tab' as const, id: 'tactical', component: 'tactical' },
            { type: 'tab' as const, id: 'units', component: 'units' },
          ],
        },
        {
          type: 'tabset' as const,
          id: 'edit-group',
          selected: 1,
          active: true,
          weight: 35,
          children: [
            { type: 'tab' as const, id: 'command', component: 'command' },
            {
              type: 'tab' as const,
              id: 'conductor',
              component: 'conductor',
              config: { retainedPreference: { density: 'compact' } },
            },
          ],
        },
      ],
    },
  };
  const bytes = JSON.stringify(layout),
    result = normalizeOrchestratorLayout(layout);
  expect(JSON.stringify(layout)).toBe(bytes);
  expect(result.tab).toBe('conductor');
  expect(result.layout.borders).toEqual(layout.borders);
  expect(result.layout.layout.children![0]).toMatchObject({
    id: 'map-group',
    selected: 0,
    weight: 65,
    children: [{ id: 'tactical' }],
  });
  expect(result.layout.layout.children![1]).toMatchObject({
    id: 'edit-group',
    selected: 1,
    weight: 35,
    children: [
      { id: 'command' },
      { id: 'orchestrator', config: { orchestratorTab: 'conductor' } },
    ],
  });
  const b = new WorkspaceBridge({ initialLayout: layout });
  cleanup.push(() => b.dispose());
  expect(b.getSnapshot().activeViewId).toBe('orchestrator');
  expect(b.getSnapshot().orchestratorTab).toBe('conductor');
  expect(normalizeOrchestratorLayout(b.layoutModel.toJson()).tab).toBe(
    'conductor',
  );
  b.setOrchestratorTab('units');
  expect(b.layoutModel.getNodeById('orchestrator')?.toJson()).toMatchObject({
    config: {
      retainedPreference: { density: 'compact' },
      orchestratorTab: 'units',
    },
  });
  expect(JSON.stringify(layout)).toBe(bytes);
});
it('keeps existing empty/closed/unrelated layouts unchanged and deduplicates all-authoring tabsets', () => {
  const unchanged = {
    layout: {
      type: 'row' as const,
      children: [{ type: 'tabset' as const, id: 'empty', children: [] }],
    },
  };
  expect(normalizeOrchestratorLayout(unchanged).layout).toEqual(unchanged);
  const b = new WorkspaceBridge({
    initialViews: ['conductor', 'units', 'tactical'],
  });
  cleanup.push(() => b.dispose());
  expect(b.getSnapshot().views.map((v) => v.id)).toEqual([
    'orchestrator',
    'tactical',
  ]);
  expect(b.getSnapshot().orchestratorTab).toBe('conductor');
});
it('reports all scripted dependencies and refuses a whole mixed eligible/ineligible deletion', () => {
  const draft = content();
  draft.actions = draft.actions!.filter((a) => a.unitId !== draft.units[0].id);
  const c = client(draft),
    before = JSON.stringify(c.get().draft);
  const ids = [draft.units[0].id, draft.units[1].id];
  const impact = scenarioDeletionImpact(c.get().draft, ids);
  expect(impact.actions).toHaveLength(2);
  expect(impact.canDelete).toBe(false);
  expect(c.deleteUnits(ids)).toBe(false);
  expect(JSON.stringify(c.get().draft)).toBe(before);
  expect(c.get().error).toContain('No units deleted');
});
it('deletes a deduplicated cross-affiliation selection atomically and preserves all remaining content', () => {
  const draft = content();
  draft.actions = [];
  const c = client(draft);
  const ids = [draft.units[0].id, draft.units[20].id, draft.units[0].id];
  expect(c.deleteUnits(ids)).toBe(true);
  expect(c.get().draft).toEqual({
    ...draft,
    units: draft.units.filter((u) => !ids.includes(u.id)),
  });
  expect(c.get().dirty).toBe(true);
  expect(c.get().review).toBeUndefined();
  const restored = client(c.get().draft as ScenarioContent);
  expect(restored.get().draft.units).toHaveLength(38);
});
it('rejects stale targets, unit edits, origin edits, boundaries and placement without changing content', () => {
  const draft = content();
  draft.actions = [];
  const c = client(draft),
    id = draft.units[0].id,
    before = JSON.stringify(c.get().draft);
  expect(c.deleteUnits([id, 'missing'])).toBe(false);
  expect(JSON.stringify(c.get().draft)).toBe(before);
  c.beginLocation();
  expect(c.deleteUnits([id])).toBe(false);
  c.cancelLocation();
  c.arm({ category: 'friendly', profileId: 'sting-v1', viewId: 'tactical' });
  expect(c.deleteUnits([id])).toBe(false);
  c.arm();
  c.beginBoundary('tactical');
  expect(c.deleteUnits([id])).toBe(false);
  c.cancelBoundary();
  expect(JSON.stringify(c.get().draft)).toBe(before);
});
it('does not alter an uncertain save identity or body when deletion is attempted after restoration', async () => {
  const draft = content();
  draft.actions = [];
  const c = createScenarioClient({
    base: '/api',
    publish: () => {},
    storage: sessionStorage,
    fetcher: async () => {
      throw Error('lost response');
    },
  });
  cleanup.push(() => c.dispose());
  c.enter();
  c.update(draft);
  await c.save();
  const pending = sessionStorage.getItem('sentinel.scenario.pending.v1');
  expect(pending).not.toBeNull();
  expect(c.deleteUnits([draft.units[0].id])).toBe(false);
  const restored = createScenarioClient({
    base: '/api',
    publish: () => {},
    storage: sessionStorage,
    fetcher: async () => {
      throw Error('offline');
    },
  });
  cleanup.push(() => restored.dispose());
  restored.enter();
  expect(restored.deleteUnits([draft.units[0].id])).toBe(false);
  expect(sessionStorage.getItem('sentinel.scenario.pending.v1')).toBe(pending);
  expect(restored.get().draft).toEqual(draft);
});
it('shares mixed draft selection but preserves existing same-category batch eligibility and preferred new-action actor', () => {
  const r = createRuntime({
    fetcher: async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  });
  cleanup.push(() => r.dispose());
  r.enterAuthoring();
  const draft = content();
  draft.actions = [];
  r.updateScenario(draft);
  const friendly = draft.units[1].id,
    hostile = draft.units[20].id;
  r.selectScenarioUnits([friendly, hostile]);
  expect(r.getSnapshot().session.selection.items).toHaveLength(2);
  r.beginActionBatch([friendly, hostile]);
  expect(r.getSnapshot().scenario.actionEdit).toBeUndefined();
  expect(r.getSnapshot().scenario.error).toContain('one category');
  r.selectScenarioUnit(hostile);
  r.beginAction();
  expect(r.getSnapshot().scenario.actionEdit?.unitId).toBe(hostile);
  r.cancelAction();
  expect(r.deleteScenarioUnits([hostile])).toBe(true);
  expect(r.getSnapshot().session.selection.items).toHaveLength(0);
});
