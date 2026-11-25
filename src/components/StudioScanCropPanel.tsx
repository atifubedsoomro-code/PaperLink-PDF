import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Crop,
  Download,
  Eye,
  FilePlus2,
  ImagePlus,
  Loader2,
  Maximize,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  PdfQuadCorners,
  PdfScanEnhanceMode,
  PdfScanFitPage,
  Point2D,
  applyPhoneScanFilterToImageData,
  detectDocumentQuadFromImageData,
  perspectiveScanPagesToPdf,
  warpPerspectiveCanvas,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import { LiquidCrystalButton, LiquidCrystalCard } from './LiquidCrystal';
import { ClipingPapersLogo } from './ClipingPapersLogo';
import { RobotProgressBar } from './RobotProgressBar';

interface ScanQueuePage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  quad: PdfQuadCorners;
  autoQuad: PdfQuadCorners;
}

interface StudioScanCropPanelProps {
  onApplyPdfToCoverStudio: (file: File) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
  onTaskComplete?: (info: {
    headline: string;
    subtext: string;
    statusLabel?: string;
    downloadFile?: ReadyDownloadPayload;
  }) => void;
  onBackToEditor?: () => void;
}

type CornerKey = keyof PdfQuadCorners;

const FULL_FRAME_QUAD: PdfQuadCorners = {
  tl: { x: 0.02, y: 0.02 },
  tr: { x: 0.98, y: 0.02 },
  br: { x: 0.98, y: 0.98 },
  bl: { x: 0.02, y: 0.98 },
};

const ENHANCE_PRESETS: { id: PdfScanEnhanceMode; label: string; desc: string }[] = [
  { id: 'magic-color', label: 'Magic Color', desc: 'White paper + rich ink' },
  { id: 'bw-document', label: 'Crisp B&W', desc: 'High-contrast photocopy' },
  { id: 'clean-only', label: 'Clean Paper', desc: 'Natural flat scan' },
  { id: 'none', label: 'Crop Only', desc: 'Original tones kept' },
];

const PAGE_FORMATS: { id: PdfScanFitPage; label: string }[] = [
  { id: 'a4-fit', label: 'A4 Rectangular' },
  { id: 'letter-fit', label: 'US Letter' },
  { id: 'a4-full-bleed', label: 'A4 Full Bleed' },
  { id: 'exact-crop', label: 'Exact Aspect' },
];

