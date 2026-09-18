import type { WorldFrame } from './generated';

/** Aggregate validation is also required after stream deltas. */
export function validateBehavior(frame: WorldFrame) {
  const fleet = frame.fleetBehavior,
    run = frame.interactive;
  if (!fleet) return;
  const check = (ok: unknown, message: string) => {
    if (!ok) throw new Error(`Invalid fleet behavior: ${message}`);
  };
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  check(
    run && fleet.runId === run.runId && fleet.sourceId === run.sourceId,
    'run/source',
  );
  if (!run) return;
  check(
    run.capabilities.includes('fleet-policy') &&
      run.capabilities.includes('demo-outcome'),
    'capability',
  );
  check(
    fleet.model.speedMps ===
      (run.templateId === 'singapore-local-v2' ? 155 / 3.6 : 20),
    'movement profile',
  );
  const members = fleet.members ?? [],
    assignments = fleet.assignments ?? [],
    outcomes = fleet.outcomes ?? [];
  const unfinished = (state: string) =>
    !['Completed', 'Cancelled', 'Failed', 'Expired', 'Interrupted'].includes(
      state,
    );
  check(
    fleet.ruleVersion === 'local-fleet-v1'
      ? fleet.model.acquisitionRadiusM === 250 &&
          members.every(
            (m) =>
              !m.movementExecutionId && (m.state !== 'pursuing' || m.deadline),
          )
      : members.every((m) => !m.targetScope?.length && m.state !== 'reserve'),
    'versioned stance semantics',
  );
  check(
    unique(members.map((m) => m.assetId)) &&
      unique(members.map((m) => m.entityId)) &&
      unique(members.map((m) => m.id)),
    'duplicate member',
  );
  const active = assignments.filter((a) => a.state === 'active');
  check(
    unique(assignments.map((a) => a.id)) &&
      unique(active.map((a) => a.interceptorId)) &&
      unique(active.map((a) => a.targetId)),
    'duplicate assignment',
  );
  check(
    unique(outcomes.map((o) => o.id)) &&
      unique(outcomes.flatMap((o) => o.participants.map((p) => p.entityId))),
    'duplicate outcome/participant',
  );
  for (const m of members) {
    const c = run.controls.find((c) => c.assetId === m.assetId);
    check(
      c &&
        c.entityId === m.entityId &&
        m.acceptedSequence <= frame.sequence &&
        m.acceptedTick <= run.tick,
      'member/anchor',
    );
    check(unique(m.targetScope ?? []), 'target scope');
    check((m.state === 'pursuing') === !!m.assignmentId, 'pursuit reservation');
    check(
      !['armed', 'pursuing', 'reserve'].includes(m.state) ||
        m.policy === 'intercept',
      'policy',
    );
    check(
      m.state !== 'patrolling' || (m.policy === 'patrol' && m.patrol),
      'patrol route',
    );
    check(
      !m.patrol || m.patrol.waypoint < m.patrol.loop.length,
      'patrol waypoint',
    );
    if (['armed', 'patrolling', 'pursuing', 'reserve'].includes(m.state)) {
      check(
        c &&
          m.executorEpoch === run.executorEpoch &&
          m.grantRevision === run.grantRevision &&
          m.bindingRevision === c.bindingRevision &&
          m.reservationRevision === c.busyRevision &&
          m.controlTrackId === c.controlTrackId,
        'binding/reservation',
      );
      check(
        !frame.scenarioSchedule ||
          frame.scenarioSchedule.manualOverrides?.includes(m.entityId),
        'manual override',
      );
      check(
        fleet.ruleVersion === 'local-fleet-v2' ||
          !run.executions?.some(
            (e) =>
              e.entityId === m.entityId &&
              ![
                'Completed',
                'Cancelled',
                'Failed',
                'Expired',
                'Interrupted',
              ].includes(e.state),
          ),
        'manual movement conflict',
      );
    }
    check(
      !m.assignmentId ||
        active.some((a) => a.id === m.assignmentId && a.assetId === m.assetId),
      'assignment reference',
    );
    if (fleet.ruleVersion === 'local-fleet-v2') {
      const work =
        run.executions?.filter(
          (e) => e.assetId === m.assetId && unfinished(e.state),
        ) ?? [];
      if (m.movementExecutionId) {
        const linked = work.find((e) => e.id === m.movementExecutionId);
        check(
          linked &&
            m.policy !== 'patrol' &&
            linked.entityId === m.entityId &&
            linked.controlTrackId === m.controlTrackId &&
            linked.reservationRevision === m.reservationRevision,
          'retained movement reservation',
        );
      }
      check(
        !work.length ||
          !['armed', 'pursuing'].includes(m.state) ||
          m.movementExecutionId === work[0].id,
        'unfinished destination reference',
      );
    }
  }
  for (const e of run.executions ?? []) {
    if (!e.suspendedBy) continue;
    const m = members.find((m) => m.assetId === e.assetId);
    check(
      fleet.ruleVersion === 'local-fleet-v2' &&
        e.state === 'Suspended' &&
        m?.state === 'pursuing' &&
        m.id === e.suspendedBy &&
        m.movementExecutionId === e.id,
      'pursuing owner',
    );
  }
  for (const a of assignments) {
    check(
      a.createdSequence <= frame.sequence &&
        (a.releasedSequence == null || a.releasedSequence <= frame.sequence),
      'future assignment',
    );
    check(
      (a.state === 'released') ===
        (a.releasedSequence != null && a.reason != null),
      'release evidence',
    );
    if (a.state !== 'active') continue;
    const m = members.find((m) => m.assetId === a.assetId),
      t = frame.tracks[a.targetTrackId];
    check(
      m &&
        m.assignmentId === a.id &&
        m.id === a.policyId &&
        m.entityId === a.interceptorId &&
        (fleet.ruleVersion === 'local-fleet-v2' ||
          m.targetScope?.includes(a.targetId)) &&
        t &&
        t.entityId === a.targetId &&
        t.source.id === run.sourceId,
      'scope/source',
    );
  }
  for (const o of outcomes) {
    check(
      o.runId === run.runId &&
        o.sourceId === run.sourceId &&
        o.committedSequence <= frame.sequence &&
        o.tick <= run.tick &&
        o.inputSequence + 1 === o.committedSequence,
      'outcome anchors',
    );
    check(
      o.participants[0].affiliation === 'friendly' &&
        o.participants[1].affiliation === 'hostile',
      'outcome participants',
    );
    check(
      o.separationM <=
        (fleet.model.contactRadiusM ?? 25) +
          (fleet.model.toleranceM ?? 0.001) +
          0.001,
      'contact threshold',
    );
    for (const p of o.participants) {
      const entity = frame.entities[p.entityId],
        t = frame.tracks[p.trackId],
        pos = t?.latest.position;
      check(
        entity?.condition === 'non-operational' &&
          entity.affiliation === p.affiliation &&
          t?.entityId === p.entityId &&
          t.source.id === run.sourceId &&
          pos &&
          pos.longitudeDeg === p.evaluated.longitudeDeg &&
          pos.latitudeDeg === p.evaluated.latitudeDeg &&
          pos.altitude.metres === p.evaluated.altitude.metres &&
          pos.altitude.reference === 'ELLIPSOID' &&
          pos.altitude.datumId === 'WGS84',
        'persistent loss/position',
      );
      check(
        p.before.altitude.metres === p.proposed.altitude.metres &&
          p.before.altitude.metres === p.evaluated.altitude.metres,
        'supplied height',
      );
      check(
        !Object.values(frame.assets).some(
          (a) => a.entityId === p.entityId && a.availability !== 'unavailable',
        ),
        'lost asset availability',
      );
    }
  }
}
