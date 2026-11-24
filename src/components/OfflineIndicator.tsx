import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { ClipingPapersLogo } from './ClipingPapersLogo';
import { LiquidCrystalButton, LiquidCrystalCard } from './LiquidCrystal';

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [isCheckingConn, setIsCheckingConn] = useState(false);
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

  const handleCheckConnection = async () => {
    setIsCheckingConn(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${window.location.origin}/?ping=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (res.ok && navigator.onLine) {
        setIsOffline(false);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setIsCheckingConn(false);
    }
  };

  if (!isOffline && !needsRefresh) return null;

  return (
    <div className="no-print max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 space-y-2">
      {isOffline && (
        <LiquidCrystalCard
          accentGlow="yellow"
          className="px-4 py-3 rounded-2xl !border-amber-400/70 dark:!border-yellow-400/40"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <ClipingPapersLogo
              size="sm"
              tone="offline"
              layout="inline"
              statusText={
                isCheckingConn
                  ? 'Checking website & internet connection…'
                  : 'Connection down — waiting to reconnect…'
              }
              subText="Local Cover Studio, PDF merge, split, edit, scan & Image tools keep working offline. Drive & AI resume automatically online."
            />

            <LiquidCrystalButton
              variant="primary"
              disabled={isCheckingConn}
              onClick={() => void handleCheckConnection()}
              className="px-3.5 py-2 rounded-xl text-xs whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              {isCheckingConn ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>{isCheckingConn ? 'Reconnecting…' : 'Retry Connection'}</span>
            </LiquidCrystalButton>
          </div>
        </LiquidCrystalCard>
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
