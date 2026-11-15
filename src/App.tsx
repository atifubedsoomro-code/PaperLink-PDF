import React, { useEffect, useState, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
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
} from './firebase';
import { Navbar, AppView } from './components/Navbar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LegalPagesView } from './components/LegalPagesView';
import { LandingPage } from './components/LandingPage';
import { DocumentUploader } from './components/DocumentUploader';
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
import { AuthGateModal } from './components/AuthGateModal';
import { SettingsModal, ThemeMode, TextSizePreset } from './components/SettingsModal';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { COVER_THEMES } from './constants/themes';
import { parseUploadedDocument } from './services/documentParser';
import {
  BrandKitPreset,
  CoverData,
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
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5;

interface FooterAction {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'dark' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

const STUDIO_TOUR_SEEN_KEY = 'paperlink_studio_tour_seen_v1';

function readInitialView(): AppView {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.toLowerCase();
  if (path === '/privacy' || path === '/privacy-policy') return 'privacy';
  if (path === '/terms' || path === '/terms-of-service') return 'terms';
  return 'home';
}

function readInitialThemeMode(): ThemeMode {
  try {
    const val = localStorage.getItem('paperlink_theme_mode') || localStorage.getItem('qrdrive_theme_mode');
    return val === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<TokenExpiryInfo>(() => getTokenExpiryInfo());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Display & Workspace Preferences
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [textSize, setTextSize] = useState<TextSizePreset>(readInitialTextSize);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  // Tracks first-time entry into Cover Studio so spotlight tutorial triggers only there
  const studioTourCheckedRef = useRef(false);

  // Navigation State: supports /privacy & /terms direct routes as well as SPA views
  const [activeView, setActiveView] = useState<AppView>(readInitialView);
  const [activePdfTool, setActivePdfTool] = useState<PdfToolTab>('pdf-to-word');
  const [activeImageTool, setActiveImageTool] = useState<ImageToolTab>('bg-remove');

  // Linear 5-Step Cover Studio Workflow
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Full-screen auto-hiding typewriter feedback (4-6s) across login / logout / upload / every tool task
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

  const triggerTaskTypewriter = useCallback(
    (info: { headline: string; subtext: string; statusLabel?: string }) => {
      setTypewriterConfig({
        isOpen: true,
        mode: 'task-complete',
        headline: info.headline,
        subtext: info.subtext,
        statusLabel: info.statusLabel,
        durationMs: 7000,
      });
    },
    []
  );

  // Google Sign-In modal (only triggered by user intent, never on arrival)
  const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);
  const [authGateAction, setAuthGateAction] = useState('Continue with Google Drive');
  const [forceConsent, setForceConsent] = useState(false);

  // Single Document state
  const [currentDoc, setCurrentDoc] = useState<UploadedDocInfo | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  const initialTheme = COVER_THEMES[0];

  const [coverData, setCoverData] = useState<CoverData>({
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
    accentColor: '#facc15',
    titleColor: undefined,
    subtitleColor: undefined,
    textColor: undefined,
    backgroundImageUrl: undefined,
    backgroundImageOpacity: 0.35,
    backgroundImageStyle: 'full',
    logoUrl: undefined,
    logoSize: 'medium',
    logoPosition: 'top-left',
    font: 'inter',
    paperSize: 'a4',
    qrPosition: 'bottom-right',
    qrColor: '#000000',
    qrBgColor: '#ffffff',
    showLogoInQR: false,
    version: '',
    showSyncTimestamp: false,
    expiryNote: '',
    stampPageNumbers: false,
    watermarkText: '',
    watermarkOpacity: 0.1,
  });

  // Google Drive & QR state
  const [uploadMode, setUploadMode] = useState<DriveUploadMode>('source');
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

  // Route switcher syncing /privacy & /terms URLs
  const navigateView = useCallback((view: AppView) => {
    setAuthErrorMsg(null);
    setActiveView(view);
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
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(readInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync Dark / Light mode to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', themeMode === 'dark');
    root.style.colorScheme = themeMode;
    try {
      localStorage.setItem('paperlink_theme_mode', themeMode);
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

  // First-time Cover Studio contextual spotlight tour (only runs inside Cover Studio)
  useEffect(() => {
    if (activeView !== 'studio' || typewriterConfig.isOpen || studioTourCheckedRef.current) return;
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
  }, [activeView, typewriterConfig.isOpen]);

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

        setTypewriterConfig({
          isOpen: true,
          mode: 'login',
          durationMs: 6500,
        });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthErrorMsg(err?.message || 'Sign-in could not complete. Enable popups and try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setTokenExpiry(getTokenExpiryInfo());
    setTypewriterConfig({
      isOpen: true,
      mode: 'logout',
      durationMs: 6500,
    });
  };

  const handleTypewriterComplete = () => {
    setTypewriterConfig((prev) => ({ ...prev, isOpen: false }));
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

      setTypewriterConfig({
        isOpen: true,
        mode: 'upload-success',
        targetUrl: result.webViewLink,
        durationMs: 7500,
      });

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

    setTypewriterConfig({
      isOpen: true,
      mode: 'upload-success',
      targetUrl: link,
      durationMs: 7500,
    });

    setCurrentStep(5);
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
  };

  const handleReceivePdfFromTools = async (file: File) => {
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

  const handleDirectDownloadMergedPdf = async () => {
    if (!qrDataUrl) {
      setDownloadErrorMsg('QR code is still preparing. Try again in a moment.');
      return;
    }

    setIsDownloading(true);
    setDownloadErrorMsg(null);
    setDownloadSuccessMsg(null);

    try {
      let pdfBytes: Uint8Array;

      if (currentDoc?.pdfArrayBuffer) {
        pdfBytes = await mergeCoverWithPdf(currentDoc.pdfArrayBuffer, coverData, qrDataUrl);
      } else {
        const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl);
        pdfBytes = await coverPdf.save();
      }

      const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
      const blob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFilename = (coverData.title || currentDoc?.name || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeFilename}_with_QR_Cover.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      setDownloadSuccessMsg('Document with QR Cover downloaded successfully.');
      setTimeout(() => setDownloadSuccessMsg(null), 3500);
      triggerTaskTypewriter({
        headline: 'Cover + Document PDF Ready',
        subtext: `${safeFilename}_with_QR_Cover.pdf (${totalPages} pages) downloaded successfully.`,
        statusLabel: 'Cover Studio Export Complete',
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadErrorMsg(err.message || 'Failed to generate PDF');
    } finally {
      setIsDownloading(false);
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
    navigateView('studio');
    setCurrentStep(5);
  };

  const handleStartOver = () => {
    setCurrentDoc(null);
    setUploadResult(null);
    setUploadError(null);
    setCoverData((prev) => ({
      ...prev,
      title: '',
      subtitle: '',
      organization: '',
      documentId: '',
      summary: '',
    }));
    setCurrentStep(1);
  };

  const originalPagesCount =
    currentDoc?.pageCount || (currentDoc?.renderedPagePreviews?.length ?? (currentDoc ? 1 : 0));
  const totalPages = 1 + (currentDoc ? originalPagesCount : 0);

  const STEPS_NAV = [
    { num: 1, label: 'Upload File', short: 'Upload', icon: UploadCloud },
    { num: 2, label: 'Choose Theme', short: 'Theme', icon: Layout },
    { num: 3, label: 'Customize', short: 'Style', icon: Palette },
    { num: 4, label: 'Drive & QR', short: 'Drive QR', icon: HardDrive },
    { num: 5, label: 'Export PDF', short: 'Export', icon: FileCheck2 },
  ];

  const goTo = (step: Step) => () => setCurrentStep(step);
  const nextIcon = <ArrowRight className="w-4 h-4 stroke-[2.5]" />;
  const backIcon = <ArrowLeft className="w-4 h-4" />;

  const footer: { back?: FooterAction; next?: FooterAction } = (() => {
    switch (currentStep) {
      case 1:
        return {
          next: {
            text: 'Step 2: Choose Theme',
            icon: nextIcon,
            onClick: goTo(2),
            variant: 'primary',
            disabled: !currentDoc,
          },
        };
      case 2:
        return {
          back: { text: 'Back: Upload', icon: backIcon, onClick: goTo(1), variant: 'dark' },
          next: { text: 'Step 3: Customize', icon: nextIcon, onClick: goTo(3), variant: 'primary' },
        };
      case 3:
        return {
          back: { text: 'Back: Theme', icon: backIcon, onClick: goTo(2), variant: 'dark' },
          next: { text: 'Step 4: Drive QR', icon: nextIcon, onClick: goTo(4), variant: 'primary' },
        };
      case 4:
        return {
          back: { text: 'Back: Customize', icon: backIcon, onClick: goTo(3), variant: 'dark' },
          next: uploadResult
            ? { text: 'Step 5: Export', icon: nextIcon, onClick: goTo(5), variant: 'primary' }
            : {
                text: isUploading ? 'Uploading...' : 'Upload & Bind QR',
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
          back: { text: 'Edit Cover Design', icon: backIcon, onClick: goTo(3), variant: 'dark' },
          next: {
            text: 'New Document',
            icon: <RotateCcw className="w-3.5 h-3.5" />,
            onClick: handleStartOver,
            variant: 'secondary',
          },
        };
    }
  })();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-[#09090b] dark:text-white flex flex-col font-sans antialiased selection:bg-yellow-400 selection:text-black transition-colors duration-200">
      {typewriterConfig.isOpen && (
        <TypewriterWelcome
          mode={typewriterConfig.mode}
          headline={typewriterConfig.headline}
          subtext={typewriterConfig.subtext}
          statusLabel={typewriterConfig.statusLabel}
          targetUrl={typewriterConfig.targetUrl}
          durationMs={typewriterConfig.durationMs ?? 7000}
          onComplete={handleTypewriterComplete}
        />
      )}

      <AuthGateModal
        isOpen={isAuthGateOpen}
        onClose={() => setIsAuthGateOpen(false)}
        onLogin={handleLogin}
        isLoggingIn={isLoggingIn}
        actionTitle={authGateAction}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onChangeThemeMode={setThemeMode}
        textSize={textSize}
        onChangeTextSize={setTextSize}
        onStartTutorial={() => {
          setIsSettingsOpen(false);
          navigateView('studio');
          setCurrentStep(1);
          setTimeout(() => setIsTutorialOpen(true), 120);
        }}
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
        onOpenSettings={() => setIsSettingsOpen(true)}
        isLoggingIn={isLoggingIn}
      />

      <OfflineIndicator />

      {authErrorMsg && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-200 text-xs flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
              {authErrorMsg}
            </span>
            <button
              type="button"
              onClick={() => setAuthErrorMsg(null)}
              className="text-red-700 dark:text-red-300 hover:text-red-950 dark:hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
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
          />
        </main>
      ) : (
        <main
          className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 ${
            activeView === 'studio'
              ? 'max-w-[1600px] lg:pl-8 lg:pr-[19.5rem] pb-24 lg:pb-10'
              : 'max-w-7xl lg:px-8 pb-12'
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
            />
          ) : activeView === 'image-tools' ? (
            <ImageToolsPanel
              activeTool={activeImageTool}
              onToolChange={setActiveImageTool}
              onUseAsCoverLogo={(dataUrl) => {
                setCoverData((prev) => ({ ...prev, logoUrl: dataUrl }));
                navigateView('studio');
                setCurrentStep(3);
              }}
              onTaskComplete={triggerTaskTypewriter}
            />
          ) : activeView === 'batch' ? (
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
          ) : activeView === 'library' ? (
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
            />
          ) : (
            /* COVER STUDIO 2-COLUMN WORKFLOW (WITH FIXED RIGHT STEPS SIDEBAR ON DESKTOP) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Editor Column */}
              <div className="lg:col-span-6 space-y-5 min-w-0">
                {/* Mobile Step Progress Bar (Desktop uses Fixed Right Sidebar) */}
                <div
                  data-tour-target="studio-steps-mobile"
                  className="lg:hidden bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2.5"
                >
                  <div className="grid grid-cols-5 gap-1.5">
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
                          onClick={() => setCurrentStep(step.num as Step)}
                          aria-current={isActive ? 'step' : undefined}
                          className={`flex items-center justify-center sm:justify-start gap-2 px-2 py-2 rounded-xl border transition-colors text-left cursor-pointer disabled:cursor-not-allowed ${
                            isActive
                              ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                              : isCompleted
                              ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-amber-700 dark:text-yellow-300'
                              : 'border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 text-zinc-400 dark:text-zinc-500 opacity-60'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 tabular-nums ${
                              isActive
                                ? 'bg-black text-yellow-400'
                                : isCompleted
                                ? 'bg-yellow-400/20 text-amber-700 dark:text-yellow-400'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {isCompleted && !isActive ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                            ) : (
                              step.num
                            )}
                          </span>
                          <span className="hidden sm:inline text-xs font-semibold truncate">
                            {step.short}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {currentStep === 1 && (
                  <div data-tour-target="studio-upload">
                    <DocumentUploader
                      currentDoc={currentDoc}
                      onDocumentParsed={handleDocumentParsed}
                      isLoading={isLoadingDoc}
                      setIsLoading={setIsLoadingDoc}
                      onSwitchToBatch={() => navigateView('batch')}
                    />
                  </div>
                )}

                {currentStep === 2 && (
                  <ThemeSelector selectedThemeId={coverData.themeId} onSelectTheme={handleSelectTheme} />
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

                {currentStep === 4 && (
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
                  <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                        05. Download Combined PDF & Distribute
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
                        Page 1 includes your QR-linked cover prepended to all original document pages ({totalPages} pages total).
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

                    <TypewriterButton
                      onClick={handleDirectDownloadMergedPdf}
                      disabled={isDownloading}
                      loading={isDownloading}
                      variant="primary"
                      size="lg"
                      className="w-full"
                      icon={<Download className="w-5 h-5 stroke-[2.5]" />}
                      text={`Download Updated PDF (${totalPages} Pages)`}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <TypewriterButton
                        onClick={handlePrint}
                        variant="dark"
                        icon={<Printer className="w-4 h-4 text-amber-600 dark:text-yellow-400" />}
                        text="Print"
                      />

                      <TypewriterButton
                        onClick={() => {
                          setEmailShareTarget({
                            title: coverData.title || currentDoc?.name || 'Document',
                            link: uploadResult?.webViewLink || 'https://drive.google.com',
                            qrUrl: qrDataUrl || undefined,
                          });
                          setIsEmailModalOpen(true);
                        }}
                        variant="dark"
                        icon={<Mail className="w-4 h-4 text-amber-600 dark:text-yellow-400" />}
                        text="Share Email"
                      />

                      <TypewriterButton
                        onClick={() => setIsExportModalOpen(true)}
                        variant="dark"
                        icon={<Layers className="w-4 h-4 text-amber-600 dark:text-yellow-400" />}
                        text="Export Options"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Scaled Paper Preview Column */}
              <div
                data-tour-target="studio-preview"
                className="lg:col-span-6 lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)] min-w-0"
              >
                <div className="h-full min-h-0 flex flex-col p-3.5 bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none">
                  <CoverPreview
                    coverData={coverData}
                    currentDoc={currentDoc}
                    driveLink={uploadResult?.webViewLink || null}
                    qrDataUrl={qrDataUrl}
                    onPrint={handlePrint}
                    isDriveUploaded={!!uploadResult}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* FIXED RIGHT-SIDE STEPS SIDEBAR (Desktop lg+ Studio Mode) */}
      {activeView === 'studio' && (
        <aside
          data-tour-target="studio-sidebar"
          aria-label="Cover Studio steps sidebar"
          className="no-print hidden lg:flex lg:flex-col lg:fixed lg:top-16 lg:right-0 lg:bottom-0 lg:w-72 z-30 border-l border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0f]/95 backdrop-blur-md p-4 justify-between gap-4 overflow-y-auto transition-colors"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Studio Steps
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Guided cover workflow
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-yellow-400 tabular-nums">
                {currentStep} / 5
              </span>
            </div>

            <nav className="space-y-2" aria-label="Workflow steps">
              {STEPS_NAV.map((step) => {
                const Icon = step.icon;
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
                    onClick={() => setCurrentStep(step.num as Step)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer disabled:cursor-not-allowed ${
                      isActive
                        ? 'border-yellow-400 bg-yellow-400 text-black font-bold shadow-sm'
                        : isCompleted
                        ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 hover:border-yellow-400/60'
                        : 'border-zinc-200/80 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/60 text-zinc-400 dark:text-zinc-500 opacity-65'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                        isActive
                          ? 'bg-black text-yellow-400'
                          : isCompleted
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {isCompleted && !isActive ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight truncate">
                        0{step.num}. {step.label}
                      </p>
                      <p
                        className={`text-[10px] truncate mt-0.5 ${
                          isActive
                            ? 'text-black/75 font-medium'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {step.num === 1 && (currentDoc ? currentDoc.name : 'Select PDF or Word')}
                        {step.num === 2 && coverData.themeId}
                        {step.num === 3 && `${coverData.paperSize.toUpperCase()} · ${coverData.font}`}
                        {step.num === 4 && (uploadResult ? 'Drive QR bound' : 'Sync & bind link')}
                        {step.num === 5 && `${totalPages} ${totalPages === 1 ? 'page' : 'pages'} ready`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Quick Status & Instant Download Updated PDF Trigger on Drive Upload */}
            <div
              data-tour-target="studio-sidebar-download"
              className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold">Output Pages</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                  {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold">Drive QR</span>
                <span
                  className={`font-semibold ${
                    uploadResult
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {uploadResult ? 'Verified Link' : 'Pending Upload'}
                </span>
              </div>

              {(uploadResult || currentDoc) && (
                <button
                  type="button"
                  onClick={handleDirectDownloadMergedPdf}
                  disabled={isDownloading || !qrDataUrl}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                    uploadResult
                      ? 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-sm'
                      : 'bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white border border-zinc-700'
                  }`}
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                  <span>
                    {isDownloading
                      ? 'Preparing PDF...'
                      : uploadResult
                      ? 'Download Updated PDF'
                      : 'Download Draft PDF'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Sidebar Bottom Step Back / Next Navigation */}
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            {footer.next && (
              <TypewriterButton
                onClick={footer.next.onClick}
                variant={footer.next.variant}
                size="sm"
                className="w-full justify-center"
                icon={footer.next.icon}
                iconPosition={footer.next.icon === nextIcon ? 'right' : 'left'}
                text={footer.next.text}
                disabled={footer.next.disabled}
                loading={footer.next.loading}
              />
            )}
            {footer.back && (
              <TypewriterButton
                onClick={footer.back.onClick}
                variant={footer.back.variant}
                size="sm"
                className="w-full justify-center"
                icon={footer.back.icon}
                text={footer.back.text}
                disabled={footer.back.disabled}
              />
            )}
          </div>
        </aside>
      )}

      {/* Mobile Fixed Back / Next Bar (Hidden on lg+ where Fixed Right Sidebar handles navigation) */}
      {activeView === 'studio' && (
        <div className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
            {footer.back ? (
              <TypewriterButton
                onClick={footer.back.onClick}
                variant={footer.back.variant}
                size="sm"
                icon={footer.back.icon}
                text={footer.back.text}
                disabled={footer.back.disabled}
              />
            ) : (
              <span />
            )}

            <span className="text-xs font-mono text-zinc-500 tabular-nums">
              {currentStep}/5
            </span>

            {footer.next ? (
              <TypewriterButton
                onClick={footer.next.onClick}
                variant={footer.next.variant}
                size="sm"
                icon={footer.next.icon}
                iconPosition={footer.next.icon === nextIcon ? 'right' : 'left'}
                text={footer.next.text}
                disabled={footer.next.disabled}
                loading={footer.next.loading}
              />
            ) : (
              <span />
            )}
          </div>
        </div>
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
    </div>
  );
}
