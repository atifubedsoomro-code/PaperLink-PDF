import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { SavedDocRecord, BrandKitPreset } from './types';
import appletConfig from '../firebase-applet-config.json';

// Configure Firebase via Vite env vars (Vercel) or firebase-applet-config.json (AI Studio)
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || '',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || '',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId || undefined,
};

const app = getApps().length > 0 ? getApp() : initializeApp(config);
const databaseId =
  import.meta.env.VITE_FIREBASE_DATABASE_ID ||
  (appletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  undefined;
export const auth = getAuth(app);
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

// Provider with minimal non-sensitive scope: Google Drive file management only (fast OAuth verification)
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account',
});

const SESSION_TOKEN_KEY = 'paperlink_session_access_token';
const SESSION_EXPIRES_AT_KEY = 'paperlink_session_expires_at';
// Fallback migration from legacy key
const LEGACY_SESSION_TOKEN_KEY = 'qrdrive_session_access_token';
// Google OAuth access tokens expire at ~60 minutes; treat 55 min as refresh boundary
const TOKEN_TTL_MS = 55 * 60 * 1000;

let cachedAccessToken: string | null =
  typeof window !== 'undefined'
    ? sessionStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(LEGACY_SESSION_TOKEN_KEY)
    : null;

export interface TokenExpiryInfo {
  hasToken: boolean;
  expiresAt: number | null;
  remainingMinutes: number;
  isExpiringSoon: boolean;
  isExpired: boolean;
}

export const getTokenExpiryInfo = (): TokenExpiryInfo => {
  if (typeof window === 'undefined') {
    return {
      hasToken: !!cachedAccessToken,
      expiresAt: null,
      remainingMinutes: 0,
      isExpiringSoon: false,
      isExpired: false,
    };
  }
  const token = cachedAccessToken || sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    return {
      hasToken: false,
      expiresAt: null,
      remainingMinutes: 0,
      isExpiringSoon: false,
      isExpired: false,
    };
  }

  const rawExp = sessionStorage.getItem(SESSION_EXPIRES_AT_KEY);
  const expiresAt = rawExp ? Number(rawExp) : null;
  if (!expiresAt || Number.isNaN(expiresAt)) {
    return {
      hasToken: true,
      expiresAt: null,
      remainingMinutes: 55,
      isExpiringSoon: false,
      isExpired: false,
    };
  }

  const diffMs = expiresAt - Date.now();
  const remainingMinutes = Math.max(0, Math.ceil(diffMs / 60000));
  return {
    hasToken: true,
    expiresAt,
    remainingMinutes,
    isExpiringSoon: diffMs > 0 && diffMs <= 10 * 60 * 1000,
    isExpired: diffMs <= 0,
  };
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const stored =
        typeof window !== 'undefined'
          ? sessionStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(LEGACY_SESSION_TOKEN_KEY)
          : null;
      const expiry = getTokenExpiryInfo();
      if (stored && !expiry.isExpired) {
        cachedAccessToken = stored;
        if (onAuthSuccess) onAuthSuccess(user, stored);
      } else if (cachedAccessToken && !expiry.isExpired) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Token expired after 1 hour; clear stale token so UI prompts clean reconnect
        if (expiry.isExpired) {
          setCachedToken(null);
        }
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_EXPIRES_AT_KEY);
        sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (options?: {
  forceConsent?: boolean;
}): Promise<{ user: User; accessToken: string } | null> => {
  try {
    provider.setCustomParameters({
      prompt: options?.forceConsent ? 'select_account consent' : 'select_account',
    });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google did not return an access token for Google Drive');
    }

    setCachedToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Sign-in error:', error);
    const code = String(error?.code || '');
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

    if (code === 'auth/unauthorized-domain' || String(error?.message || '').includes('auth/unauthorized-domain')) {
      throw new Error(
        `Domain "${host}" is not authorized in Firebase Auth yet. Open Firebase Console -> Authentication -> Settings -> Authorized domains and add "${host}".`
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Google Sign-In popup was blocked by your browser. Allow popups for this site and try again.');
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in popup was closed before completing. Click Sign in with Google to try again.');
    }
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken =
      sessionStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(LEGACY_SESSION_TOKEN_KEY);
  }
  const expiry = getTokenExpiryInfo();
  if (expiry.isExpired) {
    setCachedToken(null);
    return null;
  }
  return cachedAccessToken;
};

