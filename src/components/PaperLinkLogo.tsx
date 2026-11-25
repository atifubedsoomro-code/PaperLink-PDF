import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface PaperLinkLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  animated?: boolean;
  className?: string;
}

const DIMENSIONS = {
  xs: { badge: 'w-6 h-6 rounded-lg', svg: 18, text: 'text-sm' },
  sm: { badge: 'w-8 h-8 rounded-xl', svg: 22, text: 'text-base sm:text-lg' },
  md: { badge: 'w-10 h-10 rounded-xl', svg: 28, text: 'text-xl' },
  lg: { badge: 'w-12 h-12 rounded-2xl', svg: 34, text: 'text-2xl' },
};

/**
 * Redesigned architectural PaperLink brand mark:
 * Precision beveled document corner + optical Cobalt-Gold link clasp + crisp QR finder matrix.
 */
export const PaperLinkLogo: React.FC<PaperLinkLogoProps> = ({
  size = 'sm',
  showWordmark = false,
  animated = true,
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const cfg = DIMENSIONS[size];

  const mark = (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden ${cfg.badge} bg-[linear-gradient(145deg,#0f172a_0%,#1e3a8a_55%,#2563eb_100%)] dark:bg-[linear-gradient(145deg,#facc15_0%,#f59e0b_100%)] border border-blue-400/55 dark:border-yellow-300/75 shadow-[0_6px_18px_-4px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_6px_18px_-4px_rgba(250,204,21,0.42),inset_0_1px_0_rgba(255,255,255,0.65)]`}
      aria-hidden="true"
    >
      {/* Subtle optical sheen */}
      {animated && !prefersReduced && (
        <motion.span
          animate={{ x: ['-130%', '220%'], opacity: [0, 0.55, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 4.5, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        />
      )}

      <svg
        width={cfg.svg}
        height={cfg.svg}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10"
      >
        {/* Document Silhouette with Dog-Ear Fold */}
        <path
          d="M7.5 5.25H18.4L24.5 11.35V25C24.5 26.24 23.49 27.25 22.25 27.25H7.5C6.26 27.25 5.25 26.24 5.25 25V7.5C5.25 6.26 6.26 5.25 7.5 5.25Z"
          className="fill-white dark:fill-zinc-950"
        />
        <path
          d="M18.4 5.25V10.1C18.4 10.79 18.96 11.35 19.65 11.35H24.5L18.4 5.25Z"
          fill="#93C5FD"
          className="dark:fill-amber-400"
        />

        {/* Interlocking Link Clasp Bridging Paper & QR */}
        <path
          d="M10.2 12.2H14.5C15.6 12.2 16.5 13.1 16.5 14.2C16.5 15.3 15.6 16.2 14.5 16.2H11.6"
          stroke="#2563EB"
          className="dark:stroke-yellow-400"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <line
          x1="10"
          y1="19.6"
          x2="13.8"
          y2="19.6"
          stroke="#0F172A"
          className="dark:stroke-zinc-300"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <line
          x1="10"
          y1="22.8"
          x2="12.6"
          y2="22.8"
          stroke="#64748B"
          className="dark:stroke-zinc-500"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Precision QR Finder Node at Bottom-Right */}
        <rect
          x="15.8"
          y="17.8"
          width="6.2"
          height="6.2"
          rx="1.3"
          fill="#0F172A"
          className="dark:fill-yellow-400"
        />
        <rect
          x="17.5"
          y="19.5"
          width="2.8"
          height="2.8"
          rx="0.6"
          fill="#FACC15"
          className="dark:fill-zinc-950"
        />
      </svg>
    </span>
  );

  if (!showWordmark) return <span className={`inline-flex items-center ${className}`}>{mark}</span>;

  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${cfg.text} ${className}`}>
      {mark}
      <span className="text-slate-900 dark:text-white leading-none">
        Paper<span className="text-blue-600 dark:text-yellow-400">Link</span>
      </span>
    </span>
  );
};
