import { beforeEach, describe, expect, it } from 'vitest';
import { loadChatSession, saveChatSession } from '../../../src/utils/chatStorage';

describe('chatStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps chat in session storage and removes legacy persistent chat', () => {
    localStorage.setItem('resilience-hub-assistant-chat:v1:u1', '{"private":"note"}');
    saveChatSession('u1', {
      open: true,
      messages: [{ id: 'm1', content: 'hello', sender: 'user', timestamp: '2026-08-07T00:00:00Z' }],
    });

    expect(loadChatSession('u1')).toEqual({
      open: true,
      messages: [{ id: 'm1', content: 'hello', sender: 'user', timestamp: '2026-08-07T00:00:00Z' }],
    });
    expect(localStorage.getItem('resilience-hub-assistant-chat:v1:u1')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
  });

  it('bounds retained history to the newest 50 messages', () => {
    saveChatSession('u1', {
      open: false,
      messages: Array.from({ length: 55 }, (_, index) => ({
        id: `m${index}`,
        content: 'x'.repeat(5000),
        sender: 'assistant' as const,
        timestamp: '2026-08-07T00:00:00Z',
      })),
    });
    const restored = loadChatSession('u1');
    expect(restored?.messages).toHaveLength(50);
    expect(restored?.messages[0]?.id).toBe('m5');
    expect(restored?.messages[0]?.content).toHaveLength(4000);
  });
});
