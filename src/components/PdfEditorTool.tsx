import React, { useEffect, useRef, useState } from 'react';
import {
  Type,
  Image as ImageIcon,
  Highlighter,
  Square,
  Stamp,
  PenTool,
  Trash2,
  Copy,
  Layers,
  Download,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Undo2,
  RotateCw,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Loader2,
  CheckCircle2,
  Upload,
  Maximize2,
  Eye,
  ShieldCheck,
  History,
  PanelLeft,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import {
  PdfEditElement,
  PdfEditorFont,
  PdfTextEditElement,
  PdfImageEditElement,
  PdfShapeEditElement,
  PdfStampEditElement,
  PdfPageThumb,
  applyPdfEdits,
  inspectPdfThumbnails,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';
import {
  PdfEditorSidebarPanels,
  SIDEBAR_TOOL_GROUPS,
  SidebarToolSection,
} from './PdfEditorSidebarPanels';

interface PdfEditorToolProps {
  externalFile?: File | null;
  onExternalFileConsumed?: () => void;
  onOpenInCoverStudio: (blob: Blob, fileName: string) => void;
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
}

interface PdfRevisionItem {
  file: File;
  label: string;
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

const STAMP_PRESETS = [
  { text: 'APPROVED', color: '#16a34a' },
  { text: 'CONFIDENTIAL', color: '#dc2626' },
  { text: 'DRAFT', color: '#d97706' },
  { text: 'VERIFIED', color: '#2563eb' },
  { text: 'PAID', color: '#059669' },
];

export const PdfEditorTool: React.FC<PdfEditorToolProps> = ({
  externalFile,
  onExternalFileConsumed,
  onOpenInCoverStudio,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onTaskComplete,
  onPreviewDocument,
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const picInputRef = useRef<HTMLInputElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const drawPadRef = useRef<HTMLCanvasElement>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<PdfRevisionItem[]>([]);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [pageThumbs, setPageThumbs] = useState<PdfPageThumb[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [elements, setElements] = useState<PdfEditElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSection, setSidebarSection] = useState<SidebarToolSection>('canvas');
  const [canvasWidthPx, setCanvasWidthPx] = useState(520);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [drawColor, setDrawColor] = useState('#0f172a');
  const [hasDrawnInk, setHasDrawnInk] = useState(false);
  const isDrawingInkRef = useRef(false);
  const [lastSavedStatus, setLastSavedStatus] = useState<string | null>(null);

  const dragStateRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origFontSize?: number;
    kind: PdfEditElement['kind'];
    lockAspect: boolean;
  } | null>(null);

  const loadPdfVisualState = async (file: File, preservePage = false) => {
    const buf = await file.arrayBuffer();
    const previews = await renderPdfPages(buf, 30);
    if (previews.length === 0) {
      throw new Error('No renderable pages found in this PDF.');
    }
    const thumbs = await inspectPdfThumbnails(file);
    setSourceFile(file);
    setPagePreviews(previews);
    setPageThumbs(thumbs);
    setCurrentPage((prev) => (preservePage ? Math.min(previews.length, Math.max(1, prev)) : 1));
  };

  const handleLoadPdf = async (file: File) => {
    onError(null);
    setLastSavedStatus(null);
    setElements([]);
    setSelectedId(null);
    setRevisionHistory([]);
    setIsWorking(true);
    onProgress({ percent: 25, status: 'Loading PDF into Parent Edit Studio...' });
    try {
      await loadPdfVisualState(file, false);
    } catch (err: any) {
      onError(err?.message || 'Failed to load PDF pages for editing.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  // Accept handoffs from other standalone tabs
  useEffect(() => {
    if (externalFile) {
      void handleLoadPdf(externalFile);
      onExternalFileConsumed?.();
    }
  }, [externalFile]);

  // Measure rendered PDF canvas width so text font-size previews stay 1:1 with exported PDF points
  useEffect(() => {
    const el = canvasHostRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setCanvasWidthPx(rect.width);
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [pagePreviews.length, currentPage]);

  // Global pointer drag & resize handlers
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      const host = canvasHostRef.current;
      if (!ds || !host) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dxFrac = (e.clientX - ds.startX) / rect.width;
      const dyFrac = (e.clientY - ds.startY) / rect.height;

      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== ds.id) return item;
          if (ds.mode === 'move') {
            const nx = Math.max(0, Math.min(1 - item.widthFraction, ds.origX + dxFrac));
            const ny = Math.max(0, Math.min(1 - item.heightFraction, ds.origY + dyFrac));
            return { ...item, xFraction: nx, yFraction: ny };
          }

          let nextW = Math.max(0.06, Math.min(1 - ds.origX, ds.origW + dxFrac));
          let nextH = Math.max(0.035, Math.min(1 - ds.origY, ds.origH + dyFrac));

          if (ds.lockAspect && ds.origW > 0) {
            const ratio = ds.origH / ds.origW;
            nextH = Math.max(0.035, nextW * ratio);
            if (ds.origY + nextH > 1) {
              nextH = 1 - ds.origY;
              nextW = nextH / ratio;
            }
          }

          if (item.kind === 'text' && ds.origFontSize) {
            const scaleFactor = nextW / Math.max(0.05, ds.origW);
            const scaledFont = Math.round(Math.max(8, Math.min(84, ds.origFontSize * scaleFactor)));
            return {
              ...item,
              widthFraction: nextW,
              heightFraction: nextH,
              fontSize: scaledFont,
            };
          }

          return {
            ...item,
            widthFraction: nextW,
            heightFraction: nextH,
          };
        })
      );
      setLastSavedStatus(null);
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  /**
   * Ensures all pending visual canvas overlays (text, pictures, ink, shapes, stamps)
   * are baked into a single unified workingFile before running sidebar transforms or exporting.
   */
  const ensureCommittedFile = async (): Promise<File | null> => {
    if (!sourceFile) return null;
    if (elements.length === 0) return sourceFile;

    onProgress({ percent: 20, status: 'Flattening visual edits onto active PDF...' });
    const res = await applyPdfEdits(sourceFile, elements, (percent, status) =>
      onProgress({ percent: Math.round(percent * 0.5), status })
    );
    const bakedFile = new File([res.blob], sourceFile.name, { type: 'application/pdf' });
    setRevisionHistory((prev) => [...prev, { file: sourceFile, label: 'Before visual overlay bake' }]);
    setElements([]);
    setSelectedId(null);
    await loadPdfVisualState(bakedFile, true);
    return bakedFile;
  };

  /**
   * Replaces workingFile after any sidebar transformation (Compress, Watermark Remove/Add,
   * Rotate/Delete, Merge, Split, Office Import) while pushing previous state onto Undo History.
   */
  const commitTransformedFile = async (newFile: File, historyLabel: string) => {
    if (sourceFile) {
      setRevisionHistory((prev) => [...prev, { file: sourceFile, label: historyLabel }]);
    }
    setElements([]);
    setSelectedId(null);
    await loadPdfVisualState(newFile, true);
    setLastSavedStatus(`${historyLabel} applied (${formatBytes(newFile.size)})`);
  };

  const handleUndoPdfRevision = async () => {
    if (revisionHistory.length === 0 || isWorking) return;
    const prevItem = revisionHistory[revisionHistory.length - 1];
    onError(null);
    setIsWorking(true);
    onProgress({ percent: 45, status: `Reverting "${prevItem.label}"...` });
    try {
      setRevisionHistory((prev) => prev.slice(0, -1));
      setElements([]);
      setSelectedId(null);
      await loadPdfVisualState(prevItem.file, true);
      setLastSavedStatus(`Reverted ${prevItem.label}`);
    } catch (err: any) {
      onError(err?.message || 'Could not revert PDF revision.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const selectedElement = elements.find((el) => el.id === selectedId) || null;
  const pageElements = elements.filter((el) => el.pageNumber === currentPage);

  const updateSelected = (updater: (el: PdfEditElement) => PdfEditElement) => {
    if (!selectedId) return;
    setElements((prev) => prev.map((el) => (el.id === selectedId ? updater(el) : el)));
    setLastSavedStatus(null);
  };

  const handleAddText = () => {
    if (!sourceFile) return;
    const id = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const el: PdfTextEditElement = {
      id,
      kind: 'text',
      pageNumber: currentPage,
      xFraction: 0.14,
      yFraction: 0.18,
      widthFraction: 0.42,
      heightFraction: 0.08,
      text: 'New Text Block',
      fontSize: 18,
      fontFamily: 'helvetica',
      bold: false,
      italic: false,
      color: '#09090b',
      backgroundColor: 'transparent',
      align: 'left',
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(id);
    setSidebarSection('canvas');
    setLastSavedStatus(null);
  };

  const handleAddPictureFile = (file: File) => {
    if (!sourceFile) {
      onError('Open or import a PDF first before placing pictures onto pages.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawUrl = ev.target?.result as string;
      if (!rawUrl) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 300;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const cleanDataUrl =
          file.type === 'image/jpeg' ? rawUrl : canvas.toDataURL('image/png');

        const wFrac = 0.32;
        const aspect = (img.naturalHeight || 300) / Math.max(1, img.naturalWidth || 400);
        const hFrac = Math.min(0.65, Math.max(0.06, wFrac * aspect * 0.707));
        const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newImg: PdfImageEditElement = {
          id,
          kind: 'image',
          pageNumber: currentPage,
          xFraction: 0.28,
          yFraction: 0.25,
          widthFraction: wFrac,
          heightFraction: hFrac,
          dataUrl: cleanDataUrl,
          opacity: 1,
          label: file.name,
        };
        setElements((prev) => [...prev, newImg]);
        setSelectedId(id);
        setSidebarSection('canvas');
        setLastSavedStatus(null);
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleRotateSelectedPicture = () => {
    if (!selectedElement || selectedElement.kind !== 'image') return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight || img.height;
      canvas.height = img.naturalWidth || img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const rotatedUrl = canvas.toDataURL('image/png');
      updateSelected((el) =>
        el.kind === 'image'
          ? {
              ...el,
              dataUrl: rotatedUrl,
              widthFraction: Math.min(0.85, Math.max(0.08, el.heightFraction * 1.3)),
              heightFraction: Math.min(0.85, Math.max(0.06, el.widthFraction * 0.75)),
            }
          : el
      );
    };
    img.src = selectedElement.dataUrl;
  };

  const handleAddShape = (kind: PdfShapeEditElement['shapeKind']) => {
    if (!sourceFile) return;
    const id = `shp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const defaults: Record<PdfShapeEditElement['shapeKind'], Partial<PdfShapeEditElement>> = {
      highlight: {
        fillColor: '#facc15',
        strokeColor: '#eab308',
        opacity: 0.38,
        widthFraction: 0.45,
        heightFraction: 0.045,
      },
      redact: {
        fillColor: '#ffffff',
        strokeColor: '#e4e4e7',
        opacity: 1,
        widthFraction: 0.35,
        heightFraction: 0.06,
      },
      outline: {
        fillColor: 'transparent',
        strokeColor: '#dc2626',
        strokeWidth: 2.5,
        opacity: 1,
        widthFraction: 0.36,
        heightFraction: 0.14,
      },
    };
    const cfg = defaults[kind];
    const el: PdfShapeEditElement = {
      id,
      kind: 'shape',
      pageNumber: currentPage,
      xFraction: 0.2,
      yFraction: 0.32,
      widthFraction: cfg.widthFraction || 0.35,
      heightFraction: cfg.heightFraction || 0.08,
      shapeKind: kind,
      fillColor: cfg.fillColor || '#ffffff',
      strokeColor: cfg.strokeColor || '#09090b',
      strokeWidth: cfg.strokeWidth || 2,
      opacity: cfg.opacity ?? 1,
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(id);
    setSidebarSection('canvas');
    setLastSavedStatus(null);
  };

  const handleAddStamp = (preset: { text: string; color: string }) => {
    if (!sourceFile) return;
    const id = `stm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const el: PdfStampEditElement = {
      id,
      kind: 'stamp',
      pageNumber: currentPage,
      xFraction: 0.6,
      yFraction: 0.12,
      widthFraction: 0.28,
      heightFraction: 0.075,
      text: preset.text,
      color: preset.color,
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(id);
    setSidebarSection('canvas');
    setLastSavedStatus(null);
  };

  const handleInsertInkDrawing = () => {
    const pad = drawPadRef.current;
    if (!pad || !hasDrawnInk) return;
    const dataUrl = pad.toDataURL('image/png');
    const id = `ink_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newInk: PdfImageEditElement = {
      id,
      kind: 'image',
      pageNumber: currentPage,
      xFraction: 0.3,
      yFraction: 0.65,
      widthFraction: 0.32,
      heightFraction: 0.12,
      dataUrl,
      opacity: 1,
      label: 'Freehand Annotation',
    };
    setElements((prev) => [...prev, newInk]);
    setSelectedId(id);
    setSidebarSection('canvas');
    setShowDrawModal(false);
    setHasDrawnInk(false);
    setLastSavedStatus(null);
  };

  const handleCopyToAllPages = () => {
    if (!selectedElement || pagePreviews.length <= 1) return;
    const copies: PdfEditElement[] = [];
    for (let p = 1; p <= pagePreviews.length; p++) {
      if (p === selectedElement.pageNumber) continue;
      copies.push({
        ...selectedElement,
        id: `${selectedElement.kind}_p${p}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        pageNumber: p,
      });
    }
    setElements((prev) => [...prev, ...copies]);
    setLastSavedStatus(null);
  };

  const handleExportOrSavePdf = async (action: 'download' | 'preview' | 'cover' | 'bake') => {
    if (!sourceFile) return;
    onError(null);
    setIsWorking(true);
    try {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      const outName = committed.name.endsWith('.pdf')
        ? committed.name.replace(/\.pdf$/i, '_edited.pdf')
        : `${committed.name}_edited.pdf`;

      if (action === 'bake') {
        setLastSavedStatus(`Visual overlays saved into active PDF (${formatBytes(committed.size)})`);
      } else if (action === 'download') {
        triggerDownload(committed, outName);
        setLastSavedStatus(`Downloaded ${outName}`);
        onTaskComplete?.({
          headline: 'Edited PDF Exported Successfully',
          subtext: `${outName} (${pagePreviews.length} pages) saved to your device.`,
          statusLabel: 'PDF Editor Export',
        });
      } else if (action === 'preview' && onPreviewDocument) {
        onPreviewDocument({
          title: outName,
          fileName: outName,
          blob: committed,
          subtitle: `Parent Edit PDF · ${pagePreviews.length} pages`,
        });
      } else if (action === 'cover') {
        onOpenInCoverStudio(committed, outName);
      }
    } catch (err: any) {
      onError(err?.message || 'Failed to finalize PDF.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden global inputs */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleLoadPdf(f);
          e.target.value = '';
        }}
      />
      <input
        ref={picInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAddPictureFile(f);
          e.target.value = '';
        }}
      />

      {/* Parent Workspace Master Header */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-yellow-400/80 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 text-[11px] font-bold">
                <PanelLeft className="w-3 h-3" />
                <span>Parent PDF Studio</span>
              </span>
              {sourceFile && (
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate max-w-xs sm:max-w-md tabular-nums">
                  {sourceFile.name} · {pagePreviews.length}p · {formatBytes(sourceFile.size)}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white mt-1.5">
              All-in-One Edit PDF Workspace — Apply Every Change on One Single PDF
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Use the sidebar tools to edit text, pictures, signatures, clean watermarks, rotate/merge/split pages, compress, encrypt, or export without re-uploading.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {revisionHistory.length > 0 && (
              <button
                type="button"
                disabled={isWorking}
                onClick={handleUndoPdfRevision}
                title={`Undo: ${revisionHistory[revisionHistory.length - 1]?.label}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <History className="w-3.5 h-3.5 text-amber-500" />
                <span>Undo PDF ({revisionHistory.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-zinc-900 dark:text-white font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-yellow-500" />
              <span>{sourceFile ? 'Switch PDF' : 'Open PDF'}</span>
            </button>

            {sourceFile && (
              <>
                {onPreviewDocument && (
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => void handleExportOrSavePdf('preview')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-400/60 bg-cyan-50/70 dark:bg-cyan-950/30 hover:bg-cyan-400/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void handleExportOrSavePdf('download')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>
                    Download PDF{elements.length > 0 ? ` (+${elements.length})` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void handleExportOrSavePdf('cover')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-yellow-300 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>QR Cover</span>
                </button>
              </>
            )}
          </div>
        </div>

        {lastSavedStatus && (
          <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{lastSavedStatus}</span>
          </div>
        )}
      </div>

      {/* Main Split Workspace: Left Proper Sidebar + Right Interactive PDF Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT ALL-IN-ONE SIDEBAR */}
        <aside className="lg:col-span-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-4 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                All PDF &amp; Office Tools
              </span>
              {selectedElement && sidebarSection !== 'canvas' && (
                <button
                  type="button"
                  onClick={() => setSidebarSection('canvas')}
                  className="text-[11px] font-bold text-amber-600 dark:text-yellow-400 hover:underline cursor-pointer"
                >
                  Edit Selected Layer
                </button>
              )}
            </div>

            {SIDEBAR_TOOL_GROUPS.map((group) => (
              <div key={group.groupLabel} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-0.5">
                  {group.groupLabel}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = sidebarSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSidebarSection(item.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold text-left border transition-colors cursor-pointer ${
                          active
                            ? 'bg-yellow-400 text-black border-yellow-400 font-bold shadow-xs'
                            : 'bg-zinc-50 dark:bg-zinc-950/70 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400/70'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            {sidebarSection !== 'canvas' ? (
              <PdfEditorSidebarPanels
                activeSection={sidebarSection}
                workingFile={sourceFile}
                pageCount={pagePreviews.length}
                currentPage={currentPage}
                pageThumbs={pageThumbs}
                setPageThumbs={setPageThumbs}
                isWorking={isWorking}
                setIsWorking={setIsWorking}
                onError={onError}
                onProgress={onProgress}
                ensureCommittedFile={ensureCommittedFile}
                commitTransformedFile={commitTransformedFile}
                onInsertPictureFile={handleAddPictureFile}
                onOpenSignatureModal={() => setShowDrawModal(true)}
                onAddStampPreset={handleAddStamp}
                onPreviewDocument={onPreviewDocument}
                onTaskComplete={onTaskComplete}
              />
            ) : (
              /* CANVAS & ELEMENT INSPECTOR PANEL */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    {selectedElement
                      ? `Editing ${selectedElement.kind}`
                      : 'Element Inspector'}
                  </h3>
                  {selectedElement && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const clone: PdfEditElement = {
                            ...selectedElement,
                            id: `${selectedElement.kind}_${Date.now()}`,
                            xFraction: Math.min(0.8, selectedElement.xFraction + 0.03),
                            yFraction: Math.min(0.85, selectedElement.yFraction + 0.03),
                          };
                          setElements((prev) => [...prev, clone]);
                          setSelectedId(clone.id);
                        }}
                        title="Duplicate element"
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {pagePreviews.length > 1 && (
                        <button
                          type="button"
                          onClick={handleCopyToAllPages}
                          title="Mirror to all pages"
                          className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Layers className="w-3 h-3" />
                          <span>All</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setElements((prev) => prev.filter((e) => e.id !== selectedElement.id));
                          setSelectedId(null);
                        }}
                        title="Delete element"
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {!selectedElement ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {sourceFile
                      ? 'Use the toolbar above the page (+ Text, + Picture, Highlight, Whiteout, Freehand Ink) or click any element on the canvas to customize size, font, color, and position.'
                      : 'Open a PDF on the right — or pick "Word / Img / PPT / XLS" or "Protect PDF -> Unlock & Load" above in the sidebar to bring any file straight into this editor.'}
                  </p>
                ) : selectedElement.kind === 'text' ? (
                  <div className="space-y-3 text-xs">
                    <textarea
                      ref={textAreaRef}
                      rows={3}
                      value={selectedElement.text}
                      onChange={(e) =>
                        updateSelected((el) => (el.kind === 'text' ? { ...el, text: e.target.value } : el))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                      placeholder="Type text here..."
                    />

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                          <span>Font Size</span>
                          <span className="font-mono font-bold tabular-nums">{selectedElement.fontSize}pt</span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="72"
                          value={selectedElement.fontSize}
                          onChange={(e) =>
                            updateSelected((el) =>
                              el.kind === 'text' ? { ...el, fontSize: Number(e.target.value) } : el
                            )
                          }
                          className="w-full accent-yellow-400 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                          <span>Width</span>
                          <span className="font-mono font-bold tabular-nums">
                            {Math.round(selectedElement.widthFraction * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="92"
                          value={Math.round(selectedElement.widthFraction * 100)}
                          onChange={(e) =>
                            updateSelected((el) =>
                              el.kind === 'text'
                                ? { ...el, widthFraction: Number(e.target.value) / 100 }
                                : el
                            )
                          }
                          className="w-full accent-yellow-400 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={selectedElement.fontFamily}
                        onChange={(e) =>
                          updateSelected((el) =>
                            el.kind === 'text'
                              ? { ...el, fontFamily: e.target.value as PdfEditorFont }
                              : el
                          )
                        }
                        className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs"
                      >
                        <option value="helvetica">Sans</option>
                        <option value="times">Serif</option>
                        <option value="courier">Mono</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateSelected((el) => (el.kind === 'text' ? { ...el, bold: !el.bold } : el))
                        }
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          selectedElement.bold
                            ? 'bg-yellow-400 text-black border-yellow-400'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelected((el) =>
                            el.kind === 'text' ? { ...el, italic: !el.italic } : el
                          )
                        }
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          selectedElement.italic
                            ? 'bg-yellow-400 text-black border-yellow-400'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>

                      {(['left', 'center', 'right'] as const).map((al) => (
                        <button
                          key={al}
                          type="button"
                          onClick={() =>
                            updateSelected((el) => (el.kind === 'text' ? { ...el, align: al } : el))
                          }
                          className={`p-1.5 rounded-lg border cursor-pointer ${
                            selectedElement.align === al
                              ? 'bg-yellow-400 text-black border-yellow-400'
                              : 'border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          {al === 'left' ? (
                            <AlignLeft className="w-3.5 h-3.5" />
                          ) : al === 'center' ? (
                            <AlignCenter className="w-3.5 h-3.5" />
                          ) : (
                            <AlignRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500">Ink</span>
                        <input
                          type="color"
                          value={selectedElement.color}
                          onChange={(e) =>
                            updateSelected((el) =>
                              el.kind === 'text' ? { ...el, color: e.target.value } : el
                            )
                          }
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        {[
                          { label: 'Clear', val: 'transparent' },
                          { label: 'White', val: '#ffffff' },
                          { label: 'Highlight', val: '#fef08a' },
                        ].map((bg) => (
                          <button
                            key={bg.label}
                            type="button"
                            onClick={() =>
                              updateSelected((el) =>
                                el.kind === 'text' ? { ...el, backgroundColor: bg.val } : el
                              )
                            }
                            className={`px-2 py-1 rounded border text-[10px] cursor-pointer ${
                              selectedElement.backgroundColor === bg.val
                                ? 'border-yellow-400 bg-yellow-400/15 font-bold'
                                : 'border-zinc-200 dark:border-zinc-800'
                            }`}
                          >
                            {bg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : selectedElement.kind === 'image' ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-600 dark:text-zinc-400 truncate">
                        {selectedElement.label}
                      </span>
                      <button
                        type="button"
                        onClick={handleRotateSelectedPicture}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 font-semibold cursor-pointer shrink-0"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Rotate 90°</span>
                      </button>
                    </div>
                    <div>
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                        <span>Width</span>
                        <span className="font-mono font-bold tabular-nums">
                          {Math.round(selectedElement.widthFraction * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="92"
                        value={Math.round(selectedElement.widthFraction * 100)}
                        onChange={(e) => {
                          const newW = Number(e.target.value) / 100;
                          updateSelected((el) => {
                            if (el.kind !== 'image') return el;
                            const ratio = el.heightFraction / Math.max(0.05, el.widthFraction);
                            return {
                              ...el,
                              widthFraction: newW,
                              heightFraction: Math.min(0.9, Math.max(0.04, newW * ratio)),
                            };
                          });
                        }}
                        className="w-full accent-yellow-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                        <span>Opacity</span>
                        <span className="font-mono font-bold tabular-nums">
                          {Math.round(selectedElement.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="100"
                        value={Math.round(selectedElement.opacity * 100)}
                        onChange={(e) =>
                          updateSelected((el) =>
                            el.kind === 'image'
                              ? { ...el, opacity: Number(e.target.value) / 100 }
                              : el
                          )
                        }
                        className="w-full accent-yellow-400 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : selectedElement.kind === 'shape' ? (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'highlight' as const, label: 'Highlight', fill: '#facc15', op: 0.38 },
                        { id: 'redact' as const, label: 'Whiteout', fill: '#ffffff', op: 1 },
                        { id: 'outline' as const, label: 'Outline', fill: 'transparent', op: 1 },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updateSelected((el) =>
                              el.kind === 'shape'
                                ? { ...el, shapeKind: opt.id, fillColor: opt.fill, opacity: opt.op }
                                : el
                            )
                          }
                          className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                            selectedElement.shapeKind === opt.id
                              ? 'border-yellow-400 bg-yellow-400/15'
                              : 'border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {selectedElement.shapeKind === 'outline' ? 'Border Color' : 'Fill Color'}
                      </span>
                      <input
                        type="color"
                        value={
                          selectedElement.shapeKind === 'outline'
                            ? selectedElement.strokeColor
                            : selectedElement.fillColor === 'transparent'
                            ? '#ffffff'
                            : selectedElement.fillColor
                        }
                        onChange={(e) =>
                          updateSelected((el) =>
                            el.kind === 'shape'
                              ? el.shapeKind === 'outline'
                                ? { ...el, strokeColor: e.target.value }
                                : { ...el, fillColor: e.target.value }
                              : el
                          )
                        }
                        className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                        <span>Opacity</span>
                        <span className="font-mono font-bold tabular-nums">
                          {Math.round(selectedElement.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="100"
                        value={Math.round(selectedElement.opacity * 100)}
                        onChange={(e) =>
                          updateSelected((el) =>
                            el.kind === 'shape'
                              ? { ...el, opacity: Number(e.target.value) / 100 }
                              : el
                          )
                        }
                        className="w-full accent-yellow-400 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <input
                      type="text"
                      value={selectedElement.text}
                      onChange={(e) =>
                        updateSelected((el) => (el.kind === 'stamp' ? { ...el, text: e.target.value } : el))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-mono font-bold uppercase"
                    />
                    <div className="flex items-center gap-2">
                      {STAMP_PRESETS.map((st) => (
                        <button
                          key={st.text}
                          type="button"
                          onClick={() =>
                            updateSelected((el) =>
                              el.kind === 'stamp' ? { ...el, text: st.text, color: st.color } : el
                            )
                          }
                          className="w-5 h-5 rounded-full border border-zinc-400 cursor-pointer"
                          style={{ backgroundColor: st.color }}
                          title={st.text}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {pageElements.length > 0 && (
                  <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Page {currentPage} Overlays ({pageElements.length})
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {pageElements.map((el) => (
                        <button
                          key={el.id}
                          type="button"
                          onClick={() => setSelectedId(el.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between cursor-pointer ${
                            el.id === selectedId
                              ? 'bg-yellow-400/20 border border-yellow-400 font-bold text-zinc-900 dark:text-white'
                              : 'bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          <span className="truncate">
                            {el.kind === 'text'
                              ? `Text: ${el.text}`
                              : el.kind === 'image'
                              ? `Picture: ${el.label}`
                              : el.kind === 'stamp'
                              ? `Stamp: ${el.text}`
                              : `Shape (${el.shapeKind})`}
                          </span>
                          <span className="text-[10px] font-mono opacity-75 uppercase shrink-0 ml-2">
                            {el.kind}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {elements.length > 0 && (
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => void handleExportOrSavePdf('bake')}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-yellow-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Commit {elements.length} Overlay(s) into Active PDF</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT STAGE: CANVAS DROPZONE OR INTERACTIVE PAGE EDITOR */}
        <section className="lg:col-span-8 space-y-4">
          {!sourceFile ? (
            <div
              onClick={() => pdfInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleLoadPdf(f);
              }}
              className="bg-white dark:bg-[#121215] border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 rounded-2xl p-12 sm:p-16 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-11 h-11 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-zinc-950 dark:text-white">
                Select or drop a PDF to launch the All-in-One Editor
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                Load one PDF and perform every edit seamlessly using the left sidebar: add text &amp; pictures, sign, whiteout, clean watermarks, rotate/merge/split pages, compress, protect, or export to Word/Image/Excel/PPT.
              </p>
              <p className="mt-4 text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — 100% processed locally in your browser.</span>
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              {/* Quick Visual Canvas Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleAddText}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-yellow-300 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>+ Text</span>
                </button>

                <button
                  type="button"
                  onClick={() => picInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-yellow-300 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>+ Picture</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddShape('highlight')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                  <span>Highlight</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddShape('redact')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Whiteout</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddShape('outline')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-red-500" />
                  <span>Box</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDrawModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Draw Ink</span>
                </button>

                {elements.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setElements((prev) => prev.slice(0, -1));
                      setSelectedId(null);
                    }}
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 cursor-pointer whitespace-nowrap"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo Layer</span>
                  </button>
                )}
              </div>

              {/* Page Controls Bar */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-zinc-600 dark:text-zinc-400 truncate tabular-nums">
                  {pageElements.length} pending overlay(s) on page {currentPage}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      setSelectedId(null);
                    }}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-bold px-2 tabular-nums">
                    Page {currentPage} / {pagePreviews.length}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pagePreviews.length}
                    onClick={() => {
                      setCurrentPage((p) => Math.min(pagePreviews.length, p + 1));
                      setSelectedId(null);
                    }}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Interactive Visual Page Stage */}
              <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 sm:p-4 flex justify-center overflow-hidden">
                <div
                  ref={canvasHostRef}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setSelectedId(null);
                  }}
                  className="relative inline-block max-w-full shadow-xl border border-zinc-300 dark:border-zinc-700 bg-white select-none touch-none"
                >
                  <img
                    src={pagePreviews[currentPage - 1]}
                    alt={`PDF page ${currentPage}`}
                    className="max-h-[640px] w-auto block pointer-events-none select-none"
                  />

                  {pageElements.map((el) => {
                    const isSelected = el.id === selectedId;
                    const previewFontPx =
                      el.kind === 'text' ? Math.max(7, el.fontSize * (canvasWidthPx / 595)) : 12;

                    return (
                      <div
                        key={el.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                          dragStateRef.current = {
                            id: el.id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origX: el.xFraction,
                            origY: el.yFraction,
                            origW: el.widthFraction,
                            origH: el.heightFraction,
                            kind: el.kind,
                            lockAspect: false,
                          };
                        }}
                        onDoubleClick={() => {
                          setSidebarSection('canvas');
                          if (el.kind === 'text') textAreaRef.current?.focus();
                        }}
                        style={{
                          left: `${el.xFraction * 100}%`,
                          top: `${el.yFraction * 100}%`,
                          width: `${el.widthFraction * 100}%`,
                          height: `${el.heightFraction * 100}%`,
                        }}
                        className={`absolute cursor-move transition-shadow ${
                          isSelected
                            ? 'ring-2 ring-yellow-400 shadow-md z-20'
                            : 'hover:ring-1 hover:ring-amber-400/70 z-10'
                        }`}
                      >
                        {el.kind === 'text' && (
                          <div
                            style={{
                              fontSize: `${previewFontPx}px`,
                              lineHeight: 1.25,
                              color: el.color,
                              backgroundColor:
                                el.backgroundColor === 'transparent' ? 'transparent' : el.backgroundColor,
                              fontWeight: el.bold ? 700 : 400,
                              fontStyle: el.italic ? 'italic' : 'normal',
                              textAlign: el.align,
                              fontFamily:
                                el.fontFamily === 'times'
                                  ? 'Georgia, serif'
                                  : el.fontFamily === 'courier'
                                  ? 'monospace'
                                  : 'sans-serif',
                            }}
                            className="w-full h-full overflow-hidden p-[2px] whitespace-pre-wrap break-words"
                          >
                            {el.text || 'Empty text'}
                          </div>
                        )}

                        {el.kind === 'image' && (
                          <img
                            src={el.dataUrl}
                            alt={el.label}
                            style={{ opacity: el.opacity }}
                            className="w-full h-full object-fill pointer-events-none"
                          />
                        )}

                        {el.kind === 'shape' && (
                          <div
                            style={{
                              backgroundColor:
                                el.shapeKind === 'outline' ? 'transparent' : el.fillColor,
                              border:
                                el.shapeKind === 'outline'
                                  ? `${el.strokeWidth}px solid ${el.strokeColor}`
                                  : 'none',
                              opacity: el.opacity,
                            }}
                            className="w-full h-full"
                          />
                        )}

                        {el.kind === 'stamp' && (
                          <div
                            style={{
                              borderColor: el.color,
                              color: el.color,
                            }}
                            className="w-full h-full border-2 bg-white/90 flex items-center justify-center font-bold font-mono tracking-wider text-xs px-1 truncate"
                          >
                            {el.text.toUpperCase()}
                          </div>
                        )}

                        {isSelected && (
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              dragStateRef.current = {
                                id: el.id,
                                mode: 'resize',
                                startX: e.clientX,
                                startY: e.clientY,
                                origX: el.xFraction,
                                origY: el.yFraction,
                                origW: el.widthFraction,
                                origH: el.heightFraction,
                                origFontSize: el.kind === 'text' ? el.fontSize : undefined,
                                kind: el.kind,
                                lockAspect: el.kind === 'image',
                              };
                            }}
                            title="Drag corner to resize"
                            className="absolute -right-2 -bottom-2 w-4 h-4 rounded-sm bg-yellow-400 border-2 border-black cursor-nwse-resize shadow"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Horizontal Thumbnail Filmstrip for Multi-Page Jump */}
              {pagePreviews.length > 1 && (
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto pb-1">
                  {pagePreviews.map((thumbUrl, idx) => {
                    const pNum = idx + 1;
                    const active = currentPage === pNum;
                    return (
                      <button
                        key={pNum}
                        type="button"
                        onClick={() => {
                          setCurrentPage(pNum);
                          setSelectedId(null);
                        }}
                        className={`shrink-0 rounded-lg border p-1 transition-all cursor-pointer ${
                          active
                            ? 'border-yellow-400 bg-yellow-400/15 ring-1 ring-yellow-400'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400'
                        }`}
                      >
                        <img
                          src={thumbUrl}
                          alt={`Thumbnail page ${pNum}`}
                          className="h-14 w-auto rounded-sm object-contain bg-white"
                        />
                        <span className="block text-[10px] font-mono font-bold text-center mt-0.5 tabular-nums">
                          {pNum}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Freehand Ink Drawing Modal */}
      {showDrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Draw Freehand Annotation / Signature
              </h3>
              <div className="flex items-center gap-2">
                {['#0f172a', '#dc2626', '#2563eb', '#16a34a'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDrawColor(c)}
                    className={`w-4 h-4 rounded-full cursor-pointer ${
                      drawColor === c ? 'ring-2 ring-yellow-400' : 'border border-zinc-400'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <canvas
              ref={drawPadRef}
              width={440}
              height={180}
              onPointerDown={(e) => {
                const canvas = drawPadRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const rect = canvas.getBoundingClientRect();
                ctx.strokeStyle = drawColor;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(
                  ((e.clientX - rect.left) / rect.width) * canvas.width,
                  ((e.clientY - rect.top) / rect.height) * canvas.height
                );
                isDrawingInkRef.current = true;
              }}
              onPointerMove={(e) => {
                if (!isDrawingInkRef.current || !drawPadRef.current) return;
                const canvas = drawPadRef.current;
                const ctx = canvas.getContext('2d');
                const rect = canvas.getBoundingClientRect();
                ctx?.lineTo(
                  ((e.clientX - rect.left) / rect.width) * canvas.width,
                  ((e.clientY - rect.top) / rect.height) * canvas.height
                );
                ctx?.stroke();
                setHasDrawnInk(true);
              }}
              onPointerUp={() => {
                isDrawingInkRef.current = false;
              }}
              onPointerLeave={() => {
                isDrawingInkRef.current = false;
              }}
              className="w-full h-44 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white touch-none cursor-crosshair"
            />

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const ctx = drawPadRef.current?.getContext('2d');
                  if (ctx && drawPadRef.current) {
                    ctx.clearRect(0, 0, drawPadRef.current.width, drawPadRef.current.height);
                  }
                  setHasDrawnInk(false);
                }}
                className="text-xs text-zinc-500 hover:text-red-500 cursor-pointer"
              >
                Clear Canvas
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDrawModal(false);
                    setHasDrawnInk(false);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleInsertInkDrawing}
                  disabled={!hasDrawnInk}
                  className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer"
                >
                  Insert onto Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
