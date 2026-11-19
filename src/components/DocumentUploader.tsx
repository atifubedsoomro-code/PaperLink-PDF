import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, RefreshCw, Files, Eye, ShieldCheck, Info } from 'lucide-react';
import { parseUploadedDocument } from '../services/documentParser';
import { UploadedDocInfo } from '../types';

interface DocumentUploaderProps {
  currentDoc: UploadedDocInfo | null;
  onDocumentParsed: (doc: UploadedDocInfo) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  onSwitchToBatch?: () => void;
  onPreviewDoc?: () => void;
}

const PRIVACY_TOOLTIP_TEXT =
  'Your files are processed locally in your browser and never leave your device.';

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  currentDoc,
  onDocumentParsed,
  isLoading,
  setIsLoading,
  onSwitchToBatch,
  onPreviewDoc,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const privacyWrapperRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPrivacyTooltipOpen, setIsPrivacyTooltipOpen] = useState(false);

  useEffect(() => {
    if (!isPrivacyTooltipOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (privacyWrapperRef.current && !privacyWrapperRef.current.contains(e.target as Node)) {
        setIsPrivacyTooltipOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPrivacyTooltipOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isPrivacyTooltipOpen]);

  const handleFile = async (file: File) => {
    setParseError(null);
    setIsLoading(true);

    try {
      const parsed = await parseUploadedDocument(file);
      onDocumentParsed(parsed);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err.message || 'Failed to parse document. Please check file format.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFile(selected);
    }
  };

  return (
    <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30">
              Step 1
            </span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Pick Your File</h3>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Drop any PDF, Word doc (.docx, .doc), or text note to begin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Highly Visible Privacy First Badge with Interactive Tooltip */}
          <div
            ref={privacyWrapperRef}
            className="relative group inline-block"
            onMouseEnter={() => setIsPrivacyTooltipOpen(true)}
            onMouseLeave={() => setIsPrivacyTooltipOpen(false)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPrivacyTooltipOpen((prev) => !prev);
              }}
              onFocus={() => setIsPrivacyTooltipOpen(true)}
              onBlur={() => setIsPrivacyTooltipOpen(false)}
              title={PRIVACY_TOOLTIP_TEXT}
              aria-describedby="privacy-first-tooltip"
              aria-expanded={isPrivacyTooltipOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 text-xs font-bold cursor-pointer transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5] shrink-0" />
              <span>Privacy First</span>
              <Info className="w-3 h-3 opacity-80 shrink-0" />
            </button>

            <div
              id="privacy-first-tooltip"
              role="tooltip"
              className={`absolute left-0 sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-2 w-64 max-w-[calc(100vw-3rem)] px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-950 text-white border border-emerald-400/60 shadow-xl text-[11px] leading-relaxed font-medium z-30 transition-all duration-150 ${
                isPrivacyTooltipOpen
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0'
              }`}
            >
              {PRIVACY_TOOLTIP_TEXT}
            </div>
          </div>

          {onSwitchToBatch && (
            <button
              type="button"
              onClick={onSwitchToBatch}
              className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-yellow-400 hover:underline font-semibold px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <Files className="w-3.5 h-3.5" />
              <span>Batch Queue</span>
            </button>
          )}

          {currentDoc && onPreviewDoc && (
            <button
              type="button"
              onClick={onPreviewDoc}
              className="inline-flex items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-300 hover:border-cyan-400 font-semibold px-3 py-1.5 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-300/60 dark:border-cyan-500/40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview File</span>
            </button>
          )}

          {currentDoc && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white font-semibold px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Replace File</span>
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.rtf,.md"
        onChange={handleInputChange}
        className="hidden"
      />

      {currentDoc ? (
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-yellow-400 text-black flex items-center justify-center flex-shrink-0 font-bold">
              <FileText className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-zinc-900 dark:text-white text-sm leading-tight break-all">
                {currentDoc.name}
              </h4>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                <span className="uppercase font-mono text-amber-700 dark:text-yellow-400 font-semibold">
                  {currentDoc.extension}
                </span>
                <span aria-hidden="true">·</span>
                <span>{(currentDoc.size / 1024 / 1024).toFixed(2)} MB</span>
                {currentDoc.pageCount && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{currentDoc.pageCount} pages</span>
                  </>
                )}
                {currentDoc.wordCount && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{currentDoc.wordCount.toLocaleString()} words</span>
                  </>
                )}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Parsed and ready for theme selection</span>
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Your file stays on your device — only uploaded to Google Drive if you choose Step 4.</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-yellow-400 bg-yellow-400/10'
              : 'border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 hover:bg-zinc-50 dark:hover:bg-zinc-950'
          }`}
        >
          <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            {isLoading ? 'Analyzing document...' : 'Click to browse or drag & drop a file'}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
            PDF · DOCX · DOC · TXT · RTF · MD (up to 50 MB)
          </p>
          <p className="mt-3 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Your files never leave your device — parsed 100% locally in your browser.</span>
          </p>
        </div>
      )}

      {parseError && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
};
