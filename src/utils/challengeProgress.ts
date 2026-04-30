import type { Challenge, Note, User } from '../types';

/** 1-based calendar day index for today relative to challenge startDate (local calendar). */
export function getChallengeCalendarDayIndex(challenge: Challenge): number {
  const startDate = new Date(challenge.startDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const challengeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const daysSinceStart = Math.floor(
    (todayStart.getTime() - challengeStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceStart + 1;
}

/** Calendar window ended: past the last planned day, regardless of how many logs exist. Active while index ≤ duration. */
export function isChallengePastCalendarDuration(challenge: Challenge): boolean {
  return getChallengeCalendarDayIndex(challenge) > challenge.duration;
}

/** Notes keyed by legacy string or migrated Note objects. */
type NotesBag = { [day: string]: Note | string | undefined };

/** Coerce legacy string notes into `{ content, vectorId }` shape. */
export function migrateNotes(notes: { [key: string]: any }): { [key: string]: Note } {
  const migrated: { [key: string]: Note } = {};
  for (const [day, value] of Object.entries(notes || {})) {
    if (typeof value === 'string') {
      migrated[day] = { content: value, vectorId: '' };
    } else if (value && typeof value === 'object') {
      migrated[day] = value as Note;
    }
  }
  return migrated;
}

/** Count calendar slots 1..duration that have a non-empty note (canonical progress). */
export function countFilledDaysInWindowFromNotes(notes: NotesBag, duration: number): number {
  let count = 0;
  for (let d = 1; d <= duration; d++) {
    const raw = notes[String(d)];
    let content = '';
    if (typeof raw === 'string') content = raw;
    else if (raw && typeof raw.content === 'string') content = raw.content;
    if (content.trim().length > 0) count++;
  }
  return count;
}

export function syncChallengeCompletedDays(challenge: Challenge): Challenge {
  const notes = migrateNotes(challenge.notes as { [key: string]: any });
  const completedDays = countFilledDaysInWindowFromNotes(notes, challenge.duration);
  return { ...challenge, notes, completedDays };
}

export function normalizeUserChallenges(userData: User): User {
  return {
    ...userData,
    challenges: (userData.challenges || []).map((c) => syncChallengeCompletedDays(c)),
  };
}
