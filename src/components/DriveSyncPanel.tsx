import React, { useState } from 'react';
import {
  HardDrive,
  CheckCircle2,
  Globe2,
  Copy,
  Check,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Link2,
  ExternalLink,
  Download,
  Loader2,
  Clock,
  Smartphone,
} from 'lucide-react';
import { DriveUploadMode, DriveUploadResult } from '../types';
import { TokenExpiryInfo } from '../firebase';
import { TypewriterButton } from './TypewriterButton';
import { ClipingPapersLogo } from './ClipingPapersLogo';

interface DriveSyncPanelProps {
  uploadResult: DriveUploadResult | null;
  isUploading: boolean;
  uploadProgress: { percent: number; status: string };
  onUploadClick: () => void;
  canUpload: boolean;
  needsAuth: boolean;
  onLoginClick: () => void;
  onManualLinkSubmit?: (link: string) => void;
  uploadError?: { code: string; message: string } | null;
  onDownloadMergedPdf?: () => void;
  isDownloadingMerged?: boolean;
  totalPages?: number;
  uploadMode?: DriveUploadMode;
  onUploadModeChange?: (mode: DriveUploadMode) => void;
  tokenExpiry?: TokenExpiryInfo;
  qrDataUrl?: string | null;
}

export const DriveSyncPanel: React.FC<DriveSyncPanelProps> = ({
  uploadResult,
  isUploading,
  uploadProgress,
  onUploadClick,
  canUpload,
  needsAuth,
  onLoginClick,
  onManualLinkSubmit,
  uploadError,
  onDownloadMergedPdf,
  isDownloadingMerged = false,
  totalPages = 1,
  uploadMode = 'merged',
  onUploadModeChange,
  tokenExpiry,
  qrDataUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manualUrl, setManualUrl] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const handleCopyLink = () => {
    if (uploadResult?.webViewLink) {
      navigator.clipboard.writeText(uploadResult.webViewLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyManualLink = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const trimmed = manualUrl.trim();

    if (!trimmed.startsWith('https://drive.google.com') && !trimmed.startsWith('http://drive.google.com')) {
      setManualError('Enter a valid Google Drive share URL (starting with https://drive.google.com).');
      return;
    }

    if (onManualLinkSubmit) {
      onManualLinkSubmit(trimmed);
    }
  };

  return (
    <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xs">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30">
              Step 4
            </span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Save to Google Drive &amp; QR
            </h3>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Save your file to Google Drive so scanning the cover opens it right away
          </p>
        </div>

        {uploadResult && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Public Link Ready
          </span>
        )}
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          type="button"
          onClick={() => setMode('auto')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            mode === 'auto'
              ? 'bg-yellow-400 text-black'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Automatic Drive Upload</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            mode === 'manual'
              ? 'bg-yellow-400 text-black'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Paste Existing Drive Link</span>
        </button>
      </div>

      {/* OAuth 1-Hour Expiry Notice */}
      {tokenExpiry?.hasToken && (tokenExpiry.isExpiringSoon || tokenExpiry.isExpired) && (
        <div
          role="status"
          className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {tokenExpiry.isExpired
                ? 'Your 1-hour Google OAuth session has expired. Refresh to upload to Drive.'
                : `Your Google session expires in ~${tokenExpiry.remainingMinutes} min. Refresh before large uploads.`}
            </span>
          </div>
          <button
            type="button"
            onClick={onLoginClick}
            className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs shrink-0 cursor-pointer"
          >
            Refresh Google Session
          </button>
        </div>
      )}

      {/* Upload failure details */}
      {uploadError && mode === 'auto' && !isUploading && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-200"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
          <div className="space-y-2 min-w-0">
            <p className="font-bold text-red-800 dark:text-red-300">Upload to Google Drive failed</p>
            <p className="break-words leading-relaxed">{uploadError.message}</p>
            {uploadError.code === 'api-disabled' && (
              <a
                href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=245248622910"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-700 dark:text-yellow-400 hover:underline font-semibold"
              >
                <span>Open Google Cloud Console to enable Drive API</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* AUTO MODE */}
      {mode === 'auto' ? (
        <>
          {/* Upload Content Mode Choice: Source vs Merged Packet */}
          {onUploadModeChange && !isUploading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUploadModeChange('merged')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  uploadMode === 'merged'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Upload Merged PDF (With Cover)</p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  QR opens the full {totalPages}-page packet including Page 1 cover.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onUploadModeChange('source')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  uploadMode === 'source'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Upload Source File Only</p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  QR opens the clean original soft copy in Drive.
                </p>
              </button>
            </div>
          )}

          {isUploading ? (
            <div className="p-4 bg-yellow-400/10 rounded-xl border border-yellow-400/40 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <ClipingPapersLogo size="xs" statusText={uploadProgress.status} />
                <span className="font-mono text-xs font-bold text-amber-800 dark:text-yellow-300 tabular-nums shrink-0">
                  {uploadProgress.percent}%
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-300 dark:border-zinc-800">
                <div
                  className="bg-yellow-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Streaming document bytes to Google Drive and setting viewer permissions.
              </p>
            </div>
          ) : uploadResult ? (
            <div className="space-y-3">
              {uploadResult.permissionWarning && (
                <div
                  role="alert"
                  className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-amber-900 dark:text-amber-300">
                      Uploaded, but public viewer access is restricted
                    </p>
                    <p className="break-words leading-relaxed">{uploadResult.permissionWarning}</p>
                  </div>
                </div>
              )}

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700 dark:text-yellow-400 flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    Verified Drive Link (Encoded in QR)
                  </span>
                  <a
                    href={uploadResult.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-700 dark:text-yellow-400 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Verify Link</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={uploadResult.webViewLink}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-black rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0"
                    title="Copy shareable link"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Pre-Print QR Scan Verification Card */}
                {qrDataUrl && (
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <img
                      src={qrDataUrl}
                      alt="Verify QR before printing"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0 bg-white p-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                        Pre-Print Phone Camera Check
                      </p>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                        Scan with your phone camera or test the link in an incognito tab before printing bulk copies.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="text-amber-700 dark:text-yellow-400 hover:underline font-semibold cursor-pointer"
                        >
                          {copied ? 'Public Link Copied' : 'Copy Public Link'}
                        </button>
                        <a
                          href={uploadResult.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1"
                        >
                          <span>Open in New Tab</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {onDownloadMergedPdf && (
                  <button
                    type="button"
                    onClick={onDownloadMergedPdf}
                    disabled={isDownloadingMerged}
                    className="w-full py-2.5 px-4 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold rounded-xl text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isDownloadingMerged ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 stroke-[2.5]" />
                    )}
                    <span>
                      {isDownloadingMerged
                        ? 'Building Updated PDF...'
                        : `Download Updated PDF (${totalPages} ${totalPages === 1 ? 'Page' : 'Pages'})`}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 pt-1">
                <span
                  className={`flex items-center gap-1.5 font-semibold ${
                    uploadResult.publicPermissionGranted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {uploadResult.publicPermissionGranted
                    ? `Anyone with link can view (${uploadResult.uploadMode === 'merged' ? 'Merged PDF' : 'Source file'})`
                    : 'Sharing restricted (see notice above)'}
                </span>
                <button
                  type="button"
                  onClick={onUploadClick}
                  className="text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-yellow-400 inline-flex items-center gap-1 font-semibold text-xs cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-upload
                </button>
              </div>
            </div>
          ) : needsAuth ? (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">
                    Sign in with Google to upload to Drive
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                    Connect your account to save this document in Drive and bind its share link to your QR code.
                  </p>
                </div>
              </div>
              <TypewriterButton
                onClick={onLoginClick}
                variant="primary"
                size="sm"
                icon={<HardDrive className="w-3.5 h-3.5" />}
                text="Connect Drive"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-400/15 text-amber-600 dark:text-yellow-400 flex items-center justify-center border border-yellow-400/30">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">
                    Ready to Sync With Google Drive
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    {uploadMode === 'merged'
                      ? 'Uploads your Cover + Document PDF, sets public access, and updates QR'
                      : 'Uploads your source file, sets public viewer permissions, and updates QR'}
                  </p>
                </div>
              </div>

              <TypewriterButton
                onClick={onUploadClick}
                disabled={!canUpload}
                variant="primary"
                icon={<HardDrive className="w-4 h-4" />}
                text="Upload & Generate QR"
              />
            </div>
          )}
        </>
      ) : (
        /* MANUAL LINK MODE */
        <form
          onSubmit={handleApplyManualLink}
          className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800"
        >
          <div>
            <label className="block text-xs font-bold text-amber-700 dark:text-yellow-400 mb-1.5">
              Paste Google Drive Share Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                required
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-200 focus:border-yellow-400 focus:outline-none"
              />
              <TypewriterButton
                type="submit"
                variant="primary"
                size="sm"
                icon={<Link2 className="w-3.5 h-3.5" />}
                text="Apply Link"
              />
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1.5">
              Ensure sharing on that file is set to &quot;Anyone with the link can view&quot;.
            </p>
          </div>

          {manualError && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{manualError}</span>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
