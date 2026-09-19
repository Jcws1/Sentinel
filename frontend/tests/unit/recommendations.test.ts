import { afterEach, describe, expect, it, vi } from 'vitest';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { decodeRecommendations } from '../../src/contracts/interactive';
import type { RecommendationSet } from '../../src/contracts/generated';
import { initialSession } from '../../src/state/sessionStore';
import {
  createRecommendationClient,
  suggestionRelevantKey,
} from '../../src/services/recommendationClient';
import type { InteractiveState } from '../../src/services/interactiveClient';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import type { CommandRequest } from '../../src/contracts/generated';

afterEach(() => sessionStorage.clear());

function setup() {
  const frame = validateFrame(structuredClone(demo)),
    run = frame.interactive!;
  run.state = 'running';
  const session = initialSession(frame.mission.id),
    c = run.controls[0];
  session.selection.items = [{ kind: 'entity', id: c.entityId }];
  const interactive: InteractiveState = {
    directPending: [],
    directReceipts: [],
    startingDemo: false,
    busy: false,
    holderId: 'test',
    now: frame.recordedAt,
    current: {
      schemaVersion: '1.7',
      serverTime: frame.recordedAt,
      frameId: frame.frameId,
      sequence: frame.sequence,
      run,
      ownsControl: true,
      leaseState: 'held',
    },
  };
  const input = {
    presentation: { mode: 'live' as const, status: 'current' as const, frame },
    session,
    connection: 'connected' as const,
    scenario: { active: false } as Parameters<
      typeof suggestionRelevantKey
    >[0]['scenario'],
    interactive,
  };
  const member = {
    assetId: c.assetId,
    entityId: c.entityId,
    executorId: c.executorId,
    sourceId: c.sourceId,
    controlTrackId: c.controlTrackId,
    grantId: c.grantId,
    bindingRevision: c.bindingRevision,
  };
  const data: RecommendationSet = {
    schemaVersion: '1.0',
    source: 'rules',
    id: 'set',
    missionId: frame.mission.id,
    runId: run.runId,
    executorEpoch: run.executorEpoch,
    sourceId: run.sourceId,
    inputFrameId: frame.frameId,
    sequence: frame.sequence,
    createdAt: frame.recordedAt,
    expiresAt: new Date(Date.parse(frame.recordedAt) + 15000).toISOString(),
    fingerprint: 'a'.repeat(64),
    selectedEntityIds: [c.entityId],
    members: [
      {
        entityId: c.entityId,
        label: 'Friendly',
        available: true,
        state: 'Manual · holding',
      },
    ],
    eligibleTargetIds: [],
    assignmentCount: 0,
    situation: 'Known simulation state.',
    options: [
      {
        id: 'stop',
        title: 'Stop selected · 1',
        explanation: 'Stop and disarm.',
        consequences: [],
        unchangedEntityIds: [],
        unchangedReasons: [],
        action: { operation: 'stop', members: [member] },
      },
      {
        id: 'keep',
        title: 'Keep current orders',
        explanation: 'No change.',
        consequences: [],
        unchangedEntityIds: [c.entityId],
        unchangedReasons: [
          {
            entityId: c.entityId,
            disposition: 'unchanged',
            reason: 'Current orders retained; no command submitted.',
          },
        ],
      },
    ],
  };
  const read = vi.fn(async () => structuredClone(data)),
    apply = vi.fn(async () => undefined),
    publish = vi.fn();
  const owner = createRecommendationClient({
    input: () => input,
    interactive: {
      requestSuggestions: read,
      applySuggestion: apply,
      get: () => interactive,
    },
    publish,
  });
  owner.sync(input);
  return { input, frame, session, c, data, read, apply, publish, owner };
}

