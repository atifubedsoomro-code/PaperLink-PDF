import React, { useRef, useState } from 'react';
import {
  FileImage,
  Upload,
  Download,
  Archive,
  CheckCircle2,
  Loader2,
  Sliders,
} from 'lucide-react';
import {
  PdfRenderedImagePage,
  PdfToImageFormat,
  PdfToImageResult,
  PdfToImageScale,
  convertPdfToImages,
} from '../services/imageToolkit';

interface PdfToImageToolProps {
  onError: (msg: string | null) => void;
  onProgress: (prog: { percent: number; status: string } | null) => void;
  isWorking: boolean;
  setIsWorking: (val: boolean) => void;
  onSendImageToTool?: (file: File, targetTool: 'bg-remove' | 'resize' | 'convert' | 'crop' | 'filters') => void;
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

export const PdfToImageTool: React.FC<PdfToImageToolProps> = ({
  onError,
  onProgress,
  isWorking,
  setIsWorking,
  onSendImageToTool,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [format, setFormat] = useState<PdfToImageFormat>('png');
  const [scale, setScale] = useState<PdfToImageScale>(2);
  const [quality, setQuality] = useState<number>(0.92);
  const [pageRangeExpr, setPageRangeExpr] = useState<string>('all');
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [result, setResult] = useState<PdfToImageResult | null>(null);

  const handleSelectFile = (file: File) => {
    onError(null);
    onProgress(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      onError('Please choose a valid .pdf document.');
      return;
    }
    setPdfFile(file);
    setResult(null);
  };

  const handleRun = async () => {
    if (!pdfFile) return;
    onError(null);
    setResult(null);
    setIsWorking(true);
    try {
      const res = await convertPdfToImages(
        pdfFile,
        {
          format,
          scale,
          quality,
          pageRangeExpr,
          transparentBg: format !== 'jpg' && transparentBg,
        },
        (percent, status) => onProgress({ percent, status })
      );
      setResult(res);
    } catch (err: any) {
      onError(err?.message || 'Failed to render PDF pages as images.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleHandoff = (page: PdfRenderedImagePage, target: 'bg-remove' | 'resize') => {
    if (!onSendImageToTool) return;
    const mime =
      result?.format === 'jpg'
        ? 'image/jpeg'
        : result?.format === 'webp'
        ? 'image/webp'
        : 'image/png';
    const file = new File([page.blob], page.fileName, { type: mime });
    onSendImageToTool(file, target);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Configuration Card */}
      <div className="lg:col-span-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            Convert PDF Pages to High-Res Images
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Export every PDF page or selected ranges into crisp PNG, JPG, or WebP assets at up to 3× print DPI directly in your browser.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSelectFile(f);
            e.target.value = '';
          }}
        />

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleSelectFile(f);
          }}
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-yellow-400 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl p-6 text-center cursor-pointer transition-colors"
        >
          <Upload className="w-7 h-7 text-amber-600 dark:text-yellow-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 truncate">
            {pdfFile ? pdfFile.name : 'Click or drop a .pdf file here'}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
            {pdfFile ? formatBytes(pdfFile.size) : 'Multi-page brochures, flyers, or decks supported'}
          </p>
        </div>

        {/* Image Output Format */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
            Output Image Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'png', title: 'PNG', desc: 'Lossless sharp text' },
              { id: 'jpg', title: 'JPG', desc: 'Compact photo share' },
              { id: 'webp', title: 'WebP', desc: 'Modern ultra-light' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  format === opt.id
                    ? 'border-yellow-400 bg-yellow-400/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <p className="text-xs font-bold text-zinc-900 dark:text-white">{opt.title}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* DPI Resolution Scale */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
            Render Resolution Scale
          </label>
          <div className="grid grid-cols-4 gap-2">
            {([
              { s: 1 as PdfToImageScale, label: '1× Screen', hint: '72 DPI' },
              { s: 1.5 as PdfToImageScale, label: '1.5× Web', hint: '108 DPI' },
              { s: 2 as PdfToImageScale, label: '2× Print', hint: '144 DPI' },
              { s: 3 as PdfToImageScale, label: '3× Press', hint: '216 DPI' },
            ]).map((item) => (
              <button
                key={item.s}
                type="button"
                onClick={() => setScale(item.s)}
                className={`py-2 px-2 rounded-xl border text-center transition-colors cursor-pointer ${
                  scale === item.s
                    ? 'border-yellow-400 bg-yellow-400 text-black font-bold'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <span className="block text-xs">{item.label}</span>
                <span
                  className={`block text-[10px] font-mono tabular-nums ${
                    scale === item.s ? 'text-black/75' : 'text-zinc-500'
                  }`}
                >
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Page Range & Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Pages to Export
            </label>
            <input
              type="text"
              value={pageRangeExpr}
              onChange={(e) => setPageRangeExpr(e.target.value)}
              placeholder="all or 1-3, 5"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-yellow-400"
            />
          </div>

          {format !== 'png' ? (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Quality</span>
                <span className="font-mono tabular-nums">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.04}
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer mt-1.5"
              />
            </div>
          ) : (
            <div className="flex items-end">
              <label className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                  className="accent-yellow-400"
                />
                <span>Transparent page base</span>
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={!pdfFile || isWorking}
          className="w-full py-3 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 text-black font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {isWorking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileImage className="w-4 h-4" />
          )}
          <span>{isWorking ? 'Rendering Pages...' : `Render PDF to ${format.toUpperCase()}`}</span>
        </button>
      </div>

      {/* Right Rendered Gallery Card */}
      <div className="lg:col-span-7 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Rendered Page Gallery</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
              {result
                ? `${result.pages.length} of ${result.totalPagesInPdf} page${result.totalPagesInPdf === 1 ? '' : 's'} exported as ${result.format.toUpperCase()}`
                : 'Rendered pages appear here ready for single download or ZIP export.'}
            </p>
          </div>

          {result && result.zipBlob && (
            <button
              type="button"
              onClick={() => triggerDownload(result.zipBlob!, result.zipFileName)}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Download All ({result.pages.length} ZIP)</span>
            </button>
          )}
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-500/35 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Finished rendering {result.pages.length} image{result.pages.length === 1 ? '' : 's'} locally.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[540px] overflow-y-auto pr-1">
              {result.pages.map((page) => (
                <div
                  key={page.pageNumber}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden flex flex-col"
                >
                  <div
                    className="aspect-[4/3] w-full overflow-hidden flex items-center justify-center p-2"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #e4e4e7 25%, transparent 25%), linear-gradient(-45deg, #e4e4e7 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e4e7 75%), linear-gradient(-45deg, transparent 75%, #e4e4e7 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    }}
                  >
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.pageNumber} preview`}
                      className="max-h-full max-w-full object-contain shadow-sm"
                    />
                  </div>
                  <div className="p-3 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        Page {page.pageNumber}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                        {page.width}×{page.height} · {formatBytes(page.sizeBytes)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => triggerDownload(page.blob, page.fileName)}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download .{result.format}</span>
                      </button>

                      {onSendImageToTool && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleHandoff(page, 'bg-remove')}
                            className="py-1.5 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            Remove BG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleHandoff(page, 'resize')}
                            className="py-1.5 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            Resize
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-[280px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center p-8 text-center">
            <FileImage className="w-9 h-9 text-zinc-400 dark:text-zinc-600 mb-2.5" />
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 max-w-sm">
              Upload any PDF and select your target image format and print DPI to inspect and export individual pages or a bundled ZIP archive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
