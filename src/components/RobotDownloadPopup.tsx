import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Layout,
  Sparkles,
  X,
} from 'lucide-react';
import { MiniAiRobot } from './MiniAiRobot';
import { LiquidCrystalButton } from './LiquidCrystal';
import { typewriterAudio } from '../services/soundEffects';

export interface ReadyDownloadPayload {
  blob: Blob;
  fileName: string;
  fileSizeBytes?: number;
  toolLabel?: string;
  headline?: string;
  subtext?: string;
  openInStudio?: boolean;
}

interface RobotDownloadPopupProps {
  payload: ReadyDownloadPayload | null;
  onClose: () => void;
  onPreview?: (payload: ReadyDownloadPayload) => void;
  onSendToCoverStudio?: (payload: ReadyDownloadPayload) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Ready';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileVisualMeta(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip')) {
    return { ext: 'ZIP', Icon: FileArchive, badgeTone: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-400/40' };
  }
  if (/\.(png|jpe?g|webp|bmp|ico|gif)$/i.test(lower)) {
    return { ext: lower.split('.').pop()?.toUpperCase() || 'IMG', Icon: FileImage, badgeTone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/40' };
  }
  if (/\.(xlsx|xls|csv)$/i.test(lower)) {
    return { ext: lower.split('.').pop()?.toUpperCase() || 'XLSX', Icon: FileSpreadsheet, badgeTone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40' };
  }
  return {
    ext: lower.split('.').pop()?.toUpperCase() || 'PDF',
    Icon: FileText,
    badgeTone: 'bg-blue-500/15 text-blue-700 dark:text-yellow-300 border-blue-400/40 dark:border-yellow-400/40',
  };
}

/**
 * Creative center-screen popup featuring PaperLink's 3D companion robot presenting
 * processed files immediately after the 3-4s typewriter animation completes.
 */
export const RobotDownloadPopup: React.FC<RobotDownloadPopupProps> = ({
  payload,
  onClose,
  onPreview,
  onSendToCoverStudio,
}) => {
  const prefersReduced = useReducedMotion();
  const [hasDownloaded, setHasDownloaded] = useState(false);

  useEffect(() => {
    setHasDownloaded(false);
  }, [payload?.fileName, payload?.fileSizeBytes]);

  useEffect(() => {
    if (!payload) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payload, onClose]);

  const handleDownloadNow = () => {
    if (!payload) return;
    typewriterAudio.unlock();
    const url = URL.createObjectURL(payload.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = payload.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setHasDownloaded(true);
    typewriterAudio.playSoftBell();
  };

  const isPdf = payload ? /\.pdf$/i.test(payload.fileName) : false;
  const isPreviewable = payload
    ? /\.(pdf|png|jpe?g|webp|bmp|gif)$/i.test(payload.fileName)
    : false;
  const meta = getFileVisualMeta(payload?.fileName || 'document.pdf');
  const FileIcon = meta.Icon;

  return (
    <AnimatePresence>
      {payload && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="robot-download-popup-title"
          className="no-print fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 18 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="relative w-full max-w-md rounded-[26px] border border-slate-200/95 dark:border-zinc-700/90 bg-white/95 dark:bg-[var(--pl-surface)]/95 backdrop-blur-2xl shadow-[0_28px_72px_-12px_rgba(15,23,42,0.38),0_0_32px_-8px_rgba(var(--pl-accent-rgb),0.28)] overflow-visible"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close download popup"
              className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Top Creative Robot Stage */}
            <div className="relative pt-5 pb-3 px-6 flex flex-col items-center text-center border-b border-slate-200/80 dark:border-zinc-800 bg-[radial-gradient(ellipse_85%_70%_at_50%_0%,rgba(var(--pl-accent-rgb),0.12),transparent_72%)] rounded-t-[26px]">
              {/* Speech Bubble */}
              <motion.div
                initial={prefersReduced ? undefined : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 dark:bg-yellow-400 text-white dark:text-zinc-950 text-[11px] font-bold shadow-md"
              >
                {hasDownloaded ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-700 shrink-0" />
                    <span>Saved to your device!</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-sky-300 dark:text-zinc-900 shrink-0" />
                    <span>All done! Grab your file below</span>
                  </>
                )}
              </motion.div>

              {/* Animated 3D Robot Presenting the File */}
              <motion.div
                animate={
                  prefersReduced
                    ? undefined
                    : hasDownloaded
                    ? { y: [0, -6, 0], rotate: [0, -3, 3, 0] }
                    : { y: [0, -4, 0] }
                }
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10"
              >
                <MiniAiRobot
                  variant="hero"
                  expressionOverride={hasDownloaded ? 'happy' : 'thumbs-up'}
                  sizeClassName="w-24 h-24 overflow-visible drop-shadow-[0_12px_20px_rgba(15,23,42,0.22)]"
                />
              </motion.div>

              <h3
                id="robot-download-popup-title"
                className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight mt-1"
              >
                {payload.headline || 'Your File Is Ready!'}
              </h3>
              {payload.subtext && (
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 max-w-sm">
                  {payload.subtext}
                </p>
              )}
            </div>

            {/* File Card & Direct One-Click Download CTA */}
            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-950/80 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center shrink-0 ${meta.badgeTone}`}>
                  <FileIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {payload.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                    <span>{meta.ext}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatFileSize(payload.fileSizeBytes ?? payload.blob.size)}</span>
                    {payload.toolLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{payload.toolLabel}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <LiquidCrystalButton
                  variant="primary"
                  onClick={handleDownloadNow}
                  className="w-full py-3.5 px-5 rounded-xl text-sm font-extrabold"
                >
                  {hasDownloaded ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Download Again</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 stroke-[2.5]" />
                      <span>Download File Now</span>
                    </>
                  )}
                </LiquidCrystalButton>

                <div className="flex flex-wrap items-center gap-2">
                  {isPreviewable && onPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        onPreview(payload);
                      }}
                      className="flex-1 min-w-[110px] py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500 dark:hover:border-yellow-400 text-xs font-bold text-slate-700 dark:text-zinc-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-yellow-400" />
                      <span>Preview</span>
                    </button>
                  )}

                  {isPdf && payload.openInStudio !== false && onSendToCoverStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        onSendToCoverStudio(payload);
                        onClose();
                      }}
                      className="flex-1 min-w-[140px] py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500 dark:hover:border-yellow-400 text-xs font-bold text-slate-700 dark:text-zinc-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Layout className="w-3.5 h-3.5 text-blue-600 dark:text-yellow-400" />
                      <span>Add Cover Page</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-900 text-xs font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
