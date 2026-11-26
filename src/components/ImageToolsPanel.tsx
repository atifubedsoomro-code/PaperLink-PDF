import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { LiquidCrystalCard } from './LiquidCrystal';
import { RobotProgressBar } from './RobotProgressBar';
import { MiniAiRobot } from './MiniAiRobot';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import {
  Eraser,
  Layers,
  FileImage,
  Maximize2,
  RefreshCw,
  Crop,
  Minimize2,
  Sliders,
  Upload,
  Download,
  Archive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Pipette,
  Copy,
  Check,
  Trash2,
  Plus,
  ShieldCheck,
  Droplets,
  EyeOff,
  LayoutGrid,
  Images,
} from 'lucide-react';
import {
  BgFillMode,
  BgRemoveEngine,
  DEFAULT_IMAGE_FILTERS,
  ImageFiltersConfig,
  ImageOutputFormat,
  ImageResizeFit,
  ProcessedImageResult,
  applyImageFilters,
  compressImageFile,
  convertImageFormat,
  createImagesZip,
  cropRotateFlipImage,
  extractDominantPalette,
  getImageDimensions,
  removeImageBackground,
  resizeImageFile,
} from '../services/imageToolkit';
import { PdfToImageTool } from './PdfToImageTool';
import { ImageRoutineTools } from './ImageRoutineTools';
import { PhotoBatchStudio } from './PhotoBatchStudio';
import { PreviewTarget } from './DocumentPreviewModal';

export type ImageToolTab =
  | 'photo-batch'
  | 'bg-remove'
  | 'bulk-bg-remove'
  | 'watermark-remove'
  | 'blur-redact'
  | 'grid-collage'
  | 'pdf-to-image'
  | 'resize'
  | 'convert'
  | 'crop'
  | 'compress'
  | 'filters';

interface ImageToolsPanelProps {
  activeTool: ImageToolTab;
  onToolChange: (tool: ImageToolTab) => void;
  userEmail?: string;
  onUseAsCoverLogo?: (dataUrl: string) => void;
  onTaskComplete?: (info: {
    headline: string;
    subtext: string;
    statusLabel?: string;
    downloadFile?: ReadyDownloadPayload;
  }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
}

interface BulkBgItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  result?: ProcessedImageResult;
  error?: string;
}

const IMAGE_TOOL_TABS: {
  id: ImageToolTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'bg-remove', label: 'BG Remover', icon: Eraser },
  { id: 'bulk-bg-remove', label: 'Bulk BG Remover', icon: Layers },
  { id: 'photo-batch', label: 'Photo Batch Studio', icon: Images },
  { id: 'watermark-remove', label: 'Watermark Remover', icon: Droplets },
  { id: 'blur-redact', label: 'Blur & Redact', icon: EyeOff },
  { id: 'grid-collage', label: 'Photo Grid / IDs', icon: LayoutGrid },
  { id: 'pdf-to-image', label: 'PDF to Image', icon: FileImage },
  { id: 'resize', label: 'Resize', icon: Maximize2 },
  { id: 'convert', label: 'Convert Format', icon: RefreshCw },
  { id: 'crop', label: 'Crop & Rotate', icon: Crop },
  { id: 'compress', label: 'Compress', icon: Minimize2 },
  { id: 'filters', label: 'Filters & Palette', icon: Sliders },
];

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)',
  backgroundSize: '18px 18px',
  backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
  backgroundColor: '#f4f4f5',
};

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

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|bmp|gif|svg|ico)$/i.test(file.name)
  );
}

