import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [updateSwFn, setUpdateSwFn] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
      try {
        const updateSW = registerSW({
          onNeedRefresh() {
            setNeedsRefresh(true);
          },
          onOfflineReady() {
            // App shell precached for offline PDF tools
          },
          onRegisterError() {
            // Ignore service worker restrictions inside sandboxed preview iframes
          },
        });
        setUpdateSwFn(() => updateSW);
      } catch {
        // Ignore service worker registration errors
      }
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!isOffline && !needsRefresh) return null;

  return (
    <div className="no-print max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 space-y-2">
      {isOffline && (
        <div
          role="status"
          className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 font-medium">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            Offline mode — Local Cover Studio, PDF conversion, merge, split & signing continue to work. Drive upload & email require internet.
          </span>
        </div>
      )}

      {needsRefresh && (
        <div
          role="status"
          className="px-3.5 py-2.5 rounded-xl bg-yellow-400/15 border border-yellow-400/50 text-zinc-900 dark:text-yellow-200 text-xs flex items-center justify-between gap-2"
        >
          <span className="font-medium">A newer version of PaperLink is ready.</span>
          <button
            type="button"
            onClick={() => updateSwFn?.(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
        </div>
      )}
    </div>
  );
};
