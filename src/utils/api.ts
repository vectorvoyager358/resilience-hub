import { embedTextToVector } from './embeddings';
import { apiUrl } from './apiBase';
import { authedFetch } from './authFetch';

type DeleteFromPineconeParams = {
  userId?: string;
  type?: "challenge" | "note" | "reflection";
  challengeId?: string;
  dayNumber?: number;
  vectorId?: string;
  prefix?: string;
};

export const upsertToPinecone = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  content: string;
  metadata: Record<string, unknown>;
}) => {
  const payload = {
    vector: await embedTextToVector(data.content),
    metadata: {
      ...data.metadata,
      type: data.type,
      content: data.content,
      dayNumber: data.metadata.dayNumber,
      challengeId: data.metadata.challengeId,
    },
  };

  const response = await authedFetch(apiUrl('/api/upsert-pinecone'), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to upsert data: ${errorData}`);
  }

  return await response.json();
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
  const requestBody: { vectorId?: string; prefix?: string } = params.vectorId
    ? { vectorId: params.vectorId }
    : params.prefix
      ? { prefix: params.prefix }
      : params.userId && params.type && params.challengeId
        ? { prefix: `${params.userId}-${params.type}-${params.challengeId}` }
        : (() => {
            throw new Error('Must provide vectorId or prefix for deletion');
          })();

  const response = await authedFetch(apiUrl('/api/delete-pinecone'), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to delete data: ${errorData}`);
  }

  return await response.json();
};

export const updatePineconeNote = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  oldVectorId?: string;
}) => {
  if (data.oldVectorId) {
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
