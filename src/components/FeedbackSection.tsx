import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  MessageSquare,
  MessageSquarePlus,
  RefreshCw,
  Reply,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { NeonGlowMode } from './SettingsModal';
import {
  backfillMissingReviewsToFirestore,
  FEEDBACK_ADMIN_EMAIL,
  getPublicReviewsFromFirestore,
  submitPublicReviewToFirestore,
  subscribeToPublicReviews,
  syncSheetReviewsToFirestore,
  updatePublicReviewSolutionInFirestore,
} from '../firebase';
import {
  appendFeedbackToGoogleSheet,
  computeLocalStats,
  extractSpreadsheetId,
  FeedbackEntry,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackTrackerStats,
  FeedbackType,
  fetchLiveFeedbackEntries,
  generateFeedbackId,
  getLocalFeedbackEntries,
  inspectFeedbackSpreadsheet,
  mergeFeedbackEntries,
  postFeedbackToWebhook,
  saveLocalFeedbackEntry,
  TOOL_OPTIONS_BY_CATEGORY,
  ToolCategory,
} from '../services/feedbackSheets';

interface FeedbackSectionProps {
  variant?: 'landing' | 'settings';
  userEmail?: string;
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
  3: { text: 'Good', tone: 'text-blue-600 dark:text-yellow-400' },
  4: { text: 'Great!', tone: 'text-cyan-600 dark:text-cyan-400' },
  5: { text: 'Loved It!', tone: 'text-emerald-600 dark:text-emerald-400' },
};

