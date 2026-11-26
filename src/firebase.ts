import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import type { FeedbackEntry } from './services/feedbackSheets';
import { SavedDocRecord, BrandKitPreset, PhotoBatchPresetRecord } from './types';
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

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

const buildGoogleProvider = (forceConsent = false) => {
  const p = new GoogleAuthProvider();
  // Minimal non-sensitive scope: Google Drive file management only (fast OAuth verification)
  p.addScope('https://www.googleapis.com/auth/drive.file');
  p.setCustomParameters({
    prompt: forceConsent ? 'select_account consent' : 'select_account',
  });
  return p;
};

export const isEmbeddedIframe = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export class AuthSignInError extends Error {
  code: string;
  closedImmediately: boolean;
  inIframe: boolean;

  constructor(
    message: string,
    opts?: { code?: string; closedImmediately?: boolean; inIframe?: boolean }
  ) {
    super(message);
    this.name = 'AuthSignInError';
    this.code = opts?.code || 'unknown';
    this.closedImmediately = Boolean(opts?.closedImmediately);
    this.inIframe = Boolean(opts?.inIframe);
  }
}

let isSigningIn = false;
let inFlightSignIn: Promise<{ user: User; accessToken: string } | null> | null = null;

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
      } else if (!isSigningIn) {
        // Token expired after 1 hour; clear stale token so UI prompts clean reconnect
        if (expiry.isExpired) {
          setCachedToken(null);
        }
        if (onAuthFailure) onAuthFailure();
      }
    } else if (!isSigningIn) {
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
  if (inFlightSignIn) {
    return inFlightSignIn;
  }

  const startedAt = Date.now();
  isSigningIn = true;

  const task = (async (): Promise<{ user: User; accessToken: string } | null> => {
    try {
      const activeProvider = buildGoogleProvider(Boolean(options?.forceConsent));
      const result = await signInWithPopup(auth, activeProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new AuthSignInError(
          'Google sign-in completed, but Google Drive access was not granted. Please try again and allow Drive file access.',
          { code: 'missing-access-token', inIframe: isEmbeddedIframe() }
        );
      }

      setCachedToken(credential.accessToken);
      return { user: result.user, accessToken: credential.accessToken };
    } catch (error: any) {
      if (error instanceof AuthSignInError) {
        throw error;
      }

      console.error('Sign-in error:', error);
      const code = String(error?.code || '');
      const elapsedMs = Date.now() - startedAt;
      const inIframe = isEmbeddedIframe();
      const closedImmediately = elapsedMs < 1500;
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

      if (code === 'auth/unauthorized-domain' || String(error?.message || '').includes('auth/unauthorized-domain')) {
        throw new AuthSignInError(
          `Domain "${host}" is not authorized in Firebase Auth yet. Add "${host}" under Firebase Console -> Authentication -> Settings -> Authorized domains.`,
          { code: 'auth/unauthorized-domain', inIframe }
        );
      }
      if (code === 'auth/popup-blocked') {
        throw new AuthSignInError(
          inIframe
            ? 'Google Sign-In popup was blocked inside the preview frame. Allow popups for this site or open PaperLink in a full browser tab.'
            : 'Google Sign-In popup was blocked by your browser. Allow popups for this site and click Sign in with Google again.',
          { code: 'auth/popup-blocked', closedImmediately: true, inIframe }
        );
      }
      if (code === 'auth/cancelled-popup-request') {
        throw new AuthSignInError(
          'A previous sign-in window was interrupted before finishing. Click Sign in with Google once and keep the popup open.',
          { code: 'auth/cancelled-popup-request', closedImmediately, inIframe }
        );
      }
      if (code === 'auth/popup-closed-by-user') {
        if (closedImmediately && inIframe) {
          throw new AuthSignInError(
            'Your browser closed the sign-in popup immediately inside this embedded preview (often caused by third-party cookie/storage restrictions or popup blockers). Try again or open PaperLink in a full tab to sign in.',
            { code: 'auth/popup-closed-by-user', closedImmediately: true, inIframe: true }
          );
        }
        throw new AuthSignInError(
          inIframe
            ? 'Sign-in popup was closed before completing. Keep the popup open until Drive permission finishes, or open PaperLink in a full tab if your browser blocks embedded popups.'
            : 'Sign-in popup was closed before completing. Keep the popup window open until account selection and Drive permission finish.',
          { code: 'auth/popup-closed-by-user', closedImmediately, inIframe }
        );
      }
      if (code === 'auth/network-request-failed') {
        throw new AuthSignInError(
          'Network error while connecting to Google Sign-In. Check your internet connection and try again.',
          { code: 'auth/network-request-failed', inIframe }
        );
      }
      throw error;
    } finally {
      isSigningIn = false;
      inFlightSignIn = null;
    }
  })();

  inFlightSignIn = task;
  return task;
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

// ==========================================
// Photo Batch Studio Presets Persistence
// ==========================================
const LOCAL_STORAGE_PHOTO_PRESETS_KEY = 'paperlink_photo_batch_presets';

function stripHeavyLogosForCloud(preset: PhotoBatchPresetRecord): PhotoBatchPresetRecord {
  const safeMarks = (preset.setup.marks || []).map((m) =>
    m.imgData && m.imgData.length > 180000
      ? { ...m, imgData: null, imgName: m.imgName ? `${m.imgName} (local logo)` : 'Logo' }
      : m
  );
  return {
    ...preset,
    setup: {
      ...preset.setup,
      marks: safeMarks,
    },
  };
}

export const savePhotoBatchPreset = async (preset: PhotoBatchPresetRecord): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PHOTO_PRESETS_KEY);
    const existing: PhotoBatchPresetRecord[] = raw ? JSON.parse(raw) : [];
    const updated = [preset, ...existing.filter((p) => p.id !== preset.id)];
    localStorage.setItem(LOCAL_STORAGE_PHOTO_PRESETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('PhotoBatchPreset local save warning:', err);
  }

  if (auth.currentUser && preset.userEmail) {
    try {
      const cloudSafe = stripHeavyLogosForCloud(preset);
      await setDoc(doc(db, 'photoBatchPresets', preset.id), sanitizeForFirestore(cloudSafe), {
        merge: true,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `photoBatchPresets/${preset.id}`);
    }
  }
};

