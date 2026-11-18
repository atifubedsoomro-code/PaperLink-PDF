import React from 'react';
import { ArrowLeft, ShieldCheck, FileText, Lock, HardDrive } from 'lucide-react';

interface LegalPagesViewProps {
  page: 'privacy' | 'terms';
  onBack: () => void;
  onSwitchPage: (page: 'privacy' | 'terms') => void;
}

export const LegalPagesView: React.FC<LegalPagesViewProps> = ({
  page,
  onBack,
  onSwitchPage,
}) => {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to PaperLink</span>
        </button>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onSwitchPage('privacy')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              page === 'privacy'
                ? 'bg-yellow-400 text-black'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onSwitchPage('terms')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              page === 'terms'
                ? 'bg-yellow-400 text-black'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            Terms of Service
          </button>
        </div>
      </div>

      {page === 'privacy' ? (
        <article className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
            <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>PaperLink Privacy Policy</span>
            </div>
            <h1 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              Your documents stay on your device and in your own Google Drive.
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Effective Date: November 2026 · Operated by Team Terminators (PaperLink)
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              1. Local Browser Processing
            </h2>
            <p>
              All PDF cover generation, Word-to-PDF and PDF-to-Word conversions, PDF merging, splitting, compression, page rotation, image-to-PDF packing, and digital signature stamping run entirely inside your local browser memory. PaperLink does not upload your documents to any third-party conversion server.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              2. Google User Data & OAuth Scopes
            </h2>
            <p>
              When you choose to sign in with Google, PaperLink requests only the minimum non-sensitive scope required to sync your documents:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li>
                <code className="font-mono text-amber-700 dark:text-yellow-400">https://www.googleapis.com/auth/drive.file</code> — Allows PaperLink to upload only the PDF documents you explicitly export or sync, update those specific files, and set public reader permissions when you create a cover QR code. PaperLink cannot view, list, or read any other files in your Google Drive.
              </li>
            </ul>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Email sharing opens a pre-filled compose draft in your browser (Gmail Web) or local email app — PaperLink never requests Gmail API access to read or send your emails on your behalf. Anonymous feedback is transmitted via PaperLink&apos;s server endpoint without linking your Google account.
            </p>
            <p>
              PaperLink&apos;s use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 dark:text-yellow-400 hover:underline font-semibold"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">
              3. Stored Metadata & Brand Kits
            </h2>
            <p>
              Document history entries (title, file name, Drive share URL, cover configuration) and saved Brand Kit presets are stored in your browser&apos;s local storage and, when signed in, synced securely to your authenticated Firebase Firestore record scoped strictly to your Google account email. OAuth access tokens remain solely in temporary browser <code className="font-mono">sessionStorage</code> and expire automatically after 1 hour or upon sign-out.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">
              4. Revoking Access & Deletion
            </h2>
            <p>
              You can delete any saved document record or Brand Kit directly inside PaperLink at any time, and you may revoke PaperLink&apos;s Google permissions anytime from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 dark:text-yellow-400 hover:underline font-semibold"
              >
                Google Account Security Permissions
              </a>
              .
            </p>
          </section>
        </article>
      ) : (
        <article className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
            <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-amber-700 dark:text-yellow-400 uppercase tracking-wider mb-2">
              <FileText className="w-4 h-4" />
              <span>PaperLink Terms of Service</span>
            </div>
            <h1 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              Terms of Use
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Effective Date: November 2026 · PaperLink by Team Terminators
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using PaperLink, you agree to use its Cover Studio, Google Drive QR synchronization, email sharing, and local PDF utility tools responsibly and in compliance with applicable laws and Google Workspace acceptable use policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">
              2. Document Ownership & Public Sharing Responsibility
            </h2>
            <p>
              You retain 100% ownership and copyright over all documents you upload, convert, or stamp using PaperLink. When you choose to enable public QR viewer access on a file in Google Drive, anyone possessing the printed cover or scanning the QR code will be able to open that specific file URL. Always verify confidentiality before printing or distributing public QR covers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">
              3. Service Availability
            </h2>
            <p>
              Local PDF tools run offline via your browser engine once loaded. Google Drive uploads depend on your authenticated Google account connectivity and Google Drive API availability.
            </p>
          </section>
        </article>
      )}
    </div>
  );
};
