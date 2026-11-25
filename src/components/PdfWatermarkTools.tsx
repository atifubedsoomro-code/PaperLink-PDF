import React, { useEffect, useRef, useState } from 'react';
import {
  Droplets,
  Eraser,
  Stamp,
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Trash2,
  Hash,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import {
  PdfExcludeBox,
  PdfWatermarkAddOptions,
  PdfWatermarkRemoveEngine,
  PdfWatermarkRemoveResult,
  PdfWatermarkResult,
  applyPdfWatermarkAndNumbers,
  cleanWatermarkImageData,
  removePdfWatermark,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';

interface PdfWatermarkToolsProps {
  mode: 'remove' | 'add';
  onOpenInCoverStudio: (blob: Blob, fileName: string) => void;
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onTaskComplete?: (info: {
    headline: string;
    subtext: string;
    statusLabel?: string;
    downloadFile?: ReadyDownloadPayload;
  }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const PdfWatermarkTools: React.FC<PdfWatermarkToolsProps> = ({
  mode,
  onOpenInCoverStudio,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onPreviewDocument,
}) => {
  // =========================================================
  // SHARED PDF SOURCE STATE
  // =========================================================
  const rmFileRef = useRef<HTMLInputElement>(null);
  const [rmFile, setRmFile] = useState<File | null>(null);
  const [rmPages, setRmPages] = useState<string[]>([]);
  const [rmCurrentPage, setRmCurrentPage] = useState(1);
  const [rmEngine, setRmEngine] = useState<PdfWatermarkRemoveEngine>('pixel-clean');
  const [luminanceCutoff, setLuminanceCutoff] = useState(172);
  const [textDarkenBoost, setTextDarkenBoost] = useState(45);
  const [useTargetTint, setUseTargetTint] = useState(false);
  const [targetTintHex, setTargetTintHex] = useState('#CBD5E1');
  const [tintSensitivity, setTintSensitivity] = useState(28);
  const [keywords, setKeywords] = useState('CONFIDENTIAL, DRAFT, WATERMARK, SAMPLE, CamScanner');
  const [rmPageRange, setRmPageRange] = useState('');
  const [excludeBoxes, setExcludeBoxes] = useState<PdfExcludeBox[]>([]);
  const [drawBoxStart, setDrawBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [drawBoxCurr, setDrawBoxCurr] = useState<{ x: number; y: number } | null>(null);
  const [cleanedPreviewUrl, setCleanedPreviewUrl] = useState<string | null>(null);
  const [rmResult, setRmResult] = useState<PdfWatermarkRemoveResult | null>(null);

  // =========================================================
  // ADD WATERMARK & PAGE NUMBERS STATE
  // =========================================================
  const addFileRef = useRef<HTMLInputElement>(null);
  const addLogoRef = useRef<HTMLInputElement>(null);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addPreviewPages, setAddPreviewPages] = useState<string[]>([]);
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmLayout, setWmLayout] = useState<'diagonal' | 'center' | 'tiled'>('diagonal');
  const [wmFontSize, setWmFontSize] = useState(44);
  const [wmColor, setWmColor] = useState('#64748B');
  const [wmOpacity, setWmOpacity] = useState(0.24);
  const [wmRotation, setWmRotation] = useState(40);
  const [wmLogoUrl, setWmLogoUrl] = useState<string | null>(null);
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [pageNumFmt, setPageNumFmt] = useState<'Page X of Y' | 'X / Y' | 'X'>('Page X of Y');
  const [pageNumPos, setPageNumPos] = useState<
    'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right'
  >('bottom-right');
  const [addPageRange, setAddPageRange] = useState('');
  const [addResult, setAddResult] = useState<PdfWatermarkResult | null>(null);

  const loadRemovePdf = async (file: File) => {
    onError(null);
    setRmFile(file);
    setRmResult(null);
    setExcludeBoxes([]);
    setRmCurrentPage(1);
    setIsWorking(true);
    onProgress({ percent: 25, status: 'Rendering PDF preview for watermark inspection...' });
    try {
      const buf = await file.arrayBuffer();
      const pages = await renderPdfPages(buf, 16);
      if (pages.length === 0) throw new Error('No pages readable in PDF.');
      setRmPages(pages);
    } catch (err: any) {
      onError(err?.message || 'Could not load PDF.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  // Live Before/After Preview for Pixel Clean-Up Mode
  useEffect(() => {
    if (mode !== 'remove' || rmEngine !== 'pixel-clean' || !rmPages[rmCurrentPage - 1]) {
      setCleanedPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pageBoxes = excludeBoxes.filter(
        (b) => b.pageNumber === 'all' || b.pageNumber === rmCurrentPage
      );
      cleanWatermarkImageData(data, {
        luminanceCutoff,
        textDarkenBoost,
        targetTintHex: useTargetTint ? targetTintHex : undefined,
        tintSensitivity: useTargetTint ? tintSensitivity : 0,
        removeLightGreyWatermarks: true,
        excludeBoxes: pageBoxes,
      });
      ctx.putImageData(data, 0, 0);
      if (!cancelled) {
        setCleanedPreviewUrl(canvas.toDataURL('image/jpeg', 0.88));
      }
    };
    img.src = rmPages[rmCurrentPage - 1];
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    rmEngine,
    rmPages,
    rmCurrentPage,
    luminanceCutoff,
    textDarkenBoost,
    useTargetTint,
    targetTintHex,
    tintSensitivity,
    excludeBoxes,
  ]);

  const handleRunRemoveWatermark = async () => {
    if (!rmFile) return;
    onError(null);
    setRmResult(null);
    setIsWorking(true);
    try {
      const res = await removePdfWatermark(
        rmFile,
        {
          engine: rmEngine,
          luminanceCutoff,
          textDarkenBoost,
          targetTintHex: useTargetTint ? targetTintHex : undefined,
          tintSensitivity: useTargetTint ? tintSensitivity : 0,
          removeLightGreyWatermarks: true,
          watermarkKeywords: keywords,
          pageRangeExpr: rmPageRange,
          excludeBoxes,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setRmResult(res);
      onTaskComplete?.({
        headline: 'PDF Watermark Removed',
        subtext: `Cleaned ${res.cleanedPages} page(s) in ${res.fileName}`,
        statusLabel: 'Watermark Removal Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Watermark Remover',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to remove PDF watermark.');
    } finally {
      setIsWorking(false);
    }
  };

  const loadAddWatermarkPdf = async (file: File) => {
    onError(null);
    setAddFile(file);
    setAddResult(null);
    setIsWorking(true);
    onProgress({ percent: 30, status: 'Reading PDF pages...' });
    try {
      const buf = await file.arrayBuffer();
      const pages = await renderPdfPages(buf, 5);
      setAddPreviewPages(pages);
    } catch (err: any) {
      onError(err?.message || 'Could not load PDF.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const handleRunAddWatermark = async () => {
    if (!addFile) return;
    onError(null);
    setAddResult(null);
    setIsWorking(true);
    try {
      const opts: PdfWatermarkAddOptions = {
        watermarkText: wmText,
        layout: wmLayout,
        fontSize: wmFontSize,
        colorHex: wmColor,
        opacity: wmOpacity,
        rotationDeg: wmRotation,
        logoDataUrl: wmLogoUrl,
        logoScale: 0.24,
        showPageNumbers,
        pageNumberFormat: pageNumFmt,
        pageNumberPosition: pageNumPos,
        pageRangeExpr: addPageRange,
      };
      const res = await applyPdfWatermarkAndNumbers(addFile, opts, (percent, status) =>
        onProgress({ percent, status })
      );
      setAddResult(res);
      onTaskComplete?.({
        headline: 'PDF Watermark & Page Numbers Added',
        subtext: `${res.processedPages} page(s) stamped cleanly in ${res.fileName}`,
        statusLabel: 'PDF Stamping Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Watermark & Page #',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to apply PDF watermark.');
    } finally {
      setIsWorking(false);
    }
  };

  if (mode === 'remove') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Eraser className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>PDF Watermark Remover</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Clean faded diagonal stamps, scanner footers (like CamScanner), or vector watermark overlays from any PDF locally.
            </p>
          </div>

          <input
            ref={rmFileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRemovePdf(f);
              e.target.value = '';
            }}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={() => rmFileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') rmFileRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f && f.name.toLowerCase().endsWith('.pdf')) void loadRemovePdf(f);
            }}
            className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50/70 dark:bg-zinc-950/60 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
              {rmFile ? rmFile.name : 'Click or drop PDF to clean watermarks'}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
              {rmFile ? `${rmPages.length} preview page(s) loaded` : '100% private client-side processing'}
            </p>
          </div>

          {/* Engine Selector */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Removal Method
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRmEngine('pixel-clean')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                  rmEngine === 'pixel-clean'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Smart Pixel Clean</p>
                <p className="text-[10px] opacity-80 mt-0.5">Erases scanned &amp; flattened stamps</p>
              </button>
              <button
                type="button"
                onClick={() => setRmEngine('vector-layer')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                  rmEngine === 'vector-layer'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Vector Stream Strip</p>
                <p className="text-[10px] opacity-80 mt-0.5">Removes digital layers &amp; keeps text</p>
              </button>
            </div>
          </div>

          {rmEngine === 'pixel-clean' ? (
            <div className="space-y-3 pt-1 text-xs">
              <div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Watermark Lightness Cutoff</span>
                  <span className="font-mono font-bold tabular-nums">{luminanceCutoff}</span>
                </div>
                <input
                  type="range"
                  min={120}
                  max={240}
                  value={luminanceCutoff}
                  onChange={(e) => setLuminanceCutoff(Number(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
                <p className="text-[10px] text-zinc-500">
                  Lower values remove darker grey watermarks; raise if light body text fades.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Body Text Ink Boost</span>
                  <span className="font-mono font-bold tabular-nums">{textDarkenBoost}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={textDarkenBoost}
                  onChange={(e) => setTextDarkenBoost(Number(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Target Colored Watermark Tint
                  </span>
                  <input
                    type="checkbox"
                    checked={useTargetTint}
                    onChange={(e) => setUseTargetTint(e.target.checked)}
                    className="accent-yellow-400"
                  />
                </label>
                {useTargetTint && (
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="color"
                      value={targetTintHex}
                      onChange={(e) => setTargetTintHex(e.target.value)}
                      className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] text-zinc-500">
                        <span>Tint Tolerance</span>
                        <span className="font-mono tabular-nums">{tintSensitivity}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={75}
                        value={tintSensitivity}
                        onChange={(e) => setTintSensitivity(Number(e.target.value))}
                        className="w-full accent-yellow-400 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Watermark Text Keywords to Strip (comma-separated)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
              />
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Page Range (blank = all pages, e.g. 1-3, 5)
            </label>
            <input
              type="text"
              value={rmPageRange}
              onChange={(e) => setRmPageRange(e.target.value)}
              placeholder="All pages"
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
            />
          </div>

          {excludeBoxes.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {excludeBoxes.length} corner/logo erase box(es) active
              </span>
              <button
                type="button"
                onClick={() => setExcludeBoxes([])}
                className="text-red-500 hover:underline inline-flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={!rmFile || isWorking}
            onClick={handleRunRemoveWatermark}
            className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
            <span>Remove Watermark &amp; Export PDF</span>
          </button>

          {rmResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {rmResult.fileName} ({formatBytes(rmResult.blob.size)})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {onPreviewDocument && (
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewDocument({
                        title: rmResult.fileName,
                        fileName: rmResult.fileName,
                        blob: rmResult.blob,
                        subtitle: `${rmResult.cleanedPages} cleaned pages`,
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 text-zinc-800 dark:text-zinc-100 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => triggerDownload(rmResult.blob, rmResult.fileName)}
                  className="flex-1 px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInCoverStudio(rmResult.blob, rmResult.fileName)}
                  className="px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-800 dark:border-zinc-700 text-yellow-400 font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>QR Cover</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Live Before/After & Manual Corner Box Eraser */}
        <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                {rmEngine === 'pixel-clean'
                  ? 'Live Before & After Preview · Drag Box to Erase Corner Badges'
                  : 'Page Inspector · Drag Box to Whiteout Sticky Corner Stamps'}
              </h3>
            </div>
            {rmPages.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                <button
                  type="button"
                  disabled={rmCurrentPage <= 1}
                  onClick={() => setRmCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold tabular-nums px-1">
                  {rmCurrentPage}/{rmPages.length}
                </span>
                <button
                  type="button"
                  disabled={rmCurrentPage >= rmPages.length}
                  onClick={() => setRmCurrentPage((p) => Math.min(rmPages.length, p + 1))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {rmPages[rmCurrentPage - 1] ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Original Page (Drag to Erase Corner Logo)
                </p>
                <div
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;
                    setDrawBoxStart({ x, y });
                    setDrawBoxCurr({ x, y });
                  }}
                  onPointerMove={(e) => {
                    if (!drawBoxStart) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDrawBoxCurr({
                      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
                      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
                    });
                  }}
                  onPointerUp={() => {
                    if (drawBoxStart && drawBoxCurr) {
                      const xFraction = Math.min(drawBoxStart.x, drawBoxCurr.x);
                      const yFraction = Math.min(drawBoxStart.y, drawBoxCurr.y);
                      const widthFraction = Math.abs(drawBoxCurr.x - drawBoxStart.x);
                      const heightFraction = Math.abs(drawBoxCurr.y - drawBoxStart.y);
                      if (widthFraction > 0.02 && heightFraction > 0.015) {
                        setExcludeBoxes((prev) => [
                          ...prev,
                          {
                            id: `ex_${Date.now()}`,
                            pageNumber: 'all',
                            xFraction,
                            yFraction,
                            widthFraction,
                            heightFraction,
                          },
                        ]);
                      }
                    }
                    setDrawBoxStart(null);
                    setDrawBoxCurr(null);
                  }}
                  className="relative rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white cursor-crosshair select-none touch-none"
                >
                  <img
                    src={rmPages[rmCurrentPage - 1]}
                    alt="Original PDF page"
                    className="w-full h-auto block pointer-events-none"
                  />
                  {excludeBoxes.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        left: `${b.xFraction * 100}%`,
                        top: `${b.yFraction * 100}%`,
                        width: `${b.widthFraction * 100}%`,
                        height: `${b.heightFraction * 100}%`,
                      }}
                      className="absolute bg-white/80 border border-dashed border-red-500 pointer-events-none"
                    />
                  ))}
                  {drawBoxStart && drawBoxCurr && (
                    <div
                      style={{
                        left: `${Math.min(drawBoxStart.x, drawBoxCurr.x) * 100}%`,
                        top: `${Math.min(drawBoxStart.y, drawBoxCurr.y) * 100}%`,
                        width: `${Math.abs(drawBoxCurr.x - drawBoxStart.x) * 100}%`,
                        height: `${Math.abs(drawBoxCurr.y - drawBoxStart.y) * 100}%`,
                      }}
                      className="absolute border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  {rmEngine === 'pixel-clean' ? 'Live Cleaned Result' : 'Vector Strip Target'}
                </p>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white">
                  <img
                    src={
                      rmEngine === 'pixel-clean' && cleanedPreviewUrl
                        ? cleanedPreviewUrl
                        : rmPages[rmCurrentPage - 1]
                    }
                    alt="Cleaned PDF page preview"
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => rmFileRef.current?.click()}
              className="min-h-[340px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
            >
              <Droplets className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500 max-w-sm">
                Upload a watermarked PDF on the left to tune lightness threshold, target stamp colors, or drag boxes over corner logos.
              </p>
              <p className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero server upload — all pixel and stream cleaning runs on your device.</span>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // MODE === 'add' (Add Watermark & Page Numbers to PDF)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Stamp className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
            <span>Add PDF Watermark &amp; Page Numbers</span>
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Stamp diagonal/tiled brand watermarks and crisp page numbering onto documents before sharing.
          </p>
        </div>

        <input
          ref={addFileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadAddWatermarkPdf(f);
            e.target.value = '';
          }}
        />
        <input
          ref={addLogoRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = (ev) => setWmLogoUrl(String(ev.target?.result || ''));
            reader.readAsDataURL(f);
            e.target.value = '';
          }}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => addFileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') addFileRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && f.name.toLowerCase().endsWith('.pdf')) void loadAddWatermarkPdf(f);
          }}
          className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50/70 dark:bg-zinc-950/60 text-center cursor-pointer transition-colors"
        >
          <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
            {addFile ? addFile.name : 'Click or drop target PDF file'}
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Watermark Text
            </label>
            <input
              type="text"
              value={wmText}
              onChange={(e) => setWmText(e.target.value)}
              placeholder="e.g. CONFIDENTIAL, DRAFT, UNIVERSITY COPY"
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(['diagonal', 'center', 'tiled'] as const).map((lay) => (
              <button
                key={lay}
                type="button"
                onClick={() => setWmLayout(lay)}
                className={`py-2 rounded-lg border text-xs font-semibold capitalize cursor-pointer ${
                  wmLayout === lay
                    ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {lay}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Font Size</span>
                <span className="font-mono font-bold tabular-nums">{wmFontSize}pt</span>
              </div>
              <input
                type="range"
                min={14}
                max={88}
                value={wmFontSize}
                onChange={(e) => setWmFontSize(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Opacity</span>
                <span className="font-mono font-bold tabular-nums">
                  {Math.round(wmOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={85}
                value={Math.round(wmOpacity * 100)}
                onChange={(e) => setWmOpacity(Number(e.target.value) / 100)}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">Text Color</span>
              <input
                type="color"
                value={wmColor}
                onChange={(e) => setWmColor(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
            <button
              type="button"
              onClick={() => (wmLogoUrl ? setWmLogoUrl(null) : addLogoRef.current?.click())}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 font-semibold cursor-pointer"
            >
              {wmLogoUrl ? 'Remove Logo Watermark' : '+ Image Logo Watermark'}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Stamp Page Numbers</span>
              </span>
              <input
                type="checkbox"
                checked={showPageNumbers}
                onChange={(e) => setShowPageNumbers(e.target.checked)}
                className="accent-yellow-400"
              />
            </label>

            {showPageNumbers && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={pageNumFmt}
                  onChange={(e) => setPageNumFmt(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                >
                  <option value="Page X of Y">Page 1 of N</option>
                  <option value="X / Y">1 / N</option>
                  <option value="X">1</option>
                </select>
                <select
                  value={pageNumPos}
                  onChange={(e) => setPageNumPos(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Target Pages (optional, e.g. 1-5)
            </label>
            <input
              type="text"
              value={addPageRange}
              onChange={(e) => setAddPageRange(e.target.value)}
              placeholder="All pages"
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!addFile || isWorking}
          onClick={handleRunAddWatermark}
          className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
          <span>Apply Watermark &amp; Export PDF</span>
        </button>

        {addResult && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {addResult.fileName} ({formatBytes(addResult.blob.size)})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {onPreviewDocument && (
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument({
                      title: addResult.fileName,
                      fileName: addResult.fileName,
                      blob: addResult.blob,
                      subtitle: `${addResult.processedPages} pages stamped`,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 text-zinc-800 dark:text-zinc-100 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => triggerDownload(addResult.blob, addResult.fileName)}
                className="flex-1 px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenInCoverStudio(addResult.blob, addResult.fileName)}
                className="px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-800 dark:border-zinc-700 text-yellow-400 font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>QR Cover</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Live Overlay Preview */}
      <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Live Stamp &amp; Page Number Preview
        </h3>
        <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-6 flex justify-center">
          <div className="relative w-full max-w-[440px] aspect-[595/842] bg-white rounded-lg shadow-lg border border-zinc-200 overflow-hidden flex items-center justify-center">
            {addPreviewPages[0] ? (
              <img
                src={addPreviewPages[0]}
                alt="Target PDF page 1"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="p-8 space-y-3 w-full opacity-45">
                <div className="h-4 w-2/3 bg-zinc-300 rounded" />
                <div className="h-3 w-full bg-zinc-200 rounded" />
                <div className="h-3 w-5/6 bg-zinc-200 rounded" />
                <div className="h-3 w-4/5 bg-zinc-200 rounded" />
                <div className="h-32 w-full bg-zinc-100 rounded border border-zinc-200" />
                <div className="h-3 w-3/4 bg-zinc-200 rounded" />
              </div>
            )}

            {wmLogoUrl && (
              <img
                src={wmLogoUrl}
                alt="Watermark logo preview"
                style={{ opacity: wmOpacity }}
                className="absolute w-1/4 h-auto object-contain pointer-events-none"
              />
            )}

            {wmText.trim() && (
              <div
                style={{ opacity: wmOpacity, color: wmColor }}
                className="absolute inset-0 pointer-events-none flex items-center justify-center p-4"
              >
                {wmLayout === 'tiled' ? (
                  <div className="grid grid-cols-2 gap-10 w-full text-center">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: `${Math.max(10, wmFontSize * 0.45)}px`,
                          transform: `rotate(${-wmRotation}deg)`,
                        }}
                        className="font-bold tracking-wider truncate"
                      >
                        {wmText}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: `${Math.max(12, wmFontSize * 0.65)}px`,
                      transform:
                        wmLayout === 'center' ? 'none' : `rotate(${-wmRotation}deg)`,
                    }}
                    className="font-bold tracking-wider text-center"
                  >
                    {wmText}
                  </span>
                )}
              </div>
            )}

            {showPageNumbers && (
              <div
                className={`absolute text-[10px] font-mono text-zinc-600 px-4 py-2.5 pointer-events-none ${
                  pageNumPos === 'top-right'
                    ? 'top-0 right-0'
                    : pageNumPos === 'bottom-center'
                    ? 'bottom-0 inset-x-0 text-center'
                    : pageNumPos === 'bottom-left'
                    ? 'bottom-0 left-0'
                    : 'bottom-0 right-0'
                }`}
              >
                {pageNumFmt === 'Page X of Y'
                  ? 'Page 1 of 4'
                  : pageNumFmt === 'X / Y'
                  ? '1 / 4'
                  : '1'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
