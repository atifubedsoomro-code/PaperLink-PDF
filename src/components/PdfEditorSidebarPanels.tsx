import React, { useRef, useState } from 'react';
import {
  Download,
  Eye,
  Loader2,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  CheckCircle2,
  Lock,
  Unlock,
  Upload,
  Droplets,
  Stamp,
  Minimize2,
  Scissors,
  Layers,
  FileType2,
  FileImage,
  Table2,
  Presentation,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  PenTool,
  Image as ImageIcon,
  Eraser,
  ScanLine,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import { ReadyDownloadPayload } from './RobotDownloadPopup';
import {
  CompressionLevel,
  PdfMergeSource,
  PdfPageThumb,
  PdfToWordMode,
  PdfWatermarkRemoveEngine,
  PdfScanEnhanceMode,
  PdfScanFitPage,
  SplitMode,
  applyPdfWatermarkAndNumbers,
  compressPdfFile,
  convertImagesToPdf,
  convertPdfToWord,
  convertWordToPdf,
  estimateCompressedPdfSize,
  inspectPdfSource,
  mergeMultiplePdfs,
  removePdfWatermark,
  scanCropAndCleanPdf,
  splitPdfFile,
  transformPdfPages,
} from '../services/pdfToolkit';
import {
  PdfToImageFormat,
  PdfToImageScale,
  convertPdfToImages,
} from '../services/imageToolkit';
import {
  ExcelPdfOrientation,
  PdfToExcelFormat,
  PptToPdfLayout,
  convertExcelToImages,
  convertExcelToPdf,
  convertPdfToExcel,
  convertPdfToPpt,
  convertPptToImages,
  convertPptToPdf,
} from '../services/officeToolkit';
import {
  PdfCipherAlgorithm,
  protectPdfWithPassword,
  unlockPdfWithPassword,
} from '../services/pdfSecurity';

export type SidebarToolSection =
  | 'canvas'
  | 'add-pictures'
  | 'sign-stamp'
  | 'rotate-delete'
  | 'merge'
  | 'split'
  | 'watermark-remove'
  | 'watermark-add'
  | 'scan-crop'
  | 'compress'
  | 'protect'
  | 'export-word'
  | 'export-image'
  | 'export-excel'
  | 'export-ppt'
  | 'import-office';

export const SIDEBAR_TOOL_GROUPS: {
  groupLabel: string;
  items: {
    id: SidebarToolSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    groupLabel: 'Edit & Annotate',
    items: [
      { id: 'canvas', label: 'Canvas / Text', icon: Eraser },
      { id: 'add-pictures', label: 'Add Pictures', icon: ImagePlus },
      { id: 'sign-stamp', label: 'Sign & Stamp', icon: PenTool },
    ],
  },
  {
    groupLabel: 'Pages & Structure',
    items: [
      { id: 'rotate-delete', label: 'Rotate & Delete', icon: RotateCw },
      { id: 'merge', label: 'PDF Merge', icon: Layers },
      { id: 'split', label: 'Split / Extract', icon: Scissors },
    ],
  },
  {
    groupLabel: 'Clean, Watermark & Security',
    items: [
      { id: 'scan-crop', label: 'Crop & Auto-Scan', icon: ScanLine },
      { id: 'watermark-remove', label: 'Watermark Remover', icon: Droplets },
      { id: 'watermark-add', label: 'Watermark & Page #', icon: Stamp },
      { id: 'compress', label: 'Compress', icon: Minimize2 },
      { id: 'protect', label: 'Protect PDF', icon: Lock },
    ],
  },
  {
    groupLabel: 'Export & Office Import',
    items: [
      { id: 'export-word', label: 'PDF to Word', icon: FileType2 },
      { id: 'export-image', label: 'PDF to Image', icon: FileImage },
      { id: 'export-excel', label: 'PDF to Excel', icon: Table2 },
      { id: 'export-ppt', label: 'PDF to PPT', icon: Presentation },
      { id: 'import-office', label: 'Word / Img / PPT / XLS', icon: FileSpreadsheet },
    ],
  },
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
  URL.revokeObjectURL(url);
}

interface SidebarActionOutput {
  title: string;
  fileName: string;
  blob: Blob;
  subtitle?: string;
}

export interface PdfEditorSidebarPanelsProps {
  activeSection: SidebarToolSection;
  workingFile: File | null;
  pageCount: number;
  currentPage: number;
  pageThumbs: PdfPageThumb[];
  setPageThumbs: React.Dispatch<React.SetStateAction<PdfPageThumb[]>>;
  isWorking: boolean;
  setIsWorking: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onProgress: (p: { percent: number; status: string } | null) => void;
  ensureCommittedFile: () => Promise<File | null>;
  commitTransformedFile: (newFile: File, historyLabel: string) => Promise<void>;
  onInsertPictureFile: (file: File) => void;
  onInsertSignatureDataUrl?: (dataUrl: string) => void;
  savedSignatureUrl?: string;
  onOpenProfile?: () => void;
  onOpenSignatureModal: () => void;
  onAddStampPreset: (preset: {
    text: string;
    color: string;
    subtext?: string;
    shape?: 'rect' | 'double-rect' | 'round' | 'solid-badge';
    rotationDeg?: number;
    opacity?: number;
  }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
  onTaskComplete?: (info: {
    headline: string;
    subtext: string;
    statusLabel?: string;
    downloadFile?: ReadyDownloadPayload;
  }) => void;
}

const STAMP_PRESETS: Array<{
  text: string;
  color: string;
  shape?: 'rect' | 'double-rect' | 'round' | 'solid-badge';
}> = [
  { text: 'APPROVED', color: '#16a34a', shape: 'double-rect' },
  { text: 'CONFIDENTIAL', color: '#dc2626', shape: 'rect' },
  { text: 'PAID', color: '#059669', shape: 'round' },
  { text: 'URGENT', color: '#ea580c', shape: 'solid-badge' },
  { text: 'CERTIFIED', color: '#1d4ed8', shape: 'round' },
  { text: 'DRAFT', color: '#d97706', shape: 'rect' },
  { text: 'VERIFIED', color: '#2563eb', shape: 'double-rect' },
  { text: 'RECEIVED', color: '#0f766e', shape: 'rect' },
  { text: 'FINAL', color: '#4f46e5', shape: 'solid-badge' },
  { text: 'COPY', color: '#64748b', shape: 'rect' },
];

export const PdfEditorSidebarPanels: React.FC<PdfEditorSidebarPanelsProps> = ({
  activeSection,
  workingFile,
  pageCount,
  currentPage,
  pageThumbs,
  setPageThumbs,
  isWorking,
  setIsWorking,
  onError,
  onProgress,
  ensureCommittedFile,
  commitTransformedFile,
  onInsertPictureFile,
  onInsertSignatureDataUrl,
  savedSignatureUrl,
  onOpenProfile,
  onOpenSignatureModal,
  onAddStampPreset,
  onPreviewDocument,
  onTaskComplete,
}) => {
  const [sidebarOutput, setSidebarOutput] = useState<SidebarActionOutput | null>(null);

  // Merge state
  const mergeFileRef = useRef<HTMLInputElement>(null);
  const [extraMergeFiles, setExtraMergeFiles] = useState<PdfMergeSource[]>([]);
  const [mergePosition, setMergePosition] = useState<'after' | 'before'>('after');

  // Split state
  const [splitMode, setSplitMode] = useState<SplitMode>('extract-range');
  const [splitExpr, setSplitExpr] = useState('1-2');
  const [splitDownloads, setSplitDownloads] = useState<{ fileName: string; blob: Blob; label: string }[]>([]);

  // Compress state
  const [compressQuality, setCompressQuality] = useState(70);
  const [compressLevel, setCompressLevel] = useState<CompressionLevel>('balanced');

  // Watermark Remover state
  const [rmEngine, setRmEngine] = useState<PdfWatermarkRemoveEngine>('pixel-clean');
  const [luminanceCutoff, setLuminanceCutoff] = useState(172);
  const [textDarkenBoost, setTextDarkenBoost] = useState(45);
  const [rmKeywords, setRmKeywords] = useState('CONFIDENTIAL, DRAFT, WATERMARK, SAMPLE, CamScanner');
  const [rmPageRange, setRmPageRange] = useState('');

  // Add Watermark & Page Numbers state
  const wmLogoRef = useRef<HTMLInputElement>(null);
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmLayout, setWmLayout] = useState<'diagonal' | 'center' | 'tiled'>('diagonal');
  const [wmFontSize, setWmFontSize] = useState(42);
  const [wmColor, setWmColor] = useState('#64748B');
  const [wmOpacity, setWmOpacity] = useState(0.24);
  const [wmLogoUrl, setWmLogoUrl] = useState<string | null>(null);
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [pageNumFmt, setPageNumFmt] = useState<'Page X of Y' | 'X / Y' | 'X'>('Page X of Y');
  const [pageNumPos, setPageNumPos] = useState<'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right'>('bottom-right');

  // Protect / Unlock PDF state
  const [protectMode, setProtectMode] = useState<'encrypt' | 'unlock'>('encrypt');
  const [userPassword, setUserPassword] = useState('');
  const [algorithm, setAlgorithm] = useState<PdfCipherAlgorithm>('AES-256');
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);

  // Export converters state
  const [p2wMode, setP2wMode] = useState<PdfToWordMode>('editable');
  const [p2iFormat, setP2iFormat] = useState<PdfToImageFormat>('png');
  const [p2iScale, setP2iScale] = useState<PdfToImageScale>(2);
  const [p2eFormat, setP2eFormat] = useState<PdfToExcelFormat>('xlsx');
  const [p2eSingleSheet, setP2eSingleSheet] = useState(false);

  // Office Import & Protect unlock refs (declared at top level)
  const picUploadRef = useRef<HTMLInputElement>(null);
  const sigImgRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const unlockFileRef = useRef<HTMLInputElement>(null);
  const [importKind, setImportKind] = useState<'word' | 'images' | 'ppt' | 'excel'>('word');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importAppendMode, setImportAppendMode] = useState<'replace' | 'append'>('replace');
  const [pptLayout, setPptLayout] = useState<PptToPdfLayout>('slide-fit');
  const [excelOrientation, setExcelOrientation] = useState<ExcelPdfOrientation>('landscape');

  // Crop & Auto-Scan Phone PDF state
  const [scanEnhanceMode, setScanEnhanceMode] = useState<PdfScanEnhanceMode>('magic-color');
  const [scanFitPage, setScanFitPage] = useState<PdfScanFitPage>('a4-full-bleed');
  const [scanAutoDetectEdges, setScanAutoDetectEdges] = useState(true);
  const [scanFlattenShadows, setScanFlattenShadows] = useState(true);
  const [scanAutoWatermark, setScanAutoWatermark] = useState(true);
  const [scanWatermarkCutoff, setScanWatermarkCutoff] = useState(176);
  const [scanPageRange, setScanPageRange] = useState('');

  // Helper: render reusable export result card
  const renderOutputCard = () => {
    if (!sidebarOutput) return null;
    return (
      <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{sidebarOutput.fileName}</span>
          </span>
          <span className="font-mono text-zinc-600 dark:text-zinc-300 tabular-nums shrink-0">
            {formatBytes(sidebarOutput.blob.size)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onPreviewDocument && (
            <button
              type="button"
              onClick={() =>
                onPreviewDocument({
                  title: sidebarOutput.title,
                  fileName: sidebarOutput.fileName,
                  blob: sidebarOutput.blob,
                  subtitle: sidebarOutput.subtitle,
                })
              }
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-zinc-800 dark:text-zinc-100 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => triggerDownload(sidebarOutput.blob, sidebarOutput.fileName)}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold cursor-pointer inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </button>
        </div>
      </div>
    );
  };

  if (activeSection === 'add-pictures') {
    return (
      <div className="space-y-3 text-xs">
        <input
          ref={picUploadRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((f) => onInsertPictureFile(f));
            e.target.value = '';
          }}
        />
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Insert PNG, JPG, or WebP pictures directly onto Page <span className="font-mono font-bold tabular-nums">{currentPage}</span>. Drag anywhere on the PDF canvas or use the bottom-right handle to resize and rotate.
        </p>
        <button
          type="button"
          disabled={!workingFile}
          onClick={() => picUploadRef.current?.click()}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <ImagePlus className="w-4 h-4" />
          <span>Upload &amp; Place Picture</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'sign-stamp') {
    return (
      <div className="space-y-3 text-xs">
        <input
          ref={sigImgRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onInsertPictureFile(f);
            e.target.value = '';
          }}
        />
        <p className="text-zinc-600 dark:text-zinc-400">
          Draw a handwritten signature, upload a transparent PNG seal, or drop official stamps onto Page <span className="font-mono font-bold tabular-nums">{currentPage}</span>.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!workingFile}
            onClick={onOpenSignatureModal}
            className="py-2 px-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Draw Signature</span>
          </button>
          <button
            type="button"
            disabled={!workingFile}
            onClick={() => sigImgRef.current?.click()}
            className="py-2 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 disabled:opacity-40 text-zinc-800 dark:text-zinc-200 font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload PNG</span>
          </button>
        </div>

        {savedSignatureUrl && onInsertSignatureDataUrl ? (
          <button
            type="button"
            disabled={!workingFile}
            onClick={() => onInsertSignatureDataUrl(savedSignatureUrl)}
            className="w-full py-2 px-2.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 hover:border-emerald-500 disabled:opacity-40 text-emerald-800 dark:text-emerald-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <PenTool className="w-3.5 h-3.5 shrink-0" />
            <span>Insert Saved Profile Signature</span>
          </button>
        ) : onOpenProfile ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-full py-1.5 px-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 cursor-pointer"
          >
            Save a reusable signature in Profile Vault
          </button>
        ) : null}

        <div className="pt-1 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              Official PDF Rubber Stamps
            </span>
            <span className="text-[10px] text-zinc-500">Click to stamp Page {currentPage}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STAMP_PRESETS.map((st) => (
              <button
                key={st.text}
                type="button"
                disabled={!workingFile}
                onClick={() =>
                  onAddStampPreset({
                    text: st.text,
                    color: st.color,
                    shape: st.shape,
                    subtext: new Date().toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }),
                    rotationDeg: -10,
                    opacity: 0.92,
                  })
                }
                className="px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer hover:opacity-80 disabled:opacity-40"
                style={{ color: st.color, borderColor: st.color }}
              >
                + {st.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'rotate-delete') {
    const activeKept = pageThumbs.filter((p) => !p.deleted).length;
    const hasChanges = pageThumbs.some((p, idx) => p.deleted || p.rotationDelta !== 0 || p.originalIndex !== idx);

    const handleApplyPageOps = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setIsWorking(true);
      try {
        const res = await transformPdfPages(committed, pageThumbs, (percent, status) =>
          onProgress({ percent, status })
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(nextFile, 'Rotate / Reorder / Delete Pages');
        onTaskComplete?.({
          headline: 'PDF Pages Updated',
          subtext: `Applied rotations/deletes directly inside Edit PDF (${res.pageCount} pages).`,
          statusLabel: 'Pages Organized',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Organize',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to update PDF pages.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 dark:text-zinc-400 tabular-nums">
            {activeKept} / {pageThumbs.length} pages kept
          </span>
          <button
            type="button"
            disabled={!hasChanges || isWorking}
            onClick={() =>
              setPageThumbs((prev) =>
                [...prev]
                  .sort((a, b) => a.originalIndex - b.originalIndex)
                  .map((p) => ({ ...p, deleted: false, rotationDelta: 0 }))
              )
            }
            className="text-[11px] font-semibold text-amber-600 dark:text-yellow-400 hover:underline disabled:opacity-40 cursor-pointer"
          >
            Reset Order
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {pageThumbs.map((pg, idx) => (
            <div
              key={`${pg.originalIndex}_${idx}`}
              className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                pg.deleted
                  ? 'border-red-300 dark:border-red-500/40 bg-red-50/50 dark:bg-red-950/20 opacity-60'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                  P{pg.pageNumber}
                </span>
                {pg.rotationDelta !== 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-yellow-400/20 text-amber-700 dark:text-yellow-300 text-[10px] font-mono tabular-nums">
                    +{pg.rotationDelta}°
                  </span>
                )}
                {pg.deleted && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold">
                    Deleted
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() =>
                    setPageThumbs((prev) => {
                      const next = [...prev];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      return next;
                    })
                  }
                  className="p-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-35 cursor-pointer"
                  title="Move up"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === pageThumbs.length - 1}
                  onClick={() =>
                    setPageThumbs((prev) => {
                      const next = [...prev];
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      return next;
                    })
                  }
                  className="p-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-35 cursor-pointer"
                  title="Move down"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPageThumbs((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, rotationDelta: (item.rotationDelta + 90) % 360 } : item
                      )
                    )
                  }
                  className="p-1 rounded border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 cursor-pointer"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPageThumbs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, deleted: !item.deleted } : item))
                    )
                  }
                  className={`p-1 rounded border cursor-pointer ${
                    pg.deleted
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-zinc-200 dark:border-zinc-700 hover:text-red-500'
                  }`}
                  title={pg.deleted ? 'Restore page' : 'Delete page'}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!workingFile || !hasChanges || activeKept === 0 || isWorking}
          onClick={handleApplyPageOps}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          <span>Apply Page Changes to PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'merge') {
    const handleAddMergeFiles = async (files: FileList | File[]) => {
      onError(null);
      try {
        const added: PdfMergeSource[] = [];
        for (const f of Array.from(files)) {
          if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) continue;
          added.push(await inspectPdfSource(f));
        }
        setExtraMergeFiles((prev) => [...prev, ...added]);
      } catch (err: any) {
        onError(err?.message || 'Could not inspect selected PDF.');
      }
    };

    const handleRunMergeIntoActive = async () => {
      const committed = await ensureCommittedFile();
      if (!committed || extraMergeFiles.length === 0) return;
      onError(null);
      setIsWorking(true);
      try {
        const currentSrc = await inspectPdfSource(committed);
        const ordered =
          mergePosition === 'before'
            ? [...extraMergeFiles, currentSrc]
            : [currentSrc, ...extraMergeFiles];
        const res = await mergeMultiplePdfs(
          ordered,
          committed.name.replace(/\.pdf$/i, ''),
          (percent, status) => onProgress({ percent, status })
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(nextFile, `Merged +${extraMergeFiles.length} PDF(s)`);
        setExtraMergeFiles([]);
        onTaskComplete?.({
          headline: 'PDFs Merged into Active Workspace',
          subtext: `${res.totalPages} total pages ready to continue editing.`,
          statusLabel: 'PDF Merge Applied',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Merge',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to merge PDFs.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <input
          ref={mergeFileRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleAddMergeFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="text-zinc-600 dark:text-zinc-400">
          Combine extra PDFs directly into your active PDF without leaving the editor.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {(['after', 'before'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setMergePosition(pos)}
              className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                mergePosition === pos
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {pos === 'after' ? 'Append After' : 'Prepend Before'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => mergeFileRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5 text-yellow-500" />
          <span>Add PDF(s) to Merge</span>
        </button>

        {extraMergeFiles.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {extraMergeFiles.map((src, i) => (
              <div
                key={src.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900 dark:text-white">{src.name}</p>
                  <p className="text-[10px] font-mono text-zinc-500 tabular-nums">{src.pageCount} pages</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExtraMergeFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={!workingFile || extraMergeFiles.length === 0 || isWorking}
          onClick={handleRunMergeIntoActive}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
          <span>Merge into Active PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'split') {
    const handleRunSplit = async (keepAsActive: boolean) => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setSplitDownloads([]);
      setIsWorking(true);
      try {
        const res = await splitPdfFile(committed, splitMode, splitExpr, (percent, status) =>
          onProgress({ percent, status })
        );
        if (keepAsActive && res.files.length > 0) {
          const nextFile = new File([res.files[0].blob], committed.name, { type: 'application/pdf' });
          await commitTransformedFile(nextFile, `Extracted pages (${splitExpr})`);
        } else {
          setSplitDownloads(res.files);
        }
        onTaskComplete?.({
          headline: 'PDF Split / Extract Complete',
          subtext: `${res.files.length} file(s) generated cleanly.`,
          statusLabel: 'PDF Split Complete',
          downloadFile: res.files[0]
            ? {
                blob: res.files[0].blob,
                fileName: res.files[0].fileName,
                fileSizeBytes: res.files[0].blob.size,
                toolLabel: 'PDF Split',
              }
            : undefined,
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to split PDF.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'extract-range' as const, label: 'Extract Range' },
            { id: 'fixed-chunks' as const, label: 'Fixed Chunks' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSplitMode(m.id);
                setSplitExpr(m.id === 'extract-range' ? `1-${Math.max(1, Math.min(2, pageCount))}` : '1');
              }}
              className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                splitMode === m.id
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            {splitMode === 'extract-range' ? `Page Range (1–${pageCount})` : 'Pages per Chunk'}
          </label>
          <input
            type="text"
            value={splitExpr}
            onChange={(e) => setSplitExpr(e.target.value)}
            placeholder={splitMode === 'extract-range' ? 'e.g. 1-3, 5' : 'e.g. 2'}
            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-1 gap-2">
          {splitMode === 'extract-range' && (
            <button
              type="button"
              disabled={!workingFile || isWorking}
              onClick={() => void handleRunSplit(true)}
              className="w-full py-2 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Keep Selected Pages in Editor</span>
            </button>
          )}
          <button
            type="button"
            disabled={!workingFile || isWorking}
            onClick={() => void handleRunSplit(false)}
            className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 disabled:opacity-40 font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Generate Split Part(s)</span>
          </button>
        </div>

        {splitDownloads.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
            {splitDownloads.map((item) => (
              <div
                key={item.fileName}
                className="flex items-center justify-between gap-2 p-2 rounded-lg border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20"
              >
                <span className="truncate font-semibold text-[11px]">{item.fileName}</span>
                <button
                  type="button"
                  onClick={() => triggerDownload(item.blob, item.fileName)}
                  className="px-2 py-1 rounded bg-yellow-400 text-black font-bold text-[10px] cursor-pointer shrink-0"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeSection === 'scan-crop') {
    const handleRunAutoScan = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setIsWorking(true);
      try {
        const res = await scanCropAndCleanPdf(
          committed,
          {
            autoDetectEdges: scanAutoDetectEdges,
            autoRemoveWatermark: scanAutoWatermark,
            flattenShadows: scanFlattenShadows,
            enhanceMode: scanEnhanceMode,
            fitPage: scanFitPage,
            watermarkCutoff: scanWatermarkCutoff,
            pageRangeExpr: scanPageRange,
          },
          (percent, status) => onProgress({ percent, status })
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(nextFile, 'Crop & Auto-Scan Phone PDF');
        onTaskComplete?.({
          headline: 'Phone PDF Cropped, Cleaned & Auto-Scanned',
          subtext: `Processed ${res.processedPages} of ${res.pageCount} page(s) to whole-page fit.`,
          statusLabel: 'Auto-Scanned',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Auto-Scan',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to crop & auto-scan PDF.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Turns phone-clicked PDFs into crisp full-page scans: crops camera borders, removes shadows &amp; watermarks, and fits edge-to-edge.
        </p>

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            Scan Enhancement Preset
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'magic-color' as const, label: 'Magic Color' },
              { id: 'bw-document' as const, label: 'B&W Crisp' },
              { id: 'clean-only' as const, label: 'Clean Soft' },
              { id: 'none' as const, label: 'Original' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setScanEnhanceMode(mode.id)}
                className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                  scanEnhanceMode === mode.id
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            Whole-Page Fit Mode
          </label>
          <select
            value={scanFitPage}
            onChange={(e) => setScanFitPage(e.target.value as PdfScanFitPage)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs font-medium"
          >
            <option value="a4-full-bleed">A4 Whole-Page Bleed (Recommended)</option>
            <option value="a4-fit">A4 Crisp Clean Margin</option>
            <option value="letter-fit">US Letter Whole-Page Fit</option>
            <option value="exact-crop">Exact Cropped Ratio</option>
          </select>
        </div>

        <div className="space-y-1.5 pt-1">
          {[
            {
              label: 'Auto-crop phone desk/dark margins',
              checked: scanAutoDetectEdges,
              onChange: setScanAutoDetectEdges,
            },
            {
              label: 'Flatten phone shadows & glare',
              checked: scanFlattenShadows,
              onChange: setScanFlattenShadows,
            },
            {
              label: 'Auto-remove watermarks & stamps',
              checked: scanAutoWatermark,
              onChange: setScanAutoWatermark,
            },
          ].map((opt) => (
            <label
              key={opt.label}
              className="flex items-center gap-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={opt.checked}
                onChange={(e) => opt.onChange(e.target.checked)}
                className="accent-yellow-400 rounded cursor-pointer"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        {scanAutoWatermark && (
          <div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
              <span>Watermark Strip Strength</span>
              <span className="font-mono font-bold tabular-nums">{scanWatermarkCutoff}</span>
            </div>
            <input
              type="range"
              min="125"
              max="235"
              value={scanWatermarkCutoff}
              onChange={(e) => setScanWatermarkCutoff(Number(e.target.value))}
              className="w-full accent-yellow-400 cursor-pointer"
            />
          </div>
        )}

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            Page Range (blank = all pages)
          </label>
          <input
            type="text"
            value={scanPageRange}
            onChange={(e) => setScanPageRange(e.target.value)}
            placeholder={`e.g. 1-${pageCount}`}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-mono text-xs"
          />
        </div>

        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleRunAutoScan}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
          <span>Auto-Crop, Clean &amp; Scan PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'watermark-remove') {
    const handleCleanWatermark = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setIsWorking(true);
      try {
        const res = await removePdfWatermark(
          committed,
          {
            engine: rmEngine,
            luminanceCutoff,
            textDarkenBoost,
            tintSensitivity: 25,
            removeLightGreyWatermarks: true,
            watermarkKeywords: rmKeywords,
            pageRangeExpr: rmPageRange,
          },
          (percent, status) => onProgress({ percent, status })
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(nextFile, 'Removed Watermark');
        onTaskComplete?.({
          headline: 'Watermark Cleaned on Active PDF',
          subtext: `Processed ${res.cleanedPages} page(s) in-place.`,
          statusLabel: 'Watermark Removed',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Watermark Clean',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to remove watermark.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'pixel-clean' as const, label: 'Pixel Clean' },
            { id: 'vector-layer' as const, label: 'Vector Strip' },
          ].map((eng) => (
            <button
              key={eng.id}
              type="button"
              onClick={() => setRmEngine(eng.id)}
              className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                rmEngine === eng.id
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {eng.label}
            </button>
          ))}
        </div>

        {rmEngine === 'pixel-clean' ? (
          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Watermark Cutoff</span>
                <span className="font-mono font-bold tabular-nums">{luminanceCutoff}</span>
              </div>
              <input
                type="range"
                min="115"
                max="240"
                value={luminanceCutoff}
                onChange={(e) => setLuminanceCutoff(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Ink Darken Boost</span>
                <span className="font-mono font-bold tabular-nums">{textDarkenBoost}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={textDarkenBoost}
                onChange={(e) => setTextDarkenBoost(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
              Target Watermark Keywords
            </label>
            <input
              type="text"
              value={rmKeywords}
              onChange={(e) => setRmKeywords(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs"
            />
          </div>
        )}

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            Page Range (blank = all pages)
          </label>
          <input
            type="text"
            value={rmPageRange}
            onChange={(e) => setRmPageRange(e.target.value)}
            placeholder={`e.g. 1-${pageCount}`}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-mono text-xs"
          />
        </div>

        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleCleanWatermark}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Droplets className="w-3.5 h-3.5" />}
          <span>Clean Watermarks on Active PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'watermark-add') {
    const handleApplyWatermark = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setIsWorking(true);
      try {
        const res = await applyPdfWatermarkAndNumbers(
          committed,
          {
            watermarkText: wmText,
            layout: wmLayout,
            fontSize: wmFontSize,
            colorHex: wmColor,
            opacity: wmOpacity,
            rotationDeg: wmLayout === 'center' ? 0 : 40,
            logoDataUrl: wmLogoUrl,
            showPageNumbers,
            pageNumberFormat: pageNumFmt,
            pageNumberPosition: pageNumPos,
          },
          (percent, status) => onProgress({ percent, status })
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(nextFile, 'Added Watermark & Page #');
        onTaskComplete?.({
          headline: 'Watermark & Page Numbers Applied',
          subtext: `Stamped across ${res.processedPages} page(s) in the active workspace.`,
          statusLabel: 'Watermark Applied',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Stamped',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to add watermark.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <input
          ref={wmLogoRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => setWmLogoUrl(String(reader.result || ''));
            reader.readAsDataURL(f);
            e.target.value = '';
          }}
        />
        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            Watermark Text (optional)
          </label>
          <input
            type="text"
            value={wmText}
            onChange={(e) => setWmText(e.target.value)}
            placeholder="CONFIDENTIAL"
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-semibold text-xs"
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(['diagonal', 'center', 'tiled'] as const).map((lay) => (
            <button
              key={lay}
              type="button"
              onClick={() => setWmLayout(lay)}
              className={`py-1.5 rounded-lg border capitalize font-semibold cursor-pointer ${
                wmLayout === lay
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {lay}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 items-center">
          <div>
            <div className="flex justify-between text-zinc-500 mb-0.5">
              <span>Size</span>
              <span className="font-mono font-bold tabular-nums">{wmFontSize}pt</span>
            </div>
            <input
              type="range"
              min="16"
              max="80"
              value={wmFontSize}
              onChange={(e) => setWmFontSize(Number(e.target.value))}
              className="w-full accent-yellow-400 cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-zinc-500 mb-0.5">
              <span>Opacity</span>
              <span className="font-mono font-bold tabular-nums">{Math.round(wmOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="8"
              max="85"
              value={Math.round(wmOpacity * 100)}
              onChange={(e) => setWmOpacity(Number(e.target.value) / 100)}
              className="w-full accent-yellow-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Color</span>
            <input
              type="color"
              value={wmColor}
              onChange={(e) => setWmColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <button
            type="button"
            onClick={() => (wmLogoUrl ? setWmLogoUrl(null) : wmLogoRef.current?.click())}
            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-yellow-400 text-[11px] font-semibold cursor-pointer"
          >
            {wmLogoUrl ? 'Remove Logo' : '+ Logo Image'}
          </button>
        </div>

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Stamp Page Numbers</span>
            <input
              type="checkbox"
              checked={showPageNumbers}
              onChange={(e) => setShowPageNumbers(e.target.checked)}
              className="accent-yellow-400 w-4 h-4 cursor-pointer"
            />
          </label>
          {showPageNumbers && (
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={pageNumFmt}
                onChange={(e) => setPageNumFmt(e.target.value as any)}
                className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-[11px]"
              >
                <option value="Page X of Y">Page X of Y</option>
                <option value="X / Y">X / Y</option>
                <option value="X">1, 2, 3</option>
              </select>
              <select
                value={pageNumPos}
                onChange={(e) => setPageNumPos(e.target.value as any)}
                className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-[11px]"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleApplyWatermark}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stamp className="w-3.5 h-3.5" />}
          <span>Apply to Active PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'compress') {
    const est = workingFile
      ? estimateCompressedPdfSize(workingFile.size, compressQuality, compressLevel)
      : null;

    const handleApplyCompress = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setIsWorking(true);
      try {
        const res = await compressPdfFile(
          committed,
          compressLevel,
          (percent, status) => onProgress({ percent, status }),
          compressQuality
        );
        const nextFile = new File([res.blob], committed.name, { type: 'application/pdf' });
        await commitTransformedFile(
          nextFile,
          `Compressed (${formatBytes(res.originalSize)} -> ${formatBytes(res.compressedSize)})`
        );
        onTaskComplete?.({
          headline: 'PDF Compressed in Workspace',
          subtext: `${formatBytes(res.originalSize)} -> ${formatBytes(res.compressedSize)}`,
          statusLabel: 'PDF Compressed',
          downloadFile: {
            blob: res.blob,
            fileName: nextFile.name,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Edit PDF · Compress',
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Compression failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'lossless' as const, label: 'Lossless', q: 98 },
            { id: 'balanced' as const, label: 'Balanced', q: 70 },
            { id: 'maximum' as const, label: 'Max', q: 38 },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setCompressLevel(p.id);
                setCompressQuality(p.q);
              }}
              className={`py-1.5 rounded-lg border font-semibold cursor-pointer ${
                compressLevel === p.id
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
            <span>Target Quality</span>
            <span className="font-mono font-bold tabular-nums">{compressQuality}%</span>
          </div>
          <input
            type="range"
            min="15"
            max="100"
            value={compressQuality}
            onChange={(e) => {
              const q = Number(e.target.value);
              setCompressQuality(q);
              setCompressLevel(q >= 96 ? 'lossless' : q >= 55 ? 'balanced' : 'maximum');
            }}
            className="w-full accent-yellow-400 cursor-pointer"
          />
          {est && workingFile && (
            <p className="text-[11px] font-mono text-zinc-500 mt-1 tabular-nums">
              {formatBytes(workingFile.size)} → ~{formatBytes(est.estimatedBytes)} (-{est.reductionPct}%)
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleApplyCompress}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minimize2 className="w-3.5 h-3.5" />}
          <span>Compress Active PDF</span>
        </button>
      </div>
    );
  }

  if (activeSection === 'protect') {
    const handleEncryptActive = async () => {
      const committed = await ensureCommittedFile();
      if (!committed || !userPassword.trim()) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        const res = await protectPdfWithPassword(
          committed,
          {
            userPassword: userPassword.trim(),
            algorithm,
            permissions: {
              printing: allowPrinting ? 'highResolution' : false,
              modifying: false,
              copying: allowCopying,
              annotating: false,
              fillingForms: false,
              contentAccessibility: true,
              documentAssembly: false,
            },
          },
          (percent, status) => onProgress({ percent, status })
        );
        setSidebarOutput({
          title: res.fileName,
          fileName: res.fileName,
          blob: res.blob,
          subtitle: `Encrypted (${res.algorithm}) · ${res.pageCount} pages`,
        });
        onTaskComplete?.({
          headline: 'Encrypted PDF Ready',
          subtext: `${res.fileName} protected with ${res.algorithm}.`,
          statusLabel: 'PDF Encrypted',
          downloadFile: {
            blob: res.blob,
            fileName: res.fileName,
            fileSizeBytes: res.blob.size,
            toolLabel: `Protect PDF (${res.algorithm})`,
            openInStudio: false,
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to protect PDF.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    const handleUnlockUpload = async (file: File) => {
      if (!userPassword.trim()) {
        onError('Enter the current password first before choosing an encrypted PDF.');
        return;
      }
      onError(null);
      setIsWorking(true);
      try {
        const res = await unlockPdfWithPassword(file, userPassword.trim(), (percent, status) =>
          onProgress({ percent, status })
        );
        const unlockedFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
        await commitTransformedFile(unlockedFile, 'Unlocked Password PDF');
        setUserPassword('');
        onTaskComplete?.({
          headline: 'PDF Unlocked into Editor',
          subtext: `${res.fileName} is ready to edit cleanly.`,
          statusLabel: 'PDF Unlocked',
          downloadFile: {
            blob: res.blob,
            fileName: res.fileName,
            fileSizeBytes: res.blob.size,
            toolLabel: 'Unlock PDF',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Incorrect password or unreadable PDF.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <input
          ref={unlockFileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUnlockUpload(f);
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'encrypt' as const, label: 'Lock Active PDF' },
            { id: 'unlock' as const, label: 'Unlock & Load' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setProtectMode(tab.id);
                setSidebarOutput(null);
              }}
              className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                protectMode === tab.id
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
            {protectMode === 'encrypt' ? 'New Open Password' : 'Existing PDF Password'}
          </label>
          <input
            type="password"
            value={userPassword}
            onChange={(e) => setUserPassword(e.target.value)}
            placeholder="Enter password..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs"
          />
        </div>

        {protectMode === 'encrypt' ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {(['AES-256', 'AES-128'] as const).map((alg) => (
                <button
                  key={alg}
                  type="button"
                  onClick={() => setAlgorithm(alg)}
                  className={`py-1.5 rounded-lg border font-mono font-bold cursor-pointer ${
                    algorithm === alg
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {alg}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPrinting}
                  onChange={(e) => setAllowPrinting(e.target.checked)}
                  className="accent-yellow-400"
                />
                <span>Allow Print</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowCopying}
                  onChange={(e) => setAllowCopying(e.target.checked)}
                  className="accent-yellow-400"
                />
                <span>Allow Copy</span>
              </label>
            </div>
            <button
              type="button"
              disabled={!workingFile || !userPassword.trim() || isWorking}
              onClick={handleEncryptActive}
              className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              <span>Export Password-Protected PDF</span>
            </button>
            {renderOutputCard()}
          </>
        ) : (
          <button
            type="button"
            disabled={!userPassword.trim() || isWorking}
            onClick={() => unlockFileRef.current?.click()}
            className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>Select Locked PDF to Unlock &amp; Edit</span>
          </button>
        )}
      </div>
    );
  }

  if (activeSection === 'export-word') {
    const handleExportWord = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        const res = await convertPdfToWord(committed, p2wMode, (percent, status) =>
          onProgress({ percent, status })
        );
        setSidebarOutput({
          title: res.fileName,
          fileName: res.fileName,
          blob: res.blob,
          subtitle: `Word Document · ${res.pageCount} pages`,
        });
        onTaskComplete?.({
          headline: 'Converted Edited PDF to Word',
          subtext: `${res.fileName} ready for download.`,
          statusLabel: 'PDF to Word Ready',
          downloadFile: {
            blob: res.blob,
            fileName: res.fileName,
            fileSizeBytes: res.blob.size,
            toolLabel: 'PDF to Word',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Word export failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'editable' as const, label: 'Editable Text' },
            { id: 'layout' as const, label: 'Preserve Layout' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setP2wMode(m.id)}
              className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                p2wMode === m.id
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleExportWord}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileType2 className="w-3.5 h-3.5" />}
          <span>Convert Active PDF to Word (.docx)</span>
        </button>
        {renderOutputCard()}
      </div>
    );
  }

  if (activeSection === 'export-image') {
    const handleExportImages = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        const res = await convertPdfToImages(
          committed,
          { format: p2iFormat, scale: p2iScale, quality: 0.92, pageRangeExpr: '' },
          (percent, status) => onProgress({ percent, status })
        );
        const blob = res.zipBlob || res.pages[0]?.blob;
        const fileName = res.zipBlob ? res.zipFileName : res.pages[0]?.fileName || 'page.png';
        if (!blob) throw new Error('No page images produced.');
        setSidebarOutput({
          title: fileName,
          fileName,
          blob,
          subtitle: `${res.pages.length} ${p2iFormat.toUpperCase()} page(s)`,
        });
        onTaskComplete?.({
          headline: 'Converted PDF Pages to Images',
          subtext: `${res.pages.length} page image(s) ready.`,
          statusLabel: 'PDF to Image Ready',
          downloadFile: {
            blob,
            fileName,
            fileSizeBytes: blob.size,
            toolLabel: 'PDF to Image',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'PDF to Image export failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-1.5">
          {(['png', 'jpg', 'webp'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setP2iFormat(fmt)}
              className={`py-1.5 rounded-lg border font-mono font-bold uppercase cursor-pointer ${
                p2iFormat === fmt
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([1, 2, 3] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setP2iScale(sc)}
              className={`py-1.5 rounded-lg border font-mono font-semibold cursor-pointer ${
                p2iScale === sc
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {sc}x DPI
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleExportImages}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileImage className="w-3.5 h-3.5" />}
          <span>Export PDF as {p2iFormat.toUpperCase()}</span>
        </button>
        {renderOutputCard()}
      </div>
    );
  }

  if (activeSection === 'export-excel') {
    const handleExportExcel = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        const res = await convertPdfToExcel(
          committed,
          { format: p2eFormat, singleCombinedSheet: p2eSingleSheet },
          (percent, status) => onProgress({ percent, status })
        );
        setSidebarOutput({
          title: res.fileName,
          fileName: res.fileName,
          blob: res.blob,
          subtitle: `${res.totalRows} rows · ${res.pageCount} pages`,
        });
        onTaskComplete?.({
          headline: 'Converted PDF Tables to Spreadsheet',
          subtext: `${res.fileName} (${res.totalRows} rows) ready.`,
          statusLabel: 'PDF to Excel Ready',
          downloadFile: {
            blob: res.blob,
            fileName: res.fileName,
            fileSizeBytes: res.blob.size,
            toolLabel: 'PDF to Excel',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'PDF to Excel export failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          {(['xlsx', 'csv'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setP2eFormat(fmt)}
              className={`py-1.5 rounded-lg border font-mono font-bold uppercase cursor-pointer ${
                p2eFormat === fmt
                  ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              .{fmt}
            </button>
          ))}
        </div>
        {p2eFormat === 'xlsx' && (
          <label className="flex items-center justify-between cursor-pointer text-[11px]">
            <span className="text-zinc-600 dark:text-zinc-400">Combine all pages into 1 sheet</span>
            <input
              type="checkbox"
              checked={p2eSingleSheet}
              onChange={(e) => setP2eSingleSheet(e.target.checked)}
              className="accent-yellow-400"
            />
          </label>
        )}
        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleExportExcel}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Table2 className="w-3.5 h-3.5" />}
          <span>Export PDF to .{p2eFormat.toUpperCase()}</span>
        </button>
        {renderOutputCard()}
      </div>
    );
  }

  if (activeSection === 'export-ppt') {
    const handleExportPpt = async () => {
      const committed = await ensureCommittedFile();
      if (!committed) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        const res = await convertPdfToPpt(committed, { scale: 1.5 }, (percent, status) =>
          onProgress({ percent, status })
        );
        setSidebarOutput({
          title: res.fileName,
          fileName: res.fileName,
          blob: res.blob,
          subtitle: `PowerPoint Deck · ${res.slideCount} slides`,
        });
        onTaskComplete?.({
          headline: 'Converted PDF to PowerPoint',
          subtext: `${res.fileName} (${res.slideCount} slides) ready.`,
          statusLabel: 'PDF to PPT Ready',
          downloadFile: {
            blob: res.blob,
            fileName: res.fileName,
            fileSizeBytes: res.blob.size,
            toolLabel: 'PDF to PPT',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'PDF to PPT export failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <p className="text-zinc-600 dark:text-zinc-400">
          Turn your active PDF pages (including all edits) into a widescreen PowerPoint (.pptx) presentation.
        </p>
        <button
          type="button"
          disabled={!workingFile || isWorking}
          onClick={handleExportPpt}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />}
          <span>Export PDF to PowerPoint (.pptx)</span>
        </button>
        {renderOutputCard()}
      </div>
    );
  }

  // 'import-office': Word -> PDF, Images -> PDF, PPT -> PDF / Image, Excel -> PDF / Image
  if (activeSection === 'import-office') {
    const acceptByKind: Record<typeof importKind, string> = {
      word: '.docx,.doc',
      images: 'image/png,image/jpeg,image/webp',
      ppt: '.pptx,.ppt',
      excel: '.xlsx,.xls,.csv',
    };

    const handleConvertAndLoad = async () => {
      if (importFiles.length === 0) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        let convertedBlob: Blob;
        let convertedName: string;

        if (importKind === 'word') {
          const res = await convertWordToPdf(importFiles[0], 'a4', (p, s) =>
            onProgress({ percent: p, status: s })
          );
          convertedBlob = res.blob;
          convertedName = res.fileName;
        } else if (importKind === 'images') {
          const res = await convertImagesToPdf(importFiles, 'a4', (p, s) =>
            onProgress({ percent: p, status: s })
          );
          convertedBlob = res.blob;
          convertedName = res.fileName;
        } else if (importKind === 'ppt') {
          const res = await convertPptToPdf(importFiles[0], { layout: pptLayout }, (p, s) =>
            onProgress({ percent: p, status: s })
          );
          convertedBlob = res.blob;
          convertedName = res.fileName;
        } else {
          const res = await convertExcelToPdf(
            importFiles[0],
            { orientation: excelOrientation },
            (p, s) => onProgress({ percent: p, status: s })
          );
          convertedBlob = res.blob;
          convertedName = res.fileName;
        }

        const convertedFile = new File([convertedBlob], convertedName, { type: 'application/pdf' });

        if (workingFile && importAppendMode === 'append') {
          const committed = await ensureCommittedFile();
          if (committed) {
            const s1 = await inspectPdfSource(committed);
            const s2 = await inspectPdfSource(convertedFile);
            const merged = await mergeMultiplePdfs(
              [s1, s2],
              committed.name.replace(/\.pdf$/i, ''),
              (p, s) => onProgress({ percent: p, status: s })
            );
            const mergedFile = new File([merged.blob], committed.name, { type: 'application/pdf' });
            await commitTransformedFile(mergedFile, `Appended ${convertedName}`);
          }
        } else {
          await commitTransformedFile(convertedFile, `Imported ${importFiles[0].name}`);
        }

        setImportFiles([]);
        onTaskComplete?.({
          headline: 'Converted & Loaded into Edit PDF',
          subtext: `${convertedName} is ready on the interactive canvas.`,
          statusLabel: 'Office Import Ready',
          downloadFile: {
            blob: convertedBlob,
            fileName: convertedName,
            fileSizeBytes: convertedBlob.size,
            toolLabel: 'Office Import',
          },
        });
      } catch (err: any) {
        onError(err?.message || 'Failed to convert file.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    const handleOfficeToImages = async () => {
      if (importFiles.length === 0 || (importKind !== 'ppt' && importKind !== 'excel')) return;
      onError(null);
      setSidebarOutput(null);
      setIsWorking(true);
      try {
        if (importKind === 'ppt') {
          const res = await convertPptToImages(importFiles[0], { format: 'png', scale: 2 }, (p, s) =>
            onProgress({ percent: p, status: s })
          );
          const blob = res.zipBlob || res.slides[0]?.blob;
          const fileName = res.zipBlob ? res.zipFileName : res.slides[0]?.fileName || 'slide.png';
          if (blob) setSidebarOutput({ title: fileName, fileName, blob, subtitle: `${res.slides.length} slide images` });
        } else {
          const res = await convertExcelToImages(importFiles[0], { format: 'png' }, (p, s) =>
            onProgress({ percent: p, status: s })
          );
          const blob = res.zipBlob || res.pages[0]?.blob;
          const fileName = res.zipBlob ? res.zipFileName : res.pages[0]?.fileName || 'sheet.png';
          if (blob) setSidebarOutput({ title: fileName, fileName, blob, subtitle: `${res.pages.length} sheet images` });
        }
      } catch (err: any) {
        onError(err?.message || 'Image export failed.');
      } finally {
        setIsWorking(false);
        onProgress(null);
      }
    };

    return (
      <div className="space-y-3 text-xs">
        <input
          ref={importInputRef}
          type="file"
          accept={acceptByKind[importKind]}
          multiple={importKind === 'images'}
          className="hidden"
          onChange={(e) => {
            setImportFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'word' as const, label: 'Word → PDF', icon: FileText },
            { id: 'images' as const, label: 'Images → PDF', icon: ImageIcon },
            { id: 'ppt' as const, label: 'PPT → PDF/Img', icon: Presentation },
            { id: 'excel' as const, label: 'Excel → PDF/Img', icon: FileSpreadsheet },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setImportKind(k.id);
                  setImportFiles([]);
                  setSidebarOutput(null);
                }}
                className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer inline-flex items-center justify-center gap-1 ${
                  importKind === k.id
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{k.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 font-semibold cursor-pointer text-zinc-700 dark:text-zinc-300 truncate"
        >
          {importFiles.length > 0
            ? `${importFiles.length} file(s): ${importFiles[0].name}`
            : `Select ${importKind.toUpperCase()} file(s)...`}
        </button>

        {importKind === 'ppt' && (
          <select
            value={pptLayout}
            onChange={(e) => setPptLayout(e.target.value as PptToPdfLayout)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs"
          >
            <option value="slide-fit">Slide Fit (16:9 / 4:3)</option>
            <option value="a4-landscape">A4 Landscape</option>
            <option value="a4-portrait">A4 Portrait</option>
          </select>
        )}

        {importKind === 'excel' && (
          <select
            value={excelOrientation}
            onChange={(e) => setExcelOrientation(e.target.value as ExcelPdfOrientation)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs"
          >
            <option value="landscape">Landscape Sheet</option>
            <option value="portrait">Portrait Sheet</option>
          </select>
        )}

        {workingFile && (
          <div className="grid grid-cols-2 gap-1.5">
            {(['append', 'replace'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setImportAppendMode(m)}
                className={`py-1 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  importAppendMode === m
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {m === 'append' ? 'Append to Active' : 'Open as New PDF'}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={importFiles.length === 0 || isWorking}
          onClick={handleConvertAndLoad}
          className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <span>
            {workingFile && importAppendMode === 'append' ? 'Convert & Append to PDF' : 'Convert & Open in Editor'}
          </span>
        </button>

        {(importKind === 'ppt' || importKind === 'excel') && (
          <button
            type="button"
            disabled={importFiles.length === 0 || isWorking}
            onClick={handleOfficeToImages}
            className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 disabled:opacity-40 font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Export {importKind.toUpperCase()} directly as PNG Images</span>
          </button>
        )}

        {renderOutputCard()}
      </div>
    );
  }

  return null;
};
