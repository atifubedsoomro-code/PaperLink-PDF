import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Mail, Send, X, ShieldAlert, CheckCircle2, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

interface EmailShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  documentTitle: string;
  driveLink: string | null;
  qrDataUrl: string | null;
  onEmailSentSuccess?: (recipient: string, subject: string) => void;
}

export const EmailShareModal: React.FC<EmailShareModalProps> = ({
  isOpen,
  onClose,
  user,
  documentTitle,
  driveLink,
  onEmailSentSuccess,
}) => {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState(`Document Soft Copy: ${documentTitle || 'Attached Document'}`);
  const [customMessage, setCustomMessage] = useState(
    'Please review the soft copy of the attached document on Google Drive. You can also scan the QR code on the cover page to open it directly on your phone.'
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  if (!isOpen) return null;

  const fullEmailBody = `${customMessage}\n\n📄 Document: ${documentTitle || 'Document'}\n🔗 Google Drive Public Soft Copy:\n${driveLink || 'https://drive.google.com'}\n\n(Sent via PaperLink)`;

  const webGmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    recipient.trim()
  )}&su=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(fullEmailBody)}`;

  const mailtoUrl = `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(
    subject.trim()
  )}&body=${encodeURIComponent(fullEmailBody)}`;

  const handleCopyLink = () => {
    if (driveLink) {
      navigator.clipboard.writeText(driveLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyMessage = () => {
    const shareText = `To: ${recipient.trim()}\nSubject: ${subject.trim()}\n\n${fullEmailBody}`;
    navigator.clipboard.writeText(shareText);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleValidateAndProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      setErrorMessage('Please enter a valid recipient email address.');
      return;
    }

    if (!driveLink) {
      setErrorMessage('Google Drive link is missing. Please upload the document to Drive in Step 4.');
      return;
    }

    setIsConfirming(true);
  };

  const handleExternalComposeLaunch = (channel: 'Gmail Web' | 'Mail App') => {
    confetti({
      particleCount: 45,
      spread: 55,
      origin: { y: 0.6 },
    });
    setSuccessMessage(`Compose draft opened in ${channel} for ${recipient.trim()}.`);
    onEmailSentSuccess?.(recipient.trim(), subject.trim());

    setTimeout(() => {
      setIsConfirming(false);
      setSuccessMessage(null);
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 dark:bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-yellow-500/40 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-bold">
              <Mail className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-sm">
                Share Document via Email
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                SEND SOFT COPY LINK & QR
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5">
          {successMessage ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-zinc-900 dark:text-white text-base">Email Compose Opened</h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs mx-auto">{successMessage}</p>
            </div>
          ) : isConfirming ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-yellow-400/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed">
                  <p className="font-bold text-amber-800 dark:text-yellow-300 mb-1">Confirm Recipient & Link</p>
                  <p>
                    Send document link to <strong className="text-amber-700 dark:text-yellow-400">{recipient}</strong> from your account (
                    <strong className="text-zinc-900 dark:text-white">{user?.email || 'Connected Google Account'}</strong>).
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase">
                    Subject
                  </span>
                  <span className="font-bold text-zinc-900 dark:text-white">{subject}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase">
                    Recipient
                  </span>
                  <span className="font-mono text-amber-700 dark:text-yellow-300">{recipient}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase">
                    Google Drive Public Link
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 truncate block text-[11px]">
                    {driveLink}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Back to Edit
                </button>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {copiedMessage ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMessage ? 'Copied' : 'Copy Text'}</span>
                  </button>

                  <a
                    href={mailtoUrl}
                    onClick={() => handleExternalComposeLaunch('Mail App')}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                    <span>Mail App</span>
                  </a>

                  <a
                    href={webGmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalComposeLaunch('Gmail Web')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black transition-all cursor-pointer shadow-sm"
                    title="Opens Gmail Web with recipient, subject, and Drive link pre-filled"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Gmail Web</span>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleValidateAndProceedToConfirm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-yellow-400 mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="colleague@example.com, client@company.com"
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
                  Personal Message
                </label>
                <textarea
                  rows={3}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-white"
                />
              </div>

              <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-600 dark:text-zinc-400 text-[11px]">
                    Drive Public Link Included:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-[11px] text-amber-700 dark:text-yellow-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 truncate">
                  {driveLink || 'Upload document to Drive in Step 4 to attach link'}
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/40 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2.5 pt-2">
                <a
                  href={mailtoUrl}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  Open in Mail App
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Proceed to Send</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
