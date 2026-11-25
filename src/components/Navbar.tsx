import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { LogOut, Menu, X, Settings, Bot } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PWAInstallButton } from './PWAInstallButton';
import { MiniAiRobot, RobotExpression, RobotPromptItem } from './MiniAiRobot';
import { PaperLinkLogo } from './PaperLinkLogo';

export type AppView = 'home' | 'studio' | 'tools' | 'image-tools' | 'privacy' | 'terms';

interface NavbarProps {
  user: User | null;
  hasDriveAccess: boolean;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  isLoggingIn: boolean;
  isChatbotMinimized?: boolean;
  onRestoreChatbot?: () => void;
  showMiniRobot?: boolean;
  onOpenFeedback?: () => void;
}

const NAV_ITEMS: { id: AppView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'studio', label: 'Cover Studio' },
  { id: 'tools', label: 'PDF & Office' },
  { id: 'image-tools', label: 'Image Tools' },
];

interface RobotStage {
  anchor: 'ai' | 'logo' | 'home' | 'studio' | 'tools' | 'image-tools' | 'google' | 'nav-dock';
  offsetX: number;
  y: number;
  zIndex: number;
  duckBehind: boolean;
  expression: RobotExpression;
  ropeLength?: number;
  popupPlacement?: 'below-left' | 'below-right' | 'below-center';
  durationMs: number;
}

