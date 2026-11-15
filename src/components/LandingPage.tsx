import React, { useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import {
  ArrowRight,
  FileText,
  FileType2,
  Files,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Minimize2,
  PenTool,
  QrCode,
  Scissors,
  ShieldCheck,
  Edit3,
  Lock,
  FileImage,
  Eraser,
  Maximize2,
  RefreshCw,
  Crop,
  Sliders,
} from 'lucide-react';
import heroStudioImg from '../assets/images/hero_qr_studio_1794726300193.jpg';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';

interface LandingPageProps {
  onNavigate: (view: AppView) => void;
  onOpenPdfTool: (tool: PdfToolTab) => void;
  onOpenImageTool: (tool: ImageToolTab) => void;
  onOpenLegal?: (page: 'privacy' | 'terms') => void;
}

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onOpenPdfTool,
  onOpenImageTool,
  onOpenLegal,
}) => {
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors">
        {/* 1. HERO SECTION */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 lg:pt-16 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Argument Column */}
            <motion.div
              className="lg:col-span-6 flex flex-col justify-center"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono tracking-wider text-amber-700 dark:text-yellow-400 uppercase mb-4 font-semibold">
                Cover Studio · Drive QR Sync · Document Utilities
              </p>

              <h1
                className="font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.08] mb-5"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
              >
                Print documents with a live QR bridge to Google Drive.
              </h1>

              <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl mb-8">
                Attach tailored cover pages synced to public Google Drive viewer links, batch process folders, convert between PDF and Word, merge files, or compress oversized reports directly in your browser.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 shadow-sm"
                >
                  <span>Open Cover Studio</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpenPdfTool('pdf-to-word')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-white text-zinc-800 dark:text-zinc-300 font-semibold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                >
                  <span>PDF &amp; Word Tools</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpenImageTool('bg-remove')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-yellow-400 text-zinc-800 dark:text-zinc-300 font-semibold text-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                >
                  <span>Designer Image Studio</span>
                </motion.button>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                  Client-side PDF & Word processing
                </span>
                <span aria-hidden="true">·</span>
                <span>Direct OAuth upload to your own Google Drive</span>
                <span aria-hidden="true">·</span>
                <span>A4 & US Letter print geometry</span>
              </div>
            </motion.div>

            {/* Right Dominant Hero Visual */}
            <motion.div
              className="lg:col-span-6"
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT_QUINT }}
            >
              <div className="relative h-full min-h-[280px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-900 shadow-lg">
                <img
                  src={heroStudioImg}
                  alt="Printed minimalist black and warm-yellow bound business dossiers prepared with PaperLink"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
                />
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.3, ease: EASE_OUT_QUINT }}
                  className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4"
                >
                  <div>
                    <p className="text-xs font-mono text-yellow-400 uppercase tracking-wider font-semibold">
                      Verified Print Workflow
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      Page 1 cover prepended automatically to existing multi-page PDFs
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 2. CAPABILITIES ASYMMETRIC BENTO GRID */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-16 lg:py-20 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="max-w-2xl mb-10"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">
                Core Capabilities
              </p>
              <h2
                className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Built for clean physical handouts and instant digital access.
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Wide Marquee Feature Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: 0.05, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-7 flex flex-col justify-between gap-6 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-xs font-mono text-amber-700 dark:text-yellow-400 font-semibold">
                      01. Cover Page Studio
                    </span>
                    <QrCode className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-950 dark:text-white mb-2">
                    Live Multi-Page Preview With Verified Drive QR Codes
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                    Inspect page 1 alongside every original page of your PDF in real time. Choose from photo-backed architectural themes or crisp ink-friendly plain paper layouts, customize typography, upload your organization logo, and place the QR code anywhere on the sheet.
                  </p>
                </div>
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>22 curated themes · 7 plain layouts · Exact 1:1 print export</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('studio')}
                    className="text-amber-700 dark:text-yellow-400 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Start designing</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>

              {/* Drive Sync Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: 0.1, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-7 flex flex-col justify-between gap-6 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-xs font-mono text-amber-700 dark:text-yellow-400 font-semibold">
                      02. Google Drive Sync
                    </span>
                    <HardDrive className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-950 dark:text-white mb-2">
                    Real Public Viewer Permissions
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Uploads stream straight to your Google account with byte-size verification and automatic public-reader permissions, so anyone scanning the printed cover opens the live file immediately.
                  </p>
                </div>
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-400">
                  OAuth 2.0 scope check · Instant updated PDF export
                </div>
              </motion.div>

              {/* Batch Processing Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: 0.14, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-7 flex flex-col justify-between gap-6 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-xs font-mono text-amber-700 dark:text-yellow-400 font-semibold">
                      03. Batch Processor
                    </span>
                    <Files className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-950 dark:text-white mb-2">
                    Queue Multiple Files Simultaneously
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Drop an entire folder of PDF or Word reports, apply one visual cover system across every file, push them to Drive, and export merged packets in one pass.
                  </p>
                </div>
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => onNavigate('batch')}
                    className="text-xs text-amber-700 dark:text-yellow-400 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open batch queue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>

              {/* Utility Suite Summary Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: 0.18, ease: EASE_OUT_QUINT }}
                whileHover={{ y: -3 }}
                className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-7 flex flex-col justify-between gap-6 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-xs font-mono text-amber-700 dark:text-yellow-400 font-semibold">
                      04. Document Utility Suite
                    </span>
                    <Layers className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
                  </div>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white mb-2">
                  Convert, Edit, Protect &amp; Organize Without Leaving Your Browser
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                  Prepare files before generating covers or run standalone office tasks: turn PDFs into editable Word files, convert Word or image packs to PDF, add resizeable text or pictures in the visual PDF editor, lock files with AES-256 passwords, merge, split, rotate/delete pages, compress heavy scans, and apply signatures locally.
                </p>
                </div>
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>Zero server upload for local conversions · Instant Cover Studio handoff</span>
                  <button
                    type="button"
                    onClick={() => onOpenPdfTool('pdf-merge')}
                    className="text-amber-700 dark:text-yellow-400 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open 11-tool PDF utility suite</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* 3. PDF & WORD UTILITY DIRECT LAUNCHERS */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">
                  Included Document Tools
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Eleven everyday PDF utilities, ready to run locally.
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
                  desc: 'Extract headings and paragraphs into editable Word text, or preserve visual layout per page.',
                  cta: 'Convert PDF',
                  icon: FileType2,
                },
                {
                  id: 'word-to-pdf' as PdfToolTab,
                  title: 'Word to PDF (.pdf)',
                  desc: 'Turn .docx files into paginated A4 or US Letter PDFs ready for cover attachment.',
                  cta: 'Convert Word',
                  icon: FileText,
                },
                {
                  id: 'pdf-merge' as PdfToolTab,
                  title: 'PDF Merge',
                  desc: 'Combine multiple PDFs in custom sequence with optional per-file page ranges.',
                  cta: 'Merge PDFs',
                  icon: Layers,
                },
                {
                  id: 'pdf-compress' as PdfToolTab,
                  title: 'PDF Compress',
                  desc: 'Shrink bulky PDFs via lossless stream packing or controlled-DPI page re-encoding.',
                  cta: 'Compress PDF',
                  icon: Minimize2,
                },
                {
                  id: 'pdf-split' as PdfToolTab,
                  title: 'Split & Extract',
                  desc: 'Extract custom page ranges like 1-3, 5 into a clean file or burst every page separately.',
                  cta: 'Split PDF',
                  icon: Scissors,
                },
                {
                  id: 'image-to-pdf' as PdfToolTab,
                  title: 'Images to PDF',
                  desc: 'Combine JPG, PNG, or WebP scans into a paginated A4 or US Letter PDF packet.',
                  cta: 'Build Scan PDF',
                  icon: ImageIcon,
                },
                {
                  id: 'pdf-organize' as PdfToolTab,
                  title: 'Rotate & Organize',
                  desc: 'Preview thumbnails, rotate individual pages 90°, delete unwanted sheets, and reorder.',
                  cta: 'Organize Pages',
                  icon: LayoutGrid,
                },
                {
                  id: 'pdf-sign' as PdfToolTab,
                  title: 'Sign & Stamp',
                  desc: 'Draw your signature or stamp APPROVED / CONFIDENTIAL directly onto any PDF page.',
                  cta: 'Sign Document',
                  icon: PenTool,
                },
                {
                  id: 'pdf-edit' as PdfToolTab,
                  title: 'PDF Editor',
                  desc: 'Add resizeable text, resizeable pictures, highlights, whiteout boxes, ink drawings, and stamps.',
                  cta: 'Edit PDF',
                  icon: Edit3,
                },
                {
                  id: 'pdf-protect' as PdfToolTab,
                  title: 'Protect PDF',
                  desc: 'Lock PDFs with AES-256 passwords and print/copy rules, or unlock encrypted PDFs locally.',
                  cta: 'Protect / Unlock',
                  icon: Lock,
                },
                {
                  id: 'pdf-to-image' as PdfToolTab,
                  title: 'PDF to Image',
                  desc: 'Render PDF pages at up to 3× print DPI into lossless PNG, JPG, or WebP assets + ZIP.',
                  cta: 'Render Pages',
                  icon: FileImage,
                },
              ].map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.4, delay: idx * 0.04, ease: EASE_OUT_QUINT }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onOpenPdfTool(tool.id)}
                    className="group text-left p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex flex-col justify-between gap-4 shadow-xs hover:shadow-md"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center mb-3.5">
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
        <section className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/70 dark:bg-[#0b0b0e] py-16 lg:py-20 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
            >
              <div>
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">
                  Built For Graphic Designers
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight">
                  Eight image tools for cutouts, resizing, format prep &amp; print assets.
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
                  desc: 'Strip backgrounds via AI segmentation or eyedropper color-key with split comparison & shadow.',
                  cta: 'Remove Background',
                  icon: Eraser,
                },
                {
                  id: 'bulk-bg-remove' as ImageToolTab,
                  title: 'Bulk BG Remover',
                  desc: 'Queue product shots or brand marks together and download all clean cutouts inside one ZIP.',
                  cta: 'Run Bulk Cutout',
                  icon: Layers,
                },
                {
                  id: 'pdf-to-image' as ImageToolTab,
                  title: 'PDF to Image',
                  desc: 'Render multi-page flyers or decks into sharp PNG, JPG, or WebP files at up to 3× DPI.',
                  cta: 'Export PDF Pages',
                  icon: FileImage,
                },
                {
                  id: 'resize' as ImageToolTab,
                  title: 'Image Resize',
                  desc: 'Scale in batch with locked aspect ratios, Instagram/YouTube/A4 presets, and contain/cover fit.',
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
                  desc: 'Frame exact social aspect ratios (1:1, 4:5, 16:9), rotate 90°, and flip horizontally/vertically.',
                  cta: 'Crop Asset',
                  icon: Crop,
                },
                {
                  id: 'compress' as ImageToolTab,
                  title: 'Image Compress',
                  desc: 'Optimize heavy PNG/JPG banners to lightweight WebP/JPG with per-file byte savings.',
                  cta: 'Compress Files',
                  icon: Minimize2,
                },
                {
                  id: 'filters' as ImageToolTab,
                  title: 'Filters & Hex Palette',
                  desc: 'Adjust exposure, contrast, sharpness, and auto-extract top 6 brand hex color swatches.',
                  cta: 'Grade & Extract',
                  icon: Sliders,
                },
              ].map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.4, delay: idx * 0.04, ease: EASE_OUT_QUINT }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onOpenImageTool(tool.id)}
                    className="group text-left p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-yellow-400 transition-colors cursor-pointer flex flex-col justify-between gap-4 shadow-xs hover:shadow-md"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30 flex items-center justify-center mb-3.5">
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

        {/* 4. MECHANISM: FIVE-STEP STUDIO FLOW */}
        <section className="border-t border-zinc-200 dark:border-zinc-900 py-16 lg:py-20 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <motion.div
                className="lg:col-span-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
              >
                <p className="text-xs font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">
                  Five-Step Studio Flow
                </p>
                <h2
                  className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight mb-4"
                  style={{ textWrap: 'balance' }}
                >
                  From raw file to a scannable printed cover in one pass.
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                  With guided steps pinned permanently in your right sidebar and a live paper preview fixed alongside your editor, every design tweak stays grounded before you print or export.
                </p>
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
              </motion.div>

              <div className="lg:col-span-7 divide-y divide-zinc-200 dark:divide-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-[#111114] px-6 shadow-xs">
                {[
                  {
                    num: '01',
                    title: 'Upload Source Document',
                    desc: 'Drop a PDF, Word (.docx), or plain text file. Page counts and titles are parsed automatically.',
                  },
                  {
                    num: '02',
                    title: 'Select Cover Theme',
                    desc: 'Pick architectural imagery or minimal ink-friendly plain paper layouts tailored for office printers.',
                  },
                  {
                    num: '03',
                    title: 'Customize Colors, Typography & Logo',
                    desc: 'Apply presets or dial in exact hex values, swap cover fonts, upload a brand mark, and position the QR block.',
                  },
                  {
                    num: '04',
                    title: 'Sync Public Link to Google Drive',
                    desc: 'Upload directly to your Drive with public viewer access enabled, and encode that live share link into the QR code.',
                  },
                  {
                    num: '05',
                    title: 'Download Updated PDF & Distribute',
                    desc: 'Save your complete merged PDF with Page 1 cover prepended to every original page, or share straight via email.',
                  },
                ].map((step, i) => {
                  const active = activeFlowIndex === i;
                  return (
                    <motion.div
                      key={step.num}
                      initial={{ opacity: 0, x: 10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.35, delay: i * 0.05, ease: EASE_OUT_QUINT }}
                      onMouseEnter={() => setActiveFlowIndex(i)}
                      className={`py-4 flex items-start gap-4 transition-opacity cursor-default ${
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
                Developed with Love by the Team Terminators from Pakistan · Conversions run locally in your browser.
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
