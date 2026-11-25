import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { typewriterAudio } from '../services/soundEffects';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { PaperLinkLogo } from './PaperLinkLogo';

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
  durationMs = 3500,
  onComplete,
}) => {
  // Snappy 3.0s–4.0s visual typewriter stage while preserving relaxed 1x keystroke sound cadence
  const safeDurationMs = Math.max(3000, Math.min(4000, durationMs));

  let line1Text = headline || 'Welcome to PaperLink';
  let line2Text = subtext || 'Crafted by Team Terminators · Pakistan';
  let statusText = customStatusLabel || 'Signed in with Google';

  if (mode === 'logout') {
    line1Text = headline || 'Goodbye from PaperLink';
    line2Text = subtext || 'Crafted by Team Terminators · Pakistan';
    statusText = customStatusLabel || 'Signed out cleanly';
  } else if (mode === 'upload-success') {
    line1Text = headline || 'Uploaded to Google Drive';
    line2Text = subtext || 'Public viewer link live & bound to QR cover';
    statusText = customStatusLabel || 'Upload verified';
  } else if (mode === 'task-complete') {
    line1Text = headline || 'Task Completed';
    line2Text = subtext || 'Preparing your ready-to-download file…';
    statusText = customStatusLabel || 'Processing finished';
  }

  const [count1, setCount1] = useState(0);
  const [count2, setCount2] = useState(0);
  const [currentLine, setCurrentLine] = useState<1 | 2>(1);
  const [isFinished, setIsFinished] = useState(false);
  const [keyPulse, setKeyPulse] = useState(0);
  const [remainingMs, setRemainingMs] = useState(safeDurationMs);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Visual reveal finishes inside ~2.2s while mechanical keyboard sound stays locked to 1x (~58ms gate)
  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;
    let lastSoundAt = 0;

    setCount1(0);
    setCount2(0);
    setCurrentLine(1);
    setIsFinished(false);
    typewriterAudio.unlock();

    const play1xKey = (isSpaceOrBreak: boolean) => {
      const now = performance.now();
      if (now - lastSoundAt >= 58) {
        typewriterAudio.playKeyStroke(isSpaceOrBreak);
        lastSoundAt = now;
      }
    };

    const typingBudgetMs = Math.max(1450, Math.min(2200, safeDurationMs * 0.62));
    const totalChars = Math.max(1, line1Text.length + line2Text.length);
    const msPerTick = 22;
    const charsPerTick = Math.max(1, Math.ceil((totalChars * msPerTick) / typingBudgetMs));

    let idx1 = 0;
    let idx2 = 0;

    const tickLine1 = () => {
      if (cancelled) return;
      if (idx1 < line1Text.length) {
        idx1 = Math.min(line1Text.length, idx1 + charsPerTick);
        setCount1(idx1);
        setKeyPulse((k) => (k + 1) % 100);
        const ch = line1Text.charAt(idx1 - 1);
        play1xKey(/\s/.test(ch));
        timerId = window.setTimeout(tickLine1, msPerTick);
      } else {
        typewriterAudio.playBell();
        timerId = window.setTimeout(() => {
          if (cancelled) return;
          setCurrentLine(2);
          tickLine2();
        }, 120);
      }
    };

    const tickLine2 = () => {
      if (cancelled) return;
      if (idx2 < line2Text.length) {
        idx2 = Math.min(line2Text.length, idx2 + charsPerTick);
        setCount2(idx2);
        setKeyPulse((k) => (k + 1) % 100);
        const ch = line2Text.charAt(idx2 - 1);
        play1xKey(/\s/.test(ch));
        timerId = window.setTimeout(tickLine2, msPerTick);
      } else {
        typewriterAudio.playSoftBell();
        setIsFinished(true);
      }
    };

    timerId = window.setTimeout(tickLine1, 90);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [line1Text, line2Text, safeDurationMs]);

  // Smooth 60fps requestAnimationFrame countdown (3.0–4.0s) and auto-advance
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

  const displayedLine1 = line1Text.slice(0, count1);
  const displayedLine2 = line2Text.slice(0, count2);
  const progressPct = Math.max(0, Math.min(100, (remainingMs / safeDurationMs) * 100));
  const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 bg-white/97 dark:bg-[var(--pl-bg)]/97 backdrop-blur-md flex flex-col justify-between items-center p-4 sm:p-8 select-none font-mono"
      role="status"
      aria-live="polite"
    >
      {/* Top Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-zinc-800 pb-3.5">
        <PaperLinkLogo size="xs" showWordmark animated={false} />

        <div className="flex items-center gap-3">
          <span className="text-slate-500 dark:text-zinc-400 tabular-nums hidden sm:inline">
            {mode === 'task-complete' ? `Opening download in ${secondsLeft}s` : `Continuing in ${secondsLeft}s`}
          </span>
          <button
            type="button"
            onClick={() => onCompleteRef.current()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 hover:border-blue-500 dark:hover:border-yellow-400 text-[11px] font-bold text-slate-800 dark:text-zinc-200 cursor-pointer transition-colors"
          >
            <span>Continue</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Center Mechanical Typewriter Stage */}
      <motion.div
        animate={{ y: keyPulse % 2 === 0 ? 0 : 0.6 }}
        transition={{ duration: 0.05 }}
        className="w-full max-w-3xl my-auto text-left py-8 px-5 sm:py-10 sm:px-10 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-lg relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/70 dark:via-yellow-400/70 to-transparent"
        />
        <div className="space-y-4 sm:space-y-5">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{statusText}</span>
          </div>

          <div className="min-h-[48px] sm:min-h-[60px] flex items-center">
            <h1 className="text-xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight break-words">
              {displayedLine1}
              {currentLine === 1 && (
                <motion.span
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{ duration: 0.68, repeat: Infinity, times: [0, 0.48, 0.52, 1] }}
                  className="inline-block w-2.5 sm:w-3.5 h-6 sm:h-9 bg-blue-600 dark:bg-yellow-400 ml-1.5 align-middle rounded-[2px]"
                />
              )}
            </h1>
          </div>

          <div className="min-h-[40px] sm:min-h-[52px] flex items-center pt-1">
            <h2 className="text-sm sm:text-xl md:text-2xl font-semibold text-blue-700 dark:text-yellow-400 leading-relaxed break-words">
              {displayedLine2}
              {currentLine === 2 && !isFinished && (
                <motion.span
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{ duration: 0.68, repeat: Infinity, times: [0, 0.48, 0.52, 1] }}
                  className="inline-block w-2 sm:w-2.5 h-4 sm:h-7 bg-blue-600 dark:bg-yellow-400 ml-1.5 align-middle rounded-[2px]"
                />
              )}
            </h2>
          </div>

          {mode === 'upload-success' && targetUrl && isFinished && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-mono text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-3"
            >
              <span className="truncate">{targetUrl}</span>
              <span className="text-xs text-blue-700 dark:text-yellow-400 shrink-0 font-bold">
                Public link bound
              </span>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Automatic Countdown Bar Footer */}
      <div className="w-full max-w-4xl space-y-2.5 pt-3.5 border-t border-slate-200 dark:border-zinc-800 text-xs">
        <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
          <span>
            {mode === 'upload-success'
              ? 'Google Drive QR sync complete'
              : mode === 'task-complete'
              ? 'Preparing center download card'
              : 'Team Terminators · Pakistan'}
          </span>
          <span className="tabular-nums font-semibold text-blue-700 dark:text-yellow-400">
            {isFinished ? `Ready (${secondsLeft}s)…` : 'Typing…'}
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-blue-600 dark:bg-yellow-400 transition-[width] duration-75 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};
