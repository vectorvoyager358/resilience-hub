import { Challenge, Note } from '../types';
import { apiUrl } from '../utils/apiBase';
import { embedTextToVector } from '../utils/embeddings';

/** Pinecone mirror only — failures must not block Firestore or UI */
async function postUpsertPinecone(body: object): Promise<{
  ok: true;
  data: Record<string, unknown>;
} | { ok: false }> {
  try {
    const response = await fetch(apiUrl('/api/upsert-pinecone'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn('[Pinecone] upsert HTTP', response.status, text.slice(0, 280));
      return { ok: false };
    }
    try {
      return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
    } catch {
      console.warn('[Pinecone] upsert response was not JSON');
      return { ok: false };
    }
  } catch (e) {
    console.warn('[Pinecone] upsert request failed:', e);
    return { ok: false };
  }
}

export async function upsertChallengeData(userId: string, challenge: Challenge): Promise<void> {
  try {
    const summary = `Challenge: ${challenge.name}. Progress: ${challenge.completedDays}/${challenge.duration} days.`;
    const vector = await embedTextToVector(summary);
    const res = await postUpsertPinecone({
      userId,
      vector,
      metadata: {
        type: 'challenge',
        challengeId: challenge.id,
        content: summary,
        date: new Date().toISOString(),
      },
    });
    if (!res.ok) {
      console.warn('[Pinecone] challenge summary mirror skipped.');
    }
  } catch (e) {
    console.warn('[Pinecone] upsertChallengeData skipped (embedding or backend):', e);
  }
}

export async function upsertNoteData(
  userId: string,
  challengeId: string,
  dayNumber: number,
  note: string | Note
): Promise<{ vectorId?: string }> {
  try {
    const noteContent = typeof note === 'string' ? note : note.content;
    const vector = await embedTextToVector(noteContent);

    const res = await postUpsertPinecone({
      userId,
      vector,
      metadata: {
        type: 'note',
        challengeId,
        dayNumber,
        content: noteContent,
        date: new Date().toISOString(),
      },
    });

    if (!res.ok) return {};
    const vid = res.data.vectorId;
    return typeof vid === 'string' ? { vectorId: vid } : {};
  } catch (e) {
    console.warn('[Pinecone] upsertNoteData skipped:', e);
    return {};
  }
}

export async function upsertDailyReflection(
  userId: string,
  date: string,
  reflection: string
): Promise<void> {
  try {
    const vector = await embedTextToVector(reflection);
    const res = await postUpsertPinecone({
      userId,
      vector,
      metadata: {
        type: 'reflection',
        date,
        content: reflection,
        dateCreated: new Date().toISOString(),
      },
    });
    if (!res.ok) {
      console.warn('[Pinecone] daily reflection mirror skipped.');
    }
  } catch (e) {
    console.warn('[Pinecone] upsertDailyReflection skipped:', e);
  }
}
