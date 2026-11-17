import React, { useRef, useState } from 'react';
import {
  Lock,
  Unlock,
  Upload,
  Download,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import {
  PdfCipherAlgorithm,
  PdfProtectResult,
  PdfUnlockResult,
  inspectPdfSecurity,
  protectPdfWithPassword,
  unlockPdfWithPassword,
} from '../services/pdfSecurity';

import { PreviewTarget } from './DocumentPreviewModal';

interface PdfProtectToolProps {
  onOpenInCoverStudio: (blob: Blob, fileName: string) => void;
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

function measurePasswordStrength(pw: string): { label: string; score: number; color: string } {
  if (!pw) return { label: 'Empty', score: 0, color: 'bg-zinc-300 dark:bg-zinc-700' };
  let score = 1;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Weak', score: 25, color: 'bg-red-500' };
  if (score === 2) return { label: 'Fair', score: 50, color: 'bg-amber-500' };
  if (score === 3) return { label: 'Strong', score: 78, color: 'bg-emerald-500' };
  return { label: 'Very Strong', score: 100, color: 'bg-emerald-500' };
}

export const PdfProtectTool: React.FC<PdfProtectToolProps> = ({
  onOpenInCoverStudio,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'lock' | 'unlock'>('lock');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [docMeta, setDocMeta] = useState<{
    isEncrypted: boolean;
    requiresOpenPassword: boolean;
    pageCount: number | null;
  } | null>(null);

  // Lock fields
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [algorithm, setAlgorithm] = useState<PdfCipherAlgorithm>('AES-256');
  const [printingPerm, setPrintingPerm] = useState<'highResolution' | 'lowResolution' | 'none'>(
    'highResolution'
  );
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowModify, setAllowModify] = useState(false);
  const [allowAnnotate, setAllowAnnotate] = useState(false);
  const [protectResult, setProtectResult] = useState<PdfProtectResult | null>(null);

  // Unlock fields
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockResult, setUnlockResult] = useState<PdfUnlockResult | null>(null);

  const strength = measurePasswordStrength(userPassword);

  const handleSelectFile = async (f: File) => {
    onError(null);
    setSourceFile(f);
    setProtectResult(null);
    setUnlockResult(null);
    setDocMeta(null);
    try {
      const info = await inspectPdfSecurity(f);
      setDocMeta(info);
      if (info.isEncrypted && info.requiresOpenPassword) {
        setMode('unlock');
      }
    } catch (err: any) {
      onError(err?.message || 'Could not inspect PDF file.');
    }
  };

  const handleProtect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceFile) return;
    onError(null);

    if (userPassword.length < 4) {
      onError('Enter an open password of at least 4 characters.');
      return;
    }
    if (userPassword !== confirmPassword) {
      onError('Passwords do not match. Confirm the exact same open password.');
      return;
    }

    setProtectResult(null);
    setIsWorking(true);
    try {
      const res = await protectPdfWithPassword(
        sourceFile,
        {
          userPassword,
          ownerPassword: ownerPassword.trim() || undefined,
          algorithm,
          permissions: {
            printing: printingPerm === 'none' ? false : printingPerm,
            modifying: allowModify,
            copying: allowCopy,
            annotating: allowAnnotate,
            fillingForms: allowAnnotate,
            contentAccessibility: true,
            documentAssembly: allowModify,
          },
        },
        (percent, status) => onProgress({ percent, status })
      );
      setProtectResult(res);
      onTaskComplete?.({
        headline: `PDF Protected with ${algorithm} Encryption`,
        subtext: `${res.fileName} is locked and ready for private download`,
        statusLabel: 'PDF Security Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to encrypt PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceFile) return;
    onError(null);
    setUnlockResult(null);
    setIsWorking(true);
    try {
      const res = await unlockPdfWithPassword(sourceFile, unlockPassword, (percent, status) =>
        onProgress({ percent, status })
      );
      setUnlockResult(res);
      onTaskComplete?.({
        headline: 'PDF Password Protection Removed',
        subtext: `${res.fileName} unlocked cleanly in your browser`,
        statusLabel: 'PDF Decrypt Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to unlock PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Configuration Form */}
      <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              PDF Password Protection &amp; Encryption
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Encrypt PDFs locally using AES-256 cryptography with printing &amp; copying restrictions, or unlock protected PDFs.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMode('lock');
                onError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                mode === 'lock'
                  ? 'bg-yellow-400 text-black'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('unlock');
                onError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                mode === 'unlock'
                  ? 'bg-yellow-400 text-black'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock PDF</span>
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSelectFile(f);
            e.target.value = '';
          }}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleSelectFile(f);
          }}
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
        >
          <Upload className="w-7 h-7 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            {sourceFile ? sourceFile.name : 'Select or drop a PDF file'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
            {sourceFile
              ? `${formatBytes(sourceFile.size)}${
                  docMeta
                    ? docMeta.isEncrypted
                      ? ' · Encrypted PDF detected'
                      : ` · ${docMeta.pageCount} pages (Unencrypted)`
                    : ''
                }`
              : 'Processed 100% in your browser — passwords never leave your device'}
          </p>
        </div>

        {mode === 'lock' ? (
          <form onSubmit={handleProtect} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Open Password (Required to View)
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    required
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Enter strong password"
                    className="w-full pl-3 pr-9 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                    className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {userPassword && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${strength.color}`}
                        style={{ width: `${strength.score}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">{strength.label}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Confirm Open Password
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Owner Permissions Password (Optional)
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Encryption Standard
                </label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as PdfCipherAlgorithm)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                >
                  <option value="AES-256">AES-256 (ISO 32000-2 Recommended)</option>
                  <option value="AES-128">AES-128 (Legacy Reader Compatibility)</option>
                </select>
              </div>
            </div>

            {/* Granular Permission Controls */}
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  Document Restrictions
                </span>
                <select
                  value={printingPerm}
                  onChange={(e) =>
                    setPrintingPerm(e.target.value as 'highResolution' | 'lowResolution' | 'none')
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
                >
                  <option value="highResolution">Printing: High Resolution</option>
                  <option value="lowResolution">Printing: Low Resolution Only</option>
                  <option value="none">Printing: Blocked</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={allowCopy}
                    onChange={(e) => setAllowCopy(e.target.checked)}
                    className="accent-yellow-400 cursor-pointer"
                  />
                  <span>Allow Text Copying</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={allowModify}
                    onChange={(e) => setAllowModify(e.target.checked)}
                    className="accent-yellow-400 cursor-pointer"
                  />
                  <span>Allow Modifying Pages</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={allowAnnotate}
                    onChange={(e) => setAllowAnnotate(e.target.checked)}
                    className="accent-yellow-400 cursor-pointer"
                  />
                  <span>Allow Comments &amp; Forms</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!sourceFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>{isWorking ? 'Encrypting PDF...' : `Protect PDF with ${algorithm}`}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="text-xs">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Current PDF Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="Enter password to remove encryption"
                  className="w-full pl-3 pr-9 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  aria-label={showPasswords ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!sourceFile || !unlockPassword || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              <span>{isWorking ? 'Decrypting PDF...' : 'Unlock & Remove Password'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Right Result & Privacy Card */}
      <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between gap-5">
        {protectResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                PDF Protected ({protectResult.algorithm})
              </h3>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Output File</span>
                <span className="font-mono text-zinc-900 dark:text-white truncate max-w-[190px]">
                  {protectResult.fileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Pages</span>
                <span className="font-mono text-zinc-900 dark:text-white tabular-nums">
                  {protectResult.pageCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Cipher</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {protectResult.algorithm}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Size</span>
                <span className="font-mono text-amber-700 dark:text-yellow-400 tabular-nums">
                  {formatBytes(protectResult.blob.size)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => triggerDownload(protectResult.blob, protectResult.fileName)}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Protected PDF</span>
            </button>
          </div>
        ) : unlockResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">PDF Unlocked</h3>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Output File</span>
                <span className="font-mono text-zinc-900 dark:text-white truncate max-w-[190px]">
                  {unlockResult.fileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Pages</span>
                <span className="font-mono text-zinc-900 dark:text-white tabular-nums">
                  {unlockResult.pageCount}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {onPreviewDocument && (
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument({
                      title: unlockResult.fileName,
                      fileName: unlockResult.fileName,
                      blob: unlockResult.blob,
                      subtitle: `Unlocked PDF · ${unlockResult.pageCount} pages`,
                    })
                  }
                  className="py-2.5 px-3 rounded-xl border border-cyan-400/60 bg-cyan-50/70 dark:bg-cyan-950/30 hover:bg-cyan-400/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => triggerDownload(unlockResult.blob, unlockResult.fileName)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Unlocked</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenInCoverStudio(unlockResult.blob, unlockResult.fileName)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Attach QR Cover</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="my-auto text-center py-8 space-y-3">
            <KeyRound className="w-10 h-10 text-amber-600 dark:text-yellow-400 mx-auto" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Zero-Knowledge Local Encryption
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Your document bytes and passwords stay strictly inside browser memory using native Web Crypto randomness and ISO 32000-2 AES-256 PDF security.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Compatible with Chrome, Acrobat &amp; macOS Preview</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
