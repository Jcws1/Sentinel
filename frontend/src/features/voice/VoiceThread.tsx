import { useRef, useSyncExternalStore } from 'react';
import { Mic, Send } from 'lucide-react';
import { voiceThread } from './voice';
import './voice.css';

export function VoiceThread() {
  const state = useSyncExternalStore(
    voiceThread.subscribe,
    voiceThread.getSnapshot,
  );
  const input = useRef<HTMLTextAreaElement>(null);
  const status =
    state.status === 'recording'
      ? 'Recording — release Ctrl or Shift to finish'
      : state.status === 'transcribing'
        ? 'Transcribing securely…'
        : 'Hold Ctrl + Shift to dictate · Ctrl + Shift + Q for a command';
  return (
    <div className="voice-thread">
      <div className="voice-thread-status">
        <Mic size={14} />
        <span>{status}</span>
      </div>
      {state.error && <p className="voice-error">{state.error}</p>}
      <div className="voice-history" aria-live="polite">
        {state.messages.length ? (
          state.messages.map((message, index) => (
            <p className="voice-message" key={`${index}:${message}`}>
              {message}
            </p>
          ))
        ) : (
          <p className="voice-empty">
            Dictation is inserted as an editable draft. Voice commands always
            require approval.
          </p>
        )}
      </div>
      <form
        className="voice-composer"
        onSubmit={(event) => {
          event.preventDefault();
          voiceThread.sendDraft();
          input.current?.focus();
        }}
      >
        <label htmlFor="voice-composer">Mission thread</label>
        <textarea
          ref={input}
          id="voice-composer"
          rows={4}
          value={state.draft}
          onChange={(event) => voiceThread.setDraft(event.target.value)}
          placeholder="Dictation appears here before sending."
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!state.draft.trim()}
        >
          <Send size={14} /> Send
        </button>
      </form>
    </div>
  );
}
