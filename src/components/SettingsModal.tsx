import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  X,
  Sun,
  Moon,
  Type,
  GraduationCap,
  SlidersHorizontal,
  Sparkles,
  Zap,
  FileText,
  QrCode,
  Bot,
  RotateCcw,
  MessageSquarePlus,
} from 'lucide-react';
import { FeedbackSection } from './FeedbackSection';

export type ThemeMode = 'dark' | 'light';
export type TextSizePreset = 'small' | 'medium' | 'large';
export type NeonGlowMode = 'full' | 'subtle';
export type AnimationPace = 'smooth' | 'fast' | 'off';
export type DefaultPaperSize = 'a4' | 'letter';
export type DefaultQrCorner = 'bottom-right' | 'bottom-center' | 'bottom-left';
export type AiDefaultSpeed = 'balanced' | 'fast';

export type SettingsTab = 'preferences' | 'feedback';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  textSize: TextSizePreset;
  onChangeTextSize: (size: TextSizePreset) => void;
  neonGlowMode: NeonGlowMode;
  onChangeNeonGlowMode: (mode: NeonGlowMode) => void;
  animationPace: AnimationPace;
  onChangeAnimationPace: (pace: AnimationPace) => void;
  defaultPaperSize: DefaultPaperSize;
  onChangeDefaultPaperSize: (size: DefaultPaperSize) => void;
  defaultQrPosition: DefaultQrCorner;
  onChangeDefaultQrPosition: (pos: DefaultQrCorner) => void;
  aiDefaultSpeed: AiDefaultSpeed;
  onChangeAiDefaultSpeed: (speed: AiDefaultSpeed) => void;
  onResetPreferences: () => void;
  onStartTutorial: () => void;
  user: User | null;
  accessToken: string | null;
  onLogin: () => void;
  onReconnectWithConsent: () => void;
  isLoggingIn?: boolean;
  feedbackSheetUrl: string;
  onChangeFeedbackSheetUrl: (url: string) => void;
  feedbackWebhookUrl: string;
  onChangeFeedbackWebhookUrl: (url: string) => void;
  onTaskComplete?: (info: { headline: string; subtext: string; statusLabel?: string }) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  onChangeThemeMode,
  textSize,
  onChangeTextSize,
  neonGlowMode,
  onChangeNeonGlowMode,
  animationPace,
  onChangeAnimationPace,
  defaultPaperSize,
  onChangeDefaultPaperSize,
  defaultQrPosition,
  onChangeDefaultQrPosition,
  aiDefaultSpeed,
  onChangeAiDefaultSpeed,
  onResetPreferences,
  onStartTutorial,
  user,
  accessToken,
  onLogin,
  onReconnectWithConsent,
  isLoggingIn = false,
  feedbackSheetUrl,
  onChangeFeedbackSheetUrl,
  feedbackWebhookUrl,
  onChangeFeedbackWebhookUrl,
  onTaskComplete,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('preferences');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 dark:bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-h-[88vh] shadow-2xl flex flex-col overflow-hidden transition-all ${
          activeTab === 'feedback' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50/70 dark:bg-[#0c0c10] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center shrink-0">
                {activeTab === 'feedback' ? (
                  <MessageSquarePlus className="w-4 h-4 stroke-[2.5]" />
                ) : (
                  <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
                )}
              </div>
              <div>
                <h3 id="settings-modal-title" className="font-bold text-zinc-900 dark:text-white text-sm">
                  {activeTab === 'feedback' ? 'Send Feedback' : 'Workspace Preferences'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {activeTab === 'feedback'
                    ? 'Share ratings, feature requests, or bug reports with Team Terminators'
                    : 'Customize visuals, Studio defaults, AI speed, and motion'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Segmented Tab Bar */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'preferences'
                  ? 'bg-yellow-400 text-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Workspace Preferences</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('feedback')}
              className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'feedback'
                  ? 'bg-yellow-400 text-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Feedback</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          {activeTab === 'feedback' ? (
            <FeedbackSection
              variant="settings"
              accessToken={accessToken}
              sheetUrl={feedbackSheetUrl}
              webhookUrl={feedbackWebhookUrl}
              neonGlowMode={neonGlowMode}
              onTaskComplete={onTaskComplete}
            />
          ) : (
            <>
          {/* 1. Color Appearance */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              {themeMode === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              )}
              <span>Color Appearance</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onChangeThemeMode('light')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  themeMode === 'light'
                    ? 'bg-yellow-400 text-black border-yellow-400 font-bold shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light Mode</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeThemeMode('dark')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  themeMode === 'dark'
                    ? 'bg-yellow-400 text-black border-yellow-400 font-bold shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </button>
            </div>
          </div>

          {/* 2. Neon Lighting Intensity */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
              <span>Neon Lighting Intensity</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'full' as const, label: 'Full Neon Halo', desc: 'Vibrant aura on AI & Docs' },
                { id: 'subtle' as const, label: 'Subtle Crisp', desc: 'Clean sharp hairline glow' },
              ].map((opt) => {
                const active = neonGlowMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeNeonGlowMode(opt.id)}
                    className={`py-2.5 px-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      active
                        ? 'border-cyan-400 bg-cyan-400/15 text-zinc-950 dark:text-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="text-[11px] opacity-80">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Interface Text Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Interface Text Size</span>
              </label>
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                {textSize === 'small' ? '14px · Compact' : textSize === 'large' ? '18px · Large' : '16px · Standard'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'small' as const, label: 'Small', sample: 'text-xs' },
                { id: 'medium' as const, label: 'Medium', sample: 'text-sm' },
                { id: 'large' as const, label: 'Large', sample: 'text-base' },
              ].map((opt) => {
                const active = textSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeTextSize(opt.id)}
                    className={`py-2 px-3 rounded-xl border flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
                      active
                        ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <span className={`${opt.sample} font-bold leading-none`}>Aa</span>
                    <span className="text-[11px]">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Task Animations Pace */}
          <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              <span>Completion Typewriter &amp; Motion Pace</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'smooth' as const, label: 'Smooth', hint: '7s banner' },
                { id: 'fast' as const, label: 'Fast', hint: '3.5s banner' },
                { id: 'off' as const, label: 'Reduced', hint: 'Skip popups' },
              ].map((opt) => {
                const active = animationPace === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAnimationPace(opt.id)}
                    className={`py-2 px-2.5 rounded-xl border text-center cursor-pointer transition-colors ${
                      active
                        ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="text-[10px] opacity-80">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Cover Studio Defaults (Paper Size & QR Corner) */}
          <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Default Cover Paper Size</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'a4' as const, label: 'A4 (210 × 297 mm)' },
                  { id: 'letter' as const, label: 'US Letter (8.5 × 11 in)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeDefaultPaperSize(opt.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      defaultPaperSize === opt.id
                        ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Default QR Placement Corner</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bottom-right' as const, label: 'Bottom Right' },
                  { id: 'bottom-center' as const, label: 'Bottom Center' },
                  { id: 'bottom-left' as const, label: 'Bottom Left' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeDefaultQrPosition(opt.id)}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-colors ${
                      defaultQrPosition === opt.id
                        ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. PaperLink AI Default Engine */}
          <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-cyan-500" />
              <span>PaperLink AI Default Speed</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'balanced' as const, label: 'Smart Tool Agent', desc: 'Best for tool automation' },
                { id: 'fast' as const, label: 'Fast Response', desc: 'Quicker Q&A replies' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeAiDefaultSpeed(opt.id)}
                  className={`py-2.5 px-3 rounded-xl border text-left cursor-pointer transition-colors ${
                    aiDefaultSpeed === opt.id
                      ? 'border-cyan-400 bg-cyan-400/15 text-zinc-950 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[11px] opacity-80">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 7. Actions: Replay Guide & Reset Preferences */}
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTutorial();
              }}
              className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 hover:border-yellow-400 text-zinc-900 dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <GraduationCap className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
              <span>Spotlight Guide</span>
            </button>

            <button
              type="button"
              onClick={onResetPreferences}
              className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Reset Defaults</span>
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
