import React, { useRef, useState } from 'react';
import { CoverData, BatchItem } from '../types';
import { parseUploadedDocument } from '../services/documentParser';
import { uploadDocumentToDrive, DriveUploadError } from '../services/googleDrive';
import { generateQRCodeDataUrl } from '../services/qrService';
import { mergeCoverWithPdf, generateCoverPagePdf } from '../services/pdfService';
import { saveDocumentRecord } from '../firebase';
import confetti from 'canvas-confetti';
import {
  Upload,
  Files,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { RobotProgressBar } from './RobotProgressBar';

interface BatchProcessingPanelProps {
  batchItems: BatchItem[];
  setBatchItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
  currentCoverTheme: CoverData;
  accessToken: string | null;
  userEmail?: string;
  onRequireAuth: (forceConsent?: boolean) => void;
  onShareDoc: (title: string, link: string, qrUrl?: string) => void;
}

export const BatchProcessingPanel: React.FC<BatchProcessingPanelProps> = ({
  batchItems,
  setBatchItems,
  currentCoverTheme,
  accessToken,
  userEmail,
  onRequireAuth,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [globalProgress, setGlobalProgress] = useState<{ current: number; total: number } | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const handleMultipleFiles = async (files: FileList | File[]) => {
    setBannerMessage(null);
    const newItems: BatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseUploadedDocument(file);
        const itemCoverData: CoverData = {
          ...currentCoverTheme,
          title: parsed.extractedTitle || file.name.replace(/\.[^/.]+$/, ''),
          summary: parsed.extractedText || currentCoverTheme.summary,
          documentId: '',
        };

        newItems.push({
          id: `batch_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          docInfo: parsed,
          coverData: itemCoverData,
          status: 'idle',
        });
      } catch (err) {
        console.error('Error parsing file:', file.name, err);
      }
    }

    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      handleMultipleFiles(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  const processSingleItem = async (item: BatchItem): Promise<BatchItem> => {
    if (!accessToken) {
      onRequireAuth(false);
      throw new Error('Sign in with Google to upload.');
    }

    try {
      const driveResult = await uploadDocumentToDrive(
        item.docInfo.file,
        item.docInfo.name,
        accessToken
      );

      const qrDataUrl = await generateQRCodeDataUrl({
        url: driveResult.webViewLink,
        colorDark: item.coverData.qrColor,
        colorLight: item.coverData.qrBgColor,
        width: 480,
      });

      await saveDocumentRecord({
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: item.coverData.title,
        fileName: item.docInfo.name,
        fileSize: item.docInfo.size,
        fileType: item.docInfo.extension,
        driveFileId: driveResult.fileId,
        driveLink: driveResult.webViewLink,
        coverData: item.coverData,
        createdAt: Date.now(),
        userEmail: userEmail || '',
      });

      return {
        ...item,
        status: 'synced',
        driveResult,
        qrDataUrl,
        errorMessage: undefined,
      };
    } catch (err: any) {
      if (err instanceof DriveUploadError && (err.code === 'auth' || err.code === 'scope')) {
        onRequireAuth(err.code === 'scope');
      }
      return {
        ...item,
        status: 'error',
        errorMessage: err.message || 'Upload failed',
      };
    }
  };

  const handleProcessAll = async () => {
    if (!accessToken) {
      onRequireAuth(false);
      return;
    }

    if (batchItems.length === 0) return;

    setBannerMessage(null);
    setIsProcessingAll(true);
    setGlobalProgress({ current: 0, total: batchItems.length });

    const updated = [...batchItems];
    let syncedCount = 0;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'synced') {
        syncedCount++;
        continue;
      }

      updated[i] = { ...updated[i], status: 'uploading', errorMessage: undefined };
      setBatchItems([...updated]);
      setGlobalProgress({ current: i + 1, total: updated.length });

      const processed = await processSingleItem(updated[i]);
      if (processed.status === 'synced') syncedCount++;
      updated[i] = processed;
      setBatchItems([...updated]);
    }

    setIsProcessingAll(false);
    setGlobalProgress(null);
    if (syncedCount > 0) {
      confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
    }
  };

  const handleDownloadItem = async (item: BatchItem) => {
    if (!item.qrDataUrl) {
      setBannerMessage({
        type: 'error',
        text: 'Upload the file to Google Drive first to generate its public QR code.',
      });
      return;
    }

    try {
      let pdfBytes: Uint8Array;
      if (item.docInfo.pdfArrayBuffer) {
        pdfBytes = await mergeCoverWithPdf(
          item.docInfo.pdfArrayBuffer,
          item.coverData,
          item.qrDataUrl
        );
      } else {
        const coverPdf = await generateCoverPagePdf(item.coverData, item.qrDataUrl);
        pdfBytes = await coverPdf.save();
      }

      const blob = new Blob([new Uint8Array(pdfBytes).slice().buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.coverData.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_QR_Cover.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error:', err);
      setBannerMessage({
        type: 'error',
        text: `Failed to generate PDF: ${err.message}`,
      });
    }
  };

  const handleDownloadAll = async () => {
    const readyItems = batchItems.filter((item) => item.status === 'synced');
    if (readyItems.length === 0) {
      setBannerMessage({
        type: 'error',
        text: 'No synced documents ready for download yet. Upload them first.',
      });
      return;
    }

    setIsDownloadingAll(true);
    for (const item of readyItems) {
      await handleDownloadItem(item);
      await new Promise((r) => setTimeout(r, 500));
    }
    setIsDownloadingAll(false);
  };

  const handleApplyThemeToAll = () => {
    setBatchItems((prev) =>
      prev.map((item) => ({
        ...item,
        coverData: {
          ...currentCoverTheme,
          title: item.coverData.title,
          documentId: item.coverData.documentId,
        },
      }))
    );
    setBannerMessage({
      type: 'info',
      text: 'Active Cover Studio theme and styling applied across all queued documents.',
    });
  };

  return (
    <div className="space-y-5">
      {/* Batch Header */}
      <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400 mb-1">
            <span className="font-mono text-amber-700 dark:text-yellow-400 font-semibold">Batch Processor</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{batchItems.length} files queued</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
            Simultaneous Multi-File Cover & Drive QR Queue
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Queue PDF and Word files, apply your studio theme, upload to Google Drive, and export merged PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {batchItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleApplyThemeToAll}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-yellow-400 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Apply Studio Theme
              </button>
              <button
                type="button"
                onClick={handleProcessAll}
                disabled={isProcessingAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isProcessingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="tabular-nums">
                      Processing {globalProgress?.current}/{globalProgress?.total}
                    </span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Upload All to Drive</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={isDownloadingAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download All</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:border-yellow-400 text-yellow-300 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Add Files</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            onChange={(e) => {
              if (e.target.files) handleMultipleFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>

      {isProcessingAll && globalProgress && (
        <RobotProgressBar
          compact
          percent={Math.round((globalProgress.current / Math.max(1, globalProgress.total)) * 100)}
          status={`Processing file ${globalProgress.current} of ${globalProgress.total}…`}
          subText="Building QR cover and syncing to Google Drive"
        />
      )}

      {bannerMessage && (
        <div
          role={bannerMessage.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            bannerMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
          }`}
        >
          {bannerMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {batchItems.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/60 bg-white dark:bg-[var(--pl-surface)]/70 hover:bg-zinc-50 dark:hover:bg-[#121215] rounded-2xl p-12 text-center cursor-pointer transition-colors"
        >
          <Files className="w-9 h-9 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Select Multiple Documents Simultaneously
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            Drag and drop multiple PDF, DOC, DOCX, or TXT files here.
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-2.5 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Your files never leave your device until you choose Upload All to Drive.</span>
          </p>
          <span className="inline-block mt-4 px-4 py-2 bg-yellow-400 text-black text-xs font-bold rounded-lg">
            Browse Files
          </span>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-[var(--pl-surface)]">
          {batchItems.map((item, idx) => (
            <div
              key={item.id}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <span className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-zinc-800 text-amber-700 dark:text-yellow-400 text-xs font-mono font-bold flex items-center justify-center flex-shrink-0 mt-0.5 tabular-nums">
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.coverData.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBatchItems((prev) =>
                        prev.map((it) =>
                          it.id === item.id ? { ...it, coverData: { ...it.coverData, title: val } } : it
                        )
                      );
                    }}
                    className="text-sm font-bold text-zinc-900 dark:text-white bg-transparent border-b border-zinc-300 dark:border-zinc-800 focus:border-yellow-400 focus:outline-none w-full max-w-md pb-0.5"
                  />

                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 tabular-nums">
                    <span>{item.docInfo.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="uppercase font-mono">{item.docInfo.extension}</span>
                    <span aria-hidden="true">·</span>
                    <span>{(item.docInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                    {item.docInfo.pageCount && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{item.docInfo.pageCount} pages</span>
                      </>
                    )}
                  </div>

                  {item.driveResult?.webViewLink && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Live:
                      </span>
                      <a
                        href={item.driveResult.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-700 dark:text-yellow-400 hover:underline truncate max-w-xs font-mono"
                      >
                        {item.driveResult.webViewLink}
                      </a>
                    </div>
                  )}

                  {item.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.errorMessage}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {item.qrDataUrl && (
                  <div className="w-11 h-11 bg-white p-1 rounded-lg border border-zinc-300 dark:border-zinc-700 flex-shrink-0">
                    <img
                      src={item.qrDataUrl}
                      alt="Document QR"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {item.status === 'uploading' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-400/15 text-amber-700 dark:text-yellow-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading
                  </span>
                )}
                {item.status === 'synced' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Ready
                  </span>
                )}
                {(item.status === 'idle' || item.status === 'error') && (
                  <button
                    type="button"
                    onClick={async () => {
                      setBatchItems((prev) =>
                        prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading', errorMessage: undefined } : it))
                      );
                      try {
                        const processed = await processSingleItem(item);
                        setBatchItems((prev) => prev.map((it) => (it.id === item.id ? processed : it)));
                      } catch (err: any) {
                        setBatchItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id
                              ? { ...it, status: 'error', errorMessage: err?.message || 'Upload failed' }
                              : it
                          )
                        );
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white cursor-pointer"
                  >
                    {item.status === 'error' ? 'Retry' : 'Upload'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownloadItem(item)}
                  disabled={item.status !== 'synced'}
                  className="p-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:opacity-35 disabled:cursor-not-allowed text-black transition-colors cursor-pointer"
                  title="Download merged PDF with QR cover"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                </button>

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                  title="Remove from batch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
