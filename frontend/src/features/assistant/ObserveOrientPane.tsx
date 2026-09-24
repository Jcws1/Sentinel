import { useEffect, useRef, useState } from 'react';
import { useOperationalRuntime, useOperationalSnapshot } from '../../app/OperationalContext';
import type { SituationAssessment, TaskingAdvice, TaskingProposal } from '../../services/observeOrientClient';
import type { RecommendationOption, RecommendationSet } from '../../contracts/generated';
import './assistant.css';

type Turn = { id: number; question: string; assessment?: SituationAssessment; advice?: TaskingAdvice; error?: string };

export function ObserveOrientPane() {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const [question, setQuestion] = useState('');
  const [focusZoneId, setFocusZoneId] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
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
      const assessment = await runtime.observeOrient.assess(frame.mission.id, frame.frameId, prompt, controller.signal);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, assessment } : turn));
    } catch (caught) {
      if (!controller.signal.aborted) {
        const error = caught instanceof Error ? caught.message : 'Assessment failed.';
        setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, error } : turn));
      }
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  async function recommend() {
    if (!frame || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = Date.now();
    setTurns((current) => [...current, { id, question: 'Monitor · Respond · Support recommendations' }]);
    setBusy(true);
    try {
      const advice = await runtime.observeOrient.tasking(frame.mission.id, frame.frameId, focusZoneId || undefined, controller.signal);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, advice } : turn));
    } catch (caught) {
      if (!controller.signal.aborted) {
        const error = caught instanceof Error ? caught.message : 'Tasking advice failed.';
        setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, error } : turn));
      }
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  const focusZones = Object.entries(frame?.boundaryRules?.zones ?? {})
    .filter(([, kind]) => kind === 'annotation' || kind === 'patrol' || kind === 'keep_in');

  return (
    <div className="oo-chat">
      <header className="oo-chat__header">
        <div><strong>Observe / Orient Agent</strong><span>Read only · evidence grounded</span></div>
        <span className={frame ? 'oo-chat__status is-live' : 'oo-chat__status'}>{frame ? 'LIVE' : 'NO MISSION'}</span>
      </header>
      <div className="oo-chat__transcript" ref={transcript} role="log" aria-live="polite">
        {turns.length === 0 && <div className="oo-chat__welcome"><strong>Ask about the current operational picture.</strong><p>I separate observations from interpretation, cite committed-frame evidence, and flag uncertainty.</p></div>}
        {turns.map((turn) => <div className="oo-chat__turn" key={turn.id}>
          <div className="oo-message oo-message--operator">{turn.question}</div>
          {turn.assessment && <AssessmentMessage assessment={turn.assessment} stale={frame?.frameId !== turn.assessment.frameId} />}
          {turn.advice && <TaskingMessage advice={turn.advice} stale={frame?.frameId !== turn.advice.frameId} />}
          {turn.error && <div className="oo-message oo-message--agent oo-message--error">{turn.error}</div>}
        </div>)}
        {busy && <div className="oo-message oo-message--agent oo-message--busy">Reviewing the committed frame…</div>}
      </div>
      <div className="oo-tasking-controls">
        <label htmlFor="oo-focus-zone">Observation area</label>
        <select id="oo-focus-zone" value={focusZoneId} onChange={(event) => setFocusZoneId(event.target.value)} disabled={!frame || busy}>
          <option value="">Select marked area (optional)</option>
          {focusZones.map(([id]) => <option value={id} key={id}>{frame?.zones[id]?.label ?? id}</option>)}
        </select>
        <button type="button" disabled={!frame || busy} onClick={() => void recommend()}>Recommend</button>
      </div>
      <form className="oo-composer" onSubmit={(event) => { event.preventDefault(); void assess(); }}>
        <textarea aria-label="Message Observe Orient agent" value={question} maxLength={500} rows={1}
          placeholder={frame ? 'Ask about the current situation…' : 'Load a mission to begin…'} disabled={!frame || busy}
          onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void assess(); }
          }} />
        <button aria-label="Send message" disabled={!frame || busy || !question.trim()}>↑</button>
      </form>
    </div>
  );
}

