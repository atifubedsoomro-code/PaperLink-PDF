import React from 'react';
import { QrCode, X, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { isEmbeddedIframe } from '../firebase';

interface AuthGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  isLoggingIn: boolean;
  actionTitle?: string;
  errorMsg?: string | null;
  onDismissError?: () => void;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  isLoggingIn,
  actionTitle = 'Connect Google Drive',
  errorMsg = null,
  onDismissError,
}) => {
  if (!isOpen) return null;

  const inIframe = isEmbeddedIframe();
  const fullTabHref = typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-8">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center">
              <QrCode className="w-4 h-4 stroke-[2.5]" />
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Google Drive Authorization</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{actionTitle}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Sign in with Google so PaperLink can save your document directly to your own Google Drive, configure viewer permissions, and encode the public share URL into your cover QR code.
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <span>
              PaperLink only accesses files it creates or uploads. Local PDF tools and Clean Cover exports work without signing in.
            </span>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-200 text-xs space-y-2.5 leading-relaxed"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="flex-1">{errorMsg}</span>
                {onDismissError && (
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="text-red-600 dark:text-red-300 hover:underline font-semibold shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>

              {inIframe && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <a
                    href={fullTabHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-500/40 text-zinc-900 dark:text-white font-semibold hover:border-blue-500 transition-colors"
                  >
                    <span>Open PaperLink in Full Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-center pt-1">
            <GoogleSignInButton
              onClick={onLogin}
              loading={isLoggingIn}
              disabled={isLoggingIn}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
