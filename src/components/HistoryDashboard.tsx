import React, { useState } from 'react';
import { SavedDocRecord } from '../types';
import {
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Share2,
  Layers,
  Search,
  QrCode,
  Mail,
  Eye,
} from 'lucide-react';
import { deleteDocumentRecord } from '../firebase';

interface HistoryDashboardProps {
  documents: SavedDocRecord[];
  onSelectDocument: (doc: SavedDocRecord) => void;
  onRefresh: () => void;
  onOpenEmailShare: (doc: SavedDocRecord) => void;
  onPreviewDoc?: (doc: SavedDocRecord) => void;
}

export const HistoryDashboard: React.FC<HistoryDashboardProps> = ({
  documents,
  onSelectDocument,
  onRefresh,
  onOpenEmailShare,
  onPreviewDoc,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleCopyLink = (id: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConfirmDelete = async (docId: string) => {
    setIsDeleting(docId);
    try {
      await deleteDocumentRecord(docId);
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredDocs = documents.filter(
    (d) =>
      (d.title || d.fileName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.driveLink.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Search & Header Bar */}
      <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Document Library</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
            {documents.length} saved {documents.length === 1 ? 'document' : 'documents'} · Synced with your browser & Google account
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter documents..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-white"
          />
        </div>
      </div>

      {/* Document Grid */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
          <QrCode className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">No Saved Documents</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto mt-1">
            Documents synced via Cover Studio or Batch Processor appear here for quick reloading and sharing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const dateStr = new Date(doc.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const awaitingDelete = confirmDeleteId === doc.id;

            return (
              <div
                key={doc.id}
                className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 p-5 transition-colors flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    <span className="font-mono text-amber-700 dark:text-yellow-400 truncate">
                      {doc.coverData.themeId}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">{dateStr}</span>
                  </div>

                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-2 leading-snug">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate">{doc.fileName}</p>

                  <div className="mt-3 p-2.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 truncate flex-1">
                      {doc.driveLink}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(doc.id, doc.driveLink)}
                      className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 dark:hover:text-yellow-400 transition-colors cursor-pointer shrink-0"
                      title="Copy link"
                    >
                      {copiedId === doc.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {doc.sentEmails && doc.sentEmails.length > 0 && (
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 tabular-nums">
                      <Mail className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      <span>Shared with {doc.sentEmails.length} recipient(s)</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectDocument(doc)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-yellow-400 hover:text-amber-800 dark:hover:text-yellow-300 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Open in Studio</span>
                  </button>

                  {awaitingDelete ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmDelete(doc.id)}
                        disabled={isDeleting === doc.id}
                        className="px-2.5 py-1 text-[11px] font-bold rounded bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                      >
                        {isDeleting === doc.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {onPreviewDoc && (
                        <button
                          type="button"
                          onClick={() => onPreviewDoc(doc)}
                          className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                          title="Preview document"
                          aria-label={`Preview ${doc.title}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenEmailShare(doc)}
                        className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-yellow-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                        title="Share via Email"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <a
                        href={doc.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
                        title="Open in Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                        title="Remove from library"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
