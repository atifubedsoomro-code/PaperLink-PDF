import React from 'react';
import { X, Sun, Moon, Type, GraduationCap, SlidersHorizontal } from 'lucide-react';

export type ThemeMode = 'dark' | 'light';
export type TextSizePreset = 'small' | 'medium' | 'large';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  textSize: TextSizePreset;
  onChangeTextSize: (size: TextSizePreset) => void;
  onStartTutorial: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  onChangeThemeMode,
  textSize,
  onChangeTextSize,
  onStartTutorial,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-6">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 id="settings-modal-title" className="font-bold text-zinc-900 dark:text-white text-sm">
                Workspace Preferences
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Customize display theme, reading scale, and guided help
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

        <div className="p-5 space-y-5">
          {/* Dark / Light Mode */}
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

          {/* Interface Text Size */}
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
                    className={`py-2.5 px-3 rounded-xl border flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
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
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Scales menus, controls, and panels across the workspace while keeping printed PDF page dimensions fixed.
            </p>
          </div>

          {/* Walkthrough Launch */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTutorial();
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 hover:border-yellow-400 text-zinc-900 dark:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <GraduationCap className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Replay Cover Studio Spotlight Guide</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
