import React, { useState } from 'react';
import { CoverData, UploadedDocInfo } from '../types';
import { generateCoverPagePdf, mergeCoverWithPdf } from '../services/pdfService';
import confetti from 'canvas-confetti';
import {
  Download,
  Printer,
  X,
  Layers,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDoc: UploadedDocInfo | null;
  coverData: CoverData;
  qrDataUrl: string | null;
  driveLink: string | null;
  onPrint: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  currentDoc,
  coverData,
  qrDataUrl,
  onPrint,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const includeQr = coverData.includeQr !== false;

  const triggerCelebration = () => {
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.7 },
    });
  };

  const handleDownloadMergedPdf = async () => {
    if (includeQr && !qrDataUrl) {
      setExportError('QR code is still being generated. Please try again in a second.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportMessage(
      includeQr
        ? 'Generating combined document with Cover Page and QR code...'
        : 'Generating clean PDF with custom Cover Page...'
    );

    try {
      let pdfBytes: Uint8Array;

      if (currentDoc?.pdfArrayBuffer) {
        pdfBytes = await mergeCoverWithPdf(currentDoc.pdfArrayBuffer, coverData, qrDataUrl || '');
      } else {
        const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl || '');
        pdfBytes = await coverPdf.save();
      }

      const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
      const blob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFilename = (coverData.title || currentDoc?.name || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = includeQr ? `${safeFilename}_with_QR_Cover.pdf` : `${safeFilename}_with_Cover.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerCelebration();
      setExportMessage('Downloaded successfully.');
      setTimeout(() => {
        setIsExporting(false);
        setExportMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Export error:', err);
      setExportError('Failed to generate merged PDF: ' + (err.message || 'Unknown error'));
      setIsExporting(false);
      setExportMessage(null);
    }
  };

  const handleDownloadCoverOnlyPdf = async () => {
    if (includeQr && !qrDataUrl) {
      setExportError('QR code is still being generated.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportMessage('Generating standalone Cover Page PDF...');

    try {
      const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl || '');
      const pdfBytes = await coverPdf.save();

      const safeBuffer = new Uint8Array(pdfBytes).slice().buffer;
      const blob = new Blob([safeBuffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFilename = (coverData.title || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Cover_Page_${safeFilename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerCelebration();
      setIsExporting(false);
      setExportMessage(null);
      setTimeout(onClose, 1000);
    } catch (err: any) {
      console.error('Export error:', err);
      setExportError('Failed to generate cover: ' + (err.message || 'Unknown error'));
      setIsExporting(false);
      setExportMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center">
              <Download className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Export Document</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Print-ready A4 / US Letter PDF output</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <button
            type="button"
            onClick={handleDownloadMergedPdf}
            disabled={isExporting}
            className="w-full text-left p-4 rounded-xl border border-yellow-400/70 bg-yellow-400/15 hover:bg-yellow-400/20 transition-colors flex items-start gap-3.5 cursor-pointer disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-lg bg-yellow-400 text-black flex items-center justify-center flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-amber-800 dark:text-yellow-300">
                {currentDoc?.pdfArrayBuffer
                  ? 'Merged PDF (Cover + All Pages)'
                  : 'Complete Cover PDF'}
              </h4>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 leading-relaxed">
                {includeQr
                  ? 'Prepends your custom cover with the active Google Drive QR code as Page 1.'
                  : 'Prepends your clean custom cover page without any QR block as Page 1.'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleDownloadCoverOnlyPdf}
            disabled={isExporting}
            className="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors flex items-start gap-3.5 cursor-pointer disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-900 text-amber-700 dark:text-yellow-400 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-zinc-900 dark:text-white">Cover Page Only (PDF)</h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                Print separately for report binders or document sleeves.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onPrint();
            }}
            disabled={isExporting}
            className="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors flex items-start gap-3.5 cursor-pointer disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-900 text-amber-700 dark:text-yellow-400 flex items-center justify-center flex-shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-zinc-900 dark:text-white">Direct Browser Print</h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                Opens the system print dialog formatted cleanly to page boundaries.
              </p>
            </div>
          </button>

          {isExporting && (
            <div className="p-3 bg-yellow-400/15 border border-yellow-400/40 rounded-lg flex items-center gap-2 text-xs text-amber-800 dark:text-yellow-300">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>{exportMessage}</span>
            </div>
          )}

          {exportError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