export const getPhotoBatchPresets = async (
  userEmail?: string
): Promise<PhotoBatchPresetRecord[]> => {
  let cloudPresets: PhotoBatchPresetRecord[] = [];
  if (auth.currentUser && userEmail) {
    try {
      const col = collection(db, 'photoBatchPresets');
      const q = query(col, where('userEmail', '==', userEmail));
      const snap = await getDocs(q);
      cloudPresets = snap.docs.map((d) => d.data() as PhotoBatchPresetRecord);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'photoBatchPresets');
    }
  }

  let localPresets: PhotoBatchPresetRecord[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PHOTO_PRESETS_KEY);
    if (raw) {
      localPresets = JSON.parse(raw);
      if (userEmail) {
        localPresets = localPresets.filter((p) => !p.userEmail || p.userEmail === userEmail);
      }
    }
  } catch (err) {
    console.warn('PhotoBatchPreset local read error:', err);
  }

  const map = new Map<string, PhotoBatchPresetRecord>();
  [...cloudPresets, ...localPresets].forEach((p) => map.set(p.id, p));
  return Array.from(map.values()).sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  );
};

export const deletePhotoBatchPreset = async (presetId: string): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PHOTO_PRESETS_KEY);
    if (raw) {
      const existing: PhotoBatchPresetRecord[] = JSON.parse(raw);
      localStorage.setItem(
        LOCAL_STORAGE_PHOTO_PRESETS_KEY,
        JSON.stringify(existing.filter((p) => p.id !== presetId))
      );
    }
  } catch (err) {
    console.warn('PhotoBatchPreset local delete error:', err);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'photoBatchPresets', presetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `photoBatchPresets/${presetId}`);
    }
  }
};

// ==========================================
// Public Live Reviews & Solutions (Shared Global Feed)
// ==========================================
export const FEEDBACK_ADMIN_EMAIL = 'atifubedsoomro@gmail.com';