describe('rules-based suggestions', () => {
  it('validates scope partitions and expiry without dropping a title property', () => {
    const h = setup();
    expect(decodeRecommendations(h.data).options[0].title).toBe(
      'Stop selected · 1',
    );
    const bad = structuredClone(h.data);
    bad.options[0].unchangedEntityIds = [h.c.entityId];
    expect(() => decodeRecommendations(bad)).toThrow();
    bad.options = h.data.options;
    bad.expiresAt = bad.createdAt;
    expect(() => decodeRecommendations(bad)).toThrow('lifetime');
  });
  it('generation, keep and dismiss never call the command owner', async () => {
    const h = setup();
    await h.owner.refresh();
    expect(h.owner.sync(h.input).status).toBe('ready');
    await h.owner.apply('keep');
    expect(h.owner.sync(h.input).message).toContain('No command');
    h.owner.dismiss();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.session.selection.items).toEqual([
      { kind: 'entity', id: h.c.entityId },
    ]);
  });
  it('does not invalidate on coordinates, source timestamps, frame advance or display filters', async () => {
    const h = setup();
    await h.owner.refresh();
    const key = suggestionRelevantKey(h.input);
    h.frame.sequence++;
    h.frame.tracks[h.c.controlTrackId!].latest.position.longitudeDeg += 0.0001;
    h.frame.tracks[h.c.controlTrackId!].latest.timestamp =
      '2026-09-14T00:00:01.000Z';
    h.session.filters.sourceIds = ['different'];
    expect(suggestionRelevantKey(h.input)).toBe(key);
    expect(h.owner.sync(h.input).status).toBe('ready');
  });
  it('invalidates a changed condition and prevents Apply', async () => {
    const h = setup();
    await h.owner.refresh();
    h.frame.entities[h.c.entityId].condition = 'non-operational';
    expect(h.owner.sync(h.input).status).toBe('outdated');
    await h.owner.apply('stop');
    expect(h.apply).not.toHaveBeenCalled();
  });
  it('uses existing backend time for expiry and keeps explicit no-op available', async () => {
    const h = setup();
    await h.owner.refresh();
    h.input.interactive.now = h.data.expiresAt;
    expect(h.owner.sync(h.input).status).toBe('outdated');
    await h.owner.apply('stop');
    expect(h.apply).not.toHaveBeenCalled();
    await h.owner.apply('keep');
    expect(h.owner.sync(h.input).status).toBe('kept');
  });
  it('fences a late response when selection changes', async () => {
    const h = setup();
    let finish!: (data: RecommendationSet) => void;
    h.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = h.owner.refresh();
    h.session.selection.items = [];
    h.owner.sync(h.input);
    finish(h.data);
    await pending;
    expect(h.owner.sync(h.input).data).toBeUndefined();
  });
  it('fences disposed requests and clears an ended run', async () => {
    const h = setup();
    await h.owner.refresh();
    h.frame.interactive!.state = 'ended';
    expect(h.owner.sync(h.input).data).toBeUndefined();
    h.owner.dispose();
    h.publish.mockClear();
    await h.owner.refresh();
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('exposes advisory failure without submitting or changing selection', async () => {
    const h = setup();
    h.read.mockRejectedValueOnce(new Error('Unavailable'));
    await h.owner.refresh();
    expect(h.owner.sync(h.input).status).toBe('error');
    expect(h.apply).not.toHaveBeenCalled();
  });
  it('passes the exact captured option and prevents concurrent Apply', async () => {
    const h = setup();
    let finish!: () => void;
    h.apply.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    await h.owner.refresh();
    const pending = h.owner.apply('stop');
    await h.owner.apply('stop');
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.apply).toHaveBeenCalledWith(
      h.data,
      h.data.options[0],
      expect.any(Function),
    );
    finish();
    await pending;
  });
});

