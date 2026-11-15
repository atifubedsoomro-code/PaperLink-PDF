import React, { useEffect, useRef, useState } from 'react';
import {
  FileType2,
  FileText,
  Layers,
  Minimize2,
  Scissors,
  Image as ImageIcon,
  RotateCw,
  PenTool,
  Upload,
  Download,
  ArrowUp,
  ArrowDown,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Plus,
  RotateCcw,
  Edit3,
  Lock,
  FileImage,
} from 'lucide-react';
import {
  PdfToWordMode,
  CompressionLevel,
  SplitMode,
  PdfToWordResult,
  WordToPdfResult,
  PdfMergeSource,
  PdfMergeResult,
  PdfCompressResult,
  PdfSplitResult,
  ImagesToPdfResult,
  PdfPageThumb,
  PdfTransformResult,
  PdfSignResult,
  convertPdfToWord,
  convertWordToPdf,
  inspectPdfSource,
  mergeMultiplePdfs,
  compressPdfFile,
  splitPdfFile,
  convertImagesToPdf,
  inspectPdfThumbnails,
  transformPdfPages,
  signAndStampPdf,
  estimateCompressedPdfSize,
} from '../services/pdfToolkit';
import { renderPdfPages } from '../services/documentParser';
import { PdfEditorTool } from './PdfEditorTool';
import { PdfProtectTool } from './PdfProtectTool';
import { PdfToImageTool } from './PdfToImageTool';

export type PdfToolTab =
  | 'pdf-to-word'
  | 'word-to-pdf'
  | 'pdf-to-image'
  | 'pdf-merge'
  | 'pdf-compress'
  | 'pdf-split'
  | 'image-to-pdf'
  | 'pdf-organize'
  | 'pdf-sign'
  | 'pdf-edit'
  | 'pdf-protect';

interface PdfToolsPanelProps {
  activeTool: PdfToolTab;
  onToolChange: (tool: PdfToolTab) => void;
  onSendPdfToCoverStudio: (file: File) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TOOL_TABS: { id: PdfToolTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pdf-to-word', label: 'PDF to Word', icon: FileType2 },
  { id: 'word-to-pdf', label: 'Word to PDF', icon: FileText },
  { id: 'pdf-to-image', label: 'PDF to Image', icon: FileImage },
  { id: 'pdf-merge', label: 'PDF Merge', icon: Layers },
  { id: 'pdf-compress', label: 'Compress', icon: Minimize2 },
  { id: 'pdf-split', label: 'Split / Extract', icon: Scissors },
  { id: 'image-to-pdf', label: 'Images to PDF', icon: ImageIcon },
  { id: 'pdf-organize', label: 'Rotate & Delete', icon: RotateCw },
  { id: 'pdf-sign', label: 'Sign & Stamp', icon: PenTool },
  { id: 'pdf-edit', label: 'Edit PDF', icon: Edit3 },
  { id: 'pdf-protect', label: 'Protect PDF', icon: Lock },
];

export const PdfToolsPanel: React.FC<PdfToolsPanelProps> = ({
  activeTool,
  onToolChange,
  onSendPdfToCoverStudio,
  onTaskComplete,
}) => {
  // Common feedback states
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. PDF -> Word
  const p2wInputRef = useRef<HTMLInputElement>(null);
  const [p2wFile, setP2wFile] = useState<File | null>(null);
  const [p2wMode, setP2wMode] = useState<PdfToWordMode>('editable');
  const [p2wResult, setP2wResult] = useState<PdfToWordResult | null>(null);

  // 2. Word -> PDF
  const w2pInputRef = useRef<HTMLInputElement>(null);
  const [w2pFile, setW2pFile] = useState<File | null>(null);
  const [w2pPaper, setW2pPaper] = useState<'a4' | 'letter'>('a4');
  const [w2pResult, setW2pResult] = useState<WordToPdfResult | null>(null);

  // 3. PDF Merge
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [mergeSources, setMergeSources] = useState<PdfMergeSource[]>([]);
  const [mergeOutputName, setMergeOutputName] = useState('merged_document');
  const [mergeResult, setMergeResult] = useState<PdfMergeResult | null>(null);

  // 4. PDF Compress
  const compressInputRef = useRef<HTMLInputElement>(null);
  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressLevel, setCompressLevel] = useState<CompressionLevel>('balanced');
  const [compressQualityPct, setCompressQualityPct] = useState<number>(70);
  const [compressResult, setCompressResult] = useState<PdfCompressResult | null>(null);

