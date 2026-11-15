import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, RefreshCw, Files } from 'lucide-react';
import { parseUploadedDocument } from '../services/documentParser';
import { UploadedDocInfo } from '../types';

interface DocumentUploaderProps {
  currentDoc: UploadedDocInfo | null;
  onDocumentParsed: (doc: UploadedDocInfo) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  onSwitchToBatch?: () => void;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  currentDoc,
  onDocumentParsed,
  isLoading,
  setIsLoading,
  onSwitchToBatch,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

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
    <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">01. Upload Document Source</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Supports PDF, Microsoft Word (.docx, .doc), and text files
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
