import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { assistantClient } from '../api/assistantClient'
import type {
  AssistantHealth,
  AssistantMissionDraft,
  AssistantRecommendationResponse,
  AssistantSuggestedAction,
  AssistantTurnResponse,
  AssistantTurnStreamEvent,
  AssistantValidation,
} from '../api/assistantTypes'
import { useAppDispatch } from '../store'
import { setWorkspace } from '../store/uiSlice'

interface ConversationMessage {
  id: string
  role: 'operator' | 'assistant'
  text: string
  contextRetrievedAt?: string
  stage?: 'OBSERVE' | 'ORIENT' | 'DECIDE'
}

interface AssistantActivity {
  id: string
  label: string
  detail?: string
  state: 'active' | 'complete' | 'error'
}

const STARTERS = [
  'Which aircraft are currently available for area observation?',
  'Help me draft a search mission.',
  'What information is missing before I can request a recommendation?',
]

function getConversationId() {
  const key = 'sentinel.assistant.conversation'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

function displayValue(value: unknown, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Not set'
  return `${String(value)}${suffix}`
}

function displayTaskType(value: AssistantMissionDraft['taskType']) {
  return value ? value.replaceAll('_', ' ').toLowerCase() : 'Not set'
}

function displayArea(draft: AssistantMissionDraft) {
  if (draft.area?.name) return draft.area.name
  if (draft.area?.center) {
    return `${draft.area.center.lat.toFixed(4)}, ${draft.area.center.lng.toFixed(4)}`
  }
  return 'Not set'
}

function displayUnresolvedField(field: string) {
  const labels: Record<string, string> = {
    taskType: 'Mission type',
    objective: 'Objective',
    area: 'Mission area',
    durationMinutesOrDeadline: 'Duration or deadline',
    priority: 'Priority',
    communicationsPolicy: 'Communications',
    authorityReference: 'Authority reference',
  }
  return labels[field] ?? field.replaceAll(/([a-z])([A-Z])/g, '$1 $2')
}

function formatTime(value?: string) {
  if (!value) return 'No context retrieved'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}

export function AssistantWorkspace() {
  const dispatch = useAppDispatch()
  const conversationId = useRef(getConversationId())
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [health, setHealth] = useState<AssistantHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [activities, setActivities] = useState<AssistantActivity[]>([])
  const [activePane, setActivePane] = useState<'copilot' | 'inspector'>('copilot')
  const [expanded, setExpanded] = useState(false)
  const [oodStage, setOodStage] = useState<'OBSERVE' | 'ORIENT' | 'DECIDE'>('OBSERVE')
  const [suggestions, setSuggestions] = useState<AssistantSuggestedAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AssistantMissionDraft | null>(null)
  const [validation, setValidation] = useState<AssistantValidation | null>(null)
  const [recommendation, setRecommendation] =
    useState<AssistantRecommendationResponse | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'I can search the canonical C2 picture, clarify mission details, and prepare a non-executable draft. I cannot access Gazebo or command a vehicle.',
    },
  ])

  const refreshHealth = useCallback(async () => {
    try {
      const result = await assistantClient.health()
      setHealth(result)
      setHealthError(null)
    } catch (requestError) {
      setHealth(null)
      setHealthError(requestError instanceof Error ? requestError.message : 'Assistant unavailable')
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
    const timer = window.setInterval(() => void refreshHealth(), 15_000)
    return () => window.clearInterval(timer)
  }, [refreshHealth])

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, pending])

  const sendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim()
    if (!trimmed || pending || health?.ready === false) return
    setInput('')
    setError(null)
    setPending(true)
    setStreamText('')
    setActivities([])
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'operator', text: trimmed },
    ])
    try {
      const turnResult: { response: AssistantTurnResponse | null } = { response: null }
      let streamedReply = ''
      let streamError: string | null = null
      const upsertActivity = (activity: AssistantActivity) => {
        setActivities((current) => {
          const existing = current.findIndex((item) => item.id === activity.id)
          if (existing < 0) return [...current, activity]
          return current.map((item, index) => index === existing ? activity : item)
        })
      }
      await assistantClient.streamTurn({
        conversationId: conversationId.current,
        operatorId: 'local-operator',
        message: trimmed,
        ...(draft ? { draftId: draft.id } : {}),
      }, (event: AssistantTurnStreamEvent) => {
        if (event.type === 'turn.started') {
          upsertActivity({ id: 'turn', label: 'Turn started', state: 'complete' })
        } else if (event.type === 'context.requested') {
          upsertActivity({ id: 'context', label: 'Reading canonical C2 picture', state: 'active' })
        } else if (event.type === 'context.received') {
          upsertActivity({ id: 'context', label: 'Canonical C2 picture received', detail: `${event.assetCount} assets · ${event.trackCount} tracks`, state: 'complete' })
        } else if (event.type === 'intent.classified') {
          setOodStage(event.stage)
          upsertActivity({ id: 'intent', label: `${event.stage}: request classified`, detail: event.intent.replaceAll('_', ' ').toLowerCase(), state: 'complete' })
        } else if (event.type === 'model.started') {
          upsertActivity({ id: 'model', label: 'Local model processing', detail: event.model, state: 'active' })
        } else if (event.type === 'model.progress') {
          upsertActivity({ id: 'model', label: 'Local model processing', detail: `${event.chunks} chunks`, state: 'active' })
        } else if (event.type === 'model.completed') {
          upsertActivity({ id: 'model', label: 'Model output received', state: 'complete' })
        } else if (event.type === 'draft.updated') {
          setDraft(event.draft)
          setValidation(null)
          setRecommendation(null)
          upsertActivity({ id: 'draft', label: 'Mission draft updated', detail: `Revision ${event.draft.revision}`, state: 'complete' })
        } else if (event.type === 'message.delta') {
          streamedReply += event.delta
          setStreamText(streamedReply)
        } else if (event.type === 'turn.completed') {
          turnResult.response = event.response
          upsertActivity({ id: 'complete', label: 'Turn complete', state: 'complete' })
        } else if (event.type === 'turn.failed') {
          streamError = event.error
          upsertActivity({ id: 'failed', label: 'Turn failed', detail: event.error, state: 'error' })
        }
      })
      if (streamError) throw new Error(streamError)
      const response = turnResult.response
      if (!response) throw new Error('Assistant stream ended before completion')
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: response.reply,
          contextRetrievedAt: response.contextRetrievedAt,
          stage: response.stage,
        },
      ])
      setOodStage(response.stage)
      setSuggestions(response.suggestedActions)
      if (response.draft) {
        setDraft(response.draft)
        setValidation(null)
        setRecommendation(null)
      }
      await refreshHealth()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Assistant turn failed')
    } finally {
      setStreamText('')
      setPending(false)
    }
  }, [draft, health?.ready, pending, refreshHealth])

  function submit(event: FormEvent) {
    event.preventDefault()
    void sendMessage(input)
  }

  async function validateDraft() {
    if (!draft) return
    setError(null)
    try {
      const result = await assistantClient.validate(draft.id)
      setValidation(result)
      setRecommendation(null)
      if (result.valid) {
        setOodStage('DECIDE')
        setSuggestions([
          { id: 'request-best-match', label: 'Request best match', kind: 'UI_ACTION', action: 'REQUEST_BEST_MATCH' },
          { id: 'change-details', label: 'Change mission details', kind: 'MESSAGE', message: 'I need to change the mission details.' },
        ])
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Validation failed')
    }
  }

  async function requestRecommendation() {
    if (!draft || !validation?.valid) return
    setError(null)
    try {
      setRecommendation(await assistantClient.requestRecommendation(draft))
      setSuggestions([
        { id: 'review-result', label: 'Review recommendation', kind: 'UI_ACTION', action: 'OPEN_INSPECTOR' },
        { id: 'change-details', label: 'Change mission details', kind: 'MESSAGE', message: 'I need to change the mission details.' },
      ])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Recommendation failed')
    }
  }

  function chooseSuggestion(suggestion: AssistantSuggestedAction) {
    if (suggestion.kind === 'MESSAGE' && suggestion.message) {
      void sendMessage(suggestion.message)
      return
    }
    if (suggestion.action === 'OPEN_INSPECTOR') {
      setActivePane('inspector')
    } else if (suggestion.action === 'VALIDATE_DRAFT') {
      setActivePane('inspector')
      void validateDraft()
    } else if (suggestion.action === 'REQUEST_BEST_MATCH') {
      setActivePane('inspector')
      void requestRecommendation()
    }
  }

  const latestContext = [...messages].reverse().find((message) => message.contextRetrievedAt)
    ?.contextRetrievedAt
  const ready = health?.ready === true

  return (
    <section className={`assistant-workspace assistant-workspace--drawer${expanded ? ' is-expanded' : ''}`} data-operator-ui>
      <header className="assistant-workspace__masthead">
        <div>
          <button
            type="button"
            className="assistant-workspace__back"
            onClick={() => dispatch(setWorkspace('tracks'))}
          >
            ← Battlespace
          </button>
          <p className="panel__eyebrow">Local mission copilot</p>
          <h1>Sentinel AI</h1>
        </div>
        <button type="button" className="assistant-workspace__expand" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <div className="assistant-status" data-ready={ready ? 'true' : 'false'}>
          <span className="assistant-status__dot" />
          <div>
            <strong>{ready ? 'AI ready' : 'AI unavailable'}</strong>
            <span>{health?.model ?? healthError ?? 'Checking local runtime…'}</span>
          </div>
        </div>
      </header>

      <div className="assistant-boundary" role="note">
        <span>EDGE INPUT</span><i>→</i><span>CANONICAL C2</span><i>→</i><strong>CANONICAL C2 ONLY</strong><i>→</i><span>DETERMINISTIC CHECK</span>
        <em>No Gazebo access · No raw device access · No command authority</em>
      </div>

      <nav className="assistant-panes" aria-label="AI workspace view">
        <button type="button" className={activePane === 'copilot' ? 'is-active' : ''} onClick={() => setActivePane('copilot')}>AI Copilot</button>
        <button type="button" className={activePane === 'inspector' ? 'is-active' : ''} onClick={() => setActivePane('inspector')}>Inspector{draft ? ` · ${draft.unresolvedFields.length}` : ''}</button>
      </nav>

      <div className="assistant-layout">
        <article className={`assistant-chat${activePane !== 'copilot' ? ' is-hidden' : ''}`}>
          <div className="assistant-chat__header">
            <div>
              <span className="assistant-chat__kicker">Conversation</span>
              <strong>Mission discovery · {oodStage}</strong>
            </div>
            <div className="assistant-chat__freshness">
              Canonical context: <strong>{formatTime(latestContext)}</strong>
            </div>
          </div>

          <div className="assistant-chat__transcript" ref={transcriptRef} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`assistant-message assistant-message--${message.role}`}>
                <span>{message.role === 'operator' ? 'OPERATOR' : 'SENTINEL AI'}</span>
                <p>{message.text}</p>
                {message.contextRetrievedAt && (
                  <small>{message.stage ? `${message.stage} · ` : ''}C2 snapshot retrieved {formatTime(message.contextRetrievedAt)}</small>
                )}
              </div>
            ))}
            {pending && (
              <div className="assistant-message assistant-message--assistant assistant-message--pending">
                <span>SENTINEL AI</span><p>{streamText || 'Reading canonical C2 state…'}</p>
              </div>
            )}
          </div>

          {suggestions.length > 0 && !pending && (
            <div className="assistant-suggestions" aria-label="Suggested next steps">
              <span>NEXT</span>
              <div>
                {suggestions.map((suggestion) => (
                  <button key={suggestion.id} type="button" onClick={() => chooseSuggestion(suggestion)}>
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activities.length > 0 && (
            <section className="assistant-activity" aria-label="Assistant activity">
              <header><span>ACTIVITY</span><strong>{pending ? 'LIVE' : 'COMPLETE'}</strong></header>
              {activities.map((activity) => (
                <div key={activity.id} data-state={activity.state}>
                  <i aria-hidden="true" />
                  <span>{activity.label}</span>
                  {activity.detail && <small>{activity.detail}</small>}
                </div>
              ))}
            </section>
          )}

          {messages.length === 1 && (
            <div className="assistant-starters">
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => void sendMessage(starter)} disabled={!ready}>
                  {starter}
                </button>
              ))}
            </div>
          )}

          {error && <div className="assistant-error" role="alert">{error}</div>}
          {!ready && healthError && (
            <div className="assistant-error" role="status">
              Start the local model and assistant service, then retry.
              <button type="button" onClick={() => void refreshHealth()}>Retry</button>
            </div>
          )}

          <form className="assistant-composer" onSubmit={submit}>
            <label htmlFor="assistant-input">Ask about assets or describe a mission</label>
            <div>
              <textarea
                id="assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                rows={3}
                maxLength={4_000}
                placeholder="Example: Search the depot area for 20 minutes and preserve 30% battery reserve."
                disabled={!ready || pending}
              />
              <button type="submit" disabled={!ready || pending || !input.trim()}>
                {pending ? 'Working…' : 'Send'}
              </button>
            </div>
            <small>Responses are advisory. Structured fields are independently validated.</small>
          </form>
        </article>

        <aside className={`assistant-draft${activePane !== 'inspector' ? ' is-hidden' : ''}`}>
          <div className="assistant-draft__header">
            <div><span>MISSION DRAFT</span><strong>{draft ? `REV ${draft.revision}` : 'EMPTY'}</strong></div>
            <span className={`assistant-draft__state assistant-draft__state--${draft?.status.toLowerCase() ?? 'empty'}`}>
              {draft?.status.replaceAll('_', ' ') ?? 'Awaiting details'}
            </span>
          </div>

          {!draft ? (
            <div className="assistant-draft__empty">
              <span>◇</span>
              <h2>No mission draft yet</h2>
              <p>Describe a mission in the conversation. Known details will appear here while the AI asks for missing fields.</p>
            </div>
          ) : (
            <>
              <div className="assistant-draft__objective">
                <span>{displayTaskType(draft.taskType)}</span>
                <h2>{displayValue(draft.objective)}</h2>
              </div>
              <dl className="assistant-draft__fields">
                <div><dt>Area</dt><dd>{displayArea(draft)}</dd></div>
                <div><dt>Radius</dt><dd>{displayValue(draft.area?.radiusM, ' m')}</dd></div>
                <div><dt>Duration</dt><dd>{displayValue(draft.durationMinutes, ' min')}</dd></div>
                <div><dt>Priority</dt><dd>{displayValue(draft.priority, '/100')}</dd></div>
                <div><dt>Reserve</dt><dd>{displayValue(draft.minimumReservePercent, '%')}</dd></div>
                <div><dt>Comms</dt><dd>{displayValue(draft.communicationsPolicy)}</dd></div>
              </dl>

              <section className="assistant-draft__section">
                <h3>Required capabilities</h3>
                <div className="assistant-draft__tags">
                  {draft.requiredCapabilities.length
                    ? draft.requiredCapabilities.map((capability) => <span key={capability}>{capability}</span>)
                    : <em>None specified</em>}
                </div>
              </section>

              <section className="assistant-draft__section">
                <h3>Unresolved fields <b>{draft.unresolvedFields.length}</b></h3>
                <div className="assistant-draft__tags assistant-draft__tags--warn">
                  {draft.unresolvedFields.length
                    ? draft.unresolvedFields.map((field) => <span key={field}>{displayUnresolvedField(field)}</span>)
                    : <em>All required fields supplied</em>}
                </div>
              </section>

              <div className="assistant-approval-lock">
                <span>LOCKED</span>
                <p><strong>Operator approval required</strong>No assistant action can dispatch this draft.</p>
              </div>

              {validation && (
                <div className={`assistant-validation assistant-validation--${validation.valid ? 'valid' : 'invalid'}`}>
                  <strong>{validation.valid ? 'Deterministic validation passed' : 'Validation blocked'}</strong>
                  {validation.errors.map((validationError) => <span key={validationError}>{validationError}</span>)}
                </div>
              )}

              <button
                type="button"
                className="assistant-draft__action"
                onClick={() => void validateDraft()}
              >
                Validate draft
              </button>
              <button
                type="button"
                className="assistant-draft__action assistant-draft__action--primary"
                disabled={!validation?.valid}
                onClick={() => void requestRecommendation()}
              >
                Request best match
              </button>

              {recommendation && (
                <RecommendationCard recommendation={recommendation} />
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

function RecommendationCard({ recommendation }: { recommendation: AssistantRecommendationResponse }) {
  const { plan } = recommendation
  return (
    <section className="assistant-recommendation">
      <header><span>DETERMINISTIC RESULT</span><strong>{plan.status}</strong></header>
      <h3>{plan.summary}</h3>
      {plan.assignments.map((assignment) => (
        <article key={`${assignment.objectiveId}-${assignment.vehicleId}`}>
          <div><span>TOP MATCH</span><strong>{assignment.vehicleId}</strong></div>
          <dl>
            <div><dt>ETA</dt><dd>{assignment.etaSeconds === null ? '—' : `${assignment.etaSeconds}s`}</dd></div>
            <div><dt>Cost</dt><dd>{assignment.cost}</dd></div>
          </dl>
          <ul>{assignment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </article>
      ))}
      {plan.assignments.length === 0 && <p>No eligible asset currently satisfies the draft.</p>}
      <footer>Recommendation only · Confirmation remains in the normal operator workflow</footer>
    </section>
  )
}
