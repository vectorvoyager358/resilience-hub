import { authedPostJsonOptional } from '../api/http';
import { Challenge, Note } from '../types';
import { getChallengeCadence } from '../utils/challengeProgress';
/** Pinecone mirror only — failures must not block Firestore or UI */
async function postUpsertPinecone(body: object): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false }
> {
  const res = await authedPostJsonOptional<Record<string, unknown>>('/api/upsert-pinecone', body);
  if (!res.ok) {
    console.warn('[Pinecone] upsert HTTP', res.status, res.detail.slice(0, 280));
    return { ok: false };
  }
  return { ok: true, data: res.data };
}

export async function upsertChallengeData(_userId: string, challenge: Challenge): Promise<void> {
  try {
    const cadence = getChallengeCadence(challenge);
    const unit = cadence === 'weekly' ? 'weeks' : 'days';
    const summary = `Challenge: ${challenge.name} (${cadence}). Progress: ${challenge.completedDays}/${challenge.duration} ${unit}.`;
    const res = await postUpsertPinecone({
      content: summary,
      metadata: {
        type: 'challenge',
        challengeId: challenge.id,
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
  _userId: string,
  challengeId: string,
  dayNumber: number,
  note: string | Note
): Promise<{ vectorId?: string }> {
  try {
    const noteContent = typeof note === 'string' ? note : note.content;

    const res = await postUpsertPinecone({
      content: noteContent,
      metadata: {
        type: 'note',
        challengeId,
        dayNumber,
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
  _userId: string,
  date: string,
  reflection: string
): Promise<void> {
  try {
    const res = await postUpsertPinecone({
      content: reflection,
      metadata: {
        type: 'reflection',
        date,
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
