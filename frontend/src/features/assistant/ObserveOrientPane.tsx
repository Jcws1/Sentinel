import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type {
  SituationAssessment,
  TaskingAdvice,
  TaskingProposal,
} from '../../services/observeOrientClient';
import type {
  RecommendationOption,
  RecommendationSet,
} from '../../contracts/generated';
import type { ImmutableFrame } from '../../contracts/types';
import './assistant.css';

type Turn = {
  id: number;
  question: string;
  assessment?: SituationAssessment;
  advice?: TaskingAdvice;
  error?: string;
};

type TaskingSubmission = {
  code: TaskingProposal['code'];
  assetIds: string[];
  targetIds: string[];
  submittedSequence: number;
};

export function ObserveOrientPane() {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const [question, setQuestion] = useState('');
  const [focusZoneId, setFocusZoneId] = useState('');
  const [faultAssetId, setFaultAssetId] = useState('');
  const [faultBusy, setFaultBusy] = useState(false);
  const [faultNotice, setFaultNotice] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const transcript = useRef<HTMLDivElement>(null);
  const automaticMission = useRef('');
  const automaticPending = useRef('');
  const displayedMission = useRef<string | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns, busy]);

  async function assess() {
    const prompt = question.trim();
    if (!frame || busy || !prompt) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = Date.now();
    setQuestion('');
    setTurns((current) => [...current, { id, question: prompt }]);
    setBusy(true);
    try {
      const assessment = await runtime.observeOrient.assess(
        frame.mission.id,
        frame.frameId,
        prompt,
        controller.signal,
      );
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, assessment } : turn,
        ),
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        const error =
          caught instanceof Error ? caught.message : 'Assessment failed.';
        setTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, error } : turn)),
        );
      }
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  const recommend = useCallback(
    async (automatic = false) => {
      if (!frame || busy) return false;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const id = Date.now();
      setTurns((current) => {
        const retained = automatic
          ? current.filter(
              (turn) =>
                turn.question !== 'Live Monitor · Respond · Support review',
            )
          : current;
        return [
          ...retained,
          {
            id,
            question: automatic
              ? 'Live Monitor · Respond · Support review'
              : 'Refresh Monitor · Respond · Support review',
          },
        ];
      });
      setBusy(true);
      try {
        const advice = await runtime.observeOrient.tasking(
          frame.mission.id,
          focusZoneId || undefined,
          controller.signal,
        );
        setTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, advice } : turn)),
        );
        return true;
      } catch (caught) {
        if (!controller.signal.aborted) {
          const error =
            caught instanceof Error ? caught.message : 'Tasking advice failed.';
          setTurns((current) =>
            current.map((turn) => (turn.id === id ? { ...turn, error } : turn)),
          );
        } else setTurns((current) => current.filter((turn) => turn.id !== id));
        return false;
      } finally {
        if (request.current === controller) setBusy(false);
      }
    },
    [busy, focusZoneId, frame, runtime],
  );

  useEffect(() => {
    const missionId = frame?.mission.id;
    if (displayedMission.current === missionId) return;
    displayedMission.current = missionId;
    setTurns([]);
  }, [frame?.mission.id]);

  useEffect(() => {
    const missionId = frame?.interactive ? frame.mission.id : undefined;
    const reviewKey = missionId
      ? `${missionId}:${frame?.interactive?.state}`
      : undefined;
    if (
      !reviewKey ||
      automaticMission.current === reviewKey ||
      automaticPending.current === reviewKey
    )
      return;
    automaticPending.current = reviewKey;
    void recommend(true).then((completed) => {
      if (completed) automaticMission.current = reviewKey;
      if (automaticPending.current === reviewKey) automaticPending.current = '';
    });
  }, [frame?.interactive, frame?.mission.id, recommend]);

  async function injectFault(kind: 'camera' | 'link' | 'asset') {
    const asset = faultAssetId || frame?.interactive?.controls[0]?.assetId;
    if (!asset || faultBusy) return;
    setFaultBusy(true);
    setFaultNotice('');
    try {
      setFaultNotice(await runtime.injectTaskingDemoFault(kind, asset));
      await recommend(true);
    } catch (error) {
      setFaultNotice(
        error instanceof Error
          ? error.message
          : 'Synthetic fault was not recorded.',
      );
    } finally {
      setFaultBusy(false);
    }
  }

  const focusZones = Object.entries(frame?.boundaryRules?.zones ?? {}).filter(
    ([, kind]) =>
      kind === 'annotation' || kind === 'patrol' || kind === 'keep_in',
  );

  return (
    <div className="oo-chat">
      <header className="oo-chat__header">
        <div>
          <strong>Observe / Orient Agent</strong>
          <span>Read only · evidence grounded</span>
        </div>
        <span className={frame ? 'oo-chat__status is-live' : 'oo-chat__status'}>
          {frame ? 'LIVE' : 'NO MISSION'}
        </span>
      </header>
      <div
        className="oo-chat__transcript"
        ref={transcript}
        role="log"
        aria-live="polite"
      >
        {turns.length === 0 && (
          <div className="oo-chat__welcome">
            <strong>Ask about the current operational picture.</strong>
            <p>
              I separate observations from interpretation, cite committed-frame
              evidence, and flag uncertainty.
            </p>
          </div>
        )}
        {turns.map((turn) => (
          <div className="oo-chat__turn" key={turn.id}>
            <div className="oo-message oo-message--operator">
              {turn.question}
            </div>
            {turn.assessment && (
              <AssessmentMessage
                assessment={turn.assessment}
                stale={frame?.frameId !== turn.assessment.frameId}
              />
            )}
            {turn.advice && (
              <TaskingMessage
                advice={turn.advice}
                stale={frame?.frameId !== turn.advice.frameId}
              />
            )}
            {turn.error && (
              <div className="oo-message oo-message--agent oo-message--error">
                {turn.error}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="oo-message oo-message--agent oo-message--busy">
            Reviewing the committed frame…
          </div>
        )}
      </div>
      <div className="oo-tasking-controls">
        <label htmlFor="oo-focus-zone">Observation area</label>
        <select
          id="oo-focus-zone"
          value={focusZoneId}
          onChange={(event) => setFocusZoneId(event.target.value)}
          disabled={!frame || busy}
        >
          <option value="">Select marked area (optional)</option>
          {focusZones.map(([id]) => (
            <option value={id} key={id}>
              {frame?.zones[id]?.label ?? id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!frame || busy}
          onClick={() => void recommend(false)}
        >
          Refresh recommendations
        </button>
        {frame?.scenario && frame.interactive && (
          <details>
            <summary>Demo-only fault inputs</summary>
            <p>
              Inject simulated camera, link or asset status to test Support
              recommendations. These are not live platform telemetry.
            </p>
            <label htmlFor="oo-fault-asset">Affected drone</label>
            <select
              id="oo-fault-asset"
              value={
                faultAssetId || frame.interactive.controls[0]?.assetId || ''
              }
              onChange={(event) => setFaultAssetId(event.target.value)}
              disabled={faultBusy}
            >
              {frame.interactive.controls.map((control) => (
                <option key={control.assetId} value={control.assetId}>
                  {frame.entities[control.entityId]?.label ?? control.assetId}
                </option>
              ))}
            </select>
            <div>
              <button
                type="button"
                disabled={faultBusy}
                onClick={() => void injectFault('camera')}
              >
                Camera fault
              </button>
              <button
                type="button"
                disabled={faultBusy}
                onClick={() => void injectFault('link')}
              >
                Link fault
              </button>
              <button
                type="button"
                disabled={faultBusy}
                onClick={() => void injectFault('asset')}
              >
                Asset unavailable
              </button>
            </div>
            {faultNotice && <p role="status">{faultNotice}</p>}
          </details>
        )}
      </div>
      <form
        className="oo-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void assess();
        }}
      >
        <textarea
          aria-label="Message Observe Orient agent"
          value={question}
          maxLength={500}
          rows={1}
          placeholder={
            frame
              ? 'Ask about the current situation…'
              : 'Load a mission to begin…'
          }
          disabled={!frame || busy}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void assess();
            }
          }}
        />
        <button
          aria-label="Send message"
          disabled={!frame || busy || !question.trim()}
        >
          ↑
        </button>
      </form>
    </div>
  );
}