export const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + TOKEN_TTL_MS));
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_EXPIRES_AT_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
    }
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch {
    // ignore signout error
  }
  setCachedToken(null);
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Notice (using local persistence alongside cloud):', JSON.stringify(errInfo));
}

// ==========================================
// Document Records & Brand Kit Helpers
// ==========================================
function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean as T;
  }
  return value;
}

// ==========================================
// Document Records Persistence
// ==========================================
const LOCAL_STORAGE_DOCS_KEY = 'docqr_saved_documents';

export const saveDocumentRecord = async (record: SavedDocRecord): Promise<void> => {
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
    const existing: SavedDocRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [record, ...existing.filter((d) => d.id !== record.id)];
    localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('LocalStorage save warning:', err);
  }

  if (auth.currentUser && record.userEmail) {
    try {
      const docRef = doc(db, 'documents', record.id);
      await setDoc(docRef, sanitizeForFirestore(record), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `documents/${record.id}`);
    }
  }
};

export const getSavedDocuments = async (userEmail?: string): Promise<SavedDocRecord[]> => {
  let firestoreDocs: SavedDocRecord[] = [];
  if (auth.currentUser && userEmail) {
    try {
      const docsCol = collection(db, 'documents');
      const q = query(docsCol, where('userEmail', '==', userEmail));
      const snapshot = await getDocs(q);
      firestoreDocs = snapshot.docs.map((docSnap) => docSnap.data() as SavedDocRecord);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'documents');
    }
  }

  let localDocs: SavedDocRecord[] = [];
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
    if (existingRaw) {
      localDocs = JSON.parse(existingRaw);
      if (userEmail) {
        localDocs = localDocs.filter((d) => !d.userEmail || d.userEmail === userEmail);
      }
    }
  } catch (err) {
    console.warn('LocalStorage read error:', err);
  }

  const map = new Map<string, SavedDocRecord>();
  [...firestoreDocs, ...localDocs].forEach((docItem) => {
    map.set(docItem.id, docItem);
  });

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteDocumentRecord = async (docId: string): Promise<void> => {
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
    if (existingRaw) {
      const existing: SavedDocRecord[] = JSON.parse(existingRaw);
      localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify(existing.filter((d) => d.id !== docId)));
    }
  } catch (err) {
    console.warn('LocalStorage delete error:', err);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'documents', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${docId}`);
    }
  }
};

// ==========================================
// Brand Kit Presets Persistence
// ==========================================
const LOCAL_STORAGE_KITS_KEY = 'paperlink_brand_kits';

export const saveBrandKit = async (kit: BrandKitPreset): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KITS_KEY);
    const existing: BrandKitPreset[] = raw ? JSON.parse(raw) : [];
    const updated = [kit, ...existing.filter((k) => k.id !== kit.id)];
    localStorage.setItem(LOCAL_STORAGE_KITS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('BrandKit local save warning:', err);
  }

  if (auth.currentUser && kit.userEmail) {
    try {
      await setDoc(doc(db, 'brandKits', kit.id), sanitizeForFirestore(kit), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `brandKits/${kit.id}`);
    }
  }
};

export const getBrandKits = async (userEmail?: string): Promise<BrandKitPreset[]> => {
  let cloudKits: BrandKitPreset[] = [];
  if (auth.currentUser && userEmail) {
    try {
      const col = collection(db, 'brandKits');
      const q = query(col, where('userEmail', '==', userEmail));
      const snap = await getDocs(q);
      cloudKits = snap.docs.map((d) => d.data() as BrandKitPreset);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'brandKits');
    }
  }

  let localKits: BrandKitPreset[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KITS_KEY);
    if (raw) {
      localKits = JSON.parse(raw);
      if (userEmail) {
        localKits = localKits.filter((k) => !k.userEmail || k.userEmail === userEmail);
      }
    }
  } catch (err) {
    console.warn('BrandKit local read error:', err);
  }

  const map = new Map<string, BrandKitPreset>();
  [...cloudKits, ...localKits].forEach((k) => map.set(k.id, k));
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteBrandKit = async (kitId: string): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KITS_KEY);
    if (raw) {
      const existing: BrandKitPreset[] = JSON.parse(raw);
      localStorage.setItem(LOCAL_STORAGE_KITS_KEY, JSON.stringify(existing.filter((k) => k.id !== kitId)));
    }
  } catch (err) {
    console.warn('BrandKit local delete error:', err);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'brandKits', kitId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `brandKits/${kitId}`);
    }
  }
};
