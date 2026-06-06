import { authedPostJsonOrThrow } from '../api/http';
type DeleteFromPineconeParams = {
  userId?: string;
  type?: "challenge" | "note" | "reflection";
  challengeId?: string;
  dayNumber?: number;
  vectorId?: string;
  prefix?: string;
  /** Stable logical id — deletes all chunk vectors `{parentId}-c*`. */
  parentId?: string;
};

/** Must match server `parent_id_for` in server/index_content.py */
export function pineconeNoteParentId(
  uid: string,
  challengeId: string,
  dayNumber: number
): string {
  return `${uid}-note-${challengeId}-${dayNumber}`;
}

export function pineconeReflectionParentId(uid: string, date: string): string {
  return `${uid}-reflection-${date}`;
}

export function pineconeChallengeParentId(uid: string, challengeId: string): string {
  return `${uid}-challenge-${challengeId}`;
}

/** Server rejects delete when vectorId does not start with `{uid}-`. */
export function isOwnedPineconeVectorId(uid: string, vectorId: string): boolean {
  const id = vectorId.trim();
  return id.length > 0 && id.startsWith(`${uid}-`);
}

export const upsertToPinecone = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  content: string;
  metadata: Record<string, unknown>;
}) => {
  const payload = {
    content: data.content,
    metadata: {
      ...data.metadata,
      type: data.type,
      dayNumber: data.metadata.dayNumber,
      challengeId: data.metadata.challengeId,
    },
  };

  try {
    return await authedPostJsonOrThrow<Record<string, unknown>>('/api/upsert-pinecone', payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to upsert data: ${msg}`);
  }
};

/** Upsert without throwing — use when Pinecone/RAG is optional and Firestore is source of truth. */
export async function tryUpsertToPinecone(
  data: {
    userId: string;
    type: 'challenge' | 'note' | 'reflection';
    content: string;
    metadata: Record<string, unknown>;
  }
): Promise<string | undefined> {
  try {
    const res = await upsertToPinecone(data);
    return typeof res.vectorId === 'string' ? res.vectorId : undefined;
  } catch (e) {
    console.warn('[Pinecone] Upsert failed; continuing without vector id.', e);
    return undefined;
  }
}

/** Delete without throwing (optional cleanup when index may be unreachable). */
export async function tryDeleteFromPinecone(params: DeleteFromPineconeParams): Promise<void> {
  try {
    await deleteFromPinecone(params);
  } catch (e) {
    console.warn('[Pinecone] Delete failed; continuing.', e);
  }
}

export const deleteFromPinecone = async (params: DeleteFromPineconeParams) => {
  const requestBody: { vectorId?: string; prefix?: string; parentId?: string } = params.vectorId
    ? { vectorId: params.vectorId }
    : params.parentId
      ? { parentId: params.parentId }
      : params.prefix
        ? { prefix: params.prefix }
        : params.userId && params.type && params.challengeId
          ? { prefix: `${params.userId}-${params.type}-${params.challengeId}` }
          : (() => {
              throw new Error('Must provide vectorId, parentId, or prefix for deletion');
            })();

  try {
    return await authedPostJsonOrThrow<Record<string, unknown>>('/api/delete-pinecone', requestBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to delete data: ${msg}`);
  }
};

export const updatePineconeNote = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  oldVectorId?: string;
}) => {
  // Legacy single-vector id (pre-chunking). Chunked notes are replaced on content upsert.
  if (data.oldVectorId && isOwnedPineconeVectorId(data.userId, data.oldVectorId)) {
    await tryDeleteFromPinecone({ vectorId: data.oldVectorId });
  }

  const vectorId = await tryUpsertToPinecone({
    userId: data.userId,
    type: data.type,
    content: data.content,
    metadata: data.metadata
  });

  if (vectorId) {
    return { status: 'success' as const, message: 'Note updated in Pinecone', vectorId };
  }

  console.warn('[Pinecone] updatePineconeNote: skipped upsert.');
  return {
    status: 'skipped' as const,
    message: 'Pinecone unavailable — Firestore-only',
    vectorId: data.oldVectorId ?? ''
  };
};
