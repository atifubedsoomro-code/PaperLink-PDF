import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Menu, X, Settings, Bot, Search, User as UserIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PWAInstallButton } from './PWAInstallButton';
import { MiniAiRobot, RobotExpression, RobotPromptItem } from './MiniAiRobot';
import { PaperLinkLogo } from './PaperLinkLogo';
import { SearchableToolItem, TopToolSearch } from './TopToolSearch';
import type { PdfToolTab } from './PdfToolsPanel';
import type { ImageToolTab } from './ImageToolsPanel';

export type AppView = 'home' | 'studio' | 'tools' | 'image-tools' | 'privacy' | 'terms';

interface NavbarProps {
  user: User | null;
  hasDriveAccess: boolean;
  activeView: AppView;
  onNavigate: (view: AppView | 'batch' | 'library') => void;
  onSelectPdfTool?: (tool: PdfToolTab) => void;
  onSelectImageTool?: (tool: ImageToolTab) => void;
  onLogin: () => void;
  onLogout?: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  hasSavedProfileData?: boolean;
  profileAvatarUrl?: string;
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

type RobotPoseKind =
  | 'beside-ai'
  | 'walk-to-nav'
  | 'peek-nav-left'
  | 'gap-dance'
  | 'point-google'
  | 'peek-nav-right'
  | 'spiderman-tools'
  | 'walk-home'
  | 'hop-home';

interface RobotStage {
  kind: RobotPoseKind;
  anchor: 'ai' | 'logo' | 'home' | 'studio' | 'tools' | 'image-tools' | 'google' | 'nav-dock' | 'search';
  zIndex: number;
  duckBehind: boolean;
  expression: RobotExpression;
  facing?: 'right' | 'left';
  leanDeg?: number;
  ropeLength?: number;
  popupPlacement?: 'below-left' | 'below-right' | 'below-center';
  durationMs: number;
}

const ROAM_STAGES: RobotStage[] = [
  // 0: Wave warmly right beside PaperLink AI pill (or Brand logo)
  {
    kind: 'beside-ai',
    anchor: 'ai',
    zIndex: 34,
    duckBehind: false,
    expression: 'wave',
    facing: 'right',
    popupPlacement: 'below-left',
    durationMs: 4200,
  },
  // 1: Brisk stride toward the main navigation rail
  {
    kind: 'walk-to-nav',
    anchor: 'nav-dock',
    zIndex: 34,
    duckBehind: false,
    expression: 'funny-walk',
    facing: 'right',
    durationMs: 1850,
  },
  // 2: Curious side-peek tucked cleanly around the top-left corner of the nav pill
  {
    kind: 'peek-nav-left',
    anchor: 'nav-dock',
    zIndex: 15,
    duckBehind: true,
    expression: 'child-peek',
    facing: 'right',
    leanDeg: -14,
    popupPlacement: 'below-center',
    durationMs: 4000,
  },
  // 3: Cheerful groove dance in the open gap beside Image Tools (collision-free around search bar)
  {
    kind: 'gap-dance',
    anchor: 'image-tools',
    zIndex: 34,
    duckBehind: false,
    expression: 'dance',
    facing: 'right',
    popupPlacement: 'below-center',
    durationMs: 4300,
  },
  // 4: Aim directly at the Google "G" sign-in button with glowing pointer indicator
  {
    kind: 'point-google',
    anchor: 'google',
    zIndex: 34,
    duckBehind: false,
    expression: 'point-right',
    facing: 'right',
    popupPlacement: 'below-right',
    durationMs: 5200,
  },
  // 5: Playful side-peek tucked cleanly behind the right edge of the nav pill
  {
    kind: 'peek-nav-right',
    anchor: 'nav-dock',
    zIndex: 15,
    duckBehind: true,
    expression: 'child-peek',
    facing: 'left',
    leanDeg: -14,
    popupPlacement: 'below-center',
    durationMs: 3900,
  },
  // 6: Spider-Man web drop anchored directly onto the bottom rim of PDF & Office
  {
    kind: 'spiderman-tools',
    anchor: 'tools',
    zIndex: 34,
    duckBehind: false,
    expression: 'spiderman-hang',
    facing: 'right',
    ropeLength: 22,
    popupPlacement: 'below-center',
    durationMs: 5800,
  },
  // 7: Brisk leftward walk returning toward Home / AI pill
  {
    kind: 'walk-home',
    anchor: 'home',
    zIndex: 34,
    duckBehind: false,
    expression: 'funny-walk',
    facing: 'left',
    durationMs: 1750,
  },
  // 8: Joyful squash-and-stretch celebration hop beside Home before restarting loop
  {
    kind: 'hop-home',
    anchor: 'ai',
    zIndex: 34,
    duckBehind: false,
    expression: 'hop',
    facing: 'right',
    popupPlacement: 'below-left',
    durationMs: 3600,
  },
];

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hasDriveAccess,
  activeView,
  onNavigate,
  onSelectPdfTool,
  onSelectImageTool,
  onLogin,
  onLogout: _onLogout,
  onOpenSettings,
  onOpenProfile,
  hasSavedProfileData = false,
  profileAvatarUrl,
  isLoggingIn,
  isChatbotMinimized = false,
  onRestoreChatbot,
  showMiniRobot = true,
  onOpenFeedback,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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

