import { describe, expect, it, vi } from 'vitest';

// Avoid initializing the real Firebase SDK (no API key in CI).
// `authedFetch` only reads `auth.currentUser`; null is fine — it throws
// "not signed in", which the optional helpers swallow into the same
// "skip and continue" behavior we're asserting on.
vi.mock('../../../src/services/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

// Avoid calling real embedding providers in tests.
vi.mock('../../../src/utils/embeddings', () => ({
  embedTextToVector: vi.fn(async () => new Array(3).fill(0.01)),
}));

describe('Pinecone parent id helpers', () => {
  it('builds ids aligned with server parent_id_for', async () => {
    const mod = await import('../../../src/utils/api');
    expect(mod.pineconeReflectionParentId('uid1', '2026-06-06')).toBe(
      'uid1-reflection-2026-06-06'
    );
    expect(mod.pineconeNoteParentId('uid1', 'c1', 3)).toBe('uid1-note-c1-3');
    expect(mod.isOwnedPineconeVectorId('uid1', 'uid1-note-c1-3-c0')).toBe(true);
    expect(mod.isOwnedPineconeVectorId('uid1', 'reflection_2026-06-06')).toBe(false);
  });
});

describe('Pinecone optional helpers', () => {
  it('tryUpsertToPinecone returns undefined when the request cannot be made', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const mod = await import('../../../src/utils/api');
    const vectorId = await mod.tryUpsertToPinecone({
      userId: 'u1',
      type: 'note',
      content: 'hello',
      metadata: { challengeId: 'c1', dayNumber: 1 },
    });

    expect(vectorId).toBeUndefined();
  });

  it('tryDeleteFromPinecone does not throw when the request cannot be made', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const mod = await import('../../../src/utils/api');
    await expect(mod.tryDeleteFromPinecone({ vectorId: 'vid-1' })).resolves.toBeUndefined();
  });
});
