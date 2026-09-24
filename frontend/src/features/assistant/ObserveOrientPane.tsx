import { useEffect, useRef, useState } from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { SituationAssessment } from '../../services/observeOrientClient';
import './assistant.css';

export function ObserveOrientPane() {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const [question, setQuestion] = useState('What do we observe, and how should the operator orient to the current situation?');
  const [assessment, setAssessment] = useState<SituationAssessment>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);

  async function assess() {
    if (!frame || busy || !question.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      setAssessment(
        await runtime.observeOrient.assess(
          frame.mission.id,
          frame.frameId,
          question.trim(),
          controller.signal,
        ),
      );
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : 'Assessment failed.');
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  return (
    <div className="oo-pane">
      <header>
        <span className="constraint-tag">READ ONLY · EVIDENCE GROUNDED</span>
        <h1>Observe / Orient Copilot</h1>
        <p>
          {frame
            ? `Committed frame ${frame.sequence} · source ${frame.effectiveAt}`
            : 'Load a mission to assess its committed observations.'}
        </p>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); void assess(); }}>
        <label>
          Operator question
          <textarea value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button disabled={!frame || busy || !question.trim()}>{busy ? 'ASSESSING…' : 'OBSERVE & ORIENT'}</button>
      </form>
      {error && <p role="alert" className="oo-error">{error}</p>}
      {assessment && (
        <article data-assessment-frame={assessment.frameId}>
          {frame?.frameId !== assessment.frameId && <p className="oo-stale">A newer frame is displayed. Refresh the assessment before relying on it.</p>}
          <h2>Assessment</h2><p>{assessment.summary}</p>
          <div className="oo-columns">
            <FindingList title="Observed facts" values={assessment.observations} />
            <FindingList title="Orientation" values={assessment.orientation} />
          </div>
          <List title="Uncertainties" values={assessment.uncertainties} />
          <List title="Attention—not commands" values={assessment.attentionItems} />
          <details><summary>Limitations and provenance</summary><List title="Limitations" values={assessment.limitations} /><p>{assessment.model} · {assessment.latencyMs} ms · generated {assessment.generatedAt}</p></details>
        </article>
      )}
    </div>
  );
}
function FindingList({ title, values }: { title: string; values: SituationAssessment['observations'] }) {
  return <section><h2>{title}</h2><ul>{values.map((item, index) => <li key={`${item.statement}-${index}`}><p>{item.statement}</p><small>{item.confidence} confidence · evidence {item.evidenceIds.join(', ')}</small></li>)}</ul></section>;
}
function List({ title, values }: { title: string; values: string[] }) {
  return <section><h2>{title}</h2>{values.length ? <ul>{values.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None reported.</p>}</section>;
}
