import { embedTextToVector } from './embeddings';

// Update the type definition to include 'prefix'
type DeleteFromPineconeParams = {
  userId?: string;
  type?: "challenge" | "note" | "reflection";
  challengeId?: string;
  dayNumber?: number;
  vectorId?: string;
  prefix?: string;
};

// Upsert to Pinecone and return vectorId
export const upsertToPinecone = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  content: string;
  metadata: Record<string, any>;
}) => {
  // Generate embedding from content
  // (Assume embedding is handled elsewhere if using pinecone.ts for upserts)
  const payload = {
    userId: data.userId,
    vector: await embedTextToVector(data.content), // If you use Gemini here
    metadata: {
      ...data.metadata,
      type: data.type,
      content: data.content,
      dayNumber: data.metadata.dayNumber,
      challengeId: data.metadata.challengeId,
    }
  };

  const response = await fetch('/api/upsert-pinecone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to upsert data: ${errorData}`);
  }

  // Return the vectorId so it can be stored in Firestore
  return await response.json();
};

/** Upsert without throwing — use when Pinecone/RAG is optional and Firestore is source of truth. */
export async function tryUpsertToPinecone(
  data: {
    userId: string;
    type: 'challenge' | 'note' | 'reflection';
    content: string;
    metadata: Record<string, any>;
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

// Delete from Pinecone using vectorId or prefix
export const deleteFromPinecone = async (params: DeleteFromPineconeParams) => {
  let requestBody: any = {};
  if (params.vectorId) {
    requestBody.vectorId = params.vectorId;
  } else if (params.prefix) {
    requestBody.prefix = params.prefix;
  } else if (params.userId && params.type && params.challengeId) {
    // Fallback for legacy support
    requestBody.prefix = `${params.userId}-${params.type}-${params.challengeId}`;
  } else {
    throw new Error('Must provide vectorId or prefix for deletion');
  }

  const response = await fetch('/api/delete-pinecone', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to delete data: ${errorData}`);
  }

  return await response.json();
};

// If you have updatePineconeNote, make sure it uses vectorId for deletion
export const updatePineconeNote = async (data: {
  userId: string;
  type: 'challenge' | 'note' | 'reflection';
  id: string;
  content: string;
  metadata: Record<string, any>;
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
