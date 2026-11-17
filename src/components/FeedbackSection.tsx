import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Bug,
  Check,
  CheckCircle2,
  Clock,
  Heart,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { NeonGlowMode } from './SettingsModal';
import {
  appendFeedbackToGoogleSheet,
  computeLocalStats,
  extractSpreadsheetId,
  FeedbackEntry,
  FeedbackPriority,
  FeedbackTrackerStats,
  FeedbackType,
  generateFeedbackId,
  getLocalFeedbackEntries,
  postFeedbackToWebhook,
  saveLocalFeedbackEntry,
  TOOL_OPTIONS_BY_CATEGORY,
  ToolCategory,
} from '../services/feedbackSheets';

interface FeedbackSectionProps {
  variant?: 'landing' | 'settings';
  accessToken?: string | null;
  sheetUrl: string;
  webhookUrl: string;
  neonGlowMode?: NeonGlowMode;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
}

const CATEGORIES = Object.keys(TOOL_OPTIONS_BY_CATEGORY) as ToolCategory[];

const FEEDBACK_TYPES: {
  id: FeedbackType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'Feature Request', label: 'Idea', icon: Lightbulb },
  { id: 'Bug Report', label: 'Bug', icon: Bug },
  { id: 'Compliment / Praise', label: 'Praise', icon: Heart },
  { id: 'UI / UX Suggestion', label: 'UI / UX', icon: Sparkles },
  { id: 'Performance', label: 'Speed', icon: Zap },
];

const PRIORITIES: FeedbackPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

const RATING_LABELS: Record<number, { text: string; tone: string }> = {
  1: { text: 'Needs Work', tone: 'text-rose-600 dark:text-rose-400' },
  2: { text: 'Fair', tone: 'text-orange-600 dark:text-orange-400' },
  3: { text: 'Good', tone: 'text-amber-600 dark:text-yellow-400' },
  4: { text: 'Great!', tone: 'text-cyan-600 dark:text-cyan-400' },
  5: { text: 'Loved It!', tone: 'text-emerald-600 dark:text-emerald-400' },
};

