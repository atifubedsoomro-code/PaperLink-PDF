import React, { useEffect, useState } from 'react';
import { typewriterAudio } from '../services/soundEffects';
import { ArrowRight, ExternalLink, CheckCircle2, QrCode, Download, Loader2 } from 'lucide-react';

export interface TypewriterWelcomeProps {
  mode?: 'login' | 'logout' | 'upload-success';
  onComplete: () => void;
  targetUrl?: string;
  onDownloadUpdatedPdf?: () => void;
  isDownloadingPdf?: boolean;
}

export const TypewriterWelcome: React.FC<TypewriterWelcomeProps> = ({
  mode = 'login',
  onComplete,
  targetUrl,
  onDownloadUpdatedPdf,
  isDownloadingPdf = false,
}) => {
  let line1Text = 'Welcome to PaperLink';
  let line2Text = 'Developed with Love by the Team Terminators from Pakistan';
  let statusLabel = 'Signed in with Google';
  let buttonText = 'Continue to Studio';

  if (mode === 'logout') {
    line1Text = 'Goodbye from PaperLink';
    line2Text = 'Developed with Love by the Team Terminators from Pakistan';
    statusLabel = 'Signed out cleanly';
    buttonText = 'Return to App';
  } else if (mode === 'upload-success') {
    line1Text = 'Document Uploaded to Google Drive';
    line2Text = 'Public Viewer Link Live & Encoded in Your QR Cover';
    statusLabel = 'Upload verified';
    buttonText = 'Open File on Google Drive';
  }

  const [displayedLine1, setDisplayedLine1] = useState('');
  const [displayedLine2, setDisplayedLine2] = useState('');
  const [currentLine, setCurrentLine] = useState<1 | 2>(1);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    setDisplayedLine1('');
    setDisplayedLine2('');
    setCurrentLine(1);
    setIsFinished(false);

    const typeLine1 = () => {
      if (index < line1Text.length) {
        const char = line1Text.charAt(index);
        setDisplayedLine1((prev) => prev + char);
        typewriterAudio.playKeyStroke();
        index++;
        timer = setTimeout(typeLine1, 38 + Math.random() * 18);
      } else {
        typewriterAudio.playBell();
        timer = setTimeout(() => {
          setCurrentLine(2);
          index = 0;
          typeLine2();
        }, 320);
      }
    };

    const typeLine2 = () => {
      if (index < line2Text.length) {
        const char = line2Text.charAt(index);
        setDisplayedLine2((prev) => prev + char);
        typewriterAudio.playKeyStroke();
        index++;
        timer = setTimeout(typeLine2, 32 + Math.random() * 14);
      } else {
        typewriterAudio.playBell();
        setIsFinished(true);
      }
    };

    timer = setTimeout(typeLine1, 200);
    return () => clearTimeout(timer);
  }, [line1Text, line2Text]);

  const handleAction = () => {
    if (mode === 'upload-success' && targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#09090b] flex flex-col justify-between items-center p-6 sm:p-12 select-none font-mono">
      <div className="w-full max-w-4xl flex items-center justify-between text-xs border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2.5 text-zinc-900 dark:text-white font-bold">
          <QrCode className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
          <span>PaperLink</span>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-yellow-400 text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-500/40 transition-colors cursor-pointer"
        >
          Skip
        </button>
      </div>

      <div className="w-full max-w-3xl my-auto text-left py-10 px-6 sm:px-10 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {mode === 'upload-success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            )}
            <span>{statusLabel}</span>
          </div>

          <div className="min-h-[52px] sm:min-h-[64px] flex items-center">
            <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
              {displayedLine1}
              {currentLine === 1 && (
                <span className="inline-block w-3 sm:w-3.5 h-7 sm:h-9 bg-amber-500 dark:bg-yellow-400 ml-1.5 align-middle" />
              )}
            </h1>
          </div>

          <div className="min-h-[44px] sm:min-h-[56px] flex items-center pt-1">
            <h2 className="text-base sm:text-xl md:text-2xl font-semibold text-amber-600 dark:text-yellow-400 leading-relaxed">
              {displayedLine2}
              {currentLine === 2 && (
                <span className="inline-block w-2.5 h-5 sm:h-7 bg-amber-500 dark:bg-yellow-400 ml-1.5 align-middle" />
              )}
            </h2>
          </div>

          {mode === 'upload-success' && targetUrl && isFinished && (
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-3">
              <span className="truncate">{targetUrl}</span>
              <span className="text-xs text-amber-700 dark:text-yellow-400 shrink-0 font-bold">
                Public link
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="text-zinc-500">
          {mode === 'upload-success' ? 'Sync complete' : 'Team Terminators · Pakistan'}
        </span>

        {isFinished ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {mode === 'upload-success' && onDownloadUpdatedPdf && (
              <button
                type="button"
                onClick={onDownloadUpdatedPdf}
                disabled={isDownloadingPdf}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white border border-zinc-700 font-bold rounded-xl text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDownloadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                ) : (
                  <Download className="w-4 h-4 text-yellow-400" />
                )}
                <span>{isDownloadingPdf ? 'Preparing PDF...' : 'Download Updated PDF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
            >
              {mode === 'upload-success' && <ExternalLink className="w-4 h-4" />}
              <span>{buttonText}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-zinc-500">Typing...</span>
        )}
      </div>
    </div>
  );
};
