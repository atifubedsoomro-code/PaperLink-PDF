import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, isIOS, isInstalling, promptInstall } = usePWAInstall();
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  if (!canInstall && !isIOS) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canInstall ? promptInstall() : setShowIOSSheet(true))}
        disabled={isInstalling}
        title="Install PaperLink as a desktop or mobile app"
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-yellow-400 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isIOS ? <Share className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" /> : <Download className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
        <span>{isInstalling ? 'Installing...' : 'Install App'}</span>
      </button>

      {showIOSSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Install PaperLink on iOS"
        >
          <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Install PaperLink</h3>
              <button
                type="button"
                onClick={() => setShowIOSSheet(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              In Safari, tap the <strong>Share</strong> icon in the toolbar and choose <strong>Add to Home Screen</strong> to install PaperLink for offline PDF editing.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
