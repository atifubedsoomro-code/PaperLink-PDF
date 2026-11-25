import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MiniAiRobot } from './MiniAiRobot';
import { ClipingPapersLogo } from './ClipingPapersLogo';

interface RobotProgressBarProps {
  percent: number;
  status?: string;
  subText?: string;
  compact?: boolean;
  showLogo?: boolean;
  className?: string;
}

/**
 * Interactive loading bar inspired by PaperLink's companion robot physically pushing
 * the glowing progress cap forward with sparks and switching to thumbs-up at 100%.
 */
export const RobotProgressBar: React.FC<RobotProgressBarProps> = ({
  percent,
  status = 'Processing document…',
  subText,
  compact = false,
  showLogo = true,
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const clamped = Math.max(4, Math.min(100, Math.round(percent)));
  const isComplete = clamped >= 99;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border border-blue-200 dark:border-yellow-400/35 bg-white/95 dark:bg-zinc-950/85 backdrop-blur-md shadow-[0_10px_28px_-10px_rgba(37,99,235,0.18)] ${
        compact ? 'p-3 space-y-2' : 'p-4 space-y-3'
      } ${className}`}
    >
      {/* Top Status + Animated Cliping Papers Mark + Progress Percentage */}
      <div className="flex items-center justify-between gap-2.5">
        {showLogo ? (
          <ClipingPapersLogo size="xs" layout="inline" statusText={status} subText={subText} />
        ) : (
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{status}</p>
            {subText && (
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 truncate">{subText}</p>
            )}
          </div>
        )}

        <span className="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[var(--pl-cta-via)] dark:bg-yellow-400 text-[var(--pl-cta-text)] dark:text-black border border-[var(--pl-cta-border)] dark:border-yellow-300 tabular-nums shrink-0 shadow-xs">
          PROGRESS: {clamped}%
        </span>
      </div>

      {/* Recessed Glassy Track + Robot Braced & Pushing the Leading Tip */}
      <div className="relative pt-7 pb-1">
        {/* Moving Robot Positioned Directly Against the Leading Progress Edge */}
        <motion.div
          className="absolute top-0 z-20 pointer-events-none"
          initial={false}
          animate={{ left: `calc(${clamped}% - 10px)` }}
          transition={
            prefersReduced
              ? { duration: 0.05 }
              : { type: 'spring', stiffness: 140, damping: 22 }
          }
          style={{
            transform: 'translateX(-18%)',
          }}
        >
          <MiniAiRobot
            variant="loader"
            expressionOverride={isComplete ? 'thumbs-up' : 'push'}
            sizeClassName="w-11 h-11 overflow-visible drop-shadow-[0_6px_12px_rgba(15,23,42,0.22)]"
          />
        </motion.div>

        {/* Glass Tube Shell */}
        <div className="relative w-full h-4 rounded-full bg-slate-200/80 dark:bg-zinc-900/95 border border-blue-300/60 dark:border-zinc-700/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)] overflow-hidden">
          {/* Glowing Multi-Stop Progress Fill */}
          <motion.div
            initial={false}
            animate={{ width: `${clamped}%` }}
            transition={
              prefersReduced
                ? { duration: 0.05 }
                : { type: 'spring', stiffness: 140, damping: 22 }
            }
            className="relative h-full rounded-full overflow-hidden"
            style={{
              background:
                'linear-gradient(90deg, #0f172a 0%, #1e3a8a 26%, #2563eb 58%, #0ea5e9 84%, #38bdf8 100%)',
              boxShadow: '0 0 14px rgba(var(--pl-accent-rgb), 0.45)',
            }}
          >
            {/* Top Meniscus Highlight */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-1 top-0.5 h-[2px] rounded-full bg-white/45"
            />
            {/* Leading Luminous Energy Cap */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0 inset-y-0 w-3 bg-gradient-to-r from-transparent to-white/90"
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