export const FeedbackSection: React.FC<FeedbackSectionProps> = ({
  variant = 'landing',
  accessToken = null,
  sheetUrl,
  webhookUrl,
  neonGlowMode = 'full',
  onTaskComplete,
}) => {
  const isLanding = variant === 'landing';

  // Anonymous-friendly form fields (no login, no personal account linking)
  const [alias, setAlias] = useState('');
  const [toolCategory, setToolCategory] = useState<ToolCategory>('Cover Studio');
  const [specificTool, setSpecificTool] = useState<string>(TOOL_OPTIONS_BY_CATEGORY['Cover Studio'][0]);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('Feature Request');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [priority, setPriority] = useState<FeedbackPriority>('Medium');
  const [details, setDetails] = useState('');

  // Local tracker + confirmation flow
  const [localEntries, setLocalEntries] = useState<FeedbackEntry[]>(() => getLocalFeedbackEntries());
  const [pendingEntry, setPendingEntry] = useState<FeedbackEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const [formValidationErr, setFormValidationErr] = useState<string | null>(null);

  useEffect(() => {
    const opts = TOOL_OPTIONS_BY_CATEGORY[toolCategory];
    if (opts && !opts.includes(specificTool)) {
      setSpecificTool(opts[0]);
    }
  }, [toolCategory, specificTool]);

  const parsedSheetId = useMemo(() => extractSpreadsheetId(sheetUrl), [sheetUrl]);
  const hasValidWebhook = useMemo(
    () => /^https:\/\/script\.google\.com\/macros\/s\//i.test((webhookUrl || '').trim()),
    [webhookUrl]
  );

  const stats: FeedbackTrackerStats = useMemo(() => computeLocalStats(localEntries), [localEntries]);
  const recentEntries = localEntries.slice(0, 3);

  const handlePrepareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationErr(null);
    setSubmitBanner(null);

    const trimmedDetails = details.trim();
    if (trimmedDetails.length < 5) {
      setFormValidationErr('Please enter at least 5 characters of feedback.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const entry: FeedbackEntry = {
      feedbackId: generateFeedbackId(),
      date: today,
      userName: alias.trim() || 'Anonymous',
      toolCategory,
      specificTool,
      feedbackType,
      rating,
      details: trimmedDetails,
      priority,
      status: 'New',
      resolutionNotes: '',
      createdAt: Date.now(),
    };

    setPendingEntry(entry);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingEntry) return;
    setIsSubmitting(true);

    try {
      let synced = false;

      // 1. Prefer silent server-side /api/feedback proxy (keeps Google Sheet URL completely private)
      try {
        const apiRes = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingEntry),
        });
        if (apiRes.ok) {
          const data = await apiRes.json().catch(() => ({}));
          if (data?.synced) synced = true;
        }
      } catch {
        // Fallback below if /api/feedback is unreachable
      }

      // 2. Fallback to client-configured webhook or Google Sheet token
      if (!synced && hasValidWebhook) {
        await postFeedbackToWebhook(webhookUrl.trim(), pendingEntry);
        synced = true;
      } else if (!synced && parsedSheetId && accessToken) {
        await appendFeedbackToGoogleSheet({
          spreadsheetId: parsedSheetId,
          accessToken,
          entry: pendingEntry,
        });
        synced = true;
      }

      const savedList = saveLocalFeedbackEntry({
        ...pendingEntry,
        status: synced ? 'New' : 'Saved Locally',
        syncedToGoogleSheet: synced,
      });
      setLocalEntries(savedList);

      setSubmitBanner(
        `Thank you! Your anonymous feedback (${pendingEntry.feedbackId}) has been recorded.`
      );
      onTaskComplete?.({
        headline: synced ? 'Feedback Received' : 'Feedback Recorded',
        subtext: `Thank you! ${pendingEntry.feedbackId} (${pendingEntry.rating}/5★) has been logged.`,
        statusLabel: synced ? 'Anonymous Feedback Sent' : 'Feedback Saved',
      });

      setDetails('');
      setPendingEntry(null);
    } catch {
      const savedList = saveLocalFeedbackEntry({
        ...pendingEntry,
        status: 'Saved Locally',
        syncedToGoogleSheet: false,
      });
      setLocalEntries(savedList);
      setSubmitBanner(`Feedback ${pendingEntry.feedbackId} has been recorded locally.`);
      setDetails('');
      setPendingEntry(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoverRating ?? rating;
  const ratingInfo = RATING_LABELS[displayRating] || RATING_LABELS[5];

  const confirmationModal = (
    <AnimatePresence>
      {pendingEntry && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-feedback-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setPendingEntry(null);
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-sm rounded-2xl border border-yellow-400/50 bg-white dark:bg-[#121216] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0c0c10] flex items-center justify-between">
              <h4 id="confirm-feedback-title" className="text-xs font-bold text-zinc-950 dark:text-white">
                Confirm Anonymous Feedback
              </h4>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingEntry(null)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                aria-label="Cancel submission"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  {pendingEntry.userName} · {pendingEntry.feedbackType}
                </span>
                <span className="font-bold text-amber-600 dark:text-yellow-400">
                  {pendingEntry.rating}/5 ★ · {pendingEntry.priority}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                {pendingEntry.toolCategory} → {pendingEntry.specificTool}
              </p>
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                {pendingEntry.details}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0c0c10] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingEntry(null)}
                className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                className="px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Send Anonymously</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const formBody = (
    <form onSubmit={handlePrepareSubmit} className="space-y-3">
      {/* Compact Rating + Optional Name Row */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
        <div className="sm:col-span-7 px-3 py-2 rounded-xl bg-zinc-50/90 dark:bg-[#0b0b10] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating out of 5 stars">
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = star <= displayRating;
              return (
                <motion.button
                  key={star}
                  type="button"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  onClick={() => setRating(star)}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  className="p-0.5 cursor-pointer focus:outline-none"
                >
                  <Star
                    className={`w-5 h-5 transition-all duration-150 ${
                      filled
                        ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.55)]'
                        : 'text-zinc-300 dark:text-zinc-700'
                    }`}
                  />
                </motion.button>
              );
            })}
          </div>
          <span className={`text-[11px] font-bold ${ratingInfo.tone} whitespace-nowrap`}>
            {displayRating}/5 · {ratingInfo.text}
          </span>
        </div>

        <div className="sm:col-span-5">
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Name / Alias (optional)"
            aria-label="Name or Alias (optional)"
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400"
          />
        </div>
      </div>

      {/* Compact Category + Specific Tool + Priority Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={toolCategory}
          onChange={(e) => setToolCategory(e.target.value as ToolCategory)}
          aria-label="Suite Category"
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={specificTool}
          onChange={(e) => setSpecificTool(e.target.value)}
          aria-label="Specific Tool"
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
        >
          {TOOL_OPTIONS_BY_CATEGORY[toolCategory].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as FeedbackPriority)}
          aria-label="Priority"
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Priority: {p}
            </option>
          ))}
        </select>
      </div>

      {/* Compact Type Chips */}
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_TYPES.map((ft) => {
          const Icon = ft.icon;
          const active = feedbackType === ft.id;
          return (
            <button
              key={ft.id}
              type="button"
              onClick={() => setFeedbackType(ft.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                active
                  ? 'border-cyan-400 bg-cyan-400/15 text-cyan-700 dark:text-cyan-300 font-bold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{ft.label}</span>
            </button>
          );
        })}
      </div>

      {/* Comment Input */}
      <div className="relative">
        <textarea
          rows={isLanding ? 3 : 2}
          maxLength={600}
          value={details}
          onChange={(e) => {
            setDetails(e.target.value);
            if (formValidationErr) setFormValidationErr(null);
          }}
          placeholder="Share an idea, rating, or issue — completely anonymous, no sign-in needed..."
          className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400 resize-none leading-relaxed"
        />
        <span className="absolute bottom-2 right-2.5 text-[10px] font-mono text-zinc-400 pointer-events-none">
          {details.length}/600
        </span>
      </div>

      {formValidationErr && (
        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{formValidationErr}</span>
        </div>
      )}

      {submitBanner && (
        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <p className="font-semibold">{submitBanner}</p>
        </div>
      )}

      {/* Compact Submit Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
          <span>100% Anonymous · No Sign-In Required</span>
        </span>

        <motion.button
          type="submit"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
        >
          <Send className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Send Feedback</span>
        </motion.button>
      </div>
    </form>
  );

  // Compact 4-stat strip
  const compactStatsBar = (
    <div className="grid grid-cols-4 gap-2">
      {[
        { label: 'Responses', value: String(stats.totalSubmissions), tone: 'text-zinc-950 dark:text-white' },
        {
          label: 'Rating',
          value: stats.averageRating > 0 ? `${stats.averageRating}★` : '—',
          tone: 'text-amber-600 dark:text-yellow-400',
        },
        { label: 'Open', value: String(stats.openIssues), tone: 'text-cyan-600 dark:text-cyan-400' },
        { label: 'Resolved', value: `${stats.resolutionRate}%`, tone: 'text-emerald-600 dark:text-emerald-400' },
      ].map((kpi) => (
        <div
          key={kpi.label}
          className="px-2.5 py-2 rounded-xl bg-zinc-50 dark:bg-[#0b0b10] border border-zinc-200 dark:border-zinc-800 text-center"
        >
          <p className={`text-sm font-extrabold font-mono tabular-nums ${kpi.tone}`}>{kpi.value}</p>
          <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{kpi.label}</p>
        </div>
      ))}
    </div>
  );

  // SETTINGS VARIANT (Ultra-compact inside SettingsModal -> Feedback)
  if (!isLanding) {
    return (
      <div className="space-y-3">
        {confirmationModal}
        {compactStatsBar}
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0e0e13]">
          {formBody}
        </div>
      </div>
    );
  }

  // LANDING VARIANT (Compact Neon Card at the bottom of Home Page just above Footer)
  return (
    <section
      id="user-feedback"
      className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/75 dark:bg-[#0a0a0f] py-10 lg:py-12 transition-colors"
    >
      {confirmationModal}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative">
          {neonGlowMode === 'full' && (
            <div
              aria-hidden="true"
              className="pointer-events-none -inset-1 absolute rounded-3xl bg-gradient-to-tr from-yellow-400/20 via-cyan-400/15 to-amber-500/20 blur-xl opacity-70"
            />
          )}

          <div
            className={`relative p-[1.5px] rounded-2xl bg-gradient-to-br from-yellow-400/75 via-cyan-400/45 to-amber-500/75 ${
              neonGlowMode === 'full'
                ? 'shadow-[0_0_24px_rgba(250,204,21,0.16),0_0_40px_rgba(34,211,238,0.1)]'
                : 'shadow-md'
            }`}
          >
            <div className="rounded-[14.5px] bg-white/95 dark:bg-[#101016]/95 backdrop-blur-xl p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
              {/* Left Compact Column: Header + Stats + Latest 3 Feedback Highlights */}
              <div className="lg:col-span-5 space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquarePlus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-amber-700 dark:text-yellow-400 uppercase tracking-wider font-bold">
                      Anonymous Feedback
                    </p>
                    <h2 className="text-lg font-extrabold text-zinc-950 dark:text-white tracking-tight leading-snug">
                      Help improve PaperLink
                    </h2>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      No account needed — share quick ratings or ideas directly.
                    </p>
                  </div>
                </div>

                {compactStatsBar}

                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-400">
                    Recent Feedback ({recentEntries.length})
                  </p>
                  {recentEntries.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                      No entries yet — be the first to share feedback!
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {recentEntries.map((item) => (
                        <div
                          key={item.feedbackId}
                          className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/70 dark:bg-zinc-950/80 space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-zinc-900 dark:text-white truncate">
                              {item.specificTool || item.toolCategory}
                            </span>
                            <span className="text-amber-500 font-bold shrink-0">
                              {'★'.repeat(Math.max(1, Math.min(5, item.rating)))}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1">
                            {item.details}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>{item.userName}</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {item.date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Compact Form Column */}
              <div className="lg:col-span-7 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-[#0d0d12]">
                {formBody}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
