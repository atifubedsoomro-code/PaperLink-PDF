import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  User as UserIcon,
  CreditCard,
  PenTool,
  Bookmark,
  X,
  Save,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Sparkles,
  Download,
  Plus,
  Copy,
  Check,
  LogOut,
  Camera,
  RotateCcw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { UserBiodataPreset, UserProfileData } from '../types';
import { compressDocumentImageDataUrl } from '../firebase';
import { generateProfileIdCardBlob } from '../services/profileCardService';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  profile: UserProfileData | null;
  isLoading: boolean;
  onSaveProfile: (next: UserProfileData) => Promise<void>;
  onApplyToCoverStudio: (opts: {
    preparedBy?: string;
    organization?: string;
    documentId?: string;
    summary?: string;
    title?: string;
    subtitle?: string;
    signatureUrl?: string;
    signatureLabel?: string;
  }) => void;
}

type ProfileTab = 'biodata' | 'documents' | 'signature' | 'presets';

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  isLoggingIn,
  onLogin,
  onLogout,
  profile,
  isLoading,
  onSaveProfile,
  onApplyToCoverStudio,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('biodata');
  const [draft, setDraft] = useState<UserProfileData | null>(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Preset creation form
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [newPresetSubtitle, setNewPresetSubtitle] = useState('');

  // Signature Canvas Studio
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [sigInkColor, setSigInkColor] = useState('#0f172a');
  const [sigLineWidth, setSigLineWidth] = useState(2.6);
  const [hasCanvasStrokes, setHasCanvasStrokes] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const idFrontInputRef = useRef<HTMLInputElement>(null);
  const idBackInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const sigUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMsg(null);
    setErrorMsg(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'signature') return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = sigInkColor;
    ctx.lineWidth = sigLineWidth;
  }, [isOpen, activeTab, sigInkColor, sigLineWidth]);

  if (!isOpen) return null;

  const updateField = <K extends keyof UserProfileData>(key: K, val: UserProfileData[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: val } : prev));
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const clearCanvasPad = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasCanvasStrokes(false);
  };

  const applyDrawnSignatureToDraft = async () => {
    const canvas = sigCanvasRef.current;
    if (!canvas || !hasCanvasStrokes || !draft) return;
    const raw = canvas.toDataURL('image/png');
    const compressed = await compressDocumentImageDataUrl(raw, {
      maxDim: 680,
      preservePngTransparency: true,
      maxLength: 145_000,
    });
    const nextDraft = { ...draft, signatureUrl: compressed };
    setDraft(nextDraft);
    await persistDraft(nextDraft, 'Signature saved to your cloud profile.');
    clearCanvasPad();
  };

  const persistDraft = async (nextDraft: UserProfileData, customSuccess?: string) => {
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onSaveProfile(nextDraft);
      setStatusMsg(customSuccess || 'Profile saved & synced securely.');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCurrentDraft = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft) return;
    await persistDraft(draft);
  };

  const handleUploadIdOrPassport = async (
    file: File,
    field: 'nationalIdFrontUrl' | 'nationalIdBackUrl' | 'passportImageUrl'
  ) => {
    if (!draft) return;
    setErrorMsg(null);
    try {
      const compressed = await compressDocumentImageDataUrl(file, {
        maxDim: 1080,
        quality: 0.78,
        preservePngTransparency: false,
        maxLength: 235_000,
      });
      const next = { ...draft, [field]: compressed };
      setDraft(next);
      await persistDraft(next, 'Document image compressed & saved to your private vault.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to process selected image.');
    }
  };

  const handleUploadSignatureImage = async (file: File) => {
    if (!draft) return;
    setErrorMsg(null);
    try {
      const compressed = await compressDocumentImageDataUrl(file, {
        maxDim: 680,
        preservePngTransparency: true,
        maxLength: 145_000,
      });
      const next = { ...draft, signatureUrl: compressed };
      setDraft(next);
      await persistDraft(next, 'Signature image saved to your profile.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload signature image.');
    }
  };

  const activeAvatarSrc = draft?.avatarUrl || user?.photoURL || '';

  const handleUploadAvatar = async (file: File) => {
    if (!draft) return;
    setErrorMsg(null);
    try {
      const compressed = await compressDocumentImageDataUrl(file, {
        maxDim: 512,
        quality: 0.85,
        preservePngTransparency: false,
        maxLength: 185_000,
      });
      const next = { ...draft, avatarUrl: compressed };
      setDraft(next);
      await persistDraft(next, 'Profile photo updated & synced.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update profile photo.');
    }
  };

  const handleResetAvatarToGoogle = async () => {
    if (!draft) return;
    const next = { ...draft, avatarUrl: undefined };
    setDraft(next);
    await persistDraft(next, 'Reverted to Google account picture.');
  };

  const handleDownloadIdCard = async () => {
    if (!draft || isGeneratingCard) return;
    setIsGeneratingCard(true);
    setErrorMsg(null);
    try {
      const { blob, fileName } = await generateProfileIdCardBlob({
        profile: draft,
        photoUrl: activeAvatarSrc,
        googleDisplayName: user?.displayName,
        googleEmail: user?.email,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      setStatusMsg('Profile ID card downloaded.');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate profile ID card.');
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleSaveNewPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const presetName = newPresetName.trim() || draft.organization || 'Official Preset';
    const nextPreset: UserBiodataPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: presetName.slice(0, 80),
      fullName: draft.fullName,
      fatherName: draft.fatherName,
      contactNumber: draft.contactNumber,
      email: draft.email || user?.email || '',
      organization: draft.organization,
      designation: draft.designation,
      nationalIdNumber: draft.nationalIdNumber,
      passportNumber: draft.passportNumber,
      address: draft.address,
      notes: draft.bioNotes,
      coverTitle: newPresetTitle.trim(),
      coverSubtitle: newPresetSubtitle.trim(),
      updatedAt: Date.now(),
    };
    const nextDraft: UserProfileData = {
      ...draft,
      presets: [nextPreset, ...(draft.presets || [])].slice(0, 20),
    };
    setDraft(nextDraft);
    setNewPresetName('');
    setNewPresetTitle('');
    setNewPresetSubtitle('');
    await persistDraft(nextDraft, `Saved preset "${nextPreset.name}".`);
  };

  const handleDeletePreset = async (id: string) => {
    if (!draft) return;
    const nextDraft: UserProfileData = {
      ...draft,
      presets: (draft.presets || []).filter((p) => p.id !== id),
    };
    setDraft(nextDraft);
    await persistDraft(nextDraft, 'Preset removed.');
  };

  const buildBiodataSummaryText = (source: {
    fullName?: string;
    fatherName?: string;
    contactNumber?: string;
    email?: string;
    nationalIdNumber?: string;
    passportNumber?: string;
    designation?: string;
    address?: string;
    notes?: string;
  }) => {
    const lines: string[] = [];
    if (source.fullName) lines.push(`• Name: ${source.fullName}`);
    if (source.fatherName) lines.push(`• Father's Name: ${source.fatherName}`);
    if (source.designation) lines.push(`• Designation: ${source.designation}`);
    if (source.contactNumber) lines.push(`• Contact: ${source.contactNumber}`);
    if (source.email) lines.push(`• Email: ${source.email}`);
    if (source.nationalIdNumber) lines.push(`• National ID: ${source.nationalIdNumber}`);
    if (source.passportNumber) lines.push(`• Passport No: ${source.passportNumber}`);
    if (source.address) lines.push(`• Address: ${source.address}`);
    if (source.notes) lines.push(`\n${source.notes}`);
    return lines.join('\n');
  };

  const handleCopyBiodata = async () => {
    if (!draft) return;
    const txt = buildBiodataSummaryText(draft);
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="no-print fixed inset-x-0 top-14 sm:top-16 bottom-0 z-50 bg-black/45 backdrop-blur-[2px] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="User Profile & Document Vault"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="w-full max-w-md sm:max-w-lg lg:max-w-xl h-full bg-white dark:bg-[var(--pl-surface)] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {user ? (
              activeAvatarSrc ? (
                <img
                  src={activeAvatarSrc}
                  alt={draft?.fullName || user.displayName || 'Profile'}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/20 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                  {(draft?.fullName || user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-zinc-900 dark:text-white truncate">
                {user ? draft?.fullName || user.displayName || 'My PaperLink Profile' : 'Profile & Signature Vault'}
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {user
                  ? `${user.email} · Private cloud-synced biodata, IDs & signature`
                  : 'Sign in with Google to sync your biodata, IDs, signature & presets'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => void handleDownloadIdCard()}
                  disabled={isLoading || !draft || isGeneratingCard}
                  title="Download Profile as ID Card"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">ID Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  title="Sign out of Google account"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-500/35 bg-red-50/80 dark:bg-red-950/35 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile dialog"
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sign-In Gate if logged out */}
        {!user ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--pl-accent)]/15 border border-[var(--pl-accent)]/40 flex items-center justify-center text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Save Your Biodata, IDs & Signature Once
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Sign in with Google to securely store your Name, Father&apos;s Name, Contact Info, National Identity Card, Passport, reusable Signature, and Presets—then apply them across Cover Studio and PDF Signing in one click.
              </p>
            </div>
            <button
              type="button"
              onClick={onLogin}
              disabled={isLoggingIn}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold text-sm shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserIcon className="w-4 h-4" />}
              <span>{isLoggingIn ? 'Connecting with Google...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : isLoading || !draft ? (
          <div className="p-10 flex flex-col items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--pl-accent)]" />
            <span>Loading your private profile vault...</span>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'biodata' as ProfileTab, label: 'Biodata Info', icon: UserIcon },
                { id: 'documents' as ProfileTab, label: 'ID & Passport (Optional)', icon: CreditCard },
                { id: 'signature' as ProfileTab, label: 'Signature Studio', icon: PenTool },
                { id: 'presets' as ProfileTab, label: `Presets (${draft.presets?.length || 0})`, icon: Bookmark },
              ].map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'border-[var(--pl-accent)] text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] bg-white dark:bg-zinc-900/70'
                        : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {statusMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* TAB 1: BIODATA INFO */}
              {activeTab === 'biodata' && (
                <form onSubmit={handleSaveCurrentDraft} className="space-y-4">
                  {/* Profile Photo & Mini ID Card Strip */}
                  <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {activeAvatarSrc ? (
                          <img
                            src={activeAvatarSrc}
                            alt={draft.fullName || user.displayName || 'Profile Photo'}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/20"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/20 flex items-center justify-center font-extrabold text-lg">
                            {(draft.fullName || user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          aria-label="Change profile photo"
                          title="Upload custom profile picture"
                          className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-2 border-white dark:border-zinc-950 flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 transition-transform"
                        >
                          <Camera className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          ID Card Photo &amp; Export
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {draft.avatarUrl ? 'Using custom uploaded photo' : 'Defaulting to Google account photo'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadAvatar(f);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-emerald-500 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Change Photo</span>
                          </button>
                          {draft.avatarUrl && user?.photoURL && (
                            <button
                              type="button"
                              onClick={() => void handleResetAvatarToGoogle()}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Use Google Photo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDownloadIdCard()}
                      disabled={isGeneratingCard}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/45 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 font-bold text-xs cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isGeneratingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                      <span>Download ID Card</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={draft.fullName}
                        onChange={(e) => updateField('fullName', e.target.value)}
                        placeholder="e.g. Muhammad Ali Khan"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        F/Name (Father&apos;s Name)
                      </label>
                      <input
                        type="text"
                        value={draft.fatherName}
                        onChange={(e) => updateField('fatherName', e.target.value)}
                        placeholder="Father's full name"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Contact Number
                      </label>
                      <input
                        type="tel"
                        value={draft.contactNumber}
                        onChange={(e) => updateField('contactNumber', e.target.value)}
                        placeholder="e.g. +92 300 1234567"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-mono focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="name@example.com"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        National ID / CNIC Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={draft.nationalIdNumber}
                        onChange={(e) => updateField('nationalIdNumber', e.target.value)}
                        placeholder="e.g. 42101-1234567-1"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-mono focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Passport Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={draft.passportNumber}
                        onChange={(e) => updateField('passportNumber', e.target.value)}
                        placeholder="e.g. AB1234567"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-mono focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Organization / Institution
                      </label>
                      <input
                        type="text"
                        value={draft.organization}
                        onChange={(e) => updateField('organization', e.target.value)}
                        placeholder="Company, University, or Department"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Designation / Role
                      </label>
                      <input
                        type="text"
                        value={draft.designation}
                        onChange={(e) => updateField('designation', e.target.value)}
                        placeholder="e.g. Senior Engineer, Applicant"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Date of Birth (Optional)
                      </label>
                      <input
                        type="text"
                        value={draft.dateOfBirth}
                        onChange={(e) => updateField('dateOfBirth', e.target.value)}
                        placeholder="DD MMM YYYY"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Residential / Mailing Address
                      </label>
                      <input
                        type="text"
                        value={draft.address}
                        onChange={(e) => updateField('address', e.target.value)}
                        placeholder="Street, City, Country"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Additional Biodata / Document Summary Notes
                    </label>
                    <textarea
                      rows={3}
                      value={draft.bioNotes}
                      onChange={(e) => updateField('bioNotes', e.target.value)}
                      placeholder="Optional qualifications, registration numbers, or default bullet points..."
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyToCoverStudio({
                            preparedBy: draft.fullName,
                            organization: draft.organization,
                            documentId: draft.nationalIdNumber || draft.passportNumber || undefined,
                            summary: buildBiodataSummaryText(draft),
                            signatureUrl: draft.signatureUrl,
                            signatureLabel: draft.fullName,
                          });
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--pl-accent)]/60 bg-[var(--pl-accent)]/12 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] font-bold text-xs cursor-pointer hover:bg-[var(--pl-accent)]/20"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Insert Biodata into Cover Studio</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyBiodata}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 font-semibold text-xs cursor-pointer"
                      >
                        {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSummary ? 'Copied' : 'Copy Info'}</span>
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold text-xs cursor-pointer disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: NATIONAL ID & PASSPORT VAULT */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      Optional private vault — strictly readable and writable only by your verified Google account. Images are auto-compressed for fast sync.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {[
                      {
                        label: 'National ID (Front)',
                        hint: 'Optional',
                        value: draft.nationalIdFrontUrl,
                        field: 'nationalIdFrontUrl' as const,
                        ref: idFrontInputRef,
                        filename: 'National_ID_Front.jpg',
                      },
                      {
                        label: 'National ID (Back)',
                        hint: 'Optional',
                        value: draft.nationalIdBackUrl,
                        field: 'nationalIdBackUrl' as const,
                        ref: idBackInputRef,
                        filename: 'National_ID_Back.jpg',
                      },
                      {
                        label: 'Passport Bio Page',
                        hint: 'Optional',
                        value: draft.passportImageUrl,
                        field: 'passportImageUrl' as const,
                        ref: passportInputRef,
                        filename: 'Passport_Scan.jpg',
                      },
                    ].map((docSlot) => (
                      <div
                        key={docSlot.field}
                        className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">{docSlot.label}</span>
                          <span className="text-[10px] font-medium text-zinc-500">{docSlot.hint}</span>
                        </div>

                        <div className="h-32 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden flex items-center justify-center p-1.5">
                          {docSlot.value ? (
                            <img
                              src={docSlot.value}
                              alt={docSlot.label}
                              className="max-h-full max-w-full object-contain rounded"
                            />
                          ) : (
                            <span className="text-[11px] text-zinc-400 text-center px-2">No image uploaded</span>
                          )}
                        </div>

                        <input
                          ref={docSlot.ref}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadIdOrPassport(f, docSlot.field);
                            e.target.value = '';
                          }}
                        />

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => docSlot.ref.current?.click()}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] font-bold text-[11px] cursor-pointer inline-flex items-center justify-center gap-1"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{docSlot.value ? 'Replace' : 'Upload'}</span>
                          </button>

                          {docSlot.value && (
                            <>
                              <a
                                href={docSlot.value}
                                download={docSlot.filename}
                                className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                                title="Download copy"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = { ...draft, [docSlot.field]: undefined };
                                  setDraft(next);
                                  await persistDraft(next, `${docSlot.label} removed.`);
                                }}
                                className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                                title="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: SIGNATURE STUDIO */}
              {activeTab === 'signature' && (
                <div className="space-y-4">
                  {/* Saved Cloud Signature */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-white">
                          Your Active Saved Signature
                        </h3>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                          Ready for 1-click use in Cover Studio, PDF Sign &amp; Stamp, and PDF Editor
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {draft.signatureUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onApplyToCoverStudio({
                                  signatureUrl: draft.signatureUrl,
                                  signatureLabel: draft.fullName || 'Authorized Signature',
                                });
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Place on Cover Sheet</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const next = { ...draft, signatureUrl: undefined };
                                setDraft(next);
                                await persistDraft(next, 'Saved signature cleared.');
                              }}
                              className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              title="Remove saved signature"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="h-24 rounded-lg bg-white border border-zinc-200 dark:border-zinc-700 flex items-center justify-center p-2">
                      {draft.signatureUrl ? (
                        <img
                          src={draft.signatureUrl}
                          alt="Saved signature"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">
                          No saved signature yet — draw below or upload a PNG
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Draw New / Update Signature */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        Draw or Upload New Signature
                      </span>
                      <div className="flex items-center gap-2.5">
                        {['#0f172a', '#1d4ed8', '#991b1b'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSigInkColor(c)}
                            aria-label={`Ink color ${c}`}
                            className={`w-4 h-4 rounded-full border cursor-pointer ${
                              sigInkColor === c ? 'ring-2 ring-[var(--pl-accent)]' : 'border-zinc-400'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          <span>Width</span>
                          <input
                            type="range"
                            min={1.5}
                            max={5}
                            step={0.5}
                            value={sigLineWidth}
                            onChange={(e) => setSigLineWidth(parseFloat(e.target.value))}
                            className="w-16 accent-[var(--pl-accent)]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={clearCanvasPad}
                          className="text-xs font-semibold text-zinc-500 hover:text-red-500 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <canvas
                      ref={sigCanvasRef}
                      width={640}
                      height={190}
                      onPointerDown={(e) => {
                        isDrawingRef.current = true;
                        const canvas = sigCanvasRef.current;
                        const ctx = canvas?.getContext('2d');
                        if (!ctx || !canvas) return;
                        ctx.strokeStyle = sigInkColor;
                        ctx.lineWidth = sigLineWidth;
                        const pt = getCanvasPoint(e);
                        ctx.beginPath();
                        ctx.moveTo(pt.x, pt.y);
                      }}
                      onPointerMove={(e) => {
                        if (!isDrawingRef.current) return;
                        const ctx = sigCanvasRef.current?.getContext('2d');
                        if (!ctx) return;
                        const pt = getCanvasPoint(e);
                        ctx.lineTo(pt.x, pt.y);
                        ctx.stroke();
                        setHasCanvasStrokes(true);
                      }}
                      onPointerUp={() => {
                        isDrawingRef.current = false;
                      }}
                      onPointerLeave={() => {
                        isDrawingRef.current = false;
                      }}
                      className="w-full h-36 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white touch-none cursor-crosshair"
                    />

                    <input
                      ref={sigUploadRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadSignatureImage(f);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => sigUploadRef.current?.click()}
                        className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[var(--pl-accent)] cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Signature Image</span>
                      </button>

                      <button
                        type="button"
                        disabled={!hasCanvasStrokes || isSaving}
                        onClick={() => void applyDrawnSignatureToDraft()}
                        className="px-4 py-2 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] disabled:opacity-40 text-[var(--pl-cta-text)] font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Drawn Signature</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: BIODATA & DOCUMENT PRESETS */}
              {activeTab === 'presets' && (
                <div className="space-y-4">
                  <form
                    onSubmit={handleSaveNewPreset}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-3 text-xs"
                  >
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-[var(--pl-accent)]" />
                      Save Current Biodata as Reusable Preset
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Preset name (e.g. Visa Dossier)"
                        className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newPresetTitle}
                        onChange={(e) => setNewPresetTitle(e.target.value)}
                        placeholder="Default cover title (optional)"
                        className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newPresetSubtitle}
                        onChange={(e) => setNewPresetSubtitle(e.target.value)}
                        placeholder="Default subtitle (optional)"
                        className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Preset</span>
                      </button>
                    </div>
                  </form>

                  {(draft.presets || []).length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                      No saved biodata presets yet. Save one above to autofill Cover Studio in one click!
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {draft.presets.map((p) => (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{p.name}</h4>
                            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                              {[p.fullName, p.fatherName ? `S/O ${p.fatherName}` : '', p.contactNumber, p.organization]
                                .filter(Boolean)
                                .join(' · ') || 'Personal biodata preset'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onApplyToCoverStudio({
                                  title: p.coverTitle || undefined,
                                  subtitle: p.coverSubtitle || undefined,
                                  preparedBy: p.fullName,
                                  organization: p.organization,
                                  documentId: p.nationalIdNumber || p.passportNumber || undefined,
                                  summary: buildBiodataSummaryText(p),
                                  signatureUrl: draft.signatureUrl,
                                  signatureLabel: p.fullName,
                                });
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Use on Cover</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeletePreset(p.id)}
                              className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              title="Delete preset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
