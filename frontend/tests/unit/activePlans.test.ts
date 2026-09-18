import { expect, it } from 'vitest';
import sample from '../fixtures/refinement-pursuing.json';
import { validateFrame } from '../../src/contracts/decode';
import { createScene } from '../../src/renderers/scene';
import { displayedRoutePoints } from '../../src/world/activePlans';
import { initialSession } from '../../src/state/sessionStore';
import { defaultDisplayPreferences } from '../../src/state/displayPreferences';

function setup() {
  const frame = validateFrame(structuredClone(sample));
  const session = initialSession(frame.mission.id);
  const member = frame.fleetBehavior!.members![0];
  session.selection.items = [{ kind: 'entity', id: member.entityId }];
  session.selection.primary = session.selection.items[0];
  const prefs = { ...defaultDisplayPreferences };
  const project = () =>
    createScene(
      { frame, status: 'current', mode: 'live' },
      session,
      undefined,
      undefined,
      undefined,
      [],
      prefs,
    );
  return { frame, session, member, prefs, project };
}
it('draws current pursuit separately from a retained destination without inventing another active leg', () => {
  const { frame, project } = setup(),
    before = JSON.stringify(frame),
    scene = project();
  expect(scene.routes).toHaveLength(1);
  expect(scene.routes![0].kind).toBe('pursuit');
  expect(scene.destinations![0].label).toContain('Retained destination');
  expect(scene.objects.find((o) => o.selected)?.planLabel).toBe('Pursuit');
  const target = frame.fleetBehavior!.assignments![0].targetTrackId;
  expect(scene.routes![0].points[1]).toEqual(
    frame.tracks[target].latest.position,
  );
  const objects = scene.objects.map((o) => ({
    ...o,
    position: { ...o.position, longitudeDeg: o.position.longitudeDeg + 0.0001 },
  }));
  const interpolated = displayedRoutePoints(scene.routes![0], objects);
  expect(interpolated[0]).toEqual(objects.find((o) => o.selected)!.position);
  expect(interpolated[1]).toEqual(
    objects.find((o) => o.ref.id === scene.routes![0].targetId)!.position,
  );
  expect(JSON.stringify(frame)).toBe(before);
});
it('keeps pursuit attached to its assigned source and preserves status before truncating a long identity', () => {
  const { frame, member, project } = setup();
  frame.entities[member.entityId].label =
    'A very long friendly identity that occupies the whole marker label';
  const scene = project(),
    route = scene.routes![0];
  expect(scene.destinations![0].label.slice(0, 36)).toContain(
    'Retained destination',
  );
  const alternate = scene.objects.map((o) =>
    o.ref.id === route.targetId
      ? {
          ...o,
          trackId: 'another-source',
          position: { ...o.position, longitudeDeg: 104 },
        }
      : o,
  );
  expect(displayedRoutePoints(route, alternate)[1]).toEqual(route.points[1]);
});
it('resumes only the accepted destination after target loss; clears on Stop, cancellation, End and unavailable data', () => {
  const { frame, member, project } = setup(),
    e = frame.interactive!.executions![0];
  frame.fleetBehavior!.assignments = [];
  member.state = 'armed';
  delete member.assignmentId;
  delete e.suspendedBy;
  e.state = 'Running';
  expect(project().routes?.map((r) => r.kind)).toEqual(['move']);
  for (const state of ['Completed', 'Cancelled', 'Interrupted'] as const) {
    e.state = state;
    expect(project().routes).toEqual([]);
    expect(project().destinations).toEqual([]);
  }
  e.state = 'Running';
  frame.interactive!.state = 'ended';
  expect(project().routes).toEqual([]);
  frame.interactive!.state = 'paused';
  expect(project().routes![0].label).toContain('paused');
  frame.entities[member.entityId].condition = 'non-operational';
  expect(project().routes).toEqual([]);
  frame.entities[member.entityId].condition = 'operational';
  frame.tracks[member.controlTrackId!].state = 'stale';
  expect(project().routes).toEqual([]);
});
it('independent visibility and selection controls clear routes without altering observations or work', () => {
  const { frame, session, prefs, project } = setup();
  session.selection.items = [];
  session.selection.primary = undefined;
  expect(project().routes).toEqual([]);
  prefs.planScope = 'friendly';
  expect(project().routes).toHaveLength(1);
  prefs.plansVisible = false;
  expect(project().routes).toEqual([]);
  expect(project().destinations).toEqual([]);
  expect(frame.interactive!.executions![0].state).toBe('Suspended');
  expect(project().objects).toHaveLength(2);
});
