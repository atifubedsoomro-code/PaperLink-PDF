import React, { useEffect, useRef, useState } from 'react';
import {
  Eraser,
  EyeOff,
  LayoutGrid,
  Upload,
  Download,
  Undo2,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  ImageWatermarkRemoveMode,
  PhotoGridLayout,
  ProcessedImageResult,
  RedactBlurRegion,
  blurAndRedactImage,
  createPhotoGridCollage,
  removeImageWatermark,
} from '../services/imageToolkit';

interface ImageRoutineToolsProps {
  mode: 'watermark-remove' | 'blur-redact' | 'grid-collage';
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
  onSendResultToTool?: (
    res: ProcessedImageResult,
    target: 'bg-remove' | 'resize' | 'convert' | 'crop' | 'compress' | 'filters'
  ) => void;
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

export const ImageRoutineTools: React.FC<ImageRoutineToolsProps> = ({
  mode,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onSendResultToTool,
}) => {
  // =========================================================
  // 1. IMAGE WATERMARK REMOVER
  // =========================================================
  const wmInputRef = useRef<HTMLInputElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const wmImgRef = useRef<HTMLImageElement>(null);
  const [wmFile, setWmFile] = useState<File | null>(null);
  const [wmOrigUrl, setWmOrigUrl] = useState<string | null>(null);
  const [wmDims, setWmDims] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [wmBrushSize, setWmBrushSize] = useState(26);
  const [wmToolType, setWmToolType] = useState<'brush' | 'box'>('brush');
  const [wmAlgo, setWmAlgo] = useState<ImageWatermarkRemoveMode>('inpaint');
  const [wmStrength, setWmStrength] = useState(72);
  const [wmFormat, setWmFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [wmResult, setWmResult] = useState<ProcessedImageResult | null>(null);
  const [hasMaskStrokes, setHasMaskStrokes] = useState(false);
  const [boxDraft, setBoxDraft] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const isPaintingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const maskHistoryRef = useRef<ImageData[]>([]);

  // =========================================================
  // 2. BLUR & REDACT PRIVACY TOOL
  // =========================================================
  const brInputRef = useRef<HTMLInputElement>(null);
  const [brFile, setBrFile] = useState<File | null>(null);
  const [brOrigUrl, setBrOrigUrl] = useState<string | null>(null);
  const [brRegions, setBrRegions] = useState<RedactBlurRegion[]>([]);
  const [brMode, setBrMode] = useState<'blur' | 'pixelate' | 'redact'>('blur');
  const [brIntensity, setBrIntensity] = useState(22);
  const [brRedactColor, setBrRedactColor] = useState('#09090b');
  const [brFormat, setBrFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [brDraft, setBrDraft] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [brResult, setBrResult] = useState<ProcessedImageResult | null>(null);

  // =========================================================
  // 3. PHOTO GRID & ID JOINER
  // =========================================================
  const gridInputRef = useRef<HTMLInputElement>(null);
  const [gridFiles, setGridFiles] = useState<Array<{ file: File; url: string }>>([]);
  const [gridLayout, setGridLayout] = useState<PhotoGridLayout>('id-sheet');
  const [gridGap, setGridGap] = useState(24);
  const [gridPad, setGridPad] = useState(32);
  const [gridRadius, setGridRadius] = useState(14);
  const [gridBg, setGridBg] = useState('#FFFFFF');
  const [gridFit, setGridFit] = useState<'contain' | 'cover'>('contain');
  const [gridFormat, setGridFormat] = useState<'png' | 'jpg' | 'webp'>('jpg');
  const [gridResult, setGridResult] = useState<ProcessedImageResult | null>(null);

  useEffect(() => {
    return () => {
      if (wmOrigUrl) URL.revokeObjectURL(wmOrigUrl);
      if (brOrigUrl) URL.revokeObjectURL(brOrigUrl);
    };
  }, []);

  // Initialize blank transparent mask canvas when WM image loads
  const initMaskCanvas = (w: number, h: number) => {
    const mc = maskCanvasRef.current;
    if (!mc) return;
    mc.width = Math.min(1200, Math.max(200, w));
    mc.height = Math.round((mc.width / Math.max(1, w)) * h);
    const ctx = mc.getContext('2d');
    ctx?.clearRect(0, 0, mc.width, mc.height);
    maskHistoryRef.current = [];
    setHasMaskStrokes(false);
  };

  const handleLoadWmImage = (file: File) => {
    onError(null);
    if (wmOrigUrl) URL.revokeObjectURL(wmOrigUrl);
    const url = URL.createObjectURL(file);
    setWmFile(file);
    setWmOrigUrl(url);
    setWmResult(null);

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 600;
      setWmDims({ w, h });
      setTimeout(() => initMaskCanvas(w, h), 40);
    };
    img.src = url;
  };

  const saveMaskSnapshot = () => {
    const mc = maskCanvasRef.current;
    if (!mc) return;
    const ctx = mc.getContext('2d');
    if (!ctx) return;
    maskHistoryRef.current.push(ctx.getImageData(0, 0, mc.width, mc.height));
    if (maskHistoryRef.current.length > 15) maskHistoryRef.current.shift();
  };

  const undoMaskStroke = () => {
    const mc = maskCanvasRef.current;
    if (!mc || maskHistoryRef.current.length === 0) return;
    const ctx = mc.getContext('2d');
    if (!ctx) return;
    const prev = maskHistoryRef.current.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
    setWmResult(null);
  };

  const getMaskPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mc = maskCanvasRef.current!;
    const rect = mc.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * mc.width,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * mc.height,
    };
  };