function commandHarness(tampered = false) {
  const h = setup(),
    run = h.frame.interactive!;
  const bodies: string[] = [];
  let receipt: unknown;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/recommendations')) return Response.json(h.data);
    if (url.endsWith('/intents')) {
      const request = JSON.parse(init!.body as string);
      const { id, options, ...context } = h.data;
      return Response.json({
        id: 'reviewed-intent',
        missionId: h.data.missionId,
        runId: run.runId,
        executorEpoch: run.executorEpoch,
        sourceId: run.sourceId,
        grantId: run.grantId,
        grantRevision: run.grantRevision,
        runRevision: run.runRevision,
        leaseRevision: run.lease.revision,
        action: request.action,
        members: request.members,
        order: request.order,
        issuedAt: h.data.createdAt,
        expiresAt: new Date(Date.parse(h.data.createdAt) + 30000).toISOString(),
        recommendation: {
          ...context,
          recommendationId: id,
          option: {
            ...options[0],
            title: tampered ? 'Different promise' : options[0].title,
          },
        },
      });
    }
    if (url.endsWith('/commands')) {
      bodies.push(init!.body as string);
      const saved = JSON.parse(bodies[0]) as CommandRequest;
      receipt = {
        schemaVersion: '1.6',
        requestId: saved.commandId,
        operation: 'stop',
        accepted: true,
        code: 'OK',
        message: 'Committed',
        recordedAt: h.data.createdAt,
        missionId: h.data.missionId,
        runId: run.runId,
        recordingId: h.frame.recordingId,
        frameId: h.frame.frameId,
        sequence: h.frame.sequence,
        controlOrder: saved.intent.order,
        controlOutcomes: saved.intent.members!.map((m) => ({
          assetId: m.assetId,
          entityId: m.entityId,
          outcome: 'accepted',
          code: 'OK',
          reason: 'Holding committed position',
        })),
        executionIds: [],
        memberOutcomes: [],
        behaviorOutcomes: [],
        targetScope: [],
      };
      if (bodies.length === 1) throw Error('Lost after committed receipt');
      return Response.json(receipt);
    }
    if (url.includes('/receipts?identity=')) return Response.json(receipt);
    return Response.json({
      schemaVersion: '1.1',
      enabled: true,
      templateId: 'singapore-local-v2',
    });
  });
  const create = () => {
    const client = createInteractiveClient({
      base: '/api',
      fetcher,
      publish: () => {},
      loadMission: () => {},
      storage: sessionStorage,
    });
    client.setMission(h.data.missionId);
    return client;
  };
  return { ...h, bodies, fetcher, create };
}

it('read-only wire requests preserve pending storage; audited lost response reconciles after reload', async () => {
  const h = commandHarness(),
    first = h.create();
  try {
    const before = sessionStorage.getItem('sentinel.interactive.pending.v1');
    await first.requestSuggestions(h.data.selectedEntityIds);
    expect(sessionStorage.getItem('sentinel.interactive.pending.v1')).toBe(
      before,
    );
    await first.applySuggestion(h.data, h.data.options[0], () => true);
    expect(first.get().pending).toBeDefined();
    expect(JSON.parse(h.bodies[0]).intent.recommendation.option.title).toBe(
      h.data.options[0].title,
    );
    await first.applySuggestion(h.data, h.data.options[0], () => true);
    expect(h.bodies).toHaveLength(1);
    first.dispose();
    const reloaded = h.create();
    try {
      expect(reloaded.get().pending).toBeDefined();
      await reloaded.reconcile(true);
      expect(h.bodies[1]).toBe(h.bodies[0]);
      expect(reloaded.get().pending).toBeUndefined();
      expect(reloaded.get().receipt?.accepted).toBe(true);
    } finally {
      reloaded.dispose();
    }
  } finally {
    first.dispose();
  }
});

it.each([true, false])(
  'changed audit or context never reaches the command endpoint (%s)',
  async (tampered) => {
    const h = commandHarness(tampered),
      client = h.create();
    try {
      await client.applySuggestion(h.data, h.data.options[0], () => tampered);
      expect(h.bodies).toHaveLength(0);
      expect(client.get().pending).toBeUndefined();
      expect(client.get().error).toMatch(
        tampered ? /audit differs/ : /context changed/,
      );
    } finally {
      client.dispose();
    }
  },
);
