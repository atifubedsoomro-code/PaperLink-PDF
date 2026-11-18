import React, { useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  ShieldCheck,
  Table2,
  Upload,
} from 'lucide-react';
import { PreviewTarget } from './DocumentPreviewModal';
import {
  ExcelPdfOrientation,
  ExcelToImageResult,
  ExcelToPdfResult,
  ExcelWorkbookInspection,
  PdfToExcelFormat,
  PdfToExcelResult,
  PdfToPptResult,
  PptImageScale,
  PptToImageResult,
  PptToPdfLayout,
  PptToPdfResult,
  convertExcelToImages,
  convertExcelToPdf,
  convertPdfToExcel,
  convertPdfToPpt,
  convertPptToImages,
  convertPptToPdf,
  inspectExcelWorkbook,
} from '../services/officeToolkit';

export type OfficeUtilityTabId =
  | 'ppt-to-pdf'
  | 'ppt-to-image'
  | 'excel-to-pdf'
  | 'excel-to-image'
  | 'pdf-to-excel'
  | 'pdf-to-ppt';

interface OfficeUtilityToolsProps {
  activeTool: OfficeUtilityTabId;
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onOpenInCoverStudio: (blob: Blob, fileName: string) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
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

export const OfficeUtilityTools: React.FC<OfficeUtilityToolsProps> = ({
  activeTool,
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onOpenInCoverStudio,
  onTaskComplete,
  onPreviewDocument,
}) => {
  // 1. PPT -> PDF
  const pptPdfInputRef = useRef<HTMLInputElement>(null);
  const [pptPdfFile, setPptPdfFile] = useState<File | null>(null);
  const [pptPdfLayout, setPptPdfLayout] = useState<PptToPdfLayout>('slide-fit');
  const [pptIncludeNotes, setPptIncludeNotes] = useState(false);
  const [pptPdfResult, setPptPdfResult] = useState<PptToPdfResult | null>(null);

  // 2. PPT -> Image
  const pptImgInputRef = useRef<HTMLInputElement>(null);
  const [pptImgFile, setPptImgFile] = useState<File | null>(null);
  const [pptImgFormat, setPptImgFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [pptImgScale, setPptImgScale] = useState<PptImageScale>(1.5);
  const [pptImgRange, setPptImgRange] = useState('all');
  const [pptImgResult, setPptImgResult] = useState<PptToImageResult | null>(null);

  // 3 & 4. Excel -> PDF / Excel -> Image (shared spreadsheet inspection pattern)
  const excelPdfInputRef = useRef<HTMLInputElement>(null);
  const [excelPdfFile, setExcelPdfFile] = useState<File | null>(null);
  const [excelPdfInfo, setExcelPdfInfo] = useState<ExcelWorkbookInspection | null>(null);
  const [excelPdfSheets, setExcelPdfSheets] = useState<string[]>([]);
  const [excelPdfOrientation, setExcelPdfOrientation] = useState<ExcelPdfOrientation>('landscape');
  const [excelPdfPaper, setExcelPdfPaper] = useState<'a4' | 'letter'>('a4');
  const [excelPdfResult, setExcelPdfResult] = useState<ExcelToPdfResult | null>(null);

  const excelImgInputRef = useRef<HTMLInputElement>(null);
  const [excelImgFile, setExcelImgFile] = useState<File | null>(null);
  const [excelImgInfo, setExcelImgInfo] = useState<ExcelWorkbookInspection | null>(null);
  const [excelImgSheets, setExcelImgSheets] = useState<string[]>([]);
  const [excelImgFormat, setExcelImgFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [excelImgScale, setExcelImgScale] = useState<1 | 1.5 | 2>(1.5);
  const [excelImgResult, setExcelImgResult] = useState<ExcelToImageResult | null>(null);

  // 5. PDF -> Excel
  const pdfXlsInputRef = useRef<HTMLInputElement>(null);
  const [pdfXlsFile, setPdfXlsFile] = useState<File | null>(null);
  const [pdfXlsFormat, setPdfXlsFormat] = useState<PdfToExcelFormat>('xlsx');
  const [pdfXlsSingleSheet, setPdfXlsSingleSheet] = useState(false);
  const [pdfXlsResult, setPdfXlsResult] = useState<PdfToExcelResult | null>(null);

  // 6. PDF -> PPT
  const pdfPptInputRef = useRef<HTMLInputElement>(null);
  const [pdfPptFile, setPdfPptFile] = useState<File | null>(null);
  const [pdfPptScale, setPdfPptScale] = useState<1.5 | 2>(1.5);
  const [pdfPptResult, setPdfPptResult] = useState<PdfToPptResult | null>(null);

  const resetFeedback = () => {
    onError(null);
    onProgress(null);
  };

  // --- Handlers ---
  const handleRunPptToPdf = async () => {
    if (!pptPdfFile) return;
    resetFeedback();
    setPptPdfResult(null);
    setIsWorking(true);
    try {
      const res = await convertPptToPdf(
        pptPdfFile,
        { layout: pptPdfLayout, includeNotes: pptPdfLayout === 'a4-portrait' && pptIncludeNotes },
        (percent, status) => onProgress({ percent, status })
      );
      setPptPdfResult(res);
      onTaskComplete?.({
        headline: `Converted ${res.slideCount} Slide${res.slideCount === 1 ? '' : 's'} to PDF`,
        subtext: `${res.fileName} is ready for download or Cover Studio`,
        statusLabel: 'PPT to PDF Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to convert PowerPoint file to PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunPptToImages = async () => {
    if (!pptImgFile) return;
    resetFeedback();
    setPptImgResult(null);
    setIsWorking(true);
    try {
      const res = await convertPptToImages(
        pptImgFile,
        { format: pptImgFormat, scale: pptImgScale, quality: 0.92, slideRangeExpr: pptImgRange },
        (percent, status) => onProgress({ percent, status })
      );
      setPptImgResult(res);
      onTaskComplete?.({
        headline: `Exported ${res.slides.length} Slide Image${res.slides.length === 1 ? '' : 's'}`,
        subtext: `${res.format.toUpperCase()} slides ready for download`,
        statusLabel: 'PPT to Image Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to render PowerPoint slides as images.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleSelectExcelFile = async (file: File, target: 'pdf' | 'image') => {
    resetFeedback();
    try {
      const info = await inspectExcelWorkbook(file);
      const sheetNames = info.sheets.map((s) => s.name);
      if (target === 'pdf') {
        setExcelPdfFile(file);
        setExcelPdfInfo(info);
        setExcelPdfSheets(sheetNames);
        setExcelPdfResult(null);
      } else {
        setExcelImgFile(file);
        setExcelImgInfo(info);
        setExcelImgSheets(sheetNames);
        setExcelImgResult(null);
      }
    } catch (err: any) {
      onError(err?.message || 'Could not read spreadsheet workbook.');
    }
  };

  const handleRunExcelToPdf = async () => {
    if (!excelPdfFile) return;
    resetFeedback();
    setExcelPdfResult(null);
    setIsWorking(true);
    try {
      const res = await convertExcelToPdf(
        excelPdfFile,
        {
          sheetNames: excelPdfSheets.length > 0 ? excelPdfSheets : undefined,
          orientation: excelPdfOrientation,
          paperSize: excelPdfPaper,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setExcelPdfResult(res);
      onTaskComplete?.({
        headline: `Converted ${res.sheetCount} Sheet${res.sheetCount === 1 ? '' : 's'} to PDF`,
        subtext: `${res.fileName} (${res.pageCount} page${res.pageCount === 1 ? '' : 's'}) ready`,
        statusLabel: 'Excel to PDF Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to convert spreadsheet to PDF.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunExcelToImages = async () => {
    if (!excelImgFile) return;
    resetFeedback();
    setExcelImgResult(null);
    setIsWorking(true);
    try {
      const res = await convertExcelToImages(
        excelImgFile,
        {
          sheetNames: excelImgSheets.length > 0 ? excelImgSheets : undefined,
          format: excelImgFormat,
          scale: excelImgScale,
          quality: 0.92,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setExcelImgResult(res);
      onTaskComplete?.({
        headline: `Exported ${res.pages.length} Spreadsheet Image${res.pages.length === 1 ? '' : 's'}`,
        subtext: `${res.format.toUpperCase()} sheet visuals ready for download`,
        statusLabel: 'Excel to Image Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to export spreadsheet sheets to images.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunPdfToExcel = async () => {
    if (!pdfXlsFile) return;
    resetFeedback();
    setPdfXlsResult(null);
    setIsWorking(true);
    try {
      const res = await convertPdfToExcel(
        pdfXlsFile,
        { format: pdfXlsFormat, singleCombinedSheet: pdfXlsSingleSheet },
        (percent, status) => onProgress({ percent, status })
      );
      setPdfXlsResult(res);
      onTaskComplete?.({
        headline: `Extracted ${res.totalRows} Rows to ${res.format.toUpperCase()}`,
        subtext: `${res.fileName} from ${res.pageCount} PDF page(s) ready`,
        statusLabel: 'PDF to Excel Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to extract PDF tables into Excel.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunPdfToPpt = async () => {
    if (!pdfPptFile) return;
    resetFeedback();
    setPdfPptResult(null);
    setIsWorking(true);
    try {
      const res = await convertPdfToPpt(
        pdfPptFile,
        { scale: pdfPptScale },
        (percent, status) => onProgress({ percent, status })
      );
      setPdfPptResult(res);
      onTaskComplete?.({
        headline: `Built ${res.slideCount}-Slide PowerPoint Deck`,
        subtext: `${res.fileName} ready to open in PowerPoint or Google Slides`,
        statusLabel: 'PDF to PPT Complete',
      });
    } catch (err: any) {
      onError(err?.message || 'Failed to convert PDF pages into PowerPoint slides.');
    } finally {
      setIsWorking(false);
    }
  };

  const toggleSheetSelection = (
    name: string,
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => {
      if (prev.includes(name)) {
        return prev.length > 1 ? prev.filter((s) => s !== name) : prev;
      }
      return [...prev, name];
    });
  };

  return (
    <>
      {/* 1. PPT TO PDF */}
      {activeTool === 'ppt-to-pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert PowerPoint (.pptx) to PDF
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Preserve slide backgrounds, shapes, tables, embedded images, and optional speaker notes into a share-ready PDF.
              </p>
            </div>

            <input
              ref={pptPdfInputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPptPdfFile(f);
                  setPptPdfResult(null);
                  resetFeedback();
                }
                e.target.value = '';
              }}
            />

            <div
              onClick={() => pptPdfInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setPptPdfFile(f);
                  setPptPdfResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-7 text-center cursor-pointer transition-colors"
            >
              <Presentation className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {pptPdfFile ? pptPdfFile.name : 'Select or drop a PowerPoint (.pptx) deck'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {pptPdfFile ? `${formatBytes(pptPdfFile.size)} · Click to replace` : 'Supports 16:9 widescreen & 4:3 .pptx presentations'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — rendered 100% locally in your browser.</span>
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                PDF Page Layout
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'slide-fit', title: 'Slide Fit', desc: 'Exact 16:9 / 4:3' },
                    { id: 'a4-landscape', title: 'A4 Landscape', desc: 'Full-width print' },
                    { id: 'a4-portrait', title: 'A4 + Notes', desc: 'Handout format' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPptPdfLayout(opt.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      pptPdfLayout === opt.id
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                    }`}
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">{opt.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {pptPdfLayout === 'a4-portrait' && (
              <label className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pptIncludeNotes}
                  onChange={(e) => setPptIncludeNotes(e.target.checked)}
                  className="accent-yellow-400 w-4 h-4 rounded"
                />
                <span>Include slide speaker notes below each slide on A4 handout pages</span>
              </label>
            )}

            <button
              type="button"
              onClick={handleRunPptToPdf}
              disabled={!pptPdfFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>Convert PPT to PDF</span>
            </button>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between gap-4">
            {pptPdfResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      PPT Converted to PDF
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 tabular-nums">
                      {pptPdfResult.slideCount} slides · {formatBytes(pptPdfResult.blob.size)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onPreviewDocument && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewDocument({
                            title: pptPdfResult.fileName,
                            fileName: pptPdfResult.fileName,
                            blob: pptPdfResult.blob,
                            subtitle: `${pptPdfResult.slideCount} slides converted to PDF`,
                          })
                        }
                        className="px-3 py-2 rounded-lg border border-cyan-400/60 bg-cyan-50/70 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => triggerDownload(pptPdfResult.blob, pptPdfResult.fileName)}
                      className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInCoverStudio(pptPdfResult.blob, pptPdfResult.fileName)}
                      className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-yellow-300 font-semibold text-xs cursor-pointer"
                    >
                      Attach QR Cover
                    </button>
                  </div>
                </div>

                {pptPdfResult.thumbnails.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {pptPdfResult.thumbnails.map((thumb, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-1.5"
                      >
                        <img src={thumb} alt={`Slide ${idx + 1}`} className="w-full rounded object-contain" />
                        <p className="text-[10px] font-mono text-zinc-500 mt-1 text-center tabular-nums">
                          Slide {idx + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <Presentation className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Slide PDF Preview Appears Here
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Upload any `.pptx` presentation to preview rendered slides and export a printable PDF or send to Cover Studio.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. PPT TO IMAGE */}
      {activeTool === 'ppt-to-image' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Export PowerPoint Slides to Images
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Render slides from your `.pptx` deck into sharp PNG, JPG, or WebP images and download individually or as a ZIP.
              </p>
            </div>

            <input
              ref={pptImgInputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPptImgFile(f);
                  setPptImgResult(null);
                  resetFeedback();
                }
                e.target.value = '';
              }}
            />

            <div
              onClick={() => pptImgInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setPptImgFile(f);
                  setPptImgResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-7 h-7 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                {pptImgFile ? pptImgFile.name : 'Select or drop a .pptx file'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {pptImgFile ? formatBytes(pptImgFile.size) : 'All slide shapes, images & tables supported'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — rendered 100% locally.</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setPptImgFormat(fmt)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold uppercase cursor-pointer transition-colors ${
                    pptImgFormat === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Resolution
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: 1 as PptImageScale, label: '720p+' },
                    { v: 1.5 as PptImageScale, label: '1080p' },
                    { v: 2 as PptImageScale, label: '2.5K' },
                  ]).map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => setPptImgScale(s.v)}
                      className={`py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                        pptImgScale === s.v
                          ? 'border-yellow-400 bg-yellow-400/15 text-amber-700 dark:text-yellow-300'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Slides (e.g. all or 1-4)
                </label>
                <input
                  type="text"
                  value={pptImgRange}
                  onChange={(e) => setPptImgRange(e.target.value)}
                  placeholder="all"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunPptToImages}
              disabled={!pptImgFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              <span>Export Slides as {pptImgFormat.toUpperCase()}</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            {pptImgResult ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {pptImgResult.slides.length} Slide{pptImgResult.slides.length === 1 ? '' : 's'} Ready
                    </p>
                  </div>
                  {pptImgResult.zipBlob && (
                    <button
                      type="button"
                      onClick={() => triggerDownload(pptImgResult.zipBlob!, pptImgResult.zipFileName)}
                      className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Download All Slides (.zip)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[430px] overflow-y-auto pr-1">
                  {pptImgResult.slides.map((sl) => (
                    <div
                      key={sl.slideNumber}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5 space-y-2"
                    >
                      <img src={sl.dataUrl} alt={`Slide ${sl.slideNumber}`} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800" />
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            Slide {sl.slideNumber}: {sl.title}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            {sl.width}×{sl.height} · {formatBytes(sl.sizeBytes)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => triggerDownload(sl.blob, sl.fileName)}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-yellow-400 hover:text-black text-white text-[11px] font-bold cursor-pointer shrink-0 inline-flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Exported Slide Gallery
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Convert presentation slides into crisp images ready for social posts, thumbnails, or design docs.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. EXCEL TO PDF */}
      {activeTool === 'excel-to-pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert Excel / CSV to Formatted PDF
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Turn `.xlsx`, `.xls`, `.csv`, or `.ods` spreadsheets into clean multi-page PDF tables with headers, zebra striping, and auto-sized columns.
              </p>
            </div>

            <input
              ref={excelPdfInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.ods"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSelectExcelFile(f, 'pdf');
                e.target.value = '';
              }}
            />

            <div
              onClick={() => excelPdfInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleSelectExcelFile(f, 'pdf');
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-7 text-center cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {excelPdfFile ? excelPdfFile.name : 'Select or drop an Excel or CSV file'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {excelPdfFile
                  ? `${formatBytes(excelPdfFile.size)} · ${excelPdfInfo?.sheets.length || 0} sheet(s)`
                  : 'Supports .xlsx, .xls, .csv, .tsv, and .ods workbooks'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — formatted locally in your browser.</span>
              </p>
            </div>

            {excelPdfInfo && excelPdfInfo.sheets.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Worksheets to Export ({excelPdfSheets.length}/{excelPdfInfo.sheets.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {excelPdfInfo.sheets.map((s) => {
                    const checked = excelPdfSheets.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleSheetSelection(s.name, excelPdfSheets, setExcelPdfSheets)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer tabular-nums ${
                          checked
                            ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}
                      >
                        {s.name} ({s.rowCount}×{s.colCount})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5">
                  Page Orientation
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['landscape', 'portrait'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setExcelPdfOrientation(o)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold capitalize cursor-pointer ${
                        excelPdfOrientation === o
                          ? 'border-yellow-400 bg-yellow-400 text-black'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5">
                  Paper Size
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['a4', 'letter'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setExcelPdfPaper(sz)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                        excelPdfPaper === sz
                          ? 'border-yellow-400 bg-yellow-400 text-black'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunExcelToPdf}
              disabled={!excelPdfFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span>Convert Excel to PDF</span>
            </button>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            {excelPdfResult ? (
              <>
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Spreadsheet PDF Ready
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 tabular-nums">
                      {excelPdfResult.sheetCount} sheet(s) · {excelPdfResult.pageCount} page(s) ·{' '}
                      {formatBytes(excelPdfResult.blob.size)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onPreviewDocument && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewDocument({
                            title: excelPdfResult.fileName,
                            fileName: excelPdfResult.fileName,
                            blob: excelPdfResult.blob,
                            subtitle: `${excelPdfResult.pageCount} spreadsheet PDF page(s)`,
                          })
                        }
                        className="px-3 py-2 rounded-lg border border-cyan-400/60 bg-cyan-50/70 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => triggerDownload(excelPdfResult.blob, excelPdfResult.fileName)}
                      className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInCoverStudio(excelPdfResult.blob, excelPdfResult.fileName)}
                      className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-yellow-300 font-semibold text-xs cursor-pointer"
                    >
                      Attach QR Cover
                    </button>
                  </div>
                </div>

                {excelPdfResult.thumbnails.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {excelPdfResult.thumbnails.map((thumb, idx) => (
                      <div key={idx} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-1.5 bg-zinc-50 dark:bg-zinc-950">
                        <img src={thumb} alt={`Sheet page ${idx + 1}`} className="w-full rounded" />
                        <p className="text-[10px] font-mono text-zinc-500 mt-1 text-center tabular-nums">
                          Page {idx + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : excelPdfInfo && excelPdfInfo.sheets[0]?.previewRows.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  Data Preview — {excelPdfInfo.sheets[0].name}
                </p>
                <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <table className="w-full text-[11px] text-left">
                    <tbody>
                      {excelPdfInfo.sheets[0].previewRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            rIdx === 0
                              ? 'bg-zinc-100 dark:bg-zinc-900 font-bold text-zinc-900 dark:text-white'
                              : 'border-t border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }
                        >
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-2.5 py-1.5 whitespace-nowrap max-w-[140px] truncate font-mono tabular-nums">
                              {cell || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <FileSpreadsheet className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Spreadsheet Preview &amp; PDF Output
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Upload any `.xlsx`, `.xls`, or `.csv` workbook to pick worksheets and generate a print-ready PDF.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. EXCEL TO IMAGE */}
      {activeTool === 'excel-to-image' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Export Excel / CSV Sheets as Images
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Turn spreadsheet tables into crisp PNG, JPG, or WebP graphics perfect for WhatsApp shares, decks, and reports.
              </p>
            </div>

            <input
              ref={excelImgInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.ods"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSelectExcelFile(f, 'image');
                e.target.value = '';
              }}
            />

            <div
              onClick={() => excelImgInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleSelectExcelFile(f, 'image');
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-7 h-7 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                {excelImgFile ? excelImgFile.name : 'Select or drop an Excel or CSV file'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {excelImgFile ? formatBytes(excelImgFile.size) : 'Supports .xlsx, .xls, .csv, and .ods'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — rendered locally.</span>
              </p>
            </div>

            {excelImgInfo && excelImgInfo.sheets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {excelImgInfo.sheets.map((s) => {
                  const checked = excelImgSheets.includes(s.name);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => toggleSheetSelection(s.name, excelImgSheets, setExcelImgSheets)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                        checked
                          ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExcelImgFormat(fmt)}
                  className={`py-2.5 rounded-xl border text-xs font-bold uppercase cursor-pointer ${
                    excelImgFormat === fmt
                      ? 'border-yellow-400 bg-yellow-400 text-black'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 1 as const, label: '1× Screen' },
                { v: 1.5 as const, label: '1.5× HD' },
                { v: 2 as const, label: '2× Ultra' },
              ]).map((sc) => (
                <button
                  key={sc.v}
                  type="button"
                  onClick={() => setExcelImgScale(sc.v)}
                  className={`py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                    excelImgScale === sc.v
                      ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunExcelToImages}
              disabled={!excelImgFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              <span>Render Excel as {excelImgFormat.toUpperCase()}</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            {excelImgResult ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {excelImgResult.pages.length} Spreadsheet Image{excelImgResult.pages.length === 1 ? '' : 's'} Ready
                  </p>
                  {excelImgResult.zipBlob && (
                    <button
                      type="button"
                      onClick={() => triggerDownload(excelImgResult.zipBlob!, excelImgResult.zipFileName)}
                      className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Download All (.zip)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-[430px] overflow-y-auto pr-1">
                  {excelImgResult.pages.map((pg) => (
                    <div
                      key={pg.pageNumber}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-2"
                    >
                      <img src={pg.dataUrl} alt={pg.sheetName} className="w-full rounded border border-zinc-200 dark:border-zinc-800" />
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {pg.fileName}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            Sheet: {pg.sheetName} · {pg.width}×{pg.height} · {formatBytes(pg.sizeBytes)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => triggerDownload(pg.blob, pg.fileName)}
                          className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer shrink-0 inline-flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Rendered Spreadsheet Images
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Clean high-resolution table cards appear here with individual and ZIP downloads.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. PDF TO EXCEL / CSV */}
      {activeTool === 'pdf-to-excel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert PDF Tables to Excel (.xlsx) or CSV
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Extract rows and columns from PDF reports, invoices, statements, and lists into real spreadsheet workbooks.
              </p>
            </div>

            <input
              ref={pdfXlsInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPdfXlsFile(f);
                  setPdfXlsResult(null);
                  resetFeedback();
                }
                e.target.value = '';
              }}
            />

            <div
              onClick={() => pdfXlsInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setPdfXlsFile(f);
                  setPdfXlsResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <Table2 className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                {pdfXlsFile ? pdfXlsFile.name : 'Select or drop a PDF document'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {pdfXlsFile ? formatBytes(pdfXlsFile.size) : 'Detects horizontal rows & column X-positions'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — extracted locally.</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'xlsx', title: 'Excel (.xlsx)', desc: 'Multi-sheet workbook' },
                  { id: 'csv', title: 'CSV (.csv)', desc: 'Universal plain table' },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setPdfXlsFormat(fmt.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${
                    pdfXlsFormat === fmt.id
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">{fmt.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{fmt.desc}</p>
                </button>
              ))}
            </div>

            {pdfXlsFormat === 'xlsx' && (
              <label className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdfXlsSingleSheet}
                  onChange={(e) => setPdfXlsSingleSheet(e.target.checked)}
                  className="accent-yellow-400 w-4 h-4 rounded"
                />
                <span>Combine all PDF pages into one continuous worksheet</span>
              </label>
            )}

            <button
              type="button"
              onClick={handleRunPdfToExcel}
              disabled={!pdfXlsFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />}
              <span>Extract PDF to {pdfXlsFormat.toUpperCase()}</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            {pdfXlsResult ? (
              <>
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Spreadsheet Extracted
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 tabular-nums">
                      {pdfXlsResult.totalRows} rows · {pdfXlsResult.pageCount} page(s) ·{' '}
                      {formatBytes(pdfXlsResult.blob.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerDownload(pdfXlsResult.blob, pdfXlsResult.fileName)}
                    className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .{pdfXlsResult.format}</span>
                  </button>
                </div>

                {pdfXlsResult.previewRows.length > 0 && (
                  <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <table className="w-full text-[11px] text-left">
                      <tbody>
                        {pdfXlsResult.previewRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              rIdx === 0
                                ? 'bg-zinc-100 dark:bg-zinc-900 font-bold text-zinc-900 dark:text-white'
                                : 'border-t border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                            }
                          >
                            {row.slice(0, 8).map((cell, cIdx) => (
                              <td key={cIdx} className="px-2.5 py-1.5 whitespace-nowrap max-w-[160px] truncate font-mono tabular-nums">
                                {cell || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <Table2 className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Extracted Table Preview
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Upload any PDF with tabular text to inspect the detected rows and download as `.xlsx` or `.csv`.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. PDF TO PPT */}
      {activeTool === 'pdf-to-ppt' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Convert PDF to PowerPoint (.pptx)
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Turn PDF handouts, pitch decks, and brochures into crisp PowerPoint `.pptx` slides ready for Keynote or Google Slides.
              </p>
            </div>

            <input
              ref={pdfPptInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPdfPptFile(f);
                  setPdfPptResult(null);
                  resetFeedback();
                }
                e.target.value = '';
              }}
            />

            <div
              onClick={() => pdfPptInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setPdfPptFile(f);
                  setPdfPptResult(null);
                  resetFeedback();
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <Presentation className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                {pdfPptFile ? pdfPptFile.name : 'Select or drop a PDF document'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {pdfPptFile ? formatBytes(pdfPptFile.size) : 'Each PDF page maps cleanly onto a slide'}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Your files never leave your device — packaged locally.</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 1.5 as const, label: '1.5× Crisp HD', desc: 'Balanced deck size' },
                { v: 2 as const, label: '2× Ultra Sharp', desc: 'Retina projector clarity' },
              ]).map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setPdfPptScale(s.v)}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${
                    pdfPptScale === s.v
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">{s.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunPdfToPpt}
              disabled={!pdfPptFile || isWorking}
              className="w-full py-3 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />}
              <span>Build PowerPoint (.pptx)</span>
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
            {pdfPptResult ? (
              <>
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      PowerPoint Deck Ready
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 tabular-nums">
                      {pdfPptResult.slideCount} slides · {formatBytes(pdfPptResult.blob.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerDownload(pdfPptResult.blob, pdfPptResult.fileName)}
                    className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .pptx</span>
                  </button>
                </div>

                {pdfPptResult.thumbnails.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {pdfPptResult.thumbnails.map((thumb, idx) => (
                      <div key={idx} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-1.5 bg-zinc-50 dark:bg-zinc-950">
                        <img src={thumb} alt={`Slide ${idx + 1}`} className="w-full rounded" />
                        <p className="text-[10px] font-mono text-zinc-500 mt-1 text-center tabular-nums">
                          Slide {idx + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6">
                <Presentation className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Generated Slide Previews
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Convert any PDF file into a standard `.pptx` presentation compatible with PowerPoint and Google Slides.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