const ROAM_STAGES: RobotStage[] = [
  // 0: Wave warmly beside PaperLink AI / Brand
  {
    anchor: 'ai',
    offsetX: 40,
    y: 12,
    zIndex: 28,
    duckBehind: false,
    expression: 'wave',
    popupPlacement: 'below-left',
    durationMs: 2600,
  },
  // 1: Smooth walk gliding cleanly behind the bounded navigation rail
  {
    anchor: 'studio',
    offsetX: -18,
    y: 4,
    zIndex: 5,
    duckBehind: true,
    expression: 'funny-walk',
    durationMs: 2200,
  },
  // 2: Peek slyly over the bounded Cover Studio button edge
  {
    anchor: 'studio',
    offsetX: 16,
    y: -4,
    zIndex: 5,
    duckBehind: true,
    expression: 'peek-hide',
    durationMs: 1900,
  },
  // 3: Pop up beside PDF & Office / Image Tools with a friendly salute & context tip
  {
    anchor: 'image-tools',
    offsetX: -8,
    y: 54,
    zIndex: 30,
    duckBehind: false,
    expression: 'salute',
    popupPlacement: 'below-center',
    durationMs: 3600,
  },
  // 4: Glide behind the right side of the nav bar toward Google "G"
  {
    anchor: 'google',
    offsetX: -48,
    y: 12,
    zIndex: 5,
    duckBehind: true,
    expression: 'funny-walk',
    durationMs: 2200,
  },
  // 5: Point right at the circular Google "G" button!
  {
    anchor: 'google',
    offsetX: -54,
    y: 12,
    zIndex: 30,
    duckBehind: false,
    expression: 'point-right',
    popupPlacement: 'below-right',
    durationMs: 4400,
  },
  // 6: Walk smoothly behind the bounded nav dock back to PDF & Office
  {
    anchor: 'tools',
    offsetX: 0,
    y: 6,
    zIndex: 5,
    duckBehind: true,
    expression: 'funny-walk',
    durationMs: 2200,
  },
  // 7: Descend on Spider-Man web anchored directly to the bounded PDF & Office button edge
  {
    anchor: 'tools',
    offsetX: 0,
    y: 74,
    zIndex: 30,
    duckBehind: false,
    expression: 'spiderman-hang',
    ropeLength: 38,
    popupPlacement: 'below-center',
    durationMs: 5600,
  },
  // 8: Cheerful celebrate jump beside Home/Brand before returning
  {
    anchor: 'home',
    offsetX: -12,
    y: 10,
    zIndex: 28,
    duckBehind: false,
    expression: 'celebrate',
    popupPlacement: 'below-left',
    durationMs: 2400,
  },
];

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hasDriveAccess,
  activeView,
  onNavigate,
  onLogin,
  onLogout,
  onOpenSettings,
  isLoggingIn,
  isChatbotMinimized = false,
  onRestoreChatbot,
  showMiniRobot = true,
  onOpenFeedback,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [googleBtnHovered, setGoogleBtnHovered] = useState(false);
  const [aiPillHovered, setAiPillHovered] = useState(false);
  const [roamingHovered, setRoamingHovered] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [engageToggle, setEngageToggle] = useState(false);
  const [robotCoords, setRobotCoords] = useState<{ x: number; y: number } | null>(null);

  const barRef = useRef<HTMLDivElement | null>(null);
  const googleLingerTimerRef = useRef<number | null>(null);
  const googleTypeTimerRef = useRef<number | null>(null);
  const [googleTypedLabel, setGoogleTypedLabel] = useState('Sign in with Google');
  const isConnected = !!user && hasDriveAccess;

  const activateGoogleHover = useCallback(() => {
    if (googleLingerTimerRef.current) {
      window.clearTimeout(googleLingerTimerRef.current);
      googleLingerTimerRef.current = null;
    }
    setGoogleBtnHovered(true);
  }, []);

  const deactivateGoogleHover = useCallback(() => {
    if (googleLingerTimerRef.current) {
      window.clearTimeout(googleLingerTimerRef.current);
    }
    googleLingerTimerRef.current = window.setTimeout(() => {
      setGoogleBtnHovered(false);
    }, 6500);
  }, []);

  useEffect(() => {
    if (googleTypeTimerRef.current) window.clearInterval(googleTypeTimerRef.current);
    if (!googleBtnHovered || isLoggingIn || prefersReducedMotion) {
      setGoogleTypedLabel(isLoggingIn ? 'Connecting...' : 'Sign in with Google');
      return;
    }
    const target = 'Sign in with Google';
    let idx = 0;
    setGoogleTypedLabel('');
    googleTypeTimerRef.current = window.setInterval(() => {
      idx += 1;
      setGoogleTypedLabel(target.slice(0, idx));
      if (idx >= target.length && googleTypeTimerRef.current) {
        window.clearInterval(googleTypeTimerRef.current);
      }
    }, 24);
    return () => {
      if (googleTypeTimerRef.current) window.clearInterval(googleTypeTimerRef.current);
    };
  }, [googleBtnHovered, isLoggingIn, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (googleLingerTimerRef.current) window.clearTimeout(googleLingerTimerRef.current);
      if (googleTypeTimerRef.current) window.clearInterval(googleTypeTimerRef.current);
    };
  }, []);

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  // Measure target anchor inside top bar and position the roaming robot accurately
  const measureAnchorPosition = useCallback(
    (stage: RobotStage) => {
      const container = barRef.current;
      if (!container) return;
      const barRect = container.getBoundingClientRect();
      if (barRect.width < 740) {
        setRobotCoords(null);
        return;
      }

      const primaryEl = container.querySelector(
        `[data-robot-anchor="${stage.anchor}"]`
      ) as HTMLElement | null;
      const fallbackEl =
        stage.anchor === 'ai'
          ? (container.querySelector('[data-robot-anchor="logo"]') as HTMLElement | null)
          : null;
      const targetEl = primaryEl || fallbackEl;
      if (!targetEl) return;

      const r = targetEl.getBoundingClientRect();
      const centerX = r.left - barRect.left + r.width / 2;
      const computedX = Math.max(12, Math.min(barRect.width - 52, centerX + stage.offsetX - 18));
      setRobotCoords({ x: computedX, y: stage.y });
    },
    []
  );

  // Advance roaming choreography timeline (pauses on hover for easy clicking)
  useEffect(() => {
    if (!showMiniRobot || prefersReducedMotion || roamingHovered) return;
    const stage = ROAM_STAGES[stageIdx];
    const timer = window.setTimeout(() => {
      setStageIdx((prev) => {
        const next = (prev + 1) % ROAM_STAGES.length;
        if (next === 7) setEngageToggle((t) => !t);
        return next;
      });
    }, stage.durationMs);
    return () => window.clearTimeout(timer);
  }, [stageIdx, showMiniRobot, prefersReducedMotion, roamingHovered]);

  // Re-measure anchor coordinates whenever stage/layout/auth changes or viewport resizes
  useEffect(() => {
    if (!showMiniRobot || prefersReducedMotion) return;
    const stage = ROAM_STAGES[stageIdx];
    const raf = window.requestAnimationFrame(() => measureAnchorPosition(stage));
    const onResize = () => measureAnchorPosition(ROAM_STAGES[stageIdx]);
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [stageIdx, showMiniRobot, prefersReducedMotion, isChatbotMinimized, isConnected, activeView, measureAnchorPosition]);

  const currentStage = ROAM_STAGES[stageIdx];

  const contextTip =
    activeView === 'studio'
      ? { text: 'Try Crop/Scan or AI Art covers!', actionLabel: 'Ask AI' }
      : activeView === 'tools'
      ? { text: 'Need help with a PDF task?', actionLabel: 'Open AI' }
      : activeView === 'image-tools'
      ? { text: 'Remove backgrounds locally!', actionLabel: 'Open AI' }
      : { text: 'Create QR covers in seconds!', actionLabel: 'Cover Studio' };

  const roamingPopup: RobotPromptItem | null = (() => {
    if (stageIdx === 0) {
      return { text: 'Hi! Need help from PaperLink AI?', actionLabel: 'Chat' };
    }
    if (stageIdx === 3) {
      return contextTip;
    }
    if (stageIdx === 5) {
      return isConnected
        ? { text: 'Drive Ready! Explore Cover Studio!', actionLabel: 'Open Studio' }
        : { text: 'Sign in with Google to Explore Cover Studio!', actionLabel: 'Sign in' };
    }
    if (stageIdx === 7) {
      return engageToggle && onOpenFeedback
        ? { text: 'Are you loving PaperLink? Tell us!', isFeedback: true, actionLabel: 'Feedback' }
        : { text: 'Try 21+ PDF & Office Tools!', actionLabel: 'Explore' };
    }
    if (stageIdx === 8) {
      return { text: 'All tools run fast & private!', actionLabel: 'Studio' };
    }
    return null;
  })();

  const handleRoamingPopupClick = () => {
    if (stageIdx === 3) {
      if (activeView === 'home') onNavigate('studio');
      else onRestoreChatbot?.();
      return;
    }
    if (stageIdx === 5) {
      if (isConnected) onNavigate('studio');
      else onLogin();
      return;
    }
    if (stageIdx === 7) {
      if (engageToggle && onOpenFeedback) onOpenFeedback();
      else onNavigate('tools');
      return;
    }
    if (stageIdx === 8) {
      onNavigate('studio');
      return;
    }
    onRestoreChatbot?.();
  };

  const robotQuickActions = [
    ...(onRestoreChatbot ? [{ label: 'Ask AI', onClick: onRestoreChatbot }] : []),
    { label: 'Studio', onClick: () => onNavigate('studio') },
    { label: 'PDF Tools', onClick: () => onNavigate('tools') },
    ...(onOpenFeedback ? [{ label: 'Feedback', onClick: onOpenFeedback }] : []),
  ];

  return (
    <header className="no-print sticky top-0 z-40 bg-[var(--pl-header-bg)] backdrop-blur-xl backdrop-saturate-[165%] border-b border-zinc-200/90 dark:border-zinc-800/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors">
      <div
        ref={barRef}
        className="relative max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-1.5 sm:gap-5"
      >
        {/* Choreographed Desktop Roaming Mini Robot */}
        {showMiniRobot && !prefersReducedMotion && robotCoords && (
          <motion.div
            aria-hidden={currentStage.duckBehind}
            onMouseEnter={() => setRoamingHovered(true)}
            onMouseLeave={() => setRoamingHovered(false)}
            initial={false}
            animate={{
              x: robotCoords.x,
              y: robotCoords.y,
            }}
            transition={{
              x: { type: 'spring', stiffness: 105, damping: 18, mass: 0.85 },
              y: { type: 'spring', stiffness: 175, damping: 16 },
            }}
            style={{ zIndex: roamingHovered ? 35 : currentStage.zIndex }}
            className="hidden md:flex items-center absolute left-0 top-0 pointer-events-auto"
          >
            <MiniAiRobot
              variant="topbar"
              isHovered={roamingHovered}
              expressionOverride={currentStage.expression}
              duckBehind={currentStage.duckBehind}
              ropeLength={currentStage.ropeLength ?? 0}
              externalPopup={roamingPopup}
              quickActions={robotQuickActions}
              popupPlacement={currentStage.popupPlacement ?? 'below-center'}
              onPopupClick={handleRoamingPopupClick}
              onClick={
                stageIdx === 5 && !isConnected
                  ? () => {
                      if (!isLoggingIn) onLogin();
                    }
                  : stageIdx === 7
                  ? () => onNavigate('tools')
                  : onRestoreChatbot
              }
              onFeedbackClick={onOpenFeedback}
              title={
                stageIdx === 5 && !isConnected
                  ? 'Sign in with Google to Explore Cover Studio'
                  : stageIdx === 7
                  ? 'Explore PDF & Office Tools'
                  : 'PaperLink AI Companion'
              }
            />
          </motion.div>
        )}

        {/* Zone 1: Brand Wordmark + Minimized PaperLink AI Dock */}
        <div className="relative z-20 flex items-center gap-1 sm:gap-2.5 min-w-0">
          <button
            type="button"
            data-robot-anchor="logo"
            data-paperlink-brand-anchor="true"
            onClick={() => handleNavClick('home')}
            className="relative z-10 flex items-center whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] rounded-lg py-1"
          >
            <PaperLinkLogo size="md" showWordmark />
          </button>

          <AnimatePresence>
            {isChatbotMinimized && (
              <div
                key="navbar-minimized-ai-group"
                data-robot-anchor="ai"
                onMouseEnter={() => setAiPillHovered(true)}
                onMouseLeave={() => setAiPillHovered(false)}
                className="relative z-10 inline-flex items-center shrink-0"
              >
                <motion.button
                  type="button"
                  data-paperlink-minimized-btn="true"
                  onClick={onRestoreChatbot}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  title={
                    activeView === 'studio'
                      ? 'PaperLink AI is in the top bar — click to open assistant'
                      : 'Open PaperLink AI assistant'
                  }
                  aria-label="Open PaperLink AI assistant"
                  className={`relative z-10 inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur-xl backdrop-saturate-[180%] border text-[11px] sm:text-xs font-bold transition-colors cursor-pointer shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
                    activeView === 'studio'
                      ? 'bg-[var(--pl-cta-via)] dark:bg-yellow-400/20 hover:bg-[var(--pl-cta-from)] border-[var(--pl-cta-border)] dark:border-yellow-400/50 text-[var(--pl-cta-text)] dark:text-yellow-100 shadow-[0_4px_14px_rgba(var(--pl-accent-rgb),0.28)]'
                      : 'bg-[var(--pl-surface-soft)] dark:bg-yellow-400/[0.14] hover:bg-yellow-400/35 dark:hover:bg-yellow-400/[0.24] border-[var(--pl-cta-border)]/70 dark:border-yellow-400/35 text-zinc-950 dark:text-yellow-100 shadow-[0_4px_14px_rgba(var(--pl-accent-rgb),0.18)]'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">PaperLink AI</span>
                  <span className="sm:hidden">AI</span>
                </motion.button>

                {/* Mobile-only compact docked robot (desktop uses the roaming robot across the full top bar) */}
                {showMiniRobot && (
                  <div className="md:hidden relative z-0 flex items-center">
                    <MiniAiRobot
                      variant="topbar"
                      isHovered={aiPillHovered}
                      onClick={onRestoreChatbot}
                      onFeedbackClick={onOpenFeedback}
                      title="Open PaperLink AI"
                      sizeClassName="w-8 h-8 overflow-visible drop-shadow-[0_3px_6px_rgba(0,0,0,0.24)]"
                    />
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Zone 2: Bounded Navigation Button Rail (Provides clean solid boundary for robot peeks & hangs) */}
        <nav
          data-robot-anchor="nav-dock"
          aria-label="Main navigation"
          className="relative z-20 hidden md:flex items-center gap-1 p-1 rounded-2xl bg-slate-100/95 dark:bg-zinc-900/95 border border-slate-200/95 dark:border-zinc-700/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_14px_-4px_rgba(15,23,42,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(0,0,0,0.45)]"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-robot-anchor={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`relative z-10 px-3 lg:px-3.5 py-1.5 rounded-xl border text-xs lg:text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] ${
                  isActive
                    ? 'text-[var(--pl-cta-text)] border-[var(--pl-cta-border)] font-bold'
                    : 'text-slate-700 dark:text-zinc-300 border-transparent hover:text-slate-950 dark:hover:text-white hover:border-slate-300/85 dark:hover:border-zinc-700 hover:bg-white/85 dark:hover:bg-zinc-800/80'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="paperlinkNavPill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[11px] bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] shadow-xs"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Connection Status + Install + Settings + Logout + Mobile Toggle */}
        <div className="relative z-20 flex items-center gap-1 sm:gap-2 shrink-0">
          <PWAInstallButton />

          {isConnected ? (
            <div
              data-robot-anchor="google"
              title={`Connected to Google Drive (${user?.email || 'Account'})`}
              className="relative z-20 inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 bg-emerald-50/90 dark:bg-emerald-950/60 backdrop-blur-md text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40"
            >
              <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 dark:bg-emerald-400" />
              <span className="hidden sm:inline">Drive Connected</span>
              <span className="sm:hidden">Drive</span>
            </div>
          ) : (
            <button
              type="button"
              data-robot-anchor="google"
              onClick={onLogin}
              disabled={isLoggingIn}
              onMouseEnter={activateGoogleHover}
              onMouseLeave={deactivateGoogleHover}
              onFocus={activateGoogleHover}
              onBlur={deactivateGoogleHover}
              aria-label="Sign in with Google to upload documents on your Drive"
              title="Sign in with Google — To Upload Documents on your Drive"
              className={`group relative z-20 inline-flex items-center overflow-hidden border transition-all duration-200 cursor-pointer shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] ${
                googleBtnHovered || isLoggingIn
                  ? 'h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl gap-2 bg-[var(--pl-surface)] dark:bg-zinc-900 border-[var(--pl-accent)]/85 dark:border-yellow-400/75 shadow-[0_6px_18px_-4px_rgba(var(--pl-accent-rgb),0.4)]'
                  : `w-8 h-8 sm:w-9 sm:h-9 justify-center rounded-full bg-[var(--pl-surface)] dark:bg-zinc-900 shadow-xs ${
                      showMiniRobot && stageIdx === 5
                        ? 'border-[var(--pl-accent)] ring-2 ring-[var(--pl-accent)]/45 shadow-[0_0_16px_rgba(var(--pl-accent-rgb),0.55)]'
                        : 'border-slate-300/90 dark:border-zinc-700 hover:border-[var(--pl-accent)]'
                    }`
              }`}
            >
              {/* Google Multi-Color "G" Emblem */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
              >
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>

              {(googleBtnHovered || isLoggingIn) && (
                <span className="flex flex-col items-start text-left leading-tight whitespace-nowrap pr-0.5">
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-white font-mono">
                    {isLoggingIn ? 'Connecting...' : googleTypedLabel}
                  </span>
                  <span className="text-[9px] font-medium text-zinc-600 dark:text-zinc-400">
                    To Upload Documents on your Drive
                  </span>
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings (Studio / Light / Dark themes, text size & tutorial)"
            aria-label="Workspace settings"
            className="relative z-20 p-2 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
          >
            <Settings className="w-4 h-4" />
          </button>

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title={`Sign out (${user.email || 'Google account'})`}
              className="relative z-20 p-2 text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-100 dark:bg-zinc-900 cursor-pointer"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface-soft)] px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-to))] border-[var(--pl-cta-border)] text-[var(--pl-cta-text)] font-bold'
                    : 'border-transparent text-zinc-700 dark:text-zinc-300 hover:border-slate-200 dark:hover:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
