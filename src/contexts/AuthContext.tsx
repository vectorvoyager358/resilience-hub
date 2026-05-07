import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  updatePassword as updateFirebasePassword,
  setPersistence,
  browserLocalPersistence,
  getRedirectResult,
  reload,
  User,
  Auth,
  UserCredential
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { upsertUserTimezone } from '../services/firestore';

// Store auth state in localStorage to help with persistence
const AUTH_STATE_KEY = 'resilience_hub_auth_state';

interface AuthContextType {
  auth: Auth;
  currentUser: User | null;
  loading: boolean;
  signup: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<User>;
  login: (email: string, password: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function signup(email: string, password: string) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await sendEmailVerification(userCredential.user);
        console.log('User created and verification email sent');
        await signOut(auth);
        try {
          localStorage.removeItem(AUTH_STATE_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error('Error in signup:', error);
      throw error;
    }
  }

  async function register(email: string, password: string, name: string) {
    try {
      // Set persistence first
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      if (user) {
        await updateProfile(user, { displayName: name });
        await sendEmailVerification(user);
        console.log('User registered with name:', name);
        return user;
      }
      throw new Error('User creation failed');
    } catch (error) {
      console.error('Error in register:', error);
      throw error;
    }
  }

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login with persistence for:', email);
      // Set persistence first
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (userCredential.user && !userCredential.user.emailVerified) {
        await sendEmailVerification(userCredential.user);
        console.log('Email not verified, sent verification email');
        throw new Error('email-not-verified');
      }
      
      console.log('Login successful, user:', userCredential.user.email);
      // Store authentication state in localStorage
      try {
        localStorage.setItem(AUTH_STATE_KEY, 'true');
      } catch (e) {
        console.warn('Could not store auth state in localStorage:', e);
      }
      
      return userCredential;
    } catch (error) {
      console.error('Error in login:', error);
      throw error;
    }
  };

  function logout() {
    // Clear the localStorage state
    try {
      localStorage.removeItem(AUTH_STATE_KEY);
    } catch (e) {
      console.warn('Could not remove auth state from localStorage:', e);
    }
    console.log('Logging out user');
    return signOut(auth);
  }

  function resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  async function updateDisplayName(displayName: string) {
    if (currentUser) {
      await updateProfile(currentUser, { displayName });
      setCurrentUser({ ...currentUser, displayName });
    }
  }

  function sendVerificationEmail() {
    const user = auth.currentUser;
    if (user) {
      return sendEmailVerification(user);
    }
    return Promise.reject(new Error('No user is currently signed in'));
  }

  async function refreshAuthUser() {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      setCurrentUser(auth.currentUser);
    }
  }

  const updatePassword = async (newPassword: string) => {
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }
    await updateFirebasePassword(currentUser, newPassword);
  };

  useEffect(() => {
    console.log('AuthContext: Setting up auth state listener');
    
    // Try to get any redirect result first
    getRedirectResult(auth).catch(error => 
      console.warn('Error with redirect result:', error)
    );
    
    // Check if we have a stored auth state
    try {
      const storedAuthState = localStorage.getItem(AUTH_STATE_KEY);
      console.log('Stored auth state:', storedAuthState);
    } catch (e) {
      console.warn('Could not read auth state from localStorage:', e);
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user ? `User: ${user.email}` : 'No user');
      
      setCurrentUser(user);
      setLoading(false);

      try {
        if (user) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          upsertUserTimezone(user.uid, tz).catch((e) => {
            console.warn('Failed to upsert user timezone:', e);
          });
        }
      } catch (e) {
        console.warn('Failed to read browser timezone:', e);
      }
      
      // If we have a user, store that in localStorage
      try {
        if (user) {
          localStorage.setItem(AUTH_STATE_KEY, 'true');
        } else {
          localStorage.removeItem(AUTH_STATE_KEY);
        }
      } catch (e) {
        console.warn('Could not update localStorage auth state:', e);
      }
    });

    return () => {
      console.log('Unsubscribing from auth state changes');
      unsubscribe();
    };
  }, []);

  const value = {
    auth,
    currentUser,
    loading,
    signup,
    register,
    login,
    logout,
    resetPassword,
    updateDisplayName,
    sendVerificationEmail,
    refreshAuthUser,
    updatePassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 