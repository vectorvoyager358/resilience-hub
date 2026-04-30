export interface Challenge {
  id: string;
  name: string;
  duration: number;
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
}

export interface ChatAssistantProps {
  userData: User;
} 