function TaskingMessage({ advice, stale }: { advice: TaskingAdvice; stale: boolean }) {
  const runtime = useOperationalRuntime()!;
  const [opened, setOpened] = useState<TaskingProposal['code'] | undefined>();
  const [reviewed, setReviewed] = useState<{ set: RecommendationSet; option: RecommendationOption }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const reviewGeneration = useRef(0);

  async function open(proposal: TaskingProposal) {
    const generation = ++reviewGeneration.current;
    setOpened(proposal.code);
    setReviewed(undefined);
    setNotice('');
    setBusy(false);
    if (proposal.code !== 'RESPOND' || proposal.status !== 'candidate') return;
    setBusy(true);
    try {
      const current = await runtime.prepareTaskingRespond(advice);
      if (generation === reviewGeneration.current) setReviewed(current);
    } catch (error) {
      if (generation === reviewGeneration.current)
        setNotice(error instanceof Error ? error.message : 'Current simulator review unavailable.');
    } finally {
      if (generation === reviewGeneration.current) setBusy(false);
    }
  }

  async function confirm() {
    if (!reviewed || busy) return;
    setBusy(true);
    try {
      setNotice(await runtime.confirmTaskingRespond(advice, reviewed));
      setReviewed(undefined);
      setSubmitted(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Command not accepted. Check Activity.');
      setReviewed(undefined);
    } finally {
      setBusy(false);
    }
  }

  return <article className="oo-message oo-message--agent oo-tasking" data-advice-frame={advice.frameId}>
    {stale && <p className="oo-message__notice">A newer frame is displayed. Any Confirm requires a fresh validated simulator review.</p>}
    <p className="oo-message__summary">{submitted ? 'Simulator command submitted · check Activity for outcomes' : 'Decision support only · no command submitted'}</p>
    {advice.proposals.map((proposal) => <section key={proposal.code}>
      <button type="button" className="oo-tasking__card" aria-expanded={opened === proposal.code} onClick={() => void open(proposal)}>
        <strong>{proposal.category} · {proposal.code.replaceAll('_', ' ')} · {proposal.status.replaceAll('_', ' ')}</strong>
      </button>
      <p>{proposal.summary}</p>
      {proposal.pairs.length > 0 && <small>Advisory pairs: {proposal.pairs.map((pair) => `${pair.assetId} → ${pair.targetId}`).join(' · ')}</small>}
      {proposal.limitations.map((limit) => <small key={limit}>{limit}</small>)}
      {proposal.evidenceIds.length > 0 && <details><summary>Evidence IDs</summary>{proposal.evidenceIds.join(', ')}</details>}
      {opened === proposal.code && <div className="oo-tasking__review">
        {proposal.code === 'RESPOND' && reviewed && <p>Confirm will enable the existing proximity Intercept policy for {reviewed.option.action?.members.length} controlled drone(s). It does not dispatch them to the specific targets listed above.</p>}
        {proposal.code !== 'RESPOND' && <p>No validated simulator command exists yet for this {proposal.code.replaceAll('_', ' ')} proposal. Confirm is unavailable.</p>}
        {busy && <p>Checking the latest simulator state…</p>}
        {notice && <p role="status">{notice}</p>}
        <div><button type="button" disabled={!reviewed || busy} onClick={() => void confirm()}>Confirm</button>
          <button type="button" onClick={() => { reviewGeneration.current++; setOpened(undefined); setReviewed(undefined); setNotice(''); setBusy(false); }}>Cancel</button></div>
      </div>}
    </section>)}
    <small>Area revision {advice.boundaryRevision} · frame {advice.sequence} · deterministic rules</small>
  </article>;
}

function AssessmentMessage({ assessment, stale }: { assessment: SituationAssessment; stale: boolean }) {
  return <article className="oo-message oo-message--agent" data-assessment-frame={assessment.frameId}>
    {stale && <p className="oo-message__notice">A newer frame is displayed.</p>}
    <p className="oo-message__summary">{assessment.summary}</p>
    <CompactList title="Observed" values={assessment.observations.map((item) => item.statement)} />
    <CompactList title="Orientation" values={assessment.orientation.map((item) => item.statement)} />
    {assessment.uncertainties.length > 0 && <CompactList title="Uncertainty" values={assessment.uncertainties} />}
    {assessment.attentionItems.length > 0 && <CompactList title="Attention—not commands" values={assessment.attentionItems} />}
    <details><summary>Evidence and provenance</summary><ul>{assessment.observations.concat(assessment.orientation).map((item, index) =>
      <li key={`${item.statement}-${index}`}>{item.confidence} · {item.evidenceIds.join(', ')}</li>)}</ul>
      <p>{assessment.model} · {assessment.latencyMs} ms · frame {assessment.sequence}</p></details>
  </article>;
}

function CompactList({ title, values }: { title: string; values: string[] }) {
  return <section><strong>{title}</strong><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}
