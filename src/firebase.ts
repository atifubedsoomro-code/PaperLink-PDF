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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { FeedbackEntry } from './services/feedbackSheets';
import {
  SavedDocRecord,
  BrandKitPreset,
  CustomStampPreset,
  LetterheadPresetRecord,
  PdfStampPageScope,
  PdfStampPlacement,
  PdfStampShape,
  PhotoBatchPresetRecord,
  UserProfileData,
  UserBiodataPreset,
} from './types';
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
// Company Letterhead Presets Persistence
// ==========================================
const LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY = 'paperlink_letterhead_presets';

function sanitizePresetDocId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `lh_${Date.now()}`;
}

async function compressPresetAssetIfNeeded(
  dataUrl: string | undefined,
  maxBytes: number,
  maxDim: number
): Promise<string | undefined> {
  if (!dataUrl || typeof dataUrl !== 'string') return undefined;
  if (dataUrl.length <= maxBytes) return dataUrl;
  try {
    const pngAttempt = await compressDocumentImageDataUrl(dataUrl, {
      maxDim,
      preservePngTransparency: true,
      maxLength: maxBytes,
    });
    if (pngAttempt.length <= maxBytes) return pngAttempt;
    const jpgAttempt = await compressDocumentImageDataUrl(dataUrl, {
      maxDim: Math.min(maxDim, 520),
      quality: 0.72,
      preservePngTransparency: false,
      maxLength: maxBytes,
    });
    if (jpgAttempt.length <= maxBytes) return jpgAttempt;
  } catch (err) {
    console.warn('Letterhead preset image compression warning:', err);
  }
  return undefined;
}

async function sanitizeLetterheadPreset(
  preset: LetterheadPresetRecord
): Promise<LetterheadPresetRecord> {
  const now = Date.now();
  const safeLogo = await compressPresetAssetIfNeeded(preset.logoUrl, 240000, 640);
  const safeSignature = await compressPresetAssetIfNeeded(preset.signatureUrl, 150000, 520);

  const clean: LetterheadPresetRecord = {
    id: sanitizePresetDocId(preset.id),
    name: (String(preset.name || 'Company Letterhead').trim() || 'Company Letterhead').slice(0, 100),
    templateId: (String(preset.templateId || 'executive-navy').trim() || 'executive-navy').slice(0, 64),
    primaryColor: (String(preset.primaryColor || '#0f172a').trim() || '#0f172a').slice(0, 32),
    accentColor: (String(preset.accentColor || '#ca8a04').trim() || '#ca8a04').slice(0, 32),
    paperSize: preset.paperSize === 'letter' ? 'letter' : 'a4',
    companyName: String(preset.companyName || '').trim().slice(0, 200),
    showWatermark: Boolean(preset.showWatermark),
    showPageBorder: Boolean(preset.showPageBorder),
    includeSampleContent: Boolean(preset.includeSampleContent),
    userEmail: String(preset.userEmail || '').trim().slice(0, 254),
    createdAt: typeof preset.createdAt === 'number' && preset.createdAt > 0 ? preset.createdAt : now,
    updatedAt: typeof preset.updatedAt === 'number' && preset.updatedAt > 0 ? preset.updatedAt : now,
  };

  if (preset.tagline?.trim()) clean.tagline = preset.tagline.trim().slice(0, 200);
  if (preset.registrationNo?.trim()) clean.registrationNo = preset.registrationNo.trim().slice(0, 80);
  if (preset.phone?.trim()) clean.phone = preset.phone.trim().slice(0, 64);
  if (preset.email?.trim()) clean.email = preset.email.trim().slice(0, 254);
  if (preset.website?.trim()) clean.website = preset.website.trim().slice(0, 200);
  if (preset.address?.trim()) clean.address = preset.address.trim().slice(0, 400);
  if (preset.signerName?.trim()) clean.signerName = preset.signerName.trim().slice(0, 160);
  if (preset.signerTitle?.trim()) clean.signerTitle = preset.signerTitle.trim().slice(0, 160);
  if (safeLogo) clean.logoUrl = safeLogo;
  if (safeSignature) clean.signatureUrl = safeSignature;

  return clean;
}

