import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { typewriterAudio } from '../services/soundEffects';

export type RobotExpression =
  | 'wave'
  | 'thumbs-up'
  | 'happy'
  | 'glance'
  | 'peek-hide'
  | 'thinking'
  | 'wink'
  | 'laugh'
  | 'blush'
  | 'surprised'
  | 'sleepy'
  | 'sparkle'
  | 'salute'
  | 'celebrate'
  | 'curious'
  | 'child-peek'
  | 'dance'
  | 'hop'
  | 'angry'
  | 'funny-walk'
  | 'point-right'
  | 'point-left'
  | 'spiderman-hang'
  | 'edge-grab'
  | 'push';

const TOPBAR_SEQUENCE: RobotExpression[] = [
  'wave',
  'thumbs-up',
  'happy',
  'dance',
  'curious',
  'hop',
  'glance',
  'wink',
  'salute',
  'thinking',
  'child-peek',
  'sparkle',
  'celebrate',
  'sleepy',
];

const CHATBOT_PERCH_SEQUENCE: RobotExpression[] = [
  'wave',
  'thumbs-up',
  'happy',
  'dance',
  'curious',
  'hop',
  'thinking',
  'wink',
  'salute',
  'sparkle',
  'celebrate',
  'sleepy',
];

export interface RobotQuickAction {
  label: string;
  onClick: () => void;
}

export interface RobotPromptItem {
  text: string;
  isFeedback?: boolean;
  actionLabel?: string;
  quickActions?: RobotQuickAction[];
}

const GREETING_PHRASES: RobotPromptItem[] = [
  { text: 'Hi! Welcome!' },
  { text: 'Are you loving PaperLink?' },
  { text: 'Can you give me feedback?', isFeedback: true },
  { text: 'You can give suggestions to us!', isFeedback: true },
];

interface MiniAiRobotProps {
  isHovered?: boolean;
  onClick?: () => void;
  onFeedbackClick?: () => void;
  title?: string;
  variant?: 'topbar' | 'chatbot-perch' | 'loader' | 'hero';
  /** Optional externally driven expression for choreographed top-bar roaming or loaders */
  expressionOverride?: RobotExpression;
  /** External override popup message (stays upright even during Spider-Man inverted hang) */
  externalPopup?: RobotPromptItem | null;
  onPopupClick?: () => void;
  /** Optional interactive shortcuts displayed when hovering or tapping the robot */
  quickActions?: RobotQuickAction[];
  /** Placement of the popup pill relative to the robot */
  popupPlacement?: 'below-left' | 'below-right' | 'below-center' | 'side-left' | 'side-right';
  /** Spider-Man web rope height in px drawn straight up from robot boots */
  ropeLength?: number;
  /** Compact peeking scale when ducking behind header buttons */
  duckBehind?: boolean;
  /** Flip horizontal direction (used when pushing bar from right to left or facing left) */
  facing?: 'right' | 'left';
  /** Which container edge the robot is physically gripping during 'edge-grab' */
  grabEdge?: 'left' | 'right' | 'top';
  /** Custom visual size override */
  sizeClassName?: string;
}