function sanitizeReviewId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return cleaned || `FB_${Date.now()}`;
}

function buildValidatedPublicReviewPayload(entry: FeedbackEntry, isAdminWrite = false) {
  const safeId = sanitizeReviewId(entry.feedbackId);
  const rawDetails = String(entry.details || '').trim();
  const details = (rawDetails.length >= 3 ? rawDetails : `${rawDetails} review`.trim()).slice(0, 650);
  const createdAt =
    typeof entry.createdAt === 'number' && entry.createdAt > 0 ? entry.createdAt : Date.now();

  return {
    feedbackId: safeId,
    date: (String(entry.date || '').trim() || new Date(createdAt).toISOString().slice(0, 10)).slice(
      0,
      24
    ),
    userName: (String(entry.userName || '').trim() || 'Anonymous').slice(0, 80),
    toolCategory: (String(entry.toolCategory || '').trim() || 'General Experience').slice(0, 64),
    specificTool: String(entry.specificTool || '').trim().slice(0, 100),
    feedbackType: (String(entry.feedbackType || '').trim() || 'Feature Request').slice(0, 48),
    rating: Math.min(5, Math.max(1, Math.round(Number(entry.rating) || 5))),
    details,
    priority: (String(entry.priority || '').trim() || 'Medium').slice(0, 24),
    status: isAdminWrite
      ? ((String(entry.status || '').trim() || 'New') === 'Saved Locally'
          ? 'New'
          : String(entry.status || 'New').trim().slice(0, 32))
      : 'New',
    resolutionNotes: isAdminWrite
      ? String(entry.resolutionNotes || '').trim().slice(0, 800)
      : '',
    syncedToGoogleSheet: Boolean(entry.syncedToGoogleSheet),
    createdAt,
    updatedAt: Date.now(),
  };
}

export const isCurrentUserFeedbackAdmin = (): boolean =>
  Boolean(
    auth.currentUser &&
      auth.currentUser.emailVerified &&
      auth.currentUser.email === FEEDBACK_ADMIN_EMAIL
  );

export const submitPublicReviewToFirestore = async (entry: FeedbackEntry): Promise<boolean> => {
  const isAdmin = isCurrentUserFeedbackAdmin();
  const payload = buildValidatedPublicReviewPayload(entry, isAdmin);
  try {
    await setDoc(doc(db, 'publicReviews', payload.feedbackId), sanitizeForFirestore(payload));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `publicReviews/${payload.feedbackId}`);
    return false;
  }
};

