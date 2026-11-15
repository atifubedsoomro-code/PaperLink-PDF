import React, { useEffect, useRef, useState } from 'react';
import { typewriterAudio } from '../services/soundEffects';
import { CheckCircle2, QrCode } from 'lucide-react';

export interface TypewriterWelcomeProps {
  mode?: 'login' | 'logout' | 'upload-success' | 'task-complete';
  headline?: string;
  subtext?: string;
  statusLabel?: string;
  targetUrl?: string;
  durationMs?: number;
  onComplete: () => void;
}

export const TypewriterWelcome: React.FC<TypewriterWelcomeProps> = ({
  mode = 'login',
  headline,
  subtext,
  statusLabel: customStatusLabel,
  targetUrl,
  durationMs = 7000,
  onComplete,
}) => {
  // Clamp auto-hide window between 6.0s and 8.0s per user specification
  const safeDurationMs = Math.max(6000, Math.min(8000, durationMs));

  let line1Text = headline || 'Welcome to PaperLink';
  let line2Text = subtext || 'Developed with Love by the Team Terminators from Pakistan';
  let statusText = customStatusLabel || 'Signed in with Google';

  if (mode === 'logout') {
    line1Text = headline || 'Goodbye from PaperLink';
    line2Text = subtext || 'Developed with Love by the Team Terminators from Pakistan';
    statusText = customStatusLabel || 'Signed out cleanly';
  } else if (mode === 'upload-success') {
    line1Text = headline || 'Document Uploaded to Google Drive';
    line2Text = subtext || 'Public Viewer Link Live & Encoded in Your QR Cover';
    statusText = customStatusLabel || 'Upload verified';
  } else if (mode === 'task-complete') {
    line1Text = headline || 'Task Completed Successfully';
    line2Text = subtext || 'Your processed file is ready for download';
    statusText = customStatusLabel || 'Task complete';
  }

  const [displayedLine1, setDisplayedLine1] = useState('');
  const [displayedLine2, setDisplayedLine2] = useState('');
  const [currentLine, setCurrentLine] = useState<1 | 2>(1);
  const [isFinished, setIsFinished] = useState(false);
  const [remainingMs, setRemainingMs] = useState(safeDurationMs);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Typewriter character effect timed smoothly so typing completes within ~3.2s
  useEffect(() => {
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    setDisplayedLine1('');
    setDisplayedLine2('');
    setCurrentLine(1);
    setIsFinished(false);

    const charBudgetMs = Math.min(3400, Math.max(1800, safeDurationMs * 0.46));
    const speed1 = Math.max(24, Math.min(54, Math.floor((charBudgetMs * 0.44) / Math.max(1, line1Text.length))));
    const speed2 = Math.max(20, Math.min(44, Math.floor((charBudgetMs * 0.56) / Math.max(1, line2Text.length))));

    const typeLine1 = () => {
      if (index < line1Text.length) {
        const char = line1Text.charAt(index);
        setDisplayedLine1((prev) => prev + char);
        typewriterAudio.playKeyStroke();
        index++;
        timer = setTimeout(typeLine1, speed1);
      } else {
        typewriterAudio.playBell();
        timer = setTimeout(() => {
          setCurrentLine(2);
          index = 0;
          typeLine2();
        }, 280);
      }
    };

    const typeLine2 = () => {
      if (index < line2Text.length) {
        const char = line2Text.charAt(index);
        setDisplayedLine2((prev) => prev + char);
        typewriterAudio.playKeyStroke();
        index++;
        timer = setTimeout(typeLine2, speed2);
      } else {
        typewriterAudio.playBell();
        setIsFinished(true);
      }
    };

    timer = setTimeout(typeLine1, 180);
    return () => clearTimeout(timer);
  }, [line1Text, line2Text, safeDurationMs]);

  // Smooth 60fps requestAnimationFrame countdown (6–8s) and auto-hide
  useEffect(() => {
    const startTime = performance.now();
    setRemainingMs(safeDurationMs);
    let rafId = 0;

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const left = Math.max(0, safeDurationMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        onCompleteRef.current();
        return;
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [safeDurationMs, line1Text, line2Text]);

  const progressPct = Math.max(0, Math.min(100, (remainingMs / safeDurationMs) * 100));
  const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));

  return (
    <div
      className="fixed inset-0 z-50 bg-white/98 dark:bg-[#09090b]/98 backdrop-blur-md flex flex-col justify-between items-center p-6 sm:p-12 select-none font-mono transition-opacity"
      role="status"
      aria-live="polite"
    >
      {/* Top Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between text-xs border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2.5 text-zinc-900 dark:text-white font-bold">
          <QrCode className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
          <span>PaperLink</span>
        </div>
        <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
          Continuing automatically in {secondsLeft}s
        </span>
      </div>

      {/* Center Typewriter Stage */}
      <div className="w-full max-w-3xl my-auto text-left py-10 px-6 sm:px-10 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span>{statusText}</span>
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
              {currentLine === 2 && !isFinished && (
                <span className="inline-block w-2.5 h-5 sm:h-7 bg-amber-500 dark:bg-yellow-400 ml-1.5 align-middle" />
              )}
            </h2>
          </div>

          {mode === 'upload-success' && targetUrl && isFinished && (
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-3">
              <span className="truncate">{targetUrl}</span>
              <span className="text-xs text-amber-700 dark:text-yellow-400 shrink-0 font-bold">
                Public link bound
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Automatic Countdown Bar Footer (No Manual Next Button) */}
      <div className="w-full max-w-4xl space-y-2.5 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs">
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>
            {mode === 'upload-success'
              ? 'Google Drive QR sync complete'
              : mode === 'task-complete'
              ? 'Local processing finished cleanly'
              : 'Team Terminators · Pakistan'}
          </span>
          <span className="tabular-nums font-semibold text-amber-600 dark:text-yellow-400">
            {isFinished ? `Returning in ${secondsLeft}s...` : 'Typing...'}
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-yellow-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
