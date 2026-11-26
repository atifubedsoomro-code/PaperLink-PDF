import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Eye,
  FolderUp,
  Frame,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Stamp,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  PhotoBatchAdjustConfig,
  PhotoBatchAnchor,
  PhotoBatchMark,
  PhotoBatchPresetCategory,
  PhotoBatchPresetRecord,
  PhotoBatchSetup,
} from '../types';
import {
  ANCHOR_LABELS,
  MARK_FONT_OPTIONS,
  MarkHitbox,
  PHOTO_BATCH_LOOKS,
  VIGNETTE_PROFILES,
  applyColorPassToContext,
  computeAutoToneAdjustments,
  createBaseMark,
  createBatchPhotoThumbnailUrl,
  createDefaultPhotoBatchSetup,
  createMarkId,
  createSampleBatchCanvas,
  decodeBatchPhotoFile,
  ensureMarkFontsLoaded,
  getLogoElementFromCache,
  getOutputDimensions,
  mergePhotoBatchSetup,
  renderPhotoBatchFrame,
} from '../services/photoBatchEngine';
import {
  deletePhotoBatchPreset,
  getPhotoBatchPresets,
  savePhotoBatchPreset,
} from '../firebase';
import { triggerRobotToast } from '../services/robotToast';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import { PreviewTarget } from './DocumentPreviewModal';
import { RobotProgressBar } from './RobotProgressBar';

type InspectorTab = 'presets' | 'adjust' | 'effects' | 'marks' | 'export';

interface BatchPhotoItem {
  id: string;
  file: File;
  name: string;
  size: number;
  thumbUrl: string;
}

interface ExportZipPart {
  id: string;
  name: string;
  count: number;
  blob: Blob;
}

interface PhotoBatchStudioProps {
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

const WORKING_SETUP_STORAGE_KEY = 'paperlink_photobatch_working_setup_v1';
const PREVIEW_MAX_EDGE = 1280;
const MAX_HISTORY = 24;
const PRESET_CATEGORIES: PhotoBatchPresetCategory[] = [
  'Events',
  'Portraits',
  'Product',
  'Social',
  'Print',
  'Custom',
];

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
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function isBatchImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)
  );
}

function loadInitialSetup(): PhotoBatchSetup {
  try {
    const raw = localStorage.getItem(WORKING_SETUP_STORAGE_KEY);
    if (raw) {
      return mergePhotoBatchSetup(JSON.parse(raw));
    }
  } catch {
    // ignore storage errors
  }
  return createDefaultPhotoBatchSetup();
}