  // 5. PDF Split
  const splitInputRef = useRef<HTMLInputElement>(null);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitPageCount, setSplitPageCount] = useState<number>(0);
  const [splitMode, setSplitMode] = useState<SplitMode>('extract-range');
  const [splitExpr, setSplitExpr] = useState('1-3');
  const [splitResult, setSplitResult] = useState<PdfSplitResult | null>(null);

  // 6. Image to PDF
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imgPaper, setImgPaper] = useState<'a4' | 'letter' | 'fit'>('a4');
  const [imgResult, setImgResult] = useState<ImagesToPdfResult | null>(null);

  // 7. Rotate / Delete / Reorder Pages
  const orgInputRef = useRef<HTMLInputElement>(null);
  const [orgFile, setOrgFile] = useState<File | null>(null);
  const [orgThumbs, setOrgThumbs] = useState<PdfPageThumb[]>([]);
  const [orgResult, setOrgResult] = useState<PdfTransformResult | null>(null);

  // 8. Sign & Stamp PDF
  const signInputRef = useRef<HTMLInputElement>(null);
  const stampImgInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [signPagePreviews, setSignPagePreviews] = useState<string[]>([]);
  const [signTargetPage, setSignTargetPage] = useState<number>(1);
  const [sigPos, setSigPos] = useState<{ x: number; y: number }>({ x: 0.62, y: 0.78 });
  const [sigWidthFrac, setSigWidthFrac] = useState<number>(0.24);
  const [sigColor, setSigColor] = useState<string>('#0f172a');
  const [sigNote, setSigNote] = useState<string>('');
  const [uploadedStampUrl, setUploadedStampUrl] = useState<string | null>(null);
  const [hasDrawnSig, setHasDrawnSig] = useState(false);
  const [signResult, setSignResult] = useState<PdfSignResult | null>(null);
  const isDrawingRef = useRef(false);

  const resetFeedback = () => {
    setErrorMsg(null);
    setProgress(null);
  };

  const openGeneratedPdfInStudio = (blob: Blob, fileName: string) => {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    onSendPdfToCoverStudio(file);
  };

  // --- Handlers: Tools 1..4 ---
  const handleRunPdfToWord = async () => {
    if (!p2wFile) return;
    resetFeedback();
    setP2wResult(null);
    setIsWorking(true);
    try {
      const res = await convertPdfToWord(p2wFile, p2wMode, (percent, status) =>
        setProgress({ percent, status })
      );
      setP2wResult(res);
      onTaskComplete?.({
        headline: 'PDF Converted to Word (.docx)',
        subtext: `${res.fileName} (${res.pageCount} pages) ready for download`,
        statusLabel: 'PDF to Word Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert PDF to Word.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunWordToPdf = async () => {
    if (!w2pFile) return;
    resetFeedback();
    setW2pResult(null);
    setIsWorking(true);
    try {
      const res = await convertWordToPdf(w2pFile, w2pPaper, (percent, status) =>
        setProgress({ percent, status })
      );
      setW2pResult(res);
      onTaskComplete?.({
        headline: 'Word Converted to Paginated PDF',
        subtext: `${res.fileName} (${res.pageCount} pages) ready to save or add QR cover`,
        statusLabel: 'Word to PDF Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert Word file to PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleAddMergeFiles = async (fileList: FileList | File[]) => {
    resetFeedback();
    setMergeResult(null);
    const added: PdfMergeSource[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMsg(`Skipped "${file.name}" — only PDF files can be merged.`);
        continue;
      }
      try {
        const info = await inspectPdfSource(file);
        added.push(info);
      } catch {
        setErrorMsg(`Could not read "${file.name}". Ensure it is a valid PDF.`);
      }
    }
    if (added.length > 0) setMergeSources((prev) => [...prev, ...added]);
  };

  const moveMergeItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= mergeSources.length) return;
    setMergeSources((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setMergeResult(null);
  };

  const handleRunMerge = async () => {
    if (mergeSources.length < 2) {
      setErrorMsg('Add at least 2 PDF files to merge.');
      return;
    }
    resetFeedback();
    setMergeResult(null);
    setIsWorking(true);
    try {
      const res = await mergeMultiplePdfs(mergeSources, mergeOutputName, (percent, status) =>
        setProgress({ percent, status })
      );
      setMergeResult(res);
      onTaskComplete?.({
        headline: `Merged ${res.totalPages} Pages Into Single PDF`,
        subtext: `${res.fileName} is ready for download or Cover Studio`,
        statusLabel: 'PDF Merge Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to merge PDFs.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunCompress = async () => {
    if (!compressFile) return;
    resetFeedback();
    setCompressResult(null);
    setIsWorking(true);
    try {
      const res = await compressPdfFile(
        compressFile,
        compressLevel,
        (percent, status) => setProgress({ percent, status }),
        compressQualityPct
      );
      setCompressResult(res);
      const savedPct = Math.max(
        0,
        Math.round(((res.originalSize - res.compressedSize) / Math.max(1, res.originalSize)) * 100)
      );
      onTaskComplete?.({
        headline: 'PDF Compressed Successfully',
        subtext: res.keptOriginalBecauseSmaller
          ? `Already tightly packed — original ${formatBytes(res.originalSize)} preserved`
          : `Reduced by ${savedPct}% (${formatBytes(res.originalSize)} -> ${formatBytes(res.compressedSize)})`,
        statusLabel: 'PDF Compression Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to compress PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  // --- Handlers: Tool 5 Split ---
  const handleSelectSplitFile = async (f: File) => {
    resetFeedback();
    setSplitFile(f);
    setSplitResult(null);
    try {
      const info = await inspectPdfSource(f);
      setSplitPageCount(info.pageCount);
      setSplitExpr(info.pageCount > 1 ? `1-${Math.min(3, info.pageCount)}` : '1');
    } catch {
      setErrorMsg('Could not read page count from this PDF.');
    }
  };

  const handleRunSplit = async () => {
    if (!splitFile) return;
    resetFeedback();
    setSplitResult(null);
    setIsWorking(true);
    try {
      const res = await splitPdfFile(splitFile, splitMode, splitExpr, (percent, status) =>
        setProgress({ percent, status })
      );
      setSplitResult(res);
      onTaskComplete?.({
        headline: `Extracted ${res.files.length} PDF File${res.files.length === 1 ? '' : 's'}`,
        subtext: 'Your split PDF files are ready for instant download',
        statusLabel: 'PDF Split Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to split PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  // --- Handlers: Tool 6 Image to PDF ---
  const handleAddImageFiles = (list: FileList | File[]) => {
    resetFeedback();
    setImgResult(null);
    const valid = Array.from(list).filter((f) =>
      /\.(jpe?g|png|webp)$/i.test(f.name) || f.type.startsWith('image/')
    );
    if (valid.length === 0) {
      setErrorMsg('Select JPG, PNG, or WebP images.');
      return;
    }
    setImageFiles((prev) => [...prev, ...valid]);
  };

  const moveImageItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= imageFiles.length) return;
    setImageFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setImgResult(null);
  };

  const handleRunImagesToPdf = async () => {
    if (imageFiles.length === 0) return;
    resetFeedback();
    setImgResult(null);
    setIsWorking(true);
    try {
      const res = await convertImagesToPdf(imageFiles, imgPaper, (percent, status) =>
        setProgress({ percent, status })
      );
      setImgResult(res);
      onTaskComplete?.({
        headline: `Built ${res.pageCount}-Page PDF From Images`,
        subtext: `${res.fileName} is ready to download or open in Cover Studio`,
        statusLabel: 'Images to PDF Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to build PDF from images.');
    } finally {
      setIsWorking(false);
    }
  };

  // --- Handlers: Tool 7 Rotate / Delete / Reorder ---
  const handleSelectOrganizeFile = async (f: File) => {
    resetFeedback();
    setOrgFile(f);
    setOrgThumbs([]);
    setOrgResult(null);
    setIsWorking(true);
    try {
      const thumbs = await inspectPdfThumbnails(f, (percent, status) =>
        setProgress({ percent, status })
      );
      setOrgThumbs(thumbs);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not extract page thumbnails.');
    } finally {
      setIsWorking(false);
      setProgress(null);
    }
  };

  const handleRunTransform = async () => {
    if (!orgFile || orgThumbs.length === 0) return;
    resetFeedback();
    setOrgResult(null);
    setIsWorking(true);
    try {
      const res = await transformPdfPages(orgFile, orgThumbs, (percent, status) =>
        setProgress({ percent, status })
      );
      setOrgResult(res);
      onTaskComplete?.({
        headline: `Rebuilt ${res.pageCount}-Page PDF Document`,
        subtext: 'Page rotations and deletions applied cleanly',
        statusLabel: 'PDF Organize Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to rebuild PDF pages.');
    } finally {
      setIsWorking(false);
    }
  };

  // --- Handlers: Tool 8 Sign & Stamp ---
  const handleSelectSignFile = async (f: File) => {
    resetFeedback();
    setSignFile(f);
    setSignResult(null);
    setSignTargetPage(1);
    setIsWorking(true);
    try {
      const buf = await f.arrayBuffer();
      const previews = await renderPdfPages(buf, 12);
      setSignPagePreviews(previews);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not render PDF pages for placement.');
    } finally {
      setIsWorking(false);
    }
  };

  // Initialize signature canvas smoothly
  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = sigColor;
    }
  }, [sigColor, activeTool]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const clearSignaturePad = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawnSig(false);
    setUploadedStampUrl(null);
  };

  const handleRunSignPdf = async () => {
    if (!signFile) return;
    let sigDataUrl = uploadedStampUrl;
    if (!sigDataUrl && hasDrawnSig && sigCanvasRef.current) {
      sigDataUrl = sigCanvasRef.current.toDataURL('image/png');
    }
    if (!sigDataUrl) {
      setErrorMsg('Draw your signature or upload a stamp PNG first.');
      return;
    }

    resetFeedback();
    setSignResult(null);
    setIsWorking(true);
    try {
      const res = await signAndStampPdf(
        signFile,
        {
          pageNumber: signTargetPage,
          xFraction: sigPos.x,
          yFraction: sigPos.y,
          widthFraction: sigWidthFrac,
          dataUrl: sigDataUrl,
          signerNote: sigNote,
        },
        (percent, status) => setProgress({ percent, status })
      );
      setSignResult(res);
      onTaskComplete?.({
        headline: 'Signature Applied to PDF',
        subtext: `${res.fileName} is signed and ready for download`,
        statusLabel: 'PDF Signature Complete',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to stamp signature onto PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & 11-Tool Selector */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
            PaperLink Local PDF &amp; Word Toolkit
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            11 private tools executing locally in your browser without server uploads — send any result straight into Cover Studio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
          {TOOL_TABS.map((tab) => {
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
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-yellow-400 text-black font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Error / Progress Banner */}
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
        <div className="p-4 rounded-xl border border-yellow-400/40 bg-yellow-400/10 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-yellow-300">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress.status}
            </span>
            <span className="font-mono tabular-nums">{progress.percent}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-900 overflow-hidden">
            <div
              className="h-full bg-yellow-400 transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* TOOL 1: PDF TO WORD */}
      {activeTool === 'pdf-to-word' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert PDF to Microsoft Word (.docx)
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Extract structured headings and paragraphs for editing, or preserve visual layout per page for complex forms.
              </p>
            </div>

            <input
              ref={p2wInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setP2wFile(f);
                  setP2wResult(null);
                  resetFeedback();
                }
              }}
            />

            <div
              onClick={() => p2wInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setP2wFile(f);
                  setP2wResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {p2wFile ? p2wFile.name : 'Select or drop a PDF file'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                {p2wFile ? `${formatBytes(p2wFile.size)} · Click to replace` : 'Supports single and multi-page PDF files'}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Conversion Mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setP2wMode('editable')}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    p2wMode === 'editable'
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <p className="text-xs font-bold">Editable Text & Headings</p>
                  <p className="text-[11px] opacity-80 mt-1">
                    Reconstructs headings and paragraphs selectable in Word.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setP2wMode('layout')}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    p2wMode === 'layout'
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <p className="text-xs font-bold">Preserve Exact Visual Layout</p>
                  <p className="text-[11px] opacity-80 mt-1">
                    Best for scanned pages, certificates, and complex tables.
                  </p>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunPdfToWord}
              disabled={!p2wFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType2 className="w-4 h-4" />}
              <span>{isWorking ? 'Converting PDF to Word...' : 'Convert to .DOCX'}</span>
            </button>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            {p2wResult ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Word Document Ready</h3>
                </div>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Output File</span>
                    <span className="font-mono text-zinc-900 dark:text-white truncate max-w-[200px]">
                      {p2wResult.fileName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Pages Processed</span>
                    <span className="font-mono text-zinc-900 dark:text-white tabular-nums">
                      {p2wResult.pageCount}
                    </span>
                  </div>
                  {p2wResult.mode === 'editable' && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Extracted Words</span>
                      <span className="font-mono text-zinc-900 dark:text-white tabular-nums">
                        {p2wResult.wordCount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Generated Size</span>
                    <span className="font-mono text-amber-700 dark:text-yellow-400 tabular-nums">
                      {formatBytes(p2wResult.blob.size)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(p2wResult.blob, p2wResult.fileName)}
                  className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {p2wResult.fileName}</span>
                </button>
              </div>
            ) : (
              <div className="my-auto text-center py-10 space-y-2">
                <FileType2 className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  No Conversion Output Yet
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Upload a PDF on the left and run conversion to download a standard Microsoft Word (.docx) archive.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 2: WORD TO PDF */}
      {activeTool === 'word-to-pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert Word (.docx) to PDF
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Preserves headings, paragraphs, numbered lists, and tables as crisp vector PDF pages.
              </p>
            </div>

            <input
              ref={w2pInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setW2pFile(f);
                  setW2pResult(null);
                  resetFeedback();
                }
              }}
            />

            <div
              onClick={() => w2pInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setW2pFile(f);
                  setW2pResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {w2pFile ? w2pFile.name : 'Select or drop a Microsoft Word (.docx) file'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                {w2pFile ? `${formatBytes(w2pFile.size)} · Click to replace` : 'Standard Office Open XML (.docx) documents'}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Target Page Dimensions
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setW2pPaper('a4')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    w2pPaper === 'a4'
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  A4 (210 × 297 mm)
                </button>
                <button
                  type="button"
                  onClick={() => setW2pPaper('letter')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    w2pPaper === 'letter'
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  US Letter (8.5 × 11 in)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunWordToPdf}
              disabled={!w2pFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{isWorking ? 'Generating Vector PDF...' : 'Convert to PDF'}</span>
            </button>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            {w2pResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">PDF Created</h3>
                  </div>
                  <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {w2pResult.pageCount} pages · {formatBytes(w2pResult.blob.size)}
                  </span>
                </div>

                <div className="bg-zinc-50 dark:bg-white text-zinc-900 rounded-xl p-5 max-h-64 overflow-y-auto text-xs leading-relaxed border border-zinc-200 dark:border-zinc-300 prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: w2pResult.previewHtml }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => triggerBlobDownload(w2pResult.blob, w2pResult.fileName)}
                    className="py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openGeneratedPdfInStudio(w2pResult.blob, w2pResult.fileName)}
                    className="py-3 px-4 rounded-xl border border-yellow-500/40 bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-bold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Add QR Cover in Studio</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="my-auto text-center py-10 space-y-2">
                <FileText className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Ready for Word Conversion
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Upload a .docx file to convert it into a paginated PDF—then either download or attach a QR Cover Page directly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 3: PDF MERGE */}
      {activeTool === 'pdf-merge' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Merge Multiple PDFs</h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Reorder documents and optionally enter page ranges (e.g. 1-3, 5). Leave blank for all pages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => mergeInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add PDF Files</span>
              </button>
              <input
                ref={mergeInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleAddMergeFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {mergeSources.length === 0 ? (
              <div
                onClick={() => mergeInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) handleAddMergeFiles(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-10 text-center cursor-pointer transition-colors"
              >
                <Layers className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-900 dark:text-white">
                  Select or drop 2+ PDF files to combine
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Files stay private in browser memory while merging
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                {mergeSources.map((src, idx) => (
                  <div
                    key={src.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-zinc-800 text-amber-700 dark:text-yellow-400 font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{src.name}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                          {src.pageCount} pages · {formatBytes(src.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={src.pageRange || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMergeSources((prev) =>
                            prev.map((item) => (item.id === src.id ? { ...item, pageRange: val } : item))
                          );
                          setMergeResult(null);
                        }}
                        placeholder={`Pages (1-${src.pageCount})`}
                        aria-label={`Page range for ${src.name}`}
                        className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => moveMergeItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMergeItem(idx, 1)}
                        disabled={idx === mergeSources.length - 1}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMergeSources((prev) => prev.filter((item) => item.id !== src.id));
                          setMergeResult(null);
                        }}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Merge Settings</h3>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Output File Name
                </label>
                <input
                  type="text"
                  value={mergeOutputName}
                  onChange={(e) => setMergeOutputName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Queued PDFs</span>
                  <span className="font-mono text-zinc-900 dark:text-white tabular-nums">{mergeSources.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Source Pages Total</span>
                  <span className="font-mono text-zinc-900 dark:text-white tabular-nums">
                    {mergeSources.reduce((acc, s) => acc + s.pageCount, 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleRunMerge}
                disabled={mergeSources.length < 2 || isWorking}
                className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                <span>{isWorking ? 'Merging PDFs...' : 'Combine into Single PDF'}</span>
              </button>

              {mergeResult && (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Merged ({mergeResult.totalPages} pages)
                    </span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {formatBytes(mergeResult.blob.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerBlobDownload(mergeResult.blob, mergeResult.fileName)}
                    className="w-full py-2.5 px-3 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {mergeResult.fileName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openGeneratedPdfInStudio(mergeResult.blob, mergeResult.fileName)}
                    className="w-full py-2 px-3 rounded-lg border border-yellow-500/40 bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Attach QR Cover in Studio</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOOL 4: PDF COMPRESS */}
      {activeTool === 'pdf-compress' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Compress PDF File Size</h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Optimize internal PDF object streams losslessly, or downsample image-heavy scans to lower DPI.
              </p>
            </div>

            <input
              ref={compressInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCompressFile(f);
                  setCompressResult(null);
                  resetFeedback();
                }
              }}
            />

            <div
              onClick={() => compressInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setCompressFile(f);
                  setCompressResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {compressFile ? compressFile.name : 'Select or drop a PDF to compress'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                {compressFile
                  ? `Original size: ${formatBytes(compressFile.size)}`
                  : 'Works on reports, scans, and exported PDF decks'}
              </p>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Compression Profile &amp; Strength Slider
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { id: 'lossless' as CompressionLevel, pct: 100, title: 'Lossless Clean', desc: 'Preserves vector text via object streams.' },
                  { id: 'balanced' as CompressionLevel, pct: 70, title: 'Balanced (144 DPI)', desc: 'Ideal for email sharing with clear readability.' },
                  { id: 'maximum' as CompressionLevel, pct: 35, title: 'Compact (100 DPI)', desc: 'Smallest size for large scanned packets.' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setCompressLevel(opt.id);
                      setCompressQualityPct(opt.pct);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      compressLevel === opt.id
                        ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.title}</p>
                    <p className="text-[11px] opacity-80 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Continuous Compression Strength Slider + Live Approximate Size Reducer */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Compression Quality &amp; DPI Slider
                  </span>
                  <span className="font-mono font-bold text-amber-700 dark:text-yellow-400 tabular-nums">
                    {compressQualityPct >= 96 ? '100% (Lossless)' : `${compressQualityPct}% Quality`}
                  </span>
                </div>

                <input
                  type="range"
                  min={15}
                  max={100}
                  step={1}
                  value={compressQualityPct}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setCompressQualityPct(val);
                    setCompressLevel(val >= 96 ? 'lossless' : val >= 55 ? 'balanced' : 'maximum');
                  }}
                  aria-label="PDF compression strength slider"
                  className="w-full accent-yellow-400 cursor-pointer"
                />

                <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                  <span>Max Size Reduction (15%)</span>
                  <span>Balanced (70%)</span>
                  <span>Lossless Vector (100%)</span>
                </div>

                {compressFile && (() => {
                  const est = estimateCompressedPdfSize(
                    compressFile.size,
                    compressQualityPct,
                    compressLevel
                  );
                  const remainingPct = Math.max(5, Math.min(100, 100 - est.reductionPct));
                  return (
                    <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Approx. Estimated Output
                        </span>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                          ~{formatBytes(est.estimatedBytes)}{' '}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            (~{est.reductionPct}% smaller)
                          </span>
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 dark:bg-yellow-400 transition-all duration-150"
                          style={{ width: `${remainingPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunCompress}
              disabled={!compressFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minimize2 className="w-4 h-4" />}
              <span>{isWorking ? 'Compressing PDF...' : 'Compress PDF'}</span>
            </button>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            {compressResult ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Compression Report</h3>
                </div>
                {compressResult.keptOriginalBecauseSmaller && (
                  <p className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
                    This PDF is already tightly packed—original bytes were preserved cleanly.
                  </p>
                )}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Original Size</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatBytes(compressResult.originalSize)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Output Size</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-yellow-400 tabular-nums">
                      {formatBytes(compressResult.compressedSize)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400">Net Reduction</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {compressResult.originalSize > 0
                        ? `${Math.max(
                            0,
                            Math.round(
                              ((compressResult.originalSize - compressResult.compressedSize) /
                                compressResult.originalSize) *
                                100
                            )
                          )}% saved`
                        : '0%'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => triggerBlobDownload(compressResult.blob, compressResult.fileName)}
                    className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Compressed PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openGeneratedPdfInStudio(compressResult.blob, compressResult.fileName)}
                    className="w-full py-2.5 px-4 rounded-xl border border-yellow-500/40 bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Add QR Cover in Studio</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="my-auto text-center py-10 space-y-2">
                <Minimize2 className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Ready for Optimization
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Select any PDF to shrink its file size cleanly for sharing, printing, or Google Drive upload.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 5: PDF SPLIT & EXTRACT */}
      {activeTool === 'pdf-split' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Split PDF & Extract Pages</h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Extract specific pages (e.g. 2-5, 9) into a clean PDF or split a multi-chapter dossier into equal parts.
              </p>
            </div>

            <input
              ref={splitInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSelectSplitFile(f);
              }}
            />

            <div
              onClick={() => splitInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleSelectSplitFile(f);
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <Scissors className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {splitFile ? splitFile.name : 'Select or drop a multi-page PDF'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                {splitFile ? `${splitPageCount} total pages · ${formatBytes(splitFile.size)}` : 'Any PDF length'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSplitMode('extract-range');
                  setSplitExpr(splitPageCount > 1 ? `1-${Math.min(3, splitPageCount)}` : '1');
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer ${
                  splitMode === 'extract-range'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Extract Custom Pages</p>
                <p className="text-[11px] opacity-80 mt-0.5">e.g. 1-3, 6, 8-10</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplitMode('fixed-chunks');
                  setSplitExpr('2');
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer ${
                  splitMode === 'fixed-chunks'
                    ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <p className="text-xs font-bold">Split Every N Pages</p>
                <p className="text-[11px] opacity-80 mt-0.5">Generates multiple PDF parts</p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                {splitMode === 'extract-range'
                  ? `Page Range (1 to ${splitPageCount || '?'})`
                  : 'Pages Per Part'}
              </label>
              <input
                type={splitMode === 'fixed-chunks' ? 'number' : 'text'}
                min={1}
                value={splitExpr}
                onChange={(e) => setSplitExpr(e.target.value)}
                placeholder={splitMode === 'extract-range' ? '1-3, 5' : '2'}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleRunSplit}
              disabled={!splitFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
              <span>{splitMode === 'extract-range' ? 'Extract Selected Pages' : 'Split PDF Into Parts'}</span>
            </button>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            {splitResult ? (
              <>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Generated {splitResult.files.length} PDF {splitResult.files.length === 1 ? 'File' : 'Files'}
                  </h3>
                </div>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 max-h-80 overflow-y-auto">
                  {splitResult.files.map((item) => (
                    <div key={item.fileName} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{item.fileName}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {item.label} · {item.pageCount} pages · {formatBytes(item.blob.size)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => triggerBlobDownload(item.blob, item.fileName)}
                          className="p-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black cursor-pointer"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openGeneratedPdfInStudio(item.blob, item.fileName)}
                          className="px-2.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-yellow-300 text-xs font-bold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Cover</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="my-auto text-center py-12 space-y-2">
                <Scissors className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No Extracted Parts Yet</h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Choose a page range or chunk size on the left to generate separate clean PDF files.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 6: IMAGE TO PDF */}
      {activeTool === 'image-to-pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Images to PDF Scan Pack</h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Combine mobile photos, receipts, or PNG/JPG/WebP scans into a single printable PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={() => imgInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Images</span>
              </button>
              <input
                ref={imgInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleAddImageFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {imageFiles.length === 0 ? (
              <div
                onClick={() => imgInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) handleAddImageFiles(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-10 text-center cursor-pointer transition-colors"
              >
                <ImageIcon className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-900 dark:text-white">Select or drop JPG, PNG, or WebP scans</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Reorder images before building your PDF packet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 max-h-72 overflow-y-auto">
                {imageFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded bg-zinc-200 dark:bg-zinc-800 text-amber-700 dark:text-yellow-400 font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">{file.name}</span>
                      <span className="text-zinc-500 shrink-0 tabular-nums">{formatBytes(file.size)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveImageItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImageItem(idx, 1)}
                        disabled={idx === imageFiles.length - 1}
                        className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'a4', label: 'A4 Fit' },
                { id: 'letter', label: 'US Letter' },
                { id: 'fit', label: 'Original Size' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setImgPaper(opt.id)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                    imgPaper === opt.id
                      ? 'border-yellow-400 bg-yellow-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunImagesToPdf}
              disabled={imageFiles.length === 0 || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              <span>Build PDF from {imageFiles.length} Image(s)</span>
            </button>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-center">
            {imgResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Scan PDF Ready</h3>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {imgResult.pageCount} pages · {formatBytes(imgResult.blob.size)}
                </p>
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(imgResult.blob, imgResult.fileName)}
                  className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {imgResult.fileName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGeneratedPdfInStudio(imgResult.blob, imgResult.fileName)}
                  className="w-full py-2.5 px-4 rounded-xl border border-yellow-500/40 bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Attach QR Cover in Studio</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <ImageIcon className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto" />
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Combine receipts, IDs, or whiteboard photos into one structured PDF ready for Drive sync.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 7: ROTATE, DELETE & REORDER PAGES */}
      {activeTool === 'pdf-organize' && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Rotate, Reorder & Delete PDF Pages</h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                Fix upside-down scans, drop blank pages, or rearrange page sequence before attaching a QR cover.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={orgInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelectOrganizeFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => orgInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg bg-zinc-900 text-yellow-300 border border-zinc-700 text-xs font-bold cursor-pointer"
              >
                {orgFile ? 'Load Another PDF' : 'Select PDF'}
              </button>
              {orgThumbs.length > 0 && (
                <button
                  type="button"
                  onClick={handleRunTransform}
                  disabled={isWorking}
                  className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer"
                >
                  Save Updated PDF
                </button>
              )}
            </div>
          </div>

          {orgThumbs.length === 0 ? (
            <div
              onClick={() => orgInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-10 text-center cursor-pointer"
            >
              <RotateCw className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">Select a PDF to inspect thumbnails</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {orgThumbs.map((page, idx) => (
                <div
                  key={page.pageNumber}
                  className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                    page.deleted
                      ? 'opacity-40 border-red-400/50 bg-red-50/40 dark:bg-red-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <div className="aspect-[3/4] bg-white rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                    <img
                      src={page.thumbnailUrl}
                      alt={`Page ${page.pageNumber}`}
                      style={{ transform: `rotate(${page.rotationDelta}deg)` }}
                      className="max-w-full max-h-full object-contain transition-transform"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                    <span>Orig P{page.pageNumber}</span>
                    {page.rotationDelta !== 0 && <span className="text-amber-600 dark:text-yellow-400">{page.rotationDelta}°</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOrgThumbs((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, rotationDelta: (t.rotationDelta + 90) % 360 } : t))
                        );
                        setOrgResult(null);
                      }}
                      title="Rotate 90° clockwise"
                      className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-yellow-400 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return;
                        setOrgThumbs((prev) => {
                          const next = [...prev];
                          const [m] = next.splice(idx, 1);
                          next.splice(idx - 1, 0, m);
                          return next;
                        });
                      }}
                      disabled={idx === 0}
                      title="Move earlier"
                      className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrgThumbs((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, deleted: !t.deleted } : t))
                        );
                        setOrgResult(null);
                      }}
                      title={page.deleted ? 'Restore page' : 'Delete page'}
                      className={`p-1.5 rounded border cursor-pointer ${
                        page.deleted
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:text-red-500'
                      }`}
                    >
                      {page.deleted ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {orgResult && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Organized PDF ready ({orgResult.pageCount} pages · {formatBytes(orgResult.blob.size)})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(orgResult.blob, orgResult.fileName)}
                  className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGeneratedPdfInStudio(orgResult.blob, orgResult.fileName)}
                  className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-yellow-300 font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Open in Cover Studio</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOOL 8: SIGN & STAMP PDF */}
      {activeTool === 'pdf-sign' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Sign & Stamp PDF</h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Draw a handwritten signature or upload a stamp PNG, then click on the target page to position it.
                </p>
              </div>
              <input
                ref={signInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelectSignFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => signInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer shrink-0"
              >
                {signFile ? 'Replace PDF' : 'Select PDF'}
              </button>
            </div>

            {/* Signature Drawing Canvas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Draw Signature Pad</span>
                <div className="flex items-center gap-2">
                  {['#0f172a', '#1d4ed8', '#991b1b'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSigColor(c)}
                      className={`w-4 h-4 rounded-full border cursor-pointer ${sigColor === c ? 'ring-2 ring-yellow-400' : 'border-zinc-400'}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Ink color ${c}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => stampImgInputRef.current?.click()}
                    className="text-xs font-semibold text-amber-700 dark:text-yellow-400 hover:underline cursor-pointer"
                  >
                    Upload PNG Stamp
                  </button>
                  <input
                    ref={stampImgInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const imgFile = e.target.files?.[0];
                      if (!imgFile) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        if (ev.target?.result) setUploadedStampUrl(ev.target.result as string);
                      };
                      reader.readAsDataURL(imgFile);
                    }}
                  />
                  <button
                    type="button"
                    onClick={clearSignaturePad}
                    className="text-xs text-zinc-500 hover:text-red-500 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {uploadedStampUrl ? (
                <div className="h-36 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white flex items-center justify-center p-4">
                  <img src={uploadedStampUrl} alt="Uploaded Stamp" className="max-h-full object-contain" />
                </div>
              ) : (
                <canvas
                  ref={sigCanvasRef}
                  width={480}
                  height={160}
                  onPointerDown={(e) => {
                    isDrawingRef.current = true;
                    const ctx = sigCanvasRef.current?.getContext('2d');
                    const pt = getCanvasPoint(e);
                    ctx?.beginPath();
                    ctx?.moveTo(pt.x, pt.y);
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawingRef.current) return;
                    const ctx = sigCanvasRef.current?.getContext('2d');
                    const pt = getCanvasPoint(e);
                    ctx?.lineTo(pt.x, pt.y);
                    ctx?.stroke();
                    setHasDrawnSig(true);
                  }}
                  onPointerUp={() => {
                    isDrawingRef.current = false;
                  }}
                  onPointerLeave={() => {
                    isDrawingRef.current = false;
                  }}
                  className="w-full h-36 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white touch-none cursor-crosshair"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1">
                  Signer Note / Date (Optional)
                </label>
                <input
                  type="text"
                  value={sigNote}
                  onChange={(e) => setSigNote(e.target.value)}
                  placeholder="e.g. Approved 15 Nov 2026"
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Stamp Width</span>
                  <span className="font-mono">{Math.round(sigWidthFrac * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.12"
                  max="0.45"
                  step="0.02"
                  value={sigWidthFrac}
                  onChange={(e) => setSigWidthFrac(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 mt-1.5 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunSignPdf}
              disabled={!signFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
              <span>Apply Signature to Page {signTargetPage}</span>
            </button>

            {signResult && (
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Signed PDF Ready ({formatBytes(signResult.blob.size)})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerBlobDownload(signResult.blob, signResult.fileName)}
                    className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => openGeneratedPdfInStudio(signResult.blob, signResult.fileName)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-yellow-300 font-bold text-xs cursor-pointer"
                  >
                    Attach QR Cover
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Click-to-place PDF page preview */}
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-900 dark:text-white">
                Click anywhere on page to set signature position
              </span>
              {signPagePreviews.length > 1 && (
                <select
                  value={signTargetPage}
                  onChange={(e) => setSignTargetPage(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                >
                  {signPagePreviews.map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      Page {idx + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {signPagePreviews[signTargetPage - 1] ? (
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(0.02, Math.min(0.85, (e.clientX - rect.left) / rect.width - sigWidthFrac / 2));
                  const y = Math.max(0.02, Math.min(0.9, (e.clientY - rect.top) / rect.height - 0.05));
                  setSigPos({ x, y });
                }}
                className="relative mx-auto border border-zinc-300 dark:border-zinc-700 rounded-xl overflow-hidden cursor-crosshair bg-white max-h-[460px]"
              >
                <img
                  src={signPagePreviews[signTargetPage - 1]}
                  alt={`Page ${signTargetPage} placement preview`}
                  className="max-h-[460px] w-auto object-contain select-none pointer-events-none"
                />
                <div
                  style={{
                    left: `${sigPos.x * 100}%`,
                    top: `${sigPos.y * 100}%`,
                    width: `${sigWidthFrac * 100}%`,
                  }}
                  className="absolute border-2 border-dashed border-amber-500 bg-yellow-400/20 rounded px-1.5 py-1 text-[10px] font-bold text-amber-900 pointer-events-none text-center"
                >
                  Signature Here
                </div>
              </div>
            ) : (
              <div
                onClick={() => signInputRef.current?.click()}
                className="flex-1 min-h-[260px] border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <PenTool className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">Select a PDF first to preview & click where to stamp your signature.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 9: PDF EDITOR */}
      {activeTool === 'pdf-edit' && (
        <PdfEditorTool
          onOpenInCoverStudio={openGeneratedPdfInStudio}
          onError={setErrorMsg}
          onProgress={setProgress}
          isWorking={isWorking}
          setIsWorking={setIsWorking}
          onTaskComplete={onTaskComplete}
        />
      )}

      {/* TOOL 10: PDF PASSWORD PROTECTION */}
      {activeTool === 'pdf-protect' && (
        <PdfProtectTool
          onOpenInCoverStudio={openGeneratedPdfInStudio}
          onError={setErrorMsg}
          onProgress={setProgress}
          isWorking={isWorking}
          setIsWorking={setIsWorking}
          onTaskComplete={onTaskComplete}
        />
      )}

      {/* TOOL 11: PDF TO IMAGE */}
      {activeTool === 'pdf-to-image' && (
        <PdfToImageTool
          onError={setErrorMsg}
          onProgress={setProgress}
          isWorking={isWorking}
          setIsWorking={setIsWorking}
          onTaskComplete={onTaskComplete}
        />
      )}
    </div>
  );
};