export const saveLetterheadPreset = async (
  preset: LetterheadPresetRecord
): Promise<LetterheadPresetRecord> => {
  const clean = await sanitizeLetterheadPreset(preset);

  // Preserve original createdAt if updating an existing local preset
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY);
    const existing: LetterheadPresetRecord[] = raw ? JSON.parse(raw) : [];
    const prevMatch = existing.find((p) => p.id === clean.id);
    if (prevMatch && prevMatch.createdAt > 0) {
      clean.createdAt = prevMatch.createdAt;
    }
    const updated = [clean, ...existing.filter((p) => p.id !== clean.id)];
    localStorage.setItem(LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('LetterheadPreset local save warning:', err);
  }

  if (auth.currentUser && clean.userEmail && auth.currentUser.email === clean.userEmail) {
    const path = `letterheadPresets/${clean.id}`;
    try {
      const docRef = doc(db, 'letterheadPresets', clean.id);
      const existingSnap = await getDoc(docRef);
      const cloudPayload = existingSnap.exists()
        ? {
            ...clean,
            createdAt:
              typeof existingSnap.data()?.createdAt === 'number'
                ? existingSnap.data().createdAt
                : clean.createdAt,
          }
        : clean;
      await setDoc(docRef, sanitizeForFirestore(cloudPayload));
      return cloudPayload;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  return clean;
};

export const getLetterheadPresets = async (
  userEmail?: string
): Promise<LetterheadPresetRecord[]> => {
  const normalizedEmail = String(userEmail || '').trim();
  let cloudPresets: LetterheadPresetRecord[] = [];
  const activeCloudEmail = auth.currentUser?.email || '';

  if (auth.currentUser && normalizedEmail && activeCloudEmail === normalizedEmail) {
    try {
      const col = collection(db, 'letterheadPresets');
      const q = query(col, where('userEmail', '==', normalizedEmail));
      const snap = await getDocs(q);
      cloudPresets = snap.docs.map((d) => d.data() as LetterheadPresetRecord);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'letterheadPresets');
    }
  }

  let localPresets: LetterheadPresetRecord[] = [];
  let allLocalPresets: LetterheadPresetRecord[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY);
    if (raw) {
      allLocalPresets = JSON.parse(raw);
      localPresets = normalizedEmail
        ? allLocalPresets.filter((p) => !p.userEmail || p.userEmail === normalizedEmail)
        : allLocalPresets.filter((p) => !p.userEmail);
    }
  } catch (err) {
    console.warn('LetterheadPreset local read error:', err);
  }

  // Promote any guest/anonymous local presets to the signed-in Google account on first login
  if (auth.currentUser && normalizedEmail && activeCloudEmail === normalizedEmail) {
    const guestLocal = localPresets.filter((p) => !p.userEmail);
    if (guestLocal.length > 0) {
      const promotedMap = new Map<string, LetterheadPresetRecord>();
      for (const guest of guestLocal) {
        try {
          const cleanGuest = await sanitizeLetterheadPreset({
            ...guest,
            userEmail: normalizedEmail,
          });
          await setDoc(
            doc(db, 'letterheadPresets', cleanGuest.id),
            sanitizeForFirestore(cleanGuest)
          );
          promotedMap.set(cleanGuest.id, cleanGuest);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `letterheadPresets/${guest.id}`);
        }
      }
      if (promotedMap.size > 0) {
        try {
          const refreshedLocal = allLocalPresets.map((p) => promotedMap.get(p.id) || p);
          localStorage.setItem(LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY, JSON.stringify(refreshedLocal));
          localPresets = localPresets.map((p) => promotedMap.get(p.id) || p);
        } catch {
          // ignore localStorage refresh errors
        }
      }
    }
  }

  const map = new Map<string, LetterheadPresetRecord>();
  // Put local first, then cloud updates override unless local has strictly newer updatedAt
  for (const p of localPresets) {
    map.set(p.id, p);
  }
  for (const cp of cloudPresets) {
    const existingLocal = map.get(cp.id);
    if (!existingLocal || (cp.updatedAt || cp.createdAt) >= (existingLocal.updatedAt || existingLocal.createdAt)) {
      map.set(cp.id, cp);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  );
};