export const PhotoBatchStudio: React.FC<PhotoBatchStudioProps> = ({
  userEmail = '',
  onUseAsCoverLogo,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const [setup, setSetup] = useState<PhotoBatchSetup>(loadInitialSetup);
  const [undoStack, setUndoStack] = useState<PhotoBatchSetup[]>([]);
  const [redoStack, setRedoStack] = useState<PhotoBatchSetup[]>([]);
  const [activeTab, setActiveTab] = useState<InspectorTab>('presets');

  // Batch items & current preview source
  const [items, setItems] = useState<BatchPhotoItem[]>([]);
  const [curIndex, setCurIndex] = useState<number>(-1);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [stageDragOver, setStageDragOver] = useState(false);

  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!sampleCanvasRef.current && typeof document !== 'undefined') {
    sampleCanvasRef.current = createSampleBatchCanvas();
  }

  const [curPreviewMeta, setCurPreviewMeta] = useState<{
    src: HTMLCanvasElement;
    w: number;
    h: number;
    ow: number;
    oh: number;
    name: string;
    size: number;
    isSample: boolean;
  }>(() => {
    const sample = sampleCanvasRef.current;
    return {
      src: sample!,
      w: sample?.width || 1200,
      h: sample?.height || 800,
      ow: sample?.width || 1200,
      oh: sample?.height || 800,
      name: 'Sample Stage Photo',
      size: 0,
      isSample: true,
    };
  });

  // Canvas & before/after comparison state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const markBoxesRef = useRef<Record<string, MarkHitbox>>({});
  const dragStateRef = useRef<{
    markId: string;
    dx: number;
    dy: number;
  } | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
  const [holdingOriginal, setHoldingOriginal] = useState(false);
  const [splitCompare, setSplitCompare] = useState(false);
  const [splitPct, setSplitPct] = useState(50);

  // Watermark selection & inputs
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(
    () => setup.marks[0]?.id ?? null
  );
  const logoTargetIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const presetImportRef = useRef<HTMLInputElement>(null);

  // Presets Library (Local + Firestore)
  const [savedPresets, setSavedPresets] = useState<PhotoBatchPresetRecord[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetCategory, setPresetCategory] = useState<PhotoBatchPresetCategory>('Events');
  const [presetIncludeMarks, setPresetIncludeMarks] = useState(false);
  const [presetFilterCat, setPresetFilterCat] = useState<'All' | PhotoBatchPresetCategory>('All');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  // Batch Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; status: string } | null>(null);
  const [exportParts, setExportParts] = useState<ExportZipPart[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFailedFiles, setExportFailedFiles] = useState<string[]>([]);
  const cancelExportRef = useRef(false);

  // Look thumbnail canvases
  const lookThumbCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Persist working setup cleanly
  useEffect(() => {
    try {
      localStorage.setItem(WORKING_SETUP_STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // ignore quota errors
    }
  }, [setup]);

  // Load saved presets from localStorage + Firestore
  const refreshSavedPresets = useCallback(async () => {
    try {
      const list = await getPhotoBatchPresets(userEmail || undefined);
      setSavedPresets(list);
    } catch {
      // ignore read errors
    }
  }, [userEmail]);

  useEffect(() => {
    void refreshSavedPresets();
  }, [refreshSavedPresets]);

  // History-aware setup update helper
  const updateSetup = useCallback(
    (updater: (prev: PhotoBatchSetup) => PhotoBatchSetup, recordHistory = true) => {
      setSetup((prev) => {
        const next = updater(prev);
        if (recordHistory && next !== prev) {
          setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), prev]);
          setRedoStack([]);
        }
        return next;
      });
    },
    []
  );

  const handleUndo = () => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, setup]);
      setSetup(last);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, setup]);
      setSetup(next);
      return prev.slice(0, -1);
    });
  };

  // Decode selected photo into scaled preview canvas
  const selectionTokenRef = useRef(0);
  useEffect(() => {
    const token = ++selectionTokenRef.current;

    if (curIndex < 0 || curIndex >= items.length) {
      const sample = sampleCanvasRef.current || createSampleBatchCanvas();
      sampleCanvasRef.current = sample;
      setCurPreviewMeta({
        src: sample,
        w: sample.width,
        h: sample.height,
        ow: sample.width,
        oh: sample.height,
        name: 'Sample Stage Photo',
        size: 0,
        isSample: true,
      });
      return;
    }

    const item = items[curIndex];
    const load = async () => {
      try {
        const bmp = await decodeBatchPhotoFile(item.file);
        if (token !== selectionTokenRef.current) {
          if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
          return;
        }
        const bw = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth;
        const bh = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight;
        const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bw, bh));
        const off = document.createElement('canvas');
        off.width = Math.max(1, Math.round(bw * scale));
        off.height = Math.max(1, Math.round(bh * scale));
        const oCtx = off.getContext('2d');
        if (oCtx) {
          oCtx.imageSmoothingEnabled = true;
          oCtx.imageSmoothingQuality = 'high';
          oCtx.drawImage(bmp, 0, 0, off.width, off.height);
        }
        if ('close' in bmp && typeof bmp.close === 'function') bmp.close();

        setCurPreviewMeta({
          src: off,
          w: off.width,
          h: off.height,
          ow: bw,
          oh: bh,
          name: item.name,
          size: item.size,
          isSample: false,
        });
      } catch (err: any) {
        triggerRobotToast({
          message: `Could not open ${item.name}`,
          subText: err?.message || 'Try JPG, PNG, WebP, or HEIC.',
          expression: 'curious',
        });
      }
    };

    void load();
  }, [curIndex, items]);

  // Render live look thumbnails whenever current photo or Presets tab becomes visible
  useEffect(() => {
    if (activeTab !== 'presets' || !curPreviewMeta.src) return;
    for (const look of PHOTO_BATCH_LOOKS) {
      const thumbCanvas = lookThumbCanvasRefs.current[look.id];
      if (!thumbCanvas) continue;
      const ctx = thumbCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      const scale = Math.max(
        thumbCanvas.width / Math.max(1, curPreviewMeta.w),
        thumbCanvas.height / Math.max(1, curPreviewMeta.h)
      );
      const dw = curPreviewMeta.w * scale;
      const dh = curPreviewMeta.h * scale;
      ctx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
      ctx.drawImage(
        curPreviewMeta.src,
        (thumbCanvas.width - dw) / 2,
        (thumbCanvas.height - dh) / 2,
        dw,
        dh
      );
      const baseAdj = createDefaultPhotoBatchSetup().adjust;
      applyColorPassToContext(ctx, thumbCanvas.width, thumbCanvas.height, {
        ...baseAdj,
        ...look.p,
      });
    }
  }, [curPreviewMeta, activeTab]);

  // Preload logo watermark elements & fonts, then paint preview canvas via rAF
  const paintTokenRef = useRef(0);
  useEffect(() => {
    const myToken = ++paintTokenRef.current;
    let rafId = 0;

    const runPaint = async () => {
      await ensureMarkFontsLoaded(setup.marks);
      const logoUrls = setup.marks
        .filter((m) => m.visible && m.type === 'logo' && m.imgData)
        .map((m) => m.imgData as string);
      if (logoUrls.length) {
        await Promise.all(
          logoUrls.map((url) => getLogoElementFromCache(url, logoCacheRef.current))
        );
      }
      if (myToken !== paintTokenRef.current) return;

      rafId = window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas || !curPreviewMeta.src) return;

        const targetDims = getOutputDimensions(curPreviewMeta.w, curPreviewMeta.h, {
          ...setup.out,
          maxSide: 0,
        });
        if (canvas.width !== targetDims.width || canvas.height !== targetDims.height) {
          canvas.width = targetDims.width;
          canvas.height = targetDims.height;
        }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Also update untouched original buffer when split compare or hold original is used
        if (originalCanvasRef.current && (splitCompare || holdingOriginal)) {
          const origCanvas = originalCanvasRef.current;
          if (origCanvas.width !== targetDims.width || origCanvas.height !== targetDims.height) {
            origCanvas.width = targetDims.width;
            origCanvas.height = targetDims.height;
          }
          const origCtx = origCanvas.getContext('2d');
          if (origCtx) {
            const cropSetup = createDefaultPhotoBatchSetup();
            cropSetup.out.aspectCrop = setup.out.aspectCrop;
            renderPhotoBatchFrame(origCtx, curPreviewMeta.src, targetDims.width, targetDims.height, cropSetup);
          }
        }

        if (holdingOriginal && !splitCompare) {
          const cropSetup = createDefaultPhotoBatchSetup();
          cropSetup.out.aspectCrop = setup.out.aspectCrop;
          renderPhotoBatchFrame(ctx, curPreviewMeta.src, targetDims.width, targetDims.height, cropSetup);
          markBoxesRef.current = {};
          return;
        }

        markBoxesRef.current = renderPhotoBatchFrame(
          ctx,
          curPreviewMeta.src,
          targetDims.width,
          targetDims.height,
          setup,
          {
            photoIndex: Math.max(0, curIndex),
            totalPhotos: Math.max(1, items.length),
            fileName: curPreviewMeta.name,
            logoCache: logoCacheRef.current,
          }
        );
      });
    };

    void runPaint();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [setup, curPreviewMeta, curIndex, items.length, holdingOriginal, splitCompare]);

  // Keyboard arrow navigation across batch photos
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (items.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCurIndex((i) => (i - 1 + items.length) % items.length);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCurIndex((i) => (i + 1) % items.length);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items.length]);

  // Add batch files
  const handleAddFiles = async (fileList: FileList | File[]) => {
    const valid = Array.from(fileList).filter(isBatchImageFile);
    if (!valid.length) {
      triggerRobotToast({
        message: 'No supported images found',
        subText: 'Drop JPG, PNG, WebP, AVIF, or HEIC photos.',
        expression: 'curious',
      });
      return;
    }

    setIsLoadingFiles(true);
    const added: BatchPhotoItem[] = [];
    for (let i = 0; i < valid.length; i += 4) {
      const chunk = valid.slice(i, i + 4);
      const processed = await Promise.all(
        chunk.map(async (f) => {
          try {
            const thumbUrl = await createBatchPhotoThumbnailUrl(f);
            return {
              id: `pb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
              file: f,
              name: f.name,
              size: f.size,
              thumbUrl,
            } as BatchPhotoItem;
          } catch {
            return null;
          }
        })
      );
      processed.forEach((p) => {
        if (p) added.push(p);
      });
    }
    setIsLoadingFiles(false);

    if (added.length) {
      setItems((prev) => {
        const next = [...prev, ...added];
        if (curIndex < 0) setCurIndex(0);
        return next;
      });
      triggerRobotToast({
        message: `Added ${added.length} ${added.length === 1 ? 'photo' : 'photos'} to batch`,
        subText: 'Ready for looks, watermarks, and batch export.',
        expression: 'happy',
      });
    }
  };

  const handleRemoveItem = (id: string, idx: number) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      if (!next.length) {
        setCurIndex(-1);
      } else if (curIndex === idx) {
        setCurIndex(Math.min(idx, next.length - 1));
      } else if (curIndex > idx) {
        setCurIndex(curIndex - 1);
      }
      return next;
    });
  };

  const handleClearBatch = () => {
    setItems([]);
    setCurIndex(-1);
    setExportParts([]);
    setExportError(null);
    setExportFailedFiles([]);
  };

  // Dragging watermarks directly on the preview canvas
  const getPointerFraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / Math.max(1, rect.width),
      y: (e.clientY - rect.top) / Math.max(1, rect.height),
    };
  };

  const findHitMark = (p: { x: number; y: number }): PhotoBatchMark | null => {
    for (let i = setup.marks.length - 1; i >= 0; i--) {
      const m = setup.marks[i];
      const box = markBoxesRef.current[m.id];
      if (!m.visible || m.tile || !box) continue;
      if (Math.abs(p.x - box.cx) <= box.hw + 0.015 && Math.abs(p.y - box.cy) <= box.hh + 0.015) {
        return m;
      }
    }
    return null;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (holdingOriginal) return;
    const p = getPointerFraction(e);
    const hit = findHitMark(p);
    if (!hit) return;
    const box = markBoxesRef.current[hit.id];
    dragStateRef.current = {
      markId: hit.id,
      dx: p.x - box.cx,
      dy: p.y - box.cy,
    };
    setSelectedMarkId(hit.id);
    setCanvasCursor('grabbing');
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = getPointerFraction(e);
    const drag = dragStateRef.current;
    if (!drag) {
      setCanvasCursor(findHitMark(p) ? 'grab' : 'default');
      return;
    }
    const nx = Math.min(1, Math.max(0, p.x - drag.dx));
    const ny = Math.min(1, Math.max(0, p.y - drag.dy));
    updateSetup(
      (prev) => ({
        ...prev,
        marks: prev.marks.map((m) =>
          m.id === drag.markId ? { ...m, anchor: 'custom', x: nx, y: ny } : m
        ),
      }),
      false
    );
  };

  const handleCanvasPointerUp = () => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setCanvasCursor('default');
    }
  };

  // Auto-enhance via histogram percentiles
  const handleAutoEnhance = () => {
    if (!curPreviewMeta.src) return;
    const auto = computeAutoToneAdjustments(curPreviewMeta.src);
    updateSetup((prev) => ({
      ...prev,
      adjust: {
        ...prev.adjust,
        ...auto,
      },
    }));
    triggerRobotToast({
      message: 'Auto-balanced exposure & tone',
      subText: 'Fine-tune any slider in the Adjust tab.',
      expression: 'sparkle',
    });
  };

  // Save / Apply / Update / Delete / Export / Import Presets
  const handleSavePreset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) {
      triggerRobotToast({
        message: 'Name your preset first',
        subText: 'Enter a short name like "Stage Golden" or "Product Clean".',
        expression: 'curious',
      });
      return;
    }

    setIsSavingPreset(true);
    try {
      const snapshot: PhotoBatchSetup = {
        ...setup,
        adjust: { ...setup.adjust },
        vignette: { ...setup.vignette },
        grain: { ...setup.grain },
        frame: { ...setup.frame },
        marks: presetIncludeMarks ? setup.marks.map((m) => ({ ...m })) : [],
        out: { ...setup.out },
      };

      const record: PhotoBatchPresetRecord = {
        id: `pbp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        category: presetCategory,
        includeMarks: presetIncludeMarks,
        setup: snapshot,
        userEmail: userEmail || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await savePhotoBatchPreset(record);
      await refreshSavedPresets();
      setPresetName('');
      setAppliedPresetId(record.id);
      triggerRobotToast({
        message: `Preset "${trimmed}" saved!`,
        subText: userEmail ? 'Synced to your account & this device.' : 'Saved cleanly on this device.',
        expression: 'thumbs-up',
      });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleApplySavedPreset = (preset: PhotoBatchPresetRecord) => {
    const merged = mergePhotoBatchSetup(preset.setup);
    updateSetup((prev) => ({
      ...merged,
      // Keep user's current watermarks unless the preset explicitly saved watermarks
      marks: preset.includeMarks ? merged.marks : prev.marks,
    }));
    setAppliedPresetId(preset.id);
    triggerRobotToast({
      message: `Applied "${preset.name}"`,
      subText: `${preset.category} preset applied to preview & batch.`,
      expression: 'thumbs-up',
    });
  };

  const handleOverwritePreset = async (preset: PhotoBatchPresetRecord) => {
    const updated: PhotoBatchPresetRecord = {
      ...preset,
      updatedAt: Date.now(),
      setup: {
        ...setup,
        marks: preset.includeMarks ? setup.marks.map((m) => ({ ...m })) : [],
      },
    };
    await savePhotoBatchPreset(updated);
    await refreshSavedPresets();
    setAppliedPresetId(preset.id);
    triggerRobotToast({
      message: `Updated "${preset.name}"`,
      subText: 'Preset updated with your latest tweaks.',
      expression: 'happy',
    });
  };

  const handleDeleteSavedPreset = async (preset: PhotoBatchPresetRecord) => {
    await deletePhotoBatchPreset(preset.id);
    if (appliedPresetId === preset.id) setAppliedPresetId(null);
    await refreshSavedPresets();
    triggerRobotToast({
      message: `Removed "${preset.name}"`,
      expression: 'wave',
    });
  };

  const handleExportPresetPack = () => {
    if (!savedPresets.length) {
      triggerRobotToast({
        message: 'No saved presets to export yet',
        subText: 'Save at least one preset first.',
        expression: 'curious',
      });
      return;
    }
    const blob = new Blob([JSON.stringify({ version: 1, presets: savedPresets }, null, 2)], {
      type: 'application/json',
    });
    triggerDownload(blob, 'paperlink_photobatch_presets.json');
    triggerRobotToast({
      message: 'Preset pack exported (.json)',
      subText: `${savedPresets.length} presets saved to file.`,
      expression: 'thumbs-up',
    });
  };

  const handleImportPresetPack = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const rawList: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.presets)
        ? parsed.presets
        : [];
      if (!rawList.length) throw new Error('No presets found inside JSON file.');

      let count = 0;
      for (const item of rawList) {
        if (!item?.name || !item?.setup) continue;
        const rec: PhotoBatchPresetRecord = {
          id: `pbp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: String(item.name).slice(0, 100),
          category: PRESET_CATEGORIES.includes(item.category) ? item.category : 'Custom',
          includeMarks: Boolean(item.includeMarks),
          setup: mergePhotoBatchSetup(item.setup),
          userEmail: userEmail || '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await savePhotoBatchPreset(rec);
        count++;
      }
      await refreshSavedPresets();
      triggerRobotToast({
        message: `Imported ${count} ${count === 1 ? 'preset' : 'presets'}!`,
        expression: 'celebrate',
      });
    } catch (err: any) {
      triggerRobotToast({
        message: 'Preset import failed',
        subText: err?.message || 'Select a valid PaperLink preset JSON file.',
        expression: 'curious',
      });
    }
  };

  // Watermark management helpers
  const updateMark = (id: string, patch: Partial<PhotoBatchMark>) => {
    updateSetup((prev) => ({
      ...prev,
      marks: prev.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const handleAddTextMark = () => {
    if (setup.marks.length >= 8) {
      triggerRobotToast({ message: 'Up to 8 watermarks per photo', expression: 'curious' });
      return;
    }
    const nextMark = createBaseMark({ text: 'New Watermark', anchor: 'bc' });
    updateSetup((prev) => ({ ...prev, marks: [...prev.marks, nextMark] }));
    setSelectedMarkId(nextMark.id);
  };

  const handleAddLogoMark = () => {
    if (setup.marks.length >= 8) {
      triggerRobotToast({ message: 'Up to 8 watermarks per photo', expression: 'curious' });
      return;
    }
    const nextMark = createBaseMark({
      type: 'logo',
      size: 14,
      opacity: 90,
      anchor: 'tr',
      margin: 2.5,
      shadow: false,
    });
    updateSetup((prev) => ({ ...prev, marks: [...prev.marks, nextMark] }));
    setSelectedMarkId(nextMark.id);
    logoTargetIdRef.current = nextMark.id;
    logoInputRef.current?.click();
  };

  const handleLogoFileSelected = async (file: File) => {
    const targetId = logoTargetIdRef.current;
    if (!targetId) return;
    try {
      const bmp = await decodeBatchPhotoFile(file);
      const bw = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth;
      const bh = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight;
      const k = Math.min(1, 720 / Math.max(bw, bh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bw * k));
      c.height = Math.max(1, Math.round(bh * k));
      c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
      if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
      const dataUrl = c.toDataURL('image/png');
      c.width = 1;
      c.height = 1;
      updateMark(targetId, { imgData: dataUrl, imgName: file.name, type: 'logo' });
    } catch {
      triggerRobotToast({ message: 'Could not read logo image', expression: 'curious' });
    }
  };

  const handleMoveMark = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= setup.marks.length) return;
    updateSetup((prev) => {
      const next = [...prev.marks];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return { ...prev, marks: next };
    });
  };

  const handleDuplicateMark = (mark: PhotoBatchMark) => {
    if (setup.marks.length >= 8) {
      triggerRobotToast({ message: 'Up to 8 watermarks per photo', expression: 'curious' });
      return;
    }
    const copy = { ...mark, id: createMarkId() };
    updateSetup((prev) => ({ ...prev, marks: [...prev.marks, copy] }));
    setSelectedMarkId(copy.id);
  };

  const handleDeleteMark = (id: string) => {
    updateSetup((prev) => ({
      ...prev,
      marks: prev.marks.filter((m) => m.id !== id),
    }));
    if (selectedMarkId === id) {
      setSelectedMarkId(setup.marks.find((m) => m.id !== id)?.id ?? null);
    }
  };

  // Single photo render & action (Preview / Download / Cover Studio Logo)
  const renderCurrentToBlob = async (): Promise<{ blob: Blob; fileName: string; dataUrl: string } | null> => {
    if (!curPreviewMeta.src) return null;
    await ensureMarkFontsLoaded(setup.marks);
    const logoUrls = setup.marks
      .filter((m) => m.visible && m.type === 'logo' && m.imgData)
      .map((m) => m.imgData as string);
    if (logoUrls.length) {
      await Promise.all(logoUrls.map((u) => getLogoElementFromCache(u, logoCacheRef.current)));
    }

    let sourceObj: HTMLCanvasElement | ImageBitmap | HTMLImageElement = curPreviewMeta.src;
    let shouldCloseSource = false;
    if (!curPreviewMeta.isSample && curIndex >= 0 && items[curIndex]) {
      sourceObj = await decodeBatchPhotoFile(items[curIndex].file);
      shouldCloseSource = true;
    }

    const srcW = (sourceObj as HTMLCanvasElement).width || (sourceObj as HTMLImageElement).naturalWidth;
    const srcH = (sourceObj as HTMLCanvasElement).height || (sourceObj as HTMLImageElement).naturalHeight;
    const { width, height } = getOutputDimensions(srcW, srcH, setup.out);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const extMap = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] } as const;
    const [mime, ext] = extMap[setup.out.format];
    if (setup.out.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    renderPhotoBatchFrame(ctx, sourceObj, width, height, setup, {
      photoIndex: Math.max(0, curIndex),
      totalPhotos: Math.max(1, items.length),
      fileName: curPreviewMeta.name,
      logoCache: logoCacheRef.current,
    });

    if (shouldCloseSource && 'close' in sourceObj && typeof sourceObj.close === 'function') {
      sourceObj.close();
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      outCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
        mime,
        setup.out.quality / 100
      )
    );
    const dataUrl = outCanvas.toDataURL(mime, setup.out.quality / 100);
    outCanvas.width = 1;
    outCanvas.height = 1;

    const base = curPreviewMeta.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    const outName = `${setup.out.prefix || ''}${base}${setup.out.suffix || ''}.${ext}`;
    return { blob, fileName: outName, dataUrl };
  };

  const handleDownloadCurrentPhoto = async () => {
    const res = await renderCurrentToBlob();
    if (!res) return;
    if (onTaskComplete) {
      onTaskComplete({
        headline: 'Edited Photo Ready',
        subtext: `${res.fileName} (${formatBytes(res.blob.size)}) is ready.`,
        statusLabel: 'Photo Studio Export',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Photo Batch Studio',
          headline: 'Edited Photo Ready',
          openInStudio: false,
        },
      });
    } else {
      triggerDownload(res.blob, res.fileName);
    }
  };

  const handlePreviewCurrentPhoto = async () => {
    if (!onPreviewDocument) return;
    const res = await renderCurrentToBlob();
    if (!res) return;
    onPreviewDocument({
      title: res.fileName,
      fileName: res.fileName,
      blob: res.blob,
      subtitle: 'Photo Batch Studio Output',
    });
  };

  // Full Batch ZIP Export
  const handleRunBatchExport = async () => {
    if (!items.length || isExporting) return;
    setIsExporting(true);
    cancelExportRef.current = false;
    setExportError(null);
    setExportParts([]);
    setExportFailedFiles([]);
    setExportProgress({ percent: 0, status: 'Preparing fonts & logos…' });

    try {
      await ensureMarkFontsLoaded(setup.marks);
      const logoUrls = setup.marks
        .filter((m) => m.visible && m.type === 'logo' && m.imgData)
        .map((m) => m.imgData as string);
      if (logoUrls.length) {
        await Promise.all(logoUrls.map((u) => getLogoElementFromCache(u, logoCacheRef.current)));
      }

      const extMap = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] } as const;
      const [mime, ext] = extMap[setup.out.format];
      const perZip = setup.out.perZip > 0 ? setup.out.perZip : items.length;
      const totalParts = Math.ceil(items.length / perZip);
      const zipBase = (setup.out.zipName || 'photo-batch-edited').replace(/[\\/:*?"<>|]/g, '_');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Browser canvas unavailable.');

      const usedNames = new Set<string>();
      const makeUniqueName = (rawName: string) => {
        const cleanBase = rawName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
        const stem = `${(setup.out.prefix || '').replace(/[\\/:*?"<>|]/g, '_')}${cleanBase}${(setup.out.suffix || '').replace(/[\\/:*?"<>|]/g, '_')}`;
        let candidate = `${stem}.${ext}`;
        let n = 2;
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = `${stem}-${n}.${ext}`;
          n++;
        }
        usedNames.add(candidate.toLowerCase());
        return candidate;
      };

      const builtParts: ExportZipPart[] = [];
      const failed: string[] = [];
      let zip: JSZip | null = null;
      let inZip = 0;
      let partIndex = 0;

      const flushZip = async () => {
        if (!zip || inZip === 0) return;
        partIndex++;
        setExportProgress({
          percent: 95,
          status: `Packaging ZIP ${partIndex}${totalParts > 1 ? ` of ${totalParts}` : ''}…`,
        });
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const partName =
          totalParts === 1 ? `${zipBase}.zip` : `${zipBase}-part-${partIndex}.zip`;
        builtParts.push({
          id: `zip_${partIndex}_${Date.now()}`,
          name: partName,
          count: inZip,
          blob,
        });
        zip = null;
        inZip = 0;
      };

      for (let i = 0; i < items.length; i++) {
        if (cancelExportRef.current) break;
        const it = items[i];
        setExportProgress({
          percent: Math.round(((i + 0.5) / items.length) * 90),
          status: `Editing ${i + 1} of ${items.length}: ${it.name}`,
        });
        await new Promise((r) => window.setTimeout(r, 0));

        if (!zip) zip = new JSZip();
        try {
          const bmp = await decodeBatchPhotoFile(it.file);
          const bw = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth;
          const bh = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight;
          const { width, height } = getOutputDimensions(bw, bh, setup.out);

          canvas.width = width;
          canvas.height = height;
          if (setup.out.format === 'jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          }

          renderPhotoBatchFrame(ctx, bmp, width, height, setup, {
            photoIndex: i,
            totalPhotos: items.length,
            fileName: it.name,
            logoCache: logoCacheRef.current,
          });

          if ('close' in bmp && typeof bmp.close === 'function') bmp.close();

          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
              mime,
              setup.out.quality / 100
            )
          );
          zip.file(makeUniqueName(it.name), blob, { binary: true });
          inZip++;
        } catch {
          failed.push(it.name);
        }

        if (inZip >= perZip) {
          await flushZip();
        }
      }

      if (zip && inZip > 0) {
        await flushZip();
      }

      canvas.width = 1;
      canvas.height = 1;
      setExportParts(builtParts);
      setExportFailedFiles(failed);

      if (builtParts.length === 1 && !cancelExportRef.current) {
        const only = builtParts[0];
        onTaskComplete?.({
          headline: `${only.count} Edited Photos Packed`,
          subtext: `${only.name} (${formatBytes(only.blob.size)}) is ready to download.`,
          statusLabel: 'Photo Batch Export',
          downloadFile: {
            blob: only.blob,
            fileName: only.name,
            fileSizeBytes: only.blob.size,
            toolLabel: 'Photo Batch Studio',
            headline: `${only.count} Edited Photos Ready`,
            openInStudio: false,
          },
        });
      }
    } catch (err: any) {
      setExportError(err?.message || 'Batch export failed.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const activeLook =
    PHOTO_BATCH_LOOKS.find((l) => l.id === setup.filter.preset) || PHOTO_BATCH_LOOKS[0];
  const visibleMarksCount = setup.marks.filter((m) => m.visible).length;
  const selectedMark = setup.marks.find((m) => m.id === selectedMarkId) || null;
  const filteredSavedPresets = useMemo(
    () =>
      presetFilterCat === 'All'
        ? savedPresets
        : savedPresets.filter((p) => p.category === presetFilterCat),
    [savedPresets, presetFilterCat]
  );

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (val: number) => void,
    resetVal = 0
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <button
          type="button"
          onClick={() => onChange(resetVal)}
          title="Click to reset slider"
          className="font-mono text-[11px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-yellow-400 tabular-nums cursor-pointer"
        >
          {Math.round(value * 10) / 10}
          {unit}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-yellow-400 cursor-pointer"
      />
    </div>
  );

  const setAdjustField = (key: keyof PhotoBatchAdjustConfig, value: number) => {
    updateSetup((prev) => ({
      ...prev,
      adjust: { ...prev.adjust, [key]: value },
    }));
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleAddFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleLogoFileSelected(f);
          e.target.value = '';
        }}
      />
      <input
        ref={presetImportRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportPresetPack(f);
          e.target.value = '';
        }}
      />

      {/* Top Studio Header Bar */}
      <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Photo Batch Studio
            </h2>
            <span className="text-zinc-400" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
              {items.length} {items.length === 1 ? 'photo' : 'photos'} · Look: {activeLook.name}
              {visibleMarksCount > 0 ? ` · ${visibleMarksCount} marks` : ''}
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Upload event or product shots, apply saved presets, drag watermarks, and export in one ZIP locally.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo last adjustment"
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 disabled:opacity-35 cursor-pointer transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo adjustment"
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 disabled:opacity-35 cursor-pointer transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-bold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
            <span>Save Preset</span>
          </button>

          <button
            type="button"
            onClick={() => {
              updateSetup(() => createDefaultPhotoBatchSetup());
              triggerRobotToast({ message: 'Studio setup reset to defaults', expression: 'wave' });
            }}
            className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-red-400/60 text-xs font-semibold text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>Add Photos</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Studio Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Stage + Controls + Filmstrip */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            {/* Stage File Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-zinc-900 dark:text-white truncate max-w-[260px]">
                {curPreviewMeta.isSample ? 'Sample Stage Preview (add photos below)' : curPreviewMeta.name}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {curPreviewMeta.isSample
                  ? '1200 × 800 px · Interactive preview'
                  : `${curPreviewMeta.ow} × ${curPreviewMeta.oh} px · ${formatBytes(curPreviewMeta.size)} · ${curIndex + 1} of ${items.length}`}
              </span>
            </div>

            {/* Interactive Canvas Viewport */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setStageDragOver(true);
              }}
              onDragLeave={() => setStageDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setStageDragOver(false);
                if (e.dataTransfer.files?.length) void handleAddFiles(e.dataTransfer.files);
              }}
              className={`relative rounded-xl border bg-zinc-950 flex items-center justify-center overflow-hidden min-h-[280px] sm:min-h-[360px] max-h-[470px] transition-colors ${
                stageDragOver
                  ? 'border-yellow-400 ring-2 ring-yellow-400/40'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="relative inline-flex items-center justify-center max-w-full max-h-[460px] select-none">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  style={{ cursor: canvasCursor }}
                  className="block max-w-full max-h-[452px] w-auto h-auto object-contain"
                />

                {/* Original Buffer Overlay for Split Compare */}
                <canvas
                  ref={originalCanvasRef}
                  style={
                    splitCompare
                      ? { clipPath: `inset(0 ${100 - splitPct}% 0 0)` }
                      : { display: 'none' }
                  }
                  className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                />

                {splitCompare && (
                  <div
                    style={{ left: `${splitPct}%` }}
                    className="pointer-events-none absolute inset-y-0 -translate-x-1/2 w-[2px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.65)]"
                  >
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono">
                      Original
                    </span>
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-yellow-400 text-black text-[10px] font-mono font-bold">
                      Edited
                    </span>
                  </div>
                )}
              </div>

              {holdingOriginal && !splitCompare && (
                <div className="pointer-events-none absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/80 text-white text-[11px] font-mono font-bold">
                  Showing Original
                </div>
              )}

              {stageDragOver && (
                <div className="pointer-events-none absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2">
                  <Upload className="w-7 h-7 text-yellow-400" />
                  <p className="text-sm font-bold">Drop photos to add to batch</p>
                </div>
              )}
            </div>

            {splitCompare && (
              <div className="flex items-center gap-3 px-1">
                <span className="text-[11px] font-mono text-zinc-500">Original</span>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  aria-label="Before and after split divider"
                  className="flex-1 accent-yellow-400 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-zinc-500">Edited</span>
              </div>
            )}

            {/* Stage Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={items.length < 2}
                  onClick={() => setCurIndex((i) => (i - 1 + items.length) % items.length)}
                  aria-label="Previous photo"
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 disabled:opacity-35 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={items.length < 2}
                  onClick={() => setCurIndex((i) => (i + 1) % items.length)}
                  aria-label="Next photo"
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 disabled:opacity-35 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onPointerDown={() => setHoldingOriginal(true)}
                  onPointerUp={() => setHoldingOriginal(false)}
                  onPointerLeave={() => setHoldingOriginal(false)}
                  onPointerCancel={() => setHoldingOriginal(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-yellow-400 cursor-pointer whitespace-nowrap shrink-0 select-none"
                >
                  Hold for Original
                </button>

                <button
                  type="button"
                  onClick={() => setSplitCompare((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    splitCompare
                      ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Split</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoEnhance}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Auto Tone</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {onPreviewDocument && (
                  <button
                    type="button"
                    onClick={() => {
                      void handlePreviewCurrentPhoto();
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadCurrentPhoto();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save Photo</span>
                </button>

                {onUseAsCoverLogo && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await renderCurrentToBlob();
                      if (res) onUseAsCoverLogo(res.dataUrl);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Use on Cover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Batch Queue Filmstrip */}
          <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <h3 className="font-bold text-zinc-900 dark:text-white">Batch Queue</h3>
                <span className="text-zinc-400" aria-hidden="true">·</span>
                <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {items.length} {items.length === 1 ? 'photo' : 'photos'}
                </span>
                {isLoadingFiles && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-yellow-400" />}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Photos</span>
                </button>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearBatch}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-500 cursor-pointer whitespace-nowrap"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) void handleAddFiles(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-5 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5 text-amber-600 dark:text-yellow-400 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  Drop multiple photos here or click to browse
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Supports JPG, PNG, WebP, AVIF &amp; iPhone HEIC/HEIF — processed privately in your browser.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {items.map((item, idx) => {
                  const active = idx === curIndex;
                  return (
                    <div
                      key={item.id}
                      className={`group relative shrink-0 w-24 rounded-xl border overflow-hidden transition-all ${
                        active
                          ? 'border-yellow-400 ring-2 ring-yellow-400/35'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCurIndex(idx)}
                        className="block w-full text-left cursor-pointer"
                      >
                        <img
                          src={item.thumbUrl}
                          alt={item.name}
                          className="w-24 h-16 object-cover bg-zinc-900"
                        />
                        <p className="px-1.5 py-1 text-[10px] font-medium text-zinc-800 dark:text-zinc-200 truncate bg-zinc-50 dark:bg-zinc-950">
                          {item.name}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveItem(item.id, idx);
                        }}
                        aria-label={`Remove ${item.name}`}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 5-Tab Professional Inspector */}
        <div className="xl:col-span-5 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
          {/* Segmented Tab Navigation */}
          <div
            role="tablist"
            aria-label="Photo batch editing sections"
            className="grid grid-cols-5 gap-1 p-1.5 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800"
          >
            {(
              [
                { id: 'presets', label: 'Presets' },
                { id: 'adjust', label: 'Adjust' },
                { id: 'effects', label: 'Effects' },
                { id: 'marks', label: 'Marks' },
                { id: 'export', label: 'Export' },
              ] as const
            ).map((t) => {
              const on = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActiveTab(t.id)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    on
                      ? 'bg-yellow-400 text-black shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 sm:p-5 space-y-5 max-h-[680px] overflow-y-auto">
            {/* ===================================== */}
            {/* TAB 1: PRESETS & SAVED RECIPE LIBRARY */}
            {/* ===================================== */}
            {activeTab === 'presets' && (
              <div className="space-y-5">
                {/* Save Current Setup as Reusable Preset */}
                <form
                  onSubmit={(e) => void handleSavePreset(e)}
                  className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      <span>Save Current Recipe as Preset</span>
                    </h3>
                    <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      {userEmail ? 'Cloud & Device Sync' : 'Saved on Device'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="Preset name (e.g. Stage Golden Look)"
                      maxLength={80}
                      className="sm:col-span-7 px-3 py-2 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                    />
                    <select
                      value={presetCategory}
                      onChange={(e) => setPresetCategory(e.target.value as PhotoBatchPresetCategory)}
                      aria-label="Preset category"
                      className="sm:col-span-5 px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                    >
                      {PRESET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={presetIncludeMarks}
                        onChange={(e) => setPresetIncludeMarks(e.target.checked)}
                        className="accent-yellow-400"
                      />
                      <span>Include active watermarks</span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSavingPreset}
                      className="px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isSavingPreset ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Save Preset</span>
                    </button>
                  </div>
                </form>

                {/* Saved User Presets List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">
                      Your Saved Presets ({savedPresets.length})
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => presetImportRef.current?.click()}
                        className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <FolderUp className="w-3 h-3" />
                        <span>Import</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPresetPack}
                        className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export JSON</span>
                      </button>
                    </div>
                  </div>

                  {savedPresets.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {(['All', ...PRESET_CATEGORIES] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPresetFilterCat(cat)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                            presetFilterCat === cat
                              ? 'bg-zinc-900 dark:bg-yellow-400 text-white dark:text-black font-bold'
                              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {filteredSavedPresets.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 py-2">
                      {savedPresets.length === 0
                        ? 'No saved presets yet. Dial in your look, tone, vignette, or frame and save it above for 1-click batch reuse.'
                        : 'No saved presets in this category.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredSavedPresets.map((preset) => {
                        const lookLabel =
                          PHOTO_BATCH_LOOKS.find((l) => l.id === preset.setup.filter?.preset)?.name ||
                          'Custom';
                        const isApplied = appliedPresetId === preset.id;
                        return (
                          <div
                            key={preset.id}
                            className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-2.5 ${
                              isApplied
                                ? 'border-yellow-400 bg-yellow-400/10'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleApplySavedPreset(preset)}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                {isApplied && (
                                  <Check className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                                )}
                                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                  {preset.name}
                                </p>
                              </div>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                {preset.category} · {lookLabel}
                                {preset.setup.vignette?.on ? ' · Vignette' : ''}
                                {preset.setup.frame?.enabled ? ' · Mat Frame' : ''}
                                {preset.includeMarks ? ` · ${preset.setup.marks?.length || 0} Marks` : ''}
                              </p>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleOverwritePreset(preset)}
                                title="Overwrite preset with current edits"
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSavedPreset(preset)}
                                title="Delete preset"
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-red-400 text-zinc-500 hover:text-red-500 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Built-in Live-Rendered Look Grid */}
                <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">
                      Built-in Curated Looks ({PHOTO_BATCH_LOOKS.length})
                    </h3>
                    <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                      {setup.filter.intensity}% strength
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-3 gap-2">
                    {PHOTO_BATCH_LOOKS.map((look) => {
                      const active = setup.filter.preset === look.id;
                      return (
                        <button
                          key={look.id}
                          type="button"
                          onClick={() => {
                            setAppliedPresetId(null);
                            updateSetup((prev) => ({
                              ...prev,
                              filter: { ...prev.filter, preset: look.id },
                            }));
                          }}
                          className={`rounded-xl border overflow-hidden text-left cursor-pointer transition-all ${
                            active
                              ? 'border-yellow-400 ring-2 ring-yellow-400/40 bg-yellow-400/10'
                              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400'
                          }`}
                        >
                          <canvas
                            ref={(el) => {
                              lookThumbCanvasRefs.current[look.id] = el;
                            }}
                            width={112}
                            height={78}
                            className="w-full h-14 object-cover bg-zinc-900 block"
                          />
                          <div className="px-2 py-1 text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                            {look.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {renderSlider(
                    'Look Strength',
                    setup.filter.intensity,
                    0,
                    100,
                    1,
                    '%',
                    (val) =>
                      updateSetup((prev) => ({
                        ...prev,
                        filter: { ...prev.filter, intensity: val },
                      })),
                    100
                  )}
                </div>
              </div>
            )}

            {/* ===================================== */}
            {/* TAB 2: LIGHT, COLOUR & CLARITY        */}
            {/* ===================================== */}
            {activeTab === 'adjust' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleAutoEnhance}
                    className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto Tone Balance</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateSetup((prev) => ({
                        ...prev,
                        adjust: {
                          ...createDefaultPhotoBatchSetup().adjust,
                          sharpen: prev.adjust.sharpen,
                        },
                      }))
                    }
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    Reset Light &amp; Color
                  </button>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Light &amp; Exposure
                  </p>
                  {renderSlider('Exposure', setup.adjust.exposure, -100, 100, 1, '', (v) =>
                    setAdjustField('exposure', v)
                  )}
                  {renderSlider('Brightness', setup.adjust.brightness, -100, 100, 1, '', (v) =>
                    setAdjustField('brightness', v)
                  )}
                  {renderSlider('Contrast', setup.adjust.contrast, -100, 100, 1, '', (v) =>
                    setAdjustField('contrast', v)
                  )}
                  {renderSlider('Highlights', setup.adjust.highlights, -100, 100, 1, '', (v) =>
                    setAdjustField('highlights', v)
                  )}
                  {renderSlider('Shadows', setup.adjust.shadows, -100, 100, 1, '', (v) =>
                    setAdjustField('shadows', v)
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Color &amp; Detail
                  </p>
                  {renderSlider('Vibrance', setup.adjust.vibrance, -100, 100, 1, '', (v) =>
                    setAdjustField('vibrance', v)
                  )}
                  {renderSlider('Saturation', setup.adjust.saturation, -100, 100, 1, '', (v) =>
                    setAdjustField('saturation', v)
                  )}
                  {renderSlider('Warmth', setup.adjust.temperature, -100, 100, 1, '', (v) =>
                    setAdjustField('temperature', v)
                  )}
                  {renderSlider('Tint', setup.adjust.tint, -100, 100, 1, '', (v) =>
                    setAdjustField('tint', v)
                  )}
                  {renderSlider('Clarity', setup.adjust.clarity, 0, 100, 1, '', (v) =>
                    setAdjustField('clarity', v)
                  )}
                  {renderSlider('Sharpen', setup.adjust.sharpen, 0, 100, 1, '', (v) =>
                    setAdjustField('sharpen', v)
                  )}
                  {renderSlider('Matte Fade', setup.adjust.fade, 0, 100, 1, '', (v) =>
                    setAdjustField('fade', v)
                  )}
                  {renderSlider('Black & White', setup.adjust.grayscale, 0, 100, 1, '%', (v) =>
                    setAdjustField('grayscale', v)
                  )}
                  {renderSlider('Sepia', setup.adjust.sepia, 0, 100, 1, '%', (v) =>
                    setAdjustField('sepia', v)
                  )}
                </div>
              </div>
            )}

            {/* ===================================== */}
            {/* TAB 3: VIGNETTE, FILM GRAIN & FRAME   */}
            {/* ===================================== */}
            {activeTab === 'effects' && (
              <div className="space-y-5">
                {/* Vignette */}
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      Lens Vignette
                    </span>
                    <input
                      type="checkbox"
                      checked={setup.vignette.on}
                      onChange={(e) =>
                        updateSetup((prev) => ({
                          ...prev,
                          vignette: { ...prev.vignette, on: e.target.checked },
                        }))
                      }
                      className="accent-yellow-400"
                    />
                  </label>

                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(VIGNETTE_PROFILES) as Array<keyof typeof VIGNETTE_PROFILES>).map(
                      (key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            updateSetup((prev) => ({
                              ...prev,
                              vignette: { ...prev.vignette, ...VIGNETTE_PROFILES[key], on: true },
                            }))
                          }
                          className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-yellow-400 text-[11px] font-semibold capitalize text-zinc-700 dark:text-zinc-300 cursor-pointer"
                        >
                          {key}
                        </button>
                      )
                    )}
                  </div>

                  {setup.vignette.on && (
                    <div className="space-y-3 pt-1">
                      {renderSlider('Strength', setup.vignette.strength, 0, 100, 1, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          vignette: { ...prev.vignette, strength: v },
                        }))
                      )}
                      {renderSlider('Size', setup.vignette.size, 0, 100, 1, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          vignette: { ...prev.vignette, size: v },
                        }))
                      )}
                      {renderSlider('Feather', setup.vignette.feather, 0, 100, 1, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          vignette: { ...prev.vignette, feather: v },
                        }))
                      )}
                      {renderSlider('Roundness', setup.vignette.roundness, 0, 100, 1, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          vignette: { ...prev.vignette, roundness: v },
                        }))
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Vignette Color
                        </span>
                        <input
                          type="color"
                          value={setup.vignette.color}
                          onChange={(e) =>
                            updateSetup((prev) => ({
                              ...prev,
                              vignette: { ...prev.vignette, color: e.target.value },
                            }))
                          }
                          className="w-8 h-6 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Texture & Grain */}
                <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">Texture</p>
                  {renderSlider('Film Grain', setup.grain.amount, 0, 100, 1, '', (v) =>
                    updateSetup((prev) => ({ ...prev, grain: { amount: v } }))
                  )}
                </div>

                {/* Framing & Mat Border */}
                <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white inline-flex items-center gap-1.5">
                      <Frame className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      <span>Gallery Border &amp; Mat Frame</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={setup.frame.enabled}
                      onChange={(e) =>
                        updateSetup((prev) => ({
                          ...prev,
                          frame: { ...prev.frame, enabled: e.target.checked },
                        }))
                      }
                      className="accent-yellow-400"
                    />
                  </label>

                  {setup.frame.enabled && (
                    <div className="space-y-3">
                      {renderSlider('Border Thickness', setup.frame.thickness, 0, 12, 0.5, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          frame: { ...prev.frame, thickness: v },
                        }))
                      )}
                      {renderSlider('Corner Radius', setup.frame.radius, 0, 16, 0.5, '%', (v) =>
                        updateSetup((prev) => ({
                          ...prev,
                          frame: { ...prev.frame, radius: v },
                        }))
                      )}

                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Frame Color
                        </span>
                        <div className="flex items-center gap-1.5">
                          {['#ffffff', '#f4f4f5', '#0f172a', '#000000'].map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              onClick={() =>
                                updateSetup((prev) => ({
                                  ...prev,
                                  frame: { ...prev.frame, color: swatch },
                                }))
                              }
                              style={{ backgroundColor: swatch }}
                              aria-label={`Set frame color ${swatch}`}
                              className={`w-5 h-5 rounded border cursor-pointer ${
                                setup.frame.color.toLowerCase() === swatch
                                  ? 'border-yellow-400 ring-2 ring-yellow-400/50'
                                  : 'border-zinc-300 dark:border-zinc-700'
                              }`}
                            />
                          ))}
                          <input
                            type="color"
                            value={setup.frame.color}
                            onChange={(e) =>
                              updateSetup((prev) => ({
                                ...prev,
                                frame: { ...prev.frame, color: e.target.value },
                              }))
                            }
                            className="w-7 h-5 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setup.frame.innerStroke}
                          onChange={(e) =>
                            updateSetup((prev) => ({
                              ...prev,
                              frame: { ...prev.frame, innerStroke: e.target.checked },
                            }))
                          }
                          className="accent-yellow-400"
                        />
                        <span>Subtle inner hairline border</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===================================== */}
            {/* TAB 4: MULTI-LAYER WATERMARKS         */}
            {/* ===================================== */}
            {activeTab === 'marks' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddTextMark}
                    className="flex-1 py-2 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Stamp className="w-3.5 h-3.5" />
                    <span>Add Text Mark</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLogoMark}
                    className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Add Logo Mark</span>
                  </button>
                </div>

                {setup.marks.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    No watermark layers yet. Add text or a transparent PNG logo above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {setup.marks.map((m, idx) => {
                      const selected = m.id === selectedMarkId;
                      return (
                        <div
                          key={m.id}
                          className={`rounded-xl border transition-colors ${
                            selected
                              ? 'border-yellow-400 bg-yellow-400/5'
                              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60'
                          }`}
                        >
                          <div className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={m.visible}
                                onChange={(e) => updateMark(m.id, { visible: e.target.checked })}
                                aria-label="Toggle watermark visibility"
                                className="accent-yellow-400 shrink-0"
                              />
                              <button
                                type="button"
                                onClick={() => setSelectedMarkId(selected ? null : m.id)}
                                className="min-w-0 flex-1 text-left cursor-pointer"
                              >
                                <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1.5">
                                  {m.type}
                                </span>
                                <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                  {m.type === 'text' ? m.text || '(empty)' : m.imgName || 'Choose Logo'}
                                </span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 text-[11px]">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveMark(idx, -1)}
                                title="Move layer up"
                                className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={idx === setup.marks.length - 1}
                                onClick={() => handleMoveMark(idx, 1)}
                                title="Move layer down"
                                className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateMark(m)}
                                title="Duplicate layer"
                                className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 cursor-pointer"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMark(m.id)}
                                title="Delete layer"
                                className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 hover:text-red-500 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {selected && selectedMark && (
                            <div className="px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                              {m.type === 'text' ? (
                                <>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                      Watermark Text (supports {'{index}'}, {'{total}'}, {'{name}'})
                                    </label>
                                    <input
                                      type="text"
                                      value={m.text}
                                      onChange={(e) => updateMark(m.id, { text: e.target.value })}
                                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <select
                                      value={m.font}
                                      onChange={(e) => updateMark(m.id, { font: e.target.value })}
                                      className="col-span-2 px-2 py-1.5 text-xs bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white"
                                    >
                                      {MARK_FONT_OPTIONS.map((f) => (
                                        <option key={f} value={f}>
                                          {f}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="color"
                                      value={m.color}
                                      onChange={(e) => updateMark(m.id, { color: e.target.value })}
                                      aria-label="Watermark color"
                                      className="w-full h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                    {m.imgName || 'No logo file selected'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      logoTargetIdRef.current = m.id;
                                      logoInputRef.current?.click();
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-semibold cursor-pointer shrink-0"
                                  >
                                    Choose Logo
                                  </button>
                                </div>
                              )}

                              {renderSlider(
                                m.type === 'text' ? 'Size (% width)' : 'Logo Width (%)',
                                m.size,
                                m.type === 'text' ? 1 : 3,
                                m.type === 'text' ? 20 : 65,
                                0.5,
                                '%',
                                (v) => updateMark(m.id, { size: v })
                              )}
                              {renderSlider('Opacity', m.opacity, 5, 100, 1, '%', (v) =>
                                updateMark(m.id, { opacity: v })
                              )}
                              {renderSlider('Rotation', m.rotation, -90, 90, 1, '°', (v) =>
                                updateMark(m.id, { rotation: v })
                              )}

                              <div className="flex items-center justify-between gap-3 text-xs">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={m.tile}
                                    onChange={(e) => updateMark(m.id, { tile: e.target.checked })}
                                    className="accent-yellow-400"
                                  />
                                  <span>Repeat Tiled</span>
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={m.shadow}
                                    onChange={(e) => updateMark(m.id, { shadow: e.target.checked })}
                                    className="accent-yellow-400"
                                  />
                                  <span>Soft Shadow</span>
                                </label>
                              </div>

                              {m.tile ? (
                                renderSlider('Tile Spacing', m.gap, 0, 40, 0.5, '%', (v) =>
                                  updateMark(m.id, { gap: v })
                                )
                              ) : (
                                <>
                                  {renderSlider('Edge Margin', m.margin, 0, 12, 0.2, '%', (v) =>
                                    updateMark(m.id, { margin: v })
                                  )}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                      <span>9-Point Position</span>
                                      <span>Or drag directly on canvas</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 w-24">
                                      {(Object.keys(ANCHOR_LABELS) as Array<Exclude<PhotoBatchAnchor, 'custom'>>).map(
                                        (anc) => (
                                          <button
                                            key={anc}
                                            type="button"
                                            title={ANCHOR_LABELS[anc]}
                                            onClick={() => updateMark(m.id, { anchor: anc })}
                                            className={`h-6 rounded border cursor-pointer transition-colors ${
                                              m.anchor === anc
                                                ? 'border-yellow-400 bg-yellow-400'
                                                : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400'
                                            }`}
                                          />
                                        )
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===================================== */}
            {/* TAB 5: BATCH EXPORT & ZIP BUILDER     */}
            {/* ===================================== */}
            {activeTab === 'export' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Format
                    </label>
                    <select
                      value={setup.out.format}
                      onChange={(e) =>
                        updateSetup((prev) => ({
                          ...prev,
                          out: { ...prev.out, format: e.target.value as 'jpeg' | 'png' | 'webp' },
                        }))
                      }
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    >
                      <option value="jpeg">JPEG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Longest Side
                    </label>
                    <select
                      value={setup.out.maxSide}
                      onChange={(e) =>
                        updateSetup((prev) => ({
                          ...prev,
                          out: { ...prev.out, maxSide: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    >
                      <option value={0}>Original size</option>
                      <option value={4096}>4096 px</option>
                      <option value={3000}>3000 px</option>
                      <option value={2048}>2048 px</option>
                      <option value={1600}>1600 px</option>
                      <option value={1080}>1080 px</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Batch Aspect Crop
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Original' },
                        { id: '1:1', label: '1:1' },
                        { id: '4:5', label: '4:5' },
                        { id: '16:9', label: '16:9' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          updateSetup((prev) => ({
                            ...prev,
                            out: { ...prev.out, aspectCrop: c.id },
                          }))
                        }
                        className={`py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                          setup.out.aspectCrop === c.id
                            ? 'border-yellow-400 bg-yellow-400 text-black'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {setup.out.format !== 'png' &&
                  renderSlider('Compression Quality', setup.out.quality, 50, 100, 1, '%', (v) =>
                    updateSetup((prev) => ({ ...prev, out: { ...prev.out, quality: v } }))
                  )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Filename Prefix
                    </label>
                    <input
                      type="text"
                      value={setup.out.prefix}
                      onChange={(e) =>
                        updateSetup((prev) => ({ ...prev, out: { ...prev.out, prefix: e.target.value } }))
                      }
                      placeholder="none"
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Filename Suffix
                    </label>
                    <input
                      type="text"
                      value={setup.out.suffix}
                      onChange={(e) =>
                        updateSetup((prev) => ({ ...prev, out: { ...prev.out, suffix: e.target.value } }))
                      }
                      placeholder="_edited"
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      ZIP Name
                    </label>
                    <input
                      type="text"
                      value={setup.out.zipName}
                      onChange={(e) =>
                        updateSetup((prev) => ({ ...prev, out: { ...prev.out, zipName: e.target.value } }))
                      }
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Photos per ZIP
                    </label>
                    <select
                      value={setup.out.perZip}
                      onChange={(e) =>
                        updateSetup((prev) => ({ ...prev, out: { ...prev.out, perZip: Number(e.target.value) } }))
                      }
                      className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    >
                      <option value={0}>All in one</option>
                      <option value={50}>50 per ZIP</option>
                      <option value={100}>100 per ZIP</option>
                      <option value={200}>200 per ZIP</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-1 tabular-nums">
                  <p>
                    <strong className="text-zinc-900 dark:text-white">{items.length}</strong> photos →{' '}
                    <strong className="text-zinc-900 dark:text-white">
                      {items.length
                        ? setup.out.perZip > 0
                          ? Math.ceil(items.length / setup.out.perZip)
                          : 1
                        : 0}
                    </strong>{' '}
                    ZIP archive(s)
                  </p>
                  <p>
                    Look: <strong className="text-zinc-900 dark:text-white">{activeLook.name}</strong> ·{' '}
                    {setup.out.format.toUpperCase()}
                    {setup.out.format === 'png' ? '' : ` ${setup.out.quality}%`} ·{' '}
                    {setup.out.maxSide ? `${setup.out.maxSide} px max` : 'Original size'}
                  </p>
                </div>

                {isExporting && exportProgress && (
                  <div className="space-y-2">
                    <RobotProgressBar
                      percent={exportProgress.percent}
                      status={exportProgress.status}
                      subText="Applying batch recipe locally in your browser"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        cancelExportRef.current = true;
                      }}
                      className="w-full py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-500 cursor-pointer"
                    >
                      Cancel Batch Export
                    </button>
                  </div>
                )}

                {exportError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{exportError}</p>
                )}

                <button
                  type="button"
                  disabled={!items.length || isExporting}
                  onClick={() => void handleRunBatchExport()}
                  className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                  <span>
                    {items.length
                      ? `Export Edited Batch (${items.length} ${items.length === 1 ? 'Photo' : 'Photos'})`
                      : 'Add Photos to Export ZIP'}
                  </span>
                </button>

                {exportParts.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    {exportParts.map((part) => (
                      <div
                        key={part.id}
                        className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-zinc-900 dark:text-white truncate">
                            {part.name}
                          </p>
                          <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                            {part.count} photos · {formatBytes(part.blob.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => triggerDownload(part.blob, part.name)}
                          className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Save ZIP</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {exportFailedFiles.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Skipped {exportFailedFiles.length} unreadable file(s):{' '}
                    {exportFailedFiles.slice(0, 4).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
