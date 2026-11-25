import React, { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Upload,
  Download,
  RotateCw,
  Trash2,
  Copy,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  CheckCircle2,
  Lock,
  Unlock,
  ShieldCheck,
  Loader2,
  Plus,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import {
  PdfPicturePlacement,
  PdfAddPicturesResult,
  PictureCornerStyle,
  applyPicturesToPdf,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';

interface PdfAddImagesToolProps {
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

interface UploadedPicAsset {
  id: string;
  name: string;
  dataUrl: string;
  aspect: number;
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

export const PdfAddImagesTool: React.FC<PdfAddImagesToolProps> = ({
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
  const stageRef = useRef<HTMLDivElement>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedPicAsset[]>([]);
  const [placements, setPlacements] = useState<PdfPicturePlacement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [result, setResult] = useState<PdfAddPicturesResult | null>(null);

  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragRef.current;
      const host = stageRef.current;
      if (!ds || !host) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dxFrac = (e.clientX - ds.startX) / rect.width;
      const dyFrac = (e.clientY - ds.startY) / rect.height;

      setPlacements((prev) =>
        prev.map((item) => {
          if (item.id !== ds.id) return item;
          if (ds.mode === 'move') {
            return {
              ...item,
              xFraction: Math.max(0, Math.min(1 - item.widthFraction, ds.origX + dxFrac)),
              yFraction: Math.max(0, Math.min(1 - item.heightFraction, ds.origY + dyFrac)),
            };
          }

          let nextW = Math.max(0.05, Math.min(1 - ds.origX, ds.origW + dxFrac));
          let nextH = Math.max(0.04, Math.min(1 - ds.origY, ds.origH + dyFrac));
          if (lockAspect && ds.origW > 0) {
            const ratio = ds.origH / ds.origW;
            nextH = Math.max(0.04, nextW * ratio);
            if (ds.origY + nextH > 1) {
              nextH = 1 - ds.origY;
              nextW = nextH / ratio;
            }
          }
          return { ...item, widthFraction: nextW, heightFraction: nextH };
        })
      );
      setResult(null);
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
  }, [lockAspect]);

  const handleLoadPdf = async (file: File) => {
    onError(null);
    setResult(null);
    setSourceFile(file);
    setPlacements([]);
    setSelectedId(null);
    setCurrentPage(1);
    setIsWorking(true);
    onProgress({ percent: 25, status: 'Rendering PDF pages to place pictures...' });
    try {
      const buf = await file.arrayBuffer();
      const previews = await renderPdfPages(buf, 24);
      if (previews.length === 0) throw new Error('No pages found in PDF.');
      setPagePreviews(previews);
    } catch (err: any) {
      onError(err?.message || 'Could not load PDF pages.');
    } finally {
      setIsWorking(false);
      onProgress(null);
    }
  };

  const placeAssetOnPage = (asset: UploadedPicAsset, targetPage = currentPage) => {
    const wFrac = 0.28;
    const hFrac = Math.min(0.6, Math.max(0.06, wFrac * asset.aspect * 0.707));
    const offset = (placements.filter((p) => p.pageNumber === targetPage).length % 4) * 0.04;
    const id = `pic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const next: PdfPicturePlacement = {
      id,
      pageNumber: targetPage,
      xFraction: Math.min(0.68, 0.34 + offset),
      yFraction: Math.min(0.7, 0.24 + offset),
      widthFraction: wFrac,
      heightFraction: hFrac,
      dataUrl: asset.dataUrl,
      rotationDeg: 0,
      opacity: 1,
      cornerStyle: 'square',
      borderWidth: 0,
      borderColor: '#09090b',
      label: asset.name,
    };
    setPlacements((prev) => [...prev, next]);
    setSelectedId(id);
    setResult(null);
  };

  const handleUploadPictures = (fileList: FileList | File[]) => {
    onError(null);
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)
    );
    if (files.length === 0) {
      onError('Select PNG, JPG, or WebP picture files.');
      return;
    }

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawUrl = String(ev.target?.result || '');
        if (!rawUrl) return;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 400;
          canvas.height = img.naturalHeight || 300;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const cleanUrl =
            file.type === 'image/jpeg' ? rawUrl : canvas.toDataURL('image/png');
          const aspect = (img.naturalHeight || 300) / Math.max(1, img.naturalWidth || 400);
          const asset: UploadedPicAsset = {
            id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            dataUrl: cleanUrl,
            aspect,
          };
          setUploadedAssets((prev) => [...prev, asset]);
          if (sourceFile) {
            placeAssetOnPage(asset, currentPage);
          }
        };
        img.src = rawUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const selected = placements.find((p) => p.id === selectedId) || null;
  const pagePlacements = placements.filter((p) => p.pageNumber === currentPage);

  const updateSelected = (updater: (item: PdfPicturePlacement) => PdfPicturePlacement) => {
    if (!selectedId) return;
    setPlacements((prev) => prev.map((p) => (p.id === selectedId ? updater(p) : p)));
    setResult(null);
  };

  const handleMirrorToAllPages = () => {
    if (!selected || pagePreviews.length <= 1) return;
    const copies: PdfPicturePlacement[] = [];
    for (let p = 1; p <= pagePreviews.length; p++) {
      if (p === selected.pageNumber) continue;
      copies.push({
        ...selected,
        id: `pic_p${p}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        pageNumber: p,
      });
    }
    setPlacements((prev) => [...prev, ...copies]);
    setResult(null);
  };

  const handleExport = async () => {
    if (!sourceFile) return;
    onError(null);
    setResult(null);
    setIsWorking(true);
    try {
      const res = await applyPicturesToPdf(sourceFile, placements, (percent, status) =>
        onProgress({ percent, status })
      );
      setResult(res);
      onTaskComplete?.({
        headline: 'Pictures Embedded Into PDF',
        subtext: `${res.picturesCount} picture${res.picturesCount === 1 ? '' : 's'} placed cleanly in ${res.fileName}`,
        statusLabel: 'Add Pictures Complete',
        downloadFile: {
          blob: res.blob,
          fileName: res.fileName,
          fileSizeBytes: res.blob.size,
          toolLabel: 'Add Pictures to PDF',
        },
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to add pictures to PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
            <span>Add Pictures to PDF — Photos, IDs, Logos &amp; Stamps</span>
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Upload a PDF, add one or multiple photos, drag &amp; resize directly on any page, set rounded/circle corners, and export cleanly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            multiple
            accept="image/png,image/jpeg,image/webp,image/bmp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleUploadPictures(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-zinc-900 dark:text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
            <span>{sourceFile ? 'Replace PDF' : '1. Select PDF'}</span>
          </button>

          <button
            type="button"
            disabled={!sourceFile}
            onClick={() => picInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>2. Upload Pictures</span>
          </button>
        </div>
      </div>

      {!sourceFile ? (
        <div
          onClick={() => pdfInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && f.name.toLowerCase().endsWith('.pdf')) void handleLoadPdf(f);
          }}
          className="bg-white dark:bg-[var(--pl-surface)] border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 rounded-2xl p-12 text-center cursor-pointer transition-colors"
        >
          <ImagePlus className="w-10 h-10 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Select or drop a PDF to add pictures onto any page
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            Ideal for inserting passport photos, scanned IDs, receipts, lab diagrams, or company logos directly onto existing forms and reports.
          </p>
          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Processed 100% locally on your device — zero uploads.</span>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive PDF Page Canvas */}
          <div className="lg:col-span-7 bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-zinc-600 dark:text-zinc-400 truncate">
                {sourceFile.name} · {pagePlacements.length} picture(s) on page {currentPage}
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

            <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 flex justify-center overflow-hidden">
              <div
                ref={stageRef}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
                className="relative inline-block max-w-full shadow-lg border border-zinc-300 dark:border-zinc-700 bg-white select-none touch-none"
              >
                <img
                  src={pagePreviews[currentPage - 1]}
                  alt={`PDF page ${currentPage}`}
                  className="max-h-[590px] w-auto block pointer-events-none select-none"
                />

                {pagePlacements.map((pic) => {
                  const isSel = pic.id === selectedId;
                  return (
                    <div
                      key={pic.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(pic.id);
                        dragRef.current = {
                          id: pic.id,
                          mode: 'move',
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: pic.xFraction,
                          origY: pic.yFraction,
                          origW: pic.widthFraction,
                          origH: pic.heightFraction,
                        };
                      }}
                      style={{
                        left: `${pic.xFraction * 100}%`,
                        top: `${pic.yFraction * 100}%`,
                        width: `${pic.widthFraction * 100}%`,
                        height: `${pic.heightFraction * 100}%`,
                      }}
                      className={`absolute cursor-move ${
                        isSel
                          ? 'ring-2 ring-yellow-400 shadow-md z-20'
                          : 'hover:ring-1 hover:ring-amber-400/70 z-10'
                      }`}
                    >
                      <img
                        src={pic.dataUrl}
                        alt={pic.label}
                        style={{
                          opacity: pic.opacity,
                          transform: `rotate(${pic.rotationDeg}deg)`,
                          borderRadius:
                            pic.cornerStyle === 'circle'
                              ? '9999px'
                              : pic.cornerStyle === 'rounded'
                              ? '10%'
                              : '0px',
                          border:
                            pic.borderWidth > 0
                              ? `${pic.borderWidth}px solid ${pic.borderColor}`
                              : 'none',
                        }}
                        className="w-full h-full object-fill pointer-events-none"
                      />

                      {isSel && (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              id: pic.id,
                              mode: 'resize',
                              startX: e.clientX,
                              startY: e.clientY,
                              origX: pic.xFraction,
                              origY: pic.yFraction,
                              origW: pic.widthFraction,
                              origH: pic.heightFraction,
                            };
                          }}
                          title="Drag corner to resize picture"
                          className="absolute -right-2 -bottom-2 w-4 h-4 rounded-sm bg-yellow-400 border-2 border-black cursor-nwse-resize shadow"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Panel: Picture Library + Picture Controls + Export */}
          <div className="lg:col-span-5 space-y-4">
            {/* Uploaded Pictures Shelf */}
            <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Picture Tray ({uploadedAssets.length})
                </h3>
                <button
                  type="button"
                  onClick={() => picInputRef.current?.click()}
                  className="text-xs font-bold text-amber-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add More</span>
                </button>
              </div>

              {uploadedAssets.length === 0 ? (
                <button
                  type="button"
                  onClick={() => picInputRef.current?.click()}
                  className="w-full py-6 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs text-zinc-500 hover:border-yellow-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Click to upload photos, ID scans, logos, or diagrams
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {uploadedAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => placeAssetOnPage(asset, currentPage)}
                      title={`Click to place ${asset.name} on page ${currentPage}`}
                      className="group relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-1.5 hover:border-yellow-400 cursor-pointer text-left"
                    >
                      <img
                        src={asset.dataUrl}
                        alt={asset.name}
                        className="w-full h-16 object-contain rounded"
                      />
                      <span className="block mt-1 text-[10px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        + Page {currentPage}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Picture Controls */}
            <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  {selected ? 'Picture Properties' : 'Select a Placed Picture'}
                </h3>
                {selected && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLockAspect((p) => !p)}
                      title={lockAspect ? 'Aspect ratio locked' : 'Free stretch resize'}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 cursor-pointer"
                    >
                      {lockAspect ? <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const clone: PdfPicturePlacement = {
                          ...selected,
                          id: `pic_${Date.now()}`,
                          xFraction: Math.min(0.85, selected.xFraction + 0.03),
                          yFraction: Math.min(0.85, selected.yFraction + 0.03),
                        };
                        setPlacements((prev) => [...prev, clone]);
                        setSelectedId(clone.id);
                      }}
                      title="Duplicate picture"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {pagePreviews.length > 1 && (
                      <button
                        type="button"
                        onClick={handleMirrorToAllPages}
                        title="Mirror to all pages"
                        className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                      >
                        <Layers className="w-3 h-3" />
                        <span>All Pages</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPlacements((prev) => prev.filter((p) => p.id !== selected.id));
                        setSelectedId(null);
                      }}
                      title="Remove picture"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {!selected ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 py-2">
                  Upload a picture above to place it on page {currentPage}, then drag it or resize it from the yellow bottom-right corner handle.
                </p>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-zinc-500 truncate">{selected.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelected((p) => ({
                          ...p,
                          rotationDeg: (p.rotationDeg + 90) % 360,
                        }))
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 font-semibold cursor-pointer shrink-0"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate ({selected.rotationDeg}°)</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                      <span>Width Scale</span>
                      <span className="font-mono font-bold tabular-nums">
                        {Math.round(selected.widthFraction * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="92"
                      value={Math.round(selected.widthFraction * 100)}
                      onChange={(e) => {
                        const newW = Number(e.target.value) / 100;
                        updateSelected((p) => {
                          if (!lockAspect) return { ...p, widthFraction: newW };
                          const ratio = p.heightFraction / Math.max(0.04, p.widthFraction);
                          return {
                            ...p,
                            widthFraction: newW,
                            heightFraction: Math.min(0.92, Math.max(0.04, newW * ratio)),
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
                        {Math.round(selected.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="100"
                      value={Math.round(selected.opacity * 100)}
                      onChange={(e) =>
                        updateSelected((p) => ({ ...p, opacity: Number(e.target.value) / 100 }))
                      }
                      className="w-full accent-yellow-400 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Corners</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['square', 'rounded', 'circle'] as PictureCornerStyle[]).map((style) => (
                          <button
                            key={style}
                            type="button"
                            onClick={() => updateSelected((p) => ({ ...p, cornerStyle: style }))}
                            className={`py-1.5 rounded-lg border text-[11px] font-semibold capitalize cursor-pointer ${
                              selected.cornerStyle === style
                                ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Frame Border</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={8}
                          value={selected.borderWidth}
                          onChange={(e) =>
                            updateSelected((p) => ({
                              ...p,
                              borderWidth: Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-16 px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                        />
                        <input
                          type="color"
                          value={selected.borderColor}
                          onChange={(e) =>
                            updateSelected((p) => ({ ...p, borderColor: e.target.value }))
                          }
                          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                          title="Frame border color"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <button
                  type="button"
                  disabled={placements.length === 0 || isWorking}
                  onClick={handleExport}
                  className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isWorking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    Save PDF with {placements.length} Picture{placements.length === 1 ? '' : 's'}
                  </span>
                </button>

                {result && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5 text-xs">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {result.fileName} ({formatBytes(result.blob.size)})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onPreviewDocument && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewDocument({
                              title: result.fileName,
                              fileName: result.fileName,
                              blob: result.blob,
                              subtitle: `${result.picturesCount} pictures embedded`,
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
                        onClick={() => triggerDownload(result.blob, result.fileName)}
                        className="flex-1 px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenInCoverStudio(result.blob, result.fileName)}
                        className="px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-800 dark:border-zinc-700 text-yellow-400 font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>QR Cover</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
