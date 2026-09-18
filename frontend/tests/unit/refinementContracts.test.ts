import { expect, it } from 'vitest';
import sample from '../fixtures/refinement-pursuing.json';
import { validateFrame } from '../../src/contracts/decode';

it('accepts committed typed pursuit and rejects forged movement owners, destinations and profile speeds', () => {
  validateFrame(sample);
  for (const change of [
    'owner',
    'link',
    'state',
    'scope',
    'profile',
  ] as const) {
    const frame = validateFrame(structuredClone(sample));
    const e = frame.interactive!.executions![0],
      m = frame.fleetBehavior!.members![0];
    if (change === 'owner') e.suspendedBy = 'wrong-owner';
    if (change === 'link') m.movementExecutionId = 'missing-destination';
    if (change === 'state') e.state = 'Running';
    if (change === 'scope') m.targetScope = ['unexpected-target'];
    if (change === 'profile') frame.unitProfiles![m.entityId].cruiseMps = 999;
    expect(() => validateFrame(frame)).toThrow();
  }
});
