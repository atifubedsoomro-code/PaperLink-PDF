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
  Puzzle,
  ExternalLink,
  Volume2,
  VolumeX,
  PanelTop,
  Trash2,
  Check,
  HardDrive,
  RefreshCw,
  Palette,
  Copy,
} from 'lucide-react';
import { FeedbackSection } from './FeedbackSection';
import { MiniAiRobot } from './MiniAiRobot';
import { GOOGLE_APPS_SCRIPT_TEMPLATE } from '../services/feedbackSheets';

export type ThemeMode = 'studio' | 'green' | 'light' | 'dark';
export type TextSizePreset = 'small' | 'medium' | 'large';
export type NeonGlowMode = 'full' | 'subtle';
export type AnimationPace = 'smooth' | 'fast' | 'off';
export type DefaultPaperSize = 'a4' | 'letter';
export type DefaultQrCorner = 'bottom-right' | 'bottom-center' | 'bottom-left';
export type AiDefaultSpeed = 'balanced' | 'fast';
export type ChatbotStartMode = 'top-bar' | 'dock';

export type SettingsTab = 'preferences' | 'feedback';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTab;
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
  defaultIncludeQr?: boolean;
  onChangeDefaultIncludeQr?: (includeQr: boolean) => void;
  aiDefaultSpeed: AiDefaultSpeed;
  onChangeAiDefaultSpeed: (speed: AiDefaultSpeed) => void;
  chatbotStartMode?: ChatbotStartMode;
  onChangeChatbotStartMode?: (mode: ChatbotStartMode) => void;
  aiSoundEnabled?: boolean;
  onChangeAiSoundEnabled?: (enabled: boolean) => void;
  showMiniRobot?: boolean;
  onChangeShowMiniRobot?: (show: boolean) => void;
  onClearDrafts?: () => void;
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

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

