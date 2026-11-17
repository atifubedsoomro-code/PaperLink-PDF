import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Crop,
  Download,
  Edit3,
  Eraser,
  FileCheck2,
  FileImage,
  FileText,
  FileType2,
  Files,
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
  QrCode,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Sliders,
  UploadCloud,
} from 'lucide-react';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';

interface LandingPageProps {
  onNavigate: (view: AppView | 'batch' | 'library') => void;
  onOpenPdfTool: (tool: PdfToolTab) => void;
  onOpenImageTool: (tool: ImageToolTab) => void;
  onOpenLegal?: (page: 'privacy' | 'terms') => void;
}

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

interface DocSlide {
  id: string;
  stepNum: string;
  tabLabel: string;
  title: string;
  caption: string;
  whatYouDo: string;
  resultText: string;
}

const ANIMATED_DOCS_SLIDES: DocSlide[] = [
  {
    id: 'upload',
    stepNum: '01',
    tabLabel: 'Upload File',
    title: 'Drop any PDF, Word (.docx), or Text file',
    caption: 'Automatic title parsing, Word-to-PDF conversion, and page indexing',
    whatYouDo: 'Select your report, contract, or thesis from your computer.',
    resultText: 'Page 1 Cover sheet attaches automatically in front of all your pages.',
  },
  {
    id: 'design-qr',
    stepNum: '02',
    tabLabel: 'Cover & QR',
    title: 'Pick a Cover Theme & Link Google Drive',
    caption: 'Live A4 / US Letter preview with customizable logo, colors & Drive QR',
    whatYouDo: 'Choose architectural or clean ink-saving templates and click Upload to Drive.',
    resultText: 'Your public Google Drive viewer link is automatically encoded into Page 1 QR.',
  },
  {
    id: 'export',
    stepNum: '03',
    tabLabel: 'Export & Print',
    title: 'Download Updated PDF Packet Ready for Print',
    caption: 'Plus 11 offline PDF utilities and 8 Graphic Designer image tools built in',
    whatYouDo: 'Click Download Updated PDF, Email Share, or batch-process a whole folder.',
    resultText: 'Paper handouts scan straight to the live cloud document with phone cameras.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onOpenPdfTool,
  onOpenImageTool,
  onOpenLegal,
}) => {
  const [docStage, setDocStage] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);

  // Auto-advance the entry Animated Documentation deck smoothly every 6.5s
  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setDocStage((prev) => (prev + 1) % ANIMATED_DOCS_SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const currentDocSlide = ANIMATED_DOCS_SLIDES[docStage];

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors">
        {/* 1. HERO + ANIMATED DOCUMENTATION STAGE ON ENTRY */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 lg:pt-14 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Clear Entry Value Column */}
            <motion.div
              className="lg:col-span-6 flex flex-col justify-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono tracking-wider text-amber-700 dark:text-yellow-400 uppercase mb-3 font-semibold">
                Cover Studio · Local PDF Toolkit · Image Studio
              </p>

              <h1
                className="font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.08] mb-4"
                style={{ fontSize: 'clamp(2.15rem, 3.8vw, 3.45rem)', textWrap: 'balance' }}
              >
                Give printed documents a scannable QR bridge to Google Drive.
              </h1>

              <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl mb-7">
                New to PaperLink? Follow the live guide on the right, or jump straight into your task: attach smart QR cover pages to PDF/Word files, convert &amp; edit documents locally, or prep crisp graphics for print.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
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
                  <span>PDF &amp; Word Tools</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpenImageTool('bg-remove')}
                  className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 font-semibold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Designer Image Studio</span>
                </motion.button>
              </div>

              <div className="mt-8 pt-5 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                  100% browser-based PDF &amp; Image tools
                </span>
                <span aria-hidden="true">·</span>
                <span>Your Google Drive account stays in your control</span>
              </div>
            </motion.div>

            {/* Right Interactive "Animated Documentation" Card with Neon Lighting */}
            <motion.div
              className="lg:col-span-6 relative group"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE_OUT_QUINT }}
            >
              {/* Ambient Breathing Neon Backlight Halo */}
              <motion.div
                aria-hidden="true"
                animate={{
                  opacity: [0.55, 0.9, 0.55],
                  scale: [0.98, 1.02, 0.98],
                }}
                transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
                className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-tr from-yellow-400/35 via-cyan-400/20 to-amber-500/35 dark:from-yellow-400/30 dark:via-cyan-400/25 dark:to-fuchsia-500/20 blur-2xl"
              />

              {/* Animated Neon Rim Container */}
              <div className="relative p-[1.5px] rounded-2xl bg-gradient-to-br from-yellow-400/80 via-cyan-400/45 to-amber-500/80 shadow-[0_0_28px_rgba(250,204,21,0.28),0_0_54px_rgba(34,211,238,0.16)] dark:shadow-[0_0_36px_rgba(250,204,21,0.34),0_0_68px_rgba(34,211,238,0.22)]">
                {/* Traveling Top Neon Laser Accent */}
                <motion.div
                  aria-hidden="true"
                  animate={{ x: ['-35%', '135%'] }}
                  transition={{ repeat: Infinity, duration: 6.8, ease: 'easeInOut' }}
                  className="pointer-events-none absolute top-0 left-0 h-[2px] w-1/3 bg-gradient-to-r from-transparent via-cyan-300 to-transparent blur-[0.5px] z-20"
                />

                <div className="relative rounded-[14.5px] bg-white/95 dark:bg-[#0d0d12]/95 backdrop-blur-xl overflow-hidden">
                  {/* Documentation Chrome Header */}
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/90 dark:bg-[#09090d]/95 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400 shadow-[0_0_10px_#facc15]" />
                      </span>
                      <QrCode className="w-4 h-4 text-amber-600 dark:text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                        Animated Documentation · How PaperLink Works
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
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-400 via-cyan-400 to-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.9)]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                {/* Animated Interactive Visual Canvas */}
                <div className="p-5 sm:p-6 min-h-[305px] flex flex-col justify-between gap-5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentDocSlide.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
                      className="space-y-4"
                    >
                      {/* Stage Illustration */}
                      {currentDocSlide.id === 'upload' && (
                        <div className="rounded-xl border border-dashed border-yellow-400/70 bg-amber-50/40 dark:bg-zinc-950 p-4 flex flex-col sm:flex-row items-center gap-4">
                          <motion.div
                            animate={{ y: [0, -4, 0] }}
                            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                            className="w-14 h-14 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0 shadow-sm"
                          >
                            <UploadCloud className="w-7 h-7" />
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
                                initial={{ width: '15%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: 1.2, ease: EASE_OUT_QUINT }}
                                className="h-full bg-yellow-400"
                              />
                            </div>
                            <div className="flex flex-wrap gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                PDF &amp; Word Supported
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
                          {/* Mini Live A4 Sheet Mockup */}
                          <div className="col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 shadow-xs space-y-2">
                            <div className="h-3 w-full rounded bg-yellow-400" />
                            <div className="h-2.5 w-4/5 rounded bg-zinc-800 dark:bg-zinc-200" />
                            <div className="h-2 w-3/5 rounded bg-zinc-300 dark:bg-zinc-700" />
                            <div className="pt-3 flex items-end justify-between">
                              <div className="space-y-1">
                                <div className="h-1.5 w-12 rounded bg-zinc-300 dark:bg-zinc-700" />
                                <div className="h-1.5 w-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                              </div>
                              <motion.div
                                animate={{ scale: [1, 1.07, 1] }}
                                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                className="w-10 h-10 rounded border-2 border-yellow-400 bg-white flex items-center justify-center"
                              >
                                <QrCode className="w-7 h-7 text-zinc-900" />
                              </motion.div>
                            </div>
                          </div>

                          {/* Drive Link Sync Visual */}
                          <div className="col-span-7 space-y-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-white">
                              <HardDrive className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
                              <span>Google Drive Public QR Linked</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 truncate">
                              https://drive.google.com/file/d/1PaperLinkQR/view
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                              22 photo &amp; ink-saving themes, custom brand logo, fonts, and movable QR placement.
                            </p>
                          </div>
                        </div>
                      )}

                      {currentDocSlide.id === 'export' && (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <motion.div
                              initial={{ scale: 0.9 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
                              className="w-12 h-14 rounded-lg bg-yellow-400 text-black flex flex-col items-center justify-center shrink-0 font-mono font-bold shadow-sm"
                            >
                              <FileCheck2 className="w-5 h-5" />
                              <span className="text-[9px] mt-0.5">PDF</span>
                            </motion.div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                Annual_Report_with_QR_Cover.pdf
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Page 1 Cover + 14 Original Pages Merged
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5" />
                            <span>Ready</span>
                          </div>
                        </div>
                      )}

                      {/* Clear Plain-English Step Explanation */}
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

                  {/* Footer Walkthrough Action Bar */}
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
                      <span>Try Step 1 Now</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 2. BEGINNER QUICK-START PATHS ("CHOOSE YOUR WORKFLOW") */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-14 lg:py-16 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="max-w-2xl mb-8"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-1.5 font-semibold">
                Easy Starting Point
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                Pick what you want to do in one click.
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Path A: Cover Studio */}
              <motion.div
                whileHover={{ y: -3 }}
                onClick={() => onNavigate('studio')}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 flex flex-col justify-between gap-5 hover:border-yellow-400 transition-colors cursor-pointer shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-yellow-400">
                      MOST POPULAR
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white mb-2">
                    1. Add a QR Cover to Any File
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Best when printing reports, assignments, or brochures. Attaches a styled cover page with a scannable Google Drive QR link so readers always have the digital soft copy.
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1.5">
                  <span>Open Cover Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </motion.div>

              {/* Path B: PDF & Word Tools */}
              <motion.div
                whileHover={{ y: -3 }}
                onClick={() => onOpenPdfTool('pdf-to-word')}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 flex flex-col justify-between gap-5 hover:border-yellow-400 transition-colors cursor-pointer shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-400/15 border border-yellow-400/30 text-amber-700 dark:text-yellow-400 flex items-center justify-center">
                      <Layers className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-zinc-500">
                      11 TOOLS · OFFLINE
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white mb-2">
                    2. Convert, Edit, Merge &amp; Protect PDFs
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Need to turn PDF into Word, shrink file size with a live size slider, insert resizeable text/images, add a signature, or lock a PDF with a password? Everything runs locally.
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1.5">
                  <span>Explore PDF &amp; Word Tools</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </motion.div>

              {/* Path C: Designer Image Studio */}
              <motion.div
                whileHover={{ y: -3 }}
                onClick={() => onOpenImageTool('bg-remove')}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 flex flex-col justify-between gap-5 hover:border-yellow-400 transition-colors cursor-pointer shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-400/15 border border-yellow-400/30 text-amber-700 dark:text-yellow-400 flex items-center justify-center">
                      <Eraser className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-zinc-500">
                      8 TOOLS · DESIGNERS
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white mb-2">
                    3. Cut Out Backgrounds &amp; Prep Images
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Remove backgrounds singly or in bulk ZIP batches, turn PDF pages into high-DPI images, resize for social media, crop, compress with live size savings, and extract color palettes.
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1.5">
                  <span>Open Designer Image Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </motion.div>
            </div>
          </div>
        </section>

        {/* 3. PDF & WORD UTILITY DIRECT LAUNCHERS */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 py-14 lg:py-18">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-1.5 font-semibold">
                  11 Browser-Private PDF Utilities
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Click any document tool to begin immediately.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tools')}
                className="text-sm font-semibold text-amber-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span>Open PDF Tools</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  id: 'pdf-to-word' as PdfToolTab,
                  title: 'PDF to Word (.docx)',
                  desc: 'Extract headings and paragraphs into editable Word text, or keep exact page layouts.',
                  cta: 'Convert PDF',
                  icon: FileType2,
                },
                {
                  id: 'word-to-pdf' as PdfToolTab,
                  title: 'Word to PDF (.pdf)',
                  desc: 'Turn .docx files into clean paginated A4 or US Letter PDFs ready for print or covers.',
                  cta: 'Convert Word',
                  icon: FileText,
                },
                {
                  id: 'pdf-merge' as PdfToolTab,
                  title: 'PDF Merge',
                  desc: 'Combine multiple PDFs in custom sequence with optional page ranges.',
                  cta: 'Merge PDFs',
                  icon: Layers,
                },
                {
                  id: 'pdf-compress' as PdfToolTab,
                  title: 'PDF Compress',
                  desc: 'Drag a quality slider with live approximate size estimate before shrinking.',
                  cta: 'Compress PDF',
                  icon: Minimize2,
                },
                {
                  id: 'pdf-split' as PdfToolTab,
                  title: 'Split & Extract',
                  desc: 'Extract custom page ranges like 1-3, 5 into a clean file or burst every sheet.',
                  cta: 'Split PDF',
                  icon: Scissors,
                },
                {
                  id: 'image-to-pdf' as PdfToolTab,
                  title: 'Images to PDF',
                  desc: 'Combine JPG, PNG, or WebP scans into one A4 or US Letter PDF packet.',
                  cta: 'Build Scan PDF',
                  icon: ImageIcon,
                },
                {
                  id: 'pdf-organize' as PdfToolTab,
                  title: 'Rotate & Organize',
                  desc: 'View page thumbnails, rotate 90°, delete blank sheets, and reorder easily.',
                  cta: 'Organize Pages',
                  icon: LayoutGrid,
                },
                {
                  id: 'pdf-sign' as PdfToolTab,
                  title: 'Sign & Stamp',
                  desc: 'Draw your signature or stamp APPROVED / CONFIDENTIAL onto any page.',
                  cta: 'Sign Document',
                  icon: PenTool,
                },
                {
                  id: 'pdf-edit' as PdfToolTab,
                  title: 'PDF Editor',
                  desc: 'Place resizeable text boxes, resizeable pictures, highlights, whiteout, and ink.',
                  cta: 'Edit PDF',
                  icon: Edit3,
                },
                {
                  id: 'pdf-protect' as PdfToolTab,
                  title: 'Protect PDF',
                  desc: 'Lock PDFs with passwords and print/copy rules, or unlock protected PDFs.',
                  cta: 'Protect / Unlock',
                  icon: Lock,
                },
                {
                  id: 'pdf-to-image' as PdfToolTab,
                  title: 'PDF to Image',
                  desc: 'Render PDF pages at up to 3× print sharpness into PNG, JPG, or WebP + ZIP.',
                  cta: 'Render Pages',
                  icon: FileImage,
                },
              ].map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.35, delay: idx * 0.03, ease: EASE_OUT_QUINT }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onOpenPdfTool(tool.id)}
                    className="group text-left p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex flex-col justify-between gap-4 shadow-xs hover:shadow-md"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-950 dark:text-white group-hover:text-amber-600 dark:group-hover:text-yellow-400 transition-colors">
                        {tool.title}
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        {tool.desc}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1">
                      <span>{tool.cta}</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3B. GRAPHIC DESIGNER IMAGE STUDIO */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-14 lg:py-18 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-1.5 font-semibold">
                  8 Graphic Designer Image Tools
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Cutouts, resizing, crop &amp; optimization ready in seconds.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('image-tools')}
                className="text-sm font-semibold text-amber-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span>Open Image Tools</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  id: 'bg-remove' as ImageToolTab,
                  title: 'Background Remover',
                  desc: 'Strip backgrounds via AI segmentation or color-key with split view & drop shadow.',
                  cta: 'Remove Background',
                  icon: Eraser,
                },
                {
                  id: 'bulk-bg-remove' as ImageToolTab,
                  title: 'Bulk BG Remover',
                  desc: 'Queue product shots or brand marks together and download all cutouts in one ZIP.',
                  cta: 'Run Bulk Cutout',
                  icon: Layers,
                },
                {
                  id: 'pdf-to-image' as ImageToolTab,
                  title: 'PDF to Image',
                  desc: 'Render multi-page flyers or decks into crisp PNG, JPG, or WebP files.',
                  cta: 'Export PDF Pages',
                  icon: FileImage,
                },
                {
                  id: 'resize' as ImageToolTab,
                  title: 'Image Resize',
                  desc: 'Scale in batch with locked aspect ratios and Instagram/YouTube/A4 presets.',
                  cta: 'Resize Images',
                  icon: Maximize2,
                },
                {
                  id: 'convert' as ImageToolTab,
                  title: 'Change Format',
                  desc: 'Convert PNG, JPG, WebP, 24-bit BMP, and multi-resolution ICO Favicons locally.',
                  cta: 'Convert Format',
                  icon: RefreshCw,
                },
                {
                  id: 'crop' as ImageToolTab,
                  title: 'Crop & Rotate',
                  desc: 'Frame exact ratios (1:1, 4:5, 16:9), rotate 90°, and flip horizontally/vertically.',
                  cta: 'Crop Asset',
                  icon: Crop,
                },
                {
                  id: 'compress' as ImageToolTab,
                  title: 'Image Compress',
                  desc: 'Slide quality with live size estimate and convert bulky assets to light WebP/JPG.',
                  cta: 'Compress Files',
                  icon: Minimize2,
                },
                {
                  id: 'filters' as ImageToolTab,
                  title: 'Filters & Hex Palette',
                  desc: 'Adjust exposure, contrast, sharpness, and extract top 6 brand hex color swatches.',
                  cta: 'Grade & Extract',
                  icon: Sliders,
                },
              ].map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.35, delay: idx * 0.03, ease: EASE_OUT_QUINT }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onOpenImageTool(tool.id)}
                    className="group text-left p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex flex-col justify-between gap-4 shadow-xs hover:shadow-md"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-950 dark:text-white group-hover:text-amber-600 dark:group-hover:text-yellow-400 transition-colors">
                        {tool.title}
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        {tool.desc}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1">
                      <span>{tool.cta}</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. SIMPLE 5-STEP COVER STUDIO DOCUMENTATION */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 py-14 lg:py-18 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <motion.div
                className="lg:col-span-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
              >
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">
                  Cover Studio Documentation
                </p>
                <h2
                  className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight mb-4"
                  style={{ textWrap: 'balance' }}
                >
                  First time in Cover Studio? A spotlight guide walks you through it.
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                  Every step stays pinned in your right-hand sidebar while your live A4 or Letter preview updates beside it. When you visit Cover Studio for the first time, PaperLink automatically highlights each section and shows you what to do next.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onNavigate('studio')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm transition-colors cursor-pointer"
                  >
                    <span>Open Cover Studio</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => onNavigate('batch')}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 transition-colors cursor-pointer"
                  >
                    <Files className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                    <span>Or Batch Process Folders</span>
                  </button>
                </div>
              </motion.div>

              <div className="lg:col-span-7 divide-y divide-zinc-200 dark:divide-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-[#111114] px-6 shadow-xs">
                {[
                  {
                    num: '01',
                    title: 'Upload Source Document (Required First Step)',
                    desc: 'Drop a PDF, Word (.docx), or plain text file. Word files convert automatically so every page exports cleanly behind your cover.',
                  },
                  {
                    num: '02',
                    title: 'Select Cover Theme',
                    desc: 'Pick architectural imagery or minimal ink-friendly plain paper layouts tailored for office printers.',
                  },
                  {
                    num: '03',
                    title: 'Customize Colors, Typography & Logo',
                    desc: 'Dial in exact hex values, swap cover fonts, upload a brand mark (or transparent PNG from Image Studio), and place the QR block.',
                  },
                  {
                    num: '04',
                    title: 'Sync Public Link to Google Drive',
                    desc: 'Upload straight to your Google Drive with public viewer access enabled, and encode that live link into Page 1 QR.',
                  },
                  {
                    num: '05',
                    title: 'Download Updated PDF & Distribute',
                    desc: 'Save your complete merged PDF with Page 1 cover prepended to all original pages, or send right away via email.',
                  },
                ].map((step, i) => {
                  const active = activeFlowIndex === i;
                  return (
                    <motion.div
                      key={step.num}
                      initial={{ opacity: 0, x: 10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.35, delay: i * 0.04, ease: EASE_OUT_QUINT }}
                      onMouseEnter={() => setActiveFlowIndex(i)}
                      onClick={() => setActiveFlowIndex(i)}
                      className={`py-4 flex items-start gap-4 transition-opacity cursor-pointer ${
                        active ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <span
                        className={`text-xs font-mono font-bold pt-0.5 tabular-nums transition-colors ${
                          active ? 'text-amber-600 dark:text-yellow-400' : 'text-zinc-400'
                        }`}
                      >
                        {step.num}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{step.title}</h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 5. QUIET FOOTER */}
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
                Lead: Atif Ubed · 2. Sufyan Ali · 3. Muhammad Bilal · 4. Muhammad Arham
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
