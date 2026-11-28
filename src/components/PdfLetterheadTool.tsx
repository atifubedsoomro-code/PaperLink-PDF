import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  Eye,
  FileText,
  FileType2,
  HardDrive,
  ImagePlus,
  Loader2,
  Mail,
  Palette,
  PenTool,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  LETTERHEAD_TEMPLATES,
  LetterheadConfig,
  LetterheadTemplateId,
  buildLetterheadMailtoHref,
  generateLetterheadDocx,
  generateLetterheadPdf,
  renderLetterheadToCanvas,
} from '../services/letterheadService';
import {
  deleteLetterheadPreset,
  getLetterheadPresets,
  saveLetterheadPreset,
} from '../firebase';
import { LetterheadPresetRecord, UserProfileData } from '../types';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';

interface PdfLetterheadToolProps {
  userProfile?: UserProfileData | null;
  userEmail?: string;
  onOpenInCoverStudio: (blob: Blob, fileName: string) => void;
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onTaskComplete?: (info: {
    headline: string;
    subtext: string;
    statusLabel?: string;
    downloadFile?: ReadyDownloadPayload;
  }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
}

type LetterheadStep = 1 | 2 | 3 | 4;

const LETTERHEAD_STEPS: { num: LetterheadStep; short: string; nextLabel?: string }[] = [
  { num: 1, short: 'Template', nextLabel: 'Company Info' },
  { num: 2, short: 'Company', nextLabel: 'Letter & Sign' },
  { num: 3, short: 'Letter', nextLabel: 'Export PDF' },
  { num: 4, short: 'Export' },
];

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function createInitialConfig(userProfile?: UserProfileData | null): LetterheadConfig {
  return {
    templateId: 'executive-navy',
    primaryColor: LETTERHEAD_TEMPLATES[0].primaryColor,
    accentColor: LETTERHEAD_TEMPLATES[0].accentColor,
    paperSize: 'a4',
    companyName: userProfile?.organization || '',
    tagline: '',
    registrationNo: '',
    phone: userProfile?.contactNumber || '',
    email: userProfile?.email || userProfile?.userEmail || '',
    website: '',
    address: userProfile?.address || '',
    logoUrl: undefined,
    showWatermark: true,
    showPageBorder: false,
    includeSampleContent: false,
    refNumber: '',
    dateText: getTodayFormatted(),
    recipientBlock: '',
    subjectLine: '',
    bodyText: '',
    signerName: userProfile?.fullName || '',
    signerTitle: userProfile?.designation || '',
    signatureUrl: userProfile?.signatureUrl,
  };
}

export const PdfLetterheadTool: React.FC<PdfLetterheadToolProps> = ({
  userProfile,
  userEmail,
  onOpenInCoverStudio,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);

  const resolvedEmail = (userEmail || userProfile?.userEmail || '').trim();

  const [step, setStep] = useState<LetterheadStep>(1);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [config, setConfig] = useState<LetterheadConfig>(() => createInitialConfig(userProfile));

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [resultPdf, setResultPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [resultDocx, setResultDocx] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [mailRecipient, setMailRecipient] = useState<string>('');

  // Saved Letterhead Presets (Account + Local Browser Persistence)
  const [savedPresets, setSavedPresets] = useState<LetterheadPresetRecord[]>([]);
  const [presetsLoading, setPresetsLoading] = useState<boolean>(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [savePresetBarOpen, setSavePresetBarOpen] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [savingPreset, setSavingPreset] = useState<boolean>(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  // Sync saved user profile fields cleanly once profile arrives without overriding user edits
  const profileSyncedRef = useRef(false);
  useEffect(() => {
    if (!userProfile || profileSyncedRef.current) return;
    profileSyncedRef.current = true;
    setConfig((prev) => ({
      ...prev,
      companyName: prev.companyName || userProfile.organization || '',
      phone: prev.phone || userProfile.contactNumber || '',
      email: prev.email || userProfile.email || userProfile.userEmail || '',
      address: prev.address || userProfile.address || '',
      signerName: prev.signerName || userProfile.fullName || '',
      signerTitle: prev.signerTitle || userProfile.designation || '',
      signatureUrl: prev.signatureUrl || userProfile.signatureUrl,
    }));
  }, [userProfile]);

  // Load saved letterhead presets on mount & whenever the signed-in Google account changes
  useEffect(() => {
    let cancelled = false;
    setPresetsLoading(true);
    getLetterheadPresets(resolvedEmail || undefined)
      .then((list) => {
        if (!cancelled) {
          setSavedPresets(list);
        }
      })
      .catch((err) => {
        console.warn('Could not load saved letterhead presets:', err);
      })
      .finally(() => {
        if (!cancelled) setPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedEmail]);

  const showPresetBanner = (msg: string) => {
    setPresetNotice(msg);
    window.setTimeout(() => {
      setPresetNotice((cur) => (cur === msg ? null : cur));
    }, 4500);
  };

  const openSavePresetBar = () => {
    const activeMatch = activePresetId
      ? savedPresets.find((p) => p.id === activePresetId)
      : undefined;
    const tplName =
      LETTERHEAD_TEMPLATES.find((t) => t.id === config.templateId)?.name || 'Letterhead';
    setPresetNameInput(
      activeMatch?.name ||
        config.companyName.trim() ||
        `${tplName} Preset`
    );
    setSavePresetBarOpen(true);
  };

  const handleSavePreset = async (mode: 'new' | 'update') => {
    const fallbackTplName =
      LETTERHEAD_TEMPLATES.find((t) => t.id === config.templateId)?.name || 'Company Letterhead';
    const trimmedName = (presetNameInput.trim() || config.companyName.trim() || fallbackTplName).slice(
      0,
      100
    );
    const existingTarget =
      mode === 'update' && activePresetId
        ? savedPresets.find((p) => p.id === activePresetId)
        : undefined;

    const now = Date.now();
    const record: LetterheadPresetRecord = {
      id:
        existingTarget?.id ||
        `lh_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      templateId: config.templateId,
      primaryColor: config.primaryColor,
      accentColor: config.accentColor,
      paperSize: config.paperSize,
      companyName: config.companyName.trim(),
      tagline: config.tagline.trim() || undefined,
      registrationNo: config.registrationNo.trim() || undefined,
      phone: config.phone.trim() || undefined,
      email: config.email.trim() || undefined,
      website: config.website.trim() || undefined,
      address: config.address.trim() || undefined,
      logoUrl: config.logoUrl,
      showWatermark: config.showWatermark,
      showPageBorder: config.showPageBorder,
      includeSampleContent: config.includeSampleContent,
      signerName: config.signerName.trim() || undefined,
      signerTitle: config.signerTitle.trim() || undefined,
      signatureUrl: config.signatureUrl,
      userEmail: resolvedEmail,
      createdAt: existingTarget?.createdAt || now,
      updatedAt: now,
    };

    setSavingPreset(true);
    onError(null);
    try {
      const saved = await saveLetterheadPreset(record);
      setSavedPresets((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
      setActivePresetId(saved.id);
      setSavePresetBarOpen(false);
      showPresetBanner(
        resolvedEmail
          ? `Preset "${saved.name}" saved to your Google account (${resolvedEmail}) and this browser.`
          : `Preset "${saved.name}" saved to this browser. Sign in with Google anytime to sync it to your account.`
      );
    } catch (err: any) {
      onError(err?.message || 'Failed to save letterhead preset.');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleLoadPreset = (preset: LetterheadPresetRecord) => {
    const validTpl = LETTERHEAD_TEMPLATES.some((t) => t.id === preset.templateId)
      ? (preset.templateId as LetterheadTemplateId)
      : LETTERHEAD_TEMPLATES[0].id;
    profileSyncedRef.current = true;
    setConfig((prev) => ({
      ...prev,
      templateId: validTpl,
      primaryColor: preset.primaryColor || LETTERHEAD_TEMPLATES[0].primaryColor,
      accentColor: preset.accentColor || LETTERHEAD_TEMPLATES[0].accentColor,
      paperSize: preset.paperSize === 'letter' ? 'letter' : 'a4',
      companyName: preset.companyName || '',
      tagline: preset.tagline || '',
      registrationNo: preset.registrationNo || '',
      phone: preset.phone || '',
      email: preset.email || '',
      website: preset.website || '',
      address: preset.address || '',
      logoUrl: preset.logoUrl,
      showWatermark: preset.showWatermark ?? true,
      showPageBorder: preset.showPageBorder ?? false,
      includeSampleContent: preset.includeSampleContent ?? prev.includeSampleContent,
      dateText: prev.dateText || getTodayFormatted(),
      signerName: preset.signerName || '',
      signerTitle: preset.signerTitle || '',
      signatureUrl: preset.signatureUrl,
    }));
    setActivePresetId(preset.id);
    setResultPdf(null);
    setResultDocx(null);
    onError(null);
    showPresetBanner(`Loaded saved preset "${preset.name}".`);
  };

  const handleDeletePreset = async (preset: LetterheadPresetRecord) => {
    try {
      await deleteLetterheadPreset(preset.id);
      setSavedPresets((prev) => prev.filter((p) => p.id !== preset.id));
      if (activePresetId === preset.id) {
        setActivePresetId(null);
      }
      showPresetBanner(`Removed preset "${preset.name}".`);
    } catch (err: any) {
      onError(err?.message || 'Failed to delete preset.');
    }
  };

  const handleApplyProfile = () => {
    if (!userProfile) return;
    setConfig((prev) => ({
      ...prev,
      companyName: userProfile.organization || prev.companyName,
      phone: userProfile.contactNumber || prev.phone,
      email: userProfile.email || userProfile.userEmail || prev.email,
      address: userProfile.address || prev.address,
      signerName: userProfile.fullName || prev.signerName,
      signerTitle: userProfile.designation || prev.signerTitle,
      signatureUrl: userProfile.signatureUrl || prev.signatureUrl,
    }));
    setResultPdf(null);
    setResultDocx(null);
  };

  const handleResetAll = () => {
    setConfig(createInitialConfig(null));
    setActivePresetId(null);
    setResultPdf(null);
    setResultDocx(null);
    setMailRecipient('');
    onError(null);
  };

  // Render live paper canvas preview on config updates
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const canvas = await renderLetterheadToCanvas(config, 760);
        if (!cancelled) {
          setLivePreviewUrl(canvas.toDataURL('image/png'));
        }
      } catch (err) {
        console.warn('Letterhead live preview error:', err);
      }
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config]);

  const selectTemplate = (tplId: LetterheadTemplateId) => {
    const found = LETTERHEAD_TEMPLATES.find((t) => t.id === tplId);
    if (!found) return;
    setConfig((prev) => ({
      ...prev,
      templateId: found.id,
      primaryColor: found.primaryColor,
      accentColor: found.accentColor,
    }));
    setResultPdf(null);
  };

  const handleUploadImage = (file: File | undefined, field: 'logoUrl' | 'signatureUrl') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({ ...prev, [field]: reader.result as string }));
        setResultPdf(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGeneratePdf = async () => {
    onError(null);
    setIsWorking(true);
    onProgress({ percent: 35, status: 'Rendering print-ready company letterhead PDF...' });
    try {
      const res = await generateLetterheadPdf(config);
      onProgress({ percent: 95, status: 'Finalizing PDF document...' });
      setResultPdf({ blob: res.blob, fileName: res.fileName });
      onTaskComplete?.({
        headline: 'Company Letterhead Ready',
        subtext: `${res.fileName} exported in crisp ${config.paperSize.toUpperCase()} format.`,
        statusLabel: 'Letterhead Studio',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Company Letterhead',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to generate company letterhead PDF.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const handleExportWord = async () => {
    onError(null);
    setIsWorking(true);
    onProgress({ percent: 40, status: 'Building editable Word (.docx) letterhead...' });
    try {
      const res = await generateLetterheadDocx(config);
      onProgress({ percent: 95, status: 'Finalizing Word document...' });
      setResultDocx(res);
      triggerDownload(res.blob, res.fileName);
      onTaskComplete?.({
        headline: 'Word Letterhead Ready (.docx)',
        subtext: `${res.fileName} downloaded for editing in Microsoft Word or Google Docs.`,
        statusLabel: 'Letterhead Word Export',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Word Letterhead',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to generate Word (.docx) letterhead.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const mailtoHref = buildLetterheadMailtoHref(config, mailRecipient);

  const activeTemplate =
    LETTERHEAD_TEMPLATES.find((t) => t.id === config.templateId) || LETTERHEAD_TEMPLATES[0];

  const filteredTemplates =
    categoryFilter === 'All'
      ? LETTERHEAD_TEMPLATES
      : LETTERHEAD_TEMPLATES.filter((t) => t.category === categoryFilter);

  const stepMeta = LETTERHEAD_STEPS.find((s) => s.num === step)!;

  return (
    <div className="space-y-3">
      {/* Compact Studio Header + Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
            <span>Company Letterhead Studio</span>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              · {LETTERHEAD_TEMPLATES.length} templates
            </span>
          </h3>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Live preview on the left · Step-by-step brand, letterhead, signature &amp; PDF export on the right.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSavePresetBar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/45 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/20 cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{activePresetId ? 'Update / Save Preset' : 'Save Preset'}</span>
          </button>
          {userProfile && (
            <button
              type="button"
              onClick={handleApplyProfile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--pl-accent)]/50 bg-[var(--pl-accent)]/12 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] text-xs font-bold hover:bg-[var(--pl-accent)]/20 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Fill from Profile</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleResetAll}
            title="Clear all entered fields"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white text-xs font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Inline Save Preset Drawer Bar */}
      {savePresetBarOpen && (
        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center gap-2.5 text-xs">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              Preset Name ({resolvedEmail ? `Syncs to ${resolvedEmail}` : 'Saves to this browser'})
            </label>
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !savingPreset) {
                  void handleSavePreset(activePresetId ? 'update' : 'new');
                }
              }}
              placeholder="e.g. Acme Official A4 Letterhead"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold focus:border-[var(--pl-accent)] focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-4">
            {activePresetId && (
              <button
                type="button"
                disabled={savingPreset}
                onClick={() => handleSavePreset('update')}
                className="px-3 py-1.5 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {savingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Update Current</span>
              </button>
            )}
            <button
              type="button"
              disabled={savingPreset}
              onClick={() => handleSavePreset('new')}
              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                activePresetId
                  ? 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white hover:border-[var(--pl-accent)]'
                  : 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)]'
              }`}
            >
              {savingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
              <span>{activePresetId ? 'Save as New' : 'Save Preset'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSavePresetBarOpen(false)}
              className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              title="Close save preset bar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Preset Action Feedback Notice */}
      {presetNotice && (
        <div className="px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{presetNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setPresetNotice(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Collapsible Preview Toggle (Mirrors Cover Studio) */}
      <div className="lg:hidden flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setMobilePreviewOpen((p) => !p)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
          <span>{mobilePreviewOpen ? 'Hide Paper Preview' : 'Show Live Paper Preview'}</span>
          {mobilePreviewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
          {config.paperSize.toUpperCase()} · {activeTemplate.name}
        </span>
      </div>

      {/* COVER STUDIO SPLIT WORKBENCH: CONSTANT LEFT PREVIEW · STEPPED RIGHT OPTIONS PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANE: CONSTANT LIVE LETTERHEAD PREVIEW */}
        <div
          className={`${
            mobilePreviewOpen ? 'block' : 'hidden lg:block'
          } lg:col-span-5 lg:sticky lg:top-20`}
        >
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950/90 p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
                <Palette className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                <span>Live {config.paperSize.toUpperCase()} Preview</span>
              </span>

              <div className="flex items-center gap-2 text-[11px]">
                {resultPdf ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PDF Ready
                  </span>
                ) : (
                  <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {config.paperSize === 'letter' ? '8.5 × 11 in' : '210 × 297 mm'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center py-1">
              {livePreviewUrl ? (
                <img
                  src={livePreviewUrl}
                  alt="Company Letterhead Preview"
                  className="w-full max-w-[380px] rounded-lg border border-zinc-300 dark:border-zinc-700 shadow-lg bg-white"
                />
              ) : (
                <div className="w-full max-w-[380px] aspect-[1/1.414] rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Rendering preview...
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              {resultPdf && (
                <button
                  type="button"
                  onClick={() => triggerDownload(resultPdf.blob, resultPdf.fileName)}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              )}
              <button
                type="button"
                disabled={isWorking}
                onClick={handleExportWord}
                className="flex-1 py-2 px-3 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <FileType2 className="w-3.5 h-3.5" />
                <span>Export Word</span>
              </button>
              <a
                href={mailtoHref}
                className="py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white hover:border-[var(--pl-accent)] font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                <span>Mail</span>
              </a>
              {resultPdf && onPreviewDocument && (
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument({
                      title: resultPdf.fileName,
                      fileName: resultPdf.fileName,
                      blob: resultPdf.blob,
                      subtitle: 'Generated Company Letterhead PDF',
                    })
                  }
                  className="py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: COVER STUDIO-STYLE STEP RAIL + OPTIONS + BACK/NEXT FOOTER */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/75 overflow-hidden">
          {/* Pinned Top Step Rail */}
          <div className="px-3.5 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/90">
            <div className="grid grid-cols-4 gap-1.5">
              {LETTERHEAD_STEPS.map((s) => {
                const isActive = step === s.num;
                const isCompleted =
                  step > s.num ||
                  (s.num === 2 && Boolean(config.companyName.trim())) ||
                  (s.num === 4 && Boolean(resultPdf));
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(s.num)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'border-[var(--pl-cta-border)] bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold shadow-xs'
                        : isCompleted
                        ? 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-yellow-300 font-semibold hover:border-[var(--pl-accent)]'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-700'
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
                      {isCompleted && !isActive ? <CheckCircle2 className="w-3 h-3" /> : s.num}
                    </span>
                    <span className="truncate">{s.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step Content Body */}
          <div className="p-4 space-y-4 min-h-[420px]">
            {/* STEP 1: SAVED PRESETS, TEMPLATE, COLORS, PAPER & BRAND ASSETS */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Saved Presets Section (Shows automatically on return or account sign-in) */}
                {(presetsLoading || savedPresets.length > 0) && (
                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                        <span>My Saved Letterhead Presets</span>
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                          ({savedPresets.length})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={openSavePresetBar}
                        className="text-[11px] font-bold text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        <span>Save Current</span>
                      </button>
                    </div>

                    {presetsLoading && savedPresets.length === 0 ? (
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading your saved presets...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {savedPresets.map((preset) => {
                          const isSelected = activePresetId === preset.id;
                          const tplLabel =
                            LETTERHEAD_TEMPLATES.find((t) => t.id === preset.templateId)?.name ||
                            preset.templateId;
                          return (
                            <div
                              key={preset.id}
                              className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                                isSelected
                                  ? 'border-[var(--pl-accent)] bg-[var(--pl-accent)]/10 shadow-xs'
                                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/70 hover:border-zinc-400 dark:hover:border-zinc-700'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleLoadPreset(preset)}
                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                              >
                                {preset.logoUrl ? (
                                  <img
                                    src={preset.logoUrl}
                                    alt={preset.name}
                                    className="w-8 h-8 rounded-md object-contain bg-white border border-zinc-200 dark:border-zinc-700 shrink-0 p-0.5"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center gap-0.5 shrink-0">
                                    <span
                                      className="w-2.5 h-5 rounded-sm"
                                      style={{ backgroundColor: preset.primaryColor }}
                                    />
                                    <span
                                      className="w-1.5 h-5 rounded-sm"
                                      style={{ backgroundColor: preset.accentColor }}
                                    />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                      {preset.name}
                                    </p>
                                    {isSelected && (
                                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    )}
                                  </div>
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
                                    {preset.userEmail ? (
                                      <Cloud className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    ) : (
                                      <HardDrive className="w-2.5 h-2.5 shrink-0" />
                                    )}
                                    <span className="truncate">
                                      {preset.companyName || tplLabel} · {preset.paperSize.toUpperCase()}
                                    </span>
                                  </p>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeletePreset(preset)}
                                title="Delete saved preset"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Choose Letterhead Style
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {['All', 'Corporate', 'Executive', 'Minimalist', 'Creative', 'Official'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                          categoryFilter === cat
                            ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] font-bold'
                            : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                  {filteredTemplates.map((tpl) => {
                    const active = config.templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => selectTemplate(tpl.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-[var(--pl-accent)] bg-[var(--pl-accent)]/10 shadow-xs'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/30"
                              style={{ backgroundColor: tpl.primaryColor }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/30"
                              style={{ backgroundColor: tpl.accentColor }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                            {tpl.category}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{tpl.name}</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                          {tpl.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Colors, Paper & Logo Controls */}
                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                      Primary Ink
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={config.primaryColor}
                        onChange={(e) => {
                          setConfig((p) => ({ ...p, primaryColor: e.target.value }));
                          setResultPdf(null);
                        }}
                        className="w-8 h-8 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                      />
                      <span className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 uppercase tabular-nums">
                        {config.primaryColor}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                      Accent Rule
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={config.accentColor}
                        onChange={(e) => {
                          setConfig((p) => ({ ...p, accentColor: e.target.value }));
                          setResultPdf(null);
                        }}
                        className="w-8 h-8 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                      />
                      <span className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 uppercase tabular-nums">
                        {config.accentColor}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                      Paper Size
                    </label>
                    <select
                      value={config.paperSize}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, paperSize: e.target.value as 'a4' | 'letter' }));
                        setResultPdf(null);
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white cursor-pointer"
                    >
                      <option value="a4">A4 (210 × 297 mm)</option>
                      <option value="letter">US Letter (8.5 × 11 in)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                      Company Logo
                    </label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleUploadImage(e.target.files?.[0], 'logoUrl');
                        e.target.value = '';
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex-1 px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[var(--pl-accent)] inline-flex items-center justify-center gap-1 cursor-pointer truncate"
                      >
                        <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                        <span>{config.logoUrl ? 'Change' : 'Upload'}</span>
                      </button>
                      {config.logoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfig((p) => ({ ...p, logoUrl: undefined }));
                            setResultPdf(null);
                          }}
                          className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          title="Remove logo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Watermark & Outer Frame Options */}
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-800 dark:text-zinc-200 font-semibold">
                    <input
                      type="checkbox"
                      checked={config.showWatermark}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, showWatermark: e.target.checked }));
                        setResultPdf(null);
                      }}
                      className="accent-[var(--pl-accent)]"
                    />
                    <span>Subtle Center Watermark</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-800 dark:text-zinc-200 font-semibold">
                    <input
                      type="checkbox"
                      checked={config.showPageBorder}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, showPageBorder: e.target.checked }));
                        setResultPdf(null);
                      }}
                      className="accent-[var(--pl-accent)]"
                    />
                    <span>Outer Stationery Border</span>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 2: COMPANY HEADER & FOOTER CONTACT DETAILS (ZERO MOCK DATA) */}
            {step === 2 && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                      Organization Header &amp; Footer Bar
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Leave any optional field blank and it will remain cleanly omitted from your stationery.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Company / Organization Name
                    </label>
                    <input
                      type="text"
                      value={config.companyName}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, companyName: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="Enter your company or firm name"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Tagline / Department (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.tagline}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, tagline: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="e.g. Architecture · Legal · Advisory"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Phone / Contact Number
                    </label>
                    <input
                      type="text"
                      value={config.phone}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, phone: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="e.g. +92 300 0000000"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Official Email Address
                    </label>
                    <input
                      type="email"
                      value={config.email}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, email: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="contact@yourcompany.com"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Website (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.website}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, website: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="www.yourcompany.com"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Registration / NTN / Tax ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.registrationNo}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, registrationNo: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="Optional registration code"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Office Address (Footer Strip)
                    </label>
                    <input
                      type="text"
                      value={config.address}
                      onChange={(e) => {
                        setConfig((p) => ({ ...p, address: e.target.value }));
                        setResultPdf(null);
                      }}
                      placeholder="Street address, suite, city, country"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: BLANK STATIONERY PAD VS SIGNED LETTER COMPOSER */}
            {step === 3 && (
              <div className="space-y-3.5 text-xs">
                {/* Clean Mode Switcher */}
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setConfig((p) => ({ ...p, includeSampleContent: false }));
                      setResultPdf(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      !config.includeSampleContent
                        ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    Blank Letterhead Pad
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfig((p) => ({ ...p, includeSampleContent: true }));
                      setResultPdf(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      config.includeSampleContent
                        ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    Compose Signed Letter
                  </button>
                </div>

                {!config.includeSampleContent ? (
                  <div className="p-5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/50 text-center space-y-2">
                    <FileText className="w-7 h-7 mx-auto text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">
                      Blank Printable Stationery Mode Active
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                      Your letterhead will export with only your organization header, watermark, and footer contact bar so you can print reams or write inside any editor. Switch to &ldquo;Compose Signed Letter&rdquo; above if you want to type a full letter right now.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Reference Number (Optional)
                        </label>
                        <input
                          type="text"
                          value={config.refNumber}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, refNumber: e.target.value }));
                            setResultPdf(null);
                          }}
                          placeholder="e.g. REF-2026-001"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Letter Date
                        </label>
                        <input
                          type="text"
                          value={config.dateText}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, dateText: e.target.value }));
                            setResultPdf(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Recipient Block
                        </label>
                        <textarea
                          rows={2}
                          value={config.recipientBlock}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, recipientBlock: e.target.value }));
                            setResultPdf(null);
                          }}
                          placeholder={'To:\nRecipient Name & Title\nOrganization'}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Subject Line
                        </label>
                        <textarea
                          rows={2}
                          value={config.subjectLine}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, subjectLine: e.target.value }));
                            setResultPdf(null);
                          }}
                          placeholder="Enter official letter subject"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                        Letter Body
                      </label>
                      <textarea
                        rows={4}
                        value={config.bodyText}
                        onChange={(e) => {
                          setConfig((p) => ({ ...p, bodyText: e.target.value }));
                          setResultPdf(null);
                        }}
                        placeholder="Write your letter body, bullet points, and closing remarks here..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white leading-relaxed focus:border-[var(--pl-accent)] focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Signatory Name
                        </label>
                        <input
                          type="text"
                          value={config.signerName}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, signerName: e.target.value }));
                            setResultPdf(null);
                          }}
                          placeholder="Full name"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Title / Designation
                        </label>
                        <input
                          type="text"
                          value={config.signerTitle}
                          onChange={(e) => {
                            setConfig((p) => ({ ...p, signerTitle: e.target.value }));
                            setResultPdf(null);
                          }}
                          placeholder="e.g. Director"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          ref={sigInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleUploadImage(e.target.files?.[0], 'signatureUrl');
                            e.target.value = '';
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => sigInputRef.current?.click()}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[var(--pl-accent)] cursor-pointer inline-flex items-center justify-center gap-1"
                          >
                            <PenTool className="w-3 h-3" />
                            <span>{config.signatureUrl ? 'Change Sign' : 'Upload Sign'}</span>
                          </button>
                          {config.signatureUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfig((p) => ({ ...p, signatureUrl: undefined }));
                                setResultPdf(null);
                              }}
                              className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500 cursor-pointer"
                              title="Remove signature"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {userProfile?.signatureUrl && !config.signatureUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((p) => ({
                            ...p,
                            signatureUrl: userProfile.signatureUrl,
                            signerName: p.signerName || userProfile.fullName || '',
                            signerTitle: p.signerTitle || userProfile.designation || '',
                          }));
                          setResultPdf(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer hover:bg-emerald-500/20"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Insert Saved Signature from Profile</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: SUMMARY & PDF EXPORT */}
            {step === 4 && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                    Letterhead Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px]">
                    <span className="text-zinc-500 dark:text-zinc-400">Template</span>
                    <span className="font-semibold text-zinc-900 dark:text-white truncate">{activeTemplate.name}</span>

                    <span className="text-zinc-500 dark:text-zinc-400">Paper Format</span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                      {config.paperSize.toUpperCase()} ({config.paperSize === 'letter' ? '8.5 × 11 in' : '210 × 297 mm'})
                    </span>

                    <span className="text-zinc-500 dark:text-zinc-400">Organization</span>
                    <span className="font-semibold text-zinc-900 dark:text-white truncate">
                      {config.companyName.trim() || 'Not specified'}
                    </span>

                    <span className="text-zinc-500 dark:text-zinc-400">Content Mode</span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {config.includeSampleContent ? 'Signed Official Letter' : 'Blank Printable Stationery Pad'}
                    </span>
                  </div>
                </div>

                {!config.companyName.trim() && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 px-1">
                    Tip: Add your company or organization name in Step 2 (Company) if you want a masthead title displayed.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={handleGeneratePdf}
                    className="px-4 py-2.5 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-sm"
                  >
                    {isWorking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    <span>{resultPdf ? 'Rebuild Letterhead PDF' : 'Generate Letterhead PDF'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={handleExportWord}
                    className="px-4 py-2.5 rounded-xl border border-blue-500/45 bg-blue-500/12 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isWorking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileType2 className="w-4 h-4" />
                    )}
                    <span>{resultDocx ? 'Re-export in Word (.docx)' : 'Export in Word (.docx)'}</span>
                  </button>

                  {resultPdf && (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerDownload(resultPdf.blob, resultPdf.fileName)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>

                      {onPreviewDocument && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewDocument({
                              title: resultPdf.fileName,
                              fileName: resultPdf.fileName,
                              blob: resultPdf.blob,
                              subtitle: 'Generated Company Letterhead PDF',
                            })
                          }
                          className="px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenInCoverStudio(resultPdf.blob, resultPdf.fileName)}
                        className="px-3.5 py-2.5 rounded-xl border border-[var(--pl-accent)]/50 bg-[var(--pl-accent)]/12 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Add QR Cover</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Direct Mail (mailto:) Box */}
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                        <span>Send Direct via Email (mailto:)</span>
                      </h5>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Opens your default email client pre-filled with your letter subject, body, and company sign-off.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="email"
                      value={mailRecipient}
                      onChange={(e) => setMailRecipient(e.target.value)}
                      placeholder="Recipient email (optional, e.g. partner@company.com)"
                      className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:border-[var(--pl-accent)] focus:outline-none"
                    />
                    <a
                      href={mailtoHref}
                      className="px-4 py-2 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send via Mail</span>
                    </a>
                  </div>
                </div>

                {/* Reusable Preset Saver Card */}
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]" />
                      <span>Reuse This Letterhead Later</span>
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {resolvedEmail
                        ? `Save your logo, colors, company header & signature under ${resolvedEmail} so it loads next time you sign in.`
                        : 'Save your letterhead design in this browser (or sign in with Google to keep it synced to your account).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openSavePresetBar}
                    className="px-3.5 py-2 rounded-lg border border-amber-500/45 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>{activePresetId ? 'Update / Save Preset' : 'Save as Preset'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pinned Bottom Back / Next Step Bar (Mirrors Cover Studio) */}
          <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/90 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as LetterheadStep) : s))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
              Step {step} of {LETTERHEAD_STEPS.length}
            </span>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s < 4 ? ((s + 1) as LetterheadStep) : s))}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] text-xs font-bold shadow-xs cursor-pointer"
              >
                <span>Next: {stepMeta.nextLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isWorking}
                onClick={handleGeneratePdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{resultPdf ? 'Rebuild PDF' : 'Generate PDF'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