export const deleteLetterheadPreset = async (presetId: string): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY);
    if (raw) {
      const existing: LetterheadPresetRecord[] = JSON.parse(raw);
      localStorage.setItem(
        LOCAL_STORAGE_LETTERHEAD_PRESETS_KEY,
        JSON.stringify(existing.filter((p) => p.id !== presetId))
      );
    }
  } catch (err) {
    console.warn('LetterheadPreset local delete error:', err);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'letterheadPresets', presetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `letterheadPresets/${presetId}`);
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
// Custom PDF Stamp Library Presets Persistence
// ==========================================
const LOCAL_STORAGE_STAMP_PRESETS_KEY = 'paperlink_stamp_presets';

const VALID_STAMP_POSITIONS = new Set<PdfStampPlacement>([
  'top-left',
  'top-center',
  'top-right',
  'center',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

const VALID_STAMP_SCOPES = new Set<PdfStampPageScope>([
  'all-attached',
  'all-including-cover',
  'first-attached',
  'cover-only',
]);

const VALID_STAMP_SHAPES = new Set<PdfStampShape>([
  'rect',
  'double-rect',
  'round',
  'solid-badge',
]);

async function sanitizeStampPreset(preset: CustomStampPreset): Promise<CustomStampPreset> {
  const now = Date.now();
  const kind: 'image' | 'text' = preset.kind === 'image' ? 'image' : 'text';
  const safeImageUrl =
    kind === 'image' && preset.imageUrl
      ? await compressPresetAssetIfNeeded(preset.imageUrl, 170000, 480)
      : undefined;

  const scale = Math.min(50, Math.max(8, Math.round(Number(preset.scale) || 18)));
  const opacity = Math.min(1, Math.max(0.1, Number((Number(preset.opacity) || 0.88).toFixed(2))));
  const rotationDeg = Math.min(180, Math.max(-180, Math.round(Number(preset.rotationDeg) || 0)));

  const clean: CustomStampPreset = {
    id: sanitizePresetDocId(preset.id || `stamp_${now}`),
    name: (String(preset.name || 'Custom Stamp').trim() || 'Custom Stamp').slice(0, 80),
    kind,
    position: VALID_STAMP_POSITIONS.has(preset.position) ? preset.position : 'bottom-right',
    scale,
    opacity,
    rotationDeg,
    pageScope: VALID_STAMP_SCOPES.has(preset.pageScope) ? preset.pageScope : 'all-attached',
    userEmail: String(preset.userEmail || '').trim().slice(0, 254),
    createdAt: typeof preset.createdAt === 'number' && preset.createdAt > 0 ? preset.createdAt : now,
    updatedAt: typeof preset.updatedAt === 'number' && preset.updatedAt > 0 ? preset.updatedAt : now,
  };

  if (kind === 'image' && safeImageUrl) {
    clean.imageUrl = safeImageUrl;
  } else {
    if (preset.text?.trim()) clean.text = preset.text.trim().slice(0, 48);
    if (preset.subtext?.trim()) clean.subtext = preset.subtext.trim().slice(0, 48);
    clean.shape = VALID_STAMP_SHAPES.has(preset.shape as PdfStampShape)
      ? (preset.shape as PdfStampShape)
      : 'rect';
    clean.color = (String(preset.color || '#dc2626').trim() || '#dc2626').slice(0, 32);
  }

  return clean;
}

export const saveStampPreset = async (preset: CustomStampPreset): Promise<CustomStampPreset> => {
  const clean = await sanitizeStampPreset(preset);

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STAMP_PRESETS_KEY);
    const existing: CustomStampPreset[] = raw ? JSON.parse(raw) : [];
    const prevMatch = existing.find((p) => p.id === clean.id);
    if (prevMatch && prevMatch.createdAt > 0) {
      clean.createdAt = prevMatch.createdAt;
    }
    const updated = [clean, ...existing.filter((p) => p.id !== clean.id)];
    localStorage.setItem(LOCAL_STORAGE_STAMP_PRESETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('StampPreset local save warning:', err);
  }

  if (auth.currentUser && clean.userEmail && auth.currentUser.email === clean.userEmail) {
    const path = `stampPresets/${clean.id}`;
    try {
      const docRef = doc(db, 'stampPresets', clean.id);
      const existingSnap = await getDoc(docRef);
      const cloudPayload = existingSnap.exists()
        ? {
            ...clean,
            createdAt:
              typeof existingSnap.data()?.createdAt === 'number'
                ? existingSnap.data().createdAt
                : clean.createdAt,
          }
        : clean;
      await setDoc(docRef, sanitizeForFirestore(cloudPayload));
      return cloudPayload;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  return clean;
};

export const getStampPresets = async (userEmail?: string): Promise<CustomStampPreset[]> => {
  const normalizedEmail = String(userEmail || '').trim();
  let cloudPresets: CustomStampPreset[] = [];
  const activeCloudEmail = auth.currentUser?.email || '';

  if (auth.currentUser && normalizedEmail && activeCloudEmail === normalizedEmail) {
    try {
      const col = collection(db, 'stampPresets');
      const q = query(col, where('userEmail', '==', normalizedEmail));
      const snap = await getDocs(q);
      cloudPresets = snap.docs.map((d) => d.data() as CustomStampPreset);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'stampPresets');
    }
  }

  let localPresets: CustomStampPreset[] = [];
  let allLocalPresets: CustomStampPreset[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STAMP_PRESETS_KEY);
    if (raw) {
      allLocalPresets = JSON.parse(raw);
      localPresets = normalizedEmail
        ? allLocalPresets.filter((p) => !p.userEmail || p.userEmail === normalizedEmail)
        : allLocalPresets.filter((p) => !p.userEmail);
    }
  } catch (err) {
    console.warn('StampPreset local read error:', err);
  }

  if (auth.currentUser && normalizedEmail && activeCloudEmail === normalizedEmail) {
    const guestLocal = localPresets.filter((p) => !p.userEmail);
    if (guestLocal.length > 0) {
      const promotedMap = new Map<string, CustomStampPreset>();
      for (const guest of guestLocal) {
        try {
          const cleanGuest = await sanitizeStampPreset({
            ...guest,
            userEmail: normalizedEmail,
          });
          await setDoc(
            doc(db, 'stampPresets', cleanGuest.id),
            sanitizeForFirestore(cleanGuest)
          );
          promotedMap.set(cleanGuest.id, cleanGuest);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `stampPresets/${guest.id}`);
        }
      }
      if (promotedMap.size > 0) {
        try {
          const refreshedLocal = allLocalPresets.map((p) => promotedMap.get(p.id) || p);
          localStorage.setItem(LOCAL_STORAGE_STAMP_PRESETS_KEY, JSON.stringify(refreshedLocal));
          localPresets = localPresets.map((p) => promotedMap.get(p.id) || p);
        } catch {
          // ignore localStorage refresh errors
        }
      }
    }
  }

  const map = new Map<string, CustomStampPreset>();
  for (const p of localPresets) {
    map.set(p.id, p);
  }
  for (const cp of cloudPresets) {
    const existingLocal = map.get(cp.id);
    if (!existingLocal || (cp.updatedAt || cp.createdAt) >= (existingLocal.updatedAt || existingLocal.createdAt)) {
      map.set(cp.id, cp);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  );
};

export const deleteStampPreset = async (presetId: string): Promise<void> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STAMP_PRESETS_KEY);
    if (raw) {
      const existing: CustomStampPreset[] = JSON.parse(raw);
      localStorage.setItem(
        LOCAL_STORAGE_STAMP_PRESETS_KEY,
        JSON.stringify(existing.filter((p) => p.id !== presetId))
      );
    }
  } catch (err) {
    console.warn('StampPreset local delete error:', err);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'stampPresets', presetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stampPresets/${presetId}`);
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

const LOCAL_PROFILE_PREFIX = 'paperlink_user_profile_v1_';

export const createEmptyUserProfile = (
  uid: string,
  email: string,
  displayName?: string | null
): UserProfileData => {
  const now = Date.now();
  return {
    uid,
    userEmail: email,
    fullName: displayName || '',
    fatherName: '',
    contactNumber: '',
    email: email || '',
    dateOfBirth: '',
    nationalIdNumber: '',
    passportNumber: '',
    organization: '',
    designation: '',
    address: '',
    bioNotes: '',
    nationalIdFrontUrl: undefined,
    nationalIdBackUrl: undefined,
    passportImageUrl: undefined,
    signatureUrl: undefined,
    avatarUrl: undefined,
    presets: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const compressDocumentImageDataUrl = async (
  fileOrUrl: File | string,
  opts?: { maxDim?: number; quality?: number; preservePngTransparency?: boolean; maxLength?: number }
): Promise<string> => {
  const maxDim = opts?.maxDim ?? 1080;
  let quality = opts?.quality ?? 0.78;
  const preservePng = !!opts?.preservePngTransparency;
  const maxLen = opts?.maxLength ?? 220_000;

  const dataUrl =
    typeof fileOrUrl === 'string'
      ? fileOrUrl
      : await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => reject(new Error('Failed to read image file'));
          r.readAsDataURL(fileOrUrl);
        });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Invalid image format'));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.height || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl.slice(0, maxLen);

  if (!preservePng) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);

  if (preservePng) {
    const pngOut = canvas.toDataURL('image/png');
    if (pngOut.length <= maxLen) return pngOut;
    // Scale down slightly if signature PNG is unexpectedly huge
    const shrinkCanvas = document.createElement('canvas');
    shrinkCanvas.width = Math.max(120, Math.round(w * 0.65));
    shrinkCanvas.height = Math.max(40, Math.round(h * 0.65));
    const sCtx = shrinkCanvas.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(canvas, 0, 0, shrinkCanvas.width, shrinkCanvas.height);
      return shrinkCanvas.toDataURL('image/png');
    }
    return pngOut;
  }

  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > maxLen && quality > 0.42) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
};

function sanitizePresetsList(list: UserBiodataPreset[] | undefined): UserBiodataPreset[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((p) => ({
    id: String(p.id || `preset_${Date.now()}`).slice(0, 80),
    name: String(p.name || 'Saved Preset').slice(0, 80),
    fullName: String(p.fullName || '').slice(0, 160),
    fatherName: String(p.fatherName || '').slice(0, 160),
    contactNumber: String(p.contactNumber || '').slice(0, 48),
    email: String(p.email || '').slice(0, 254),
    organization: String(p.organization || '').slice(0, 200),
    designation: String(p.designation || '').slice(0, 160),
    nationalIdNumber: String(p.nationalIdNumber || '').slice(0, 64),
    passportNumber: String(p.passportNumber || '').slice(0, 64),
    address: String(p.address || '').slice(0, 400),
    notes: String(p.notes || '').slice(0, 800),
    coverTitle: String(p.coverTitle || '').slice(0, 200),
    coverSubtitle: String(p.coverSubtitle || '').slice(0, 200),
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
  }));
}

function toMillis(val: unknown, fallback = Date.now()): number {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  return fallback;
}

export const getUserProfile = async (
  user: User | null
): Promise<UserProfileData | null> => {
  if (!user?.uid) return null;
  const fallback = createEmptyUserProfile(user.uid, user.email || '', user.displayName);
  const path = `userProfiles/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'userProfiles', user.uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      const hydrated: UserProfileData = {
        uid: String(d.uid || user.uid),
        userEmail: String(d.userEmail || user.email || ''),
        fullName: String(d.fullName || user.displayName || ''),
        fatherName: String(d.fatherName || ''),
        contactNumber: String(d.contactNumber || ''),
        email: String(d.email || user.email || ''),
        dateOfBirth: String(d.dateOfBirth || ''),
        nationalIdNumber: String(d.nationalIdNumber || ''),
        passportNumber: String(d.passportNumber || ''),
        organization: String(d.organization || ''),
        designation: String(d.designation || ''),
        address: String(d.address || ''),
        bioNotes: String(d.bioNotes || ''),
        nationalIdFrontUrl: typeof d.nationalIdFrontUrl === 'string' ? d.nationalIdFrontUrl : undefined,
        nationalIdBackUrl: typeof d.nationalIdBackUrl === 'string' ? d.nationalIdBackUrl : undefined,
        passportImageUrl: typeof d.passportImageUrl === 'string' ? d.passportImageUrl : undefined,
        signatureUrl: typeof d.signatureUrl === 'string' ? d.signatureUrl : undefined,
        avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : undefined,
        presets: sanitizePresetsList(d.presets as UserBiodataPreset[]),
        createdAt: toMillis(d.createdAt, fallback.createdAt),
        updatedAt: toMillis(d.updatedAt, fallback.updatedAt),
      };
      try {
        localStorage.setItem(`${LOCAL_PROFILE_PREFIX}${user.uid}`, JSON.stringify(hydrated));
      } catch {
        // ignore cache error
      }
      return hydrated;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  try {
    const raw = localStorage.getItem(`${LOCAL_PROFILE_PREFIX}${user.uid}`);
    if (raw) {
      return { ...fallback, ...(JSON.parse(raw) as Partial<UserProfileData>) };
    }
  } catch {
    // ignore
  }
  return fallback;
};

