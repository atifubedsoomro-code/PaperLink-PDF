import React, { useState } from 'react';
import {
  X,
  UploadCloud,
  Layout,
  Palette,
  HardDrive,
  Download,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  QrCode,
} from 'lucide-react';
import { AppView } from './Navbar';

interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateView?: (view: AppView) => void;
}

const TUTORIAL_STEPS = [
  {
    stepNum: '01',
    title: 'Upload Your Source Document',
    subtitle: 'PDF, Word (.docx), or plain text',
    description:
      'Start inside Cover Studio by dropping any PDF, Word (.docx), or text file. PaperLink parses pages, auto-converts Word/text docs to PDF, and extracts titles automatically.',
    tip: 'Uploaded a 3-page PDF? Your final merged document automatically becomes 4 pages with Page 1 as your new QR Cover.',
    icon: UploadCloud,
    actionView: 'studio' as AppView,
    actionLabel: 'Go to Cover Studio',
  },
  {
    stepNum: '02',
    title: 'Pick a Visual or Plain Cover Theme',
    subtitle: '22 architectural & ink-friendly plain styles',
    description:
      'Use the fixed right-side Steps Sidebar anytime to step between stages. Choose rich photo-backed headers or pick Plain category sheets tailored for clean black-and-white laser printing.',
    tip: 'Switch themes as often as you like—the pinned preview updates live on screen.',
    icon: Layout,
  },
  {
    stepNum: '03',
    title: 'Customize Colors, Logo & QR Placement',
    subtitle: 'Fonts, optional metadata, and branding',
    description:
      'Dial in presets or individual hex colors, swap display typography, upload an optional organization logo, and place the QR block at bottom-left, bottom-center, or bottom-right.',
    tip: 'Leave any field blank to keep the printed cover minimal—only fields you fill appear on paper.',
    icon: Palette,
  },
  {
    stepNum: '04',
    title: 'Upload to Google Drive & Bind Public QR',
    subtitle: 'Live shareable link encoded into Page 1',
    description:
      'Click Upload & Create Public QR in Step 4. Your source document streams straight into your connected Google Drive with public viewer access enabled and binds immediately to your cover QR code.',
    tip: 'You can also paste an existing Google Drive link directly without re-uploading.',
    icon: HardDrive,
  },
  {
    stepNum: '05',
    title: 'Download Updated Merged PDF & Share',
    subtitle: '1:1 aligned print PDF & instant triggers',
    description:
      'As soon as Drive upload completes, click Download Updated PDF right from the upload confirmation card, the fixed Steps Sidebar, or Step 5 Export to save your combined cover + document PDF.',
    tip: 'All 8 utilities—PDF to Word, Word to PDF, Merge, Compress, Split, Images to PDF, Organize, and Sign & Stamp—run locally in the PDF Tools tab.',
    icon: Download,
    actionView: 'tools' as AppView,
    actionLabel: 'Explore PDF Tools',
  },
];

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  isOpen,
  onClose,
  onNavigateView,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  if (!isOpen) return null;

  const current = TUTORIAL_STEPS[stepIdx];
  const Icon = current.icon;
  const isLast = stepIdx === TUTORIAL_STEPS.length - 1;

  const handleFinish = () => {
    setStepIdx(0);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 dark:bg-black/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-heading"
    >
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-yellow-500/35 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-6">
        {/* Top Bar */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center font-bold">
              <QrCode className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="tutorial-heading" className="text-sm font-bold text-zinc-900 dark:text-white">
                Quick Start Walkthrough
              </h2>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                Step {stepIdx + 1} of {TUTORIAL_STEPS.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-2.5 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            <span>Skip</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress Track */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-5 gap-1.5">
            {TUTORIAL_STEPS.map((st, idx) => (
              <button
                key={st.stepNum}
                type="button"
                onClick={() => setStepIdx(idx)}
                aria-label={`Jump to step ${idx + 1}`}
                className={`h-1.5 rounded-full transition-colors cursor-pointer ${
                  idx <= stepIdx ? 'bg-yellow-400' : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400/15 border border-yellow-500/30 text-amber-600 dark:text-yellow-400 flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-yellow-400 uppercase tracking-wider">
                Step {current.stepNum} · {current.subtitle}
              </span>
              <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white leading-tight mt-0.5">
                {current.title}
              </h3>
            </div>
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {current.description}
          </p>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <span>{current.tip}</span>
          </div>

          {current.actionView && onNavigateView && (
            <button
              type="button"
              onClick={() => {
                onNavigateView(current.actionView!);
                handleFinish();
              }}
              className="text-xs font-bold text-amber-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{current.actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => {
                if (onNavigateView) onNavigateView('studio');
                handleFinish();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finish & Open Studio</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer transition-colors"
            >
              <span>Next Step</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
