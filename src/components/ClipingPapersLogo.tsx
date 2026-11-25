import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface ClipingPapersLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  layout?: 'inline' | 'stacked';
  showWordmark?: boolean;
  statusText?: string;
  subText?: string;
  tone?: 'default' | 'offline';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'w-6 h-6 rounded-lg', svg: 18, title: 'text-xs', status: 'text-[11px]' },
  sm: { box: 'w-8 h-8 rounded-lg', svg: 22, title: 'text-xs', status: 'text-xs' },
  md: { box: 'w-11 h-11 rounded-xl', svg: 30, title: 'text-sm', status: 'text-xs' },
  lg: { box: 'w-14 h-14 rounded-2xl', svg: 38, title: 'text-base', status: 'text-xs' },
};

/**
 * Animated "Cliping Papers" emblem styled cleanly like PaperLink's Black + Yellow badge.
 * Designed to appear ONLY during active loading, result-fetching, AI chatbot thinking,
 * or internet/website connection loss.
 */
export const ClipingPapersLogo: React.FC<ClipingPapersLogoProps> = ({
  size = 'sm',
  layout = 'inline',
  showWordmark = size !== 'xs',
  statusText,
  subText,
  tone = 'default',
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const cfg = SIZE_MAP[size];

  const emblem = (
    <div
      className={`relative shrink-0 ${cfg.box} ${
        tone === 'offline'
          ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 border border-amber-300/90 text-slate-950'
          : 'bg-[linear-gradient(155deg,#1e3a8a_0%,#2563eb_58%,#0284c7_100%)] dark:bg-gradient-to-b dark:from-yellow-300 dark:via-yellow-400 dark:to-amber-400 border border-blue-400/80 dark:border-yellow-300/90 text-white dark:text-zinc-950'
      } flex items-center justify-center overflow-hidden shadow-[0_6px_18px_-4px_rgba(var(--pl-accent-rgb),0.42),inset_0_1px_0_rgba(255,255,255,0.65)]`}
      aria-hidden="true"
    >
      {/* Subtle Liquid Crystal Gloss Sheen */}
      {!prefersReduced && (
        <motion.span
          animate={{ x: ['-130%', '220%'], opacity: [0, 0.7, 0] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: [0.22, 1, 0.36, 1], repeatDelay: 0.35 }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/75 to-transparent"
        />
      )}

      <svg
        width={cfg.svg}
        height={cfg.svg}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 overflow-visible"
      >
        {/* Back Paper Sheet */}
        <motion.g
          animate={
            prefersReduced
              ? undefined
              : {
                  x: [-1.8, 0, -1.8],
                  y: [0.8, 0, 0.8],
                  rotate: [-4, 0, -4],
                }
          }
          transition={{ duration: 1.65, repeat: Infinity, ease: [0.34, 1.4, 0.64, 1] }}
          style={{ transformOrigin: '14px 18px' }}
        >
          <rect
            x="6.5"
            y="8"
            width="13"
            height="16.5"
            rx="2.2"
            fill="#0f172a"
            fillOpacity="0.2"
            stroke="#0f172a"
            strokeWidth="1.6"
          />
        </motion.g>

        {/* Front Crisp Paper Sheet */}
        <motion.g
          animate={
            prefersReduced
              ? undefined
              : {
                  x: [1.2, 0, 1.2],
                  y: [0, -0.6, 0],
                  scaleY: [1, 0.96, 1],
                }
          }
          transition={{ duration: 1.65, repeat: Infinity, ease: [0.34, 1.4, 0.64, 1] }}
          style={{ transformOrigin: '17px 17px' }}
        >
          <rect
            x="10.5"
            y="6.5"
            width="14.5"
            height="18"
            rx="2.3"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="1.75"
          />
          {/* Fetching text lines */}
          <motion.line
            x1="13.5"
            y1="13"
            x2="21.5"
            y2="13"
            stroke="#0f172a"
            strokeWidth="1.6"
            strokeLinecap="round"
            animate={prefersReduced ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.line
            x1="13.5"
            y1="16.8"
            x2="20"
            y2="16.8"
            stroke="#0f172a"
            strokeWidth="1.6"
            strokeLinecap="round"
            animate={prefersReduced ? undefined : { opacity: [0.95, 0.35, 0.95] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.line
            x1="13.5"
            y1="20.6"
            x2="18.2"
            y2="20.6"
            stroke="#2563eb"
            strokeWidth="1.6"
            strokeLinecap="round"
            animate={prefersReduced ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, delay: 0.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.g>

        {/* Elastic Rubber-Snap Paperclip Clamping the Top-Right Corner */}
        <motion.g
          animate={
            prefersReduced
              ? undefined
              : {
                  y: [-4.2, 0.6, -0.4, -4.2],
                  rotate: [-8, 2, 0, -8],
                  scaleY: [1.08, 0.92, 1, 1.08],
                }
          }
          transition={{
            duration: 1.65,
            times: [0, 0.48, 0.72, 1],
            repeat: Infinity,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ transformOrigin: '21.5px 9px' }}
        >
          <path
            d="M19.2 11.4V5.9C19.2 4.35 20.45 3.1 22 3.1C23.55 3.1 24.8 4.35 24.8 5.9V12.2C24.8 13.25 23.95 14.1 22.9 14.1C21.85 14.1 21 13.25 21 12.2V6.6"
            stroke="#facc15"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
      </svg>
    </div>
  );

  if (!showWordmark && !statusText) {
    return <span className={`inline-flex items-center justify-center ${className}`}>{emblem}</span>;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex ${
        layout === 'stacked'
          ? 'flex-col items-center text-center gap-2.5'
          : 'items-center gap-2.5 text-left'
      } ${className}`}
    >
      {emblem}

      <div className={`min-w-0 ${layout === 'stacked' ? 'space-y-0.5' : 'space-y-0.5'}`}>
        {showWordmark && (
          <div
            className={`font-extrabold tracking-tight leading-none flex items-center ${
              layout === 'stacked' ? 'justify-center' : ''
            } gap-1 ${cfg.title}`}
          >
            <span className="text-slate-900 dark:text-white">Cliping</span>
            <span className="text-blue-600 dark:text-yellow-400">Papers</span>
            {tone === 'offline' && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[9px] font-mono uppercase tracking-wider text-amber-800 dark:text-yellow-300">
                Offline
              </span>
            )}
          </div>
        )}

        {statusText && (
          <p
            className={`font-semibold text-zinc-700 dark:text-zinc-200 leading-snug ${cfg.status}`}
          >
            {statusText}
          </p>
        )}

        {subText && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug max-w-md">
            {subText}
          </p>
        )}
      </div>
    </div>
  );
};
