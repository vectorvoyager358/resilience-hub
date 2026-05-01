import { describe, expect, it, vi } from 'vitest';

// Avoid calling real embedding providers in tests.
vi.mock('./embeddings', () => ({
  embedTextToVector: vi.fn(async () => new Array(3).fill(0.01)),
}));

describe('Pinecone optional helpers', () => {
  it('tryUpsertToPinecone returns undefined when fetch fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const mod = await import('./api');
    const vectorId = await mod.tryUpsertToPinecone({
      userId: 'u1',
      type: 'note',
      content: 'hello',
      metadata: { challengeId: 'c1', dayNumber: 1 },
    });

    expect(vectorId).toBeUndefined();
  });

  it('tryDeleteFromPinecone does not throw when fetch fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const mod = await import('./api');
    await expect(mod.tryDeleteFromPinecone({ vectorId: 'vid-1' })).resolves.toBeUndefined();
  });
});

