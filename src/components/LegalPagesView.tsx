import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  HardDrive,
  Lock,
  Scale,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { MiniAiRobot } from './MiniAiRobot';
import { LiquidCrystalCard } from './LiquidCrystal';

interface LegalPagesViewProps {
  page: 'privacy' | 'terms';
  onBack: () => void;
  onSwitchPage: (page: 'privacy' | 'terms') => void;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const LegalPagesView: React.FC<LegalPagesViewProps> = ({
  page,
  onBack,
  onSwitchPage,
}) => {
  const isPrivacy = page === 'privacy';

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-8 space-y-5">
      {/* Top Action & Animated Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:border-[var(--pl-accent)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to PaperLink</span>
        </button>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          {([
            { id: 'privacy', label: 'Privacy Policy' },
            { id: 'terms', label: 'Terms of Service' },
          ] as const).map((tab) => {
            const active = page === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSwitchPage(tab.id)}
                className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? 'text-[var(--pl-cta-text)]'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="legalTabHighlight"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))]"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Robot Trust Companion Header */}
      <LiquidCrystalCard accentGlow="yellow" className="rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="relative flex flex-col items-center shrink-0">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <MiniAiRobot
                variant="hero"
                expressionOverride={isPrivacy ? 'wink' : 'thumbs-up'}
                sizeClassName="w-20 h-20 overflow-visible drop-shadow-[0_10px_18px_rgba(15,23,42,0.18)]"
              />
            </motion.div>
            <span className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-900 dark:bg-yellow-400 text-white dark:text-zinc-950 text-[10px] font-bold shadow-xs">
              {isPrivacy ? 'Your data stays yours' : 'Clear & fair terms'}
            </span>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-blue-700 dark:text-yellow-400 uppercase tracking-wider">
              {isPrivacy ? <ShieldCheck className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              <span>{isPrivacy ? 'PaperLink Privacy Commitment' : 'PaperLink Terms of Service'}</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              {isPrivacy
                ? 'Your documents stay on your device and in your own Google Drive.'
                : 'Simple, transparent terms for PaperLink Studio & Tools.'}
            </h1>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Effective Date: November 2026 · Operated by Team Terminators (PaperLink)
            </p>

            {/* Quick Summary Trust Pills */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
              {[
                { label: '100% Browser Processing', icon: Lock },
                { label: 'Minimal drive.file Scope', icon: HardDrive },
                { label: '100% File Ownership', icon: CheckCircle2 },
              ].map((badge) => {
                const Icon = badge.icon;
                return (
                  <span
                    key={badge.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300"
                  >
                    <Icon className="w-3 h-3 text-blue-600 dark:text-yellow-400" />
                    <span>{badge.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </LiquidCrystalCard>

      {/* Structured Policy / Terms Body with Smooth Tab Transition */}
      <AnimatePresence mode="wait">
        {isPrivacy ? (
          <motion.div
            key="privacy-content"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
          >
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  1. Local Browser Processing
                </h2>
              </div>
              <p className="text-xs sm:text-sm">
                All PDF cover generation, Word-to-PDF and PDF-to-Word conversions, merging, splitting, compression, page rotation, scan perspective cleanup, image background removal, and digital signatures run entirely inside your local browser memory. PaperLink does not upload your private files to third-party conversion servers.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  2. Google User Data &amp; OAuth Scope
                </h2>
              </div>
              <p className="text-xs sm:text-sm">
                When you connect Google Drive, PaperLink requests only the minimal non-sensitive scope:{' '}
                <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-blue-700 dark:text-yellow-400">
                  drive.file
                </code>
                . This lets PaperLink access only files you explicitly create or sync—never unrelated files in your Drive.
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Email sharing opens Gmail Web or your mail app directly; anonymous feedback never links your Google account. Usage adheres strictly to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 dark:text-yellow-400 hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  <span>Google API Services User Data Policy</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                , including Limited Use requirements.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  3. Stored Metadata &amp; Brand Kits
                </h2>
              </div>
              <p className="text-xs sm:text-sm">
                Document library references (title, file name, Drive share URL, cover settings) and saved Brand Kits are stored in local browser storage and, when signed in, synced securely to your authenticated account record scoped to your email. OAuth tokens live only in temporary <code className="font-mono text-xs">sessionStorage</code> and expire automatically after 1 hour or sign-out.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  4. Revoking Access &amp; Deletion
                </h2>
              </div>
              <p className="text-xs sm:text-sm">
                You can clear drafts, delete saved document records or Brand Kits directly in PaperLink anytime, and revoke Google Drive access whenever you want from{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 dark:text-yellow-400 hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  <span>Google Account Permissions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
            </motion.section>
          </motion.div>
        ) : (
          <motion.div
            key="terms-content"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
          >
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                1. Acceptance of Terms
              </h2>
              <p className="text-xs sm:text-sm">
                By accessing or using PaperLink, you agree to use its Cover Studio, Google Drive QR synchronization, email sharing, and local PDF &amp; Image tools responsibly and in compliance with applicable laws and Google Workspace acceptable use policies.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                2. Document Ownership &amp; QR Sharing
              </h2>
              <p className="text-xs sm:text-sm">
                You retain 100% ownership and copyright over every file you upload, convert, or stamp using PaperLink. When enabling public QR viewer access on Google Drive, anyone scanning the printed QR code can open that specific link — always verify confidentiality before printing or distributing public QR covers.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.25 }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] p-5 space-y-2.5 shadow-xs"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-400 flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                3. Service Availability
              </h2>
              <p className="text-xs sm:text-sm">
                All local PDF, Office, Scan/Crop, and Image tools run directly offline in your browser once loaded. Optional Google Drive cloud uploads depend on your authenticated Google account session and Google Drive API availability.
              </p>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