export const ImageToolsPanel: React.FC<ImageToolsPanelProps> = ({
  activeTool,
  onToolChange,
  userEmail,
  onUseAsCoverLogo,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetFeedback = () => {
    setErrorMsg(null);
    setProgress(null);
  };

  // =========================================================
  // 1. SINGLE BACKGROUND REMOVER
  // =========================================================
  const bgInputRef = useRef<HTMLInputElement>(null);
  const eyedropperImgRef = useRef<HTMLImageElement>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgOrigUrl, setBgOrigUrl] = useState<string | null>(null);
  const [bgEngine, setBgEngine] = useState<BgRemoveEngine>('ai');
  const [bgKeyHex, setBgKeyHex] = useState<string>('#FFFFFF');
  const [bgUseCustomKey, setBgUseCustomKey] = useState<boolean>(false);
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [bgTolerance, setBgTolerance] = useState<number>(28);
  const [bgFeather, setBgFeather] = useState<number>(2);
  const [bgDespill, setBgDespill] = useState<boolean>(true);
  const [bgFillMode, setBgFillMode] = useState<BgFillMode>('transparent');
  const [bgFillColor, setBgFillColor] = useState<string>('#FFFFFF');
  const [bgFillGradEnd, setBgFillGradEnd] = useState<string>('#FACC15');
  const [bgDropShadow, setBgDropShadow] = useState<boolean>(false);
  const [bgOutFmt, setBgOutFmt] = useState<'png' | 'webp'>('png');
  const [bgPreviewSurface, setBgPreviewSurface] = useState<'checker' | 'light' | 'dark'>('checker');
  const [bgSplitPct, setBgSplitPct] = useState<number>(50);
  const [bgResult, setBgResult] = useState<ProcessedImageResult | null>(null);

  const handleLoadSingleBgFile = (file: File) => {
    resetFeedback();
    if (!isImageFile(file)) {
      setErrorMsg('Please select a PNG, JPG, WebP, or BMP image.');
      return;
    }
    if (bgOrigUrl) URL.revokeObjectURL(bgOrigUrl);
    setBgFile(file);
    setBgOrigUrl(URL.createObjectURL(file));
    setBgResult(null);
    setEyedropperActive(false);
  };

  const handlePickPixelFromPreview = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!eyedropperActive || !eyedropperImgRef.current) return;
    const imgEl = eyedropperImgRef.current;
    const rect = imgEl.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ry = (e.clientY - rect.top) / Math.max(1, rect.height);
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || 1;
    canvas.height = imgEl.naturalHeight || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, 0, 0);
    const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(rx * canvas.width)));
    const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(ry * canvas.height)));
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const hex =
      '#' +
      [pixel[0], pixel[1], pixel[2]]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    setBgKeyHex(hex);
    setBgUseCustomKey(true);
    setEyedropperActive(false);
    if (bgEngine === 'ai') setBgEngine('studio-flood');
  };

  const handleRunBgRemove = async () => {
    if (!bgFile) return;
    resetFeedback();
    setBgResult(null);
    setIsWorking(true);
    try {
      const res = await removeImageBackground(
        bgFile,
        {
          engine: bgEngine,
          targetColorHex: bgUseCustomKey ? bgKeyHex : undefined,
          tolerance: bgTolerance,
          feather: bgFeather,
          despill: bgDespill,
          fillMode: bgFillMode,
          fillColor: bgFillColor,
          fillGradientEnd: bgFillGradEnd,
          dropShadow: bgDropShadow,
          outputFormat: bgOutFmt,
        },
        (percent, status) => setProgress({ percent, status })
      );
      setBgResult(res);
      onTaskComplete?.({
        headline: 'Background Removed Successfully',
        subtext: `${res.fileName} (${res.width}×${res.height}px) is ready for download.`,
        statusLabel: 'Image Cutout Ready',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.sizeBytes,
          toolLabel: 'BG Remover',
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to remove background.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 2. BULK BACKGROUND REMOVER
  // =========================================================
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkItems, setBulkItems] = useState<BulkBgItem[]>([]);
  const [bulkEngine, setBulkEngine] = useState<BgRemoveEngine>('ai');
  const [bulkTolerance, setBulkTolerance] = useState<number>(28);
  const [bulkFeather, setBulkFeather] = useState<number>(2);
  const [bulkFillMode, setBulkFillMode] = useState<BgFillMode>('transparent');
  const [bulkFillColor, setBulkFillColor] = useState<string>('#FFFFFF');
  const [bulkOutFmt, setBulkOutFmt] = useState<'png' | 'webp'>('png');
  const [bulkZipBlob, setBulkZipBlob] = useState<Blob | null>(null);

  const handleAddBulkFiles = (files: FileList | File[]) => {
    resetFeedback();
    const valid = Array.from(files).filter(isImageFile);
    if (valid.length === 0) {
      setErrorMsg('Please drop PNG, JPG, WebP, or BMP images.');
      return;
    }
    setBulkZipBlob(null);
    const next: BulkBgItem[] = valid.map((f) => ({
      id: `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'queued',
    }));
    setBulkItems((prev) => [...prev, ...next]);
  };

  const handleRunBulkBgRemove = async () => {
    if (bulkItems.length === 0) return;
    resetFeedback();
    setBulkZipBlob(null);
    setIsWorking(true);

    const snapshot = [...bulkItems];
    const completedForZip: { fileName: string; blob: Blob }[] = [];

    try {
      for (let i = 0; i < snapshot.length; i++) {
        const current = snapshot[i];
        setBulkItems((prev) =>
          prev.map((it) => (it.id === current.id ? { ...it, status: 'processing', error: undefined } : it))
        );
        setProgress({
          percent: Math.round((i / snapshot.length) * 90),
          status: `Removing background ${i + 1} of ${snapshot.length}: ${current.file.name}`,
        });

        try {
          const res = await removeImageBackground(current.file, {
            engine: bulkEngine,
            tolerance: bulkTolerance,
            feather: bulkFeather,
            despill: true,
            fillMode: bulkFillMode,
            fillColor: bulkFillColor,
            outputFormat: bulkOutFmt,
          });
          completedForZip.push({ fileName: res.fileName, blob: res.blob });
          setBulkItems((prev) =>
            prev.map((it) =>
              it.id === current.id ? { ...it, status: 'done', result: res } : it
            )
          );
        } catch (itemErr: any) {
          setBulkItems((prev) =>
            prev.map((it) =>
              it.id === current.id
                ? { ...it, status: 'error', error: itemErr?.message || 'Failed' }
                : it
            )
          );
        }
      }

      let zipBlob: Blob | null = null;
      if (completedForZip.length > 0) {
        setProgress({ percent: 95, status: 'Bundling transparent cutouts into ZIP...' });
        zipBlob = await createImagesZip(completedForZip);
        setBulkZipBlob(zipBlob);
      }
      setProgress({
        percent: 100,
        status: `Processed ${completedForZip.length} of ${snapshot.length} image(s).`,
      });
      if (completedForZip.length > 0) {
        const single = completedForZip.length === 1 ? completedForZip[0] : null;
        onTaskComplete?.({
          headline: `Bulk Cutout Finished (${completedForZip.length} Images)`,
          subtext: 'All clean cutouts are packed and ready to download.',
          statusLabel: 'Bulk BG Remover Complete',
          downloadFile: zipBlob
            ? {
                blob: single ? single.blob : zipBlob,
                fileName: single
                  ? single.fileName
                  : `PaperLink_Cutouts_${completedForZip.length}.zip`,
                fileSizeBytes: single ? single.blob.size : zipBlob.size,
                toolLabel: 'Bulk BG Remover',
              }
            : undefined,
        });
      }
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 4. IMAGE RESIZER (SINGLE OR BATCH)
  // =========================================================
  const resizeInputRef = useRef<HTMLInputElement>(null);
  const [resizeFiles, setResizeFiles] = useState<File[]>([]);
  const [resizeOrigDims, setResizeOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [resizeW, setResizeW] = useState<number>(1080);
  const [resizeH, setResizeH] = useState<number>(1080);
  const [lockAspect, setLockAspect] = useState<boolean>(true);
  const [resizeFit, setResizeFit] = useState<ImageResizeFit>('contain');
  const [resizeFormat, setResizeFormat] = useState<'original' | 'png' | 'jpg' | 'webp'>('original');
  const [resizeQuality, setResizeQuality] = useState<number>(0.92);
  const [resizePadColor, setResizePadColor] = useState<string>('#FFFFFF');
  const [resizeResults, setResizeResults] = useState<ProcessedImageResult[]>([]);
  const [resizeZipBlob, setResizeZipBlob] = useState<Blob | null>(null);

  const handleAddResizeFiles = async (files: FileList | File[]) => {
    resetFeedback();
    const valid = Array.from(files).filter(isImageFile);
    if (valid.length === 0) {
      setErrorMsg('Please select PNG, JPG, WebP, or BMP images.');
      return;
    }
    setResizeFiles(valid);
    setResizeResults([]);
    setResizeZipBlob(null);
    try {
      const dims = await getImageDimensions(valid[0]);
      setResizeOrigDims({ w: dims.width, h: dims.height });
      setResizeW(dims.width);
      setResizeH(dims.height);
    } catch {
      // ignore dimension read failure
    }
  };

  const handleWidthChange = (nextW: number) => {
    const clean = Math.max(1, nextW);
    setResizeW(clean);
    if (lockAspect && resizeOrigDims && resizeOrigDims.w > 0) {
      setResizeH(Math.max(1, Math.round((clean * resizeOrigDims.h) / resizeOrigDims.w)));
    }
  };

  const handleHeightChange = (nextH: number) => {
    const clean = Math.max(1, nextH);
    setResizeH(clean);
    if (lockAspect && resizeOrigDims && resizeOrigDims.h > 0) {
      setResizeW(Math.max(1, Math.round((clean * resizeOrigDims.w) / resizeOrigDims.h)));
    }
  };

  const handleRunResize = async () => {
    if (resizeFiles.length === 0) return;
    resetFeedback();
    setResizeResults([]);
    setResizeZipBlob(null);
    setIsWorking(true);
    try {
      const out: ProcessedImageResult[] = [];
      for (let i = 0; i < resizeFiles.length; i++) {
        setProgress({
          percent: Math.round(((i + 0.5) / resizeFiles.length) * 90),
          status: `Resizing ${i + 1} of ${resizeFiles.length}: ${resizeFiles[i].name}`,
        });
        const res = await resizeImageFile(resizeFiles[i], {
          width: resizeW,
          height: resizeH,
          fit: resizeFit,
          format: resizeFormat,
          quality: resizeQuality,
          padColor: resizePadColor,
        });
        out.push(res);
      }
      setResizeResults(out);
      let zipBlob: Blob | null = null;
      if (out.length > 1) {
        zipBlob = await createImagesZip(out.map((r) => ({ fileName: r.fileName, blob: r.blob })));
        setResizeZipBlob(zipBlob);
      }
      setProgress({ percent: 100, status: `Resized ${out.length} image(s) cleanly.` });
      onTaskComplete?.({
        headline: `Resized ${out.length} Image${out.length === 1 ? '' : 's'} Cleanly`,
        subtext: `Scaled to ${resizeW}×${resizeH}px (${resizeFit}) and ready to save.`,
        statusLabel: 'Image Resize Complete',
        downloadFile:
          zipBlob || out[0]
            ? {
                blob: zipBlob || out[0].blob,
                fileName: zipBlob ? `PaperLink_Resized_${out.length}.zip` : out[0].fileName,
                fileSizeBytes: zipBlob ? zipBlob.size : out[0].sizeBytes,
                toolLabel: 'Resize Image',
              }
            : undefined,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Resize failed.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 5. FORMAT CONVERTER (SINGLE OR BATCH)
  // =========================================================
  const convertInputRef = useRef<HTMLInputElement>(null);
  const [convertFiles, setConvertFiles] = useState<File[]>([]);
  const [convertFormat, setConvertFormat] = useState<ImageOutputFormat>('webp');
  const [convertQuality, setConvertQuality] = useState<number>(0.9);
  const [convertMatte, setConvertMatte] = useState<string>('#FFFFFF');
  const [convertResults, setConvertResults] = useState<ProcessedImageResult[]>([]);
  const [convertZipBlob, setConvertZipBlob] = useState<Blob | null>(null);

  const handleAddConvertFiles = (files: FileList | File[]) => {
    resetFeedback();
    const valid = Array.from(files).filter(isImageFile);
    if (valid.length === 0) {
      setErrorMsg('Please select valid image files.');
      return;
    }
    setConvertFiles(valid);
    setConvertResults([]);
    setConvertZipBlob(null);
  };

  const handleRunConvert = async () => {
    if (convertFiles.length === 0) return;
    resetFeedback();
    setConvertResults([]);
    setConvertZipBlob(null);
    setIsWorking(true);
    try {
      const out: ProcessedImageResult[] = [];
      for (let i = 0; i < convertFiles.length; i++) {
        setProgress({
          percent: Math.round(((i + 0.5) / convertFiles.length) * 90),
          status: `Converting ${i + 1} of ${convertFiles.length} to ${convertFormat.toUpperCase()}...`,
        });
        out.push(
          await convertImageFormat(convertFiles[i], {
            targetFormat: convertFormat,
            quality: convertQuality,
            backgroundColor: convertMatte,
          })
        );
      }
      setConvertResults(out);
      let zipBlob: Blob | null = null;
      if (out.length > 1) {
        zipBlob = await createImagesZip(out.map((r) => ({ fileName: r.fileName, blob: r.blob })));
        setConvertZipBlob(zipBlob);
      }
      setProgress({ percent: 100, status: `Converted ${out.length} image(s) to .${convertFormat}.` });
      onTaskComplete?.({
        headline: `Converted ${out.length} File${out.length === 1 ? '' : 's'} to .${convertFormat.toUpperCase()}`,
        subtext: 'Your reformatted graphics are ready for download.',
        statusLabel: 'Format Conversion Complete',
        downloadFile:
          zipBlob || out[0]
            ? {
                blob: zipBlob || out[0].blob,
                fileName: zipBlob
                  ? `PaperLink_Converted_${convertFormat.toUpperCase()}_${out.length}.zip`
                  : out[0].fileName,
                fileSizeBytes: zipBlob ? zipBlob.size : out[0].sizeBytes,
                toolLabel: 'Convert Format',
              }
            : undefined,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Conversion failed.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 6. CROP, ROTATE & FLIP
  // =========================================================
  const cropInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOrigUrl, setCropOrigUrl] = useState<string | null>(null);
  const [cropDims, setCropDims] = useState<{ w: number; h: number }>({ w: 1000, h: 1000 });
  const [cropX, setCropX] = useState<number>(0.05);
  const [cropY, setCropY] = useState<number>(0.05);
  const [cropW, setCropW] = useState<number>(0.9);
  const [cropH, setCropH] = useState<number>(0.9);
  const [cropRotate, setCropRotate] = useState<0 | 90 | 180 | 270>(0);
  const [cropFlipH, setCropFlipH] = useState<boolean>(false);
  const [cropFlipV, setCropFlipV] = useState<boolean>(false);
  const [cropFmt, setCropFmt] = useState<'png' | 'jpg' | 'webp'>('png');
  const [cropResult, setCropResult] = useState<ProcessedImageResult | null>(null);
  const [cropTransformedUrl, setCropTransformedUrl] = useState<string | null>(null);

  // Keep live Crop Frame preview matched pixel-for-pixel with rotate/flip transforms
  useEffect(() => {
    if (!cropOrigUrl || (cropRotate === 0 && !cropFlipH && !cropFlipV)) {
      setCropTransformedUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const swap = cropRotate === 90 || cropRotate === 270;
      const rotW = swap ? img.naturalHeight : img.naturalWidth;
      const rotH = swap ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, rotW);
      canvas.height = Math.max(1, rotH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.translate(rotW / 2, rotH / 2);
      ctx.rotate((cropRotate * Math.PI) / 180);
      ctx.scale(cropFlipH ? -1 : 1, cropFlipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();
      setCropTransformedUrl(canvas.toDataURL('image/png'));
    };
    img.src = cropOrigUrl;
    return () => {
      cancelled = true;
    };
  }, [cropOrigUrl, cropRotate, cropFlipH, cropFlipV]);

  const handleLoadCropFile = async (file: File) => {
    resetFeedback();
    if (!isImageFile(file)) {
      setErrorMsg('Please choose a valid image file.');
      return;
    }
    if (cropOrigUrl) URL.revokeObjectURL(cropOrigUrl);
    setCropFile(file);
    setCropOrigUrl(URL.createObjectURL(file));
    setCropX(0);
    setCropY(0);
    setCropW(1);
    setCropH(1);
    setCropRotate(0);
    setCropFlipH(false);
    setCropFlipV(false);
    setCropResult(null);
    try {
      const d = await getImageDimensions(file);
      setCropDims({ w: d.width, h: d.height });
    } catch {
      // ignore
    }
  };

  const applyCropAspectPreset = (ratioW: number | null, ratioH: number | null) => {
    if (!ratioW || !ratioH) {
      setCropX(0);
      setCropY(0);
      setCropW(1);
      setCropH(1);
      return;
    }
    const swap = cropRotate === 90 || cropRotate === 270;
    const effW = swap ? cropDims.h : cropDims.w;
    const effH = swap ? cropDims.w : cropDims.h;
    const imgRatio = effW / Math.max(1, effH);
    const targetRatio = ratioW / ratioH;

    let fracW = 1;
    let fracH = 1;
    if (targetRatio > imgRatio) {
      fracW = 1;
      fracH = imgRatio / targetRatio;
    } else {
      fracH = 1;
      fracW = targetRatio / imgRatio;
    }
    setCropW(Number(fracW.toFixed(3)));
    setCropH(Number(fracH.toFixed(3)));
    setCropX(Number(((1 - fracW) / 2).toFixed(3)));
    setCropY(Number(((1 - fracH) / 2).toFixed(3)));
  };

  const handleRunCrop = async () => {
    if (!cropFile) return;
    resetFeedback();
    setCropResult(null);
    setIsWorking(true);
    try {
      const res = await cropRotateFlipImage(cropFile, {
        cropX,
        cropY,
        cropW,
        cropH,
        rotateDeg: cropRotate,
        flipH: cropFlipH,
        flipV: cropFlipV,
        format: cropFmt,
        quality: 0.94,
      });
      setCropResult(res);
      onTaskComplete?.({
        headline: 'Image Cropped & Exported',
        subtext: `Saved ${res.fileName} (${res.width}×${res.height}px) ready to download.`,
        statusLabel: 'Crop & Rotate Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.sizeBytes,
          toolLabel: 'Crop & Rotate',
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to crop image.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 7. IMAGE COMPRESSOR (SINGLE OR BATCH)
  // =========================================================
  const compInputRef = useRef<HTMLInputElement>(null);
  const [compFiles, setCompFiles] = useState<File[]>([]);
  const [compFormat, setCompFormat] = useState<'webp' | 'jpg' | 'png'>('webp');
  const [compQuality, setCompQuality] = useState<number>(0.76);
  const [compMaxWidth, setCompMaxWidth] = useState<number | undefined>(1920);
  const [compResults, setCompResults] = useState<ProcessedImageResult[]>([]);
  const [compZipBlob, setCompZipBlob] = useState<Blob | null>(null);

  const handleAddCompFiles = (files: FileList | File[]) => {
    resetFeedback();
    const valid = Array.from(files).filter(isImageFile);
    if (valid.length === 0) {
      setErrorMsg('Please select PNG, JPG, or WebP images.');
      return;
    }
    setCompFiles(valid);
    setCompResults([]);
    setCompZipBlob(null);
  };

  const handleRunCompress = async () => {
    if (compFiles.length === 0) return;
    resetFeedback();
    setCompResults([]);
    setCompZipBlob(null);
    setIsWorking(true);
    try {
      const out: ProcessedImageResult[] = [];
      for (let i = 0; i < compFiles.length; i++) {
        setProgress({
          percent: Math.round(((i + 0.5) / compFiles.length) * 90),
          status: `Optimizing ${i + 1} of ${compFiles.length}: ${compFiles[i].name}`,
        });
        out.push(
          await compressImageFile(compFiles[i], {
            format: compFormat,
            quality: compQuality,
            maxWidth: compMaxWidth,
          })
        );
      }
      setCompResults(out);
      let zipBlob: Blob | null = null;
      if (out.length > 1) {
        zipBlob = await createImagesZip(out.map((r) => ({ fileName: r.fileName, blob: r.blob })));
        setCompZipBlob(zipBlob);
      }
      setProgress({ percent: 100, status: `Compressed ${out.length} image(s).` });
      const totalOrig = out.reduce((acc, r) => acc + r.originalSizeBytes, 0);
      const totalFinal = out.reduce((acc, r) => acc + r.sizeBytes, 0);
      const savedPct = Math.max(0, Math.round(((totalOrig - totalFinal) / Math.max(1, totalOrig)) * 100));
      onTaskComplete?.({
        headline: `Compressed ${out.length} Image${out.length === 1 ? '' : 's'}`,
        subtext: `${formatBytes(totalOrig)} → ${formatBytes(totalFinal)} (${savedPct}% smaller).`,
        statusLabel: 'Image Compression Complete',
        downloadFile:
          zipBlob || out[0]
            ? {
                blob: zipBlob || out[0].blob,
                fileName: zipBlob ? `PaperLink_Compressed_${out.length}.zip` : out[0].fileName,
                fileSizeBytes: zipBlob ? zipBlob.size : out[0].sizeBytes,
                toolLabel: 'Compress Image',
              }
            : undefined,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Compression failed.');
    } finally {
      setIsWorking(false);
    }
  };

  // =========================================================
  // 8. FILTERS & PALETTE EXTRACTOR
  // =========================================================
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [filterFile, setFilterFile] = useState<File | null>(null);
  const [filterPreviewUrl, setFilterPreviewUrl] = useState<string | null>(null);
  const [filters, setFilters] = useState<ImageFiltersConfig>(DEFAULT_IMAGE_FILTERS);
  const [filterFormat, setFilterFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [paletteSwatches, setPaletteSwatches] = useState<string[]>([]);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [filterResult, setFilterResult] = useState<ProcessedImageResult | null>(null);

  const handleLoadFilterFile = async (file: File) => {
    resetFeedback();
    if (!isImageFile(file)) {
      setErrorMsg('Please select a valid image.');
      return;
    }
    if (filterPreviewUrl) URL.revokeObjectURL(filterPreviewUrl);
    setFilterFile(file);
    setFilterPreviewUrl(URL.createObjectURL(file));
    setFilters(DEFAULT_IMAGE_FILTERS);
    setFilterResult(null);
    const swatches = await extractDominantPalette(file, 6);
    setPaletteSwatches(swatches);
  };

  const handleRunFilters = async () => {
    if (!filterFile) return;
    resetFeedback();
    setFilterResult(null);
    setIsWorking(true);
    try {
      const res = await applyImageFilters(filterFile, filters, filterFormat, 0.94);
      setFilterResult(res);
      onTaskComplete?.({
        headline: 'Graded Image Rendered',
        subtext: `${res.fileName} (${formatBytes(res.sizeBytes)}) is ready for download.`,
        statusLabel: 'Color Grade Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.sizeBytes,
          toolLabel: 'Filters & Palette',
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to apply image filters.');
    } finally {
      setIsWorking(false);
    }
  };

  // Cross-tool handoff helper (keeps designers flowing smoothly!)
  const sendFileToImageTool = (
    file: File,
    target: 'bg-remove' | 'resize' | 'convert' | 'crop' | 'compress' | 'filters'
  ) => {
    resetFeedback();
    onToolChange(target);
    if (target === 'bg-remove') handleLoadSingleBgFile(file);
    else if (target === 'resize') void handleAddResizeFiles([file]);
    else if (target === 'convert') handleAddConvertFiles([file]);
    else if (target === 'crop') void handleLoadCropFile(file);
    else if (target === 'compress') handleAddCompFiles([file]);
    else if (target === 'filters') void handleLoadFilterFile(file);
  };

  const sendResultToTool = (
    res: ProcessedImageResult,
    target: 'bg-remove' | 'resize' | 'convert' | 'crop' | 'compress' | 'filters'
  ) => {
    const mime =
      res.format === 'jpg'
        ? 'image/jpeg'
        : res.format === 'webp'
        ? 'image/webp'
        : 'image/png';
    const nextFile = new File([res.blob], res.fileName, { type: mime });
    sendFileToImageTool(nextFile, target);
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (bgOrigUrl) URL.revokeObjectURL(bgOrigUrl);
      if (cropOrigUrl) URL.revokeObjectURL(cropOrigUrl);
      if (filterPreviewUrl) URL.revokeObjectURL(filterPreviewUrl);
    };
  }, []);

  return (
    <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 lg:h-[calc(100vh-5.75rem)] lg:overflow-hidden">
      {/* Desktop Left Compact 11-Tool Sidebar (Fits 100% zoom cleanly without scrolling past header) */}
      <aside className="hidden lg:flex lg:w-56 shrink-0 lg:h-full flex-col">
        <LiquidCrystalCard className="h-full rounded-2xl p-3 flex flex-col gap-3 overflow-hidden">
          <div className="px-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-bold text-blue-700 dark:text-yellow-400 uppercase tracking-wider">
                Image Studio
              </p>
              <h1 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">
                Graphic Design Suite
              </h1>
            </div>
            <MiniAiRobot
              variant="topbar"
              popupPlacement="below-right"
              externalPopup={null}
              quickActions={[
                { label: 'Photo Batch', onClick: () => { resetFeedback(); onToolChange('photo-batch'); } },
                { label: 'BG Remover', onClick: () => { resetFeedback(); onToolChange('bg-remove'); } },
                { label: 'Compress', onClick: () => { resetFeedback(); onToolChange('compress'); } },
                { label: 'Resize', onClick: () => { resetFeedback(); onToolChange('resize'); } },
              ]}
              title="Click to say hi or hover for quick Image tools!"
              sizeClassName="w-9 h-9 overflow-visible drop-shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1">
            {IMAGE_TOOL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTool === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    resetFeedback();
                    onToolChange(tab.id);
                  }}
                  className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[var(--pl-cta-text)] font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="imageStudioActiveDroplet"
                      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.75 }}
                      className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] shadow-xs"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                  <span className="relative z-10 truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </LiquidCrystalCard>
      </aside>

      {/* Mobile & Tablet Horizontal Strip (< lg) */}
      <LiquidCrystalCard className="lg:hidden rounded-2xl p-3 space-y-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <MiniAiRobot
            variant="topbar"
            popupPlacement="below-left"
            externalPopup={null}
            title="Click to say hi!"
            sizeClassName="w-8 h-8 overflow-visible drop-shadow-[0_3px_6px_rgba(0,0,0,0.2)]"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold text-blue-700 dark:text-yellow-400 uppercase tracking-wider">
              Image Studio · Client-Side Processing
            </p>
            <h1 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight mt-0.5 truncate">
              Graphic Design Toolkit
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {IMAGE_TOOL_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTool === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  resetFeedback();
                  onToolChange(tab.id);
                }}
                className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[var(--pl-cta-text)] font-bold bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))]'
                    : 'text-zinc-600 dark:text-zinc-400 bg-zinc-100/90 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </LiquidCrystalCard>

      {/* Right Scrollable Image Tool Stage */}
      <div className="flex-1 min-w-0 lg:h-full lg:overflow-y-auto pr-0.5 space-y-4">
        {/* Global Error / Progress */}
        {errorMsg && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 text-xs flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isWorking && progress && (
          <RobotProgressBar
            percent={progress.percent}
            status={progress.status}
            subText="Processing pixel buffers privately in browser"
          />
        )}

      {/* ===================================================== */}
      {/* TOOL 1: SINGLE BACKGROUND REMOVER                     */}
      {/* ===================================================== */}
      {activeTool === 'bg-remove' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Background Remover Studio
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Remove complex backgrounds with AI segmentation or knock out studio backdrops, logos, and solid screens with eyedropper precision.
              </p>
            </div>

            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadSingleBgFile(f);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => bgInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleLoadSingleBgFile(f);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-5 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                {bgFile ? bgFile.name : 'Click or drop any JPG, PNG, or WebP'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                {bgFile ? formatBytes(bgFile.size) : 'Portraits, products, signatures, logos, stickers'}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1.5 inline-flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — processed locally.</span>
              </p>
            </div>

            {/* Cutout Engine Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Cutout Engine
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'ai', title: 'AI Subject', desc: 'People & objects' },
                  { id: 'studio-flood', title: 'Studio Edge', desc: 'Clean backdrops' },
                  { id: 'color-key', title: 'Color Key', desc: 'Logos & green screen' },
                ] as const).map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setBgEngine(eng.id)}
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      bgEngine === eng.id
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                    }`}
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">{eng.title}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{eng.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Precision controls for Studio Edge & Color Key */}
            {bgEngine !== 'ai' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgKeyHex}
                      onChange={(e) => {
                        setBgKeyHex(e.target.value.toUpperCase());
                        setBgUseCustomKey(true);
                      }}
                      className="w-7 h-7 rounded cursor-pointer border border-zinc-300 dark:border-zinc-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                        {bgUseCustomKey ? `Target: ${bgKeyHex}` : 'Auto-Sample Corners'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setBgUseCustomKey((v) => !v)}
                        className="text-[10px] text-amber-700 dark:text-yellow-400 hover:underline cursor-pointer"
                      >
                        {bgUseCustomKey ? 'Switch to corner auto-detect' : 'Use custom target color'}
                      </button>
                    </div>
                  </div>

                  {bgOrigUrl && (
                    <button
                      type="button"
                      onClick={() => setEyedropperActive((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                        eyedropperActive
                          ? 'bg-yellow-400 text-black border-yellow-400'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400'
                      }`}
                    >
                      <Pipette className="w-3.5 h-3.5" />
                      <span>{eyedropperActive ? 'Click image...' : 'Eyedropper'}</span>
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    <span>Color Tolerance</span>
                    <span className="font-mono tabular-nums">{bgTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={85}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(parseInt(e.target.value, 10))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    <span>Edge Feather</span>
                    <span className="font-mono tabular-nums">{bgFeather}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={bgFeather}
                    onChange={(e) => setBgFeather(parseInt(e.target.value, 10))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bgDespill}
                    onChange={(e) => setBgDespill(e.target.checked)}
                    className="accent-yellow-400"
                  />
                  <span>Decontaminate edge fringe halo</span>
                </label>
              </div>
            )}

            {/* Replacement Fill & Export Options */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                New Backdrop &amp; Finish
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'transparent', label: 'Transparent' },
                  { id: 'solid', label: 'Solid Color' },
                  { id: 'gradient', label: 'Gradient' },
                ] as const).map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => setBgFillMode(fm.id)}
                    className={`py-2 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      bgFillMode === fm.id
                        ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {fm.label}
                  </button>
                ))}
              </div>

              {bgFillMode !== 'transparent' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>{bgFillMode === 'gradient' ? 'Start:' : 'Fill:'}</span>
                    <input
                      type="color"
                      value={bgFillColor}
                      onChange={(e) => setBgFillColor(e.target.value)}
                      className="w-8 h-7 rounded cursor-pointer"
                    />
                  </label>
                  {bgFillMode === 'gradient' && (
                    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <span>End:</span>
                      <input
                        type="color"
                        value={bgFillGradEnd}
                        onChange={(e) => setBgFillGradEnd(e.target.value)}
                        className="w-8 h-7 rounded cursor-pointer"
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bgDropShadow}
                    onChange={(e) => setBgDropShadow(e.target.checked)}
                    className="accent-yellow-400"
                  />
                  <span>Add soft subject shadow</span>
                </label>

                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {(['png', 'webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setBgOutFmt(fmt)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase cursor-pointer ${
                        bgOutFmt === fmt
                          ? 'bg-yellow-400 text-black'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunBgRemove}
              disabled={!bgFile || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4" />
              )}
              <span>{isWorking ? 'Removing Background...' : 'Remove Background'}</span>
            </button>
          </div>

          {/* Right Before/After Stage */}
          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Cutout Canvas &amp; Split Comparison
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                  {bgResult
                    ? `${bgResult.width}×${bgResult.height}px · ${formatBytes(bgResult.sizeBytes)} (${bgResult.format.toUpperCase()})`
                    : 'Inspect transparency against checkerboard, white sheet, or dark studio.'}
                </p>
              </div>

              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {([
                  { id: 'checker', label: 'Grid' },
                  { id: 'light', label: 'White' },
                  { id: 'dark', label: 'Dark' },
                ] as const).map((surf) => (
                  <button
                    key={surf.id}
                    type="button"
                    onClick={() => setBgPreviewSurface(surf.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      bgPreviewSurface === surf.id
                        ? 'bg-yellow-400 text-black font-bold'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {surf.label}
                  </button>
                ))}
              </div>
            </div>

            {bgResult?.notice && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-500/35 text-xs text-amber-800 dark:text-amber-200">
                {bgResult.notice}
              </div>
            )}

            {eyedropperActive && bgOrigUrl && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-yellow-400">
                  Eyedropper Active — Click directly on the background color in the original image below:
                </p>
                <div className="border border-yellow-400 rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center p-3">
                  <img
                    ref={eyedropperImgRef}
                    src={bgOrigUrl}
                    alt="Sample background color"
                    onClick={handlePickPixelFromPreview}
                    className="max-h-[380px] object-contain cursor-crosshair"
                  />
                </div>
              </div>
            )}

            {!eyedropperActive && (bgResult || bgOrigUrl) ? (
              <div className="space-y-4">
                <div
                  className="relative w-full h-[380px] rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex items-center justify-center select-none"
                  style={
                    bgPreviewSurface === 'checker'
                      ? CHECKERBOARD_STYLE
                      : { backgroundColor: bgPreviewSurface === 'light' ? '#ffffff' : '#09090b' }
                  }
                >
                  {bgResult ? (
                    <>
                      {/* Result Cutout (Right side / Full under) */}
                      <img
                        src={bgResult.dataUrl}
                        alt="Background removed result"
                        className="max-h-full max-w-full object-contain pointer-events-none"
                      />
                      {/* Original Clipped Left side */}
                      {bgOrigUrl && (
                        <div
                          className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          style={{
                            clipPath: `inset(0 ${100 - bgSplitPct}% 0 0)`,
                          }}
                        >
                          <img
                            src={bgOrigUrl}
                            alt="Original before cutout"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                      {/* Vertical Divider Line */}
                      <div
                        className="absolute inset-y-0 w-0.5 bg-yellow-400 shadow pointer-events-none"
                        style={{ left: `${bgSplitPct}%` }}
                      />
                    </>
                  ) : (
                    bgOrigUrl && (
                      <img
                        src={bgOrigUrl}
                        alt="Original uploaded image"
                        className="max-h-full max-w-full object-contain"
                      />
                    )
                  )}
                </div>

                {bgResult && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold">Before</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={bgSplitPct}
                        onChange={(e) => setBgSplitPct(parseInt(e.target.value, 10))}
                        className="flex-1 accent-yellow-400 cursor-pointer"
                      />
                      <span className="font-semibold">Cutout</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => triggerDownload(bgResult.blob, bgResult.fileName)}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download {bgResult.format.toUpperCase()}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendResultToTool(bgResult, 'resize')}
                        className="py-2.5 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
                      >
                        Send to Resize
                      </button>

                      {onUseAsCoverLogo && (
                        <button
                          type="button"
                          onClick={() => onUseAsCoverLogo(bgResult.dataUrl)}
                          className="py-2.5 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
                        >
                          Use as Cover Logo
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : !eyedropperActive ? (
              <div
                onClick={() => bgInputRef.current?.click()}
                className="flex-1 min-h-[300px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Eraser className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500 max-w-sm">
                  Upload any photo, logo, or product shot to strip backgrounds cleanly with transparent PNG or WebP alpha output.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 2: BULK BACKGROUND REMOVER                       */}
      {/* ===================================================== */}
      {activeTool === 'bulk-bg-remove' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Bulk Image BG Remover
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Queue product photos, headshots, or brand assets together and download every clean cutout inside one ZIP file.
              </p>
            </div>

            <input
              ref={bulkInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleAddBulkFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => bulkInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleAddBulkFiles(e.dataTransfer.files);
              }}
              className="w-full py-5 px-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950 text-center cursor-pointer transition-colors"
            >
              <Plus className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1" />
              <span className="block text-xs font-bold text-zinc-900 dark:text-white">
                Add Images to Queue
              </span>
              <span className="block text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                {bulkItems.length} file{bulkItems.length === 1 ? '' : 's'} queued
              </span>
              <span className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — processed locally.</span>
              </span>
            </button>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Batch Cutout Engine
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'ai', label: 'AI Auto' },
                  { id: 'studio-flood', label: 'Studio Edge' },
                  { id: 'color-key', label: 'Color Key' },
                ] as const).map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setBulkEngine(eng.id)}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      bulkEngine === eng.id
                        ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>
            </div>

            {bulkEngine !== 'ai' && (
              <div className="space-y-2.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    <span>Tolerance</span>
                    <span className="font-mono tabular-nums">{bulkTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    value={bulkTolerance}
                    onChange={(e) => setBulkTolerance(parseInt(e.target.value, 10))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    <span>Feather</span>
                    <span className="font-mono tabular-nums">{bulkFeather}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={6}
                    value={bulkFeather}
                    onChange={(e) => setBulkFeather(parseInt(e.target.value, 10))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Backdrop Fill &amp; Output Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkFillMode('transparent')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                    bulkFillMode === 'transparent'
                      ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Transparent
                </button>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  <button
                    type="button"
                    onClick={() => setBulkFillMode('solid')}
                    className={`text-xs font-semibold cursor-pointer ${
                      bulkFillMode === 'solid'
                        ? 'text-amber-700 dark:text-yellow-400 font-bold'
                        : 'text-zinc-500'
                    }`}
                  >
                    Solid
                  </button>
                  <input
                    type="color"
                    value={bulkFillColor}
                    onChange={(e) => {
                      setBulkFillColor(e.target.value);
                      setBulkFillMode('solid');
                    }}
                    className="w-6 h-6 rounded ml-auto cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(['png', 'webp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setBulkOutFmt(fmt)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                      bulkOutFmt === fmt
                        ? 'border-yellow-400 bg-yellow-400 text-black'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRunBulkBgRemove}
                disabled={bulkItems.length === 0 || isWorking}
                className="flex-1 py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                <span>Process {bulkItems.length} Images</span>
              </button>

              {bulkItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    bulkItems.forEach((it) => URL.revokeObjectURL(it.previewUrl));
                    setBulkItems([]);
                    setBulkZipBlob(null);
                  }}
                  disabled={isWorking}
                  title="Clear queue"
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Bulk Cutout Queue
                </h3>
                <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
                  {bulkItems.filter((i) => i.status === 'done').length} of {bulkItems.length} completed
                </p>
              </div>

              {bulkZipBlob && (
                <button
                  type="button"
                  onClick={() => triggerDownload(bulkZipBlob, `paperlink_bulk_cutouts.zip`)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Archive className="w-4 h-4" />
                  <span>Download All Clean Cutouts (.zip)</span>
                </button>
              )}
            </div>

            {bulkItems.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[560px] overflow-y-auto pr-1">
                {bulkItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden flex flex-col"
                  >
                    <div
                      className="aspect-square w-full flex items-center justify-center p-2 relative"
                      style={CHECKERBOARD_STYLE}
                    >
                      <img
                        src={item.result ? item.result.dataUrl : item.previewUrl}
                        alt={item.file.name}
                        className="max-h-full max-w-full object-contain"
                      />
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-yellow-400">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {item.file.name}
                      </p>
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className={`font-semibold ${
                            item.status === 'done'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.status === 'error'
                              ? 'text-red-500'
                              : item.status === 'processing'
                              ? 'text-amber-600 dark:text-yellow-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {item.status === 'done'
                            ? 'Ready'
                            : item.status === 'processing'
                            ? 'Processing...'
                            : item.status === 'error'
                            ? item.error || 'Error'
                            : 'Queued'}
                        </span>
                        <span className="font-mono text-zinc-500 tabular-nums">
                          {formatBytes(item.result ? item.result.sizeBytes : item.file.size)}
                        </span>
                      </div>
                      {item.result && (
                        <button
                          type="button"
                          onClick={() => triggerDownload(item.result!.blob, item.result!.fileName)}
                          className="w-full py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download .{item.result.format}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => bulkInputRef.current?.click()}
                className="flex-1 min-h-[300px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Layers className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500 max-w-sm">
                  Drag and drop multiple images at once. PaperLink strips backgrounds across your entire batch and packs them into a single ZIP download.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 3: PDF TO IMAGE (SHARED WITH PDF TOOLS)          */}
      {/* ===================================================== */}
      {activeTool === 'pdf-to-image' && (
        <PdfToImageTool
          onError={setErrorMsg}
          onProgress={setProgress}
          isWorking={isWorking}
          setIsWorking={setIsWorking}
          onSendImageToTool={sendFileToImageTool}
          onTaskComplete={onTaskComplete}
          onPreviewDocument={onPreviewDocument}
        />
      )}

      {/* ===================================================== */}
      {/* TOOL 4: IMAGE RESIZE                                  */}
      {/* ===================================================== */}
      {activeTool === 'resize' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Image Resizer &amp; Social Presets
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Resize single or batch images to exact pixel dimensions, print sizes, or social canvas formats.
              </p>
            </div>

            <input
              ref={resizeInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleAddResizeFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => resizeInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) void handleAddResizeFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-5 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
                {resizeFiles.length > 0
                  ? `${resizeFiles.length} image(s) selected`
                  : 'Click or drop 1 or more images'}
              </p>
              {resizeOrigDims && (
                <p className="text-[11px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                  Source: {resizeOrigDims.w}×{resizeOrigDims.h}px
                </p>
              )}
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1.5 inline-flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — resized locally.</span>
              </p>
            </div>

            {/* Graphic Design Presets */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Quick Designer Canvas Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: 'IG Square', w: 1080, h: 1080 },
                  { label: 'IG Story', w: 1080, h: 1920 },
                  { label: 'YT Thumb', w: 1280, h: 720 },
                  { label: 'LinkedIn Cover', w: 1584, h: 396 },
                  { label: 'A4 150 DPI', w: 1240, h: 1754 },
                  { label: 'HD 1080p', w: 1920, h: 1080 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLockAspect(false);
                      setResizeW(preset.w);
                      setResizeH(preset.h);
                    }}
                    className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 text-left cursor-pointer"
                  >
                    <span className="block text-[11px] font-bold text-zinc-900 dark:text-white">
                      {preset.label}
                    </span>
                    <span className="block text-[10px] font-mono text-zinc-500 tabular-nums">
                      {preset.w}×{preset.h}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Width / Height Inputs + Lock */}
            <div className="grid grid-cols-11 gap-2 items-end">
              <div className="col-span-5">
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Width (px)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={resizeW}
                  onChange={(e) => handleWidthChange(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-white tabular-nums"
                />
              </div>
              <div className="col-span-1 flex justify-center pb-1">
                <button
                  type="button"
                  onClick={() => setLockAspect((v) => !v)}
                  title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  className={`p-2 rounded-lg border cursor-pointer ${
                    lockAspect
                      ? 'border-yellow-400 bg-yellow-400/15 text-amber-700 dark:text-yellow-400'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-400'
                  }`}
                >
                  {lockAspect ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="col-span-5">
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Height (px)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={resizeH}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-white tabular-nums"
                />
              </div>
            </div>

            {resizeOrigDims && (
              <div className="flex gap-2">
                {[0.25, 0.5, 0.75, 1, 1.5, 2].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => {
                      setLockAspect(true);
                      setResizeW(Math.max(1, Math.round(resizeOrigDims.w * mult)));
                      setResizeH(Math.max(1, Math.round(resizeOrigDims.h * mult)));
                    }}
                    className="flex-1 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer tabular-nums"
                  >
                    {Math.round(mult * 100)}%
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Scaling Fit Mode
                </label>
                <select
                  value={resizeFit}
                  onChange={(e) => setResizeFit(e.target.value as ImageResizeFit)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="contain">Contain (No Crop)</option>
                  <option value="cover">Cover (Smart Crop)</option>
                  <option value="exact">Exact Stretch</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Output Format
                </label>
                <select
                  value={resizeFormat}
                  onChange={(e) => setResizeFormat(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="original">Keep Original</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
            </div>

            {resizeFit === 'contain' && (
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>Contain Padding Matte Color</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResizePadColor('transparent')}
                    className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                      resizePadColor === 'transparent'
                        ? 'border-yellow-400 bg-yellow-400/15 font-bold text-amber-700 dark:text-yellow-400'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    Transparent
                  </button>
                  <input
                    type="color"
                    value={resizePadColor === 'transparent' ? '#FFFFFF' : resizePadColor}
                    onChange={(e) => setResizePadColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleRunResize}
              disabled={resizeFiles.length === 0 || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
              <span>Resize to {resizeW}×{resizeH}</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Resized Results</h3>
              {resizeZipBlob && (
                <button
                  type="button"
                  onClick={() => triggerDownload(resizeZipBlob, `resized_${resizeW}x${resizeH}.zip`)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Download All (.zip)</span>
                </button>
              )}
            </div>

            {resizeResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[540px] overflow-y-auto pr-1">
                {resizeResults.map((res) => (
                  <div
                    key={res.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden"
                  >
                    <div className="aspect-video flex items-center justify-center p-2" style={CHECKERBOARD_STYLE}>
                      <img src={res.dataUrl} alt={res.fileName} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{res.fileName}</p>
                      <p className="text-[11px] font-mono text-zinc-500 tabular-nums">
                        {res.originalWidth}×{res.originalHeight} → {res.width}×{res.height} · {formatBytes(res.sizeBytes)}
                      </p>
                      <button
                        type="button"
                        onClick={() => triggerDownload(res.blob, res.fileName)}
                        className="w-full py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download .{res.format}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => resizeInputRef.current?.click()}
                className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Maximize2 className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500 max-w-sm">
                  Upload one image or a whole folder of brand graphics to resize accurately in pixels.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 5: IMAGE FORMAT CONVERTER                        */}
      {/* ===================================================== */}
      {activeTool === 'convert' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Image Format Converter
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Convert PNG, JPG, WebP, BMP, or multi-size ICO Favicons cleanly in single or batch mode.
              </p>
            </div>

            <input
              ref={convertInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleAddConvertFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => convertInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleAddConvertFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-5 text-center cursor-pointer"
            >
              <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                {convertFiles.length > 0
                  ? `${convertFiles.length} image(s) queued`
                  : 'Click or drop PNG, JPG, WebP, SVG, BMP files'}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1.5 inline-flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — converted locally.</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Target Format
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {([
                  { id: 'png', label: 'PNG' },
                  { id: 'jpg', label: 'JPG' },
                  { id: 'webp', label: 'WebP' },
                  { id: 'bmp', label: 'BMP' },
                  { id: 'ico', label: 'ICO' },
                ] as const).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setConvertFormat(fmt.id)}
                    className={`py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      convertFormat === fmt.id
                        ? 'border-yellow-400 bg-yellow-400 text-black'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                {convertFormat === 'ico'
                  ? 'Encodes crisp 32×32 + 64×64 multi-resolution Windows & Web Favicon .ico.'
                  : convertFormat === 'bmp'
                  ? 'Uncompressed 24-bit DIB bitmap for CAD & legacy software.'
                  : convertFormat === 'webp'
                  ? 'Best web compression with full alpha transparency.'
                  : convertFormat === 'jpg'
                  ? 'Compact opaque photography format (flattens transparency onto matte color).'
                  : 'Lossless studio master with alpha transparency.'}
              </p>
            </div>

            {(convertFormat === 'jpg' || convertFormat === 'webp') && (
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Encoding Quality</span>
                  <span className="font-mono tabular-nums">{Math.round(convertQuality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={convertQuality}
                  onChange={(e) => setConvertQuality(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            )}

            {(convertFormat === 'jpg' || convertFormat === 'bmp') && (
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>Transparent Area Matte Fill</span>
                <input
                  type="color"
                  value={convertMatte}
                  onChange={(e) => setConvertMatte(e.target.value)}
                  className="w-8 h-7 rounded cursor-pointer"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleRunConvert}
              disabled={convertFiles.length === 0 || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Convert to {convertFormat.toUpperCase()}</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Converted Files</h3>
              {convertZipBlob && (
                <button
                  type="button"
                  onClick={() => triggerDownload(convertZipBlob, `converted_${convertFormat}.zip`)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Download All (.zip)</span>
                </button>
              )}
            </div>

            {convertResults.length > 0 ? (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {convertResults.map((res) => (
                  <div
                    key={res.id}
                    className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={res.dataUrl}
                        alt={res.fileName}
                        className="w-12 h-12 rounded-lg object-contain border border-zinc-200 dark:border-zinc-800 bg-white shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          {res.fileName}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-500 tabular-nums">
                          {res.width}×{res.height} · {formatBytes(res.originalSizeBytes)} → {formatBytes(res.sizeBytes)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => triggerDownload(res.blob, res.fileName)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => convertInputRef.current?.click()}
                className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <RefreshCw className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">Select images on the left to convert formats locally.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 6: CROP, ROTATE & FLIP                           */}
      {/* ===================================================== */}
      {activeTool === 'crop' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Crop, Rotate &amp; Flip Studio
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Frame exact designer aspect ratios, rotate cleanly in 90° increments, or mirror assets horizontally/vertically.
              </p>
            </div>

            <input
              ref={cropInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLoadCropFile(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => cropInputRef.current?.click()}
              className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950 text-xs font-bold text-zinc-900 dark:text-white cursor-pointer flex flex-col items-center gap-1"
            >
              <span>{cropFile ? `Replace Image (${cropFile.name})` : 'Upload Image to Crop & Rotate'}</span>
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — edited locally.</span>
              </span>
            </button>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Orientation &amp; Mirror
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setCropRotate((r) => (((r + 270) % 360) as 0 | 90 | 180 | 270))}
                  className="py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer hover:border-yellow-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCropRotate((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
                  className="py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer hover:border-yellow-400"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>+90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCropFlipH((v) => !v)}
                  className={`py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    cropFlipH
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip H</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCropFlipV((v) => !v)}
                  className={`py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    cropFlipV
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>Flip V</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                Aspect Ratio Crop Presets
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Full', rw: null, rh: null },
                  { label: '1:1', rw: 1, rh: 1 },
                  { label: '4:5', rw: 4, rh: 5 },
                  { label: '16:9', rw: 16, rh: 9 },
                  { label: '9:16', rw: 9, rh: 16 },
                  { label: '4:3', rw: 4, rh: 3 },
                  { label: '3:2', rw: 3, rh: 2 },
                  { label: '2:1', rw: 2, rh: 1 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyCropAspectPreset(p.rw, p.rh)}
                    className="py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 text-xs font-semibold cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders for Crop Frame */}
            <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Left Inset</span>
                  <span className="font-mono tabular-nums">{Math.round(cropX * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.01}
                  value={cropX}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setCropX(v);
                    if (v + cropW > 1) setCropW(Math.max(0.05, Number((1 - v).toFixed(2))));
                  }}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Top Inset</span>
                  <span className="font-mono tabular-nums">{Math.round(cropY * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.01}
                  value={cropY}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setCropY(v);
                    if (v + cropH > 1) setCropH(Math.max(0.05, Number((1 - v).toFixed(2))));
                  }}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Crop Width</span>
                  <span className="font-mono tabular-nums">{Math.round(cropW * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1 - cropX}
                  step={0.01}
                  value={cropW}
                  onChange={(e) => setCropW(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Crop Height</span>
                  <span className="font-mono tabular-nums">{Math.round(cropH * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1 - cropY}
                  step={0.01}
                  value={cropH}
                  onChange={(e) => setCropH(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setCropFmt(fmt)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                    cropFmt === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunCrop}
              disabled={!cropFile || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crop className="w-4 h-4" />}
              <span>Apply Crop &amp; Export</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                {cropResult ? 'Cropped Export Preview' : 'Crop Frame Preview'}
              </h3>
              {cropResult && (
                <button
                  type="button"
                  onClick={() => triggerDownload(cropResult.blob, cropResult.fileName)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download ({cropResult.width}×{cropResult.height})</span>
                </button>
              )}
            </div>

            {cropResult ? (
              <div className="h-[380px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center p-4" style={CHECKERBOARD_STYLE}>
                <img src={cropResult.dataUrl} alt="Cropped export" className="max-h-full max-w-full object-contain shadow" />
              </div>
            ) : cropOrigUrl ? (
              <div className="h-[380px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 flex items-center justify-center p-4 overflow-hidden">
                <div className="relative inline-block max-h-full max-w-full">
                  <img
                    src={cropTransformedUrl || cropOrigUrl}
                    alt="Crop frame"
                    className="max-h-[340px] max-w-full object-contain block select-none"
                  />
                  <div
                    style={{
                      left: `${cropX * 100}%`,
                      top: `${cropY * 100}%`,
                      width: `${cropW * 100}%`,
                      height: `${cropH * 100}%`,
                    }}
                    className="absolute border-2 border-yellow-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] pointer-events-none"
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => cropInputRef.current?.click()}
                className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Crop className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">Upload an image to frame crop ratios or rotate/flip.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 7: IMAGE COMPRESSOR                              */}
      {/* ===================================================== */}
      {activeTool === 'compress' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Web &amp; Print Image Compressor
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Shrink oversized PNG/JPG assets into fast-loading WebP or compact JPEG images while preserving crisp visual detail.
              </p>
            </div>

            <input
              ref={compInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleAddCompFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => compInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleAddCompFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-5 text-center cursor-pointer"
            >
              <Upload className="w-6 h-6 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                {compFiles.length > 0
                  ? `${compFiles.length} image(s) queued`
                  : 'Click or drop images to compress'}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1.5 inline-flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — compressed locally.</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Target Encoding
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['webp', 'jpg', 'png'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setCompFormat(fmt)}
                      className={`py-2 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                        compFormat === fmt
                          ? 'border-yellow-400 bg-yellow-400 text-black'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Compression Quality</span>
                  <span className="font-mono tabular-nums">{Math.round(compQuality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={0.95}
                  step={0.02}
                  value={compQuality}
                  onChange={(e) => setCompQuality(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>Smallest Size (20%)</span>
                  <span>Balanced (76%)</span>
                  <span>Sharpest (95%)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Optional Max Width Cap
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { label: 'Original', val: undefined },
                    { label: '1920px', val: 1920 },
                    { label: '1280px', val: 1280 },
                    { label: '800px', val: 800 },
                  ] as const).map((cap) => (
                    <button
                      key={cap.label}
                      type="button"
                      onClick={() => setCompMaxWidth(cap.val)}
                      className={`py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        compMaxWidth === cap.val
                          ? 'border-yellow-400 bg-yellow-400/15 text-amber-700 dark:text-yellow-400 font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {cap.label}
                    </button>
                  ))}
                </div>
              </div>

              {compFiles.length > 0 && (() => {
                const origBytes = compFiles.reduce((acc, f) => acc + f.size, 0);
                const fmtFactor = compFormat === 'webp' ? 0.56 : compFormat === 'jpg' ? 0.68 : 0.92;
                const widthFactor = !compMaxWidth ? 1 : compMaxWidth <= 800 ? 0.45 : compMaxWidth <= 1280 ? 0.65 : 0.85;
                const qFactor = compFormat === 'png' ? 0.95 : 0.35 + ((compQuality - 0.2) / 0.75) * 0.65;
                const estBytes = Math.max(
                  Math.round(origBytes * 0.12),
                  Math.min(origBytes, Math.round(origBytes * fmtFactor * widthFactor * qFactor))
                );
                const estPct = Math.max(4, Math.min(88, Math.round(((origBytes - estBytes) / Math.max(1, origBytes)) * 100)));
                return (
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        Live Approximate Output
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatBytes(origBytes)} → ~{formatBytes(estBytes)} (~{estPct}% smaller)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 transition-all duration-150"
                        style={{ width: `${Math.max(12, 100 - estPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            <button
              type="button"
              onClick={handleRunCompress}
              disabled={compFiles.length === 0 || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minimize2 className="w-4 h-4" />}
              <span>Compress {compFiles.length || ''} Image(s)</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Compression Savings</h3>
              {compZipBlob && (
                <button
                  type="button"
                  onClick={() => triggerDownload(compZipBlob, `compressed_images.zip`)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Download All (.zip)</span>
                </button>
              )}
            </div>

            {compResults.length > 0 ? (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {compResults.map((res) => {
                  const pctSaved = Math.round(
                    ((res.originalSizeBytes - res.sizeBytes) / Math.max(1, res.originalSizeBytes)) * 100
                  );
                  return (
                    <div
                      key={res.id}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={res.dataUrl}
                          alt={res.fileName}
                          className="w-12 h-12 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {res.fileName}
                          </p>
                          <p className="text-[11px] font-mono text-zinc-500 tabular-nums">
                            {formatBytes(res.originalSizeBytes)} → {formatBytes(res.sizeBytes)} ·{' '}
                            <span className={pctSaved > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>
                              {pctSaved >= 0 ? `${pctSaved}% smaller` : 'Encoded'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => triggerDownload(res.blob, res.fileName)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onClick={() => compInputRef.current?.click()}
                className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Minimize2 className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">Drop heavy design files to compare byte savings side by side.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TOOL 8: FILTERS & COLOR PALETTE EXTRACTOR             */}
      {/* ===================================================== */}
      {activeTool === 'filters' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Color Grading &amp; Palette Extractor
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Tune exposure, contrast, saturation, sharpness, and extract dominant brand hex codes directly from any graphic.
              </p>
            </div>

            <input
              ref={filterInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLoadFilterFile(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => filterInputRef.current?.click()}
              className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950 text-xs font-bold text-zinc-900 dark:text-white cursor-pointer flex flex-col items-center gap-1"
            >
              <span>{filterFile ? `Replace Asset (${filterFile.name})` : 'Upload Image to Grade & Extract Colors'}</span>
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>Your files never leave your device — graded locally.</span>
              </span>
            </button>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Reset', val: DEFAULT_IMAGE_FILTERS },
                {
                  label: 'Vivid Punch',
                  val: { ...DEFAULT_IMAGE_FILTERS, contrast: 118, saturate: 138, sharpen: true },
                },
                {
                  label: 'Editorial B&W',
                  val: { ...DEFAULT_IMAGE_FILTERS, grayscale: 100, contrast: 125, sharpen: true },
                },
                {
                  label: 'Warm Film',
                  val: { ...DEFAULT_IMAGE_FILTERS, sepia: 32, contrast: 108, brightness: 104 },
                },
                {
                  label: 'Crisp Matte',
                  val: { ...DEFAULT_IMAGE_FILTERS, contrast: 92, brightness: 106, saturate: 88 },
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setFilters(preset.val)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 text-[11px] font-semibold cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Adjustment Sliders */}
            <div className="space-y-2.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
              {([
                { key: 'brightness', label: 'Brightness', min: 50, max: 170, unit: '%' },
                { key: 'contrast', label: 'Contrast', min: 50, max: 180, unit: '%' },
                { key: 'saturate', label: 'Saturation', min: 0, max: 200, unit: '%' },
                { key: 'hueRotate', label: 'Hue Shift', min: -180, max: 180, unit: '°' },
                { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
                { key: 'sepia', label: 'Warm Sepia', min: 0, max: 100, unit: '%' },
                { key: 'blur', label: 'Soft Blur', min: 0, max: 10, unit: 'px' },
              ] as const).map((ctrl) => (
                <div key={ctrl.key}>
                  <div className="flex justify-between mb-0.5">
                    <span>{ctrl.label}</span>
                    <span className="font-mono tabular-nums">
                      {filters[ctrl.key]}
                      {ctrl.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ctrl.min}
                    max={ctrl.max}
                    value={filters[ctrl.key]}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        [ctrl.key]: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>
              ))}

              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.sharpen}
                  onChange={(e) => setFilters((p) => ({ ...p, sharpen: e.target.checked }))}
                  className="accent-yellow-400"
                />
                <span>Apply Crisp Unsharp Convolution</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFilterFormat(fmt)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                    filterFormat === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunFilters}
              disabled={!filterFile || isWorking}
              className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
              <span>Render Graded Image</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Live Color Grade &amp; Swatches
              </h3>
              {filterResult && (
                <button
                  type="button"
                  onClick={() => triggerDownload(filterResult.blob, filterResult.fileName)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .{filterResult.format}</span>
                </button>
              )}
            </div>

            {filterPreviewUrl ? (
              <>
                <div className="h-[340px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center p-4" style={CHECKERBOARD_STYLE}>
                  <img
                    src={filterResult ? filterResult.dataUrl : filterPreviewUrl}
                    alt="Graded preview"
                    style={
                      filterResult
                        ? undefined
                        : {
                            filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) hue-rotate(${filters.hueRotate}deg) blur(${filters.blur}px) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%)`,
                          }
                    }
                    className="max-h-full max-w-full object-contain shadow"
                  />
                </div>

                {filterResult && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Rendered full-resolution graded asset ({formatBytes(filterResult.sizeBytes)}).</span>
                  </div>
                )}

                {paletteSwatches.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">
                      Extracted Dominant Color Palette (Click to Copy Hex)
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {paletteSwatches.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(hex);
                            setCopiedHex(hex);
                            setTimeout(() => setCopiedHex(null), 1600);
                          }}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 cursor-pointer text-left"
                        >
                          <div className="h-10 w-full" style={{ backgroundColor: hex }} />
                          <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-800 dark:text-zinc-200">
                            <span>{hex}</span>
                            {copiedHex === hex ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-zinc-400" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                onClick={() => filterInputRef.current?.click()}
                className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <Sliders className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">
                  Upload a graphic or photograph to adjust tone and extract its color palette swatches.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* 9-11. DAILY ROUTINE TOOLS (WATERMARK REMOVER, BLUR/REDACT, PHOTO GRID) */}
      {/* ===================================================== */}
      {(activeTool === 'watermark-remove' ||
        activeTool === 'blur-redact' ||
        activeTool === 'grid-collage') && (
        <ImageRoutineTools
          mode={activeTool}
          onError={setErrorMsg}
          onProgress={setProgress}
          isWorking={isWorking}
          setIsWorking={setIsWorking}
          onTaskComplete={onTaskComplete}
          onSendResultToTool={sendResultToTool}
        />
      )}

      {/* ===================================================== */}
      {/* 12. PHOTO BATCH STUDIO (PRESETS, ADJUST, MARKS, ZIP)  */}
      {/* ===================================================== */}
      {activeTool === 'photo-batch' && (
        <PhotoBatchStudio
          userEmail={userEmail}
          onUseAsCoverLogo={onUseAsCoverLogo}
          onTaskComplete={onTaskComplete}
          onPreviewDocument={onPreviewDocument}
        />
      )}
      </div>
    </div>
  );
};
