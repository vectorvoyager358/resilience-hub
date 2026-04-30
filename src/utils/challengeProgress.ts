import type { Challenge, Note, User } from '../types';

/** Calendar day 1 aligns with challenge startDate's local calendar date (midnight-normalized). */
export function getChallengeCalendarStartLocal(challenge: Challenge): Date {
  const startDate = new Date(challenge.startDate);
  return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
}

/** 1-based calendar day index for today relative to challenge start (same local-normalization rules as archiving). */
export function getChallengeCalendarDayIndex(challenge: Challenge): number {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const challengeStart = getChallengeCalendarStartLocal(challenge);
  const daysSinceStart = Math.floor(
    (todayStart.getTime() - challengeStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceStart + 1;
}

/**
 * Last local calendar date inside the planned window (day index === duration).
 * First archived calendar day is the day after this.
 */
export function getChallengeWindowLastDayLocalDate(challenge: Challenge): Date {
  const dur = Math.max(1, challenge.duration);
  const startLocal = getChallengeCalendarStartLocal(challenge);
  const last = new Date(startLocal);
  last.setDate(startLocal.getDate() + dur - 1);
  return last;
}

export function formatChallengeWindowEndCalendarDisplay(challenge: Challenge): string {
  return getChallengeWindowLastDayLocalDate(challenge).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
