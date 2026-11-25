import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, RefreshCw, Files, Eye, ShieldCheck, Info } from 'lucide-react';
import { parseUploadedDocument } from '../services/documentParser';
import { UploadedDocInfo } from '../types';
import { RobotProgressBar } from './RobotProgressBar';

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
    <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 shadow-xs">
      {/* Centered Step 1 Header */}
      <div className="text-center max-w-md mx-auto mb-5 space-y-2">
        <div className="inline-flex items-center justify-center gap-2">
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/35">
            Step 1
          </span>
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
            Pick Your File
          </h3>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Drop any PDF, Word doc (.docx, .doc), or text note to begin
        </p>

        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
          {/* Single Privacy First Badge */}
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/12 dark:bg-emerald-500/15 border border-emerald-500/45 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Browser-Private</span>
              <Info className="w-3 h-3 opacity-75 shrink-0" />
            </button>

            <div
              id="privacy-first-tooltip"
              role="tooltip"
              className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 max-w-[calc(100vw-3rem)] px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-950 text-white border border-emerald-400/60 shadow-xl text-[11px] leading-relaxed font-medium z-30 transition-all duration-150 ${
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
              className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-yellow-400 hover:underline font-semibold px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <Files className="w-3.5 h-3.5" />
              <span>Batch Queue</span>
            </button>
          )}

          {currentDoc && onPreviewDoc && (
            <button
              type="button"
              onClick={onPreviewDoc}
              className="inline-flex items-center gap-1.5 text-[11px] text-cyan-700 dark:text-cyan-300 hover:border-cyan-400 font-semibold px-2.5 py-1 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-300/60 dark:border-cyan-500/40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview File</span>
            </button>
          )}

          {currentDoc && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white font-semibold px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
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
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-center text-left gap-4">
          <div className="flex items-start gap-3.5 min-w-0 w-full">
            <div className="w-11 h-11 rounded-xl bg-yellow-400 text-black flex items-center justify-center flex-shrink-0 font-bold">
              <FileText className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
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
                <span>Ready for Cover Look &amp; Styling</span>
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
          className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-yellow-400 bg-yellow-400/10'
              : 'border-zinc-300 dark:border-zinc-800 hover:border-yellow-500/70 hover:bg-zinc-50 dark:hover:bg-zinc-950'
          }`}
        >
          {isLoading ? (
            <div className="max-w-sm mx-auto text-left">
              <RobotProgressBar
                compact
                percent={72}
                status="Analyzing & clipping document…"
              />
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                Click to browse or drag &amp; drop a file
              </p>
            </>
          )}
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
            PDF · DOCX · DOC · TXT · RTF · MD (up to 50 MB)
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
