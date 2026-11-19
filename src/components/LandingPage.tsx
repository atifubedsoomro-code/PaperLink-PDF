import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Crop,
  Download,
  Edit3,
  Eraser,
  ExternalLink,
  FileCheck2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Files,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  PenTool,
  Play,
  Presentation,
  Puzzle,
  QrCode,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Sliders,
  Table2,
  UploadCloud,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';
import { FeedbackSection } from './FeedbackSection';
import { NeonGlowMode } from './SettingsModal';

interface LandingPageProps {
  onNavigate: (view: AppView | 'batch' | 'library') => void;
  onOpenPdfTool: (tool: PdfToolTab) => void;
  onOpenImageTool: (tool: ImageToolTab) => void;
  onOpenLegal?: (page: 'privacy' | 'terms') => void;
  neonGlowMode?: NeonGlowMode;
  user: User | null;
  accessToken: string | null;
  onLogin: () => void;
  onReconnectWithConsent: () => void;
  isLoggingIn?: boolean;
  feedbackSheetUrl: string;
  onChangeFeedbackSheetUrl: (url: string) => void;
  feedbackWebhookUrl: string;
  onChangeFeedbackWebhookUrl: (url: string) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
}

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const CHROME_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/paperlink-mini-pdf-image/hihihdajfamblhemnmboanfdfegfhocj';

interface DocSlide {
  id: string;
  stepNum: string;
  tabLabel: string;
  title: string;
  whatYouDo: string;
  resultText: string;
}

const ANIMATED_DOCS_SLIDES: DocSlide[] = [
  {
    id: 'upload',
    stepNum: '01',
    tabLabel: 'Upload File',
    title: 'Drop any PDF, Word (.docx), or Text file',
    whatYouDo: 'Select your file — or toggle "Without QR" for zero sign-in.',
    resultText: 'Cover sheet attaches automatically in front of every page.',
  },
  {
    id: 'design-qr',
    stepNum: '02',
    tabLabel: 'Style & Mode',
    title: 'Choose With QR + Drive or Clean Cover Mode',
    whatYouDo: 'Pick a print theme, add your logo, and choose QR + Drive or No Sign-In.',
    resultText: 'Live 1:1 preview updates immediately as you customize.',
  },
  {
    id: 'export',
    stepNum: '03',
    tabLabel: 'Export PDF',
    title: 'Download Your Complete PDF Packet Ready to Print',
    whatYouDo: 'Click Download PDF or run batch folders in one queue.',
    resultText: 'QR copies scan straight to Drive; clean covers export offline.',
  },
];

const PDF_OFFICE_TOOLS: Array<{
  id: PdfToolTab;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pdf-to-word', title: 'PDF to Word', desc: 'Editable .docx text or layout export.', icon: FileType2 },
  { id: 'word-to-pdf', title: 'Word to PDF', desc: 'Convert .docx into paginated PDF.', icon: FileText },
  { id: 'ppt-to-pdf', title: 'PPT to PDF', desc: 'Turn .pptx decks into print PDFs.', icon: Presentation },
  { id: 'ppt-to-image', title: 'PPT to Image', desc: 'Export slides as HD PNG/JPG + ZIP.', icon: ImageIcon },
  { id: 'excel-to-pdf', title: 'Excel to PDF', desc: 'Convert .xlsx/.csv into clean tables.', icon: FileSpreadsheet },
  { id: 'excel-to-image', title: 'Excel to Image', desc: 'Render sheets to crisp table cards.', icon: ImageIcon },
  { id: 'pdf-to-excel', title: 'PDF to Excel', desc: 'Extract tables to .xlsx or .csv.', icon: Table2 },
  { id: 'pdf-to-ppt', title: 'PDF to PPT', desc: 'Build .pptx decks from PDF sheets.', icon: Presentation },
  { id: 'pdf-merge', title: 'PDF Merge', desc: 'Combine multiple PDFs in sequence.', icon: Layers },
  { id: 'pdf-compress', title: 'PDF Compress', desc: 'Live size slider before shrinking.', icon: Minimize2 },
  { id: 'pdf-split', title: 'Split & Extract', desc: 'Extract custom ranges or burst pages.', icon: Scissors },
  { id: 'pdf-edit', title: 'PDF Editor', desc: 'Resizeable text, images, whiteout & ink.', icon: Edit3 },
  { id: 'pdf-sign', title: 'Sign & Stamp', desc: 'Add signatures or approval stamps.', icon: PenTool },
  { id: 'pdf-protect', title: 'Protect / Unlock', desc: 'Lock with passwords or unlock PDFs.', icon: Lock },
  { id: 'pdf-organize', title: 'Organize Pages', desc: 'Rotate 90°, delete, and reorder sheets.', icon: LayoutGrid },
  { id: 'pdf-to-image', title: 'PDF to Image', desc: 'Up to 3× sharp PNG/JPG/WebP + ZIP.', icon: FileImage },
  { id: 'image-to-pdf', title: 'Images to PDF', desc: 'Combine scans into A4/Letter PDF.', icon: ImageIcon },
];