  const handleRunWatermarkRemove = async () => {
    if (!wmFile || !maskCanvasRef.current) return;
    onError(null);
    setWmResult(null);
    setIsWorking(true);
    try {
      const res = await removeImageWatermark(
        wmFile,
        maskCanvasRef.current,
        {
          mode: wmAlgo,
          strength: wmStrength,
          format: wmFormat,
          quality: 0.92,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setWmResult(res);
      onTaskComplete?.({
        headline: 'Watermark Removed from Image',
        subtext: `${res.fileName} (${formatBytes(res.sizeBytes)}) is ready`,
        statusLabel: 'Watermark Remover Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to remove watermark.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const handleLoadBrFile = (file: File) => {
    onError(null);
    if (brOrigUrl) URL.revokeObjectURL(brOrigUrl);
    setBrFile(file);
    setBrOrigUrl(URL.createObjectURL(file));
    setBrRegions([]);
    setBrResult(null);
  };

  const handleRunBlurRedact = async () => {
    if (!brFile) return;
    onError(null);
    setBrResult(null);
    setIsWorking(true);
    try {
      const res = await blurAndRedactImage(brFile, brRegions, {
        format: brFormat,
        quality: 0.92,
      });
      setBrResult(res);
      onTaskComplete?.({
        headline: 'Privacy Redaction Applied',
        subtext: `${brRegions.length} sensitive zone(s) masked in ${res.fileName}`,
        statusLabel: 'Blur & Redact Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to apply blur/redact.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleAddGridFiles = (list: FileList | File[]) => {
    onError(null);
    const valid = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)
    );
    if (valid.length === 0) return;
    setGridResult(null);
    setGridFiles((prev) => [
      ...prev,
      ...valid.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  };

  const handleRunGridCollage = async () => {
    if (gridFiles.length === 0) return;
    onError(null);
    setGridResult(null);
    setIsWorking(true);
    try {
      const res = await createPhotoGridCollage(
        gridFiles.map((g) => g.file),
        {
          layout: gridLayout,
          canvasWidth: 1600,
          gapPx: gridGap,
          paddingPx: gridPad,
          cornerRadiusPx: gridRadius,
          bgColor: gridBg,
          fit: gridFit,
          format: gridFormat,
          quality: 0.92,
        }
      );
      setGridResult(res);
      onTaskComplete?.({
        headline: 'Photo Grid Created',
        subtext: `${res.fileName} (${res.width}×${res.height}px) is ready`,
        statusLabel: 'Photo Grid Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to build photo grid.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // RENDER MODE 1: WATERMARK REMOVER
  // =========================================================
  if (mode === 'watermark-remove') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Eraser className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Image Watermark Remover</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Paint over text watermarks, corner logos, or date stamps — smart pixel inpainting heals the backdrop seamlessly.
            </p>
          </div>

          <input
            ref={wmInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadWmImage(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => wmInputRef.current?.click()}
            className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1" />
            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
              {wmFile ? wmFile.name : 'Upload Image with Watermark'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {wmFile ? `${wmDims.w}×${wmDims.h}px` : 'PNG, JPG, WebP, or BMP'}
            </p>
          </button>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWmToolType('brush')}
                className={`py-2 rounded-lg border font-semibold cursor-pointer ${
                  wmToolType === 'brush'
                    ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Brush Mask
              </button>
              <button
                type="button"
                onClick={() => setWmToolType('box')}
                className={`py-2 rounded-lg border font-semibold cursor-pointer ${
                  wmToolType === 'box'
                    ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Box Select
              </button>
            </div>

            {wmToolType === 'brush' && (
              <div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Brush Size</span>
                  <span className="font-mono font-bold tabular-nums">{wmBrushSize}px</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={80}
                  value={wmBrushSize}
                  onChange={(e) => setWmBrushSize(Number(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Removal Mode
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'inpaint' as const, label: 'Photo Inpaint' },
                  { id: 'document-paper' as const, label: 'Doc / Paper' },
                  { id: 'deblend' as const, label: 'Soft Deblend' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setWmAlgo(opt.id)}
                    className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      wmAlgo === opt.id
                        ? 'border-yellow-400 bg-yellow-400/18 text-zinc-950 dark:text-white font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Blend Smoothness</span>
                <span className="font-mono font-bold tabular-nums">{wmStrength}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={wmStrength}
                onChange={(e) => setWmStrength(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setWmFormat(fmt)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                    wmFormat === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!wmFile || !hasMaskStrokes || isWorking}
            onClick={handleRunWatermarkRemove}
            className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
            <span>Erase Masked Watermark</span>
          </button>

          {wmResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {wmResult.fileName} ({formatBytes(wmResult.sizeBytes)})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => triggerDownload(wmResult.blob, wmResult.fileName)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                {onSendResultToTool && (
                  <button
                    type="button"
                    onClick={() => onSendResultToTool(wmResult, 'compress')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-yellow-300 font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Compress</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Mask Painting Stage + Result Preview */}
        <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              {wmResult ? 'Result Comparison (Original vs Cleaned)' : 'Paint or Box Over the Watermark'}
            </h3>
            {wmOrigUrl && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={undoMaskStroke}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    initMaskCanvas(wmDims.w, wmDims.h);
                    setWmResult(null);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:text-red-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {!wmOrigUrl ? (
            <div
              onClick={() => wmInputRef.current?.click()}
              className="min-h-[340px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
            >
              <Eraser className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500 max-w-sm">
                Upload any photo, certificate, or product shot, paint over unwanted text or watermarks, and heal cleanly offline.
              </p>
              <p className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Runs completely inside your browser canvas.</span>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 flex justify-center">
                <div className="relative inline-block max-w-full select-none touch-none">
                  <img
                    ref={wmImgRef}
                    src={wmOrigUrl}
                    alt="Source for watermark removal"
                    className="max-h-[420px] w-auto rounded-lg block pointer-events-none"
                  />
                  <canvas
                    ref={maskCanvasRef}
                    onPointerDown={(e) => {
                      saveMaskSnapshot();
                      const pt = getMaskPoint(e);
                      if (wmToolType === 'brush') {
                        isPaintingRef.current = true;
                        lastPtRef.current = pt;
                        const ctx = maskCanvasRef.current?.getContext('2d');
                        if (ctx) {
                          ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
                          ctx.beginPath();
                          ctx.arc(pt.x, pt.y, wmBrushSize / 2, 0, Math.PI * 2);
                          ctx.fill();
                        }
                        setHasMaskStrokes(true);
                      } else {
                        setBoxDraft({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
                      }
                    }}
                    onPointerMove={(e) => {
                      const pt = getMaskPoint(e);
                      if (wmToolType === 'brush' && isPaintingRef.current && lastPtRef.current) {
                        const ctx = maskCanvasRef.current?.getContext('2d');
                        if (ctx) {
                          ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
                          ctx.lineWidth = wmBrushSize;
                          ctx.lineCap = 'round';
                          ctx.lineJoin = 'round';
                          ctx.beginPath();
                          ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
                          ctx.lineTo(pt.x, pt.y);
                          ctx.stroke();
                        }
                        lastPtRef.current = pt;
                      } else if (wmToolType === 'box' && boxDraft) {
                        setBoxDraft((prev) => (prev ? { ...prev, x1: pt.x, y1: pt.y } : null));
                      }
                    }}
                    onPointerUp={() => {
                      if (wmToolType === 'box' && boxDraft && maskCanvasRef.current) {
                        const ctx = maskCanvasRef.current.getContext('2d');
                        const rx = Math.min(boxDraft.x0, boxDraft.x1);
                        const ry = Math.min(boxDraft.y0, boxDraft.y1);
                        const rw = Math.abs(boxDraft.x1 - boxDraft.x0);
                        const rh = Math.abs(boxDraft.y1 - boxDraft.y0);
                        if (ctx && rw > 3 && rh > 3) {
                          ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
                          ctx.fillRect(rx, ry, rw, rh);
                          setHasMaskStrokes(true);
                        }
                        setBoxDraft(null);
                      }
                      isPaintingRef.current = false;
                      lastPtRef.current = null;
                    }}
                    onPointerLeave={() => {
                      isPaintingRef.current = false;
                      lastPtRef.current = null;
                    }}
                    className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg"
                  />
                  {boxDraft && maskCanvasRef.current && (
                    <div
                      style={{
                        left: `${(Math.min(boxDraft.x0, boxDraft.x1) / maskCanvasRef.current.width) * 100}%`,
                        top: `${(Math.min(boxDraft.y0, boxDraft.y1) / maskCanvasRef.current.height) * 100}%`,
                        width: `${(Math.abs(boxDraft.x1 - boxDraft.x0) / maskCanvasRef.current.width) * 100}%`,
                        height: `${(Math.abs(boxDraft.y1 - boxDraft.y0) / maskCanvasRef.current.height) * 100}%`,
                      }}
                      className="absolute border-2 border-yellow-400 bg-yellow-400/30 pointer-events-none"
                    />
                  )}
                </div>
              </div>

              {wmResult && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    Cleaned Output Preview
                  </p>
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-zinc-100 dark:bg-zinc-950 p-3 flex justify-center">
                    <img
                      src={wmResult.dataUrl}
                      alt="Watermark removed output"
                      className="max-h-[380px] w-auto rounded-lg shadow"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================
  // RENDER MODE 2: BLUR & REDACT PRIVACY TOOL
  // =========================================================
  if (mode === 'blur-redact') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Privacy Blur, Pixelate &amp; Redact</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Drag rectangles over sensitive info (faces, phone numbers, receipts, IDs) to blur, pixelate, or blackout permanently.
            </p>
          </div>

          <input
            ref={brInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadBrFile(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => brInputRef.current?.click()}
            className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1" />
            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
              {brFile ? brFile.name : 'Select Screenshot or Photo'}
            </p>
          </button>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'blur' as const, label: 'Blur' },
                { id: 'pixelate' as const, label: 'Pixelate' },
                { id: 'redact' as const, label: 'Solid Bar' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBrMode(m.id)}
                  className={`py-2 rounded-lg border font-semibold cursor-pointer ${
                    brMode === m.id
                      ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {brMode !== 'redact' ? (
              <div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>{brMode === 'blur' ? 'Blur Strength' : 'Pixel Block Size'}</span>
                  <span className="font-mono font-bold tabular-nums">{brIntensity}px</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={40}
                  value={brIntensity}
                  onChange={(e) => setBrIntensity(Number(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">Redaction Fill Color</span>
                <input
                  type="color"
                  value={brRedactColor}
                  onChange={(e) => setBrRedactColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setBrFormat(fmt)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                    brFormat === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!brFile || brRegions.length === 0 || isWorking}
            onClick={handleRunBlurRedact}
            className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
            <span>Apply Redaction ({brRegions.length} Zone{brRegions.length === 1 ? '' : 's'})</span>
          </button>

          {brResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {brResult.fileName} ({formatBytes(brResult.sizeBytes)})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => triggerDownload(brResult.blob, brResult.fileName)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                {onSendResultToTool && (
                  <button
                    type="button"
                    onClick={() => onSendResultToTool(brResult, 'resize')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-yellow-300 font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Resize</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Drag Boxes Over Sensitive Areas
            </h3>
            {brRegions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBrRegions((prev) => prev.slice(0, -1));
                    setBrResult(null);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBrRegions([]);
                    setBrResult(null);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:text-red-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {!brOrigUrl ? (
            <div
              onClick={() => brInputRef.current?.click()}
              className="min-h-[340px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
            >
              <EyeOff className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500 max-w-sm">
                Upload a photo or screenshot to hide personal details with permanent blur, pixelation, or solid black bars.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 flex justify-center">
                <div
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;
                    setBrDraft({ x0: x, y0: y, x1: x, y1: y });
                  }}
                  onPointerMove={(e) => {
                    if (!brDraft) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setBrDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            x1: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
                            y1: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
                          }
                        : null
                    );
                  }}
                  onPointerUp={() => {
                    if (brDraft) {
                      const xFrac = Math.min(brDraft.x0, brDraft.x1);
                      const yFrac = Math.min(brDraft.y0, brDraft.y1);
                      const wFrac = Math.abs(brDraft.x1 - brDraft.x0);
                      const hFrac = Math.abs(brDraft.y1 - brDraft.y0);
                      if (wFrac > 0.015 && hFrac > 0.015) {
                        setBrRegions((prev) => [
                          ...prev,
                          {
                            id: `reg_${Date.now()}`,
                            xFrac,
                            yFrac,
                            wFrac,
                            hFrac,
                            mode: brMode,
                            intensity: brIntensity,
                            color: brRedactColor,
                          },
                        ]);
                        setBrResult(null);
                      }
                    }
                    setBrDraft(null);
                  }}
                  className="relative inline-block max-w-full cursor-crosshair select-none touch-none"
                >
                  <img
                    src={brResult ? brResult.dataUrl : brOrigUrl}
                    alt="Redact canvas"
                    className="max-h-[440px] w-auto rounded-lg block pointer-events-none"
                  />
                  {!brResult &&
                    brRegions.map((reg) => (
                      <div
                        key={reg.id}
                        style={{
                          left: `${reg.xFrac * 100}%`,
                          top: `${reg.yFrac * 100}%`,
                          width: `${reg.wFrac * 100}%`,
                          height: `${reg.hFrac * 100}%`,
                          backgroundColor:
                            reg.mode === 'redact' ? reg.color || '#09090b' : 'rgba(255,255,255,0.22)',
                          backdropFilter:
                            reg.mode === 'blur'
                              ? `blur(${Math.max(4, reg.intensity * 0.5)}px)`
                              : reg.mode === 'pixelate'
                              ? 'blur(3px) contrast(140%)'
                              : undefined,
                        }}
                        className="absolute border border-yellow-400/85 pointer-events-none"
                      />
                    ))}
                  {brDraft && (
                    <div
                      style={{
                        left: `${Math.min(brDraft.x0, brDraft.x1) * 100}%`,
                        top: `${Math.min(brDraft.y0, brDraft.y1) * 100}%`,
                        width: `${Math.abs(brDraft.x1 - brDraft.x0) * 100}%`,
                        height: `${Math.abs(brDraft.y1 - brDraft.y0) * 100}%`,
                      }}
                      className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/20 pointer-events-none"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================
  // RENDER MODE 3: PHOTO GRID & ID CARD FRONT/BACK JOINER
  // =========================================================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
            <span>Photo Grid &amp; ID Front/Back Joiner</span>
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Combine ID card front + back photos side-by-side, build stacked comparison sheets, or assemble crisp 2×2 and 3×2 grids.
          </p>
        </div>

        <input
          ref={gridInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/bmp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleAddGridFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => gridInputRef.current?.click()}
          className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-center cursor-pointer transition-colors"
        >
          <Plus className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-zinc-900 dark:text-white">
            Add 2 to 6 Photos ({gridFiles.length} added)
          </p>
        </button>

        {gridFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gridFiles.map((item, idx) => (
              <div
                key={`${item.file.name}_${idx}`}
                className="relative w-14 h-14 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden group"
              >
                <img src={item.url} alt={item.file.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    setGridFiles((prev) => prev.filter((_, i) => i !== idx));
                    setGridResult(null);
                  }}
                  aria-label="Remove photo"
                  className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <span className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Layout Preset
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'id-sheet' as const, label: 'ID Front + Back' },
                { id: 'side-by-side' as const, label: 'Side-by-Side Row' },
                { id: 'stacked' as const, label: 'Vertical Stack' },
                { id: 'grid-2x2' as const, label: '2×2 Photo Grid' },
                { id: 'grid-3x2' as const, label: '3×2 Photo Grid' },
              ].map((lay) => (
                <button
                  key={lay.id}
                  type="button"
                  onClick={() => {
                    setGridLayout(lay.id);
                    setGridResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg border font-semibold cursor-pointer ${
                    gridLayout === lay.id
                      ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {lay.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Gap Spacing</span>
                <span className="font-mono font-bold tabular-nums">{gridGap}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={64}
                value={gridGap}
                onChange={(e) => setGridGap(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Corner Radius</span>
                <span className="font-mono font-bold tabular-nums">{gridRadius}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={48}
                value={gridRadius}
                onChange={(e) => setGridRadius(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">Matte Color</span>
              <input
                type="color"
                value={gridBg}
                onChange={(e) => setGridBg(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>

            <div className="flex items-center gap-1">
              {(['contain', 'cover'] as const).map((fit) => (
                <button
                  key={fit}
                  type="button"
                  onClick={() => setGridFit(fit)}
                  className={`px-2.5 py-1 rounded-lg border capitalize font-semibold cursor-pointer ${
                    gridFit === fit
                      ? 'border-yellow-400 bg-yellow-400/20 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  {fit}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['jpg', 'png', 'webp'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setGridFormat(fmt)}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                  gridFormat === fmt
                    ? 'border-yellow-400 bg-yellow-400 text-black'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={gridFiles.length === 0 || isWorking}
          onClick={handleRunGridCollage}
          className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
          <span>Generate Photo Grid</span>
        </button>
      </div>

      <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Combined Sheet Preview
          </h3>
          {gridResult && (
            <button
              type="button"
              onClick={() => triggerDownload(gridResult.blob, gridResult.fileName)}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .{gridResult.format}</span>
            </button>
          )}
        </div>

        {gridResult ? (
          <div className="space-y-3">
            <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-4 flex justify-center">
              <img
                src={gridResult.dataUrl}
                alt="Combined grid result"
                className="max-h-[460px] w-auto rounded-lg shadow border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {gridResult.fileName} · {gridResult.width}×{gridResult.height}px ·{' '}
                {formatBytes(gridResult.sizeBytes)}
              </span>
            </div>
          </div>
        ) : (
          <div
            onClick={() => gridInputRef.current?.click()}
            className="min-h-[340px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
          >
            <LayoutGrid className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-500 max-w-sm">
              Upload 2 or more images on the left to combine ID fronts &amp; backs or create crisp photo grids.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
