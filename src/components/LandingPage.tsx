import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Crop,
  Edit3,
  Eraser,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  HardDrive,
  Image as ImageIcon,
  Images,
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
  Sparkles,
  Table2,
  Droplets,
  EyeOff,
  ImagePlus,
  Stamp,
  ScanLine,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';
import { FeedbackSection } from './FeedbackSection';
import { NeonGlowMode } from './SettingsModal';
import { LiquidCrystalButton, LiquidCrystalCard } from './LiquidCrystal';
import { TypewriterButton } from './TypewriterButton';
import { MiniAiRobot } from './MiniAiRobot';
import { PaperLinkLogo } from './PaperLinkLogo';

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

interface MarketingScene {
  id: 'qr-sync' | 'scan-clean' | 'offline-suite';
  tabLabel: string;
  headline: string;
  subline: string;
  ctaLabel: string;
  action: 'studio' | 'scan-crop' | 'tools';
}

const MARKETING_SCENES: MarketingScene[] = [
  {
    id: 'qr-sync',
    tabLabel: 'Smart QR Covers',
    headline: 'Bridge Printed Paperwork to Live Cloud Files',
    subline: 'Every printout carries a crisp custom cover with an instant mobile-scannable Drive QR link — or toggle Clean Cover with zero sign-in.',
    ctaLabel: 'Open Cover Studio',
    action: 'studio',
  },
  {
    id: 'scan-clean',
    tabLabel: 'AI Scan & Clean',
    headline: 'Snap Angled Pages. Flatten into Studio PDFs.',
    subline: 'Auto-detect corners, correct perspective distortion, lift shadows, and strip diagonal watermarks directly in your browser.',
    ctaLabel: 'Try Crop & Scan',
    action: 'scan-crop',
  },
  {
    id: 'offline-suite',
    tabLabel: '32 Offline Tools',
    headline: 'Complete PDF, Office & Image Studio in One Place',
    subline: 'Convert Word, PPT, Excel, merge, compress, remove image backgrounds, and sign documents locally with private client-side speed.',
    ctaLabel: 'Explore All Tools',
    action: 'tools',
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
  { id: 'pdf-add-images', title: 'Add Pictures to PDF', desc: 'Place photos, IDs & logos onto pages.', icon: ImagePlus },
  { id: 'pdf-watermark-remove', title: 'PDF Watermark Remover', desc: 'Clean diagonal stamps & scanner logos.', icon: Droplets },
  { id: 'pdf-watermark-add', title: 'Watermark & Page #', desc: 'Stamp CONFIDENTIAL/DRAFT & page numbers.', icon: Stamp },
  { id: 'pdf-scan-crop', title: 'Crop & Auto-Scan PDF', desc: 'Crop phone photos, flatten shadows & remove watermarks.', icon: ScanLine },
];

const DESIGNER_IMAGE_TOOLS: Array<{
  id: ImageToolTab;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'bg-remove', title: 'Background Remover', desc: 'Strip backgrounds cleanly with split preview.', icon: Eraser },
  { id: 'bulk-bg-remove', title: 'Bulk BG Remover', desc: 'Batch-cut product shots into one ZIP.', icon: Layers },
  { id: 'photo-batch', title: 'Photo Batch Studio', desc: 'Looks, presets, frames, watermarks & ZIP.', icon: Images },
  { id: 'watermark-remove', title: 'Watermark Remover', desc: 'Brush or box erase unwanted text & logos.', icon: Droplets },
  { id: 'blur-redact', title: 'Blur & Redact', desc: 'Hide faces, phones & sensitive info.', icon: EyeOff },
  { id: 'grid-collage', title: 'Photo Grid / IDs', desc: 'Join ID front+back or photo collages.', icon: LayoutGrid },
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
  user,
  accessToken,
  feedbackSheetUrl,
  feedbackWebhookUrl,
  onTaskComplete,
}) => {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [activeSuiteTab, setActiveSuiteTab] = useState<'pdf' | 'image'>('pdf');

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setSceneIdx((prev) => (prev + 1) % MARKETING_SCENES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const currentScene = MARKETING_SCENES[sceneIdx];

  const handleSceneCta = () => {
    if (currentScene.action === 'studio') onNavigate('studio');
    else if (currentScene.action === 'scan-crop') onOpenPdfTool('pdf-scan-crop');
    else onOpenPdfTool('pdf-edit');
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[var(--pl-bg)] text-zinc-900 dark:text-zinc-100 transition-colors overflow-x-clip">
        {/* 1. HERO + EYE-CATCHING MARKETING SHOWCASE STAGE */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 lg:pt-12 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Entry Proposition */}
            <motion.div
              className="lg:col-span-6 flex flex-col justify-center"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono tracking-wider text-amber-700 dark:text-yellow-400 uppercase mb-3 font-semibold">
                Smart Covers · PDF &amp; Office · Image Studio
              </p>

              <h1
                className="font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.08] mb-4"
                style={{ fontSize: 'clamp(2.1rem, 3.8vw, 3.35rem)', textWrap: 'balance' }}
              >
                One Unified Workspace to Create, Edit &amp; Manage All Your Documents.
              </h1>

              <p className="text-base text-zinc-700 dark:text-zinc-400 leading-relaxed max-w-xl mb-7">
                Attach a scannable Google Drive QR cover — or switch on{' '}
                <strong className="text-zinc-950 dark:text-white font-semibold">Clean Cover Only</strong> to export offline in seconds. Plus {PDF_OFFICE_TOOLS.length + DESIGNER_IMAGE_TOOLS.length} browser-private tools for PDFs, Office files, and images.
              </p>

              {/* Primary CTA + Always-Visible Quick Launchers */}
              <div className="flex flex-wrap items-center gap-2.5">
                <LiquidCrystalButton
                  variant="primary"
                  onClick={() => onNavigate('studio')}
                  className="px-6 py-3.5 rounded-xl text-sm whitespace-nowrap shrink-0"
                >
                  <span>Start Cover Studio</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </LiquidCrystalButton>

                <TypewriterButton
                  variant="secondary"
                  size="lg"
                  alwaysExpanded
                  onClick={() => onOpenPdfTool('pdf-edit')}
                  icon={<Edit3 className="w-4 h-4" />}
                  text="PDF & Office"
                  className="whitespace-nowrap shrink-0"
                />

                <TypewriterButton
                  variant="dark"
                  size="lg"
                  alwaysExpanded
                  onClick={() => onOpenPdfTool('pdf-scan-crop')}
                  icon={<ScanLine className="w-4 h-4 text-amber-700 dark:text-yellow-400" />}
                  text="Crop & Scan"
                  className="whitespace-nowrap shrink-0"
                />

                <TypewriterButton
                  variant="dark"
                  size="lg"
                  alwaysExpanded
                  onClick={() => onOpenImageTool('bg-remove')}
                  icon={<Sparkles className="w-4 h-4 text-amber-700 dark:text-yellow-400" />}
                  text="Image Studio"
                  className="whitespace-nowrap shrink-0"
                />
              </div>

              <div className="mt-8 pt-5 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-700 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-yellow-400" />
                  100% browser-private processing
                </span>
                <span aria-hidden="true">·</span>
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-200 hover:text-amber-700 dark:hover:text-yellow-400 hover:underline transition-colors"
                >
                  <Puzzle className="w-3.5 h-3.5 text-amber-700 dark:text-yellow-400" />
                  <span>Add Chrome Extension on PC</span>
                  <ExternalLink className="w-3 h-3 opacity-75" />
                </a>
              </div>
            </motion.div>

            {/* Right Interactive Marketing Showcase Animation */}
            <motion.div
              className="lg:col-span-6 relative group"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE_OUT_QUINT }}
            >
              {neonGlowMode === 'full' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-tr from-blue-600/18 via-sky-400/12 to-transparent dark:from-yellow-400/12 dark:via-amber-500/6 dark:to-transparent blur-2xl"
                />
              )}

              <LiquidCrystalCard
                accentGlow="yellow"
                className={`rounded-2xl overflow-hidden transition-shadow duration-300 ${
                  neonGlowMode === 'full'
                    ? 'shadow-[0_18px_46px_-14px_rgba(15,23,42,0.2),0_0_26px_-6px_rgba(var(--pl-accent-rgb),0.22)] dark:shadow-[0_20px_50px_-14px_rgba(0,0,0,0.65),0_0_28px_-8px_rgba(var(--pl-accent-rgb),0.14)]'
                    : ''
                }`}
              >
                {/* Coolors Studio Ink -> Royal Cobalt -> Sky -> Gold Accent Strip */}
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #0f172a 0%, #1e3a8a 26%, #2563eb 56%, #0ea5e9 82%, #f59e0b 100%)',
                  }}
                />

                {/* Interactive Showcase Switcher Header */}
                <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-[var(--pl-surface-soft)]/75 dark:bg-zinc-950/90 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {MARKETING_SCENES.map((scene, idx) => {
                      const active = idx === sceneIdx;
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          onClick={() => {
                            setSceneIdx(idx);
                            setIsAutoPlaying(false);
                          }}
                          className={`relative px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'text-[var(--pl-cta-text)]'
                              : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="marketingSceneTab"
                              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] shadow-xs"
                            />
                          )}
                          <span className="relative z-10">{scene.tabLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAutoPlaying((p) => !p)}
                    aria-label={isAutoPlaying ? 'Pause showcase animation' : 'Play showcase animation'}
                    className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[var(--pl-surface)] text-zinc-800 dark:text-zinc-200 hover:border-[var(--pl-accent)] cursor-pointer shrink-0 transition-colors"
                    title={isAutoPlaying ? 'Pause loop' : 'Auto-play scenes'}
                  >
                    {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Live Animated Marketing Visual Stage */}
                <div className="p-4 sm:p-5 space-y-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentScene.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
                      className="space-y-4"
                    >
                      {/* Rich Oxford Navy + Royal Cobalt Stage Backdrop */}
                      <div className="relative rounded-2xl overflow-hidden border border-blue-500/40 dark:border-zinc-800 bg-gradient-to-br from-[#0b132b] via-[#0f172a] to-[#1e3a8a] dark:from-zinc-950 dark:via-[#111216] dark:to-zinc-900 p-4 sm:p-5 min-h-[215px] flex items-center justify-center shadow-[inset_0_1px_0_rgba(56,189,248,0.22)]">
                        {/* Subtle Kinetic Mesh Glow */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -top-12 -right-10 w-44 h-44 rounded-full blur-3xl opacity-35"
                          style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }}
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -bottom-10 -left-8 w-36 h-36 rounded-full blur-3xl opacity-30"
                          style={{ background: 'radial-gradient(circle, #2563eb 0%, transparent 70%)' }}
                        />

                        {currentScene.id === 'qr-sync' && (
                          <div className="relative z-10 w-full grid grid-cols-12 gap-3.5 items-center">
                            <div className="col-span-5 relative">
                              {/* Curious Child-Like Robot Peeking & Waving Behind the Cover Sheet */}
                              <div className="absolute -top-6 -left-2 z-0 pointer-events-auto">
                                <MiniAiRobot
                                  variant="hero"
                                  expressionOverride="child-peek"
                                  popupPlacement="below-left"
                                  externalPopup={null}
                                  title="Click to say hi!"
                                  sizeClassName="w-12 h-12 overflow-visible drop-shadow-[0_6px_12px_rgba(0,0,0,0.4)]"
                                />
                              </div>
                              <motion.div
                                initial={{ rotate: -2, y: 4 }}
                                animate={{ rotate: [0, -1, 0], y: [0, -4, 0] }}
                                transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
                                className="relative z-10 bg-white rounded-xl p-3 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.45)] border border-sky-300/60 space-y-2.5"
                              >
                                <div
                                  className="h-2.5 w-full rounded-sm"
                                  style={{ background: 'linear-gradient(90deg, #0f172a, #2563eb, #38bdf8)' }}
                                />
                                <div className="space-y-1.5">
                                  <div className="h-2.5 w-5/6 rounded-sm bg-slate-900" />
                                  <div className="h-1.5 w-3/5 rounded-sm bg-blue-600/65" />
                                </div>

                                <div className="pt-2 flex items-end justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="h-1.5 w-10 rounded bg-slate-400/50" />
                                    <div className="h-1.5 w-8 rounded bg-slate-300/60" />
                                  </div>

                                  <div className="relative w-12 h-12 rounded-lg border-2 border-blue-600 bg-white p-1 flex items-center justify-center overflow-hidden shadow-xs">
                                    <QrCode className="w-8 h-8 text-slate-900" />
                                    <motion.span
                                      aria-hidden="true"
                                      animate={{ y: [-18, 18, -18] }}
                                      transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                                      className="absolute inset-x-0 h-0.5 bg-sky-400 shadow-[0_0_8px_#38bdf8]"
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            </div>

                            <div className="col-span-7 space-y-2.5 text-slate-50">
                              <motion.div
                                animate={{ x: [0, 4, 0] }}
                                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                                className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-sky-300"
                              >
                                <HardDrive className="w-3.5 h-3.5" />
                                <span>Google Drive · Instant Soft Copy</span>
                              </motion.div>

                              <div className="rounded-xl bg-black/25 border border-sky-400/35 p-3 space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold">
                                  <span>Annual_Report_Cover.pdf</span>
                                  <span className="text-sky-300 font-mono">QR Active</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                                  <motion.div
                                    animate={{ x: ['-40%', '100%'] }}
                                    transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut' }}
                                    className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-amber-300"
                                  />
                                </div>
                                <p className="text-[10px] text-slate-200/90 leading-snug">
                                  Scan printed Cover Page 1 with any phone camera to open your live file — or switch to offline Clean Cover.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {currentScene.id === 'scan-clean' && (
                          <div className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="relative flex-1 flex items-center justify-center min-h-[145px]">
                              <motion.div
                                animate={{
                                  rotate: [-6, 0, 0, -6],
                                  skewX: [4, 0, 0, 4],
                                  scale: [0.95, 1.02, 1.02, 0.95],
                                }}
                                transition={{ repeat: Infinity, duration: 4.4, ease: 'easeInOut' }}
                                className="relative w-32 h-40 rounded-xl bg-white border-2 border-sky-400 shadow-[0_14px_30px_rgba(0,0,0,0.45)] p-3 flex flex-col justify-between overflow-hidden"
                              >
                                <div className="space-y-1.5">
                                  <div className="h-2 w-4/5 rounded bg-slate-900" />
                                  <div className="h-1.5 w-full rounded bg-blue-600/45" />
                                  <div className="h-1.5 w-2/3 rounded bg-blue-600/30" />
                                </div>

                                <div className="space-y-1.5">
                                  <div className="h-1.5 w-full rounded bg-slate-400/40" />
                                  <div className="h-1.5 w-5/6 rounded bg-slate-400/40" />
                                </div>

                                <motion.div
                                  animate={{ y: [-160, 170] }}
                                  transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
                                  className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-sky-400/50 to-transparent"
                                />
                              </motion.div>
                            </div>

                            <div className="flex-1 flex flex-col items-center sm:items-start gap-2.5 text-slate-50">
                              <div className="flex items-center gap-2.5">
                                <MiniAiRobot
                                  variant="hero"
                                  expressionOverride="push"
                                  sizeClassName="w-12 h-12 overflow-visible drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
                                />
                                <div>
                                  <p className="text-xs font-extrabold text-sky-300">
                                    Auto-Straighten &amp; Clean
                                  </p>
                                  <p className="text-[11px] text-slate-200">
                                    Removes paper glare &amp; stamps
                                  </p>
                                </div>
                              </div>
                              <div className="w-full h-2.5 rounded-full bg-black/35 border border-sky-400/40 overflow-hidden">
                                <motion.div
                                  animate={{ width: ['18%', '100%', '18%'] }}
                                  transition={{ repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
                                  className="h-full rounded-full"
                                  style={{
                                    background:
                                      'linear-gradient(90deg, #1d4ed8, #2563eb, #38bdf8, #f59e0b)',
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {currentScene.id === 'offline-suite' && (
                          <div className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <MiniAiRobot
                                variant="hero"
                                expressionOverride="thumbs-up"
                                sizeClassName="w-16 h-16 overflow-visible drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]"
                              />
                              <div className="space-y-1 text-slate-50">
                                <p className="text-xs font-mono font-bold text-sky-300">
                                  32 Local Browser Tools
                                </p>
                                <p className="text-sm font-extrabold">Zero Upload Latency</p>
                                <p className="text-[11px] text-slate-200 max-w-[200px]">
                                  Word, PPT, Excel, PDF Merge &amp; Image Studio work privately right on your device.
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 shrink-0 w-full sm:w-auto">
                              {[
                                { label: 'PDF ↔ Office', icon: FileType2 },
                                { label: 'BG Remover', icon: Eraser },
                                { label: 'Sign & Merge', icon: PenTool },
                                { label: 'Compress', icon: Minimize2 },
                              ].map((chip, i) => {
                                const ChipIcon = chip.icon;
                                return (
                                  <motion.div
                                    key={chip.label}
                                    animate={{ y: [0, i % 2 === 0 ? -3 : 3, 0] }}
                                    transition={{
                                      repeat: Infinity,
                                      duration: 2.6 + i * 0.3,
                                      ease: 'easeInOut',
                                    }}
                                    className="px-2.5 py-2 rounded-xl bg-black/30 border border-sky-400/40 text-slate-100 flex items-center gap-1.5 text-[11px] font-bold"
                                  >
                                    <ChipIcon className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                                    <span className="whitespace-nowrap">{chip.label}</span>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Outcome Copy + Primary Action */}
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <h2 className="text-base sm:text-lg font-extrabold text-zinc-950 dark:text-white leading-snug">
                            {currentScene.headline}
                          </h2>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {currentScene.subline}
                          </p>
                        </div>

                        <LiquidCrystalButton
                          variant="primary"
                          onClick={handleSceneCta}
                          className="px-4 py-2.5 rounded-xl text-xs whitespace-nowrap shrink-0 self-start sm:self-end"
                        >
                          <span>{currentScene.ctaLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        </LiquidCrystalButton>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Scene Indicator Progress Dots */}
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {MARKETING_SCENES.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSceneIdx(idx);
                            setIsAutoPlaying(false);
                          }}
                          aria-label={`View ${s.tabLabel}`}
                          className={`h-2 rounded-full transition-all cursor-pointer ${
                            idx === sceneIdx
                              ? 'w-7 bg-blue-600 dark:bg-yellow-400'
                              : 'w-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400'
                          }`}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                      Private in-browser processing
                    </span>
                  </div>
                </div>
              </LiquidCrystalCard>
            </motion.div>
          </div>
        </section>

        {/* 2. UNIFIED ANIMATED TOOLKIT EXPLORER (21 PDF/OFFICE + 11 IMAGE TOOLS) */}
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
                  {PDF_OFFICE_TOOLS.length + DESIGNER_IMAGE_TOOLS.length} Offline Document &amp; Image Utilities
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Switch tools below — everything runs inside your browser.
                </h2>
              </div>

              {/* Animated Category Switcher + Peeking Companion Robot */}
              <div className="relative inline-flex items-center gap-2 shrink-0 self-start md:self-auto">
                <div className="hidden sm:block relative -mr-3 -mt-2 z-0 pointer-events-auto">
                  <MiniAiRobot
                    variant="topbar"
                    expressionOverride={activeSuiteTab === 'pdf' ? 'child-peek' : 'dance'}
                    popupPlacement="below-left"
                    externalPopup={null}
                    title="Click to say hi!"
                    sizeClassName="w-10 h-10 overflow-visible drop-shadow-[0_4px_10px_rgba(0,0,0,0.22)]"
                  />
                </div>
                <div className="relative z-10 inline-grid grid-cols-2 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--pl-surface-soft)] dark:bg-zinc-950">
                  {[
                    { id: 'pdf' as const, label: `PDF & Office (${PDF_OFFICE_TOOLS.length})` },
                    { id: 'image' as const, label: `Image Studio (${DESIGNER_IMAGE_TOOLS.length})` },
                  ].map((tab) => {
                    const isActive = activeSuiteTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveSuiteTab(tab.id)}
                        className={`relative px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'text-[var(--pl-cta-text)]'
                            : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="landingToolkitTab"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] shadow-xs"
                          />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
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
                  {PDF_OFFICE_TOOLS.slice()
                    .sort((a, b) => (a.id === 'pdf-edit' ? -1 : b.id === 'pdf-edit' ? 1 : 0))
                    .map((tool, idx) => {
                      const Icon = tool.icon;
                      const isFeaturedEdit = tool.id === 'pdf-edit';
                      return (
                        <LiquidCrystalCard
                          key={tool.id}
                          asButton
                          interactive
                          accentGlow="yellow"
                          delay={Math.min(idx * 0.02, 0.24)}
                          onClick={() => onOpenPdfTool(tool.id)}
                          className={`group p-4 rounded-2xl ${
                            isFeaturedEdit
                              ? 'sm:col-span-2 lg:col-span-4 !border-2 !border-[var(--pl-accent)] !bg-blue-50/85 dark:!bg-yellow-400/[0.06] hover:!bg-blue-100/70'
                              : ''
                          }`}
                        >
                          <div className={`flex gap-3.5 ${isFeaturedEdit ? 'items-center justify-between' : 'items-start'}`}>
                            <div className="flex items-start gap-3.5 min-w-0 flex-1">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${
                                  isFeaturedEdit
                                    ? 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] shadow-xs'
                                    : 'bg-[var(--pl-accent)]/14 text-blue-700 dark:text-yellow-400 border border-[var(--pl-accent)]/30'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-bold text-zinc-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-yellow-400 transition-colors truncate">
                                  {isFeaturedEdit ? 'Edit PDF — All-in-One Workspace' : tool.title}
                                </h3>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-snug line-clamp-2">
                                  {isFeaturedEdit
                                    ? 'Work on a single PDF with every editing, watermark, scan/crop, organize, compress, security & export tool in one unified sidebar.'
                                    : tool.desc}
                                </p>
                              </div>
                            </div>
                            {isFeaturedEdit && (
                              <span className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] text-xs font-bold shrink-0 shadow-[0_4px_14px_-4px_rgba(var(--pl-accent-rgb),0.45),inset_0_1px_0_rgba(255,255,255,0.4)]">
                                <span>Open PDF Editor</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </LiquidCrystalCard>
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
                    const isFeatured = tool.id === 'bg-remove';
                    return (
                      <LiquidCrystalCard
                        key={tool.id}
                        asButton
                        interactive
                        accentGlow="yellow"
                        delay={Math.min(idx * 0.025, 0.2)}
                        onClick={() => onOpenImageTool(tool.id)}
                        className={`group p-4 rounded-2xl ${
                          isFeatured
                            ? 'sm:col-span-2 !border-2 !border-[var(--pl-accent)] !bg-blue-50/85 dark:!bg-yellow-400/[0.06] hover:!border-blue-700'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${
                              isFeatured
                                ? 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] shadow-xs'
                                : 'bg-[var(--pl-accent)]/14 text-blue-700 dark:text-yellow-400 border border-[var(--pl-accent)]/30'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-zinc-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-yellow-400 transition-colors truncate">
                              {tool.title}
                            </h3>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-snug line-clamp-2">
                              {tool.desc}
                            </p>
                          </div>
                        </div>
                      </LiquidCrystalCard>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 3. DESKTOP CHROME EXTENSION COMPANION */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-[var(--pl-surface-soft)]/80 dark:bg-[var(--pl-surface-soft)] py-12 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
            >
              <LiquidCrystalCard interactive accentGlow="yellow" className="rounded-2xl p-6 sm:p-7">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
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

                  <LiquidCrystalButton
                    variant="primary"
                    href={CHROME_EXTENSION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3.5 rounded-xl text-sm whitespace-nowrap shrink-0"
                  >
                    <Puzzle className="w-4 h-4 stroke-[2.25]" />
                    <span>Add Chrome Extension</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </LiquidCrystalButton>
                </div>
              </LiquidCrystalCard>
            </motion.div>
          </div>
        </section>

        {/* 5. USER FEEDBACK SECTION (Normal Ambient Glow) */}
        <FeedbackSection
          variant="landing"
          userEmail={user?.email || ''}
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
              <PaperLinkLogo size="sm" showWordmark />
              <p className="mt-2">
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
                onClick={() => onOpenPdfTool('pdf-edit')}
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
