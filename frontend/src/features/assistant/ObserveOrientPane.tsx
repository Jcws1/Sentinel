import { useEffect, useRef, useState } from 'react';
import { useOperationalRuntime, useOperationalSnapshot } from '../../app/OperationalContext';
import type { SituationAssessment } from '../../services/observeOrientClient';
import './assistant.css';

type Turn = { id: number; question: string; assessment?: SituationAssessment; error?: string };

export function ObserveOrientPane() {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const [question, setQuestion] = useState('');
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
          {turn.error && <div className="oo-message oo-message--agent oo-message--error">{turn.error}</div>}
        </div>)}
        {busy && <div className="oo-message oo-message--agent oo-message--busy">Assessing committed observations…</div>}
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