async function decodeImageUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode uploaded image'));
    img.src = dataUrl;
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image file'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export const StudioScanCropPanel: React.FC<StudioScanCropPanelProps> = ({
  onApplyPdfToCoverStudio,
  onPreviewDocument,
  onTaskComplete,
  onBackToEditor,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quadStageRef = useRef<HTMLDivElement>(null);

  const [pages, setPages] = useState<ScanQueuePage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Scan processing controls
  const [enhanceMode, setEnhanceMode] = useState<PdfScanEnhanceMode>('magic-color');
  const [fitPage, setFitPage] = useState<PdfScanFitPage>('a4-fit');
  const [flattenShadows, setFlattenShadows] = useState(true);
  const [autoRemoveWatermark, setAutoRemoveWatermark] = useState(true);
  const [watermarkCutoff, setWatermarkCutoff] = useState(176);

  // Live preview of perspective-corrected output
  const [viewMode, setViewMode] = useState<'split' | 'cropper' | 'result'>('split');
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  // Export state & completion toast notification
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; status: string } | null>(null);
  const [lastResult, setLastResult] = useState<{ blob: Blob; fileName: string; pageCount: number } | null>(
    null
  );
  const [previewProgressPct, setPreviewProgressPct] = useState<number>(0);
  const [scanToast, setScanToast] = useState<{
    id: number;
    title: string;
    detail: string;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showCompletionToast = useCallback((title: string, detail: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setScanToast({ id: Date.now(), title, detail });
    toastTimerRef.current = window.setTimeout(() => {
      setScanToast(null);
    }, 3800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const activePage = pages[selectedIdx] ?? null;

  // Render live perspective-corrected & cleaned preview for active page
  useEffect(() => {
    if (!activePage) {
      setPreviewResultUrl(null);
      return;
    }

    let cancelled = false;
    setPreviewProgressPct(18);
    const timer = window.setTimeout(async () => {
      setIsRenderingPreview(true);
      setPreviewProgressPct(48);
      try {
        const img = await decodeImageUrl(activePage.dataUrl);
        if (cancelled) return;

        const maxPreviewSrc = 720;
        const scale = Math.min(1, maxPreviewSrc / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = Math.max(40, Math.round((img.naturalWidth || 600) * scale));
        srcCanvas.height = Math.max(40, Math.round((img.naturalHeight || 800) * scale));
        const sCtx = srcCanvas.getContext('2d');
        if (!sCtx) return;
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
        sCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);

        setPreviewProgressPct(74);
        const warped = warpPerspectiveCanvas(srcCanvas, activePage.quad, 760);
        if (flattenShadows || autoRemoveWatermark || enhanceMode !== 'none') {
          const wCtx = warped.getContext('2d');
          if (wCtx) {
            const wImg = wCtx.getImageData(0, 0, warped.width, warped.height);
            applyPhoneScanFilterToImageData(wImg, {
              flattenShadows,
              autoRemoveWatermark,
              enhanceMode,
              watermarkCutoff,
            });
            wCtx.putImageData(wImg, 0, 0);
          }
        }

        if (!cancelled) {
          setPreviewResultUrl(warped.toDataURL('image/jpeg', 0.88));
          setPreviewProgressPct(100);
          showCompletionToast(
            autoRemoveWatermark
              ? 'Perspective & Watermark Cleanup Complete'
              : 'Perspective Correction Complete',
            `Page ${selectedIdx + 1} flattened cleanly into rectangular preview.`
          );
          window.setTimeout(() => {
            if (!cancelled) setPreviewProgressPct(0);
          }, 1500);
        }
      } catch (err) {
        console.warn('Scan preview render error:', err);
        if (!cancelled) setPreviewProgressPct(0);
      } finally {
        if (!cancelled) setIsRenderingPreview(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePage, enhanceMode, flattenShadows, autoRemoveWatermark, watermarkCutoff, selectedIdx, showCompletionToast]);

  const detectQuadForDataUrl = async (
    dataUrl: string
  ): Promise<{ width: number; height: number; quad: PdfQuadCorners }> => {
    const img = await decodeImageUrl(dataUrl);
    const nw = Math.max(40, img.naturalWidth || 800);
    const nh = Math.max(40, img.naturalHeight || 1100);
    const maxSample = 480;
    const scale = Math.min(1, maxSample / Math.max(nw, nh));
    const sw = Math.max(40, Math.round(nw * scale));
    const sh = Math.max(40, Math.round(nh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: nw, height: nh, quad: FULL_FRAME_QUAD };
    ctx.drawImage(img, 0, 0, sw, sh);
    const imgData = ctx.getImageData(0, 0, sw, sh);
    const quad = detectDocumentQuadFromImageData(imgData);
    return { width: nw, height: nh, quad };
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    setLoadError(null);
    setIsLoadingFiles(true);
    setLastResult(null);

    try {
      const nextItems: ScanQueuePage[] = [];

      for (const file of incoming) {
        const lower = file.name.toLowerCase();
        const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
        const isImg =
          file.type.startsWith('image/') ||
          ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].some((ext) => lower.endsWith(ext));

        if (isPdf) {
          const buf = await file.arrayBuffer();
          const pageUrls = await renderPdfPages(buf, 20);
          if (pageUrls.length === 0) {
            throw new Error(`Could not render pages from ${file.name}. Try uploading JPG/PNG photos.`);
          }
          for (let p = 0; p < pageUrls.length; p++) {
            const info = await detectQuadForDataUrl(pageUrls[p]);
            nextItems.push({
              id: `scan_${Date.now()}_${nextItems.length}_${Math.random().toString(36).slice(2, 6)}`,
              name: `${file.name.replace(/\.pdf$/i, '')}_p${p + 1}`,
              dataUrl: pageUrls[p],
              width: info.width,
              height: info.height,
              quad: info.quad,
              autoQuad: info.quad,
            });
          }
        } else if (isImg) {
          const dataUrl = await readFileAsDataUrl(file);
          const info = await detectQuadForDataUrl(dataUrl);
          nextItems.push({
            id: `scan_${Date.now()}_${nextItems.length}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            dataUrl,
            width: info.width,
            height: info.height,
            quad: info.quad,
            autoQuad: info.quad,
          });
        }
      }

      if (nextItems.length === 0) {
        setLoadError('Please select physical document photos (JPG, PNG, WebP) or a PDF.');
        return;
      }

      setPages((prev) => {
        const combined = [...prev, ...nextItems];
        if (prev.length === 0) setSelectedIdx(0);
        return combined;
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to prepare uploaded document image.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const updateActiveQuadCorner = useCallback(
    (corner: CornerKey, point: Point2D) => {
      setPages((prev) =>
        prev.map((pg, idx) =>
          idx === selectedIdx
            ? {
                ...pg,
                quad: {
                  ...pg.quad,
                  [corner]: {
                    x: Number(Math.max(0.01, Math.min(0.99, point.x)).toFixed(3)),
                    y: Number(Math.max(0.01, Math.min(0.99, point.y)).toFixed(3)),
                  },
                },
              }
            : pg
        )
      );
      setLastResult(null);
    },
    [selectedIdx]
  );

  const handleCornerDragStart = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = quadStageRef.current;
    if (!container) return;

    const updateFromClient = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      updateActiveQuadCorner(corner, { x: nx, y: ny });
    };

    updateFromClient(e.clientX, e.clientY);

    const onMove = (ev: PointerEvent) => updateFromClient(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const buildScannedPdf = async () => {
    if (pages.length === 0) return null;
    setIsExporting(true);
    setLoadError(null);
    setExportProgress({ percent: 8, status: 'Initializing perspective scanner...' });

    try {
      const res = await perspectiveScanPagesToPdf(
        pages.map((p) => ({
          id: p.id,
          name: p.name,
          dataUrl: p.dataUrl,
          quad: p.quad,
        })),
        {
          flattenShadows,
          autoRemoveWatermark,
          enhanceMode,
          fitPage,
          watermarkCutoff,
          outputName: pages[0].name,
        },
        (percent, status) => setExportProgress({ percent, status })
      );
      setExportProgress({ percent: 100, status: 'Perspective correction & cleanup complete!' });
      setLastResult({ blob: res.blob, fileName: res.fileName, pageCount: res.pageCount });
      showCompletionToast(
        autoRemoveWatermark
          ? 'Scan & Watermark Removal Finished'
          : 'Perspective Scan PDF Finished',
        `${res.fileName} (${res.pageCount} rectangular page${res.pageCount === 1 ? '' : 's'}) ready.`
      );
      return res;
    } catch (err: any) {
      setLoadError(err?.message || 'Perspective scan failed.');
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handleApplyToCoverStudio = async () => {
    const res = lastResult ? lastResult : await buildScannedPdf();
    if (!res) return;
    const pdfFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
    onApplyPdfToCoverStudio(pdfFile);
  };

  const handleDownloadScannedPdf = async () => {
    const res = lastResult ? lastResult : await buildScannedPdf();
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onTaskComplete?.({
      headline: 'Document Scanned & Cleaned',
      subtext: `${res.fileName} (${res.pageCount} page${res.pageCount === 1 ? '' : 's'}) packed into crisp rectangular PDF format.`,
      statusLabel: 'Crop & Perspective Scan Complete',
      downloadFile: {
        blob: res.blob,
        fileName: res.fileName,
        fileSizeBytes: res.blob.size,
        toolLabel: 'Crop & Scan Studio',
        openInStudio: false,
      },
    });
  };

  const handlePreviewScannedPdf = async () => {
    if (!onPreviewDocument) return;
    const res = lastResult ? lastResult : await buildScannedPdf();
    if (!res) return;
    onPreviewDocument({
      title: res.fileName,
      fileName: res.fileName,
      blob: res.blob,
      subtitle: `${res.pageCount} page${res.pageCount === 1 ? '' : 's'} · Perspective Scanned PDF`,
    });
  };

  const activeQuad = activePage?.quad ?? FULL_FRAME_QUAD;
  const polygonPoints = [activeQuad.tl, activeQuad.tr, activeQuad.br, activeQuad.bl]
    .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
    .join(' ');

  return (
    <div className="space-y-4">
      <LiquidCrystalCard accentGlow="yellow" className="rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-yellow-400/20 text-amber-700 dark:text-yellow-400 border border-yellow-400/40">
                <ScanLine className="w-3 h-3" />
                <span>Crop / Scan</span>
              </span>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Physical Document Scanner &amp; Perspective Crop
              </h2>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Upload phone photos of angled documents — auto-straightens 4 corners into crisp rectangular PDF pages while stripping desk backgrounds and watermarks.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleUploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <LiquidCrystalButton
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl text-xs whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{pages.length > 0 ? 'Add Pages' : 'Upload Photos'}</span>
            </LiquidCrystalButton>

            {onBackToEditor && (
              <LiquidCrystalButton
                variant="neutral"
                onClick={onBackToEditor}
                className="px-3 py-2 rounded-xl text-xs whitespace-nowrap"
              >
                <span>Back to Editor</span>
              </LiquidCrystalButton>
            )}
          </div>
        </div>
      </LiquidCrystalCard>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 text-xs text-red-700 dark:text-red-300">
          {loadError}
        </div>
      )}

      {pages.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files) void handleUploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-white dark:bg-[var(--pl-surface)] border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-yellow-400 bg-yellow-400/10'
              : 'border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 hover:bg-zinc-50 dark:hover:bg-zinc-950'
          }`}
        >
          {isLoadingFiles ? (
            <div className="flex justify-center py-4">
              <ClipingPapersLogo
                size="md"
                layout="stacked"
                statusText="Detecting paper edges & straightening geometry..."
              />
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-yellow-400/20 border border-yellow-400/40 text-amber-600 dark:text-yellow-400 flex items-center justify-center mx-auto">
                <Crop className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Drop Phone Photos or Scanned PDF Here
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Supports JPG, PNG, WebP, or PDF pages. Multi-photo uploads automatically pack into one multi-page rectangular PDF.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  100% browser-private
                </span>
                <span>·</span>
                <span>4-Corner Perspective Warp</span>
                <span>·</span>
                <span>Auto Watermark Removal</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Page Filmstrip + View Mode Tabs */}
          <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-0.5">
              {pages.map((pg, idx) => (
                <div
                  key={pg.id}
                  onClick={() => setSelectedIdx(idx)}
                  className={`relative group flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl border text-xs font-semibold cursor-pointer shrink-0 transition-all ${
                    idx === selectedIdx
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-yellow-200'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:border-yellow-400/50'
                  }`}
                >
                  <img
                    src={pg.dataUrl}
                    alt={pg.name}
                    className="w-7 h-9 rounded-md object-cover border border-zinc-300 dark:border-zinc-700"
                  />
                  <span className="max-w-[90px] truncate">Page {idx + 1}</span>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPages((prev) => {
                          const next = prev.filter((_, i) => i !== idx);
                          setSelectedIdx((curr) => Math.max(0, Math.min(curr, next.length - 1)));
                          return next;
                        });
                        setLastResult(null);
                      }}
                      title="Remove page"
                      className="p-0.5 rounded hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="inline-grid grid-cols-3 p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                  viewMode === 'split'
                    ? 'bg-yellow-400 text-black'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Split View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cropper')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                  viewMode === 'cropper'
                    ? 'bg-yellow-400 text-black'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Corners
              </button>
              <button
                type="button"
                onClick={() => setViewMode('result')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                  viewMode === 'result'
                    ? 'bg-yellow-400 text-black'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Cleaned
              </button>
            </div>
          </div>

          {/* Main Interactive 4-Corner Cropper + Live Scanned Output */}
          <div
            className={`grid gap-4 items-start ${
              viewMode === 'split' ? 'grid-cols-1 2xl:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {viewMode !== 'result' && activePage && (
              <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Crop className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                    Drag 4 Corners to Match Paper
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPages((prev) =>
                          prev.map((pg, i) => (i === selectedIdx ? { ...pg, quad: pg.autoQuad } : pg))
                        );
                        setLastResult(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Wand2 className="w-3 h-3 text-amber-600 dark:text-yellow-400" />
                      Auto Edges
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPages((prev) =>
                          prev.map((pg, i) => (i === selectedIdx ? { ...pg, quad: FULL_FRAME_QUAD } : pg))
                        );
                        setLastResult(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Maximize className="w-3 h-3" />
                      Full
                    </button>
                  </div>
                </div>

                <div className="flex justify-center bg-zinc-950/90 rounded-xl p-2 border border-zinc-800 overflow-hidden">
                  <div
                    ref={quadStageRef}
                    className="relative inline-block max-h-[380px] select-none touch-none"
                  >
                    <img
                      src={activePage.dataUrl}
                      alt={activePage.name}
                      draggable={false}
                      className="max-h-[360px] w-auto h-auto block rounded pointer-events-none"
                    />

                    {/* Darkened outer mask + luminous yellow quad border */}
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <polygon
                        points={polygonPoints}
                        fill="rgba(250, 204, 21, 0.10)"
                        stroke="#facc15"
                        strokeWidth="0.9"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>

                    {(['tl', 'tr', 'br', 'bl'] as CornerKey[]).map((key) => {
                      const pt = activeQuad[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={(e) => handleCornerDragStart(key, e)}
                          aria-label={`Drag ${key.toUpperCase()} document corner`}
                          style={{
                            left: `${pt.x * 100}%`,
                            top: `${pt.y * 100}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-yellow-400 border-2 border-zinc-950 shadow-[0_0_0_2px_rgba(var(--pl-accent-rgb),0.45),0_2px_6px_rgba(0,0,0,0.6)] cursor-grab active:cursor-grabbing hover:scale-125 transition-transform touch-none z-10"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {viewMode !== 'cropper' && activePage && (
              <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    Perspective-Corrected Rectangular Preview
                  </span>
                  {isRenderingPreview ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-yellow-400 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Updating
                    </span>
                  ) : previewProgressPct === 100 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Finished
                    </span>
                  ) : null}
                </div>

                {/* Subtle Live Scan & Cleanup Progress Bar */}
                {previewProgressPct > 0 && (
                  <div className="w-full h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        previewProgressPct >= 100 ? 'bg-emerald-500' : 'bg-yellow-400'
                      }`}
                      style={{ width: `${previewProgressPct}%` }}
                    />
                  </div>
                )}

                <div className="min-h-[260px] max-h-[380px] flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  {previewResultUrl ? (
                    <img
                      src={previewResultUrl}
                      alt="Perspective corrected scan preview"
                      className="max-h-[350px] w-auto object-contain rounded shadow-lg border border-zinc-300 dark:border-zinc-700 bg-white"
                    />
                  ) : (
                    <ClipingPapersLogo size="sm" layout="stacked" statusText="Warping & cleaning..." />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scan & Watermark Cleanup Controls */}
          <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Scan Style */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-900 dark:text-white block">
                  Document Cleanup Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ENHANCE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setEnhanceMode(preset.id);
                        setLastResult(null);
                      }}
                      className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                        enhanceMode === preset.id
                          ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-yellow-200'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400/50'
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">{preset.label}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* PDF Page Format + Cleanup Toggles */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-900 dark:text-white block">
                    Output Rectangular PDF Format
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAGE_FORMATS.map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => {
                          setFitPage(fmt.id);
                          setLastResult(null);
                        }}
                        className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          fitPage === fmt.id
                            ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400/50'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
                    <span className="font-medium">Strip paper shadows &amp; off-white cast</span>
                    <input
                      type="checkbox"
                      checked={flattenShadows}
                      onChange={(e) => {
                        setFlattenShadows(e.target.checked);
                        setLastResult(null);
                      }}
                      className="accent-yellow-400 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
                    <span className="font-medium">Remove faint watermarks automatically</span>
                    <input
                      type="checkbox"
                      checked={autoRemoveWatermark}
                      onChange={(e) => {
                        setAutoRemoveWatermark(e.target.checked);
                        setLastResult(null);
                      }}
                      className="accent-yellow-400 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  {autoRemoveWatermark && (
                    <div className="pt-0.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>Watermark Cleanup Strength</span>
                        <span className="font-mono font-bold text-amber-600 dark:text-yellow-400">
                          {watermarkCutoff}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={140}
                        max={215}
                        step={2}
                        value={watermarkCutoff}
                        onChange={(e) => {
                          setWatermarkCutoff(Number(e.target.value));
                          setLastResult(null);
                        }}
                        className="w-full accent-yellow-400 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isExporting && exportProgress && (
              <RobotProgressBar
                compact
                percent={exportProgress.percent}
                status={exportProgress.status}
              />
            )}

            {lastResult && !isExporting && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Ready: {lastResult.fileName} ({lastResult.pageCount} rectangular page
                  {lastResult.pageCount === 1 ? '' : 's'})
                </span>
              </div>
            )}

            {/* Final Action Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setPages([]);
                  setSelectedIdx(0);
                  setPreviewResultUrl(null);
                  setLastResult(null);
                }}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-500 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Clear Queue
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {onPreviewDocument && (
                  <LiquidCrystalButton
                    variant="neutral"
                    disabled={isExporting}
                    onClick={handlePreviewScannedPdf}
                    className="px-3.5 py-2 rounded-xl text-xs whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Preview PDF</span>
                  </LiquidCrystalButton>
                )}

                <LiquidCrystalButton
                  variant="neutral"
                  disabled={isExporting}
                  onClick={handleDownloadScannedPdf}
                  className="px-3.5 py-2 rounded-xl text-xs whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-500" />
                  <span>Download PDF</span>
                </LiquidCrystalButton>

                <LiquidCrystalButton
                  variant="primary"
                  disabled={isExporting}
                  onClick={handleApplyToCoverStudio}
                  className="px-4 py-2 rounded-xl text-xs whitespace-nowrap"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Apply &amp; Use in Cover Studio</span>
                </LiquidCrystalButton>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Floating Toast Notification on Perspective Correction & Watermark Removal Completion */}
      <AnimatePresence>
        {scanToast && (
          <motion.div
            key={scanToast.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.16 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            aria-live="polite"
            className="fixed bottom-4 left-4 right-4 sm:right-auto sm:left-5 sm:max-w-sm z-50 rounded-2xl bg-white/95 dark:bg-[var(--pl-surface)]/95 backdrop-blur-xl border border-emerald-400/65 dark:border-emerald-500/45 shadow-[0_14px_34px_-8px_rgba(16,185,129,0.28)] px-3.5 py-2.5 flex items-start justify-between gap-2.5"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                  {scanToast.title}
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                  {scanToast.detail}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScanToast(null)}
              aria-label="Dismiss scan notification"
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