export const MiniAiRobot: React.FC<MiniAiRobotProps> = ({
  isHovered = false,
  onClick,
  onFeedbackClick,
  title = 'Open PaperLink AI',
  variant = 'topbar',
  expressionOverride,
  externalPopup,
  onPopupClick,
  quickActions,
  popupPlacement,
  ropeLength = 0,
  duckBehind = false,
  facing = 'right',
  grabEdge = 'right',
  sizeClassName,
}) => {
  const uid = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const sequence = variant === 'chatbot-perch' ? CHATBOT_PERCH_SEQUENCE : TOPBAR_SEQUENCE;
  const [exprIndex, setExprIndex] = useState(0);
  const [blinkNow, setBlinkNow] = useState(false);
  const [internalPopup, setInternalPopup] = useState<RobotPromptItem | null>(null);
  const [clickSpeechOverride, setClickSpeechOverride] = useState<{ text: string; isAngry?: boolean } | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [petBurstActive, setPetBurstActive] = useState(false);
  const [angryActive, setAngryActive] = useState(false);
  const [eyeGaze, setEyeGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const petTimerRef = useRef<number | null>(null);
  const angryTimerRef = useRef<number | null>(null);
  const speechTimerRef = useRef<number | null>(null);
  const clickTimesRef = useRef<number[]>([]);
  const lastAutoSpeechRef = useRef<number>(Date.now() - 16000);

  const isChoreographed = expressionOverride !== undefined;
  const isLoader = variant === 'loader';

  // Calm, natural autonomous expression cycle (disabled when externally choreographed or loader)
  useEffect(() => {
    if (prefersReducedMotion || isChoreographed || isLoader) return;
    const interval = window.setInterval(() => {
      setExprIndex((prev) => (prev + 1) % sequence.length);
    }, variant === 'chatbot-perch' ? 5400 : 5000);
    return () => window.clearInterval(interval);
  }, [prefersReducedMotion, isChoreographed, isLoader, sequence.length, variant]);

  // Occasional realistic double-blink
  useEffect(() => {
    if (prefersReducedMotion) return;
    let t1: number | undefined;
    let t2: number | undefined;
    let count = 0;

    const timer = window.setInterval(() => {
      count += 1;
      setBlinkNow(true);
      t1 = window.setTimeout(() => {
        setBlinkNow(false);
        if (count % 3 === 0) {
          t2 = window.setTimeout(() => {
            setBlinkNow(true);
            t1 = window.setTimeout(() => setBlinkNow(false), 110);
          }, 145);
        }
      }, 115);
    }, 3600);

    return () => {
      window.clearInterval(timer);
      if (t1) window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [prefersReducedMotion]);

  // Cleanup click/anger timers
  useEffect(() => {
    return () => {
      if (petTimerRef.current) window.clearTimeout(petTimerRef.current);
      if (angryTimerRef.current) window.clearTimeout(angryTimerRef.current);
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
    };
  }, []);

  // Subtle living cursor eye-tracking for hero, chatbot-perch, and hovered topbar robot
  useEffect(() => {
    if (prefersReducedMotion || isLoader) return;
    const trackEnabled = variant === 'hero' || variant === 'chatbot-perch' || isHovered;
    if (!trackEnabled) {
      setEyeGaze({ x: 0, y: 0 });
      return;
    }

    let rafId = 0;
    const handlePointerMove = (e: PointerEvent) => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const el = rootRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const scale = Math.min(1, dist / 260);
        const dirSign = facing === 'left' ? -1 : 1;
        setEyeGaze({
          x: Number((((dx / dist) * 2.1 * scale) * dirSign).toFixed(2)),
          y: Number(((dy / dist) * 1.25 * scale).toFixed(2)),
        });
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion, isLoader, variant, isHovered, facing]);

  const baseExpr: RobotExpression = isChoreographed
    ? expressionOverride
    : isHovered
    ? variant === 'chatbot-perch'
      ? 'thumbs-up'
      : 'wave'
    : sequence[exprIndex % sequence.length];

  const activeExpr: RobotExpression = angryActive
    ? 'angry'
    : petBurstActive
    ? 'celebrate'
    : baseExpr;

  // Low-frequency autonomous greeting phrases (26s cooldown so screen stays uncluttered; hover always responds)
  useEffect(() => {
    if (isChoreographed || externalPopup !== undefined || isLoader || angryActive) return;
    const shouldSpeak = activeExpr === 'wave' || activeExpr === 'thumbs-up';
    if (!shouldSpeak) return;

    const now = Date.now();
    if (now - lastAutoSpeechRef.current < 26000) return;
    lastAutoSpeechRef.current = now;

    const nextPhrase = GREETING_PHRASES[phraseIndex % GREETING_PHRASES.length];
    setInternalPopup(nextPhrase);
    setPhraseIndex((p) => (p + 1) % GREETING_PHRASES.length);

    const hideTimer = window.setTimeout(() => {
      setInternalPopup(null);
    }, 3200);

    return () => window.clearTimeout(hideTimer);
  }, [activeExpr, isChoreographed, externalPopup, isLoader, angryActive, phraseIndex]);

  useEffect(() => {
    if (isChoreographed || externalPopup !== undefined || isLoader || angryActive) return;
    if (isHovered) {
      setInternalPopup(GREETING_PHRASES[phraseIndex % GREETING_PHRASES.length]);
    } else {
      setInternalPopup(null);
    }
  }, [isHovered, isChoreographed, externalPopup, isLoader, phraseIndex, angryActive]);

  const activePopup: RobotPromptItem | null = clickSpeechOverride
    ? { text: clickSpeechOverride.text }
    : externalPopup !== undefined
    ? externalPopup
    : internalPopup;
  const isAngryPopup = Boolean(clickSpeechOverride?.isAngry || angryActive);
  const visibleQuickActions =
    !isAngryPopup && (activePopup?.quickActions ?? (isHovered && quickActions && quickActions.length > 0 ? quickActions : undefined));

  const isPerch = variant === 'chatbot-perch';
  const isHero = variant === 'hero';
  const isAngry = activeExpr === 'angry';
  const isDance = activeExpr === 'dance';
  const isHop = activeExpr === 'hop';
  const isWalking = activeExpr === 'funny-walk';
  const isPushing = activeExpr === 'push';
  const isPointRight = activeExpr === 'point-right';
  const isPointLeft = activeExpr === 'point-left';
  const isSpiderman = activeExpr === 'spiderman-hang';
  const isEdgeGrab = activeExpr === 'edge-grab';
  const isChildPeek =
    (activeExpr === 'child-peek' || activeExpr === 'peek-hide' || duckBehind) &&
    !isSpiderman &&
    !isEdgeGrab &&
    !isAngry &&
    !isWalking;
  const isWaving = activeExpr === 'wave' || isChildPeek || (isHovered && !isPerch && !isChoreographed && !isAngry && !isEdgeGrab);
  const isThumbsUp = (activeExpr === 'thumbs-up' || (isHovered && isPerch)) && !isAngry;
  const isSalute = activeExpr === 'salute';
  const isCelebrate = activeExpr === 'celebrate';
  const isCurious = activeExpr === 'curious';
  const isThinking = activeExpr === 'thinking';
  const isBlush = activeExpr === 'blush';
  const isLaughing = activeExpr === 'laugh';
  const isSurprised = activeExpr === 'surprised';
  const isSleepy = activeExpr === 'sleepy';

  // Mood-matched LED visor & antenna beacon colors
  const ledColor = isAngry
    ? '#ef4444'
    : isEdgeGrab
    ? '#38bdf8'
    : isCelebrate || isHop
    ? '#34d399'
    : isDance
    ? '#a78bfa'
    : isThinking || isCurious
    ? '#facc15'
    : isBlush || isChildPeek
    ? '#f472b6'
    : 'var(--pl-robot-led, #38bdf8)';

  // Controlled mechanical body lean — smooth spring transitions, never floppy
  const bodyTilt = isSpiderman
    ? 180
    : isEdgeGrab
    ? grabEdge === 'right'
      ? 9
      : grabEdge === 'left'
      ? -9
      : 2
    : isAngry
    ? -4
    : isPushing
    ? -11
    : isPointRight
    ? 5
    : isPointLeft
    ? -5
    : isCurious
    ? 7
    : isSalute
    ? -3
    : isHovered
    ? -3
    : isChildPeek
    ? -6
    : isThinking
    ? 5
    : activeExpr === 'glance'
    ? -4
    : activeExpr === 'wink'
    ? 3
    : isSleepy
    ? 4
    : 0;

  const resolvedPlacement = popupPlacement ?? (isPerch ? 'side-left' : 'below-left');

  const popupPositionClasses = (() => {
    switch (resolvedPlacement) {
      case 'side-left':
        return 'right-full mr-2 top-1/2 -translate-y-1/2';
      case 'side-right':
        return 'left-full ml-2 top-1/2 -translate-y-1/2';
      case 'below-right':
        return 'top-full right-0 mt-1.5';
      case 'below-center':
        return 'top-full left-1/2 -translate-x-1/2 mt-1.5';
      case 'below-left':
      default:
        return 'top-full left-0 mt-1.5';
    }
  })();

  const pearlHeadId = `roboCeramicHead_${uid}`;
  const pearlBodyId = `roboCeramicBody_${uid}`;
  const darkJointId = `roboObsidianJoint_${uid}`;
  const visorGlassId = `roboVisorGlass_${uid}`;
  const coreGlowId = `roboCoreGlow_${uid}`;

  const interactiveWrapperClass = `relative flex items-center justify-center rounded-full shrink-0 ${
    !isLoader ? 'cursor-pointer pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]' : 'pointer-events-none'
  } p-0.5`;

  const handleRobotClick = () => {
    const now = Date.now();
    // Retain clicks within the last 4.5 seconds to detect 3-4 rapid disturbing pokes
    clickTimesRef.current = [...clickTimesRef.current.filter((t) => now - t < 4500), now];
    const recentCount = clickTimesRef.current.length;

    if (recentCount >= 3) {
      clickTimesRef.current = [];
      setPetBurstActive(false);
      setAngryActive(true);
      setClickSpeechOverride({
        text: 'Why are you disturbing me? Do your work!',
        isAngry: true,
      });
      typewriterAudio.playRobotAngrySigh();

      if (angryTimerRef.current) window.clearTimeout(angryTimerRef.current);
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
      angryTimerRef.current = window.setTimeout(() => {
        setAngryActive(false);
      }, 4200);
      speechTimerRef.current = window.setTimeout(() => {
        setClickSpeechOverride(null);
      }, 4200);
      return;
    }

    // 1st-2nd click: Exciting "Heloooooooooow!" sound + joyful celebrate bounce
    typewriterAudio.playRobotExcitedHello();
    setClickSpeechOverride({ text: 'Heloooooooooow!' });
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = window.setTimeout(() => {
      setClickSpeechOverride(null);
    }, 2000);

    if (!prefersReducedMotion) {
      setPetBurstActive(true);
      if (petTimerRef.current) window.clearTimeout(petTimerRef.current);
      petTimerRef.current = window.setTimeout(() => {
        setPetBurstActive(false);
      }, 1400);
    }
    onClick?.();
  };

  const robotSvg = (
    <motion.svg
      viewBox="0 0 64 64"
      style={facing === 'left' ? { transform: 'scaleX(-1)' } : undefined}
      className={
        sizeClassName
          ? sizeClassName
          : isHero
          ? 'w-16 h-16 sm:w-20 sm:h-20 overflow-visible drop-shadow-[0_10px_18px_rgba(15,23,42,0.26)]'
          : isPerch
          ? 'w-12 h-12 sm:w-14 sm:h-14 overflow-visible drop-shadow-[0_6px_12px_rgba(0,0,0,0.26)]'
          : 'w-9 h-9 sm:w-10 sm:h-10 overflow-visible drop-shadow-[0_4px_9px_rgba(0,0,0,0.22)]'
      }
      animate={
        prefersReducedMotion || isWalking || isSpiderman || isPushing
          ? undefined
          : isAngry
          ? { x: [-1.4, 1.4, -1.2, 1.2, 0], y: [0, -1, 0] }
          : isEdgeGrab
          ? { y: [0, 2.2, 0], rotate: grabEdge === 'top' ? [-3.5, 3.5, -3.5] : [bodyTilt - 2.5, bodyTilt + 2.5, bodyTilt - 2.5] }
          : isHop
          ? { y: [0, 1.8, -7.2, -7.2, 0.8, 0], scaleY: [1, 0.9, 1.07, 1.02, 0.92, 1] }
          : isDance
          ? { y: [0, -3.2, 0, -3.2, 0], rotate: [-5.5, 5.5, -5.5] }
          : isChildPeek
          ? { y: [2.5, -2.5, 2.5] }
          : isCelebrate || isLaughing || isThumbsUp
          ? { y: [0, -2.5, 0] }
          : isSleepy
          ? { y: [0, 1, 0] }
          : { y: [0, -1.4, 0] }
      }
      transition={{
        duration: isAngry
          ? 0.28
          : isEdgeGrab
          ? 2.2
          : isHop
          ? 0.92
          : isDance
          ? 1.05
          : isChildPeek
          ? 1.95
          : isCelebrate
          ? 0.82
          : isThumbsUp
          ? 1.35
          : isSleepy
          ? 3.4
          : 2.8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <defs>
        {/* 3D Ceramic Pearl-White Helmet Shading */}
        <radialGradient id={pearlHeadId} cx="32%" cy="22%" r="76%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="56%" stopColor="#f1f5f9" />
          <stop offset="86%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>

        {/* 3D Ceramic Body Shell */}
        <radialGradient id={pearlBodyId} cx="35%" cy="20%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>

        {/* Brushed Gunmetal Articulated Joints */}
        <linearGradient id={darkJointId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="48%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>

        {/* Glossy Curved Black LED Visor */}
        <linearGradient id={visorGlassId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="28%" stopColor="#090f18" />
          <stop offset="100%" stopColor="#02060c" />
        </linearGradient>

        {/* Illuminated Reactor Core */}
        <radialGradient id={coreGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={ledColor} />
          <stop offset="100%" stopColor="var(--pl-robot-accent, #2563eb)" />
        </radialGradient>
      </defs>

      {/* Soft Ground Contact Shadow (hidden while hanging from web or gripping container edges) */}
      {!isSpiderman && !isEdgeGrab && (
        <motion.ellipse
          cx="32"
          cy="61"
          rx="14.5"
          ry="2.2"
          fill="#0f172a"
          animate={
            prefersReducedMotion
              ? undefined
              : isHop
              ? { rx: [14.5, 16, 9, 14.5], opacity: [0.22, 0.26, 0.08, 0.22] }
              : isCelebrate || isThumbsUp
              ? { rx: [14.5, 12.2, 14.5], opacity: [0.22, 0.14, 0.22] }
              : { rx: [14.5, 13.6, 14.5], opacity: [0.22, 0.18, 0.22] }
          }
          transition={{ duration: isHop ? 0.92 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* MECHANICAL ARTICULATED LEGS & BOOTS */}
      <g>
        {/* Left Leg */}
        <motion.g
          style={{ originX: '25.5px', originY: '46px' }}
          animate={
            prefersReducedMotion
              ? undefined
              : isEdgeGrab
              ? { rotate: [12, -10, 12], y: [0, 1.4, 0] }
              : isPushing
              ? { rotate: [-14, -20, -14], y: [0, -1.2, 0] }
              : isWalking
              ? { rotate: [-16, 16, -16], y: [0, -2.5, 0] }
              : isDance
              ? { rotate: [-12, 8, -12], y: [0, -2, 0] }
              : isHop
              ? { rotate: [0, 12, -14, 0], y: [0, 1, -2, 0] }
              : isCelebrate
              ? { rotate: [-8, 6, -8], y: [0, -1.6, 0] }
              : isSpiderman
              ? { rotate: [-10, -5, -10], y: -1 }
              : { rotate: 0, y: 0 }
          }
          transition={{
            duration: isEdgeGrab ? 1.85 : isPushing ? 0.52 : isWalking ? 0.45 : isDance ? 0.54 : isHop ? 0.92 : isCelebrate ? 0.65 : 1.6,
            repeat: isEdgeGrab || isPushing || isWalking || isDance || isHop || isCelebrate || isSpiderman ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <circle cx="25.5" cy="46.5" r="3" fill={`url(#${darkJointId})`} />
          <rect
            x="22.2"
            y="47.5"
            width="6.5"
            height="6.5"
            rx="2.8"
            fill={`url(#${pearlBodyId})`}
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <circle cx="25.5" cy="52.2" r="1.4" fill="var(--pl-robot-accent, #2563eb)" />
          <path
            d="M19 56 Q19 52.5 23.8 52.5 H27.2 Q29.8 52.5 29.8 56 V58 H20 Q19 58 19 56 Z"
            fill={`url(#${pearlBodyId})`}
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <rect x="19" y="56.8" width="11" height="1.9" rx="0.95" fill="var(--pl-robot-accent, #2563eb)" />
        </motion.g>

        {/* Right Leg */}
        <motion.g
          style={{ originX: '38.5px', originY: '46px' }}
          animate={
            prefersReducedMotion
              ? undefined
              : isEdgeGrab
              ? { rotate: [-12, 10, -12], y: [1.4, 0, 1.4] }
              : isPushing
              ? { rotate: [20, 27, 20], y: [-1, 0.5, -1] }
              : isWalking
              ? { rotate: [16, -16, 16], y: [-2.5, 0, -2.5] }
              : isDance
              ? { rotate: [12, -8, 12], y: [-2, 0, -2] }
              : isHop
              ? { rotate: [0, -12, 14, 0], y: [0, 1, -2, 0] }
              : isCelebrate
              ? { rotate: [8, -6, 8], y: [-1.6, 0, -1.6] }
              : isSpiderman
              ? { rotate: [10, 5, 10], y: -1 }
              : { rotate: 0, y: 0 }
          }
          transition={{
            duration: isEdgeGrab ? 1.85 : isPushing ? 0.52 : isWalking ? 0.45 : isDance ? 0.54 : isHop ? 0.92 : isCelebrate ? 0.65 : 1.6,
            repeat: isEdgeGrab || isPushing || isWalking || isDance || isHop || isCelebrate || isSpiderman ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <circle cx="38.5" cy="46.5" r="3" fill={`url(#${darkJointId})`} />
          <rect
            x="35.3"
            y="47.5"
            width="6.5"
            height="6.5"
            rx="2.8"
            fill={`url(#${pearlBodyId})`}
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <circle cx="38.5" cy="52.2" r="1.4" fill="var(--pl-robot-accent, #2563eb)" />
          <path
            d="M34.2 56 Q34.2 52.5 36.8 52.5 H40.2 Q45 52.5 45 56 Q45 58 44 58 H34.2 Z"
            fill={`url(#${pearlBodyId})`}
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <rect x="34.2" y="56.8" width="11" height="1.9" rx="0.95" fill="var(--pl-robot-accent, #2563eb)" />
        </motion.g>
      </g>

      {/* LEFT ARM */}
      <motion.g
        style={{ originX: '20.5px', originY: '36px' }}
        animate={
          prefersReducedMotion
            ? undefined
            : isAngry
            ? { rotate: [26, 36, 26], y: [-1, 1, -1] }
            : isEdgeGrab
            ? grabEdge === 'left'
              ? { rotate: [18, 42, 18] }
              : { rotate: [-2, 3, -2] }
            : isPushing
            ? { rotate: [22, 26, 22], x: [0, -1, 0] }
            : isDance
            ? { rotate: [38, -12, 38] }
            : isCelebrate || isHop
            ? { rotate: [42, 58, 42] }
            : isChildPeek
            ? { rotate: [16, 22, 16], y: [2, 1, 2] }
            : isPointLeft
            ? { rotate: [4, 10, 4] }
            : isWalking
            ? { rotate: [20, -20, 20] }
            : isSpiderman
            ? { rotate: [-18, -32, -18] }
            : isThumbsUp
            ? { rotate: [2, -5, 2] }
            : isSurprised
            ? { rotate: 22 }
            : { rotate: [-3, 3, -3] }
        }
        transition={{
          duration: isAngry ? 0.3 : isEdgeGrab ? 1.6 : isPushing ? 0.45 : isWalking ? 0.42 : isDance ? 0.68 : isCelebrate || isHop ? 0.65 : isThumbsUp ? 1.25 : 2.3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <circle cx="20.5" cy="36" r="3.4" fill={`url(#${darkJointId})`} />
        <circle cx="20.5" cy="36" r="1.3" fill="var(--pl-robot-accent, #2563eb)" />
        {isPushing ? (
          <>
            <path d="M19.5 36 L6.5 34.5" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M16.5 35.6 L7.5 34.5" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5.2" strokeLinecap="round" />
            <circle cx="5.2" cy="34.4" r="3.2" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
          </>
        ) : isPointLeft ? (
          <>
            <path d="M19.5 36 L6.5 33.5" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M16 35.2 L6.5 33.5" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5" strokeLinecap="round" />
            <circle cx="5.5" cy="33.4" r="3.1" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            <rect x="-2.8" y="31.9" width="7" height="2.4" rx="1.2" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.5" />
          </>
        ) : isChildPeek ? (
          <>
            {/* Left little hand peeking & gripping the button edge like a curious child */}
            <path d="M19.5 34 Q13 31 11.5 23.5" fill="none" stroke="#1e293b" strokeWidth="4.2" strokeLinecap="round" />
            <path d="M17.2 33 Q12.8 30.2 11.5 23.5" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="4.9" strokeLinecap="round" />
            <circle cx="11.2" cy="21.8" r="3.2" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            <rect x="8.8" y="18.2" width="1.7" height="3.1" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
            <rect x="10.8" y="17.8" width="1.7" height="3.3" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
            <rect x="12.8" y="18.5" width="1.6" height="2.9" rx="0.8" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
          </>
        ) : isEdgeGrab && (grabEdge === 'right' || grabEdge === 'top') ? (
          <>
            {/* Left gripping clamp clinging to container rim */}
            <path
              d={grabEdge === 'top' ? 'M19.5 34 Q12 24 14 11' : 'M19.5 35 L4.5 29'}
              fill="none"
              stroke="#1e293b"
              strokeWidth="4.3"
              strokeLinecap="round"
            />
            <path
              d={grabEdge === 'top' ? 'M17.5 33 Q12.5 24 14 11' : 'M16.5 34 L4.5 29'}
              fill="none"
              stroke={`url(#${pearlBodyId})`}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx={grabEdge === 'top' ? 14 : 3.6} cy={grabEdge === 'top' ? 9.5 : 28.6} r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            {grabEdge === 'top' ? (
              <>
                <rect x="11.4" y="4.5" width="1.7" height="4" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="13.5" y="4" width="1.7" height="4.2" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="15.6" y="4.8" width="1.6" height="3.8" rx="0.8" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
              </>
            ) : (
              <>
                <rect x="-1.6" y="25.8" width="4.2" height="1.7" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="-2.1" y="27.8" width="4.4" height="1.7" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="-1.4" y="29.8" width="4" height="1.6" rx="0.8" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
              </>
            )}
          </>
        ) : (
          <>
            <path d="M19.5 37 Q13 40.5 10.2 34.2" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M16 38.8 Q12 39.2 10.2 33.8" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5.2" strokeLinecap="round" />
            <circle cx="9.8" cy="32.2" r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            {(isThumbsUp || isSpiderman || isCelebrate) && (
              <rect x="8.6" y="26.2" width="2.5" height="5" rx="1.25" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.5" />
            )}
          </>
        )}
      </motion.g>

      {/* SLEEK 3D CERAMIC TORSO + ILLUMINATED REACTOR CORE */}
      <path
        d="M21 33.5 Q21 31 32 31 Q43 31 43 33.5 L42.2 44.5 Q41.5 49 32 49 Q22.5 49 21.8 44.5 Z"
        fill={`url(#${pearlBodyId})`}
        stroke="#94a3b8"
        strokeWidth="0.7"
      />
      <ellipse cx="32" cy="32" rx="7" ry="2.1" fill={`url(#${darkJointId})`} />
      <path d="M23.5 45.2 Q32 47.4 40.5 45.2" fill="none" stroke={`url(#${darkJointId})`} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M24.2 35.2 Q32 36.8 39.8 35.2" fill="none" stroke="var(--pl-robot-accent, #2563eb)" strokeWidth="1.35" opacity="0.85" />
      <circle cx="32" cy="40" r="3.4" fill={`url(#${darkJointId})`} />
      <motion.circle
        cx="32"
        cy="40"
        r="2.2"
        fill={`url(#${coreGlowId})`}
        animate={prefersReducedMotion ? undefined : { opacity: [0.85, 1, 0.85], scale: [0.96, 1.06, 0.96] }}
        transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '32px', originY: '40px' }}
      />
      <ellipse cx="27.5" cy="36.2" rx="3.4" ry="1.6" fill="#ffffff" opacity="0.7" />

      {/* RIGHT ARM */}
      <motion.g
        style={{ originX: '43.5px', originY: '36px' }}
        animate={
          prefersReducedMotion
            ? undefined
            : isAngry
            ? { rotate: [-28, -40, -28], y: [-1, 1, -1] }
            : isEdgeGrab
            ? grabEdge === 'right'
              ? { rotate: [-18, -42, -18] }
              : { rotate: [2, -3, 2] }
            : isPushing
            ? { rotate: [-28, -32, -28], x: [0, -1, 0] }
            : isDance
            ? { rotate: [-42, 12, -42] }
            : isCelebrate || isHop
            ? { rotate: [-42, -58, -42] }
            : isSalute
            ? { rotate: [-54, -50, -54] }
            : isChildPeek
            ? { rotate: [-18, -56, -22, -54, -18], y: [-3, -5, -3] }
            : isPointRight
            ? { rotate: [-4, -10, -4] }
            : isWalking
            ? { rotate: [-20, 20, -20] }
            : isSpiderman
            ? { rotate: [12, 28, 12] }
            : isWaving
            ? { rotate: [-14, -46, -16, -46, -14] }
            : isThumbsUp
            ? { rotate: [-3, 5, -3] }
            : isThinking || isCurious
            ? { rotate: -32 }
            : isSurprised
            ? { rotate: -22 }
            : { rotate: [3, -3, 3] }
        }
        transition={{
          duration: isAngry ? 0.3 : isEdgeGrab ? 1.6 : isPushing ? 0.45 : isWalking ? 0.42 : isChildPeek ? 0.78 : isWaving ? 0.85 : isDance ? 0.68 : isCelebrate || isHop ? 0.65 : isThumbsUp ? 1.25 : 2.3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <circle cx="43.5" cy="36" r="3.4" fill={`url(#${darkJointId})`} />
        <circle cx="43.5" cy="36" r="1.3" fill="var(--pl-robot-accent, #2563eb)" />
        {isPushing ? (
          <>
            <path d="M42.5 36 L11.5 37.5" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M39 36.2 L12.5 37.4" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5.2" strokeLinecap="round" />
            <circle cx="10.2" cy="37.4" r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            {!prefersReducedMotion && (
              <g aria-hidden="true">
                <motion.circle
                  cx="5"
                  cy="35"
                  r="1.4"
                  fill={ledColor}
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.3, 0.7] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
                <motion.circle
                  cx="6.2"
                  cy="39.5"
                  r="1.1"
                  fill="var(--pl-accent-bright, #60a5fa)"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.6, 1.2, 0.6] }}
                  transition={{ duration: 0.55, repeat: Infinity, delay: 0.2 }}
                />
              </g>
            )}
          </>
        ) : isPointRight ? (
          <>
            <path d="M44.5 36 L57.5 33.5" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M48 35.2 L57.5 33.5" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5" strokeLinecap="round" />
            <circle cx="58.5" cy="33.4" r="3.1" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            <rect x="60" y="31.9" width="7.2" height="2.4" rx="1.2" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.5" />
            {!prefersReducedMotion && (
              <motion.circle
                cx="69.5"
                cy="33"
                r="1.9"
                fill={ledColor}
                animate={{ scale: [0.7, 1.35, 0.7], opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 0.85, repeat: Infinity }}
              />
            )}
          </>
        ) : isEdgeGrab && (grabEdge === 'left' || grabEdge === 'top') ? (
          <>
            {/* Right gripping clamp clinging to left/top container rim */}
            <path
              d={grabEdge === 'top' ? 'M44.5 34 Q52 24 50 11' : 'M44.5 35 L59.5 29'}
              fill="none"
              stroke="#1e293b"
              strokeWidth="4.3"
              strokeLinecap="round"
            />
            <path
              d={grabEdge === 'top' ? 'M46.5 33 Q51.5 24 50 11' : 'M47.5 34 L59.5 29'}
              fill="none"
              stroke={`url(#${pearlBodyId})`}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx={grabEdge === 'top' ? 50 : 60.4} cy={grabEdge === 'top' ? 9.5 : 28.6} r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            {grabEdge === 'top' ? (
              <>
                <rect x="46.8" y="4.8" width="1.6" height="3.8" rx="0.8" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="48.8" y="4" width="1.7" height="4.2" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="50.9" y="4.5" width="1.7" height="4" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
              </>
            ) : (
              <>
                <rect x="61.4" y="25.8" width="4.2" height="1.7" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="61.7" y="27.8" width="4.4" height="1.7" rx="0.85" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
                <rect x="61.4" y="29.8" width="4" height="1.6" rx="0.8" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
              </>
            )}
          </>
        ) : isChildPeek ? (
          <>
            {/* Raised Child-Like Waving Arm Reaching High Above Button Edge */}
            <path d="M44.5 34 Q53.5 28 56.5 16.5" fill="none" stroke="#1e293b" strokeWidth="4.2" strokeLinecap="round" />
            <path d="M46.5 33 Q53.5 27.5 56.5 16.5" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="4.9" strokeLinecap="round" />
            <circle cx="57" cy="14.2" r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            <rect x="54.2" y="10.2" width="1.9" height="3.6" rx="0.95" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
            <rect x="56.5" y="9.4" width="1.9" height="4.2" rx="0.95" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
            <rect x="58.7" y="10.5" width="1.8" height="3.4" rx="0.9" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.4" />
            {!prefersReducedMotion && (
              <g aria-hidden="true">
                <motion.path
                  d="M61 9.5 Q64 13 61.5 17"
                  fill="none"
                  stroke={ledColor}
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
                <motion.path
                  d="M64 7.5 Q67.5 12.5 64.5 18.5"
                  fill="none"
                  stroke={ledColor}
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  animate={{ opacity: [0.15, 0.95, 0.15] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.16 }}
                />
              </g>
            )}
          </>
        ) : (
          <>
            <path d="M44.5 37 Q51 40.5 53.8 34.2" fill="none" stroke="#1e293b" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M48 38.8 Q52 39.2 53.8 33.8" fill="none" stroke={`url(#${pearlBodyId})`} strokeWidth="5.2" strokeLinecap="round" />
            <circle cx="54.2" cy="32.2" r="3.4" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.6" />
            {(isThumbsUp || activeExpr === 'wink' || isCelebrate) && (
              <rect x="52.9" y="26.2" width="2.5" height="5" rx="1.25" fill={`url(#${pearlHeadId})`} stroke="#94a3b8" strokeWidth="0.5" />
            )}
            {(isWaving || isSpiderman || isCelebrate || isDance) && !prefersReducedMotion && (
              <g aria-hidden="true">
                <motion.path
                  d="M57.5 25.5 Q60.5 28.5 58.8 32"
                  fill="none"
                  stroke="var(--pl-robot-accent, #2563eb)"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 0.65, repeat: Infinity }}
                />
              </g>
            )}
          </>
        )}
      </motion.g>

      {/* SLEEK 3D HELMET HEAD, TELEMETRY ANTENNA & DIGITAL LED VISOR */}
      <motion.g
        style={{ originX: '32px', originY: '28px' }}
        animate={
          prefersReducedMotion
            ? undefined
            : isPushing
            ? { rotate: [-2, 1, -2] }
            : isWalking
            ? { rotate: [-2.5, 2.5, -2.5] }
            : isCurious
            ? { rotate: [5, 8, 5] }
            : isThinking
            ? { rotate: [2, 4.5, 2] }
            : isCelebrate
            ? { rotate: [-4, 4, -4] }
            : { rotate: 0 }
        }
        transition={{
          duration: isWalking ? 0.42 : isCelebrate ? 0.75 : 2.1,
          repeat: isPushing || isWalking || isCurious || isThinking || isCelebrate ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        {/* Top Micro-Antenna & Beacon Pod */}
        <g aria-hidden="true">
          <rect x="30.8" y="0.8" width="2.4" height="4.2" rx="1.2" fill={`url(#${darkJointId})`} />
          <motion.circle
            cx="32"
            cy="0.6"
            r="2.1"
            fill={ledColor}
            stroke="#ffffff"
            strokeWidth="0.55"
            animate={
              prefersReducedMotion
                ? undefined
                : { scale: isCelebrate || isThinking ? [1, 1.32, 1] : [0.95, 1.15, 0.95], opacity: [0.8, 1, 0.8] }
            }
            transition={{ duration: isThinking ? 0.9 : 1.9, repeat: Infinity, ease: 'easeInOut' }}
            style={{ originX: '32px', originY: '0.6px' }}
          />
        </g>

        {/* Side Audio Pods with Accent LED Ring */}
        <rect x="9.5" y="13.5" width="4.5" height="11" rx="2.25" fill={`url(#${darkJointId})`} />
        <rect x="10.4" y="15.2" width="1.8" height="7.6" rx="0.9" fill={ledColor} />
        <rect x="50" y="13.5" width="4.5" height="11" rx="2.25" fill={`url(#${darkJointId})`} />
        <rect x="51.8" y="15.2" width="1.8" height="7.6" rx="0.9" fill={ledColor} />

        {/* Beveled Rounded-Square Ceramic Helmet */}
        <rect
          x="12.5"
          y="4.5"
          width="39"
          height="27.5"
          rx="13.5"
          fill={`url(#${pearlHeadId})`}
          stroke="#94a3b8"
          strokeWidth="0.7"
        />
        <path
          d="M20 7.2 Q32 5.4 44 7.2"
          fill="none"
          stroke="var(--pl-robot-accent, #2563eb)"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />
        <ellipse cx="25" cy="8.2" rx="7.5" ry="2.2" transform="rotate(-8 25 8.2)" fill="#ffffff" opacity="0.88" />

        {/* Curved Deep Matte-Glass LED Visor (Turns Red Glow When Disturbed!) */}
        <rect
          x="16.2"
          y="10.4"
          width="31.6"
          height="17.8"
          rx="8"
          fill={isAngry ? '#450a0a' : `url(#${visorGlassId})`}
          stroke={isAngry ? '#ef4444' : 'var(--pl-robot-accent, #2563eb)'}
          strokeWidth={isAngry ? 1.5 : 1}
          strokeOpacity={isAngry ? 0.95 : 0.6}
        />
        {isAngry && (
          <rect
            x="17.2"
            y="11.4"
            width="29.6"
            height="15.8"
            rx="7"
            fill="#dc2626"
            opacity="0.34"
          />
        )}
        <path
          d="M20.5 12.6 Q32 11.2 43.5 12.6"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.24"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Subtle Rosy LED Cheeks on Blush / Celebrate / Laugh / Child Peek; Red Flush on Angry */}
        {(isBlush || isCelebrate || isLaughing || isChildPeek || isAngry) && (
          <g aria-hidden="true" opacity={isAngry ? 0.85 : 0.65}>
            <ellipse cx="20.2" cy="21.5" rx="2.2" ry="1.05" fill={isAngry ? '#ef4444' : '#f472b6'} />
            <ellipse cx="43.8" cy="21.5" rx="2.2" ry="1.05" fill={isAngry ? '#ef4444' : '#f472b6'} />
          </g>
        )}

        {/* Angry Steam Puffs Rising From Helmet */}
        {isAngry && !prefersReducedMotion && (
          <g aria-hidden="true">
            <motion.circle
              cx="14"
              cy="4"
              r="2.1"
              fill="#f87171"
              animate={{ y: [0, -7], opacity: [0.9, 0], scale: [0.7, 1.35] }}
              transition={{ duration: 0.75, repeat: Infinity }}
            />
            <motion.circle
              cx="50"
              cy="4"
              r="2.1"
              fill="#ef4444"
              animate={{ y: [0, -7], opacity: [0.9, 0], scale: [0.7, 1.35] }}
              transition={{ duration: 0.75, repeat: Infinity, delay: 0.32 }}
            />
          </g>
        )}

        {/* Thinking Dots */}
        {(isThinking || isCurious) && !prefersReducedMotion && (
          <g aria-hidden="true">
            <motion.circle
              cx="49.5"
              cy="6.2"
              r="1.1"
              fill="var(--pl-robot-accent, #2563eb)"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -1, 0] }}
              transition={{ duration: 1.0, repeat: Infinity }}
            />
            <motion.circle
              cx="53.6"
              cy="3.6"
              r="1.4"
              fill={ledColor}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -1.2, 0] }}
              transition={{ duration: 1.0, repeat: Infinity, delay: 0.2 }}
            />
          </g>
        )}

        {/* Joyful Sparkles / Music Beat on Celebrate / Hop / Dance */}
        {(isCelebrate || isHop || isDance) && !prefersReducedMotion && (
          <g aria-hidden="true">
            <motion.path
              d="M9.5 6.5 L10.3 8.2 L12 9 L10.3 9.8 L9.5 11.5 L8.7 9.8 L7 9 L8.7 8.2 Z"
              fill={ledColor}
              animate={{ scale: [0.7, 1.25, 0.7], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.75, repeat: Infinity }}
              style={{ originX: '9.5px', originY: '9px' }}
            />
            <motion.path
              d="M54.5 6.5 L55.3 8.2 L57 9 L55.3 9.8 L54.5 11.5 L53.7 9.8 L52 9 L53.7 8.2 Z"
              fill="#38bdf8"
              animate={{ scale: [0.7, 1.25, 0.7], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.75, repeat: Infinity, delay: 0.22 }}
              style={{ originX: '54.5px', originY: '9px' }}
            />
          </g>
        )}

        {/* CRISP DIGITAL LED EXPRESSIONS WITH SMOOTH CURSOR EYE-TRACKING */}
        <motion.g
          animate={
            prefersReducedMotion || isPushing || isWalking || isSpiderman || isAngry
              ? { x: 0, y: 0 }
              : { x: eyeGaze.x, y: eyeGaze.y }
          }
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        >
          <AnimatePresence mode="wait">
            {isAngry ? (
              <motion.g
                key="led-angry"
                initial={{ opacity: 0.6, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                {/* Furrowed V-shaped Angry Eyebrows */}
                <path d="M21 13.8 L28.4 16.8" fill="none" stroke="#fecaca" strokeWidth="2.1" strokeLinecap="round" />
                <path d="M43 13.8 L35.6 16.8" fill="none" stroke="#fecaca" strokeWidth="2.1" strokeLinecap="round" />
                {/* Glaring Glowing Red Eyes */}
                <rect x="22.4" y="17.1" width="4.8" height="3.8" rx="1.6" fill="#f87171" />
                <rect x="36.8" y="17.1" width="4.8" height="3.8" rx="1.6" fill="#f87171" />
                <circle cx="24.8" cy="19" r="1.0" fill="#ffffff" />
                <circle cx="39.2" cy="19" r="1.0" fill="#ffffff" />
                {/* Annoyed Grumpy Frown */}
                <path d="M27.8 24.4 Q32 21.4 36.2 24.4" fill="none" stroke="#fca5a5" strokeWidth="1.9" strokeLinecap="round" />
              </motion.g>
            ) : blinkNow && !isHovered && !isSleepy && !isPushing ? (
              <g key="led-blink">
                <line x1="21.8" y1="19" x2="27.8" y2="19" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                <line x1="36.2" y1="19" x2="42.2" y2="19" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                <path d="M29 22.8 Q32 24.4 35 22.8" fill="none" stroke={ledColor} strokeWidth="1.4" strokeLinecap="round" />
              </g>
            ) : isPushing ? (
              <motion.g
                key="led-push"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                <path d="M21.2 14.5 L28 16" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="22.6" y="17.2" width="4.2" height="3.2" rx="1.6" fill={ledColor} />
                <circle cx="25.2" cy="18.2" r="0.85" fill="#ffffff" />
                <path d="M35.8 18.6 Q39.2 15.8 42.4 18.6" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
                <path d="M28.5 23 Q32.5 25.2 35.8 22.4" fill="none" stroke={ledColor} strokeWidth="1.6" strokeLinecap="round" />
              </motion.g>
            ) : isEdgeGrab ? (
              <motion.g
                key="led-edge-grab"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                <rect x="22.4" y="16.2" width="4.6" height="4.8" rx="2.3" fill={ledColor} />
                <rect x="36.6" y="16.2" width="4.6" height="4.8" rx="2.3" fill={ledColor} />
                <circle cx={grabEdge === 'right' ? 23.6 : 25.8} cy="17.8" r="1.1" fill="#ffffff" />
                <circle cx={grabEdge === 'right' ? 37.8 : 40} cy="17.8" r="1.1" fill="#ffffff" />
                <path d="M28.6 23.2 Q32 25.4 35.4 22.8" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
              </motion.g>
            ) : isSpiderman ? (
              <motion.g
                key="led-spiderman"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                <rect x="22.8" y="16.4" width="4.4" height="4.8" rx="2.2" fill={ledColor} />
                <circle cx="25.6" cy="17.8" r="1" fill="#ffffff" />
                <path d="M36 18.8 Q39.2 15.6 42.2 18.8" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
                <path d="M28.4 23 Q32 25.4 35.6 23" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
              </motion.g>
            ) : isPointRight || isPointLeft ? (
              <motion.g
                key="led-point"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                <rect x="22.6" y="16.4" width="4.6" height="4.8" rx="2.3" fill="#ffffff" />
                <rect x="36.8" y="16.4" width="4.6" height="4.8" rx="2.3" fill="#ffffff" />
                <circle cx={isPointRight ? 25.6 : 23.8} cy="18.8" r="1.35" fill="#090d16" />
                <circle cx={isPointRight ? 39.8 : 38} cy="18.8" r="1.35" fill="#090d16" />
                <path d="M28.6 23 Q32 25.2 35.4 23" fill="none" stroke={ledColor} strokeWidth="1.6" strokeLinecap="round" />
              </motion.g>
            ) : activeExpr === 'wave' || activeExpr === 'thumbs-up' || isLaughing || isSalute ? (
              <motion.g
                key="led-happy-arcs"
                initial={{ opacity: 0.5, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.16 }}
              >
                <path
                  d="M21.8 19.6 Q25 15.2 28.2 19.6"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
                <path
                  d="M35.8 19.6 Q39 15.2 42.2 19.6"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
                <path
                  d="M28.6 22.8 Q32 25.4 35.4 22.8"
                  fill="none"
                  stroke={ledColor}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </motion.g>
            ) : activeExpr === 'wink' ? (
              <motion.g
                key="led-wink"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.16 }}
              >
                <rect x="22.8" y="16.2" width="4.6" height="5" rx="2.3" fill={ledColor} />
                <circle cx="25.6" cy="17.6" r="1" fill="#ffffff" />
                <path d="M36 18.4 Q39.2 16 42.2 18.4" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
                <path d="M28.6 23 Q32.5 25.3 35.8 22.4" fill="none" stroke="#ffffff" strokeWidth="1.55" strokeLinecap="round" />
              </motion.g>
            ) : isThinking || isCurious ? (
              <motion.g
                key="led-thinking"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.16 }}
              >
                <path d="M22.2 14.8 H27.2" fill="none" stroke={ledColor} strokeWidth="1.3" strokeLinecap="round" />
                <path d="M36.5 14.2 Q39.4 12.6 42.2 14" fill="none" stroke={ledColor} strokeWidth="1.3" strokeLinecap="round" />
                <rect x="22.8" y="16.8" width="4.2" height="4" rx="2" fill="#ffffff" />
                <rect x="37" y="16.8" width="4.2" height="4" rx="2" fill="#ffffff" />
                <circle cx="25.5" cy="18" r="1" fill="#090d16" />
                <circle cx="39.7" cy="18" r="1" fill="#090d16" />
                <line x1="29.4" y1="23.4" x2="34.6" y2="23.4" stroke={ledColor} strokeWidth="1.45" strokeLinecap="round" />
              </motion.g>
            ) : isSurprised ? (
              <motion.g
                key="led-surprised"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.14 }}
              >
                <circle cx="25" cy="18.4" r="2.7" fill={ledColor} />
                <circle cx="39" cy="18.4" r="2.7" fill={ledColor} />
                <circle cx="25" cy="18.4" r="1.15" fill="#ffffff" />
                <circle cx="39" cy="18.4" r="1.15" fill="#ffffff" />
                <ellipse cx="32" cy="23.6" rx="1.4" ry="1.8" fill="none" stroke="#ffffff" strokeWidth="1.4" />
              </motion.g>
            ) : isSleepy ? (
              <motion.g
                key="led-sleepy"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.18 }}
              >
                <path d="M22.2 18.4 Q25 20.2 27.8 18.4" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M36.2 18.4 Q39 20.2 41.8 18.4" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="29.8" y1="23.2" x2="34.2" y2="23.2" stroke={ledColor} strokeWidth="1.35" strokeLinecap="round" />
              </motion.g>
            ) : activeExpr === 'sparkle' || isCelebrate ? (
              <motion.g
                key="led-sparkle"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.16 }}
              >
                <path
                  d="M25 15.2 L26 17.5 L28.3 18.5 L26 19.5 L25 21.8 L24 19.5 L21.7 18.5 L24 17.5 Z"
                  fill={ledColor}
                />
                <path
                  d="M39 15.2 L40 17.5 L42.3 18.5 L40 19.5 L39 21.8 L38 19.5 L35.7 18.5 L38 17.5 Z"
                  fill={ledColor}
                />
                <path d="M28.4 22.8 Q32 25.8 35.6 22.8" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
              </motion.g>
            ) : (
              <motion.g
                key="led-friendly-default"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.16 }}
              >
                <rect x="22.8" y="16" width="4.4" height="5.2" rx="2.2" fill={ledColor} />
                <rect x="36.8" y="16" width="4.4" height="5.2" rx="2.2" fill={ledColor} />
                <motion.g
                  animate={
                    prefersReducedMotion || isWalking || isBlush
                      ? undefined
                      : { x: [-0.7, 0.7, 0] }
                  }
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <circle cx="25.6" cy="17.4" r="1" fill="#ffffff" />
                  <circle cx="39.6" cy="17.4" r="1" fill="#ffffff" />
                </motion.g>
                <path d="M28.6 23 Q32 25.2 35.4 23" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
              </motion.g>
            )}
          </AnimatePresence>
        </motion.g>
      </motion.g>
    </motion.svg>
  );

  const animatedContainerProps = {
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 },
    animate: prefersReducedMotion
      ? { opacity: 1 }
      : isSpiderman
      ? {
          opacity: 1,
          y: [0, 2, 0],
          scale: 1,
          rotate: [177, 183, 177],
        }
      : isPushing
      ? {
          opacity: 1,
          x: [0, -1.5, 0],
          y: [0, -1, 0],
          scale: 1,
          rotate: bodyTilt,
        }
      : isWalking
      ? {
          opacity: duckBehind ? 0.94 : 1,
          y: [0, -2.2, 0, -2.2, 0],
          scale: duckBehind ? 0.94 : 1,
          rotate: [-2.5, 2.5, -2.5],
        }
      : isCelebrate || isHop
      ? {
          opacity: 1,
          y: [0, -4, 0],
          scale: [1, 1.06, 1],
          rotate: [-4, 4, -4],
        }
      : isChildPeek
      ? {
          opacity: 0.99,
          y: [2.5, -2.5, 2.5],
          scale: 0.95,
          rotate: [-8, 5, -7],
        }
      : {
          opacity: 1,
          y: isSurprised ? -2 : duckBehind ? 5 : isHovered ? -1.5 : 0,
          scale: isHovered ? 1.06 : 1,
          rotate: bodyTilt,
        },
    exit: prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.8, transition: { duration: 0.14 } },
    transition: isSpiderman
      ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' as const }
      : isPushing
      ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' as const }
      : isWalking
      ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' as const }
      : isChildPeek
      ? { duration: 1.85, repeat: Infinity, ease: 'easeInOut' as const }
      : isCelebrate || isHop
      ? { duration: 0.72, repeat: Infinity, ease: 'easeInOut' as const }
      : { type: 'spring' as const, stiffness: 260, damping: 22 },
  };

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex items-center select-none ${
        isPerch ? 'pointer-events-auto' : 'shrink-0'
      }`}
    >
      {/* Spider-Man Web Rope Anchored Upward */}
      {isSpiderman && ropeLength > 0 && (
        <motion.div
          aria-hidden="true"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          exit={{ scaleY: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          style={{
            height: `${ropeLength}px`,
            bottom: '84%',
            transformOrigin: 'top center',
          }}
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-[3px] flex flex-col items-center z-0"
        >
          <span
            className="w-2.5 h-2.5 -mt-1 rounded-full border border-white/80 shrink-0"
            style={{ backgroundColor: 'var(--pl-robot-accent, #2563eb)' }}
          />
          <span
            className="w-[2px] flex-1 rounded-full"
            style={{
              background:
                'repeating-linear-gradient(180deg, #ffffff 0px, #ffffff 4px, var(--pl-robot-accent, #2563eb) 4px, var(--pl-robot-accent, #2563eb) 7px)',
            }}
          />
        </motion.div>
      )}

      {/* Interactive Popup Speech Callout + Optional Functional Quick-Action Shortcuts */}
      <AnimatePresence>
        {(activePopup || visibleQuickActions) && (!duckBehind || Boolean(clickSpeechOverride) || isAngryPopup) && (
          <motion.div
            key={`robot-msg-${activePopup?.text || 'actions'}`}
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.94, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              borderColor: isAngryPopup
                ? '#ef4444'
                : 'color-mix(in srgb, var(--pl-accent, #2563eb) 72%, transparent)',
              boxShadow: isAngryPopup
                ? '0 12px 28px -6px rgba(220, 38, 38, 0.38), 0 0 16px rgba(239, 68, 68, 0.28)'
                : '0 12px 28px -6px rgba(15, 23, 42, 0.28), 0 0 14px rgba(var(--pl-accent-rgb), 0.22)',
            }}
            className={`absolute z-50 px-2.5 py-1.5 rounded-xl backdrop-blur-xl border text-[11px] font-bold whitespace-nowrap leading-tight ${
              isAngryPopup
                ? 'bg-red-50/95 dark:bg-red-950/95 text-red-700 dark:text-red-100'
                : 'bg-[var(--pl-surface)]/95 text-zinc-900 dark:text-white'
            } ${popupPositionClasses}`}
          >
            {activePopup && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPopupClick) {
                    onPopupClick();
                  } else if (activePopup.isFeedback && onFeedbackClick) {
                    onFeedbackClick();
                  } else {
                    handleRobotClick();
                  }
                }}
                className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90"
              >
                <span>{activePopup.text}</span>
                {activePopup.actionLabel && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold"
                    style={{
                      backgroundColor: 'var(--pl-cta-via, #1d4ed8)',
                      color: 'var(--pl-cta-text, #ffffff)',
                    }}
                  >
                    {activePopup.actionLabel}
                  </span>
                )}
                {activePopup.isFeedback && onFeedbackClick && !activePopup.actionLabel && (
                  <span
                    className="underline font-extrabold"
                    style={{ color: 'var(--pl-accent-text, #1d4ed8)' }}
                  >
                    Tell us
                  </span>
                )}
              </button>
            )}

            {visibleQuickActions && visibleQuickActions.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 dark:border-zinc-700/80 flex items-center gap-1">
                {visibleQuickActions.map((qa) => (
                  <button
                    key={qa.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      qa.onClick();
                    }}
                    className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 hover:border-[var(--pl-accent)] text-[10px] font-bold text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!isLoader ? (
        <motion.button
          type="button"
          onClick={handleRobotClick}
          aria-label={title}
          title={title}
          {...animatedContainerProps}
          className={interactiveWrapperClass}
        >
          {robotSvg}
        </motion.button>
      ) : (
        <motion.div aria-hidden="true" {...animatedContainerProps} className={interactiveWrapperClass}>
          {robotSvg}
        </motion.div>
      )}
    </div>
  );
};
