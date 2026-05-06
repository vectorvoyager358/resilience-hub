export interface Challenge {
  id: string;
  name: string;
  /** For `daily`, number of days; for `weekly`, number of week-long slots (rolling from `startDate`). */
  duration: number;
  /**
   * `daily` or `weekly`. Omitted in raw Firestore is treated as daily;
   * `normalizeUserChallenges` / `syncChallengeCompletedDays` set this explicitly.
   */
  cadence?: 'daily' | 'weekly';
  startDate: string;
  completedDays: number;
  notes: { [dayNumber: string]: Note };
}

export type Note = {
  content: string;
  /** Set when the note was synced to Pinecone; absent if RAG backend failed or is disabled. */
  vectorId?: string;
};

export interface User {
  uid: string;
  name: string;
  challenges: Challenge[];
  dailyNotes: Record<string, string>;
  timezone?: string;
  fcmTokens?: string[];
  lastReminderSentLocalDate?: string;
  pushRemindersEnabled?: boolean;
}

export interface ChatAssistantProps {
  userData: User;
} 

