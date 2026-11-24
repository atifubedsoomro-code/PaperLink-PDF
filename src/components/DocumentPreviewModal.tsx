import React, { useEffect, useRef, useState } from 'react';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Grid,
  Image as ImageIcon,
  Loader2,
  Lock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ClipingPapersLogo } from './ClipingPapersLogo';

export interface PreviewTarget {
  title: string;
  fileName: string;
  blob?: Blob;
  driveUrl?: string;
  subtitle?: string;
}

interface DocumentPreviewModalProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

interface ZipEntryItem {
  name: string;
  size: number;
  blob: Blob;
}

type DetectedKind = 'pdf' | 'word' | 'text' | 'image' | 'zip' | 'drive' | 'unsupported';

function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function detectPreviewKind(target: PreviewTarget): DetectedKind {
  const ext = getExt(target.fileName);
  const mime = target.blob?.type?.toLowerCase() || '';

  if (target.blob) {
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (ext === 'docx' || ext === 'doc' || mime.includes('wordprocessingml')) return 'word';
    if (
      ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'ico', 'svg'].includes(ext) ||
      mime.startsWith('image/')
    ) {
      return 'image';
    }
    if (ext === 'zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
      return 'zip';
    }
    if (
      ['txt', 'md', 'rtf', 'csv', 'json', 'html', 'xml', 'log'].includes(ext) ||
      mime.startsWith('text/')
    ) {
      return 'text';
    }
  }

  if (target.driveUrl) return 'drive';
  return 'unsupported';
}

