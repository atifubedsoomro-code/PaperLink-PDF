import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ClipingPapersLogo } from './ClipingPapersLogo';
import { RobotProgressBar } from './RobotProgressBar';
import {
  CoverData,
  CoverPictureSuggestion,
  CoverSuggestionEngine,
  UploadedDocInfo,
} from '../types';

interface CoverSuggestionsCardProps {
  currentDoc: UploadedDocInfo | null;
  coverData: CoverData;
  suggestions: CoverPictureSuggestion[];
  setSuggestions: React.Dispatch<React.SetStateAction<CoverPictureSuggestion[]>>;
  suggestionCount: 1 | 2 | 3;
  setSuggestionCount: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  engine: CoverSuggestionEngine;
  setEngine: React.Dispatch<React.SetStateAction<CoverSuggestionEngine>>;
  isLoading: boolean;
  errorMsg: string | null;
  detectedTopic?: string | null;
  onGenerate: (opts?: {
    count?: 1 | 2 | 3;
    engine?: CoverSuggestionEngine;
    customPrompt?: string;
  }) => void;
  onApplySuggestion: (suggestion: CoverPictureSuggestion) => void;
  onClearBackground: () => void;
  onChangeOpacity: (opacity: number) => void;
}

const ENGINE_OPTIONS: Array<{ id: CoverSuggestionEngine; label: string; hint: string }> = [
  { id: 'ai', label: 'Free AI Generator', hint: 'Bespoke AI artwork painted from your file (SD 3.5 · FLUX · AI Horde)' },
  { id: 'ai-sites', label: 'AI Art Sites', hint: 'Instant AI-generated art from Civitai & Wikimedia AI galleries (~1s)' },
];

