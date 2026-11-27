import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  GripVertical,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  inspectPdfThumbnails,
  PdfMergeResult,
  PdfPageThumb,
  transformPdfPages,
} from '../services/pdfToolkit';

interface MergeRearrangeModalProps {
  isOpen: boolean;
  mergedResult: PdfMergeResult | null;
  onCloseKeepCurrent: () => void;
  onApplyRearranged: (updated: PdfMergeResult) => void;
}

export const MergeRearrangeModal: React.FC<MergeRearrangeModalProps> = ({
  isOpen,
  mergedResult,
  onCloseKeepCurrent,
  onApplyRearranged,
}) => {
  const [thumbs, setThumbs] = useState<PdfPageThumb[]>([]);
  const [initialThumbs, setInitialThumbs] = useState<PdfPageThumb[]>([]);
  const [undoStack, setUndoStack] = useState<PdfPageThumb[][]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ percent: number; status: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !mergedResult) return;
    let cancelled = false;

    const loadPages = async () => {
      setLoading(true);
      setErrorMsg(null);
      setUndoStack([]);
      setLoadProgress({ percent: 10, status: 'Preparing merged page previews...' });
      try {
        const mergedFile = new File([mergedResult.blob], mergedResult.fileName, {
          type: 'application/pdf',
        });
        const rendered = await inspectPdfThumbnails(mergedFile, (percent, status) => {
          if (!cancelled) setLoadProgress({ percent, status });
        });
        if (!cancelled) {
          setThumbs(rendered);
          setInitialThumbs(rendered.map((t) => ({ ...t })));
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Could not render merged page thumbnails.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadProgress(null);
        }
      }
    };

    void loadPages();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mergedResult]);

  if (!isOpen || !mergedResult) return null;

  const commitChange = (updater: (prev: PdfPageThumb[]) => PdfPageThumb[]) => {
    setThumbs((prev) => {
      const snapshot = prev.map((t) => ({ ...t }));
      setUndoStack((stack) => [...stack.slice(-24), snapshot]);
      return updater(prev);
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || saving) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setThumbs(prev);
  };

  const handleReset = () => {
    if (initialThumbs.length === 0 || saving) return;
    setUndoStack((s) => [...s.slice(-24), thumbs.map((t) => ({ ...t }))]);
    setThumbs(initialThumbs.map((t) => ({ ...t })));
  };

  const handleReverse = () => {
    if (thumbs.length < 2 || saving) return;
    commitChange((prev) => [...prev].reverse());
  };

  const handleMove = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= thumbs.length || saving) return;
    commitChange((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleApplyOrder = async () => {
    if (!mergedResult || thumbs.every((t) => t.deleted) || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const mergedFile = new File([mergedResult.blob], mergedResult.fileName, {
        type: 'application/pdf',
      });
      const transformed = await transformPdfPages(mergedFile, thumbs);
      onApplyRearranged({
        blob: transformed.blob,
        bytes: transformed.bytes,
        fileName: mergedResult.fileName,
        totalPages: transformed.pageCount,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to apply new page arrangement.');
    } finally {
      setSaving(false);
    }
  };

  const keptCount = thumbs.filter((t) => !t.deleted).length;
  const hasModifications = undoStack.length > 0;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-rearrange-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCloseKeepCurrent();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] shadow-2xl overflow-hidden">
        {/* Compact Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[var(--pl-surface-soft)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3
              id="merge-rearrange-title"
              className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2"
            >
              <span>Rearrange Merged Pages</span>
              <span className="text-xs font-mono font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
                · {thumbs.length > 0 ? `${keptCount}/${thumbs.length} kept` : `${mergedResult.totalPages} pages`}
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Drag pages to reorder, use arrows, rotate scans, or remove extra pages directly before downloading.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {thumbs.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handleReverse}
                  disabled={loading || saving}
                  title="Reverse page order"
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span className="hidden sm:inline">Reverse</span>
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || loading || saving}
                  title="Undo last page move"
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={undoStack.length === 0 || loading || saving}
                  title="Reset to merged order"
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={onCloseKeepCurrent}
              aria-label="Close rearrange popup"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Thumbnail Grid */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0">
          {errorMsg && (
            <div className="mb-3 p-2.5 rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600 dark:text-yellow-400" />
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                  {loadProgress?.status || 'Rendering merged page previews...'}
                </p>
                {loadProgress && (
                  <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                    {loadProgress.percent}%
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {thumbs.map((page, idx) => {
                const newPosition = thumbs.slice(0, idx + 1).filter((t) => !t.deleted).length;
                const isDragTarget = dragOverIdx === idx && dragIdx !== idx;
                return (
                  <div
                    key={page.pageNumber}
                    draggable={!saving}
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverIdx === idx) setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== idx) {
                        handleMove(dragIdx, idx);
                      }
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col gap-2 select-none ${
                      page.deleted
                        ? 'opacity-45 border-rose-400/50 bg-rose-50/40 dark:bg-rose-950/20'
                        : isDragTarget
                        ? 'border-yellow-400 ring-2 ring-yellow-400/40 bg-yellow-50/40 dark:bg-yellow-950/20'
                        : dragIdx === idx
                        ? 'opacity-60 border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-white rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative">
                      <img
                        src={page.thumbnailUrl}
                        alt={`Page ${page.pageNumber}`}
                        draggable={false}
                        style={{ transform: `rotate(${page.rotationDelta}deg)` }}
                        className="max-w-full max-h-full object-contain transition-transform"
                      />
                      <span
                        title="Drag to reorder"
                        className="absolute top-1.5 left-1.5 p-0.5 rounded bg-black/55 text-white"
                      >
                        <GripVertical className="w-3 h-3" />
                      </span>
                      {page.deleted && (
                        <span className="absolute inset-0 bg-rose-950/50 flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider">
                          Removed
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                      <span>{page.deleted ? `Orig P${page.pageNumber}` : `P${newPosition} (Orig ${page.pageNumber})`}</span>
                      {page.rotationDelta !== 0 && (
                        <span className="text-amber-600 dark:text-yellow-400 font-bold">
                          {page.rotationDelta}°
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          commitChange((prev) =>
                            prev.map((t, i) =>
                              i === idx ? { ...t, rotationDelta: (t.rotationDelta + 90) % 360 } : t
                            )
                          )
                        }
                        title="Rotate 90° clockwise"
                        className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 cursor-pointer"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, idx - 1)}
                        disabled={idx === 0 || saving}
                        title="Move earlier"
                        className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, idx + 1)}
                        disabled={idx === thumbs.length - 1 || saving}
                        title="Move later"
                        className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitChange((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, deleted: !t.deleted } : t))
                          )
                        }
                        title={page.deleted ? 'Restore page' : 'Remove page'}
                        className={`p-1.5 rounded border cursor-pointer ${
                          page.deleted
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-500'
                        }`}
                      >
                        {page.deleted ? <RotateCcw className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-[var(--pl-surface-soft)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {hasModifications
              ? `${keptCount} page${keptCount === 1 ? '' : 's'} will be saved into ${mergedResult.fileName}`
              : 'Merged PDF is ready — rearrange pages now or keep current order.'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onCloseKeepCurrent}
              className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              Keep Current Order
            </button>
            <button
              type="button"
              disabled={loading || saving || keptCount === 0}
              onClick={() => void handleApplyOrder()}
              className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Order...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{hasModifications ? 'Apply & Save Order' : 'Done & Keep'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