function CompactSegmented<T extends string>({
  value,
  options,
  onChange,
  accent = 'yellow',
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (val: T) => void;
  accent?: 'yellow' | 'cyan';
}) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shrink-0">
      {options.map((opt) => {
        const active = value === opt.id;
        const activeClasses =
          accent === 'cyan'
            ? 'bg-cyan-400/20 text-cyan-700 dark:text-cyan-300 border border-cyan-400/40 shadow-xs'
            : 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] border border-[var(--pl-cta-border)] shadow-xs';
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
              active
                ? activeClasses
                : 'border border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({
  icon,
  label,
  control,
}: {
  icon: React.ReactNode;
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
          {label}
        </span>
      </div>
      {control}
    </div>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = 'preferences',
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
  defaultIncludeQr = true,
  onChangeDefaultIncludeQr,
  aiDefaultSpeed,
  onChangeAiDefaultSpeed,
  chatbotStartMode = 'top-bar',
  onChangeChatbotStartMode,
  aiSoundEnabled = true,
  onChangeAiSoundEnabled,
  showMiniRobot = true,
  onChangeShowMiniRobot,
  onClearDrafts,
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
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [draftsCleared, setDraftsCleared] = useState(false);
  const [showSheetConfig, setShowSheetConfig] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const normalizedTheme: 'studio' | 'light' | 'dark' =
    themeMode === 'light' ? 'light' : themeMode === 'dark' ? 'dark' : 'studio';

  const handleClearDraftsClick = () => {
    onClearDrafts?.();
    setDraftsCleared(true);
    window.setTimeout(() => setDraftsCleared(false), 1800);
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 dark:bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white dark:bg-[var(--pl-surface)] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-h-[88vh] shadow-2xl flex flex-col overflow-hidden transition-all ${
          activeTab === 'feedback' ? 'max-w-2xl' : 'max-w-[440px]'
        }`}
      >
        {/* Compact Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50/80 dark:bg-[var(--pl-surface-soft)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {showMiniRobot ? (
              <MiniAiRobot
                variant="topbar"
                expressionOverride={activeTab === 'feedback' ? 'thumbs-up' : 'curious'}
                popupPlacement="below-left"
                externalPopup={null}
                quickActions={[
                  {
                    label: activeTab === 'feedback' ? 'General' : 'Feedback',
                    onClick: () => setActiveTab(activeTab === 'feedback' ? 'preferences' : 'feedback'),
                  },
                ]}
                title="Click to say hi!"
                sizeClassName="w-8 h-8 overflow-visible drop-shadow-[0_3px_6px_rgba(0,0,0,0.2)]"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] text-[var(--pl-cta-text)] flex items-center justify-center shrink-0">
                {activeTab === 'feedback' ? (
                  <MessageSquarePlus className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : (
                  <SlidersHorizontal className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
              </div>
            )}
            <h3 id="settings-modal-title" className="font-bold text-zinc-900 dark:text-white text-sm truncate">
              {activeTab === 'feedback' ? 'Feedback & Google Sheet Sync' : 'Settings'}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="inline-flex p-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'preferences'
                    ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('feedback')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'feedback'
                    ? 'bg-[var(--pl-cta-via)] text-[var(--pl-cta-text)] shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Feedback
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 overflow-y-auto flex-1">
          {activeTab === 'feedback' ? (
            <div className="space-y-3">
              {/* Compact 2-Way Google Sheets Sync Connection Bar */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">
                      Google Sheet Two-Way Sync
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Connect your Google Sheet or Apps Script Web App to sync new reviews and display Resolution Notes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSheetConfig((s) => !s)}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 hover:border-[var(--pl-accent)] cursor-pointer shrink-0"
                  >
                    {showSheetConfig ? 'Hide Setup' : 'Configure Sheet'}
                  </button>
                </div>

                {showSheetConfig && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div>
                      <label className="block text-[10px] font-mono font-bold uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                        Google Sheet URL or Spreadsheet ID (Reads Reviews &amp; Solutions)
                      </label>
                      <input
                        type="text"
                        value={feedbackSheetUrl}
                        onChange={(e) => onChangeFeedbackSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono font-bold uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                        Apps Script Web App URL (Optional Zero-Login Write/Read Webhook)
                      </label>
                      <input
                        type="url"
                        value={feedbackWebhookUrl}
                        onChange={(e) => onChangeFeedbackWebhookUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[var(--pl-accent)]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Deploy Apps Script with <code className="font-mono">doPost + doGet</code> &amp; Access: &ldquo;Anyone&rdquo;.
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyScript}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-[10px] font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 cursor-pointer shrink-0"
                      >
                        {scriptCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{scriptCopied ? 'Copied!' : 'Copy 2-Way Script'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <FeedbackSection
                variant="settings"
                accessToken={accessToken}
                sheetUrl={feedbackSheetUrl}
                webhookUrl={feedbackWebhookUrl}
                neonGlowMode={neonGlowMode}
                onTaskComplete={onTaskComplete}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Group 1: Display */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">
                  Display
                </p>
                <div className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
                  <SettingRow
                    icon={
                      normalizedTheme === 'studio' ? (
                        <Palette className="w-3.5 h-3.5 text-blue-600" />
                      ) : normalizedTheme === 'dark' ? (
                        <Moon className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      )
                    }
                    label="Theme"
                    control={
                      <CompactSegmented
                        value={normalizedTheme}
                        onChange={(val) => onChangeThemeMode(val)}
                        options={[
                          {
                            id: 'studio',
                            label: 'Studio',
                            icon: (
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full border border-blue-700 shrink-0"
                                style={{ background: 'linear-gradient(135deg, #f4f7fb 45%, #2563eb 45%)' }}
                              />
                            ),
                          },
                          {
                            id: 'light',
                            label: 'Light',
                            icon: (
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full border border-black/25 shrink-0"
                                style={{ background: 'linear-gradient(135deg, #ffffff 45%, #facc15 45%)' }}
                              />
                            ),
                          },
                          {
                            id: 'dark',
                            label: 'Dark',
                            icon: (
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                                style={{ background: 'linear-gradient(135deg, #09090b 45%, #facc15 45%)' }}
                              />
                            ),
                          },
                        ]}
                      />
                    }
                  />

                  <SettingRow
                    icon={<Sparkles className="w-3.5 h-3.5 text-cyan-500" />}
                    label="Glow"
                    control={
                      <CompactSegmented
                        value={neonGlowMode}
                        onChange={onChangeNeonGlowMode}
                        accent="cyan"
                        options={[
                          { id: 'full', label: 'Neon' },
                          { id: 'subtle', label: 'Crisp' },
                        ]}
                      />
                    }
                  />

                  <SettingRow
                    icon={<Type className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                    label="Text"
                    control={
                      <CompactSegmented
                        value={textSize}
                        onChange={onChangeTextSize}
                        options={[
                          { id: 'small', label: 'S' },
                          { id: 'medium', label: 'M' },
                          { id: 'large', label: 'L' },
                        ]}
                      />
                    }
                  />

                  <SettingRow
                    icon={<Zap className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                    label="Motion"
                    control={
                      <CompactSegmented
                        value={animationPace}
                        onChange={onChangeAnimationPace}
                        options={[
                          { id: 'smooth', label: 'Smooth' },
                          { id: 'fast', label: 'Fast' },
                          { id: 'off', label: 'Off' },
                        ]}
                      />
                    }
                  />
                </div>
              </div>

              {/* Group 2: Studio */}
              <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">
                  Studio
                </p>
                <div className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
                  <SettingRow
                    icon={<FileText className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                    label="Paper"
                    control={
                      <CompactSegmented
                        value={defaultPaperSize}
                        onChange={onChangeDefaultPaperSize}
                        options={[
                          { id: 'a4', label: 'A4' },
                          { id: 'letter', label: 'Letter' },
                        ]}
                      />
                    }
                  />

                  <SettingRow
                    icon={<QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                    label="QR Corner"
                    control={
                      <CompactSegmented
                        value={defaultQrPosition}
                        onChange={onChangeDefaultQrPosition}
                        options={[
                          { id: 'bottom-left', label: 'Left' },
                          { id: 'bottom-center', label: 'Center' },
                          { id: 'bottom-right', label: 'Right' },
                        ]}
                      />
                    }
                  />

                  {onChangeDefaultIncludeQr && (
                    <SettingRow
                      icon={<QrCode className="w-3.5 h-3.5 text-cyan-500" />}
                      label="Default QR"
                      control={
                        <CompactSegmented
                          value={defaultIncludeQr ? 'on' : 'off'}
                          onChange={(v) => onChangeDefaultIncludeQr(v === 'on')}
                          accent="cyan"
                          options={[
                            { id: 'on', label: 'With QR' },
                            { id: 'off', label: 'Clean' },
                          ]}
                        />
                      }
                    />
                  )}
                </div>
              </div>

              {/* Group 3: PaperLink AI */}
              <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">
                  PaperLink AI
                </p>
                <div className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
                  <SettingRow
                    icon={<Bot className="w-3.5 h-3.5 text-cyan-500" />}
                    label="Engine"
                    control={
                      <CompactSegmented
                        value={aiDefaultSpeed}
                        onChange={onChangeAiDefaultSpeed}
                        accent="cyan"
                        options={[
                          { id: 'balanced', label: 'Smart' },
                          { id: 'fast', label: 'Fast' },
                        ]}
                      />
                    }
                  />

                  {onChangeChatbotStartMode && (
                    <SettingRow
                      icon={<PanelTop className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                      label="Default Position"
                      control={
                        <CompactSegmented
                          value={chatbotStartMode}
                          onChange={onChangeChatbotStartMode}
                          options={[
                            { id: 'top-bar', label: 'Top Bar' },
                            { id: 'dock', label: 'Bottom' },
                          ]}
                        />
                      }
                    />
                  )}

                  {onChangeAiSoundEnabled && (
                    <SettingRow
                      icon={
                        aiSoundEnabled ? (
                          <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                        )
                      }
                      label="Sound"
                      control={
                        <CompactSegmented
                          value={aiSoundEnabled ? 'on' : 'muted'}
                          onChange={(v) => onChangeAiSoundEnabled(v === 'on')}
                          options={[
                            { id: 'on', label: 'On' },
                            { id: 'muted', label: 'Mute' },
                          ]}
                        />
                      }
                    />
                  )}

                  {onChangeShowMiniRobot && (
                    <SettingRow
                      icon={<Bot className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />}
                      label="Top-Bar Bot"
                      control={
                        <CompactSegmented
                          value={showMiniRobot ? 'show' : 'hide'}
                          onChange={(v) => onChangeShowMiniRobot(v === 'show')}
                          options={[
                            { id: 'show', label: 'Show' },
                            { id: 'hide', label: 'Hide' },
                          ]}
                        />
                      }
                    />
                  )}
                </div>
              </div>

              {/* Group 4: Drive Account */}
              <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-center shrink-0">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                    </span>
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {user ? user.email || 'Google Drive' : 'Google Drive'}
                    </span>
                  </div>

                  {user ? (
                    <button
                      type="button"
                      onClick={onReconnectWithConsent}
                      disabled={isLoggingIn}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:border-yellow-400 border border-zinc-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoggingIn ? 'animate-spin' : ''}`} />
                      <span>{accessToken ? 'Reconnect' : 'Authorize'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onLogin}
                      disabled={isLoggingIn}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <span>{isLoggingIn ? 'Signing in...' : 'Sign in'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Quick Actions */}
              <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTutorial();
                  }}
                  className="py-1.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                  <span>Guide</span>
                </button>

                {onClearDrafts && (
                  <button
                    type="button"
                    onClick={handleClearDraftsClick}
                    className="py-1.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 hover:border-amber-400 text-zinc-800 dark:text-zinc-200 text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {draftsCleared ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-emerald-600 dark:text-emerald-400">Cleared</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span>Clear Draft</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onResetPreferences}
                  className="py-1.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>Reset</span>
                </button>

                <a
                  href="https://chromewebstore.google.com/detail/paperlink-mini-pdf-image/hihihdajfamblhemnmboanfdfegfhocj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-1.5 px-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Puzzle className="w-3 h-3 shrink-0" />
                  <span>Extension</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