export const saveUserProfile = async (
  profile: UserProfileData,
  user: User | null
): Promise<UserProfileData> => {
  if (!user?.uid || !user.email) {
    throw new Error('Sign in with Google to save your profile.');
  }

  const uid = user.uid;
  const path = `userProfiles/${uid}`;
  const docRef = doc(db, 'userProfiles', uid);

  const basePayload: Record<string, unknown> = {
    uid,
    userEmail: user.email,
    fullName: String(profile.fullName || '').slice(0, 160),
    fatherName: String(profile.fatherName || '').slice(0, 160),
    contactNumber: String(profile.contactNumber || '').slice(0, 48),
    email: String(profile.email || user.email).slice(0, 254),
    dateOfBirth: String(profile.dateOfBirth || '').slice(0, 40),
    nationalIdNumber: String(profile.nationalIdNumber || '').slice(0, 64),
    passportNumber: String(profile.passportNumber || '').slice(0, 64),
    organization: String(profile.organization || '').slice(0, 200),
    designation: String(profile.designation || '').slice(0, 160),
    address: String(profile.address || '').slice(0, 400),
    bioNotes: String(profile.bioNotes || '').slice(0, 1000),
    presets: sanitizePresetsList(profile.presets),
    updatedAt: serverTimestamp(),
  };

  if (profile.nationalIdFrontUrl) {
    basePayload.nationalIdFrontUrl = profile.nationalIdFrontUrl.slice(0, 255000);
  }
  if (profile.nationalIdBackUrl) {
    basePayload.nationalIdBackUrl = profile.nationalIdBackUrl.slice(0, 255000);
  }
  if (profile.passportImageUrl) {
    basePayload.passportImageUrl = profile.passportImageUrl.slice(0, 255000);
  }
  if (profile.signatureUrl) {
    basePayload.signatureUrl = profile.signatureUrl.slice(0, 155000);
  }
  if (profile.avatarUrl) {
    basePayload.avatarUrl = profile.avatarUrl.slice(0, 195000);
  }

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingCreated = existingSnap.data()?.createdAt;
      await setDoc(docRef, {
        ...basePayload,
        createdAt: existingCreated || serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  const savedLocal: UserProfileData = {
    ...profile,
    uid,
    userEmail: user.email,
    presets: sanitizePresetsList(profile.presets),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(`${LOCAL_PROFILE_PREFIX}${uid}`, JSON.stringify(savedLocal));
  } catch {
    // ignore storage quota errors
  }
  return savedLocal;
};