function getStatusBadgeStyle(status: string, hasSolution: boolean): { label: string; className: string } {
  const clean = (status || 'New').trim();
  const low = clean.toLowerCase();
  if (low.includes('resolv') || low.includes('closed') || hasSolution) {
    return {
      label: hasSolution && !low.includes('resolv') ? 'Solution Posted' : 'Resolved',
      className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (low.includes('review') || low.includes('progress')) {
    return {
      label: 'In Review',
      className: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (clean === 'Saved Locally') {
    return {
      label: 'Pending Sync',
      className: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-400/30',
    };
  }
  return {
    label: clean || 'New',
    className: 'bg-blue-500/12 text-blue-700 dark:text-yellow-300 border-blue-500/30 dark:border-yellow-400/30',
  };
}

export const FeedbackSection: React.FC<FeedbackSectionProps> = ({
  variant = 'landing',
  userEmail = '',
  accessToken = null,
  sheetUrl,
  webhookUrl,
  neonGlowMode = 'full',
  onTaskComplete,
}) => {
  const isLanding = variant === 'landing';
  const isAdmin =
    Boolean(userEmail) &&
    userEmail.trim().toLowerCase() === FEEDBACK_ADMIN_EMAIL.toLowerCase();

  const [alias, setAlias] = useState('');
  const [toolCategory, setToolCategory] = useState<ToolCategory>('Cover Studio');
  const [specificTool, setSpecificTool] = useState<string>(TOOL_OPTIONS_BY_CATEGORY['Cover Studio'][0]);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('Feature Request');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [priority, setPriority] = useState<FeedbackPriority>('Medium');
  const [details, setDetails] = useState('');

  const [cloudEntries, setCloudEntries] = useState<FeedbackEntry[]>([]);
  const [sheetApiEntries, setSheetApiEntries] = useState<FeedbackEntry[]>([]);
  const [localEntries, setLocalEntries] = useState<FeedbackEntry[]>(() => getLocalFeedbackEntries());
  const [feedSource, setFeedSource] = useState<'firestore' | 'google-sheet' | 'server-store' | 'local'>('firestore');
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'solutions' | 'open'>('all');

  const [pendingEntry, setPendingEntry] = useState<FeedbackEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const [formValidationErr, setFormValidationErr] = useState<string | null>(null);

  // Admin inline Team Solution editor state
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'In Review' | 'Resolved'>('Resolved');
  const [draftSolution, setDraftSolution] = useState('');
  const [savingSolutionId, setSavingSolutionId] = useState<string | null>(null);
  const [solutionErr, setSolutionErr] = useState<string | null>(null);

  const backfilledRef = useRef(false);

  const entries = useMemo(
    () =>
      mergeFeedbackEntries(
        cloudEntries,
        mergeFeedbackEntries(sheetApiEntries, localEntries)
      ),
    [cloudEntries, sheetApiEntries, localEntries]
  );

  const parsedSheetId = useMemo(() => extractSpreadsheetId(sheetUrl), [sheetUrl]);
  const hasValidWebhook = useMemo(
    () => /^https:\/\/script\.google\.com\/macros\/s\//i.test((webhookUrl || '').trim()),
    [webhookUrl]
  );

  useEffect(() => {
    const opts = TOOL_OPTIONS_BY_CATEGORY[toolCategory];
    if (opts && !opts.includes(specificTool)) {
      setSpecificTool(opts[0]);
    }
  }, [toolCategory, specificTool]);

  // Real-time shared Firestore subscription so every visitor sees live reviews & team solutions
  useEffect(() => {
    const unsubscribe = subscribeToPublicReviews(
      (list) => {
        setCloudEntries(list.map((item) => ({ ...item, syncedToFirestore: true })));
        setFeedSource((prev) => (prev === 'google-sheet' ? 'google-sheet' : 'firestore'));
      },
      () => {
        // Keep server/local fallback entries if offline
      }
    );
    return () => unsubscribe();
  }, []);

  // One-time backfill of any older local-only reviews into shared Cloud Firestore
  useEffect(() => {
    let cancelled = false;
    const backfillLocalReviews = async () => {
      if (backfilledRef.current) return;
      backfilledRef.current = true;
      const stored = getLocalFeedbackEntries();
      const candidates = stored.filter(
        (item) => !item.syncedToFirestore && (item.details || '').trim().length >= 3
      );
      if (candidates.length === 0) return;

      const existingCloud = await getPublicReviewsFromFirestore();
      if (cancelled) return;
      const existingIds = new Set(existingCloud.map((c) => c.feedbackId));

      let updatedAny = false;
      for (const item of candidates) {
        if (existingIds.has(item.feedbackId)) {
          saveLocalFeedbackEntry({ ...item, syncedToFirestore: true });
          updatedAny = true;
          continue;
        }
        const ok = await submitPublicReviewToFirestore(item);
        if (ok && !cancelled) {
          saveLocalFeedbackEntry({ ...item, syncedToFirestore: true });
          updatedAny = true;
        }
      }
      if (updatedAny && !cancelled) {
        setLocalEntries(getLocalFeedbackEntries());
      }
    };
    void backfillLocalReviews();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLiveReviews = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const [cloudRows, apiResult] = await Promise.all([
        getPublicReviewsFromFirestore(),
        fetchLiveFeedbackEntries({
          sheetUrl,
          webhookUrl,
        }),
      ]);

      if (cloudRows.length > 0) {
        setCloudEntries(cloudRows.map((r) => ({ ...r, syncedToFirestore: true })));
      }

      let nextSheetRows = apiResult.entries;

      // If admin/user is authenticated with Sheets access, pull live rows + Team Solutions
      if (parsedSheetId && accessToken) {
        try {
          const info = await inspectFeedbackSpreadsheet(parsedSheetId, accessToken);
          const apiRows = info?.stats?.recentRows || [];
          if (apiRows.length > 0) {
            nextSheetRows = mergeFeedbackEntries(apiRows, nextSheetRows);
            setFeedSource('google-sheet');
            if (isAdmin) {
              void syncSheetReviewsToFirestore(apiRows);
            }
          }
        } catch {
          // Keep cloud / server feed if private sheet token isn't authorized for spreadsheets
        }
      } else if (parsedSheetId || hasValidWebhook) {
        setFeedSource('google-sheet');
      } else if (cloudRows.length > 0) {
        setFeedSource('firestore');
      } else if (apiResult.source) {
        setFeedSource(apiResult.source);
      }

      setSheetApiEntries(nextSheetRows);
      if (isAdmin && apiResult.entries.length > 0) {
        void backfillMissingReviewsToFirestore(apiResult.entries);
      }
    } finally {
      setIsRefreshingFeed(false);
    }
  }, [sheetUrl, webhookUrl, parsedSheetId, accessToken, hasValidWebhook, isAdmin]);

  useEffect(() => {
    void refreshLiveReviews();
  }, [refreshLiveReviews]);

  useEffect(() => {
    const syncLocalOnly = () => setLocalEntries(getLocalFeedbackEntries());
    window.addEventListener('paperlink-feedback-updated', syncLocalOnly);
    window.addEventListener('storage', syncLocalOnly);
    return () => {
      window.removeEventListener('paperlink-feedback-updated', syncLocalOnly);
      window.removeEventListener('storage', syncLocalOnly);
    };
  }, []);

  const stats: FeedbackTrackerStats = useMemo(() => computeLocalStats(entries), [entries]);

  const filteredReviews = useMemo(() => {
    const base = entries.filter((item) => {
      const hasSol = Boolean((item.resolutionNotes || '').trim());
      const resolved =
        hasSol ||
        (item.status || '').toLowerCase().includes('resolved') ||
        (item.status || '').toLowerCase().includes('closed');
      if (reviewFilter === 'solutions') return hasSol || resolved;
      if (reviewFilter === 'open') return !resolved;
      return true;
    });
    return base.slice(0, 50);
  }, [entries, reviewFilter]);

  const solutionsCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          Boolean((e.resolutionNotes || '').trim()) ||
          (e.status || '').toLowerCase().includes('resolved')
      ).length,
    [entries]
  );

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

  const handleStartSolutionEdit = (item: FeedbackEntry) => {
    setEditingReviewId(item.feedbackId);
    const lowStatus = (item.status || '').toLowerCase();
    setDraftStatus(lowStatus.includes('review') ? 'In Review' : 'Resolved');
    setDraftSolution(item.resolutionNotes || '');
    setSolutionErr(null);
  };

  const handleSaveSolution = async (item: FeedbackEntry) => {
    if (!isAdmin) return;
    setSavingSolutionId(item.feedbackId);
    setSolutionErr(null);
    const cleanedNotes = draftSolution.trim();
    try {
      await updatePublicReviewSolutionInFirestore(item, {
        status: draftStatus,
        resolutionNotes: cleanedNotes,
        syncedToGoogleSheet: item.syncedToGoogleSheet,
      });
      const updatedEntry: FeedbackEntry = {
        ...item,
        status: draftStatus as FeedbackStatus,
        resolutionNotes: cleanedNotes,
        syncedToFirestore: true,
        updatedAt: Date.now(),
      };
      setLocalEntries(saveLocalFeedbackEntry(updatedEntry));
      window.dispatchEvent(new Event('paperlink-feedback-updated'));
      setEditingReviewId(null);
      onTaskComplete?.({
        headline: 'Solution Published',
        subtext: `Team solution for ${item.feedbackId} is now live for all reviewers.`,
        statusLabel: 'Review Updated',
      });
    } catch (err) {
      const detail =
        err instanceof Error && err.message
          ? err.message
          : 'Could not save solution to cloud. Ensure you are signed in as admin.';
      setSolutionErr(detail);
    } finally {
      setSavingSolutionId(null);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!pendingEntry) return;
    setIsSubmitting(true);

    try {
      let syncedToSheet = false;
      let savedOnServer = false;
      let savedInFirestore = false;

      // 1. Write to global Cloud Firestore /publicReviews so every visitor sees it immediately
      savedInFirestore = await submitPublicReviewToFirestore(pendingEntry);

      // 2. Post to PaperLink server (/api/feedback) which persists + forwards to Google Sheet webhook
      try {
        const apiRes = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...pendingEntry,
            webhookUrl: hasValidWebhook ? webhookUrl.trim() : undefined,
          }),
        });
        if (apiRes.ok) {
          const data = await apiRes.json().catch(() => ({}));
          if (data?.synced) savedOnServer = true;
          if (data?.forwardedToSheet) syncedToSheet = true;
        }
      } catch {
        // Fallback below if /api/feedback is unreachable
      }

      // 3. Direct browser fallback if configured
      if (!syncedToSheet && hasValidWebhook) {
        try {
          await postFeedbackToWebhook(webhookUrl.trim(), pendingEntry);
          syncedToSheet = true;
        } catch {
          // ignore
        }
      } else if (!syncedToSheet && parsedSheetId && accessToken) {
        try {
          await appendFeedbackToGoogleSheet({
            spreadsheetId: parsedSheetId,
            accessToken,
            entry: pendingEntry,
          });
          syncedToSheet = true;
        } catch {
          // ignore
        }
      }

      const persistedOnline = syncedToSheet || savedOnServer || savedInFirestore;
      const savedList = saveLocalFeedbackEntry({
        ...pendingEntry,
        status: 'New',
        syncedToGoogleSheet: syncedToSheet,
        syncedToFirestore: savedInFirestore,
      });
      setLocalEntries(savedList);
      window.dispatchEvent(new Event('paperlink-feedback-updated'));

      setSubmitBanner(
        syncedToSheet
          ? `Thank you! Feedback ${pendingEntry.feedbackId} is live in Google Sheets & Reviews.`
          : persistedOnline
          ? `Thank you! Feedback ${pendingEntry.feedbackId} is now live in Reviews.`
          : `Thank you! Feedback ${pendingEntry.feedbackId} has been saved locally.`
      );
      onTaskComplete?.({
        headline: syncedToSheet ? 'Synced to Google Sheet' : 'Feedback Published',
        subtext: `Thank you! ${pendingEntry.feedbackId} (${pendingEntry.rating}/5★) is now visible in Reviews.`,
        statusLabel: syncedToSheet ? 'Google Sheet Synced' : 'Live Review Published',
      });

      setDetails('');
      setPendingEntry(null);
      void refreshLiveReviews();
    } catch {
      const savedList = saveLocalFeedbackEntry({
        ...pendingEntry,
        status: 'New',
        syncedToGoogleSheet: false,
        syncedToFirestore: false,
      });
      setLocalEntries(savedList);
      window.dispatchEvent(new Event('paperlink-feedback-updated'));
      setSubmitBanner(`Thank you! Feedback ${pendingEntry.feedbackId} has been recorded.`);
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
            className="w-full max-w-sm rounded-2xl border border-[var(--pl-accent)]/50 bg-white dark:bg-[var(--pl-surface)] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[var(--pl-surface-soft)] flex items-center justify-between">
              <h4 id="confirm-feedback-title" className="text-xs font-bold text-zinc-950 dark:text-white">
                Confirm Feedback Submission
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
                <span className="font-bold text-blue-700 dark:text-yellow-400">
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

            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[var(--pl-surface-soft)] flex items-center justify-end gap-2">
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
                className="px-3.5 py-1.5 rounded-lg bg-[var(--pl-cta-via)] hover:bg-[var(--pl-cta-from)] text-[var(--pl-cta-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Publish Feedback</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
        <div className="sm:col-span-7 px-3 py-2 rounded-xl bg-zinc-50/90 dark:bg-[var(--pl-surface-soft)] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
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
                        ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.45)]'
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
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-[var(--pl-accent)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={toolCategory}
          onChange={(e) => setToolCategory(e.target.value as ToolCategory)}
          aria-label="Suite Category"
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)] cursor-pointer"
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
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)] cursor-pointer"
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
          className="w-full px-2.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)] cursor-pointer"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Priority: {p}
            </option>
          ))}
        </select>
      </div>

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
                  ? 'border-[var(--pl-accent)] bg-blue-500/12 dark:bg-yellow-400/15 text-blue-700 dark:text-yellow-300 font-bold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{ft.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <textarea
          rows={isLanding ? 3 : 2}
          maxLength={600}
          value={details}
          onChange={(e) => {
            setDetails(e.target.value);
            if (formValidationErr) setFormValidationErr(null);
          }}
          placeholder="Share an idea, review, or issue — completely anonymous, no sign-in needed..."
          className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-[var(--pl-accent)] resize-none leading-relaxed"
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

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-yellow-400" />
          <span>100% Anonymous · Instant Live Sync</span>
        </span>

        <motion.button
          type="submit"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2 rounded-xl bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] hover:opacity-95 text-[var(--pl-cta-text)] font-bold text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
        >
          <Send className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Send Feedback</span>
        </motion.button>
      </div>
    </form>
  );

  const compactStatsBar = (
    <div className="grid grid-cols-4 gap-2">
      {[
        { label: 'Reviews', value: String(stats.totalSubmissions), tone: 'text-zinc-950 dark:text-white' },
        {
          label: 'Rating',
          value: stats.averageRating > 0 ? `${stats.averageRating}★` : '—',
          tone: 'text-blue-700 dark:text-yellow-400',
        },
        { label: 'Open', value: String(stats.openIssues), tone: 'text-cyan-600 dark:text-cyan-400' },
        { label: 'Resolved', value: `${stats.resolutionRate}%`, tone: 'text-emerald-600 dark:text-emerald-400' },
      ].map((kpi) => (
        <div
          key={kpi.label}
          className="px-2.5 py-2 rounded-xl bg-zinc-50 dark:bg-[var(--pl-surface-soft)] border border-zinc-200 dark:border-zinc-800 text-center"
        >
          <p className={`text-sm font-extrabold font-mono tabular-nums ${kpi.tone}`}>{kpi.value}</p>
          <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{kpi.label}</p>
        </div>
      ))}
    </div>
  );

  const reviewsFeedList = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {([
            { id: 'all', label: `All (${entries.length})` },
            { id: 'solutions', label: `Solutions (${solutionsCount})` },
            { id: 'open', label: `Open (${stats.openIssues})` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setReviewFilter(tab.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                reviewFilter === tab.id
                  ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)]'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void refreshLiveReviews()}
          disabled={isRefreshingFeed}
          title="Refresh live reviews and team solutions"
          className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-blue-700 dark:text-yellow-400 hover:underline cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshingFeed ? 'animate-spin' : ''}`} />
          <span>
            {feedSource === 'google-sheet'
              ? 'Sheet Sync'
              : feedSource === 'firestore'
              ? 'Live Sync'
              : 'Refresh'}
          </span>
        </button>
      </div>

      {filteredReviews.length === 0 ? (
        <div className="p-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          {reviewFilter === 'solutions'
            ? 'No posted solutions yet — team replies appear here live.'
            : 'No entries yet — be the first to share feedback!'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
          {filteredReviews.map((item) => {
            const solutionText = (item.resolutionNotes || '').trim();
            const badge = getStatusBadgeStyle(item.status, Boolean(solutionText));
            const isEditingThis = editingReviewId === item.feedbackId;
            return (
              <div
                key={item.feedbackId}
                className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/75 dark:bg-zinc-950/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-zinc-900 dark:text-white truncate">
                    {item.specificTool || item.toolCategory}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-amber-500 font-bold">
                      {'★'.repeat(Math.max(1, Math.min(5, item.rating)))}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug break-words">
                  {item.details}
                </p>

                {solutionText && !isEditingThis && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-950/50 border border-emerald-500/30 flex items-start gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 text-[10px] leading-snug">
                      <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mr-1">
                        Team Solution:
                      </span>
                      <span className="text-zinc-800 dark:text-zinc-200">{solutionText}</span>
                    </div>
                  </div>
                )}

                {isAdmin && isEditingThis && (
                  <div className="p-2 rounded-lg border border-[var(--pl-accent)]/40 bg-white dark:bg-zinc-900 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
                        Post Team Solution
                      </span>
                      <div className="flex items-center gap-1">
                        {(['In Review', 'Resolved'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setDraftStatus(st)}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                              draftStatus === st
                                ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)]'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={800}
                      value={draftSolution}
                      onChange={(e) => setDraftSolution(e.target.value)}
                      placeholder="Write a public Team Solution or status update..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-[11px] text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)] resize-none"
                    />
                    {solutionErr && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400">{solutionErr}</p>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={savingSolutionId === item.feedbackId}
                        onClick={() => {
                          setEditingReviewId(null);
                          setSolutionErr(null);
                        }}
                        className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSolutionId === item.feedbackId}
                        onClick={() => void handleSaveSolution(item)}
                        className="px-2.5 py-1 rounded-md bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {savingSolutionId === item.feedbackId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Save Live</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <span>
                    {item.userName} · <span className="font-mono">{item.feedbackId}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && !isEditingThis && (
                      <button
                        type="button"
                        onClick={() => handleStartSolutionEdit(item)}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-yellow-400 hover:underline cursor-pointer"
                      >
                        <Reply className="w-2.5 h-2.5" />
                        <span>{solutionText ? 'Edit Solution' : 'Reply / Solution'}</span>
                      </button>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {item.date}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!isLanding) {
    return (
      <div className="space-y-3">
        {confirmationModal}
        {compactStatsBar}
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface-soft)]">
          {formBody}
        </div>
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface-soft)]">
          {reviewsFeedList}
        </div>
      </div>
    );
  }

  return (
    <section
      id="user-feedback"
      className="border-t border-zinc-200 dark:border-zinc-900 bg-zinc-100/75 dark:bg-[var(--pl-surface-soft)] py-10 lg:py-12 transition-colors"
    >
      {confirmationModal}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative">
          {neonGlowMode === 'full' && (
            <div
              aria-hidden="true"
              className="pointer-events-none -inset-2.5 absolute rounded-3xl bg-gradient-to-tr from-blue-500/12 via-sky-400/8 to-transparent dark:from-yellow-400/8 dark:via-amber-500/5 dark:to-transparent blur-2xl"
            />
          )}

          <div
            className={`relative rounded-2xl border border-zinc-200/95 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface)] overflow-hidden ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.04] transition-shadow duration-300 ${
              neonGlowMode === 'full'
                ? 'shadow-[0_12px_36px_-12px_rgba(15,23,42,0.12),0_0_24px_-8px_rgba(var(--pl-accent-rgb),0.15)] dark:shadow-[0_18px_46px_-14px_rgba(0,0,0,0.6),0_0_26px_-10px_rgba(var(--pl-accent-rgb),0.12)]'
                : 'shadow-md'
            }`}
          >
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[var(--pl-accent)] to-transparent" />
            <div className="relative p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
              {/* Left Column: Header + KPI Stats + Live Reviews & Google Sheet Solutions */}
              <div className="lg:col-span-5 space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquarePlus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-blue-700 dark:text-yellow-400 uppercase tracking-wider font-bold">
                      Live Reviews &amp; Solutions
                    </p>
                    <h2 className="text-lg font-extrabold text-zinc-950 dark:text-white tracking-tight leading-snug">
                      Help improve PaperLink
                    </h2>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Submit anonymous feedback and track live team solutions synced with Google Sheets.
                    </p>
                  </div>
                </div>

                {compactStatsBar}
                {reviewsFeedList}
              </div>

              {/* Right Column: Compact Submission Form */}
              <div className="lg:col-span-7 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-[var(--pl-surface-soft)]">
                {formBody}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