export const updatePublicReviewSolutionInFirestore = async (
  reviewOrId: FeedbackEntry | string,
  updates: {
    status: string;
    resolutionNotes: string;
    syncedToGoogleSheet?: boolean;
  }
): Promise<void> => {
  const feedbackId = typeof reviewOrId === 'string' ? reviewOrId : reviewOrId.feedbackId;
  const safeId = sanitizeReviewId(feedbackId);
  const path = `publicReviews/${safeId}`;

  if (!auth.currentUser) {
    throw new Error('Firebase session is not active. Click Sign out and Sign in with Google again.');
  }
  const signedEmail = (auth.currentUser.email || '').trim().toLowerCase();
  if (signedEmail !== FEEDBACK_ADMIN_EMAIL.toLowerCase()) {
    throw new Error(
      `Signed in as ${auth.currentUser.email || 'unknown'}. Sign in with ${FEEDBACK_ADMIN_EMAIL} to post solutions.`
    );
  }

  const cleanStatus = ((updates.status || 'Resolved').trim() || 'Resolved').slice(0, 32);
  const cleanNotes = String(updates.resolutionNotes || '').trim().slice(0, 800);
  const reviewRef = doc(db, 'publicReviews', safeId);

  try {
    const existingSnap = await getDoc(reviewRef);
    if (!existingSnap.exists()) {
      if (typeof reviewOrId === 'string') {
        throw new Error('Review document does not exist in Firestore yet.');
      }
      const payload = buildValidatedPublicReviewPayload(
        {
          ...reviewOrId,
          feedbackId: safeId,
          status: cleanStatus as FeedbackEntry['status'],
          resolutionNotes: cleanNotes,
          syncedToGoogleSheet:
            typeof updates.syncedToGoogleSheet === 'boolean'
              ? updates.syncedToGoogleSheet
              : reviewOrId.syncedToGoogleSheet,
        },
        true
      );
      await setDoc(reviewRef, sanitizeForFirestore(payload));
      return;
    }

    await updateDoc(reviewRef, {
      status: cleanStatus,
      resolutionNotes: cleanNotes,
      ...(typeof updates.syncedToGoogleSheet === 'boolean'
        ? { syncedToGoogleSheet: updates.syncedToGoogleSheet }
        : {}),
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    const code = err?.code ? ` (${err.code})` : '';
    const msg = err?.message || 'Could not save solution to Firestore.';
    throw new Error(`${msg}${code}`);
  }
};

export const backfillMissingReviewsToFirestore = async (entries: FeedbackEntry[]): Promise<void> => {
  if (!isCurrentUserFeedbackAdmin() || entries.length === 0) return;

  for (const rawEntry of entries.slice(0, 50)) {
    const payload = buildValidatedPublicReviewPayload(rawEntry, true);
    const reviewRef = doc(db, 'publicReviews', payload.feedbackId);
    try {
      const existingSnap = await getDoc(reviewRef);
      if (!existingSnap.exists()) {
        await setDoc(reviewRef, sanitizeForFirestore(payload));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `publicReviews/${payload.feedbackId}`);
    }
  }
};

export const syncSheetReviewsToFirestore = async (entries: FeedbackEntry[]): Promise<void> => {
  if (!isCurrentUserFeedbackAdmin() || entries.length === 0) return;

  for (const rawEntry of entries.slice(0, 50)) {
    const payload = buildValidatedPublicReviewPayload(
      { ...rawEntry, syncedToGoogleSheet: true },
      true
    );
    const reviewRef = doc(db, 'publicReviews', payload.feedbackId);
    try {
      const existingSnap = await getDoc(reviewRef);
      if (!existingSnap.exists()) {
        await setDoc(reviewRef, sanitizeForFirestore(payload));
      } else {
        const cur = existingSnap.data() as FeedbackEntry;
        const nextStatus = payload.status;
        const nextNotes = payload.resolutionNotes;
        if (
          cur.status !== nextStatus ||
          (cur.resolutionNotes || '') !== nextNotes ||
          !cur.syncedToGoogleSheet
        ) {
          await updateDoc(reviewRef, {
            status: nextStatus,
            resolutionNotes: nextNotes,
            syncedToGoogleSheet: true,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `publicReviews/${payload.feedbackId}`);
    }
  }
};

export const getPublicReviewsFromFirestore = async (): Promise<FeedbackEntry[]> => {
  try {
    const q = query(
      collection(db, 'publicReviews'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as FeedbackEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'publicReviews');
    return [];
  }
};

export const subscribeToPublicReviews = (
  onEntries: (entries: FeedbackEntry[]) => void,
  onError?: (err: unknown) => void
): (() => void) => {
  const q = query(
    collection(db, 'publicReviews'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as FeedbackEntry);
      onEntries(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'publicReviews');
      onError?.(err);
    }
  );
};

export const saveSharedFeedbackSheetUrl = async (sheetUrl: string): Promise<void> => {
  if (!isCurrentUserFeedbackAdmin()) return;
  try {
    await setDoc(doc(db, 'appConfig', 'feedback_sync'), {
      sheetUrl: String(sheetUrl || '').trim().slice(0, 400),
      updatedAt: Date.now(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'appConfig/feedback_sync');
  }
};

export const getSharedFeedbackSheetUrl = async (): Promise<string> => {
  try {
    const snap = await getDoc(doc(db, 'appConfig', 'feedback_sync'));
    if (snap.exists()) {
      return String(snap.data()?.sheetUrl || '');
    }
    return '';
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'appConfig/feedback_sync');
    return '';
  }
};

