export interface ChatSessionMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: string;
}

export interface ChatSessionPayload {
  open: boolean;
  messages: ChatSessionMessage[];
}

const STORAGE_VERSION = 2;
const MAX_STORED_MESSAGES = 50;
const MAX_STORED_CONTENT_CHARS = 4000;

function sessionKey(uid: string): string {
  return `resilience-hub-assistant-chat:v${STORAGE_VERSION}:${uid}`;
}

function legacyLocalKey(uid: string): string {
  return `resilience-hub-assistant-chat:v1:${uid}`;
}

export function loadChatSession(uid: string): ChatSessionPayload | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    // Version 1 stored sensitive journal conversations indefinitely. Remove it
    // during migration; version 2 intentionally lasts only for this browser tab.
    window.localStorage.removeItem(legacyLocalKey(uid));
    const raw = window.sessionStorage.getItem(sessionKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.v !== STORAGE_VERSION || typeof parsed.open !== 'boolean') return null;
    if (!Array.isArray(parsed.messages)) return null;
    const messages: ChatSessionMessage[] = [];
    for (const item of parsed.messages.slice(-MAX_STORED_MESSAGES)) {
      if (!item || typeof item !== 'object') continue;
      const message = item as Record<string, unknown>;
      if (
        typeof message.id !== 'string' ||
        typeof message.content !== 'string' ||
        typeof message.timestamp !== 'string' ||
        (message.sender !== 'user' && message.sender !== 'assistant')
      ) continue;
      if (Number.isNaN(new Date(message.timestamp).getTime())) continue;
      messages.push({
        id: message.id,
        content: message.content.slice(0, MAX_STORED_CONTENT_CHARS),
        sender: message.sender,
        timestamp: message.timestamp,
      });
    }
    return { open: parsed.open, messages };
  } catch {
    return null;
  }
}

export function saveChatSession(uid: string, payload: ChatSessionPayload): void {
  if (typeof window === 'undefined' || !uid) return;
  const messages = payload.messages.slice(-MAX_STORED_MESSAGES).map((message) => ({
    ...message,
    content: message.content.slice(0, MAX_STORED_CONTENT_CHARS),
  }));
  window.sessionStorage.setItem(
    sessionKey(uid),
    JSON.stringify({ v: STORAGE_VERSION, open: payload.open, messages }),
  );
}
