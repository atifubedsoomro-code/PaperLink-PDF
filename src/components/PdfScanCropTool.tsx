import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  ScanLine,
  Upload,
  Download,
  Eye,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Wand2,
  Layers,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import {
  PdfCropRect,
  PdfScanCropResult,
  PdfScanEnhanceMode,
  PdfScanFitPage,
  applyPhoneScanFilterToImageData,
  convertImagesToPdf,
  detectDocumentCropRectFromImageData,
  scanCropAndCleanPdf,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';

interface PdfScanCropToolProps {
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

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

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

const DEFAULT_RECT: PdfCropRect = { left: 0.02, top: 0.02, right: 0.98, bottom: 0.98 };

export const PdfScanCropTool: React.FC<PdfScanCropToolProps> = ({
  onOpenInCoverStudio,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [cropRects, setCropRects] = useState<Record<number, PdfCropRect>>({});

  // Auto-scan options (defaults ON for phone-captured PDFs)
  const [autoDetectEdges, setAutoDetectEdges] = useState(true);
  const [flattenShadows, setFlattenShadows] = useState(true);
  const [autoRemoveWatermark, setAutoRemoveWatermark] = useState(true);
  const [watermarkCutoff, setWatermarkCutoff] = useState(176);
  const [enhanceMode, setEnhanceMode] = useState<PdfScanEnhanceMode>('magic-color');
  const [fitPage, setFitPage] = useState<PdfScanFitPage>('a4-fit');
  const [pageRangeExpr, setPageRangeExpr] = useState('');

  // Preview states
  const [showScannedPreview, setShowScannedPreview] = useState(false);
  const [scannedPageUrl, setScannedPageUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<PdfScanCropResult | null>(null);

  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    orig: PdfCropRect;
  } | null>(null);

  const activeCrop: PdfCropRect = cropRects[currentPage] || DEFAULT_RECT;

  const autoDetectForDataUrl = (url: string): Promise<PdfCropRect> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 400;
        const h = img.naturalHeight || 560;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(DEFAULT_RECT);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        resolve(detectDocumentCropRectFromImageData(imgData));
      };
      img.onerror = () => resolve(DEFAULT_RECT);
      img.src = url;
    });

  const handleLoadInputFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    onError(null);
    setScanResult(null);
    setShowScannedPreview(false);
    setScannedPageUrl(null);
    setIsWorking(true);
    onProgress({ percent: 20, status: 'Loading document & detecting phone paper edges...' });

    try {
      let pdfFile = files[0];
      const allImages = files.every(
        (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)
      );

      if (allImages) {
        onProgress({ percent: 30, status: 'Preparing phone photo(s) for auto-scan...' });
        const imgRes = await convertImagesToPdf(files, 'fit');
        pdfFile = new File([imgRes.blob], `${files[0].name.replace(/\.[^/.]+$/, '')}_scan.pdf`, {
          type: 'application/pdf',
        });
      }

      const buf = await pdfFile.arrayBuffer();
      const previews = await renderPdfPages(buf, 30);
      if (previews.length === 0) throw new Error('No pages found in this document.');

      const detectedMap: Record<number, PdfCropRect> = {};
      if (autoDetectEdges) {
        for (let i = 0; i < previews.length; i++) {
          detectedMap[i + 1] = await autoDetectForDataUrl(previews[i]);
        }
      } else {
        for (let i = 0; i < previews.length; i++) {
          detectedMap[i + 1] = { ...DEFAULT_RECT };
        }
      }

      setSourceFile(pdfFile);
      setPagePreviews(previews);
      setCropRects(detectedMap);
      setCurrentPage(1);
    } catch (err: any) {
      onError(err?.message || 'Failed to inspect document for crop & scan.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  // Drag & resize crop rectangle
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragRef.current;
      const host = stageRef.current;
      if (!ds || !host) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = (e.clientX - ds.startX) / rect.width;
      const dy = (e.clientY - ds.startY) / rect.height;
      const minSize = 0.14;
      let { left, top, right, bottom } = ds.orig;

      if (ds.handle === 'move') {
        const w = right - left;
        const h = bottom - top;
        left = Math.max(0, Math.min(1 - w, ds.orig.left + dx));
        top = Math.max(0, Math.min(1 - h, ds.orig.top + dy));
        right = left + w;
        bottom = top + h;
      } else {
        if (ds.handle.includes('w')) {
          left = Math.max(0, Math.min(right - minSize, ds.orig.left + dx));
        }
        if (ds.handle.includes('e')) {
          right = Math.min(1, Math.max(left + minSize, ds.orig.right + dx));
        }
        if (ds.handle.includes('n')) {
          top = Math.max(0, Math.min(bottom - minSize, ds.orig.top + dy));
        }
        if (ds.handle.includes('s')) {
          bottom = Math.min(1, Math.max(top + minSize, ds.orig.bottom + dy));
        }
      }

      setCropRects((prev) => ({
        ...prev,
        [currentPage]: {
          left: Number(left.toFixed(3)),
          top: Number(top.toFixed(3)),
          right: Number(right.toFixed(3)),
          bottom: Number(bottom.toFixed(3)),
        },
      }));
      setScanResult(null);
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [currentPage]);

  // Live cropped + scanned preview generator when Preview Scanned Look is ON
  useEffect(() => {
    if (!showScannedPreview || !pagePreviews[currentPage - 1]) {
      setScannedPageUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const nw = img.naturalWidth || 400;
      const nh = img.naturalHeight || 560;
      const sx = Math.max(0, Math.round(activeCrop.left * nw));
      const sy = Math.max(0, Math.round(activeCrop.top * nh));
      const sw = Math.max(20, Math.round((activeCrop.right - activeCrop.left) * nw));
      const sh = Math.max(20, Math.round((activeCrop.bottom - activeCrop.top) * nh));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      if (flattenShadows || autoRemoveWatermark || enhanceMode !== 'none') {
        const imgData = ctx.getImageData(0, 0, sw, sh);
        applyPhoneScanFilterToImageData(imgData, {
          flattenShadows,
          autoRemoveWatermark,
          enhanceMode,
          watermarkCutoff,
        });
        ctx.putImageData(imgData, 0, 0);
      }

      if (!cancelled) {
        setScannedPageUrl(canvas.toDataURL('image/jpeg', 0.9));
      }
    };
    img.src = pagePreviews[currentPage - 1];
    return () => {
      cancelled = true;
    };
  }, [
    showScannedPreview,
    pagePreviews,
    currentPage,
    activeCrop.left,
    activeCrop.top,
    activeCrop.right,
    activeCrop.bottom,
    flattenShadows,
    autoRemoveWatermark,
    enhanceMode,
    watermarkCutoff,
  ]);

  const handleRunAutoDetectCurrent = async () => {
    const url = pagePreviews[currentPage - 1];
    if (!url) return;
    const detected = await autoDetectForDataUrl(url);
    setCropRects((prev) => ({ ...prev, [currentPage]: detected }));
    setScanResult(null);
  };

  const handleApplyCropToAllPages = () => {
    const current = { ...activeCrop };
    const next: Record<number, PdfCropRect> = {};
    for (let p = 1; p <= pagePreviews.length; p++) {
      next[p] = { ...current };
    }
    setCropRects(next);
    setScanResult(null);
  };

  const handleBuildScannedPdf = async () => {
    if (!sourceFile) return;
    onError(null);
    setScanResult(null);
    setIsWorking(true);
    try {
      const res = await scanCropAndCleanPdf(
        sourceFile,
        {
          cropRects,
          autoDetectEdges,
          autoRemoveWatermark,
          flattenShadows,
          enhanceMode,
          fitPage,
          watermarkCutoff,
          pageRangeExpr,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setScanResult(res);
      onTaskComplete?.({
        headline: 'Phone PDF Cropped, Auto-Scanned & Fitted',
        subtext: `${res.processedPages} page(s) cleaned and fitted cleanly into ${res.fileName}`,
        statusLabel: 'Auto-Scan Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Crop & Auto-Scan PDF',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to crop and auto-scan PDF.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleLoadInputFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Controls */}
        <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-amber-500 dark:text-yellow-400" />
                <span>Crop &amp; Auto-Scan Phone PDF</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Upload a phone-clicked PDF or camera photo — trim desk borders, flatten shadows, auto-remove watermarks, and fit every page cleanly.
              </p>
            </div>
            {sourceFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
              >
                Change File
              </button>
            )}
          </div>

          {!sourceFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) void handleLoadInputFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                Select Phone-Clicked PDF or Photos
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Supports multi-page PDFs or JPG / PNG / WebP camera photos
              </p>
              <p className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>100% private in-browser scanning &amp; watermark cleanup.</span>
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Scan Style */}
              <div className="space-y-1.5">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Scanner Enhance Mode
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'magic-color' as const, label: 'Magic Color Scan' },
                    { id: 'bw-document' as const, label: 'Crisp B&W Scan' },
                    { id: 'clean-only' as const, label: 'Clean White Paper' },
                    { id: 'none' as const, label: 'Crop & Fit Only' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setEnhanceMode(mode.id);
                        setScanResult(null);
                      }}
                      className={`py-2 px-2.5 rounded-xl border font-semibold cursor-pointer text-left ${
                        enhanceMode === mode.id
                          ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Automatic Phone Cleanup Toggles */}
              <div className="space-y-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Auto-Remove Watermarks &amp; Scanner Logos
                  </span>
                  <input
                    type="checkbox"
                    checked={autoRemoveWatermark}
                    onChange={(e) => {
                      setAutoRemoveWatermark(e.target.checked);
                      setScanResult(null);
                    }}
                    className="accent-yellow-400 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Flatten Phone Shadows &amp; Uneven Lighting
                  </span>
                  <input
                    type="checkbox"
                    checked={flattenShadows}
                    onChange={(e) => {
                      setFlattenShadows(e.target.checked);
                      setScanResult(null);
                    }}
                    className="accent-yellow-400 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Auto-Detect Paper Edges on Load
                  </span>
                  <input
                    type="checkbox"
                    checked={autoDetectEdges}
                    onChange={(e) => setAutoDetectEdges(e.target.checked)}
                    className="accent-yellow-400 w-4 h-4 cursor-pointer"
                  />
                </label>

                {autoRemoveWatermark && (
                  <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                      <span>Watermark Clean Cutoff</span>
                      <span className="font-mono font-bold tabular-nums">{watermarkCutoff}</span>
                    </div>
                    <input
                      type="range"
                      min="120"
                      max="235"
                      value={watermarkCutoff}
                      onChange={(e) => {
                        setWatermarkCutoff(Number(e.target.value));
                        setScanResult(null);
                      }}
                      className="w-full accent-yellow-400 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Page Fitting Options */}
              <div className="space-y-1.5">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Whole-Page Fit Output
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'a4-fit' as const, label: 'A4 Full-Page Fit' },
                    { id: 'a4-full-bleed' as const, label: 'A4 Edge-to-Edge Bleed' },
                    { id: 'letter-fit' as const, label: 'US Letter Fit' },
                    { id: 'exact-crop' as const, label: 'Exact Cropped Ratio' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setFitPage(opt.id);
                        setScanResult(null);
                      }}
                      className={`py-1.5 px-2.5 rounded-lg border font-semibold cursor-pointer text-left ${
                        fitPage === opt.id
                          ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {pagePreviews.length > 1 && (
                <div>
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
                    Page Range (leave blank for all {pagePreviews.length} pages)
                  </label>
                  <input
                    type="text"
                    value={pageRangeExpr}
                    onChange={(e) => setPageRangeExpr(e.target.value)}
                    placeholder={`1-${pagePreviews.length}`}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-mono text-xs"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={isWorking}
                onClick={handleBuildScannedPdf}
                className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                <span>Crop, Clean Watermark &amp; Scan PDF</span>
              </button>

              {scanResult && (
                <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Scanned PDF Ready ({scanResult.pageCount} pages)</span>
                    </span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {formatBytes(scanResult.blob.size)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {onPreviewDocument && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewDocument({
                            title: scanResult.fileName,
                            fileName: scanResult.fileName,
                            blob: scanResult.blob,
                            subtitle: `Auto-Scanned & Watermark Cleaned · ${scanResult.pageCount} pages`,
                          })
                        }
                        className="py-2 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 text-zinc-800 dark:text-zinc-100 font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => triggerDownload(scanResult.blob, scanResult.fileName)}
                      className="flex-1 py-2 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenInCoverStudio(scanResult.blob, scanResult.fileName)}
                      className="flex-1 py-2 px-3 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-800 dark:border-zinc-700 text-yellow-400 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>QR Cover</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Interactive Crop & Auto-Scan Stage */}
        <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
          {!sourceFile ? (
            <div className="min-h-[360px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">
              <Crop className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mb-3" />
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Interactive Crop &amp; Scan Preview
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                Upload a phone-clicked PDF or photo on the left to adjust crop borders, preview shadow flattening &amp; watermark removal live, and fit cleanly onto full pages.
              </p>
            </div>
          ) : (
            <>
              {/* Stage Top Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowScannedPreview((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                      showScannedPreview
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showScannedPreview ? 'Viewing Scanned Result' : 'Preview Scanned Result'}</span>
                  </button>

                  {!showScannedPreview && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleRunAutoDetectCurrent()}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 font-semibold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>Auto-Detect Edges</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setCropRects((prev) => ({
                            ...prev,
                            [currentPage]: { left: 0, top: 0, right: 1, bottom: 1 },
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 font-semibold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Full</span>
                      </button>

                      {pagePreviews.length > 1 && (
                        <button
                          type="button"
                          onClick={handleApplyCropToAllPages}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 font-semibold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Apply Crop to All</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {pagePreviews.length > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-bold px-1.5 tabular-nums">
                      {currentPage} / {pagePreviews.length}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= pagePreviews.length}
                      onClick={() => setCurrentPage((p) => Math.min(pagePreviews.length, p + 1))}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Interactive Crop Box or Live Scanned Preview */}
              <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 sm:p-4 flex justify-center overflow-hidden">
                {showScannedPreview ? (
                  <div className="relative inline-block max-w-full shadow-xl border border-zinc-300 dark:border-zinc-700 bg-white">
                    {scannedPageUrl ? (
                      <img
                        src={scannedPageUrl}
                        alt={`Scanned preview page ${currentPage}`}
                        className="max-h-[560px] w-auto object-contain block"
                      />
                    ) : (
                      <div className="w-64 h-80 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    ref={stageRef}
                    className="relative inline-block max-w-full shadow-xl border border-zinc-300 dark:border-zinc-700 bg-white select-none touch-none"
                  >
                    <img
                      src={pagePreviews[currentPage - 1]}
                      alt={`Crop frame page ${currentPage}`}
                      className="max-h-[560px] w-auto block pointer-events-none select-none"
                    />

                    {/* Dimmed outside mask regions */}
                    <div
                      className="absolute left-0 top-0 right-0 bg-black/45 pointer-events-none"
                      style={{ height: `${activeCrop.top * 100}%` }}
                    />
                    <div
                      className="absolute left-0 bottom-0 right-0 bg-black/45 pointer-events-none"
                      style={{ top: `${activeCrop.bottom * 100}%` }}
                    />
                    <div
                      className="absolute left-0 bg-black/45 pointer-events-none"
                      style={{
                        top: `${activeCrop.top * 100}%`,
                        height: `${(activeCrop.bottom - activeCrop.top) * 100}%`,
                        width: `${activeCrop.left * 100}%`,
                      }}
                    />
                    <div
                      className="absolute right-0 bg-black/45 pointer-events-none"
                      style={{
                        top: `${activeCrop.top * 100}%`,
                        height: `${(activeCrop.bottom - activeCrop.top) * 100}%`,
                        left: `${activeCrop.right * 100}%`,
                      }}
                    />

                    {/* Interactive Draggable Crop Box */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = {
                          handle: 'move',
                          startX: e.clientX,
                          startY: e.clientY,
                          orig: { ...activeCrop },
                        };
                      }}
                      style={{
                        left: `${activeCrop.left * 100}%`,
                        top: `${activeCrop.top * 100}%`,
                        width: `${(activeCrop.right - activeCrop.left) * 100}%`,
                        height: `${(activeCrop.bottom - activeCrop.top) * 100}%`,
                      }}
                      className="absolute border-2 border-yellow-400 cursor-move z-10"
                    >
                      {/* Rule-of-thirds subtle scan guides */}
                      <div className="absolute inset-x-0 top-1/3 border-t border-yellow-300/35 pointer-events-none" />
                      <div className="absolute inset-x-0 top-2/3 border-t border-yellow-300/35 pointer-events-none" />
                      <div className="absolute inset-y-0 left-1/3 border-l border-yellow-300/35 pointer-events-none" />
                      <div className="absolute inset-y-0 left-2/3 border-l border-yellow-300/35 pointer-events-none" />

                      {/* 4 Corner Handles */}
                      {(
                        [
                          { id: 'nw', cls: '-left-2 -top-2 cursor-nwse-resize' },
                          { id: 'ne', cls: '-right-2 -top-2 cursor-nesw-resize' },
                          { id: 'sw', cls: '-left-2 -bottom-2 cursor-nesw-resize' },
                          { id: 'se', cls: '-right-2 -bottom-2 cursor-nwse-resize' },
                        ] as const
                      ).map((h) => (
                        <div
                          key={h.id}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              handle: h.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              orig: { ...activeCrop },
                            };
                          }}
                          className={`absolute w-4 h-4 rounded-sm bg-yellow-400 border-2 border-black shadow ${h.cls}`}
                        />
                      ))}

                      {/* 4 Edge Handles */}
                      {(
                        [
                          { id: 'n', cls: 'left-1/2 -translate-x-1/2 -top-1.5 w-8 h-2.5 cursor-ns-resize' },
                          { id: 's', cls: 'left-1/2 -translate-x-1/2 -bottom-1.5 w-8 h-2.5 cursor-ns-resize' },
                          { id: 'w', cls: 'top-1/2 -translate-y-1/2 -left-1.5 w-2.5 h-8 cursor-ew-resize' },
                          { id: 'e', cls: 'top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-8 cursor-ew-resize' },
                        ] as const
                      ).map((h) => (
                        <div
                          key={h.id}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              handle: h.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              orig: { ...activeCrop },
                            };
                          }}
                          className={`absolute rounded-full bg-yellow-400 border border-black shadow ${h.cls}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span>
                  Crop Area: {Math.round((activeCrop.right - activeCrop.left) * 100)}% ×{' '}
                  {Math.round((activeCrop.bottom - activeCrop.top) * 100)}%
                </span>
                <span>Drag corners or edges to adjust paper fit</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
