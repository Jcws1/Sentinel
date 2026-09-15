import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { viewKind, type ViewId } from '../workspace/viewRegistry';
import { parseVoiceCommand, type VoiceCommand, voiceThread } from './voice';
import './voice.css';

type CommandPhase =
  'hidden' | 'recording' | 'transcribing' | 'planning' | 'review' | 'error';
type CaptureKind = 'dictation' | 'command';
interface Capture {
  kind: CaptureKind;
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  cancelled: boolean;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export function VoiceController({ bridge }: { bridge: WorkspaceBridge }) {
  const [phase, setPhase] = useState<CommandPhase>('hidden');
  const [pending, setPending] = useState<VoiceCommand>();
  const [error, setError] = useState<string>();
  const phaseRef = useRef(phase);
  const capture = useRef<Capture | undefined>(undefined);
  const dictationTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const clearTimer = () => {
      if (dictationTimer.current !== undefined)
        window.clearTimeout(dictationTimer.current);
      dictationTimer.current = undefined;
    };
    const resetCommand = () => {
      setPending(undefined);
      setError(undefined);
      setPhase('hidden');
    };
    const cancel = () => {
      clearTimer();
      const active = capture.current;
      if (active) {
        active.cancelled = true;
        active.chunks.length = 0;
        capture.current = undefined;
        active.stream.getTracks().forEach((track) => track.stop());
        if (active.recorder.state !== 'inactive') active.recorder.stop();
      }
      voiceThread.setStatus('idle');
      resetCommand();
    };
    const finish = async (active: Capture) => {
      if (capture.current === active) capture.current = undefined;
      active.stream.getTracks().forEach((track) => track.stop());
      if (active.cancelled) return;
      const audio = new Blob(active.chunks, {
        type: active.recorder.mimeType || 'audio/webm',
      });
      if (!audio.size) {
        voiceThread.setStatus('idle');
        resetCommand();
        return;
      }
      try {
        if (active.kind === 'command') setPhase('transcribing');
        else voiceThread.setStatus('transcribing');
        const form = new FormData();
        form.append('file', audio, 'sentinel-voice.webm');
        const response = await fetch('/api/voice/transcribe', {
          method: 'POST',
          body: form,
        });
        const result = await readJson(response);
        if (!response.ok || typeof result.text !== 'string')
          throw new Error(
            typeof result.detail === 'string'
              ? result.detail
              : 'Transcription failed.',
          );
        if (active.kind === 'dictation') {
          voiceThread.setDraft(result.text.trim());
          voiceThread.setStatus('idle');
          bridge.open('voice');
          return;
        }
        setPhase('planning');
        const planned = await fetch('/api/voice/command', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transcript: result.text }),
        });
        const body = await readJson(planned);
        const command = parseVoiceCommand(body.command);
        if (!planned.ok || !command)
          throw new Error(
            typeof body.detail === 'string'
              ? body.detail
              : 'Unsupported Sentinel command.',
          );
        setPending(command);
        setPhase('review');
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Voice input failed.';
        if (active.kind === 'command') {
          setError(message);
          setPhase('error');
        } else voiceThread.setStatus('error', message);
      }
    };
    const begin = async (kind: CaptureKind) => {
      if (
        capture.current ||
        (kind === 'command' && phaseRef.current !== 'hidden')
      )
        return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (capture.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const recorder = new MediaRecorder(stream);
        const active: Capture = {
          kind,
          recorder,
          stream,
          chunks: [],
          cancelled: false,
        };
        recorder.ondataavailable = (event) => {
          if (event.data.size) active.chunks.push(event.data);
        };
        recorder.onstop = () => void finish(active);
        capture.current = active;
        if (kind === 'command') {
          setError(undefined);
          setPhase('recording');
        } else voiceThread.setStatus('recording');
        recorder.start();
      } catch {
        const message = 'Microphone access is required for voice input.';
        if (kind === 'command') {
          setError(message);
          setPhase('error');
        } else voiceThread.setStatus('error', message);
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (capture.current || phaseRef.current !== 'hidden')
      ) {
        event.preventDefault();
        cancel();
        return;
      }
      if (!event.ctrlKey || !event.shiftKey || event.repeat) return;
      if (event.code === 'KeyQ') {
        event.preventDefault();
        clearTimer();
        // Ctrl+Shift can already have begun dictation before Q arrives. The
        // command chord always wins, so discard that partial capture instead
        // of later inserting it into the Voice Thread.
        const active = capture.current;
        if (active?.kind === 'dictation') {
          active.cancelled = true;
          active.chunks.length = 0;
          capture.current = undefined;
          active.stream.getTracks().forEach((track) => track.stop());
          if (active.recorder.state !== 'inactive') active.recorder.stop();
          voiceThread.setStatus('idle');
        }
        void begin('command');
      } else if (
        (event.key === 'Control' || event.key === 'Shift') &&
        !capture.current
      ) {
        dictationTimer.current ??= window.setTimeout(() => {
          dictationTimer.current = undefined;
          void begin('dictation');
        }, 180);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey) return;
      clearTimer();
      const active = capture.current;
      if (active && active.recorder.state !== 'inactive')
        active.recorder.stop();
    };
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, [bridge]);

  const approve = () => {
    if (!pending) return;
    if (pending.action === 'navigate') bridge.open(pending.target as ViewId);
    if (pending.action === 'toggle_tracks') {
      const tracks = bridge
        .getSnapshot()
        .views.find((view) => viewKind(view.id) === 'tracks');
      if (tracks) bridge.close(tracks.id);
      else bridge.open('tracks');
    }
    if (pending.action === 'recenter_map') {
      bridge.open('tactical');
      bridge.recenterMap('tactical');
    }
    if (pending.action === 'draft_chat') {
      voiceThread.setDraft(pending.text);
      bridge.open('voice');
    }
    if (pending.action === 'send_chat') {
      voiceThread.send(pending.text);
      bridge.open('voice');
    }
    setPending(undefined);
    setPhase('hidden');
  };

  if (phase === 'hidden') return null;
  return (
    <section
      className="voice-command-overlay"
      role="dialog"
      aria-label="Voice command"
    >
      {phase === 'review' && pending ? (
        <>
          <p className="voice-overline">Review command</p>
          <p className="voice-command-summary">{pending.summary}</p>
          {'text' in pending && (
            <p className="voice-command-text">{pending.text}</p>
          )}
          <div className="voice-command-actions">
            <button className="primary-button" type="button" onClick={approve}>
              <Check size={14} />
              Approve
            </button>
            <button
              className="voice-secondary-button"
              type="button"
              onClick={() => setPhase('hidden')}
            >
              <X size={14} />
              Reject
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="voice-command-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="voice-command-summary">
            {phase === 'recording'
              ? 'Listening for a Sentinel command…'
              : phase === 'transcribing'
                ? 'Transcribing command…'
                : phase === 'planning'
                  ? 'Preparing command review…'
                  : 'Voice command needs attention.'}
          </p>
          {phase === 'error' && error && <p className="voice-error">{error}</p>}
          <p className="voice-command-hint">
            Release Ctrl or Shift when finished · Escape cancels
          </p>
        </>
      )}
    </section>
  );
}
