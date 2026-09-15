export type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'error';

export type VoiceCommand =
  | { action: 'navigate'; target: string; summary: string }
  | { action: 'toggle_tracks' | 'recenter_map'; summary: string }
  | { action: 'draft_chat' | 'send_chat'; text: string; summary: string };

const views = new Set([
  'tactical',
  'three-d',
  'tracks',
  'command',
  'vertical',
  'timeline',
  'credits',
]);

export function parseVoiceCommand(value: unknown): VoiceCommand | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as Record<string, unknown>;
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!summary || summary.length > 160 || typeof input.action !== 'string')
    return;
  const allowedFields = new Set(['action', 'summary']);
  if (input.action === 'navigate') allowedFields.add('target');
  else if (input.action === 'draft_chat' || input.action === 'send_chat')
    allowedFields.add('text');
  else if (input.action !== 'toggle_tracks' && input.action !== 'recenter_map')
    return;
  if (Object.keys(input).some((key) => !allowedFields.has(key))) return;
  if (
    input.action === 'navigate' &&
    typeof input.target === 'string' &&
    views.has(input.target)
  )
    return { action: 'navigate', target: input.target, summary };
  if (input.action === 'toggle_tracks' || input.action === 'recenter_map')
    return { action: input.action, summary };
  if (
    (input.action === 'draft_chat' || input.action === 'send_chat') &&
    typeof input.text === 'string' &&
    input.text.trim() &&
    input.text.trim().length <= 1000
  )
    return { action: input.action, text: input.text.trim(), summary };
}

export interface VoiceThreadSnapshot {
  status: VoiceStatus;
  draft: string;
  messages: readonly string[];
  error?: string;
}

export function createVoiceThreadStore() {
  let snapshot: VoiceThreadSnapshot = {
    status: 'idle',
    draft: '',
    messages: [],
  };
  const listeners = new Set<() => void>();
  const publish = (change: Partial<VoiceThreadSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...change });
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setStatus(status: VoiceStatus, error?: string) {
      publish({ status, error });
    },
    setDraft(draft: string) {
      publish({ draft });
    },
    sendDraft() {
      const message = snapshot.draft.trim();
      if (!message) return;
      publish({ draft: '', messages: [...snapshot.messages, message] });
    },
    send(text: string) {
      const message = text.trim();
      if (message)
        publish({ draft: '', messages: [...snapshot.messages, message] });
    },
  };
}

export const voiceThread = createVoiceThreadStore();
