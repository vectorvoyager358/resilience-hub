import type { Challenge, Note, User } from '../types';

export type ChallengeCadence = 'daily' | 'weekly';

export function getChallengeCadence(challenge: Challenge): ChallengeCadence {
  return challenge.cadence === 'weekly' ? 'weekly' : 'daily';
}

export function formatCadenceLabel(cadence: ChallengeCadence): string {
  return cadence === 'weekly' ? 'Weekly' : 'Daily';
}

/** Calendar day 1 aligns with challenge startDate's local calendar date (midnight-normalized). */
export function getChallengeCalendarStartLocal(challenge: Challenge): Date {
  const startDate = new Date(challenge.startDate);
  return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
}

/**
 * 1-based calendar day index for `at` relative to challenge start (local midnight rules).
 * Day 1 is the challenge start date. Values can exceed the planned window or be below 1 before start.
 */
export function getChallengeCalendarDayIndex(challenge: Challenge, at: Date = new Date()): number {
  const ref = new Date(at);
  const todayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const challengeStart = getChallengeCalendarStartLocal(challenge);
  const daysSinceStart = Math.floor(
    (todayStart.getTime() - challengeStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceStart + 1;
}

/** Total calendar days spanned by the challenge window (daily: duration; weekly: duration × 7). */
export function getTotalCalendarDaysInWindow(challenge: Challenge): number {
  const dur = Math.max(1, challenge.duration);
  return getChallengeCadence(challenge) === 'weekly' ? dur * 7 : dur;
}

/**
 * Note / progress slot index (1..duration).
 * Daily: same as calendar day index. Weekly: rolling week from start (days 1–7 → slot 1, etc.).
 */
export function getChallengeNoteSlotIndex(challenge: Challenge, at: Date = new Date()): number {
  const dayIdx = getChallengeCalendarDayIndex(challenge, at);
  if (getChallengeCadence(challenge) === 'daily') return dayIdx;
  if (dayIdx < 1) return dayIdx;
  return Math.floor((dayIdx - 1) / 7) + 1;
}

/** True when `at` falls on a calendar day inside the planned window (day 1 through last day). */
export function isWithinChallengeNoteWindow(challenge: Challenge, at: Date = new Date()): boolean {
  const d = getChallengeCalendarDayIndex(challenge, at);
  if (d < 1) return false;
  return d <= getTotalCalendarDaysInWindow(challenge);
}

/**
 * Slot index capped for UI (1..duration) while inside or past the window;
 * uses the last in-window day when viewing after the window ended.
 */
export function getCurrentSlotDisplayIndex(challenge: Challenge, at: Date = new Date()): number {
  const dur = Math.max(1, challenge.duration);
  const total = getTotalCalendarDaysInWindow(challenge);
  const dayIdx = getChallengeCalendarDayIndex(challenge, at);
  const cappedDay = Math.min(Math.max(dayIdx, 1), total);
  if (getChallengeCadence(challenge) === 'weekly') {
    return Math.min(dur, Math.floor((cappedDay - 1) / 7) + 1);
  }
  return Math.min(dur, cappedDay);
}

/**
 * Last local calendar date inside the planned window (inclusive).
 * First archived calendar day is the day after this.
 */
export function getChallengeWindowLastDayLocalDate(challenge: Challenge): Date {
  const totalDays = getTotalCalendarDaysInWindow(challenge);
  const startLocal = getChallengeCalendarStartLocal(challenge);
  const last = new Date(startLocal);
  last.setDate(startLocal.getDate() + totalDays - 1);
  return last;
}

export function formatChallengeWindowEndCalendarDisplay(challenge: Challenge): string {
  return getChallengeWindowLastDayLocalDate(challenge).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Calendar window ended: past the last planned day, regardless of how many logs exist. */
export function isChallengePastCalendarDuration(challenge: Challenge, at: Date = new Date()): boolean {
  return getChallengeCalendarDayIndex(challenge, at) > getTotalCalendarDaysInWindow(challenge);
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

/** Count slots 1..duration that have a non-empty note (canonical progress). */
export function countFilledDaysInWindowFromNotes(notes: NotesBag, duration: number): number {
  return getFilledDayIndicesDescendingFromNotes(notes, duration).length;
}

/**
 * Timeline position for streak gaps: daily uses calendar day index; weekly uses 1-based week index
 * (same as note slot), unbounded so missing weeks increase the gap like missing days do for daily.
 */
function getStreakTimelinePosition(challenge: Challenge, at: Date = new Date()): number {
  const dayIdx = getChallengeCalendarDayIndex(challenge, at);
  if (getChallengeCadence(challenge) === 'weekly') {
    if (dayIdx < 1) return dayIdx;
    return Math.floor((dayIdx - 1) / 7) + 1;
  }
  return dayIdx;
}

/**
 * Consecutive logged-slot streak. Daily: consecutive calendar slots. Weekly: consecutive week slots.
 * Only slots with non-empty trimmed note text count (same as `completedDays` / UI grid).
 */
export function getLoggedStreakForChallenge(challenge: Challenge, at: Date = new Date()): number {
  const notes = migrateNotes(challenge.notes as { [key: string]: unknown });
  const dur = Math.max(1, challenge.duration);

  const completedSlotNumbers = getFilledDayIndicesDescendingFromNotes(notes, dur);
  if (completedSlotNumbers.length === 0) return 0;

  const timelinePos = getStreakTimelinePosition(challenge, at);
  const mostRecentCompleted = completedSlotNumbers[0];

  if (timelinePos - mostRecentCompleted > 1) return 0;

  let streak = 1;
  let expectedPrevious = mostRecentCompleted - 1;
  for (let i = 1; i < completedSlotNumbers.length; i++) {
    const completed = completedSlotNumbers[i];
    if (completed === expectedPrevious) {
      streak++;
      expectedPrevious--;
    } else {
      break;
    }
  }
  return streak;
}

export function syncChallengeCompletedDays(challenge: Challenge): Challenge {
  const notes = migrateNotes(challenge.notes as { [key: string]: unknown });
  const completedDays = countFilledDaysInWindowFromNotes(notes, challenge.duration);
  const cadence: ChallengeCadence = challenge.cadence === 'weekly' ? 'weekly' : 'daily';
  return { ...challenge, notes, completedDays, cadence };
}

export function normalizeUserChallenges(userData: User): User {
  return {
    ...userData,
    challenges: (userData.challenges || []).map((c) => syncChallengeCompletedDays(c)),
  };
}

/** Human label for duration field (challenge setup). */
export function getChallengeDurationFieldLabel(cadence: ChallengeCadence): string {
  return cadence === 'weekly' ? 'Duration (weeks)' : 'Duration (days)';
}

/** Week block [start,end] inclusive for slot `slotIndex` (1-based), local calendar. */
export function getWeeklySlotLocalDateRange(
  challenge: Challenge,
  slotIndex: number
): { start: Date; end: Date } {
  const startLocal = getChallengeCalendarStartLocal(challenge);
  const s = Math.max(1, slotIndex);
  const blockStart = new Date(startLocal);
  blockStart.setDate(startLocal.getDate() + (s - 1) * 7);
  const blockEnd = new Date(blockStart);
  blockEnd.setDate(blockStart.getDate() + 6);
  return { start: blockStart, end: blockEnd };
}

/** True if the current note slot already has a non-empty note while still inside the challenge window. */
export function hasCompletedCurrentNoteSlot(challenge: Challenge, at: Date = new Date()): boolean {
  if (!isWithinChallengeNoteWindow(challenge, at)) return false;
  const slot = getChallengeNoteSlotIndex(challenge, at);
  const n = challenge.notes[String(slot)];
  const content = typeof n?.content === 'string' ? n.content : '';
  return content.trim().length > 0;
}