const DESIGNER_IMAGE_TOOLS: Array<{
  id: ImageToolTab;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'bg-remove', title: 'Background Remover', desc: 'Strip backgrounds cleanly with split preview.', icon: Eraser },
  { id: 'bulk-bg-remove', title: 'Bulk BG Remover', desc: 'Batch-cut product shots into one ZIP.', icon: Layers },
  { id: 'pdf-to-image', title: 'PDF to Image', desc: 'Render PDF flyers into sharp images.', icon: FileImage },
  { id: 'resize', title: 'Image Resize', desc: 'Social, print & custom pixel presets.', icon: Maximize2 },
  { id: 'convert', title: 'Format Converter', desc: 'PNG, JPG, WebP, BMP & ICO Favicons.', icon: RefreshCw },
  { id: 'crop', title: 'Crop & Rotate', desc: 'Frame 1:1, 4:5, 16:9, rotate or flip.', icon: Crop },
  { id: 'compress', title: 'Image Compress', desc: 'Live size savings slider to WebP/JPG.', icon: Minimize2 },
  { id: 'filters', title: 'Filters & Palette', desc: 'Color grade & extract top 6 hex codes.', icon: Sliders },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onOpenPdfTool,
  onOpenImageTool,
  onOpenLegal,
  neonGlowMode = 'full',
  accessToken,
  feedbackSheetUrl,
  feedbackWebhookUrl,
  onTaskComplete,
}) => {
  const [docStage, setDocStage] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [activeSuiteTab, setActiveSuiteTab] = useState<'pdf' | 'image'>('pdf');

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setDocStage((prev) => (prev + 1) % ANIMATED_DOCS_SLIDES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const currentDocSlide = ANIMATED_DOCS_SLIDES[docStage];

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors overflow-x-clip">
        {/* 1. HERO + ANIMATED DOCUMENTATION STAGE */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Clear Entry Value Column */}
            <motion.div
              className="lg:col-span-6 flex flex-col justify-center"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono tracking-wider text-amber-700 dark:text-yellow-400 uppercase mb-3 font-semibold">
                Cover Studio · 17 PDF &amp; Office Tools · 8 Image Tools
              </p>

              <h1
                className="font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.08] mb-4"
                style={{ fontSize: 'clamp(2.15rem, 3.8vw, 3.4rem)', textWrap: 'balance' }}
              >
                Give printed documents a scannable QR bridge to Google Drive.
              </h1>

              <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl mb-7">
                Attach a styled QR cover synced to Drive — or toggle <strong className="text-zinc-900 dark:text-white font-semibold">Without QR</strong> to export clean covers offline with zero sign-in. Plus full local PDF, Office, and image suites.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <motion.button
                  type="button"
                  whileHover={{ y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
                >
                  <span>Start Cover Studio</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpenPdfTool('pdf-to-word')}
                  className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 font-semibold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>PDF &amp; Office</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpenImageTool('bg-remove')}
                  className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 font-semibold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Image Studio</span>
                </motion.button>
              </div>

              <div className="mt-8 pt-5 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                  100% browser-private processing
                </span>
                <span aria-hidden="true">·</span>
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-yellow-400 hover:underline transition-colors"
                >
                  <Puzzle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Add Chrome Extension on PC</span>
                  <ExternalLink className="w-3 h-3 opacity-75" />
                </a>
              </div>
            </motion.div>

            {/* Right Interactive "Animated Documentation" Card — Normal Ambient Glow */}
            <motion.div
              className="lg:col-span-6 relative group"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE_OUT_QUINT }}
            >
              {neonGlowMode === 'full' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-tr from-amber-400/12 via-yellow-300/8 to-transparent dark:from-yellow-400/10 dark:via-amber-500/6 dark:to-transparent blur-2xl"
                />
              )}

              <div
                className={`relative rounded-2xl border border-zinc-200/95 dark:border-zinc-800 bg-white dark:bg-[#0e0e14] overflow-hidden ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.04] transition-shadow duration-300 ${
                  neonGlowMode === 'full'
                    ? 'shadow-[0_14px_38px_-12px_rgba(15,23,42,0.12),0_0_24px_-6px_rgba(250,204,21,0.16)] dark:shadow-[0_20px_50px_-14px_rgba(0,0,0,0.65),0_0_28px_-8px_rgba(250,204,21,0.14)]'
                    : 'shadow-lg'
                }`}
              >
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

                {/* Documentation Chrome Header */}
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/90 dark:bg-[#09090d]/95 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      Animated Guide · 3 Steps
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAutoPlaying((p) => !p)}
                    aria-label={isAutoPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isAutoPlaying ? (
                      <>
                        <Pause className="w-3 h-3 text-amber-600 dark:text-yellow-400" />
                        <span>Auto</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 text-amber-600 dark:text-yellow-400" />
                        <span>Paused</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Clickable 3-Stage Tabs */}
                <div className="grid grid-cols-3 border-b border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/60 dark:bg-zinc-950/70">
                  {ANIMATED_DOCS_SLIDES.map((slide, idx) => {
                    const active = idx === docStage;
                    return (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => {
                          setDocStage(idx);
                          setIsAutoPlaying(false);
                        }}
                        className={`relative px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-[#13131a] text-zinc-950 dark:text-white'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono font-bold ${
                              active ? 'text-amber-600 dark:text-yellow-400' : 'text-zinc-400'
                            }`}
                          >
                            {slide.stepNum}
                          </span>
                          <span className="text-xs font-bold truncate">{slide.tabLabel}</span>
                        </div>
                        {active && (
                          <motion.div
                            layoutId="docTabActiveBar"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 dark:bg-yellow-400"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Animated Visual Canvas */}
                <div className="p-5 sm:p-6 min-h-[290px] flex flex-col justify-between gap-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentDocSlide.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
                      className="space-y-4"
                    >
                      {currentDocSlide.id === 'upload' && (
                        <div className="rounded-xl border border-dashed border-yellow-400/70 bg-amber-50/40 dark:bg-zinc-950 p-4 flex flex-col sm:flex-row items-center gap-4">
                          <motion.div
                            animate={{ y: [0, -5, 0] }}
                            transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut' }}
                            className="w-13 h-13 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0 shadow-sm"
                          >
                            <UploadCloud className="w-6 h-6" />
                          </motion.div>
                          <div className="flex-1 min-w-0 w-full space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-zinc-900 dark:text-white">
                              <span className="truncate">Annual_Finance_Report.pdf</span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                                14 Pages
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                              <motion.div
                                initial={{ width: '12%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: 1.1, ease: EASE_OUT_QUINT }}
                                className="h-full bg-yellow-400"
                              />
                            </div>
                            <div className="flex flex-wrap gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                PDF, Word &amp; Text
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                Title Auto-Filled
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentDocSlide.id === 'design-qr' && (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 grid grid-cols-12 gap-4 items-center">
                          <motion.div
                            initial={{ rotate: -2, scale: 0.96 }}
                            animate={{ rotate: 0, scale: 1 }}
                            transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
                            className="col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 shadow-xs space-y-2"
                          >
                            <div className="h-3 w-full rounded bg-yellow-400" />
                            <div className="h-2.5 w-4/5 rounded bg-zinc-800 dark:bg-zinc-200" />
                            <div className="h-2 w-3/5 rounded bg-zinc-300 dark:bg-zinc-700" />
                            <div className="pt-3 flex items-end justify-between">
                              <div className="space-y-1">
                                <div className="h-1.5 w-12 rounded bg-zinc-300 dark:bg-zinc-700" />
                                <div className="h-1.5 w-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                              </div>
                              <motion.div
                                animate={{ scale: [1, 1.08, 1] }}
                                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                className="w-10 h-10 rounded border-2 border-yellow-400 bg-white flex items-center justify-center"
                              >
                                <QrCode className="w-7 h-7 text-zinc-900" />
                              </motion.div>
                            </div>
                          </motion.div>

                          <div className="col-span-7 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-white">
                              <HardDrive className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
                              <span>QR + Drive OR Clean Cover</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold">
                              <span className="px-2 py-1.5 rounded-lg bg-yellow-400 text-black text-center">
                                With QR &amp; Drive
                              </span>
                              <span className="px-2 py-1.5 rounded-lg bg-cyan-400/20 border border-cyan-400/50 text-cyan-700 dark:text-cyan-300 text-center">
                                Without QR
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                              22 print themes, custom brand logo, fonts, and instant mode switching.
                            </p>
                          </div>
                        </div>
                      )}

                      {currentDocSlide.id === 'export' && (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <motion.div
                              initial={{ scale: 0.88, y: 4 }}
                              animate={{ scale: 1, y: 0 }}
                              transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                              className="w-12 h-14 rounded-lg bg-yellow-400 text-black flex flex-col items-center justify-center shrink-0 font-mono font-bold shadow-sm"
                            >
                              <FileCheck2 className="w-5 h-5" />
                              <span className="text-[9px] mt-0.5">PDF</span>
                            </motion.div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                Annual_Report_Cover_Packet.pdf
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Page 1 Cover + All Original Pages Merged
                              </p>
                            </div>
                          </div>

                          <motion.div
                            animate={{ scale: [1, 1.04, 1] }}
                            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                            className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Ready</span>
                          </motion.div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                          {currentDocSlide.title}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                            <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold mb-1">
                              What You Do
                            </span>
                            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {currentDocSlide.whatYouDo}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                            <span className="block text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-yellow-400 font-bold mb-1">
                              What You Get
                            </span>
                            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {currentDocSlide.resultText}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Footer Walkthrough Bar */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {ANIMATED_DOCS_SLIDES.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setDocStage(idx);
                            setIsAutoPlaying(false);
                          }}
                          aria-label={`View step ${s.stepNum}`}
                          className={`h-2 rounded-full transition-all cursor-pointer ${
                            idx === docStage
                              ? 'w-6 bg-yellow-400'
                              : 'w-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('studio')}
                      className="text-xs font-bold text-amber-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Cover Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 2. COVER STUDIO MODES STRIP (QR + DRIVE vs NO SIGN-IN + BATCH/LIBRARY) */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-12 lg:py-14 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <motion.div
              className="flex flex-col md:flex-row md:items-end justify-between gap-4"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-1 font-semibold">
                  Cover Studio Modes
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Two ways to build your document cover.
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('batch')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Files className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Batch Queue</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('library')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Saved Library</span>
                </button>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onNavigate('studio')}
                className="group text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 p-6 flex flex-col justify-between gap-4 transition-colors cursor-pointer shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-950 dark:text-white">
                        With QR Code &amp; Google Drive Upload
                      </h3>
                      <p className="text-[11px] font-mono font-semibold text-amber-700 dark:text-yellow-400 mt-0.5">
                        Google Sign-In Required
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-amber-600 dark:group-hover:text-yellow-400 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Uploads your file straight to your own Google Drive, creates a public viewer link, and prints a live scannable QR code on Page 1.
                </p>
              </motion.button>

              <motion.button
                type="button"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onNavigate('studio')}
                className="group text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-cyan-400 p-6 flex flex-col justify-between gap-4 transition-colors cursor-pointer shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-cyan-400/15 border border-cyan-400/40 text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-950 dark:text-white">
                        Clean Cover Without QR
                      </h3>
                      <p className="text-[11px] font-mono font-semibold text-cyan-700 dark:text-cyan-400 mt-0.5">
                        No Sign-In Needed · 100% Local
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Flip the neon toggle in Cover Studio to design a styled Cover Sheet + merged PDF immediately without connecting any Google account.
                </p>
              </motion.button>
            </div>
          </div>
        </section>

        {/* 3. UNIFIED ANIMATED TOOLKIT EXPLORER (17 PDF/OFFICE + 8 IMAGE TOOLS) */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 py-14 lg:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <motion.div
              className="flex flex-col md:flex-row md:items-end justify-between gap-4"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-1.5 font-semibold">
                  25 Offline Document &amp; Image Utilities
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Switch tools below — everything runs inside your browser.
                </h2>
              </div>

              {/* Animated Category Switcher */}
              <div className="inline-grid grid-cols-2 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 shrink-0 self-start md:self-auto">
                {[
                  { id: 'pdf' as const, label: 'PDF & Office (17)' },
                  { id: 'image' as const, label: 'Image Studio (8)' },
                ].map((tab) => {
                  const isActive = activeSuiteTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSuiteTab(tab.id)}
                      className={`relative px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'text-black'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="landingToolkitTab"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          className="absolute inset-0 rounded-lg bg-yellow-400 shadow-xs"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {activeSuiteTab === 'pdf' ? (
                <motion.div
                  key="pdf-suite-grid"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_QUINT }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
                >
                  {PDF_OFFICE_TOOLS.map((tool, idx) => {
                    const Icon = tool.icon;
                    return (
                      <motion.button
                        key={tool.id}
                        type="button"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: Math.min(idx * 0.02, 0.24), ease: EASE_OUT_QUINT }}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onOpenPdfTool(tool.id)}
                        className="group text-left p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex items-start gap-3.5 shadow-xs hover:shadow-md"
                      >
                        <div className="w-9 h-9 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-zinc-950 dark:text-white group-hover:text-amber-600 dark:group-hover:text-yellow-400 transition-colors truncate">
                            {tool.title}
                          </h3>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-snug line-clamp-2">
                            {tool.desc}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="image-suite-grid"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_QUINT }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
                >
                  {DESIGNER_IMAGE_TOOLS.map((tool, idx) => {
                    const Icon = tool.icon;
                    return (
                      <motion.button
                        key={tool.id}
                        type="button"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: Math.min(idx * 0.025, 0.2), ease: EASE_OUT_QUINT }}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onOpenImageTool(tool.id)}
                        className="group text-left p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex items-start gap-3.5 shadow-xs hover:shadow-md"
                      >
                        <div className="w-9 h-9 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-zinc-950 dark:text-white group-hover:text-amber-600 dark:group-hover:text-yellow-400 transition-colors truncate">
                            {tool.title}
                          </h3>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-snug line-clamp-2">
                            {tool.desc}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 4. DESKTOP CHROME EXTENSION COMPANION */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-12 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 sm:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6"
            >
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider font-semibold">
                  Desktop Browser Extension
                </p>
                <h2
                  className="text-xl sm:text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight"
                  style={{ textWrap: 'balance' }}
                >
                  PaperLink Mini — PDF &amp; Image tools right in Chrome.
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Install the Chrome Web Store companion on Chrome, Edge, or Brave to launch PaperLink tools in one click from any PC tab.
                </p>
              </div>

              <motion.a
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm transition-colors whitespace-nowrap shrink-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              >
                <Puzzle className="w-4 h-4 stroke-[2.25]" />
                <span>Add Chrome Extension</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </motion.a>
            </motion.div>
          </div>
        </section>

        {/* 5. USER FEEDBACK SECTION (Normal Ambient Glow) */}
        <FeedbackSection
          variant="landing"
          accessToken={accessToken}
          sheetUrl={feedbackSheetUrl}
          webhookUrl={feedbackWebhookUrl}
          neonGlowMode={neonGlowMode}
          onTaskComplete={onTaskComplete}
        />

        {/* 6. QUIET FOOTER */}
        <footer className="border-t border-zinc-200 dark:border-zinc-900 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-zinc-600 dark:text-zinc-500">
            <div>
              <p className="font-bold text-zinc-900 dark:text-zinc-300 text-sm">
                Paper<span className="text-amber-600 dark:text-yellow-400">Link</span>
              </p>
              <p className="mt-1">
                Developed by <span className="font-semibold text-zinc-800 dark:text-zinc-300">Team Terminators</span> (Pakistan) · Conversions run locally in your browser.
              </p>
              <p className="mt-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                Lead: Atif Ubed · 2. Sufyan Ali · 3. Muhammad Bilal · 4. Muhammad Arham · 5. Manahil Shamsi
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-zinc-600 dark:text-zinc-400">
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cover Studio
              </button>
              <button
                type="button"
                onClick={() => onOpenPdfTool('pdf-to-word')}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                PDF Tools
              </button>
              <button
                type="button"
                onClick={() => onOpenImageTool('bg-remove')}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                Image Tools
              </button>
              <button
                type="button"
                onClick={() => onNavigate('batch')}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                Batch Queue
              </button>
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-zinc-950 dark:hover:text-white transition-colors"
              >
                <span>Chrome Extension</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => (onOpenLegal ? onOpenLegal('privacy') : onNavigate('privacy'))}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => (onOpenLegal ? onOpenLegal('terms') : onNavigate('terms'))}
                className="hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
};
