import { 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  // deleteDoc,
  // collection,
  // getDocs,
  // query,
  // where,
  // orderBy,
  // limit,
  // Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Challenge } from '../types';

// User Operations
export const createUserDocument = async (uid: string, userData: User) => {
  try {
    await setDoc(doc(db, 'users', uid), {
      ...userData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating user document:', error);
    throw error;
  }
};

/**
 * Minimal user row for accounts that authenticated before a Firestore doc existed.
 * merge: never pass challenges/dailyNotes here — would overwrite real data on races.
 */
export const ensureUserDocumentShell = async (uid: string, displayName: string) => {
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        name: displayName,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error('Error ensuring user shell document:', error);
    throw error;
  }
};

export const getUserData = async (userId: string): Promise<User | null> => {
  try {
    const snapshot = await getDoc(doc(db, 'users', userId));
    return snapshot.exists() ? snapshot.data() as User : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

export const updateUserData = async (uid: string, data: Partial<User>) => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
};

export const upsertUserTimezone = async (uid: string, timezone: string) => {
  try {
    await setDoc(
      doc(db, 'users', uid),
      ({
        timezone,
        timezoneUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }) satisfies Record<string, unknown>,
      { merge: true }
    );
  } catch (error) {
    console.error('Error updating user timezone:', error);
    throw error;
  }
};

// Challenge Operations
export const updateChallenges = async (uid: string, challenges: Challenge[]) => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      challenges,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating challenges:', error);
    throw error;
  }
};

// Daily Notes Operations
export const updateDailyNotes = async (uid: string, dailyNotes: Record<string, string>) => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      dailyNotes,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating daily notes:', error);
    throw error;
  }
};

// Reset user data
export const resetUserData = async (uid: string, name: string) => {
  try {
    await setDoc(doc(db, 'users', uid), {
      name,
      challenges: [],
      dailyNotes: {},
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting user data:', error);
    throw error;
  }
};

// Update challenge duration
export const updateChallengeDuration = async (uid: string, challengeId: string, newDuration: number) => {
  try {
    const userData = await getUserData(uid);
    if (!userData) {
      throw new Error('User not found');
    }
    
    const updatedChallenges = userData.challenges.map(challenge => 
      challenge.id === challengeId 
        ? { ...challenge, duration: newDuration } 
        : challenge
    );
    
    await updateChallenges(uid, updatedChallenges);
  } catch (error) {
    console.error('Error updating challenge duration:', error);
    throw error;
  }
};

// Delete a user challenge
export const deleteUserChallenge = async (uid: string, challengeId: string) => {
  try {
    const userData = await getUserData(uid);
    if (!userData) {
      throw new Error('User not found');
    }
    
    const updatedChallenges = userData.challenges.filter(challenge => challenge.id !== challengeId);
    await updateChallenges(uid, updatedChallenges);
  } catch (error) {
    console.error('Error deleting challenge:', error);
    throw error;
  }
};