export const CoverSuggestionsCard: React.FC<CoverSuggestionsCardProps> = ({
  currentDoc,
  coverData,
  suggestions,
  setSuggestions,
  suggestionCount,
  setSuggestionCount,
  engine,
  setEngine,
  isLoading,
  errorMsg,
  detectedTopic,
  onGenerate,
  onApplySuggestion,
  onClearBackground,
  onChangeOpacity,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const pollStartedAtRef = useRef<number>(Date.now());
  const pollActiveRef = useRef<boolean>(false);

  const hasQueuedItems = suggestions.some((item) => item.status === 'queued');

  useEffect(() => {
    if (!hasQueuedItems) {
      pollActiveRef.current = false;
      return;
    }
    if (!pollActiveRef.current) {
      pollStartedAtRef.current = Date.now();
      pollActiveRef.current = true;
    }

    const interval = setInterval(async () => {
      const queued = suggestions.filter((item) => item.status === 'queued');
      if (queued.length === 0) return;

      const elapsedMs = Date.now() - pollStartedAtRef.current;
      const forceFallback = elapsedMs > 24_000;

      try {
        const res = await fetch('/api/cover-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll',
            jobs: queued.map((item) => ({
              id: item.id,
              jobId: item.jobId,
              label: item.label,
              visualStyle: item.visualStyle,
              prompt: item.prompt,
              searchQuery: item.searchQuery,
              palette: item.palette,
              forceFallback,
            })),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: CoverPictureSuggestion[] };
        if (!Array.isArray(data?.suggestions) || data.suggestions.length === 0) return;

        setSuggestions((prev) =>
          prev.map((existing) => {
            const updated = data.suggestions?.find((u) => u.id === existing.id);
            return updated || existing;
          })
        );
      } catch {
        // retry cleanly on next interval
      }
    }, 2600);

    return () => clearInterval(interval);
  }, [hasQueuedItems, suggestions, setSuggestions]);

  const handleInstantFallbackSlot = async (item: CoverPictureSuggestion) => {
    try {
      const res = await fetch('/api/cover-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'poll',
          jobs: [
            {
              id: item.id,
              jobId: item.jobId,
              label: item.label,
              visualStyle: item.visualStyle,
              prompt: item.prompt,
              searchQuery: item.searchQuery,
              palette: item.palette,
              forceFallback: true,
            },
          ],
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { suggestions?: CoverPictureSuggestion[] };
      const updated = data?.suggestions?.[0];
      if (!updated) return;
      setSuggestions((prev) => prev.map((s) => (s.id === item.id ? updated : s)));
    } catch {
      // ignore transient error
    }
  };

  const activeBgOpacity = coverData.backgroundImageOpacity ?? 0.42;
  const hasAppliedBackground = Boolean(coverData.backgroundImageUrl);

  return (
    <div className="bg-white dark:bg-[var(--pl-surface)] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30">
              Suggestions
            </span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500 dark:text-yellow-400 shrink-0" />
              <span>AI Cover Artwork Suggestions</span>
            </h3>
            {detectedTopic && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {detectedTopic}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            {currentDoc
              ? `1–3 text-free AI artworks tailored to "${currentDoc.extractedTitle || currentDoc.name}".`
              : '1–3 text-free AI artworks from free AI generators & AI art galleries.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div
            className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-0.5"
            aria-label="Number of cover suggestions"
          >
            {([1, 2, 3] as const).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  setSuggestionCount(num);
                  onGenerate({ count: num });
                }}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer tabular-nums ${
                  suggestionCount === num
                    ? 'bg-yellow-400 text-black'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowPromptInput((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              showPromptInput
                ? 'border-yellow-400 bg-yellow-400/10 text-amber-700 dark:text-yellow-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 shrink-0" />
            <span>Prompt</span>
          </button>

          <button
            type="button"
            onClick={() => onGenerate({ customPrompt })}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-black transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{suggestions.length > 0 ? 'Regenerate' : 'Generate'}</span>
          </button>
        </div>
      </div>

      {/* Free Image Source Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {ENGINE_OPTIONS.map((opt) => {
            const active = engine === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.hint}
                onClick={() => {
                  setEngine(opt.id);
                  onGenerate({ engine: opt.id, customPrompt });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                    : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          AI artwork only · Text-free cover backgrounds
        </span>
      </div>

      {showPromptInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGenerate({ customPrompt });
          }}
          className="flex items-center gap-2 pt-1"
        >
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Describe mood or scene (e.g. warm sandstone light, misty mountains)..."
            className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-black transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            Create
          </button>
        </form>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {isLoading && suggestions.length === 0 && (
        <div className="space-y-3">
          <RobotProgressBar
            compact
            percent={64}
            status="Fetching AI cover art results…"
            subText="Reading document context & generating custom backgrounds"
          />
          <div className={`grid gap-3 ${suggestionCount === 1 ? 'grid-cols-1 max-w-[220px]' : suggestionCount === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {Array.from({ length: suggestionCount }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3 flex flex-col justify-between gap-3"
              >
                <div className="w-full aspect-[3/4] rounded-lg bg-zinc-200/70 dark:bg-zinc-900 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <ClipingPapersLogo size="xs" showWordmark={false} />
                  <span className="text-[11px] font-medium">Fetching preview…</span>
                </div>
                <div className="h-7 rounded-lg bg-zinc-200/70 dark:bg-zinc-900" />
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div
          className={`grid gap-3 ${
            suggestions.length === 1
              ? 'grid-cols-1 max-w-[240px]'
              : suggestions.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          {suggestions.map((item) => {
            const isApplied =
              Boolean(item.imageDataUrl) && coverData.backgroundImageUrl === item.imageDataUrl;
            const isQueued = item.status === 'queued';

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-2.5 flex flex-col justify-between transition-colors ${
                  isApplied
                    ? 'border-yellow-400 bg-yellow-400/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60'
                }`}
              >
                <div
                  className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-2.5 flex items-center justify-center"
                  style={{ backgroundColor: item.palette.background }}
                >
                  {item.imageDataUrl ? (
                    <img
                      src={item.imageDataUrl}
                      alt={item.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : isQueued ? (
                    <div className="p-3 text-center flex flex-col items-center justify-center gap-2">
                      <ClipingPapersLogo size="sm" layout="stacked" statusText="Painting background…" />
                      {typeof item.queuePosition === 'number' && (
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                          Queue #{item.queuePosition}
                          {typeof item.waitTimeSec === 'number' ? ` · ~${item.waitTimeSec}s` : ''}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleInstantFallbackSlot(item)}
                        className="mt-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-white/90 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:border-yellow-400 cursor-pointer whitespace-nowrap"
                      >
                        Pull from AI Art Sites
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 text-center flex flex-col items-center gap-1.5 text-zinc-500">
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-[11px]">{item.errorMessage || 'Unavailable'}</span>
                    </div>
                  )}

                  {item.sourceType && item.imageDataUrl && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold text-white uppercase tracking-wider">
                      {item.sourceType === 'sd35'
                        ? 'SD 3.5 AI'
                        : item.sourceType === 'flux'
                        ? 'FLUX.1 AI'
                        : item.sourceType === 'ai-horde'
                        ? 'AI Horde'
                        : item.sourceType === 'civitai-ai'
                        ? 'Civitai AI'
                        : 'Wikimedia AI'}
                    </span>
                  )}

                  {isApplied && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-yellow-400 text-black flex items-center justify-center shadow">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-1">
                      {item.label}
                    </h4>
                    <p className="text-[10px] text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                      {item.visualStyle}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!item.imageDataUrl}
                    onClick={() => {
                      if (isApplied) {
                        onClearBackground();
                      } else {
                        onApplySuggestion(item);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                      isApplied
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.75] shrink-0" />
                        <span>Applied</span>
                      </>
                    ) : (
                      <span>Apply</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasAppliedBackground && (
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              <Palette className="w-3.5 h-3.5 text-amber-500 dark:text-yellow-400 shrink-0" />
              <span>Background Strength</span>
            </span>
            <input
              type="range"
              min={15}
              max={85}
              step={5}
              value={Math.round(activeBgOpacity * 100)}
              onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
              aria-label="Cover background opacity"
              className="flex-1 accent-yellow-400 cursor-pointer"
            />
            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 w-9 text-right tabular-nums">
              {Math.round(activeBgOpacity * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={onClearBackground}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Remove Background</span>
          </button>
        </div>
      )}
    </div>
  );
};
