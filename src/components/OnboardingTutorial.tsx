import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  X,
  UploadCloud,
  QrCode,
  Eye,
  Download,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudioStep?: (step: 1 | 2 | 3 | 4 | 5) => void;
}

interface TourStepConfig {
  id: string;
  stepNum: string;
  title: string;
  subtitle: string;
  description: string;
  selectors: string[];
  studioStep?: 1 | 2 | 3 | 4 | 5;
  preferredSide: 'right' | 'left' | 'bottom' | 'top';
  icon: React.ComponentType<{ className?: string }>;
}

const STUDIO_TOUR_STEPS: TourStepConfig[] = [
  {
    id: 'mode-toggle',
    stepNum: '01',
    title: 'Choose QR + Drive or No Sign-In Mode',
    subtitle: 'Neon Mode Switch',
    description:
      'Switch between "With QR & Drive" (sign in once to bind a live Google Drive QR code) or "Without QR" (no Google sign-in needed — build a clean cover + PDF packet offline).',
    selectors: ['[data-tour-target="studio-mode-toggle"]'],
    preferredSide: 'bottom',
    icon: QrCode,
  },
  {
    id: 'upload',
    stepNum: '02',
    title: 'Drop Any PDF, Word, or Text File',
    subtitle: 'Starting Document',
    description:
      'Upload your document here so PaperLink counts pages, extracts the title, and prepares your cover sheet. Notice PaperLink AI stays tucked cleanly at the top-left logo bar whenever you need help.',
    selectors: ['[data-tour-target="studio-upload"]'],
    studioStep: 1,
    preferredSide: 'bottom',
    icon: UploadCloud,
  },
  {
    id: 'preview',
    stepNum: '03',
    title: 'Live 1:1 Print & Page Preview',
    subtitle: 'Real-Time Sheet',
    description:
      'Every change to your theme, typography, logo, or QR mode reflects here at exact A4 / US Letter proportions alongside all attached pages.',
    selectors: ['[data-tour-target="studio-preview"]'],
    preferredSide: 'left',
    icon: Eye,
  },
  {
    id: 'download',
    stepNum: '04',
    title: 'Streamlined Steps & Instant Export',
    subtitle: 'Finish In Seconds',
    description:
      'Step through Theme, Customize (and Drive Sync when With QR is active), then download your finished PDF in the final step.',
    selectors: ['[data-tour-target="studio-sidebar-download"]', '[data-tour-target="studio-sidebar"]', '[data-tour-target="studio-steps-mobile"]'],
    preferredSide: 'left',
    icon: Download,
  },
];

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  isOpen,
  onClose,
  onSelectStudioStep,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const currentStep = STUDIO_TOUR_STEPS[stepIdx];

  const findVisibleTarget = useCallback((selectors: string[]): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 12 && r.height > 12) return el;
    }
    return null;
  }, []);

  const measureTarget = useCallback(() => {
    if (!isOpen || !currentStep) return;
    setViewport({ w: window.innerWidth, h: window.innerHeight });

    const el = findVisibleTarget(currentStep.selectors);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    setTargetRect({
      top: Math.max(4, r.top - pad),
      left: Math.max(4, r.left - pad),
      width: Math.min(window.innerWidth - 8, r.width + pad * 2),
      height: Math.min(window.innerHeight - 8, r.height + pad * 2),
    });
  }, [isOpen, currentStep, findVisibleTarget]);

  // Reset to step 0 whenever opened cleanly
  useEffect(() => {
    if (isOpen) {
      setStepIdx(0);
    }
  }, [isOpen]);

  // Ensure appropriate Studio step is shown & scroll target smoothly into view
  useEffect(() => {
    if (!isOpen || !currentStep) return;
    if (currentStep.studioStep && onSelectStudioStep) {
      onSelectStudioStep(currentStep.studioStep);
    }

    const scrollTimer = setTimeout(() => {
      const el = findVisibleTarget(currentStep.selectors);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 72 || r.bottom > window.innerHeight - 40) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }
      measureTarget();
    }, 80);

    const settleTimer = setTimeout(measureTarget, 320);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(settleTimer);
    };
  }, [isOpen, stepIdx, currentStep, onSelectStudioStep, findVisibleTarget, measureTarget]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measureTarget();
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [isOpen, measureTarget]);

  if (!isOpen || !currentStep) return null;

  const Icon = currentStep.icon;
  const isLast = stepIdx === STUDIO_TOUR_STEPS.length - 1;

  // Calculate anchored popover coordinates near the highlighted target
  const cardWidth = Math.min(360, viewport.w - 24);
  const estimatedCardHeight = 250;
  const gap = 14;

  let popoverTop = Math.round((viewport.h - estimatedCardHeight) / 2);
  let popoverLeft = Math.round((viewport.w - cardWidth) / 2);

  if (targetRect) {
    const canRight = targetRect.left + targetRect.width + gap + cardWidth <= viewport.w - 12;
    const canLeft = targetRect.left - gap - cardWidth >= 12;
    const canBottom = targetRect.top + targetRect.height + gap + estimatedCardHeight <= viewport.h - 12;
    const canTop = targetRect.top - gap - estimatedCardHeight >= 12;

    const place = (side: 'right' | 'left' | 'bottom' | 'top'): boolean => {
      if (side === 'right' && canRight) {
        popoverLeft = targetRect.left + targetRect.width + gap;
        popoverTop = targetRect.top + Math.min(24, targetRect.height * 0.15);
        return true;
      }
      if (side === 'left' && canLeft) {
        popoverLeft = targetRect.left - cardWidth - gap;
        popoverTop = targetRect.top + Math.min(24, targetRect.height * 0.15);
        return true;
      }
      if (side === 'bottom' && canBottom) {
        popoverLeft = targetRect.left;
        popoverTop = targetRect.top + targetRect.height + gap;
        return true;
      }
      if (side === 'top' && canTop) {
        popoverLeft = targetRect.left;
        popoverTop = targetRect.top - estimatedCardHeight - gap;
        return true;
      }
      return false;
    };

    const order: ('right' | 'left' | 'bottom' | 'top')[] = [
      currentStep.preferredSide,
      'bottom',
      'left',
      'right',
      'top',
    ];
    let placed = false;
    for (const side of order) {
      if (place(side)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      popoverLeft = Math.round((viewport.w - cardWidth) / 2);
      popoverTop = Math.max(16, viewport.h - estimatedCardHeight - 20);
    }

    popoverLeft = Math.max(12, Math.min(viewport.w - cardWidth - 12, popoverLeft));
    popoverTop = Math.max(12, Math.min(viewport.h - estimatedCardHeight - 12, popoverTop));
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-tour-heading"
    >
      {/* SVG Spotlight Overlay with Illuminated Cutout */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      >
        <defs>
          <mask id="paperlink-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(9, 9, 11, 0.72)"
          mask="url(#paperlink-spotlight-mask)"
        />
      </svg>

      {/* Crisp Yellow Ring Around Exact Highlighted Portion */}
      {targetRect && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-2xl border-2 border-yellow-400 shadow-[0_0_0_4px_rgba(250,204,21,0.22)] transition-all duration-300 ease-out"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Contextual Floating Popover Positioned Next to the Highlighted Section */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          top: popoverTop,
          left: popoverLeft,
          width: cardWidth,
        }}
        className="fixed z-50 bg-white dark:bg-[#121215] border-2 border-yellow-400 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-out"
      >
        {/* Progress Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-yellow-400 text-black flex items-center justify-center font-mono text-xs font-extrabold">
              {currentStep.stepNum}
            </span>
            <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">
              Cover Studio Guide · {stepIdx + 1} / {STUDIO_TOUR_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Skip studio tour"
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <span>Skip</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400/15 border border-yellow-400/35 text-amber-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 dark:text-yellow-400">
                {currentStep.subtitle}
              </p>
              <h2
                id="studio-tour-heading"
                className="text-sm font-extrabold text-zinc-900 dark:text-white leading-snug mt-0.5"
              >
                {currentStep.title}
              </h2>
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {currentStep.description}
          </p>

          {/* Step Dots */}
          <div className="flex items-center gap-1.5 pt-1">
            {STUDIO_TOUR_STEPS.map((st, idx) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStepIdx(idx)}
                aria-label={`Highlight step ${idx + 1}`}
                className={`flex-1 h-1.5 rounded-full transition-colors cursor-pointer ${
                  idx <= stepIdx ? 'bg-yellow-400' : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Start Creating</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(STUDIO_TOUR_STEPS.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer transition-colors"
            >
              <span>Next Highlight</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
