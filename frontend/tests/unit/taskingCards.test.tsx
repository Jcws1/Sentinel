import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { OperationalContext } from '../../src/app/OperationalContext';
import type {
  ApplicationRuntime,
  RuntimeSnapshot,
} from '../../src/app/runtime';
import { ObserveOrientPane } from '../../src/features/assistant/ObserveOrientPane';
import type {
  TaskingAdvice,
  TaskingProposal,
} from '../../src/services/observeOrientClient';

afterEach(cleanup);

function setup() {
  const proposal = (
    code: TaskingProposal['code'],
    category: TaskingProposal['category'],
    status: TaskingProposal['status'],
  ): TaskingProposal => ({
    code,
    category,
    status,
    summary: `${code} summary`,
    evidenceIds: [],
    assetIds: code === 'RESPOND' ? ['asset-a'] : [],
    targetIds: [],
    zoneIds: [],
    pairs: [],
    limitations: [],
  });
  const advice: TaskingAdvice = {
    schemaVersion: '1.0',
    missionId: 'mission',
    frameId: 'frame',
    sequence: 1,
    boundaryRevision: 0,
    source: 'deterministic-rules',
    executable: false,
    proposals: [
      proposal('MONITOR', 'Monitor', 'candidate'),
      proposal('RESPOND', 'Respond', 'candidate'),
      proposal('RESTORE_VISIBILITY', 'Support', 'needs_evidence'),
      proposal('RESTORE_LINK', 'Support', 'needs_evidence'),
      proposal('ROTATE_ASSET', 'Support', 'needs_evidence'),
    ],
  };
  const reviewed = {
    set: { id: 'reviewed' },
    option: { action: { members: [{ assetId: 'asset-a' }] } },
  };
  const tasking = vi.fn(async () => advice);
  const prepare = vi.fn(async () => reviewed);
  const confirm = vi.fn(async () => 'Simulator command accepted.');
  const prepareMove = vi.fn(async () => ({
    assetId: 'asset-a',
    destination: '1.29000°, 103.85000°',
  }));
  const confirmMove = vi.fn(
    async () => 'Simulator move accepted; outcome unverified.',
  );
  const snapshot = {
    presentation: {
      frame: { mission: { id: 'mission' }, frameId: 'frame', zones: {} },
    },
  } as RuntimeSnapshot;
  const runtime = {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    observeOrient: { tasking },
    prepareTaskingRespond: prepare,
    confirmTaskingRespond: confirm,
    prepareTaskingMove: prepareMove,
    confirmTaskingMove: confirmMove,
  } as unknown as ApplicationRuntime;
  render(
    <OperationalContext.Provider value={runtime}>
      <ObserveOrientPane />
    </OperationalContext.Provider>,
  );
  return { tasking, prepare, confirm, prepareMove, confirmMove };
}

it('opens a card with Confirm and Cancel but only submits a freshly reviewed simulator action', async () => {
  const { prepare, confirm, prepareMove, confirmMove } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Recommend' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /Monitor · MONITOR/ }),
  );
  await waitFor(() => expect(prepareMove).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(confirmMove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Respond · RESPOND/ }));
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(await screen.findByText(/Simulator command submitted/)).toBeTruthy();
});

it('submits a reviewed non-kinetic simulator move only after Confirm', async () => {
  const { prepareMove, confirmMove } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Recommend' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /Monitor · MONITOR/ }),
  );
  await waitFor(() => expect(prepareMove).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirmMove).toHaveBeenCalledOnce());
  expect(await screen.findByText(/Simulator move accepted/)).toBeTruthy();
});
