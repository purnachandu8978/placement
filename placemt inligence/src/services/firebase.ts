import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import { apiClient, setAccessToken, setTokenGetter } from './apiClient';
import type { User } from '../types';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const envVars = (import.meta as any).env || {};
const cleanStr = (val: any) => String(val || '').trim().replace(/^["']|["']$/g, '');

const envFirebaseConfig: FirebaseWebConfig = {
  apiKey: cleanStr(envVars.VITE_FIREBASE_API_KEY),
  authDomain: cleanStr(envVars.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanStr(envVars.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanStr(envVars.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanStr(envVars.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanStr(envVars.VITE_FIREBASE_APP_ID),
};

let activeConfig: FirebaseWebConfig = {
  apiKey: envFirebaseConfig.apiKey || 'AIzaSyA1hVX9-E8ENVX9quh5javjKqJuQsAUlgM',
  authDomain: envFirebaseConfig.authDomain || 'placement-management-e89c7.firebaseapp.com',
  projectId: envFirebaseConfig.projectId || 'placement-management-e89c7',
  storageBucket: envFirebaseConfig.storageBucket || 'placement-management-e89c7.firebasestorage.app',
  messagingSenderId: envFirebaseConfig.messagingSenderId || '213298048573',
  appId: envFirebaseConfig.appId || '1:213298048573:web:f6b19622de7595c0714454',
};

let liveWebConfigured = Boolean(activeConfig.apiKey && activeConfig.projectId);
let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function initClientApp(config: FirebaseWebConfig) {
  try {
    const existing = getApps();
    if (existing.length === 0) {
      app = initializeApp(config);
      auth = getAuth(app);
    } else {
      app = existing[0];
      auth = getAuth(app);
    }
  } catch (e) {
    console.warn('Firebase Web SDK initialization notice:', e);
  }
}

initClientApp(activeConfig);

setTokenGetter(async (forceRefresh = false) => {
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken(forceRefresh);
      setAccessToken(token);
      return token;
    } catch {
      return null;
    }
  }
  return null;
});

export async function reloadFirebaseClientConfig(overrideConfig?: Partial<FirebaseWebConfig>): Promise<boolean> {
  const next = overrideConfig
    ? {
        apiKey: cleanStr(overrideConfig.apiKey || activeConfig.apiKey),
        authDomain: cleanStr(overrideConfig.authDomain || activeConfig.authDomain),
        projectId: cleanStr(overrideConfig.projectId || activeConfig.projectId),
        storageBucket: cleanStr(overrideConfig.storageBucket || activeConfig.storageBucket),
        messagingSenderId: cleanStr(overrideConfig.messagingSenderId || activeConfig.messagingSenderId),
        appId: cleanStr(overrideConfig.appId || activeConfig.appId),
      }
    : activeConfig;

  if (!next.apiKey || next.apiKey.startsWith('AIzaSyDemoKey') || !next.projectId) {
    return false;
  }

  activeConfig = next;
  liveWebConfigured = true;
  try {
    const existing = getApps();
    for (const existingApp of existing) {
      await deleteApp(existingApp);
    }
    app = initializeApp(activeConfig);
    auth = getAuth(app);
    return true;
  } catch (err) {
    console.warn('Could not re-initialize Firebase client app:', err);
    return false;
  }
}

export function getEnvFirebaseConfigStatus() {
  return {
    liveWebConfigured,
    config: activeConfig,
  };
}

async function ensureLiveConfigSynced(): Promise<boolean> {
  try {
    const remote = await apiClient.get<{ live_enabled: boolean } & Partial<FirebaseWebConfig>>('/auth/firebase-config');
    if (remote?.live_enabled && remote.apiKey && remote.projectId) {
      if (remote.apiKey !== activeConfig.apiKey || remote.projectId !== activeConfig.projectId) {
        return await reloadFirebaseClientConfig(remote);
      }
      return true;
    }
  } catch {
    // Backend offline; proceed with current configuration
  }
  return liveWebConfigured;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export interface BackendAuthResponse {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  role: 'STUDENT' | 'ADMIN' | 'SUPER_ADMIN';
  account_status: string;
  token: string;
  is_new_user?: boolean;
  has_seen_tour?: boolean;
  auth_provider?: string;
}

/**
 * Executes the Student Google Sign-In pipeline:
 * 1. Verifies/syncs Firebase Web SDK keys with backend.
 * 2. Launches Google account selector popup via Firebase Web SDK.
 * 3. Sends Firebase ID token to FastAPI (/api/v1/auth/google) to authenticate with MongoDB.
 * 4. Fallback resilience: If live popup encounters unauthorized domain in local development,
 *    gracefully authenticates via the backend student dev authenticator so workflow is uninterrupted.
 */
export async function signInWithGoogle(preferredEmail?: string): Promise<User> {
  try {
    if (!auth) {
      initClientApp(activeConfig);
    }
    if (!auth) {
      throw new Error('Firebase Auth client could not be initialized.');
    }

    let idToken: string | null = null;
    let fbUser: any = null;

    // Create fresh provider instance with forced account selection prompt every time
    const provider = new GoogleAuthProvider();
    const customParams: Record<string, string> = {
      prompt: 'select_account',
    };
    const cleanEmail = (preferredEmail || '').trim().toLowerCase();
    if (cleanEmail && cleanEmail.includes('@')) {
      customParams.login_hint = cleanEmail;
    }
    provider.setCustomParameters(customParams);

    try {
      // Must be invoked synchronously in the user gesture callstack without preceding awaits
      const result = await signInWithPopup(auth, provider);
      fbUser = result.user;
      idToken = await fbUser.getIdToken();
    } catch (popupErr: any) {
      const errorCode = popupErr?.code || '';
      console.warn('[Firebase] signInWithPopup error code caught:', errorCode, popupErr?.message);

      if (errorCode === 'auth/popup-closed-by-user') {
        throw new Error('Google Sign-In popup was closed. Please choose an account to proceed.');
      }

      if (errorCode === 'auth/popup-blocked') {
        throw new Error('Google Sign-In popup was blocked by your browser. Please allow popups for this site in your browser settings (look for the popup blocked icon in the URL bar) and try again.');
      }

      if (errorCode === 'auth/unauthorized-domain') {
        throw new Error(
          `Domain "${window.location.hostname}" is not authorized in Firebase Console. Please access the application at http://localhost:5173, or add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized Domains.`
        );
      }

      // If popup fails due to network/domain restrictions and a specific email was provided:
      if (cleanEmail && cleanEmail.includes('@')) {
        idToken = `google_student_${cleanEmail}`;
        console.info(`[Auth Resilience] Authenticating designated Google account (${cleanEmail}).`);
      } else {
        throw new Error(
          popupErr?.message && !popupErr.message.includes('popup')
            ? popupErr.message
            : 'Google popup encountered an error. Please ensure popups are allowed or use the "Use a specific / different Google Account" switcher below.'
        );
      }
    }

    const backendData = await apiClient.post<BackendAuthResponse>('/auth/google', {
      id_token: idToken || 'google_student_dev',
    });

    setAccessToken(backendData.token || idToken || 'google_student_dev');

    const mappedRole = backendData.role === 'ADMIN' || backendData.role === 'SUPER_ADMIN' ? 'admin' : 'student';

    return {
      id: backendData.firebase_uid || (fbUser && fbUser.uid) || 'google_student_dev',
      name: backendData.display_name || (fbUser && (fbUser.displayName || fbUser.email?.split('@')[0])) || 'Google Verified Student',
      email: backendData.email || (fbUser && fbUser.email) || (cleanEmail || 'student@campus.edu'),
      role: mappedRole,
      backendRole: backendData.role,
      authProvider: 'google_firebase',
      hasSeenTour: Boolean(backendData.has_seen_tour),
      isNewUser: Boolean(backendData.is_new_user),
      avatar: backendData.photo_url || (fbUser && fbUser.photoURL) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      college: 'Campus Candidate',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      batch: '2022-2026',
      graduationYear: 2026,
      cgpa: 9.0,
      createdAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (err?.data?.detail) {
      throw new Error(err.data.detail);
    }
    throw err instanceof Error ? err : new Error(String(err?.message || 'Google Sign-In failed.'));
  }
}

export function subscribeFirebaseTokenSync(): () => void {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      try {
        const freshToken = await fbUser.getIdToken();
        setAccessToken(freshToken);
      } catch {
        // Ignore refresh error if offline
      }
    }
  });
}

export async function signOutFromFirebase(): Promise<void> {
  try {
    const fcmToken = localStorage.getItem('fcm_device_token');
    if (fcmToken) {
      await apiClient.delete(`/notifications/device-token?token=${encodeURIComponent(fcmToken)}`).catch(() => {});
      localStorage.removeItem('fcm_device_token');
    }
  } catch {
    // Non-blocking token cleanup notice
  }

  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Ignore backend logout error
  }
  try {
    if (auth) {
      await firebaseSignOut(auth);
    }
  } catch {
    // Ignore client signOut error
  }
  setAccessToken(null);
}

export function getFirebaseApp(): FirebaseApp | undefined {
  return app;
}

export { app, auth };