function extractDriveFileId(url: string): string | null {
  const match = /\/d\/([a-zA-Z0-9_-]+)/.exec(url) || /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
  return match ? match[1] : null;
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

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  target,
  onClose,
}) => {
  const [activeStack, setActiveStack] = useState<PreviewTarget[]>([]);
  const currentTarget = activeStack.length > 0 ? activeStack[activeStack.length - 1] : target;

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.1);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // Word / Text state
  const [wordHtml, setWordHtml] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');

  // Image state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [checkerboardBg, setCheckerboardBg] = useState(true);

  // ZIP state
  const [zipEntries, setZipEntries] = useState<ZipEntryItem[]>([]);

  // Reset nested stack whenever top-level target changes
  useEffect(() => {
    setActiveStack([]);
  }, [target]);

  // Keyboard shortcuts: Escape closes, ArrowLeft/ArrowRight switches PDF pages
  useEffect(() => {
    if (!currentTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && pdfTotalPages > 1) {
        setPdfPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' && pdfTotalPages > 1) {
        setPdfPage((p) => Math.min(pdfTotalPages, p + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTarget, onClose, pdfTotalPages]);

  const kind: DetectedKind = currentTarget ? detectPreviewKind(currentTarget) : 'unsupported';

  // Load content whenever currentTarget changes
  useEffect(() => {
    let cancelled = false;
    let createdObjUrl: string | null = null;
    let loadedPdfProxy: any = null;

    setErrorMsg(null);
    setPdfDoc(null);
    setPdfPage(1);
    setPdfTotalPages(0);
    setWordHtml('');
    setTextContent('');
    setImageUrl(null);
    setZipEntries([]);
    setZoom(1.1);

    if (!currentTarget) return;

    const load = async () => {
      const detected = detectPreviewKind(currentTarget);
      if (detected === 'drive' || detected === 'unsupported') return;
      if (!currentTarget.blob) return;

      setIsLoading(true);
      try {
        if (detected === 'image') {
          createdObjUrl = URL.createObjectURL(currentTarget.blob);
          if (!cancelled) setImageUrl(createdObjUrl);
        } else if (detected === 'text') {
          const txt = await currentTarget.blob.text();
          if (!cancelled) setTextContent(txt);
        } else if (detected === 'word') {
          const buf = await currentTarget.blob.arrayBuffer();
          try {
            const res = await mammoth.convertToHtml({ arrayBuffer: buf });
            if (!cancelled) {
              setWordHtml(
                res.value ||
                  '<p class="text-zinc-500">Document contains no readable text paragraphs.</p>'
              );
            }
          } catch {
            // Fallback plain text extraction for legacy .doc files
            const rawTxt = await currentTarget.blob.text();
            const cleaned = rawTxt.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, ' ');
            if (!cancelled) {
              setWordHtml(
                `<pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">${cleaned
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')}</pre>`
              );
            }
          }
        } else if (detected === 'zip') {
          const zip = await JSZip.loadAsync(currentTarget.blob);
          const list: ZipEntryItem[] = [];
          const entries = Object.values(zip.files).filter((f) => !f.dir);
          for (const entry of entries) {
            const entryBlob = await entry.async('blob');
            list.push({
              name: entry.name,
              size: entryBlob.size,
              blob: entryBlob,
            });
          }
          if (!cancelled) setZipEntries(list);
        } else if (detected === 'pdf') {
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) {
            throw new Error(
              'PDF preview engine is still initializing. Please try again in a moment.'
            );
          }
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          const buf = new Uint8Array(await currentTarget.blob.arrayBuffer()).slice().buffer;
          const doc = await pdfjsLib.getDocument({
            data: buf,
            useSystemFonts: true,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
          }).promise;
          if (cancelled) {
            if (doc && typeof doc.destroy === 'function') void doc.destroy();
          } else {
            loadedPdfProxy = doc;
            setPdfDoc(doc);
            setPdfTotalPages(doc.numPages || 1);
            setPdfPage(1);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = String(err?.message || '');
          if (msg.toLowerCase().includes('password')) {
            setErrorMsg(
              'This PDF is password-protected. Unlock it in PDF Tools -> Protect / Unlock PDF to preview its pages.'
            );
          } else {
            setErrorMsg(msg || 'Unable to generate preview for this file.');
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (createdObjUrl) URL.revokeObjectURL(createdObjUrl);
      if (loadedPdfProxy && typeof loadedPdfProxy.destroy === 'function') {
        void loadedPdfProxy.destroy();
      }
    };
  }, [currentTarget]);

  // Render active PDF page onto high-DPI canvas
  useEffect(() => {
    if (kind !== 'pdf' || isLoading || errorMsg || !pdfDoc || !pdfCanvasRef.current) return;
    let cancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      setIsRenderingPage(true);
      try {
        const page = await pdfDoc.getPage(pdfPage);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom * dpr });
        const cssViewport = page.getViewport({ scale: zoom });
        const canvas = pdfCanvasRef.current;
        if (!canvas) return;

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = 'auto';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
          setErrorMsg(
            err?.message || 'Unable to render this PDF page preview. Use Download above to open it locally.'
          );
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pdfPage, zoom, isLoading, kind, errorMsg]);

  if (!currentTarget) return null;

  const driveFileId = currentTarget.driveUrl ? extractDriveFileId(currentTarget.driveUrl) : null;
  const driveEmbedUrl = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : currentTarget.driveUrl || null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-5 bg-black/75 dark:bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#101014] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-5xl w-full h-[min(90vh,860px)] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Top Toolbar */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090d] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeStack.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveStack((prev) => prev.slice(0, -1))}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400 cursor-pointer shrink-0"
                title="Back to archive"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <div className="w-8 h-8 rounded-lg bg-yellow-400/20 border border-yellow-400/40 text-amber-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
              {kind === 'zip' ? (
                <Archive className="w-4 h-4" />
              ) : kind === 'image' ? (
                <ImageIcon className="w-4 h-4" />
              ) : kind === 'text' ? (
                <FileCode2 className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </div>

            <div className="min-w-0">
              <h3
                id="doc-preview-title"
                className="text-sm font-bold text-zinc-950 dark:text-white truncate"
              >
                {currentTarget.title || currentTarget.fileName}
              </h3>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate tabular-nums">
                {currentTarget.fileName}
                {currentTarget.blob ? ` · ${formatBytes(currentTarget.blob.size)}` : ''}
                {kind === 'pdf' && pdfTotalPages > 0 ? ` · ${pdfTotalPages} pages` : ''}
                {currentTarget.subtitle ? ` · ${currentTarget.subtitle}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* PDF Multi-Page Controls */}
            {kind === 'pdf' && pdfTotalPages > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <button
                  type="button"
                  disabled={pdfPage <= 1}
                  onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                  className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 disabled:opacity-35 cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold text-zinc-800 dark:text-zinc-200 px-1.5 tabular-nums">
                  {pdfPage} / {pdfTotalPages}
                </span>
                <button
                  type="button"
                  disabled={pdfPage >= pdfTotalPages}
                  onClick={() => setPdfPage((p) => Math.min(pdfTotalPages, p + 1))}
                  className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 disabled:opacity-35 cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Zoom Controls for PDF & Images */}
            {(kind === 'pdf' || kind === 'image') && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))}
                  className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold text-zinc-700 dark:text-zinc-300 w-10 text-center tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.2).toFixed(2))))}
                  className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Image Checkerboard Toggle */}
            {kind === 'image' && (
              <button
                type="button"
                onClick={() => setCheckerboardBg((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  checkerboardBg
                    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-700 dark:text-cyan-300'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                }`}
                title="Toggle transparency checkerboard"
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            )}

            {/* Download Local Blob */}
            {currentTarget.blob && (
              <button
                type="button"
                onClick={() => triggerDownload(currentTarget.blob!, currentTarget.fileName)}
                className="px-3 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            )}

            {/* Open External Drive URL */}
            {currentTarget.driveUrl && (
              <a
                href={currentTarget.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-yellow-400" />
                <span className="hidden sm:inline">Open in Drive</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-950 dark:hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body Viewport */}
        <div className="flex-1 min-h-0 overflow-auto bg-zinc-100 dark:bg-[#07070a] p-4 sm:p-6 flex flex-col items-center">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <ClipingPapersLogo
                size="lg"
                layout="stacked"
                statusText="Fetching & preparing document preview…"
                subText="Rendering crisp high-DPI pages in your browser"
              />
            </div>
          ) : errorMsg ? (
            <div className="flex-1 flex flex-col items-center justify-center max-w-md text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                Preview Unavailable
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{errorMsg}</p>
            </div>
          ) : kind === 'pdf' ? (
            <div className="w-full flex flex-col items-center gap-4 shrink-0">
              {pdfTotalPages > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-2xl">
                  {Array.from({ length: Math.min(pdfTotalPages, 24) }, (_, idx) => idx + 1).map(
                    (num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPdfPage(num)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold cursor-pointer transition-colors tabular-nums ${
                          pdfPage === num
                            ? 'bg-yellow-400 text-black'
                            : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-yellow-400'
                        }`}
                      >
                        {num}
                      </button>
                    )
                  )}
                  {pdfTotalPages > 24 && (
                    <span className="text-[11px] font-mono text-zinc-500 px-1">
                      … +{pdfTotalPages - 24} more
                    </span>
                  )}
                </div>
              )}

              <div className="relative bg-white rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0">
                {isRenderingPage && (
                  <div className="absolute inset-0 bg-white/75 dark:bg-black/55 backdrop-blur-xs flex items-center justify-center z-10 p-4">
                    <ClipingPapersLogo size="sm" layout="stacked" statusText="Rendering page…" />
                  </div>
                )}
                <canvas ref={pdfCanvasRef} className="block max-w-full h-auto" />
              </div>
            </div>
          ) : kind === 'word' ? (
            <div className="w-full max-w-3xl bg-white text-zinc-900 rounded-xl shadow-xl border border-zinc-200 p-6 sm:p-10 space-y-4">
              <div className="pb-3 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-800">
                  <FileText className="w-4 h-4 text-amber-600" />
                  Word Document Preview
                </span>
                <span className="font-mono">{currentTarget.fileName}</span>
              </div>
              <div
                className="text-sm leading-relaxed space-y-3 [&_h1]:text-xl [&_h1]:font-extrabold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-300 [&_td]:p-2 [&_th]:border [&_th]:border-zinc-300 [&_th]:p-2 [&_th]:bg-zinc-100"
                dangerouslySetInnerHTML={{ __html: wordHtml }}
              />
            </div>
          ) : kind === 'text' ? (
            <div className="w-full max-w-3xl bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {textContent}
              </pre>
            </div>
          ) : kind === 'image' && imageUrl ? (
            <div
              className="m-auto rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700 shadow-2xl p-2"
              style={
                checkerboardBg
                  ? {
                      backgroundImage:
                        'linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)',
                      backgroundSize: '18px 18px',
                      backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
                      backgroundColor: '#f4f4f5',
                    }
                  : { backgroundColor: '#18181b' }
              }
            >
              <img
                src={imageUrl}
                alt={currentTarget.fileName}
                style={{ transform: `scale(${zoom / 1.1})`, transformOrigin: 'center' }}
                className="max-h-[68vh] max-w-full object-contain transition-transform duration-150"
              />
            </div>
          ) : kind === 'zip' ? (
            <div className="w-full max-w-2xl bg-white dark:bg-[#121216] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-zinc-950 dark:text-white">
                    Archive Contents ({zipEntries.length} files)
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Click Preview to inspect any file inside this ZIP archive.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {zipEntries.map((entry) => (
                  <div
                    key={entry.name}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                        {entry.name}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 tabular-nums">
                        {formatBytes(entry.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveStack((prev) => [
                            ...prev,
                            {
                              title: entry.name,
                              fileName: entry.name,
                              blob: entry.blob,
                              subtitle: 'From ZIP Archive',
                            },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-cyan-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-500" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerDownload(entry.blob, entry.name)}
                        className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : kind === 'drive' && driveEmbedUrl ? (
            <div className="w-full h-full min-h-[420px] flex flex-col gap-3">
              <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white">
                <iframe
                  src={driveEmbedUrl}
                  title={currentTarget.title || currentTarget.fileName}
                  className="w-full h-full min-h-[420px]"
                  allow="autoplay"
                />
              </div>
              <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400">
                Google Drive Preview · If Drive restricts embedding for private permissions, use Open in Drive above.
              </p>
            </div>
          ) : (
            <div className="m-auto text-center max-w-sm space-y-2">
              <FileText className="w-10 h-10 text-zinc-400 mx-auto" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                Direct Preview Not Supported for This Format
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Use Download above to save and open {currentTarget.fileName} on your device.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
