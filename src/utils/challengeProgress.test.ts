import { describe, expect, it } from 'vitest';
import type { Challenge } from '../types';
import {
  getChallengeCalendarDayIndex,
  getChallengeNoteSlotIndex,
  getTotalCalendarDaysInWindow,
  getLoggedStreakForChallenge,
  isChallengePastCalendarDuration,
  getWeeklySlotLocalDateRange,
  syncChallengeCompletedDays,
} from './challengeProgress';

function atLocalDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

describe('challengeProgress cadence', () => {
  const start = atLocalDate(2026, 1, 5);

  const dailyChallenge: Challenge = {
    id: 'd1',
    name: 'Daily',
    duration: 10,
    cadence: 'daily',
    startDate: start.toISOString(),
    completedDays: 0,
    notes: {},
  };

  const weeklyChallenge: Challenge = {
    id: 'w1',
    name: 'Weekly',
    duration: 4,
    cadence: 'weekly',
    startDate: start.toISOString(),
    completedDays: 0,
    notes: {},
  };

  it('maps daily slot to calendar day index', () => {
    expect(getChallengeCalendarDayIndex(dailyChallenge, atLocalDate(2026, 1, 5))).toBe(1);
    expect(getChallengeNoteSlotIndex(dailyChallenge, atLocalDate(2026, 1, 5))).toBe(1);
    expect(getChallengeNoteSlotIndex(dailyChallenge, atLocalDate(2026, 1, 14))).toBe(10);
  });

  it('maps weekly note slot to rolling week from start', () => {
    expect(getTotalCalendarDaysInWindow(weeklyChallenge)).toBe(28);
    expect(getChallengeNoteSlotIndex(weeklyChallenge, atLocalDate(2026, 1, 5))).toBe(1);
    expect(getChallengeNoteSlotIndex(weeklyChallenge, atLocalDate(2026, 1, 11))).toBe(1);
    expect(getChallengeNoteSlotIndex(weeklyChallenge, atLocalDate(2026, 1, 12))).toBe(2);
    expect(getChallengeNoteSlotIndex(weeklyChallenge, atLocalDate(2026, 2, 1))).toBe(4);
  });

  it('ends weekly window after duration × 7 days', () => {
    expect(isChallengePastCalendarDuration(weeklyChallenge, atLocalDate(2026, 2, 1))).toBe(false);
    expect(isChallengePastCalendarDuration(weeklyChallenge, atLocalDate(2026, 2, 2))).toBe(true);
  });

  it('computes weekly streak on slot indices', () => {
    const c: Challenge = {
      ...weeklyChallenge,
      notes: {
        '1': { content: 'a', vectorId: '' },
        '2': { content: 'b', vectorId: '' },
      },
    };
    expect(getLoggedStreakForChallenge(c, atLocalDate(2026, 1, 20))).toBe(2);
  });

  it('returns week date range for a slot', () => {
    const { start: a, end: b } = getWeeklySlotLocalDateRange(weeklyChallenge, 2);
    expect(a.toDateString()).toBe(atLocalDate(2026, 1, 12).toDateString());
    expect(b.toDateString()).toBe(atLocalDate(2026, 1, 18).toDateString());
  });

  it('syncChallengeCompletedDays sets cadence daily when omitted', () => {
    const raw: Challenge = {
      id: 'x',
      name: 'Legacy',
      duration: 10,
      startDate: new Date().toISOString(),
      completedDays: 0,
      notes: {},
    };
    const synced = syncChallengeCompletedDays(raw);
    expect(synced.cadence).toBe('daily');
  });
});