function TaskingMessage({
  advice,
  stale,
}: {
  advice: TaskingAdvice;
  stale: boolean;
}) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const [opened, setOpened] = useState<TaskingProposal['code'] | undefined>();
  const [reviewed, setReviewed] = useState<{
    set: RecommendationSet;
    option: RecommendationOption;
  }>();
  const [reviewedMove, setReviewedMove] =
    useState<Awaited<ReturnType<typeof runtime.prepareTaskingMove>>>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [submission, setSubmission] = useState<TaskingSubmission>();
  const reviewGeneration = useRef(0);

  async function open(proposal: TaskingProposal) {
    const generation = ++reviewGeneration.current;
    setOpened(proposal.code);
    setReviewed(undefined);
    setReviewedMove(undefined);
    setNotice('');
    setBusy(false);
    const selected = [
      ...proposal.targetIds,
      ...proposal.assetIds
        .map((id) => frame?.assets?.[id]?.entityId)
        .filter((id): id is string => !!id),
    ];
    if (selected.length > 0) runtime.selectEntities(selected);
    if (proposal.status !== 'candidate') return;
    setBusy(true);
    try {
      if (proposal.code === 'RESPOND') {
        const current = await runtime.prepareTaskingRespond(advice);
        if (generation === reviewGeneration.current) setReviewed(current);
      } else {
        const current = await runtime.prepareTaskingMove(advice, proposal.code);
        if (generation === reviewGeneration.current) setReviewedMove(current);
      }
    } catch (error) {
      if (generation === reviewGeneration.current)
        setNotice(
          error instanceof Error
            ? error.message
            : 'Current simulator review unavailable.',
        );
    } finally {
      if (generation === reviewGeneration.current) setBusy(false);
    }
  }

  async function confirm() {
    if ((!reviewed && !reviewedMove) || busy) return;
    const proposal = advice.proposals.find((item) => item.code === opened);
    if (!proposal) return;
    setBusy(true);
    try {
      setNotice(
        reviewed
          ? await runtime.confirmTaskingRespond(advice, reviewed)
          : await runtime.confirmTaskingMove(advice, reviewedMove!),
      );
      setReviewed(undefined);
      setReviewedMove(undefined);
      setSubmission({
        code: proposal.code,
        assetIds: [...proposal.assetIds],
        targetIds: [...proposal.targetIds],
        submittedSequence: frame?.sequence ?? advice.sequence,
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Command not accepted. Check Activity.',
      );
      setReviewed(undefined);
      setReviewedMove(undefined);
    } finally {
      setBusy(false);
    }
  }

  const progress = submission ? taskingProgress(frame, submission) : undefined;

  return (
    <article
      className="oo-message oo-message--agent oo-tasking"
      data-advice-frame={advice.frameId}
    >
      {stale && !submission && (
        <p className="oo-message__notice">
          Live state advanced. Opening a card revalidates its action against the
          current simulator frame.
        </p>
      )}
      <p className="oo-message__summary">
        {submission
          ? 'Command flow live · map and outcome status update automatically'
          : 'Decision support · open a card to review its current action'}
      </p>
      {progress && submission && (
        <div
          className={`oo-tasking__progress is-${progress.tone}`}
          role="status"
        >
          <span>{progress.label}</span>
          <strong>{progress.detail}</strong>
          <small>
            Committed frame {frame?.sequence ?? submission.submittedSequence}
          </small>
        </div>
      )}
      {advice.proposals.map((proposal) => (
        <section key={proposal.code}>
          <button
            type="button"
            className="oo-tasking__card"
            aria-expanded={opened === proposal.code}
            onClick={() => void open(proposal)}
          >
            <strong>
              {proposal.category} · {proposal.code.replaceAll('_', ' ')} ·{' '}
              {proposal.status.replaceAll('_', ' ')}
            </strong>
          </button>
          <p>{proposal.summary}</p>
          {proposal.pairs.length > 0 && (
            <small>
              Advisory pairs:{' '}
              {proposal.pairs
                .map((pair) => `${pair.assetId} → ${pair.targetId}`)
                .join(' · ')}
            </small>
          )}
          {proposal.limitations.map((limit) => (
            <small key={limit}>{limit}</small>
          ))}
          {proposal.evidenceIds.length > 0 && (
            <details>
              <summary>Evidence IDs</summary>
              {proposal.evidenceIds.join(', ')}
            </details>
          )}
          {opened === proposal.code && (
            <div className="oo-tasking__review">
              {proposal.code === 'RESPOND' && reviewed && (
                <p>
                  Confirm will enable the existing proximity Intercept policy
                  for {reviewed.option.action?.members.length} controlled
                  drone(s). It does not dispatch them to the specific targets
                  listed above.
                </p>
              )}
              {reviewedMove && (
                <p>
                  Confirm requests a simulator move of {reviewedMove.assetId}{' '}
                  toward {reviewedMove.destination}. Area gates and the current
                  control lease are rechecked by the backend. Movement does not
                  by itself prove observation, restored visibility/link, or task
                  transfer.
                </p>
              )}
              {proposal.status !== 'candidate' && (
                <p>
                  Confirm unavailable: this recommendation lacks the required
                  current evidence or an eligible asset.
                </p>
              )}
              {busy && <p>Checking the latest simulator state…</p>}
              {notice && <p role="status">{notice}</p>}
              <div>
                <button
                  type="button"
                  disabled={(!reviewed && !reviewedMove) || busy}
                  onClick={() => void confirm()}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    reviewGeneration.current++;
                    setOpened(undefined);
                    setReviewed(undefined);
                    setReviewedMove(undefined);
                    setNotice('');
                    setBusy(false);
                  }}
                >
                  {submission?.code === proposal.code ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
      <small>
        Area revision {advice.boundaryRevision} · frame {advice.sequence} ·
        deterministic rules
      </small>
    </article>
  );
}

function AssessmentMessage({
  assessment,
  stale,
}: {
  assessment: SituationAssessment;
  stale: boolean;
}) {
  return (
    <article
      className="oo-message oo-message--agent"
      data-assessment-frame={assessment.frameId}
    >
      {stale && (
        <p className="oo-message__notice">A newer frame is displayed.</p>
      )}
      <p className="oo-message__summary">{assessment.summary}</p>
      <CompactList
        title="Observed"
        values={assessment.observations.map((item) => item.statement)}
      />
      <CompactList
        title="Orientation"
        values={assessment.orientation.map((item) => item.statement)}
      />
      {assessment.uncertainties.length > 0 && (
        <CompactList title="Uncertainty" values={assessment.uncertainties} />
      )}
      {assessment.attentionItems.length > 0 && (
        <CompactList
          title="Attention—not commands"
          values={assessment.attentionItems}
        />
      )}
      <details>
        <summary>Evidence and provenance</summary>
        <ul>
          {assessment.observations
            .concat(assessment.orientation)
            .map((item, index) => (
              <li key={`${item.statement}-${index}`}>
                {item.confidence} · {item.evidenceIds.join(', ')}
              </li>
            ))}
        </ul>
        <p>
          {assessment.model} · {assessment.latencyMs} ms · frame{' '}
          {assessment.sequence}
        </p>
      </details>
    </article>
  );
}

function CompactList({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <strong>{title}</strong>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

function taskingProgress(
  frame: ImmutableFrame | undefined,
  submission: TaskingSubmission,
): {
  label: string;
  detail: string;
  tone: 'pending' | 'active' | 'complete' | 'error';
} {
  if (!frame || frame.sequence <= submission.submittedSequence)
    return {
      label: 'Accepted',
      detail: 'Waiting for the next committed simulator frame…',
      tone: 'pending',
    };

  if (submission.code === 'RESPOND') {
    const entityIds = new Set(
      submission.assetIds
        .map((id) => frame.assets?.[id]?.entityId)
        .filter((id): id is string => !!id),
    );
    const relevantOutcomes = (frame.fleetBehavior?.outcomes ?? []).filter(
      (outcome) =>
        outcome.committedSequence > submission.submittedSequence &&
        outcome.participants.some(
          (participant) =>
            entityIds.has(participant.entityId) ||
            submission.targetIds.includes(participant.entityId),
        ),
    );
    if (relevantOutcomes.length >= submission.assetIds.length)
      return {
        label: 'Outcome recorded',
        detail: `${submission.assetIds.length}/${submission.assetIds.length} simulated interception outcomes committed and visible on the map.`,
        tone: 'complete',
      };
    if (relevantOutcomes.length > 0)
      return {
        label: 'Outcome progress',
        detail: `${relevantOutcomes.length}/${submission.assetIds.length} simulated interception outcomes committed; remaining pairings are still unresolved.`,
        tone: 'active',
      };
    const members = (frame.fleetBehavior?.members ?? []).filter(
      (member) =>
        submission.assetIds.includes(member.assetId) &&
        member.policy === 'intercept',
    );
    if (members.length > 0)
      return {
        label: 'Interception active',
        detail: `${members.length}/${submission.assetIds.length} interceptor${members.length === 1 ? '' : 's'} committed to the proximity policy; positions stream directly to the map.`,
        tone: 'active',
      };
    return {
      label: 'Accepted',
      detail: 'The receipt is recorded; waiting for committed policy state.',
      tone: 'pending',
    };
  }

  const execution = [...(frame.interactive?.executions ?? [])]
    .filter(
      (item) =>
        submission.assetIds.includes(item.assetId) &&
        item.acceptedSequence >= submission.submittedSequence,
    )
    .sort((left, right) => right.revision - left.revision)[0];
  if (!execution)
    return {
      label: 'Accepted',
      detail:
        'Waiting for the movement execution to appear in committed state.',
      tone: 'pending',
    };
  if (execution.state === 'Completed')
    return {
      label: 'Movement complete',
      detail: `${execution.assetId} reached the reviewed destination; verify the requested operational effect from fresh evidence.`,
      tone: 'complete',
    };
  if (
    ['Cancelled', 'Failed', 'Expired', 'Interrupted'].includes(execution.state)
  )
    return {
      label: execution.state,
      detail:
        execution.reason ??
        'The simulator ended this movement without a completed arrival.',
      tone: 'error',
    };
  return {
    label: `Movement ${execution.state.toLowerCase()}`,
    detail: `${execution.assetId} · ${Math.round(execution.remainingMetres)} m remaining · map position is live.`,
    tone: 'active',
  };
}