  const handleNavClick = (view: AppView | 'batch' | 'library') => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  const handleSelectSearchTool = (item: SearchableToolItem) => {
    if (item.target.kind === 'pdf') {
      if (onSelectPdfTool) onSelectPdfTool(item.target.tool);
      else onNavigate('tools');
    } else if (item.target.kind === 'image') {
      if (onSelectImageTool) onSelectImageTool(item.target.tool);
      else onNavigate('image-tools');
    } else {
      onNavigate(item.target.view);
    }
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  };

  // Measure exact button/rail landmarks inside barRef so the robot aligns cleanly without clipping
  const measureAnchorPosition = useCallback(
    (stage: RobotStage) => {
      const container = barRef.current;
      if (!container) return;
      const barRect = container.getBoundingClientRect();
      if (barRect.width < 740) {
        setRobotCoords(null);
        return;
      }

      const robotW = 44;
      const robotH = 44;
      const getRect = (anchor: RobotStage['anchor']): DOMRect | null => {
        const el = container.querySelector(`[data-robot-anchor="${anchor}"]`) as HTMLElement | null;
        return el ? el.getBoundingClientRect() : null;
      };

      const aiRect = getRect('ai') ?? getRect('logo');
      const navRect = getRect('nav-dock');
      const toolsRect = getRect('tools');
      const searchRect = getRect('search');
      const googleRect = getRect('google');
      const homeRect = getRect('home');

      let nextX = 24;
      let nextY = Math.round((barRect.height - robotH) / 2);

      switch (stage.kind) {
        case 'beside-ai':
        case 'hop-home': {
          if (aiRect && navRect) {
            const gapLeft = aiRect.right - barRect.left;
            const gapRight = navRect.left - barRect.left;
            const idealX = gapLeft + 6;
            nextX = gapRight - gapLeft >= robotW + 10 ? idealX : Math.max(10, (gapLeft + gapRight - robotW) / 2);
            nextY = Math.round(aiRect.top - barRect.top + (aiRect.height - robotH) / 2);
          } else if (aiRect) {
            nextX = aiRect.right - barRect.left + 8;
          }
          break;
        }
        case 'walk-to-nav': {
          if (navRect) {
            nextX = Math.max(12, navRect.left - barRect.left - robotW + 4);
            nextY = Math.round(navRect.top - barRect.top + (navRect.height - robotH) / 2 + 2);
          }
          break;
        }
        case 'peek-nav-left': {
          if (navRect) {
            // Tucked right behind the top-left edge of the nav rail so helmet, eyes & waving hand peek cleanly out
            nextX = navRect.left - barRect.left - 20;
            nextY = Math.max(3, Math.round(navRect.top - barRect.top - 2));
          }
          break;
        }
        case 'gap-dance': {
          if (navRect && searchRect) {
            const gapLeft = navRect.right - barRect.left;
            const gapRight = searchRect.left - barRect.left;
            const gapWidth = gapRight - gapLeft;
            if (gapWidth >= robotW + 4) {
              nextX = gapLeft + (gapWidth - robotW) / 2;
              nextY = Math.round(navRect.top - barRect.top + (navRect.height - robotH) / 2);
            } else {
              // Tuck neatly just overlapping the bottom-right corner of the nav pill without obscuring Search
              nextX = gapLeft - 14;
              nextY = Math.round(navRect.top - barRect.top + 3);
            }
          } else if (navRect) {
            nextX = navRect.right - barRect.left + 6;
          }
          break;
        }
        case 'point-google': {
          if (googleRect) {
            const googleLeft = googleRect.left - barRect.left;
            const searchRight = searchRect ? searchRect.right - barRect.left : 0;
            const gapWidth = googleLeft - searchRight;
            nextX = gapWidth >= robotW - 4 ? googleLeft - robotW + 2 : Math.max(12, googleLeft - robotW + 6);
            nextY = Math.round(googleRect.top - barRect.top + (googleRect.height - robotH) / 2);
          }
          break;
        }
        case 'peek-nav-right': {
          if (navRect) {
            // Tucked cleanly behind the right corner of the nav rail, facing right to peek outward
            nextX = navRect.right - barRect.left - 22;
            nextY = Math.max(3, Math.round(navRect.top - barRect.top - 2));
          }
          break;
        }
        case 'spiderman-tools': {
          if (toolsRect) {
            // Center directly under PDF & Office button, with web dot flush on its bottom border
            nextX = toolsRect.left - barRect.left + toolsRect.width / 2 - robotW / 2;
            nextY = Math.round(toolsRect.bottom - barRect.top + 15);
          }
          break;
        }
        case 'walk-home': {
          if (homeRect && aiRect) {
            const gapMid = ((aiRect.right - barRect.left) + (homeRect.left - barRect.left)) / 2;
            nextX = gapMid - robotW / 2 + 8;
            nextY = Math.round(homeRect.top - barRect.top + (homeRect.height - robotH) / 2 + 2);
          } else if (navRect) {
            nextX = navRect.left - barRect.left - 24;
          }
          break;
        }
      }

      const clampedX = Math.round(Math.max(8, Math.min(barRect.width - robotW - 8, nextX)));
      setRobotCoords({ x: clampedX, y: nextY });
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
        if (ROAM_STAGES[next]?.kind === 'spiderman-tools') setEngageToggle((t) => !t);
        return next;
      });
    }, stage.durationMs);
    return () => window.clearTimeout(timer);
  }, [stageIdx, showMiniRobot, prefersReducedMotion, roamingHovered]);

  // Re-measure anchor coordinates on stage/layout/auth changes, window resize, and bar ResizeObserver
  useEffect(() => {
    if (!showMiniRobot || prefersReducedMotion) return;
    const stage = ROAM_STAGES[stageIdx];
    const raf = window.requestAnimationFrame(() => measureAnchorPosition(stage));
    const onResize = () => measureAnchorPosition(ROAM_STAGES[stageIdx]);
    window.addEventListener('resize', onResize);

    const observer =
      typeof ResizeObserver !== 'undefined' && barRef.current
        ? new ResizeObserver(() => measureAnchorPosition(ROAM_STAGES[stageIdx]))
        : null;
    if (observer && barRef.current) {
      observer.observe(barRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [stageIdx, showMiniRobot, prefersReducedMotion, isChatbotMinimized, isConnected, activeView, googleBtnHovered, measureAnchorPosition]);

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
    if (currentStage.kind === 'point-google' && !isConnected) {
      return { text: 'Sign in with Google to Explore Cover Studio!', actionLabel: 'Sign in' };
    }
    if (currentStage.kind === 'spiderman-tools' && (engageToggle || roamingHovered)) {
      return engageToggle && onOpenFeedback
        ? { text: 'Are you loving PaperLink? Tell us!', isFeedback: true, actionLabel: 'Feedback' }
        : { text: 'Try 21+ PDF & Office Tools!', actionLabel: 'Explore' };
    }
    if (!roamingHovered) {
      return null;
    }
    if (currentStage.kind === 'beside-ai') {
      return { text: 'Hi! Need help from PaperLink AI?', actionLabel: 'Chat' };
    }
    if (currentStage.kind === 'point-google' && isConnected) {
      return { text: 'Drive Ready! Explore Cover Studio!', actionLabel: 'Open Studio' };
    }
    if (
      currentStage.kind === 'peek-nav-left' ||
      currentStage.kind === 'gap-dance' ||
      currentStage.kind === 'peek-nav-right'
    ) {
      return contextTip;
    }
    return { text: 'All tools run fast & private!', actionLabel: 'Studio' };
  })();

  const handleRoamingPopupClick = () => {
    if (currentStage.kind === 'gap-dance') {
      if (activeView === 'home') onNavigate('studio');
      else onRestoreChatbot?.();
      return;
    }
    if (currentStage.kind === 'point-google') {
      if (isConnected) onNavigate('studio');
      else onLogin();
      return;
    }
    if (currentStage.kind === 'spiderman-tools') {
      if (engageToggle && onOpenFeedback) onOpenFeedback();
      else onNavigate('tools');
      return;
    }
    if (currentStage.kind === 'hop-home') {
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
            onMouseEnter={() => setRoamingHovered(true)}
            onMouseLeave={() => setRoamingHovered(false)}
            initial={false}
            animate={{
              x: robotCoords.x,
              y: roamingHovered && currentStage.duckBehind ? robotCoords.y - 3 : robotCoords.y,
            }}
            transition={{
              x: { type: 'spring', stiffness: 105, damping: 18, mass: 0.9 },
              y: { type: 'spring', stiffness: 180, damping: 20 },
            }}
            style={{ zIndex: roamingHovered ? 40 : currentStage.zIndex }}
            className="hidden md:flex items-center absolute left-0 top-0 pointer-events-auto"
          >
            <MiniAiRobot
              variant="topbar"
              isHovered={roamingHovered}
              expressionOverride={currentStage.expression}
              duckBehind={roamingHovered ? false : currentStage.duckBehind}
              facing={currentStage.facing ?? 'right'}
              leanDeg={roamingHovered && currentStage.duckBehind ? 0 : currentStage.leanDeg}
              hideShadow
              ropeLength={currentStage.ropeLength ?? 0}
              externalPopup={roamingPopup}
              quickActions={robotQuickActions}
              popupPlacement={currentStage.popupPlacement ?? 'below-center'}
              onPopupClick={handleRoamingPopupClick}
              onFeedbackClick={onOpenFeedback}
              title="Click to say hi (or poke 3x if you dare!)"
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
                      hideShadow
                      isHovered={aiPillHovered}
                      onPopupClick={onRestoreChatbot}
                      onFeedbackClick={onOpenFeedback}
                      title="Say hi to PaperLink Bot"
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
          className="relative z-20 hidden md:flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200/95 dark:border-zinc-700/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_14px_-4px_rgba(15,23,42,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(0,0,0,0.45)]"
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

        {/* Mini Circular Tool Search Button */}
        <div
          data-robot-anchor="search"
          className="relative z-30 hidden md:flex items-center shrink-0"
        >
          <TopToolSearch variant="mini" onSelectTool={handleSelectSearchTool} />
        </div>

        {/* Zone 3: Connection Status + Install + Settings + Logout + Mobile Toggle */}
        <div className="relative z-20 flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((prev) => !prev);
              setMobileMenuOpen(false);
            }}
            className={`md:hidden p-2 border rounded-full transition-all cursor-pointer shrink-0 shadow-[0_0_14px_-3px_rgba(var(--pl-accent-rgb),0.45)] ${
              mobileSearchOpen
                ? 'border-[var(--pl-accent)] bg-blue-50 dark:bg-yellow-400/15 text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)] shadow-[0_0_18px_-2px_rgba(var(--pl-accent-rgb),0.65)]'
                : 'border-[var(--pl-accent)]/45 bg-[var(--pl-surface)] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200'
            }`}
            aria-label={mobileSearchOpen ? 'Close tool search' : 'Search tools'}
            title="Search tools"
          >
            <Search className="w-4 h-4" />
          </button>

          <PWAInstallButton />

          {!user && (
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
                      showMiniRobot && currentStage.kind === 'point-google'
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

          {/* Profile Button (Top-Right Corner) */}
          {onOpenProfile && (() => {
            const avatarSrc = profileAvatarUrl || user?.photoURL || '';
            const initial = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();
            return (
              <button
                type="button"
                data-robot-anchor={user ? 'google' : undefined}
                onClick={onOpenProfile}
                title={
                  user
                    ? `Signed in (${user.displayName || user.email || 'Account'}) · Open Profile Vault & Logout`
                    : 'Profile, Biodata, IDs & Signature Vault'
                }
                aria-label="Open User Profile Vault"
                className={`relative z-20 inline-flex items-center justify-center rounded-full transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  user
                    ? 'w-8 h-8 sm:w-9 sm:h-9 p-0.5 border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/25 bg-[var(--pl-surface)] dark:bg-zinc-900 shadow-[0_0_12px_-2px_rgba(16,185,129,0.45)] hover:scale-105'
                    : 'w-8 h-8 sm:w-9 sm:h-9 border border-slate-300/90 dark:border-zinc-700 bg-[var(--pl-surface)] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:border-[var(--pl-accent)] hover:text-[var(--pl-accent-text)] dark:hover:text-[var(--pl-accent)] shadow-xs'
                }`}
              >
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={user?.displayName || 'Profile'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : user ? (
                  <span className="w-full h-full rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs flex items-center justify-center">
                    {initial}
                  </span>
                ) : (
                  <UserIcon className="w-4 h-4" />
                )}
                {hasSavedProfileData && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950"
                  />
                )}
              </button>
            );
          })()}

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

      {/* Mobile Tool Search Bar */}
      {mobileSearchOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--pl-surface-soft)] px-4 py-2.5">
          <TopToolSearch
            autoFocus
            onSelectTool={handleSelectSearchTool}
            onAfterSelect={() => setMobileSearchOpen(false)}
          />
        </div>
      )}

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
