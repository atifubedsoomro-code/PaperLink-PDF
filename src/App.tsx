import React, { useEffect, useState, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import {
  initAuth,
  googleSignIn,
  logout,
  saveDocumentRecord,
  getSavedDocuments,
  setCachedToken,
  getTokenExpiryInfo,
  TokenExpiryInfo,
  saveBrandKit,
  getBrandKits,
  deleteBrandKit,
  isEmbeddedIframe,
  getSharedFeedbackSheetUrl,
} from './firebase';
import { Navbar, AppView } from './components/Navbar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LegalPagesView } from './components/LegalPagesView';
import { LandingPage } from './components/LandingPage';
import { DocumentUploader } from './components/DocumentUploader';
import { CoverSuggestionsCard } from './components/CoverSuggestionsCard';
import { ThemeSelector } from './components/ThemeSelector';
import { ColorCarousel } from './components/ColorCarousel';
import { CoverPreview } from './components/CoverPreview';
import { DriveSyncPanel } from './components/DriveSyncPanel';
import { ExportModal } from './components/ExportModal';
import { EmailShareModal } from './components/EmailShareModal';
import { HistoryDashboard } from './components/HistoryDashboard';
import { BatchProcessingPanel } from './components/BatchProcessingPanel';
import { PdfToolsPanel, PdfToolTab } from './components/PdfToolsPanel';
import { ImageToolsPanel, ImageToolTab } from './components/ImageToolsPanel';
import { TypewriterWelcome } from './components/TypewriterWelcome';
import { TypewriterButton } from './components/TypewriterButton';
import { RobotDownloadPopup, ReadyDownloadPayload } from './components/RobotDownloadPopup';
import { RobotToastHost } from './components/RobotToastHost';
import { MiniAiRobot } from './components/MiniAiRobot';
import { AuthGateModal } from './components/AuthGateModal';
import { LiquidCrystalButton, LiquidCrystalCard } from './components/LiquidCrystal';
import {
  SettingsModal,
  ThemeMode,
  TextSizePreset,
  NeonGlowMode,
  AnimationPace,
  DefaultPaperSize,
  DefaultQrCorner,
  AiDefaultSpeed,
  ChatbotStartMode,
  SettingsTab,
} from './components/SettingsModal';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { PaperLinkChatbot } from './components/PaperLinkChatbot';
import { DocumentPreviewModal, PreviewTarget } from './components/DocumentPreviewModal';
import { StudioScanCropPanel } from './components/StudioScanCropPanel';
import { COVER_THEMES } from './constants/themes';
import { parseUploadedDocument } from './services/documentParser';
import {
  FEEDBACK_SHEET_URL_KEY,
  FEEDBACK_WEBHOOK_URL_KEY,
  readStoredSheetUrl,
  readStoredWebhookUrl,
} from './services/feedbackSheets';
import {
  BrandKitPreset,
  CoverData,
  CoverPictureSuggestion,
  CoverSuggestionEngine,
  CoverTheme,
  DriveUploadMode,
  DriveUploadResult,
  SavedDocRecord,
  UploadedDocInfo,
  BatchItem,
} from './types';
import { generateQRCodeDataUrl } from './services/qrService';
import {
  uploadDocumentToDrive,
  updateDriveFileContent,
  extractDriveFileId,
  DriveUploadError,
} from './services/googleDrive';
import { generateCoverPagePdf, mergeCoverWithPdf } from './services/pdfService';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import {
  HardDrive,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Download,
  Printer,
  Mail,
  RotateCcw,
  Palette,
  Layout,
  UploadCloud,
  FileCheck2,
  Layers,
  AlertCircle,
  Loader2,
  Files,
  FolderOpen,
  Eye,
  Save,
  QrCode,
  ShieldCheck,
  HelpCircle,
  ScanLine,
  Maximize2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5;
type StudioSection = 'editor' | 'scan-crop' | 'batch' | 'library';
const STUDIO_SECTION_ORDER: StudioSection[] = ['editor', 'scan-crop', 'batch', 'library'];

interface FooterAction {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'dark' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

const STUDIO_TOUR_SEEN_KEY = 'paperlink_studio_tour_seen_v2';
const COVER_DRAFT_STORAGE_KEY = 'paperlink_cover_draft_v1';

interface StoredCoverDraft {
  savedAt: number;
  coverData: Partial<CoverData>;
}

function createDefaultCoverData(
  defaultPaperSize: DefaultPaperSize,
  defaultQrPosition: DefaultQrCorner,
  defaultIncludeQr = true
): CoverData {
  const initialTheme = COVER_THEMES.find((t) => t.id === 'plain-centered') || COVER_THEMES[0];
  return {
    title: '',
    subtitle: '',
    preparedBy: '',
    organization: '',
    documentId: '',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    summary: '',
    qrCallToAction: 'Scan with phone camera to view full soft copy on Google Drive.',
    imageUrl: initialTheme.defaultImage,
    themeId: initialTheme.id,
    primaryColor: initialTheme.primaryColor,
    accentColor: initialTheme.accentColor,
    titleColor: undefined,
    subtitleColor: undefined,
    textColor: undefined,
    backgroundImageUrl: undefined,
    backgroundImageOpacity: 0.35,
    backgroundImageStyle: 'full',
    logoUrl: undefined,
    logoSize: 'medium',
    logoPosition: 'top-left',
    font: initialTheme.defaultFont,
    paperSize: defaultPaperSize,
    qrPosition: defaultQrPosition,
    qrColor: '#000000',
    qrBgColor: '#ffffff',
    showLogoInQR: false,
    includeQr: defaultIncludeQr,
    version: '',
    showSyncTimestamp: false,
    expiryNote: '',
    stampPageNumbers: false,
    watermarkText: '',
    watermarkOpacity: 0.1,
    documentPageScale: 100,
  };
}

function loadSavedCoverDraft(
  defaultPaperSize: DefaultPaperSize,
  defaultQrPosition: DefaultQrCorner,
  defaultIncludeQr = true
): { coverData: CoverData; savedAt: number | null } {
  const base = createDefaultCoverData(defaultPaperSize, defaultQrPosition, defaultIncludeQr);
  try {
    const raw = localStorage.getItem(COVER_DRAFT_STORAGE_KEY);
    if (!raw) return { coverData: base, savedAt: null };
    const parsed = JSON.parse(raw) as StoredCoverDraft | Partial<CoverData>;
    const draftFields =
      parsed && typeof parsed === 'object' && 'coverData' in parsed && parsed.coverData
        ? (parsed.coverData as Partial<CoverData>)
        : (parsed as Partial<CoverData>);
    const savedAt =
      parsed && typeof parsed === 'object' && 'savedAt' in parsed && typeof parsed.savedAt === 'number'
        ? parsed.savedAt
        : Date.now();
    if (!draftFields || typeof draftFields !== 'object') {
      return { coverData: base, savedAt: null };
    }
    return {
      coverData: {
        ...base,
        ...draftFields,
      },
      savedAt,
    };
  } catch {
    return { coverData: base, savedAt: null };
  }
}

function saveCoverDraftToStorage(data: CoverData): number | null {
  const now = Date.now();
  try {
    localStorage.setItem(COVER_DRAFT_STORAGE_KEY, JSON.stringify({ savedAt: now, coverData: data }));
    return now;
  } catch {
    // Fallback if a huge embedded background/logo data URL exceeds localStorage quota
    try {
      const compactData: CoverData = {
        ...data,
        backgroundImageUrl:
          data.backgroundImageUrl && data.backgroundImageUrl.length > 180_000
            ? undefined
            : data.backgroundImageUrl,
        logoUrl: data.logoUrl && data.logoUrl.length > 180_000 ? undefined : data.logoUrl,
      };
      localStorage.setItem(
        COVER_DRAFT_STORAGE_KEY,
        JSON.stringify({ savedAt: now, coverData: compactData })
      );
      return now;
    } catch {
      return null;
    }
  }
}

function clearCoverDraftFromStorage() {
  try {
    localStorage.removeItem(COVER_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readInitialView(): AppView {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.toLowerCase();
  if (path === '/privacy' || path === '/privacy-policy') return 'privacy';
  if (path === '/terms' || path === '/terms-of-service') return 'terms';
  return 'home';
}

function readInitialThemeMode(): ThemeMode {
  try {
    const val = localStorage.getItem('paperlink_theme_mode_v2');
    if (val === 'light' || val === 'dark' || val === 'studio' || val === 'green') {
      return val === 'green' ? 'studio' : val;
    }
    return 'studio';
  } catch {
    return 'studio';
  }
}

function readInitialTextSize(): TextSizePreset {
  try {
    const val = localStorage.getItem('paperlink_text_size') || localStorage.getItem('qrdrive_text_size');
    if (val === 'small' || val === 'large') return val;
  } catch {
    // ignore storage errors
  }
  return 'medium';
}

function readInitialNeonMode(): NeonGlowMode {
  try {
    const val = localStorage.getItem('paperlink_neon_mode');
    return val === 'subtle' ? 'subtle' : 'full';
  } catch {
    return 'full';
  }
}

function readInitialAnimationPace(): AnimationPace {
  try {
    const val = localStorage.getItem('paperlink_animation_pace');
    if (val === 'fast' || val === 'off') return val;
  } catch {
    // ignore
  }
  return 'smooth';
}

function readInitialPaperSize(): DefaultPaperSize {
  try {
    const val = localStorage.getItem('paperlink_default_paper_size');
    return val === 'letter' ? 'letter' : 'a4';
  } catch {
    return 'a4';
  }
}

function readInitialQrCorner(): DefaultQrCorner {
  try {
    const val = localStorage.getItem('paperlink_default_qr_pos');
    if (val === 'bottom-left' || val === 'bottom-center') return val;
  } catch {
    // ignore
  }
  return 'bottom-right';
}

function readInitialAiSpeed(): AiDefaultSpeed {
  try {
    const val = localStorage.getItem('paperlink_ai_speed');
    return val === 'fast' ? 'fast' : 'balanced';
  } catch {
    return 'balanced';
  }
}

function readInitialDefaultIncludeQr(): boolean {
  try {
    return localStorage.getItem('paperlink_default_include_qr') !== '0';
  } catch {
    return true;
  }
}

function readInitialChatbotStartMode(): ChatbotStartMode {
  try {
    return localStorage.getItem('paperlink_chatbot_start_mode') === 'dock' ? 'dock' : 'top-bar';
  } catch {
    return 'top-bar';
  }
}

function readInitialAiSound(): boolean {
  try {
    return localStorage.getItem('paperlink_chat_sound') !== 'muted';
  } catch {
    return true;
  }
}

function readInitialShowMiniRobot(): boolean {
  try {
    return localStorage.getItem('paperlink_show_mini_robot') !== '0';
  } catch {
    return true;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<TokenExpiryInfo>(() => getTokenExpiryInfo());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Display & Workspace Preferences
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [textSize, setTextSize] = useState<TextSizePreset>(readInitialTextSize);
  const [neonGlowMode, setNeonGlowMode] = useState<NeonGlowMode>(readInitialNeonMode);
  const [animationPace, setAnimationPace] = useState<AnimationPace>(readInitialAnimationPace);
  const [defaultPaperSize, setDefaultPaperSize] = useState<DefaultPaperSize>(readInitialPaperSize);
  const [defaultQrPosition, setDefaultQrPosition] = useState<DefaultQrCorner>(readInitialQrCorner);
  const [defaultIncludeQr, setDefaultIncludeQr] = useState<boolean>(readInitialDefaultIncludeQr);
  const [aiDefaultSpeed, setAiDefaultSpeed] = useState<AiDefaultSpeed>(readInitialAiSpeed);
  const [chatbotStartMode, setChatbotStartMode] = useState<ChatbotStartMode>(readInitialChatbotStartMode);
  const [aiSoundEnabled, setAiSoundEnabled] = useState<boolean>(readInitialAiSound);
  const [showMiniRobot, setShowMiniRobot] = useState<boolean>(readInitialShowMiniRobot);
  const [feedbackSheetUrl, setFeedbackSheetUrl] = useState<string>(readStoredSheetUrl);
  const [feedbackWebhookUrl, setFeedbackWebhookUrl] = useState<string>(readStoredWebhookUrl);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('preferences');
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  // Shared Document Preview Modal State
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);

  // Tracks first-time entry into Cover Studio so spotlight tutorial triggers only there
  const studioTourCheckedRef = useRef(false);

  // Navigation State: supports /privacy & /terms direct routes as well as SPA views
  const [activeView, setActiveView] = useState<AppView>(readInitialView);
  const [studioSection, setStudioSection] = useState<StudioSection>('editor');
  const [studioSlideDir, setStudioSlideDir] = useState<1 | -1>(1);
  const studioSectionRef = useRef<StudioSection>('editor');
  studioSectionRef.current = studioSection;

  const selectStudioSection = useCallback((next: StudioSection) => {
    const prevIdx = STUDIO_SECTION_ORDER.indexOf(studioSectionRef.current);
    const nextIdx = STUDIO_SECTION_ORDER.indexOf(next);
    if (nextIdx !== prevIdx) {
      setStudioSlideDir(nextIdx > prevIdx ? 1 : -1);
    }
    setStudioSection(next);
  }, []);

  const [activePdfTool, setActivePdfTool] = useState<PdfToolTab>('pdf-edit');
  const [activeImageTool, setActiveImageTool] = useState<ImageToolTab>('bg-remove');

  // Linear 5-Step Cover Studio Workflow + Compact Studio View Toggles
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [step2Tab, setStep2Tab] = useState<'themes' | 'ai-art'>('themes');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Full-screen auto-hiding 3-4s typewriter feedback + center-screen Robot Download Popup
  const [downloadPopupPayload, setDownloadPopupPayload] = useState<ReadyDownloadPayload | null>(null);
  const pendingDownloadRef = useRef<ReadyDownloadPayload | null>(null);
  const [typewriterConfig, setTypewriterConfig] = useState<{
    isOpen: boolean;
    mode: 'login' | 'logout' | 'upload-success' | 'task-complete';
    targetUrl?: string;
    headline?: string;
    subtext?: string;
    statusLabel?: string;
    durationMs?: number;
  }>({
    isOpen: false,
    mode: 'login',
  });

  const getScaledDuration = useCallback(
    (_baseMs: number) => (animationPace === 'fast' ? 3000 : 3500),
    [animationPace]
  );

  const triggerTaskTypewriter = useCallback(
    (info: {
      headline: string;
      subtext: string;
      statusLabel?: string;
      downloadFile?: ReadyDownloadPayload;
    }) => {
      const enrichedDownload = info.downloadFile
        ? {
            ...info.downloadFile,
            headline: info.downloadFile.headline || info.headline,
            subtext: info.downloadFile.subtext || info.subtext,
          }
        : null;

      if (animationPace === 'off') {
        if (enrichedDownload) {
          setDownloadPopupPayload(enrichedDownload);
        }
        return;
      }

      pendingDownloadRef.current = enrichedDownload;
      setTypewriterConfig({
        isOpen: true,
        mode: 'task-complete',
        headline: info.headline,
        subtext: info.subtext,
        statusLabel: info.statusLabel,
        durationMs: getScaledDuration(3500),
      });
    },
    [animationPace, getScaledDuration]
  );

  // Chatbot minimize-to-top-bar state (defaults to top bar; also auto-docks inside Cover Studio)
  const [isChatbotMinimized, setIsChatbotMinimized] = useState<boolean>(
    () => readInitialChatbotStartMode() === 'top-bar'
  );
  const prevActiveViewRef = useRef<AppView>(activeView);
  const wasChatbotMinimizedBeforeStudioRef = useRef<boolean | null>(null);

  useEffect(() => {
    const prev = prevActiveViewRef.current;
    if (activeView === 'studio' && prev !== 'studio') {
      wasChatbotMinimizedBeforeStudioRef.current = isChatbotMinimized;
      setIsChatbotMinimized(true);
    } else if (activeView !== 'studio' && prev === 'studio') {
      if (wasChatbotMinimizedBeforeStudioRef.current === false) {
        setIsChatbotMinimized(false);
      }
      wasChatbotMinimizedBeforeStudioRef.current = null;
    }
    prevActiveViewRef.current = activeView;
  }, [activeView, isChatbotMinimized]);

  // Google Sign-In modal (only triggered by user intent, never on arrival)
  const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);
  const [authGateAction, setAuthGateAction] = useState('Continue with Google Drive');
  const [forceConsent, setForceConsent] = useState(false);

  // Single Document state
  const [currentDoc, setCurrentDoc] = useState<UploadedDocInfo | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Free Document-Tailored Cover Picture Suggestions state
  const [coverSuggestions, setCoverSuggestions] = useState<CoverPictureSuggestion[]>([]);
  const [suggestionCount, setSuggestionCount] = useState<1 | 2 | 3>(3);
  const [suggestionEngine, setSuggestionEngine] = useState<CoverSuggestionEngine>('ai');
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [detectedSuggestionTopic, setDetectedSuggestionTopic] = useState<string | null>(null);
  const lastSuggestedDocIdRef = useRef<string | null>(null);

  const initialDraft = useRef<{ coverData: CoverData; savedAt: number | null } | null>(null);
  if (initialDraft.current === null) {
    initialDraft.current = loadSavedCoverDraft(defaultPaperSize, defaultQrPosition, defaultIncludeQr);
  }

  const [coverData, setCoverData] = useState<CoverData>(() => initialDraft.current!.coverData);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(
    () => initialDraft.current!.savedAt
  );
  const coverDataRef = useRef<CoverData>(coverData);
  coverDataRef.current = coverData;

  const hasDraftEdits = Boolean(
    coverData.title.trim() ||
      coverData.subtitle.trim() ||
      coverData.preparedBy.trim() ||
      coverData.organization.trim() ||
      coverData.documentId.trim() ||
      coverData.summary.trim() ||
      coverData.watermarkText?.trim() ||
      coverData.version?.trim() ||
      coverData.expiryNote?.trim() ||
      coverData.logoUrl ||
      coverData.backgroundImageUrl
  );

  // Debounced auto-save whenever coverData changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTs = saveCoverDraftToStorage(coverData);
      if (savedTs) setLastAutoSavedAt(savedTs);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [coverData]);

  // Periodic background auto-save (every 10 seconds) + flush before page refresh/unload
  useEffect(() => {
    const interval = window.setInterval(() => {
      const savedTs = saveCoverDraftToStorage(coverDataRef.current);
      if (savedTs) setLastAutoSavedAt(savedTs);
    }, 10_000);

    const handleBeforeUnload = () => {
      saveCoverDraftToStorage(coverDataRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Google Drive & QR state
  const [uploadMode, setUploadMode] = useState<DriveUploadMode>('merged');
  const [uploadResult, setUploadResult] = useState<DriveUploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ percent: 0, status: '' });
  const [uploadError, setUploadError] = useState<{ code: string; message: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Downloading state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);
  const [downloadErrorMsg, setDownloadErrorMsg] = useState<string | null>(null);

  // Batch items
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Modals
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailShareTarget, setEmailShareTarget] = useState<{
    title: string;
    link: string;
    qrUrl?: string;
  } | null>(null);

  // Document Library & Brand Kits
  const [savedDocs, setSavedDocs] = useState<SavedDocRecord[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKitPreset[]>([]);

  // Route switcher syncing /privacy & /terms URLs and nesting Batch/Library inside Cover Studio
  const navigateView = useCallback((view: AppView | 'batch' | 'library') => {
    setAuthErrorMsg(null);
    if (view === 'batch') {
      setActiveView('studio');
      selectStudioSection('batch');
    } else if (view === 'library') {
      setActiveView('studio');
      selectStudioSection('library');
    } else {
      setActiveView(view);
      if (view === 'studio') {
        selectStudioSection('editor');
      }
    }

    if (typeof window !== 'undefined') {
      const targetPath = view === 'privacy' ? '/privacy' : view === 'terms' ? '/terms' : '/';
      try {
        if (window.location.pathname !== targetPath) {
          window.history.pushState({ view }, '', targetPath);
        }
      } catch {
        // Ignore history restriction in sandboxed preview environments
      }
      if (view === 'privacy' || view === 'terms') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [selectStudioSection]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(readInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync 3-mode Theme (Default Studio Cobalt, Light Gold, Dark Gold) to document root
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'light') {
      root.classList.remove('dark', 'theme-studio', 'theme-green', 'theme-dark');
      root.classList.add('theme-light');
      root.style.colorScheme = 'light';
    } else if (themeMode === 'dark') {
      root.classList.add('dark', 'theme-dark');
      root.classList.remove('theme-studio', 'theme-green', 'theme-light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark', 'theme-dark', 'theme-light', 'theme-green');
      root.classList.add('theme-studio');
      root.style.colorScheme = 'light';
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute(
        'content',
        themeMode === 'light' ? '#fafafa' : themeMode === 'dark' ? '#09090b' : '#f4f7fb'
      );
    }
    try {
      localStorage.setItem('paperlink_theme_mode_v2', themeMode);
    } catch {
      // ignore storage errors
    }
  }, [themeMode]);

  // Sync Text Size preset to document root
  useEffect(() => {
    const sizePx = textSize === 'small' ? '14px' : textSize === 'large' ? '18px' : '16px';
    document.documentElement.style.fontSize = sizePx;
    try {
      localStorage.setItem('paperlink_text_size', textSize);
    } catch {
      // ignore storage errors
    }
  }, [textSize]);

  // Persist expanded workspace customizations
  useEffect(() => {
    try {
      localStorage.setItem('paperlink_neon_mode', neonGlowMode);
      localStorage.setItem('paperlink_animation_pace', animationPace);
      localStorage.setItem('paperlink_default_paper_size', defaultPaperSize);
      localStorage.setItem('paperlink_default_qr_pos', defaultQrPosition);
      localStorage.setItem('paperlink_default_include_qr', defaultIncludeQr ? '1' : '0');
      localStorage.setItem('paperlink_ai_speed', aiDefaultSpeed);
      localStorage.setItem('paperlink_chatbot_start_mode', chatbotStartMode);
      localStorage.setItem('paperlink_chat_sound', aiSoundEnabled ? 'on' : 'muted');
      localStorage.setItem('paperlink_show_mini_robot', showMiniRobot ? '1' : '0');
      localStorage.setItem(FEEDBACK_SHEET_URL_KEY, feedbackSheetUrl);
      localStorage.setItem(FEEDBACK_WEBHOOK_URL_KEY, feedbackWebhookUrl);
    } catch {
      // ignore storage errors
    }
  }, [
    neonGlowMode,
    animationPace,
    defaultPaperSize,
    defaultQrPosition,
    defaultIncludeQr,
    aiDefaultSpeed,
    chatbotStartMode,
    aiSoundEnabled,
    showMiniRobot,
    feedbackSheetUrl,
    feedbackWebhookUrl,
  ]);

  // Hydrate shared Feedback Google Sheet URL from Firestore when not set locally
  useEffect(() => {
    if (feedbackSheetUrl.trim()) return;
    let active = true;
    getSharedFeedbackSheetUrl().then((sharedUrl) => {
      if (active && sharedUrl.trim()) {
        setFeedbackSheetUrl((prev) => prev.trim() || sharedUrl.trim());
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleChangeDefaultPaperSize = (size: DefaultPaperSize) => {
    setDefaultPaperSize(size);
    setCoverData((prev) => ({ ...prev, paperSize: size }));
  };

  const handleChangeDefaultQrPosition = (pos: DefaultQrCorner) => {
    setDefaultQrPosition(pos);
    setCoverData((prev) => ({ ...prev, qrPosition: pos }));
  };

  const handleChangeDefaultIncludeQr = (includeQr: boolean) => {
    setDefaultIncludeQr(includeQr);
    setCoverData((prev) => ({ ...prev, includeQr }));
  };

  const handleChangeChatbotStartMode = (mode: ChatbotStartMode) => {
    setChatbotStartMode(mode);
    if (mode === 'top-bar') {
      setIsChatbotMinimized(true);
    } else if (activeView !== 'studio') {
      setIsChatbotMinimized(false);
    }
  };

  const handleClearDrafts = () => {
    clearCoverDraftFromStorage();
    setLastAutoSavedAt(null);
  };

  const handleResetPreferences = () => {
    setThemeMode('studio');
    setTextSize('medium');
    setNeonGlowMode('full');
    setAnimationPace('smooth');
    setDefaultPaperSize('a4');
    setDefaultQrPosition('bottom-right');
    setDefaultIncludeQr(true);
    setAiDefaultSpeed('balanced');
    setChatbotStartMode('top-bar');
    setIsChatbotMinimized(true);
    setAiSoundEnabled(true);
    setShowMiniRobot(true);
    setCoverData((prev) => ({ ...prev, paperSize: 'a4', qrPosition: 'bottom-right', includeQr: true }));
  };

  // Refresh OAuth token expiry status periodically & on window focus
  useEffect(() => {
    const syncExpiry = () => {
      const info = getTokenExpiryInfo();
      setTokenExpiry(info);
      if (info.isExpired && token) {
        setCachedToken(null);
        setToken(null);
      }
    };
    syncExpiry();
    const interval = setInterval(syncExpiry, 30000);
    window.addEventListener('focus', syncExpiry);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncExpiry);
    };
  }, [token]);

  // First-time Cover Studio contextual spotlight tour (only runs inside Cover Studio editor)
  useEffect(() => {
    if (activeView !== 'studio' || studioSection !== 'editor' || typewriterConfig.isOpen || studioTourCheckedRef.current) return;
    studioTourCheckedRef.current = true;
    try {
      const seen = localStorage.getItem(STUDIO_TOUR_SEEN_KEY) === '1';
      if (!seen) {
        const timer = setTimeout(() => {
          try {
            localStorage.setItem(STUDIO_TOUR_SEEN_KEY, '1');
          } catch {
            // ignore storage errors
          }
          setCurrentStep(1);
          setIsTutorialOpen(true);
        }, 350);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore storage errors
    }
  }, [activeView, studioSection, typewriterConfig.isOpen]);

  // Initialize auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (authenticatedUser, accessToken) => {
        setUser(authenticatedUser);
        setToken(accessToken);
        setTokenExpiry(getTokenExpiryInfo());
        if (authenticatedUser.displayName) {
          setCoverData((prev) =>
            prev.preparedBy ? prev : { ...prev, preparedBy: authenticatedUser.displayName || '' }
          );
        }
      },
      () => {
        setUser(null);
        setToken(null);
        setTokenExpiry(getTokenExpiryInfo());
      }
    );

    return () => unsubscribe();
  }, []);

  // Load saved library records & brand kits
  const refreshDocuments = useCallback(async () => {
    try {
      const [docs, kits] = await Promise.all([
        getSavedDocuments(user?.email || undefined),
        getBrandKits(user?.email || undefined),
      ]);
      setSavedDocs(docs);
      setBrandKits(kits);
    } catch (err) {
      console.warn('Could not load saved workspace data:', err);
    }
  }, [user]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const handleSaveBrandKit = async (name: string) => {
    const kit: BrandKitPreset = {
      id: `kit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      organization: coverData.organization || '',
      preparedBy: coverData.preparedBy || '',
      themeId: coverData.themeId,
      primaryColor: coverData.primaryColor,
      accentColor: coverData.accentColor,
      titleColor: coverData.titleColor,
      subtitleColor: coverData.subtitleColor,
      textColor: coverData.textColor,
      font: coverData.font,
      logoUrl: coverData.logoUrl,
      logoSize: coverData.logoSize,
      logoPosition: coverData.logoPosition,
      qrColor: coverData.qrColor,
      qrBgColor: coverData.qrBgColor,
      qrPosition: coverData.qrPosition,
      showLogoInQR: coverData.showLogoInQR,
      createdAt: Date.now(),
      userEmail: user?.email || '',
    };
    await saveBrandKit(kit);
    refreshDocuments();
  };

  const handleApplyBrandKit = (kit: BrandKitPreset) => {
    setCoverData((prev) => ({
      ...prev,
      organization: kit.organization ?? prev.organization,
      preparedBy: kit.preparedBy ?? prev.preparedBy,
      primaryColor: kit.primaryColor,
      accentColor: kit.accentColor,
      titleColor: kit.titleColor,
      subtitleColor: kit.subtitleColor,
      textColor: kit.textColor,
      font: kit.font,
      logoUrl: kit.logoUrl,
      logoSize: kit.logoSize ?? prev.logoSize,
      logoPosition: kit.logoPosition ?? prev.logoPosition,
      qrColor: kit.qrColor ?? prev.qrColor,
      qrBgColor: kit.qrBgColor ?? prev.qrBgColor,
      qrPosition: kit.qrPosition ?? prev.qrPosition,
      showLogoInQR: kit.showLogoInQR ?? prev.showLogoInQR,
    }));
  };

  const handleDeleteBrandKit = async (kitId: string) => {
    await deleteBrandKit(kitId);
    refreshDocuments();
  };

  // Generate QR code whenever link or styling changes
  useEffect(() => {
    const targetUrl = uploadResult?.webViewLink || 'https://drive.google.com';

    generateQRCodeDataUrl({
      url: targetUrl,
      colorDark: coverData.qrColor,
      colorLight: coverData.qrBgColor,
      width: 480,
      logoUrl: coverData.showLogoInQR ? coverData.logoUrl : undefined,
    })
      .then((dataUrl) => setQrDataUrl(dataUrl))
      .catch((err) => console.error('QR generation failed:', err));
  }, [
    uploadResult?.webViewLink,
    coverData.qrColor,
    coverData.qrBgColor,
    coverData.showLogoInQR,
    coverData.logoUrl,
  ]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthErrorMsg(null);
    try {
      const res = await googleSignIn({ forceConsent });
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setTokenExpiry(getTokenExpiryInfo());
        setIsAuthGateOpen(false);
        setForceConsent(false);
        setUploadError(null);

        if (res.user.displayName && !coverData.preparedBy) {
          setCoverData((prev) => ({
            ...prev,
            preparedBy: res.user.displayName || '',
          }));
        }

        if (animationPace !== 'off') {
          setTypewriterConfig({
            isOpen: true,
            mode: 'login',
            durationMs: getScaledDuration(3500),
          });
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthErrorMsg(err?.message || 'Sign-in could not complete. Enable popups and try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectWithSheetsConsent = async () => {
    setIsLoggingIn(true);
    setAuthErrorMsg(null);
    try {
      const res = await googleSignIn({ forceConsent: true });
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setTokenExpiry(getTokenExpiryInfo());
        setForceConsent(false);
        setUploadError(null);
      }
    } catch (err: any) {
      setAuthErrorMsg(err?.message || 'Could not refresh Google permissions. Enable popups and try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setTokenExpiry(getTokenExpiryInfo());
    if (animationPace !== 'off') {
      setTypewriterConfig({
        isOpen: true,
        mode: 'logout',
        durationMs: getScaledDuration(3500),
      });
    }
  };

  const handleTypewriterComplete = () => {
    setTypewriterConfig((prev) => ({ ...prev, isOpen: false }));
    if (pendingDownloadRef.current) {
      const nextPayload = pendingDownloadRef.current;
      pendingDownloadRef.current = null;
      setDownloadPopupPayload(nextPayload);
    }
  };

  const handleUploadToDrive = async () => {
    if (!currentDoc) {
      setUploadError({ code: 'unknown', message: 'Upload a document first in Step 1.' });
      setCurrentStep(1);
      return;
    }

    const expiry = getTokenExpiryInfo();
    if (!token || expiry.isExpired) {
      if (expiry.isExpired) {
        setCachedToken(null);
        setToken(null);
      }
      setAuthGateAction(
        expiry.isExpired
          ? 'Refresh Google Drive Session (1-Hour Token Expired)'
          : 'Upload Document to Google Drive'
      );
      setIsAuthGateOpen(true);
      return;
    }

    setUploadError(null);
    setUploadProgress({ percent: 0, status: 'Starting upload...' });
    setIsUploading(true);
    try {
      const result = await uploadDocumentToDrive(
        currentDoc.file,
        currentDoc.name,
        token,
        (percent, status) => {
          const scaled = uploadMode === 'merged' ? Math.min(62, Math.round(percent * 0.62)) : percent;
          setUploadProgress({ percent: scaled, status });
        }
      );

      if (uploadMode === 'merged') {
        setUploadProgress({
          percent: 66,
          status: 'Generating merged PDF with live Drive QR cover...',
        });

        const liveQr = await generateQRCodeDataUrl({
          url: result.webViewLink,
          colorDark: coverData.qrColor,
          colorLight: coverData.qrBgColor,
          width: 480,
          logoUrl: coverData.showLogoInQR ? coverData.logoUrl : undefined,
        });

        let pdfBytes: Uint8Array;
        if (currentDoc.pdfArrayBuffer) {
          pdfBytes = await mergeCoverWithPdf(currentDoc.pdfArrayBuffer, coverData, liveQr);
        } else {
          const coverPdf = await generateCoverPagePdf(coverData, liveQr);
          pdfBytes = await coverPdf.save();
        }

        const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
        const mergedBlob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
        const baseName = currentDoc.name.replace(/\.[^/.]+$/, '');
        const mergedFileName = `${baseName}_with_QR_Cover.pdf`;

        await updateDriveFileContent(
          result.fileId,
          mergedBlob,
          mergedFileName,
          token,
          (percent, status) => {
            setUploadProgress({ percent, status });
          }
        );

        result.name = mergedFileName;
        result.uploadMode = 'merged';
        setUploadProgress({ percent: 100, status: 'Merged QR cover packet live on Google Drive' });
      } else {
        result.uploadMode = 'source';
      }

      setUploadResult(result);

      const record: SavedDocRecord = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: coverData.title || currentDoc.name,
        fileName: result.name || currentDoc.name,
        fileSize: currentDoc.size,
        fileType: uploadMode === 'merged' ? 'pdf' : currentDoc.extension,
        driveFileId: result.fileId,
        driveLink: result.webViewLink,
        coverData,
        createdAt: Date.now(),
        userEmail: user?.email || '',
      };

      await saveDocumentRecord(record);
      refreshDocuments();

      if (animationPace !== 'off') {
        setTypewriterConfig({
          isOpen: true,
          mode: 'upload-success',
          targetUrl: result.webViewLink,
          durationMs: getScaledDuration(3500),
        });
      }

      setCurrentStep(5);
    } catch (err: any) {
      console.error('Drive upload failed:', err);
      const code = err instanceof DriveUploadError ? err.code : 'unknown';
      setUploadError({ code, message: err?.message || 'Failed to upload to Google Drive.' });

      if (code === 'auth' || code === 'scope') {
        setCachedToken(null);
        setToken(null);
        setTokenExpiry(getTokenExpiryInfo());
        if (code === 'scope') setForceConsent(true);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualLinkSubmit = async (link: string) => {
    const fileId = extractDriveFileId(link) || 'manual';
    const result: DriveUploadResult = {
      fileId,
      name: currentDoc?.name || 'Document',
      webViewLink: link,
      publicPermissionGranted: true,
    };
    setUploadResult(result);

    if (currentDoc) {
      const record: SavedDocRecord = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: coverData.title || currentDoc.name,
        fileName: currentDoc.name,
        fileSize: currentDoc.size,
        fileType: currentDoc.extension,
        driveFileId: fileId,
        driveLink: link,
        coverData,
        createdAt: Date.now(),
        userEmail: user?.email || '',
      };
      await saveDocumentRecord(record);
      refreshDocuments();
    }

    if (animationPace !== 'off') {
      setTypewriterConfig({
        isOpen: true,
        mode: 'upload-success',
        targetUrl: link,
        durationMs: getScaledDuration(3500),
      });
    }

    setCurrentStep(5);
  };

  const handleGenerateCoverSuggestions = useCallback(
    async (opts?: {
      count?: 1 | 2 | 3;
      engine?: CoverSuggestionEngine;
      customPrompt?: string;
      docOverride?: UploadedDocInfo | null;
    }) => {
      const targetDoc = opts?.docOverride !== undefined ? opts.docOverride : currentDoc;
      const targetCount = opts?.count ?? suggestionCount;
      const targetEngine = opts?.engine ?? suggestionEngine;
      const activeTitle =
        coverDataRef.current.title?.trim() || targetDoc?.extractedTitle || targetDoc?.name || '';
      const activeSubtitle = coverDataRef.current.subtitle?.trim() || '';

      setIsGeneratingSuggestions(true);
      setSuggestionsError(null);

      try {
        const res = await fetch('/api/cover-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            title: activeTitle,
            subtitle: activeSubtitle,
            documentName: targetDoc?.name || '',
            documentText: targetDoc?.extractedText || '',
            customPrompt: opts?.customPrompt || '',
            count: targetCount,
            preferredEngine: targetEngine,
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          suggestions?: CoverPictureSuggestion[];
          detectedTopic?: string;
          error?: string;
        };

        if (!res.ok || !Array.isArray(payload?.suggestions)) {
          throw new Error(payload?.error || 'Could not generate free cover background suggestions.');
        }

        setCoverSuggestions(payload.suggestions);
        setDetectedSuggestionTopic(payload.detectedTopic || null);
      } catch (err: any) {
        setSuggestionsError(err?.message || 'Unable to generate cover picture suggestions.');
      } finally {
        setIsGeneratingSuggestions(false);
      }
    },
    [currentDoc, suggestionCount, suggestionEngine]
  );

  const handleApplyCoverSuggestion = (suggestion: CoverPictureSuggestion) => {
    if (!suggestion.imageDataUrl) return;
    setCoverData((prev) => ({
      ...prev,
      backgroundImageUrl: suggestion.imageDataUrl,
      backgroundImageOpacity: prev.backgroundImageOpacity ?? 0.42,
    }));
  };

  const handleClearCoverBackground = () => {
    setCoverData((prev) => ({
      ...prev,
      backgroundImageUrl: undefined,
    }));
  };

  const handleDocumentParsed = (doc: UploadedDocInfo) => {
    setCurrentDoc(doc);
    setUploadResult(null);
    setUploadError(null);

    setCoverData((prev) => ({
      ...prev,
      title: doc.extractedTitle || doc.name,
      subtitle: '',
      organization: prev.organization || '',
      summary: '',
      documentId: '',
    }));

    setCurrentStep(2);

    if (lastSuggestedDocIdRef.current !== doc.id) {
      lastSuggestedDocIdRef.current = doc.id;
      void handleGenerateCoverSuggestions({ docOverride: doc });
    }
  };

  const handleReceivePdfFromTools = async (file: File) => {
    selectStudioSection('editor');
    navigateView('studio');
    setIsLoadingDoc(true);
    try {
      const parsed = await parseUploadedDocument(file);
      handleDocumentParsed(parsed);
    } catch (err) {
      console.error('Could not open converted file in Cover Studio:', err);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleSelectTheme = (theme: CoverTheme) => {
    setCoverData((prev) => ({
      ...prev,
      themeId: theme.id,
      primaryColor: theme.primaryColor,
      accentColor: prev.accentColor || theme.accentColor,
      font: prev.font || theme.defaultFont,
      imageUrl: theme.defaultImage,
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const includeQr = coverData.includeQr !== false;

  const handleToggleQrMode = (nextIncludeQr: boolean) => {
    setCoverData((prev) => ({ ...prev, includeQr: nextIncludeQr }));
    if (!nextIncludeQr && currentStep === 4) {
      setCurrentStep(5);
    }
  };

  const handleDirectDownloadMergedPdf = async () => {
    if (includeQr && !qrDataUrl) {
      setDownloadErrorMsg('QR code is still preparing. Try again in a moment.');
      return;
    }

    setIsDownloading(true);
    setDownloadErrorMsg(null);
    setDownloadSuccessMsg(null);

    try {
      let pdfBytes: Uint8Array;

      if (currentDoc?.pdfArrayBuffer) {
        pdfBytes = await mergeCoverWithPdf(currentDoc.pdfArrayBuffer, coverData, qrDataUrl || '');
      } else {
        const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl || '');
        pdfBytes = await coverPdf.save();
      }

      const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
      const blob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFilename = (coverData.title || currentDoc?.name || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      const outFileName = includeQr ? `${safeFilename}_with_QR_Cover.pdf` : `${safeFilename}_with_Cover.pdf`;
      a.download = outFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      setDownloadSuccessMsg(
        includeQr ? 'Document with QR Cover downloaded successfully.' : 'Document with Clean Cover downloaded successfully.'
      );
      setTimeout(() => setDownloadSuccessMsg(null), 3500);
      triggerTaskTypewriter({
        headline: 'Cover + Document PDF Ready',
        subtext: `${outFileName} (${totalPages} pages) downloaded successfully.`,
        statusLabel: 'Cover Studio Export Complete',
        downloadFile: {
          blob,
          fileName: outFileName,
          fileSizeBytes: blob.size,
          toolLabel: 'Cover Studio Export',
          openInStudio: false,
        },
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadErrorMsg(err.message || 'Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreviewMergedPdf = async () => {
    if (includeQr && !qrDataUrl) {
      setDownloadErrorMsg('QR code is still preparing. Try again in a moment.');
      return;
    }

    setIsPreparingPreview(true);
    setDownloadErrorMsg(null);
    try {
      let pdfBytes: Uint8Array;
      if (currentDoc?.pdfArrayBuffer) {
        pdfBytes = await mergeCoverWithPdf(currentDoc.pdfArrayBuffer, coverData, qrDataUrl || '');
      } else {
        const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl || '');
        pdfBytes = await coverPdf.save();
      }
      const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
      const blob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
      const safeFilename = (coverData.title || currentDoc?.name || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      setPreviewTarget({
        title: `${coverData.title || currentDoc?.name || 'Document'} (Full Packet Preview)`,
        fileName: includeQr ? `${safeFilename}_with_QR_Cover.pdf` : `${safeFilename}_with_Cover.pdf`,
        blob,
        subtitle: `${totalPages} pages · Cover Page + Original Pages`,
      });
    } catch (err: any) {
      setDownloadErrorMsg(err?.message || 'Unable to render merged PDF preview.');
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleSelectFromLibrary = (docRecord: SavedDocRecord) => {
    setCoverData(docRecord.coverData);
    setUploadResult({
      fileId: docRecord.driveFileId,
      name: docRecord.fileName,
      webViewLink: docRecord.driveLink,
      publicPermissionGranted: true,
    });
    selectStudioSection('editor');
    navigateView('studio');
    setCurrentStep(5);
  };

  const handleStartOver = () => {
    setCurrentDoc(null);
    setUploadResult(null);
    setUploadError(null);
    setCoverSuggestions([]);
    setSuggestionsError(null);
    setDetectedSuggestionTopic(null);
    lastSuggestedDocIdRef.current = null;
    clearCoverDraftFromStorage();
    setLastAutoSavedAt(null);
    setCoverData(createDefaultCoverData(defaultPaperSize, defaultQrPosition));
    setCurrentStep(1);
  };

  const handleDiscardCoverDraft = () => {
    clearCoverDraftFromStorage();
    setLastAutoSavedAt(null);
    setCoverData(createDefaultCoverData(defaultPaperSize, defaultQrPosition));
  };

  const originalPagesCount =
    currentDoc?.pageCount || (currentDoc?.renderedPagePreviews?.length ?? (currentDoc ? 1 : 0));
  const totalPages = 1 + (currentDoc ? originalPagesCount : 0);

  const STEPS_NAV = includeQr
    ? [
        { num: 1 as Step, displayNum: 1, label: 'Pick Your File', short: 'File', icon: UploadCloud },
        { num: 2 as Step, displayNum: 2, label: 'Cover Look', short: 'Look', icon: Layout },
        { num: 3 as Step, displayNum: 3, label: 'Customize', short: 'Customize', icon: Palette },
        { num: 4 as Step, displayNum: 4, label: 'Save to Drive', short: 'Drive QR', icon: HardDrive },
        { num: 5 as Step, displayNum: 5, label: 'Download PDF', short: 'Save', icon: FileCheck2 },
      ]
    : [
        { num: 1 as Step, displayNum: 1, label: 'Pick Your File', short: 'File', icon: UploadCloud },
        { num: 2 as Step, displayNum: 2, label: 'Cover Look', short: 'Look', icon: Layout },
        { num: 3 as Step, displayNum: 3, label: 'Customize', short: 'Customize', icon: Palette },
        { num: 5 as Step, displayNum: 4, label: 'Download PDF', short: 'Save', icon: FileCheck2 },
      ];

  const currentDisplayStep =
    STEPS_NAV.find((s) => s.num === currentStep)?.displayNum ?? (includeQr ? currentStep : 4);
  const totalStudioSteps = STEPS_NAV.length;

  const goTo = (step: Step) => () => setCurrentStep(step);
  const nextIcon = <ArrowRight className="w-4 h-4 stroke-[2.5]" />;
  const backIcon = <ArrowLeft className="w-4 h-4" />;

  const footer: { back?: FooterAction; next?: FooterAction } = (() => {
    switch (currentStep) {
      case 1:
        return {
          next: {
            text: 'Next: Pick Cover Look',
            icon: nextIcon,
            onClick: goTo(2),
            variant: 'primary',
            disabled: !currentDoc,
          },
        };
      case 2:
        return {
          back: { text: 'Back: File', icon: backIcon, onClick: goTo(1), variant: 'dark' },
          next: { text: 'Next: Customize Cover', icon: nextIcon, onClick: goTo(3), variant: 'primary' },
        };
      case 3:
        return {
          back: { text: 'Back: Cover Look', icon: backIcon, onClick: goTo(2), variant: 'dark' },
          next: includeQr
            ? { text: 'Next: Save to Drive', icon: nextIcon, onClick: goTo(4), variant: 'primary' }
            : { text: 'Next: Download PDF', icon: nextIcon, onClick: goTo(5), variant: 'primary' },
        };
      case 4:
        return {
          back: { text: 'Back: Customize', icon: backIcon, onClick: goTo(3), variant: 'dark' },
          next: uploadResult
            ? { text: 'Next: Download PDF', icon: nextIcon, onClick: goTo(5), variant: 'primary' }
            : {
                text: isUploading ? 'Saving to Drive...' : 'Save & Create QR',
                icon: <HardDrive className="w-4 h-4" />,
                onClick: handleUploadToDrive,
                variant: 'primary',
                disabled: isUploading || !currentDoc,
                loading: isUploading,
              },
        };
      case 5:
      default:
        return {
          back: { text: 'Edit Design', icon: backIcon, onClick: goTo(3), variant: 'dark' },
          next: {
            text: 'Start Another File',
            icon: <RotateCcw className="w-3.5 h-3.5" />,
            onClick: handleStartOver,
            variant: 'secondary',
          },
        };
    }
  })();

  return (
    <MotionConfig reducedMotion={animationPace === 'off' ? 'always' : 'user'}>
      <div className="min-h-screen overflow-x-clip bg-zinc-50 text-zinc-900 dark:bg-[var(--pl-bg)] dark:text-white flex flex-col font-sans antialiased selection:bg-yellow-400 selection:text-black transition-colors duration-200">
        <RobotDownloadPopup
          payload={downloadPopupPayload}
          isPreviewOpen={Boolean(previewTarget)}
          onClose={() => setDownloadPopupPayload(null)}
          onPreview={(p) =>
            setPreviewTarget({
              title: p.fileName,
              fileName: p.fileName,
              blob: p.blob,
              subtitle: p.toolLabel || 'Ready to Download',
            })
          }
          onSendToCoverStudio={(p) => {
            void handleReceivePdfFromTools(
              new File([p.blob], p.fileName, { type: 'application/pdf' })
            );
          }}
        />

        <DocumentPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />

        <RobotToastHost />

        {typewriterConfig.isOpen && (
          <TypewriterWelcome
            mode={typewriterConfig.mode}
            headline={typewriterConfig.headline}
            subtext={typewriterConfig.subtext}
            statusLabel={typewriterConfig.statusLabel}
            targetUrl={typewriterConfig.targetUrl}
            durationMs={typewriterConfig.durationMs ?? 3500}
            onComplete={handleTypewriterComplete}
          />
        )}

        <AuthGateModal
          isOpen={isAuthGateOpen}
          onClose={() => setIsAuthGateOpen(false)}
          onLogin={handleLogin}
          isLoggingIn={isLoggingIn}
          actionTitle={authGateAction}
          errorMsg={authErrorMsg}
          onDismissError={() => setAuthErrorMsg(null)}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          initialTab={settingsInitialTab}
          onClose={() => setIsSettingsOpen(false)}
          themeMode={themeMode}
          onChangeThemeMode={setThemeMode}
          textSize={textSize}
          onChangeTextSize={setTextSize}
          neonGlowMode={neonGlowMode}
          onChangeNeonGlowMode={setNeonGlowMode}
          animationPace={animationPace}
          onChangeAnimationPace={setAnimationPace}
          defaultPaperSize={defaultPaperSize}
          onChangeDefaultPaperSize={handleChangeDefaultPaperSize}
          defaultQrPosition={defaultQrPosition}
          onChangeDefaultQrPosition={handleChangeDefaultQrPosition}
          defaultIncludeQr={defaultIncludeQr}
          onChangeDefaultIncludeQr={handleChangeDefaultIncludeQr}
          aiDefaultSpeed={aiDefaultSpeed}
          onChangeAiDefaultSpeed={setAiDefaultSpeed}
          chatbotStartMode={chatbotStartMode}
          onChangeChatbotStartMode={handleChangeChatbotStartMode}
          aiSoundEnabled={aiSoundEnabled}
          onChangeAiSoundEnabled={setAiSoundEnabled}
          showMiniRobot={showMiniRobot}
          onChangeShowMiniRobot={setShowMiniRobot}
          onClearDrafts={handleClearDrafts}
          onResetPreferences={handleResetPreferences}
          onStartTutorial={() => {
            setIsSettingsOpen(false);
            selectStudioSection('editor');
            navigateView('studio');
            setCurrentStep(1);
            setTimeout(() => setIsTutorialOpen(true), 120);
          }}
          user={user}
          accessToken={token}
          onLogin={handleLogin}
          onReconnectWithConsent={handleReconnectWithSheetsConsent}
          isLoggingIn={isLoggingIn}
          feedbackSheetUrl={feedbackSheetUrl}
          onChangeFeedbackSheetUrl={setFeedbackSheetUrl}
          feedbackWebhookUrl={feedbackWebhookUrl}
          onChangeFeedbackWebhookUrl={setFeedbackWebhookUrl}
          onTaskComplete={triggerTaskTypewriter}
        />

      <OnboardingTutorial
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onSelectStudioStep={(step) => setCurrentStep(step)}
      />

      <Navbar
        user={user}
        hasDriveAccess={!!token}
        activeView={activeView}
        onNavigate={navigateView}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenSettings={() => {
          setSettingsInitialTab('preferences');
          setIsSettingsOpen(true);
        }}
        onOpenFeedback={() => {
          setSettingsInitialTab('feedback');
          setIsSettingsOpen(true);
        }}
        isLoggingIn={isLoggingIn}
        isChatbotMinimized={isChatbotMinimized}
        onRestoreChatbot={() => setIsChatbotMinimized(false)}
        showMiniRobot={showMiniRobot}
      />

      <OfflineIndicator />

      {authErrorMsg && !isAuthGateOpen && (
        <div className="no-print sticky top-[72px] z-35 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2.5">
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50/95 dark:bg-red-950/95 backdrop-blur-md border border-red-200 dark:border-red-500/45 text-red-800 dark:text-red-100 text-xs shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <span className="flex items-start sm:items-center gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>{authErrorMsg}</span>
            </span>

            <div className="flex flex-wrap items-center gap-2 shrink-0 pl-6 sm:pl-0">
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoggingIn ? 'animate-spin' : ''}`} />
                <span>{isLoggingIn ? 'Connecting...' : 'Try Again'}</span>
              </button>

              {isEmbeddedIframe() && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-500/40 text-zinc-900 dark:text-white font-semibold hover:border-blue-500 transition-colors"
                >
                  <span>Open in Full Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {activeView === 'studio' && includeQr && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleQrMode(false);
                    setAuthErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-900 border border-red-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold hover:border-blue-500 cursor-pointer"
                >
                  <span>Use Clean Cover</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setAuthErrorMsg(null)}
                className="px-2 py-1 text-red-700 dark:text-red-300 hover:text-red-950 dark:hover:text-white font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: LANDING PAGE */}
      {activeView === 'home' ? (
        <main className="flex-1">
          <LandingPage
            onNavigate={navigateView}
            onOpenPdfTool={(tool) => {
              setActivePdfTool(tool);
              navigateView('tools');
            }}
            onOpenImageTool={(tool) => {
              setActiveImageTool(tool);
              navigateView('image-tools');
            }}
            onOpenLegal={(page) => navigateView(page)}
            neonGlowMode={neonGlowMode}
            user={user}
            accessToken={token}
            onLogin={handleLogin}
            onReconnectWithConsent={handleReconnectWithSheetsConsent}
            isLoggingIn={isLoggingIn}
            feedbackSheetUrl={feedbackSheetUrl}
            onChangeFeedbackSheetUrl={setFeedbackSheetUrl}
            feedbackWebhookUrl={feedbackWebhookUrl}
            onChangeFeedbackWebhookUrl={setFeedbackWebhookUrl}
            onTaskComplete={triggerTaskTypewriter}
          />
        </main>
      ) : (
        <main
          className={`flex-1 w-full mx-auto px-3 sm:px-6 ${
            activeView === 'studio'
              ? studioSection === 'editor'
                ? 'max-w-[1660px] lg:px-6 py-2.5 pb-20 md:pb-3'
                : 'max-w-[1660px] lg:px-6 py-4 pb-12'
              : activeView === 'tools' || activeView === 'image-tools'
              ? 'max-w-[1600px] lg:px-6 py-3 pb-8'
              : 'max-w-7xl lg:px-8 py-5 pb-12'
          }`}
        >
          {activeView === 'privacy' || activeView === 'terms' ? (
            <LegalPagesView
              page={activeView}
              onBack={() => navigateView('home')}
              onSwitchPage={(p) => navigateView(p)}
            />
          ) : activeView === 'tools' ? (
            <PdfToolsPanel
              activeTool={activePdfTool}
              onToolChange={setActivePdfTool}
              onSendPdfToCoverStudio={handleReceivePdfFromTools}
              onTaskComplete={triggerTaskTypewriter}
              onPreviewDocument={setPreviewTarget}
            />
          ) : activeView === 'image-tools' ? (
            <ImageToolsPanel
              activeTool={activeImageTool}
              onToolChange={setActiveImageTool}
              userEmail={user?.email || ''}
              onUseAsCoverLogo={(dataUrl) => {
                setCoverData((prev) => ({ ...prev, logoUrl: dataUrl }));
                selectStudioSection('editor');
                navigateView('studio');
                setCurrentStep(3);
              }}
              onTaskComplete={triggerTaskTypewriter}
              onPreviewDocument={setPreviewTarget}
            />
          ) : (
            /* COVER STUDIO WORKSPACE: FIXED-VIEWPORT DESKTOP WORKBENCH + CONSTANT NEXT BUTTON + ZERO CLUTTER */
            <div className="space-y-3">
              {/* Unified Studio Control Bar (Single Navigation Row for Editor / Crop / Batch / Library + Mode Switch) */}
              <LiquidCrystalCard accentGlow="yellow" className="rounded-2xl px-3 py-2 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* Left: Brand Title + Step Readout + Studio Companion Robot */}
                  <div className="flex items-center gap-2 min-w-0">
                    {showMiniRobot && (
                      <MiniAiRobot
                        variant="topbar"
                        popupPlacement="below-left"
                        externalPopup={null}
                        onFeedbackClick={() => {
                          setSettingsInitialTab('feedback');
                          setIsSettingsOpen(true);
                        }}
                        title="Click to say hi to PaperLink Bot!"
                        sizeClassName="w-8 h-8 overflow-visible drop-shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
                      />
                    )}
                    <span className="text-sm font-extrabold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap">
                      Cover Studio
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs font-mono font-semibold text-amber-700 dark:text-yellow-400 tabular-nums whitespace-nowrap">
                      {studioSection === 'scan-crop'
                        ? 'Crop & Scan'
                        : studioSection === 'batch'
                        ? `Batch (${batchItems.length})`
                        : studioSection === 'library'
                        ? `Library (${savedDocs.length})`
                        : `Step ${currentDisplayStep} / ${totalStudioSteps}`}
                    </span>
                  </div>

                  {/* Center: Clean Unified Studio Mode Tabs with Proper Boundaries */}
                  <div
                    role="tablist"
                    aria-label="Cover Studio workspace sections"
                    className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/95 dark:bg-zinc-950/95 border border-slate-200/95 dark:border-zinc-700/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_10px_-3px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-x-auto no-scrollbar max-w-full"
                  >
                    {[
                      { id: 'editor' as StudioSection, label: 'Cover Editor', icon: Layout },
                      { id: 'scan-crop' as StudioSection, label: 'Crop / Scan', icon: ScanLine },
                      { id: 'batch' as StudioSection, label: `Batch (${batchItems.length})`, icon: Files },
                      { id: 'library' as StudioSection, label: `Library (${savedDocs.length})`, icon: FolderOpen },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isActive = studioSection === tab.id;
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={isActive}
                          type="button"
                          onClick={() => selectStudioSection(tab.id)}
                          className={`relative px-2.5 sm:px-3.5 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                            isActive
                              ? 'text-[var(--pl-cta-text)] border-[var(--pl-cta-border)]'
                              : 'text-slate-700 dark:text-zinc-300 border-transparent hover:text-slate-950 dark:hover:text-white hover:border-slate-300/85 dark:hover:border-zinc-700 hover:bg-white/80 dark:hover:bg-zinc-900/75'
                          }`}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="studioSectionPill"
                              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[11px] bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] shadow-xs"
                            />
                          )}
                          <Icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                          <span className="relative z-10">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right: Step Guide (Hover Typewriter 6.5s) + QR / Offline Mode Switch */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {studioSection === 'editor' && (
                      <TypewriterButton
                        variant="dark"
                        size="sm"
                        lingerMs={6500}
                        icon={<HelpCircle className="w-3.5 h-3.5 text-amber-700 dark:text-yellow-400" />}
                        text="Step Guide"
                        onClick={() => {
                          setCurrentStep(1);
                          setTimeout(() => setIsTutorialOpen(true), 80);
                        }}
                      />
                    )}

                    <div
                      data-tour-target="studio-mode-toggle"
                      role="group"
                      aria-label="Cover output mode"
                      className={`relative grid grid-cols-2 p-1 rounded-xl border bg-zinc-100/95 dark:bg-zinc-950 transition-shadow duration-300 shrink-0 ${
                        neonGlowMode === 'full'
                          ? includeQr
                            ? 'border-[var(--pl-accent)]/75 dark:border-yellow-400/75 shadow-[0_0_18px_-4px_rgba(var(--pl-accent-rgb),0.4)]'
                            : 'border-sky-600/70 dark:border-cyan-400/75 shadow-[0_0_18px_-4px_rgba(var(--pl-glow-rgb),0.4)]'
                          : 'border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleQrMode(true)}
                        aria-pressed={includeQr}
                        className={`relative z-10 px-2.5 py-1 rounded-lg flex items-center justify-center gap-1.5 text-left transition-colors cursor-pointer whitespace-nowrap ${
                          includeQr ? 'text-[var(--pl-cta-text)]' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        {includeQr && (
                          <motion.span
                            layoutId="studioQrNeonThumb"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))]"
                          />
                        )}
                        <QrCode className="w-3.5 h-3.5 relative z-10 shrink-0 stroke-[2.25]" />
                        <span className="relative z-10 text-[11px] font-extrabold">Cover + QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleQrMode(false)}
                        aria-pressed={!includeQr}
                        className={`relative z-10 px-2.5 py-1 rounded-lg flex items-center justify-center gap-1.5 text-left transition-colors cursor-pointer whitespace-nowrap ${
                          !includeQr ? 'text-[var(--pl-cta-text)]' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        {!includeQr && (
                          <motion.span
                            layoutId="studioQrNeonThumb"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] dark:bg-cyan-400 dark:bg-none"
                          />
                        )}
                        <ShieldCheck className="w-3.5 h-3.5 relative z-10 shrink-0 stroke-[2.25]" />
                        <span className="relative z-10 text-[11px] font-extrabold">Clean Cover</span>
                      </button>
                    </div>
                  </div>
                </div>
              </LiquidCrystalCard>

              {/* Mobile Collapsible Preview Toggle & Doc Scale Strip (< md) */}
              {studioSection === 'editor' && (
                <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setMobilePreviewOpen((p) => !p)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-700 dark:text-yellow-400" />
                    <span>{mobilePreviewOpen ? 'Hide Cover Preview' : 'Show Live Preview'}</span>
                    {mobilePreviewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-semibold">Scale</span>
                    <input
                      type="range"
                      min={50}
                      max={125}
                      step={1}
                      aria-label="Mobile document page scale"
                      value={coverData.documentPageScale ?? 100}
                      onChange={(e) =>
                        setCoverData((prev) => ({ ...prev, documentPageScale: Number(e.target.value) }))
                      }
                      className="w-20 h-1.5 accent-[var(--pl-accent)] dark:accent-yellow-400 cursor-pointer"
                    />
                    <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-yellow-400 tabular-nums">
                      {coverData.documentPageScale ?? 100}%
                    </span>
                  </div>
                </div>
              )}

              {/* 3-COLUMN LOCKED-HEIGHT WORKBENCH: CONSTANT LEFT PREVIEW · CENTER PANEL WITH FIXED FOOTER · RIGHT INSPECTOR */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch lg:h-[calc(100vh-8.75rem)] lg:min-h-[540px]">
                {/* 1. VERY LEFT CONSTANT COVER PREVIEW (Always pinned left on md+; collapsible on mobile) */}
                <div
                  data-tour-target="studio-preview"
                  className={`${
                    mobilePreviewOpen ? 'block h-[420px]' : 'hidden md:block'
                  } md:col-span-5 lg:col-span-4 md:h-[calc(100vh-10rem)] lg:h-full min-h-0 min-w-0`}
                >
                  <div className="h-full min-h-0 flex flex-col p-3 bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
                    <CoverPreview
                      coverData={coverData}
                      currentDoc={currentDoc}
                      driveLink={includeQr ? uploadResult?.webViewLink || null : null}
                      qrDataUrl={includeQr ? qrDataUrl : null}
                      onPrint={handlePrint}
                      onFullPreview={handlePreviewMergedPdf}
                      isPreparingFullPreview={isPreparingPreview}
                      isDriveUploaded={includeQr && !!uploadResult}
                    />
                  </div>
                </div>

                {/* 2. CENTER WORKSPACE (Fixed-position Back/Next bar pinned at bottom on md+ with smooth directional slide-in between sections) */}
                <div className="md:col-span-7 lg:col-span-5 lg:h-full flex flex-col min-h-0 min-w-0 overflow-hidden">
                  <AnimatePresence mode="wait" custom={studioSlideDir}>
                    <motion.div
                      key={studioSection}
                      custom={studioSlideDir}
                      initial={{ opacity: 0, x: studioSlideDir * 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: studioSlideDir * -16 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex-1 flex flex-col min-h-0 min-w-0"
                    >
                      {studioSection === 'scan-crop' ? (
                        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5">
                          <StudioScanCropPanel
                            onApplyPdfToCoverStudio={handleReceivePdfFromTools}
                            onPreviewDocument={setPreviewTarget}
                            onTaskComplete={triggerTaskTypewriter}
                            onBackToEditor={() => selectStudioSection('editor')}
                          />
                        </div>
                      ) : studioSection === 'batch' ? (
                        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5">
                          <BatchProcessingPanel
                            batchItems={batchItems}
                            setBatchItems={setBatchItems}
                            currentCoverTheme={coverData}
                            accessToken={token}
                            userEmail={user?.email || undefined}
                            onRequireAuth={(needsConsent) => {
                              if (needsConsent) setForceConsent(true);
                              setAuthGateAction(
                                needsConsent
                                  ? 'Reconnect Google Drive With File Permissions'
                                  : 'Upload Batch Documents to Google Drive'
                              );
                              setIsAuthGateOpen(true);
                            }}
                            onShareDoc={(title, link, qrUrl) => {
                              setEmailShareTarget({ title, link, qrUrl });
                              setIsEmailModalOpen(true);
                            }}
                          />
                        </div>
                      ) : studioSection === 'library' ? (
                        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5">
                          <HistoryDashboard
                            documents={savedDocs}
                            onSelectDocument={handleSelectFromLibrary}
                            onRefresh={refreshDocuments}
                            onOpenEmailShare={(doc) => {
                              setEmailShareTarget({
                                title: doc.title,
                                link: doc.driveLink,
                              });
                              setIsEmailModalOpen(true);
                            }}
                            onPreviewDoc={(doc) =>
                              setPreviewTarget({
                                title: doc.title || doc.fileName,
                                fileName: doc.fileName,
                                driveUrl: doc.driveLink,
                                subtitle: 'Google Drive Document Preview',
                              })
                            }
                          />
                        </div>
                      ) : (
                        <LiquidCrystalCard
                          accentGlow="yellow"
                          className="flex-1 flex flex-col min-h-0 md:h-[calc(100vh-10rem)] lg:h-full rounded-2xl overflow-hidden"
                        >
                      {/* Pinned Top Step Rail + Auto-Save Status */}
                      <div className="shrink-0 px-3.5 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 space-y-2">
                        <div className={`grid gap-1.5 ${STEPS_NAV.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
                          {STEPS_NAV.map((step) => {
                            const isActive = currentStep === step.num;
                            const isCompleted =
                              currentStep > step.num ||
                              (step.num === 1 && !!currentDoc) ||
                              (step.num === 4 && !!uploadResult);
                            const canOpen = step.num === 1 || !!currentDoc || isCompleted;

                            return (
                              <button
                                key={step.num}
                                type="button"
                                disabled={!canOpen}
                                onClick={() => setCurrentStep(step.num)}
                                aria-current={isActive ? 'step' : undefined}
                                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ${
                                  isActive
                                    ? 'border-[var(--pl-cta-border)] bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold shadow-xs'
                                    : isCompleted
                                    ? 'border-zinc-300 dark:border-zinc-700 bg-[var(--pl-surface)] text-zinc-900 dark:text-yellow-300 font-semibold hover:border-[var(--pl-accent)]'
                                    : 'border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 text-zinc-400 dark:text-zinc-500 opacity-60'
                                }`}
                              >
                                <span
                                  className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums ${
                                    isActive
                                      ? 'bg-black/20 dark:bg-black text-white dark:text-yellow-400'
                                      : isCompleted
                                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                                  }`}
                                >
                                  {isCompleted && !isActive ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : (
                                    step.displayNum
                                  )}
                                </span>
                                <span className="hidden sm:inline truncate">{step.short}</span>
                              </button>
                            );
                          })}
                        </div>

                        {(lastAutoSavedAt || hasDraftEdits) && (
                          <div className="flex items-center justify-between gap-2 text-[11px] px-0.5">
                            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                              <Save className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="tabular-nums">
                                Draft saved locally
                                {lastAutoSavedAt
                                  ? ` · ${new Date(lastAutoSavedAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`
                                  : ''}
                              </span>
                            </span>
                            {hasDraftEdits && (
                              <button
                                type="button"
                                onClick={handleDiscardCoverDraft}
                                className="font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 cursor-pointer"
                              >
                                Reset draft
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Scrollable Step Canvas — Zero Layout Shift on Back/Next */}
                      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`studio-step-${currentStep}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            className="space-y-4"
                          >
                            {currentStep === 1 && (
                              <div data-tour-target="studio-upload">
                                <DocumentUploader
                                  currentDoc={currentDoc}
                                  onDocumentParsed={handleDocumentParsed}
                                  isLoading={isLoadingDoc}
                                  setIsLoading={setIsLoadingDoc}
                                  onSwitchToBatch={() => selectStudioSection('batch')}
                                  onPreviewDoc={
                                    currentDoc
                                      ? () =>
                                          setPreviewTarget({
                                            title: currentDoc.name,
                                            fileName: currentDoc.name,
                                            blob: currentDoc.file,
                                            subtitle: `${currentDoc.pageCount || 1} page(s) · Source Upload`,
                                          })
                                      : undefined
                                  }
                                />
                              </div>
                            )}

                            {currentStep === 2 && (
                              <div className="space-y-3">
                                {/* Clean Sub-Tab Switcher so Step 2 Never Requires Giant Scrolling */}
                                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                                  <button
                                    type="button"
                                    onClick={() => setStep2Tab('themes')}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                      step2Tab === 'themes'
                                        ? 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] shadow-xs'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                                    }`}
                                  >
                                    <Layout className="w-3.5 h-3.5" />
                                    <span>Cover Themes ({COVER_THEMES.length})</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setStep2Tab('ai-art')}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                      step2Tab === 'ai-art'
                                        ? 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] shadow-xs'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                                    }`}
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>AI Art Backgrounds</span>
                                  </button>
                                </div>

                                {step2Tab === 'themes' ? (
                                  <ThemeSelector
                                    selectedThemeId={coverData.themeId}
                                    onSelectTheme={handleSelectTheme}
                                  />
                                ) : (
                                  <CoverSuggestionsCard
                                    currentDoc={currentDoc}
                                    coverData={coverData}
                                    suggestions={coverSuggestions}
                                    setSuggestions={setCoverSuggestions}
                                    suggestionCount={suggestionCount}
                                    setSuggestionCount={setSuggestionCount}
                                    engine={suggestionEngine}
                                    setEngine={setSuggestionEngine}
                                    isLoading={isGeneratingSuggestions}
                                    errorMsg={suggestionsError}
                                    detectedTopic={detectedSuggestionTopic}
                                    onGenerate={(opts) => handleGenerateCoverSuggestions(opts)}
                                    onApplySuggestion={handleApplyCoverSuggestion}
                                    onClearBackground={handleClearCoverBackground}
                                    onChangeOpacity={(opacity) =>
                                      setCoverData((prev) => ({ ...prev, backgroundImageOpacity: opacity }))
                                    }
                                  />
                                )}
                              </div>
                            )}

                            {currentStep === 3 && (
                              <ColorCarousel
                                coverData={coverData}
                                onChange={setCoverData}
                                brandKits={brandKits}
                                onSaveBrandKit={handleSaveBrandKit}
                                onApplyBrandKit={handleApplyBrandKit}
                                onDeleteBrandKit={handleDeleteBrandKit}
                              />
                            )}

                            {currentStep === 4 && includeQr && (
                              <DriveSyncPanel
                                uploadResult={uploadResult}
                                isUploading={isUploading}
                                uploadProgress={uploadProgress}
                                uploadError={uploadError}
                                onUploadClick={handleUploadToDrive}
                                canUpload={!!currentDoc && !isUploading}
                                needsAuth={!token}
                                onLoginClick={() => {
                                  setAuthGateAction(
                                    forceConsent
                                      ? 'Reconnect Google Drive (Allow Drive File Permission)'
                                      : 'Connect Google Drive to Upload Document'
                                  );
                                  setIsAuthGateOpen(true);
                                }}
                                onManualLinkSubmit={handleManualLinkSubmit}
                                onDownloadMergedPdf={handleDirectDownloadMergedPdf}
                                isDownloadingMerged={isDownloading}
                                totalPages={totalPages}
                                uploadMode={uploadMode}
                                onUploadModeChange={setUploadMode}
                                tokenExpiry={tokenExpiry}
                                qrDataUrl={qrDataUrl}
                              />
                            )}

                            {currentStep === 5 && (
                              <div className="bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-4 shadow-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-amber-700 dark:text-yellow-400 font-mono">
                                      Step {currentDisplayStep}
                                    </span>
                                    <span aria-hidden="true" className="text-zinc-400">·</span>
                                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                                      Download &amp; Share Your PDF
                                    </h3>
                                  </div>
                                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 tabular-nums">
                                    {includeQr
                                      ? `Your QR cover attaches cleanly to Page 1 of your file (${totalPages} pages total).`
                                      : `Your clean cover attaches to Page 1 of your file (${totalPages} pages total · No sign-in required).`}
                                  </p>
                                </div>

                                {downloadSuccessMsg && (
                                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    <span>{downloadSuccessMsg}</span>
                                  </div>
                                )}

                                {downloadErrorMsg && (
                                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{downloadErrorMsg}</span>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <TypewriterButton
                                    alwaysExpanded
                                    onClick={handleDirectDownloadMergedPdf}
                                    disabled={isDownloading}
                                    loading={isDownloading}
                                    variant="primary"
                                    size="lg"
                                    className="w-full"
                                    icon={<Download className="w-5 h-5 stroke-[2.5]" />}
                                    text={`Download PDF (${totalPages} Pages)`}
                                  />

                                  <TypewriterButton
                                    alwaysExpanded
                                    onClick={handlePreviewMergedPdf}
                                    disabled={isPreparingPreview || (includeQr && !qrDataUrl)}
                                    loading={isPreparingPreview}
                                    variant="dark"
                                    size="lg"
                                    className="w-full"
                                    icon={<Eye className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
                                    text={`Preview All ${totalPages} Pages`}
                                  />
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                  <TypewriterButton
                                    lingerMs={6500}
                                    onClick={handlePrint}
                                    variant="dark"
                                    icon={<Printer className="w-4 h-4 text-amber-700 dark:text-yellow-400" />}
                                    text="Print Packet"
                                  />

                                  {includeQr && (
                                    <TypewriterButton
                                      lingerMs={6500}
                                      onClick={() => {
                                        setEmailShareTarget({
                                          title: coverData.title || currentDoc?.name || 'Document',
                                          link: uploadResult?.webViewLink || 'https://drive.google.com',
                                          qrUrl: qrDataUrl || undefined,
                                        });
                                        setIsEmailModalOpen(true);
                                      }}
                                      variant="dark"
                                      icon={<Mail className="w-4 h-4 text-amber-700 dark:text-yellow-400" />}
                                      text="Share Email"
                                    />
                                  )}

                                  <TypewriterButton
                                    lingerMs={6500}
                                    onClick={() => setIsExportModalOpen(true)}
                                    variant="dark"
                                    icon={<Layers className="w-4 h-4 text-amber-700 dark:text-yellow-400" />}
                                    text="More Formats"
                                  />
                                </div>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      {/* CONSTANT FIXED-POSITION BACK / NEXT FOOTER BAR ON DESKTOP (Exact same vertical coordinate across all steps) */}
                      {(footer.back || footer.next) && (
                        <div className="hidden md:flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 px-4 py-3">
                          {footer.back ? (
                            <LiquidCrystalButton
                              variant="neutral"
                              onClick={footer.back.onClick}
                              disabled={footer.back.disabled}
                              className="px-3.5 py-2 rounded-xl text-xs whitespace-nowrap"
                            >
                              {footer.back.icon}
                              <span>{footer.back.text}</span>
                            </LiquidCrystalButton>
                          ) : (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {currentDoc ? 'File loaded — click Next to continue' : 'Pick a file to unlock next steps'}
                            </span>
                          )}

                          {footer.next && (
                            <LiquidCrystalButton
                              variant={footer.next.variant === 'primary' ? 'primary' : 'secondary'}
                              onClick={footer.next.onClick}
                              disabled={footer.next.disabled}
                              className="px-4 py-2 rounded-xl text-xs whitespace-nowrap"
                            >
                              <span>{footer.next.text}</span>
                              {footer.next.icon}
                            </LiquidCrystalButton>
                          )}
                        </div>
                      )}
                    </LiquidCrystalCard>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* 3. RIGHT SIDEBAR INSPECTOR (Doc Page Scale + Steps Overview + Packet Summary) */}
                <aside
                  data-tour-target="studio-sidebar"
                  aria-label="Cover Studio inspector"
                  className="hidden lg:flex lg:col-span-3 lg:h-full lg:flex-col overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[var(--pl-surface)]/95 backdrop-blur-md p-4 space-y-4 min-w-0"
                >
                  {/* Document Pages Relative Scale Control */}
                  {studioSection === 'editor' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <label
                          htmlFor="studio-doc-scale-slider"
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-700 dark:text-zinc-300"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-amber-700 dark:text-yellow-400" />
                          <span>Doc Page Scale</span>
                        </label>
                        <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-yellow-400 tabular-nums">
                          {coverData.documentPageScale ?? 100}%
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <input
                          id="studio-doc-scale-slider"
                          type="range"
                          min={50}
                          max={125}
                          step={1}
                          value={coverData.documentPageScale ?? 100}
                          onChange={(e) =>
                            setCoverData((prev) => ({
                              ...prev,
                              documentPageScale: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 accent-[var(--pl-accent)] dark:accent-yellow-400 cursor-pointer"
                        />

                        <div className="flex items-center justify-between gap-1">
                          {[75, 90, 100, 115].map((preset) => {
                            const active = (coverData.documentPageScale ?? 100) === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() =>
                                  setCoverData((prev) => ({ ...prev, documentPageScale: preset }))
                                }
                                className={`flex-1 py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                                  active
                                    ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)]'
                                    : 'bg-zinc-200/70 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                              >
                                {preset === 100 ? 'Fit' : `${preset}%`}
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                          Scales Pages 2+ relative to {coverData.paperSize.toUpperCase()} cover
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cover Editor Steps List */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                        Cover Steps
                      </span>
                      <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-yellow-400 tabular-nums">
                        {currentDisplayStep} / {totalStudioSteps}
                      </span>
                    </div>

                    <nav className="space-y-1.5" aria-label="Cover Studio steps">
                      {STEPS_NAV.map((step) => {
                        const Icon = step.icon;
                        const isActive = studioSection === 'editor' && currentStep === step.num;
                        const isCompleted =
                          currentStep > step.num ||
                          (step.num === 1 && !!currentDoc) ||
                          (step.num === 4 && !!uploadResult);
                        const canOpen = step.num === 1 || !!currentDoc || isCompleted;

                        return (
                          <button
                            key={step.num}
                            type="button"
                            disabled={!canOpen}
                            onClick={() => {
                              selectStudioSection('editor');
                              setCurrentStep(step.num);
                            }}
                            aria-current={isActive ? 'step' : undefined}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-all duration-150 cursor-pointer disabled:cursor-not-allowed ${
                              isActive
                                ? 'border-[var(--pl-cta-border)] bg-[var(--pl-accent)]/16 text-zinc-950 dark:text-yellow-200 font-bold'
                                : isCompleted
                                ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 hover:border-[var(--pl-accent)]/60'
                                : 'border-zinc-200/80 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/50 text-zinc-400 dark:text-zinc-500 opacity-65'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold shrink-0 ${
                                isActive
                                  ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)]'
                                  : isCompleted
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {isCompleted && !isActive ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Icon className="w-3.5 h-3.5" />
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold leading-tight truncate">
                                {step.displayNum}. {step.label}
                              </p>
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                {step.num === 1 && (currentDoc ? currentDoc.name : 'Choose PDF or Word')}
                                {step.num === 2 && coverData.themeId}
                                {step.num === 3 && `${coverData.paperSize.toUpperCase()} · ${coverData.font}`}
                                {step.num === 4 && (uploadResult ? 'Drive QR ready' : 'Save & create QR')}
                                {step.num === 5 && `${totalPages} ${totalPages === 1 ? 'page' : 'pages'} ready`}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </nav>
                  </div>

                  {/* Compact Output Summary */}
                  <div
                    data-tour-target="studio-sidebar-download"
                    className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2 mt-auto"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400 font-semibold">Output Pages</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                        {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400 font-semibold">Page Fit</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                        {coverData.documentPageScale ?? 100}% · {coverData.paperSize.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400 font-semibold">QR &amp; Drive</span>
                      <span
                        className={`font-semibold ${
                          !includeQr
                            ? 'text-cyan-700 dark:text-cyan-400'
                            : uploadResult
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {!includeQr ? 'No Sign-In' : uploadResult ? 'Verified Link' : 'Pending Upload'}
                      </span>
                    </div>
                  </div>
                </aside>
              </div>

              {/* Mobile Constant Fixed-Bottom Next / Back Bar (< md, compact 56px height <= 10% mobile viewport) */}
              {studioSection === 'editor' && (footer.back || footer.next) && (
                <div className="no-print md:hidden fixed inset-x-0 bottom-0 z-30 h-14 px-3 bg-[var(--pl-surface)]/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.18)]">
                  {footer.back ? (
                    <LiquidCrystalButton
                      variant="neutral"
                      onClick={footer.back.onClick}
                      disabled={footer.back.disabled}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs whitespace-nowrap"
                    >
                      {footer.back.icon}
                      <span>Back</span>
                    </LiquidCrystalButton>
                  ) : (
                    <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 truncate">
                      {currentDoc ? `Step 1/${totalStudioSteps} ready` : 'Pick a file first'}
                    </span>
                  )}

                  {footer.next && (
                    <LiquidCrystalButton
                      variant={footer.next.variant === 'primary' ? 'primary' : 'secondary'}
                      onClick={footer.next.onClick}
                      disabled={footer.next.disabled}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl text-xs whitespace-nowrap ml-auto"
                    >
                      <span>{footer.next.text}</span>
                      {footer.next.icon}
                    </LiquidCrystalButton>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentDoc={currentDoc}
        coverData={coverData}
        qrDataUrl={qrDataUrl}
        driveLink={uploadResult?.webViewLink || null}
        onPrint={handlePrint}
      />

      <EmailShareModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        user={user}
        documentTitle={emailShareTarget?.title || coverData.title || currentDoc?.name || 'Document'}
        driveLink={emailShareTarget?.link || uploadResult?.webViewLink || null}
        qrDataUrl={emailShareTarget?.qrUrl || qrDataUrl}
        onEmailSentSuccess={() => {
          refreshDocuments();
        }}
      />

      <PaperLinkChatbot
        activeView={activeView}
        onNavigateView={navigateView}
        onOpenPdfTool={(tool) => {
          setActivePdfTool(tool);
          navigateView('tools');
        }}
        onOpenImageTool={(tool) => {
          setActiveImageTool(tool);
          navigateView('image-tools');
        }}
        onOpenDocInCoverStudio={handleReceivePdfFromTools}
        onUseImageAsCoverLogo={(dataUrl) => {
          setCoverData((prev) => ({ ...prev, logoUrl: dataUrl }));
          selectStudioSection('editor');
          navigateView('studio');
          setCurrentStep(3);
        }}
        onPreviewDocument={setPreviewTarget}
        neonGlowMode={neonGlowMode}
        defaultSpeedMode={aiDefaultSpeed}
        onSpeedModeChange={setAiDefaultSpeed}
        isMinimized={isChatbotMinimized}
        onMinimizeChange={setIsChatbotMinimized}
        soundEnabled={aiSoundEnabled}
        onSoundEnabledChange={setAiSoundEnabled}
        showMiniRobot={showMiniRobot}
        onOpenFeedback={() => {
          setSettingsInitialTab('feedback');
          setIsSettingsOpen(true);
        }}
      />
      </div>
    </MotionConfig>
  );
}
