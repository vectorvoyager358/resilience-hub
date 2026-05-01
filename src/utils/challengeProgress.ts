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
export function migrateNotes(notes: { [key: string]: unknown }): { [key: string]: Note } {
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

/**
 * Calendar slots 1..duration whose note counts as logged (non-empty trimmed text).
 * Matches completedDays semantics; sorted descending for streak scans.
 */
export function getFilledDayIndicesDescendingFromNotes(notes: NotesBag, duration: number): number[] {
  const indices: number[] = [];
  const dur = Math.max(1, duration);
  for (let d = 1; d <= dur; d++) {
    const raw = notes[String(d)];
    let content = '';
    if (typeof raw === 'string') content = raw;
    else if (raw && typeof raw.content === 'string') content = raw.content;
    if (content.trim().length > 0) indices.push(d);
  }
  indices.sort((a, b) => b - a);
  return indices;
}

/** Count calendar slots 1..duration that have a non-empty note (canonical progress). */
export function countFilledDaysInWindowFromNotes(notes: NotesBag, duration: number): number {
  return getFilledDayIndicesDescendingFromNotes(notes, duration).length;
}

/**
 * Consecutive logged-day streak relative to today’s calendar index in the challenge window.
 * Only days with non-empty trimmed note text count (same as `completedDays` / UI grid).
 */
export function getLoggedStreakForChallenge(challenge: Challenge): number {
  const notes = migrateNotes(challenge.notes as { [key: string]: unknown });
  const dur = Math.max(1, challenge.duration);

  const completedDayNumbers = getFilledDayIndicesDescendingFromNotes(notes, dur);
  if (completedDayNumbers.length === 0) return 0;

  const todayDayNumber = getChallengeCalendarDayIndex(challenge);
  const mostRecentCompletedDay = completedDayNumbers[0];

  if (todayDayNumber - mostRecentCompletedDay > 1) return 0;

  let streak = 1;
  let expectedPreviousDay = mostRecentCompletedDay - 1;
  for (let i = 1; i < completedDayNumbers.length; i++) {
    const completedDay = completedDayNumbers[i];
    if (completedDay === expectedPreviousDay) {
      streak++;
      expectedPreviousDay--;
    } else {
      break;
    }
  }
  return streak;
}

export function syncChallengeCompletedDays(challenge: Challenge): Challenge {
  const notes = migrateNotes(challenge.notes as { [key: string]: unknown });
  const completedDays = countFilledDaysInWindowFromNotes(notes, challenge.duration);
  return { ...challenge, notes, completedDays };
}

export function normalizeUserChallenges(userData: User): User {
  return {
    ...userData,
    challenges: (userData.challenges || []).map((c) => syncChallengeCompletedDays(c)),
  };
}
