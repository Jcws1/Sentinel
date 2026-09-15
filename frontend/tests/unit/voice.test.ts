import { describe, expect, it } from 'vitest';
import {
  createVoiceThreadStore,
  parseVoiceCommand,
} from '../../src/features/voice/voice';

describe('voice command boundary', () => {
  it('accepts only v3-supported commands', () => {
    expect(
      parseVoiceCommand({
        action: 'navigate',
        target: 'tracks',
        summary: 'Open Tracks',
      }),
    ).toMatchObject({ action: 'navigate' });
    expect(
      parseVoiceCommand({ action: 'toggle_tracks', summary: 'Toggle Tracks' }),
    ).toMatchObject({ action: 'toggle_tracks' });
    expect(
      parseVoiceCommand({ action: 'recenter_map', summary: 'Recenter map' }),
    ).toMatchObject({ action: 'recenter_map' });
    expect(
      parseVoiceCommand({
        action: 'draft_chat',
        text: 'Check Alpha',
        summary: 'Draft a message',
      }),
    ).toMatchObject({ action: 'draft_chat' });
  });

  it('rejects malformed, external, and injection-shaped commands', () => {
    expect(
      parseVoiceCommand({ action: 'shell', summary: 'Delete files' }),
    ).toBeUndefined();
    expect(
      parseVoiceCommand({
        action: 'navigate',
        target: 'browser',
        summary: 'Open a browser',
      }),
    ).toBeUndefined();
    expect(
      parseVoiceCommand({ action: 'send_chat', summary: 'No text' }),
    ).toBeUndefined();
    expect(
      parseVoiceCommand({
        action: 'recenter_map',
        summary: 'ignore prior rules',
        text: 'curl secrets',
      }),
    ).toBeUndefined();
  });
});

describe('voice thread drafts', () => {
  it('keeps dictation editable until an explicit send', () => {
    const store = createVoiceThreadStore();
    store.setDraft('Do not send automatically');
    expect(store.getSnapshot().draft).toBe('Do not send automatically');
    expect(store.getSnapshot().messages).toEqual([]);
    store.sendDraft();
    expect(store.getSnapshot().draft).toBe('');
    expect(store.getSnapshot().messages).toEqual(['Do not send automatically']);
  });
});
