import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export type RobotExpression =
  | 'wave'
  | 'happy'
  | 'glance'
  | 'thinking'
  | 'wink'
  | 'laugh'
  | 'blush'
  | 'surprised'
  | 'sleepy'
  | 'sparkle';

const EXPRESSION_SEQUENCE: RobotExpression[] = [
  'wave',
  'happy',
  'glance',
  'thinking',
  'wink',
  'laugh',
  'blush',
  'surprised',
  'sparkle',
  'sleepy',
];

interface MiniAiRobotProps {
  isHovered?: boolean;
  onClick?: () => void;
  title?: string;
}

export const MiniAiRobot: React.FC<MiniAiRobotProps> = ({
  isHovered = false,
  onClick,
  title = 'Open PaperLink AI',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [exprIndex, setExprIndex] = useState(0);
  const [blinkNow, setBlinkNow] = useState(false);

  // Cycle through expressive human-like moods
  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = window.setInterval(() => {
      setExprIndex((prev) => (prev + 1) % EXPRESSION_SEQUENCE.length);
    }, 3100);
    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  // Natural rhythmic blinking (with occasional gentle double-blink)
  useEffect(() => {
    if (prefersReducedMotion) return;
    let blinkTimeout: number | undefined;
    let doubleBlinkTimeout: number | undefined;
    let count = 0;

    const blinkTimer = window.setInterval(() => {
      count += 1;
      setBlinkNow(true);
      blinkTimeout = window.setTimeout(() => {
        setBlinkNow(false);
        if (count % 3 === 0) {
          doubleBlinkTimeout = window.setTimeout(() => {
            setBlinkNow(true);
            blinkTimeout = window.setTimeout(() => setBlinkNow(false), 120);
          }, 170);
        }
      }, 135);
    }, 3800);

    return () => {
      window.clearInterval(blinkTimer);
      if (blinkTimeout) window.clearTimeout(blinkTimeout);
      if (doubleBlinkTimeout) window.clearTimeout(doubleBlinkTimeout);
    };
  }, [prefersReducedMotion]);

  const activeExpr: RobotExpression = isHovered
    ? 'wave'
    : EXPRESSION_SEQUENCE[exprIndex];

  const isWaving = activeExpr === 'wave' || activeExpr === 'happy' || isHovered;
  const isThinking = activeExpr === 'thinking';
  const isSleepy = activeExpr === 'sleepy';
  const isLaughing = activeExpr === 'laugh';

  const headTilt = isHovered
    ? -3
    : activeExpr === 'thinking'
    ? 8
    : activeExpr === 'glance'
    ? -6
    : activeExpr === 'wink'
    ? 5
    : activeExpr === 'blush'
    ? -5
    : activeExpr === 'sleepy'
    ? 6
    : 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.72 }}
      animate={
        prefersReducedMotion
          ? { opacity: 1 }
          : {
              opacity: 1,
              x: isHovered ? 2 : 0,
              y: isHovered ? -1.5 : activeExpr === 'surprised' ? -1.5 : 0,
              scale: isHovered ? 1.08 : activeExpr === 'surprised' ? 1.04 : 1,
              rotate: headTilt,
            }
      }
      exit={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, x: -14, scale: 0.75, transition: { duration: 0.14 } }
      }
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative -ml-2.5 pl-1 pr-0.5 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded-full select-none shrink-0"
    >
      <motion.svg
        viewBox="0 0 42 40"
        className="w-9 h-8.5 overflow-visible drop-shadow-[0_3px_8px_rgba(250,204,21,0.22)]"
        animate={
          prefersReducedMotion
            ? undefined
            : isLaughing
            ? { y: [0, -2.2, 0.4, -2.2, 0] }
            : activeExpr === 'sparkle'
            ? { y: [0, -2.4, 0, -1.4, 0] }
            : isSleepy
            ? { y: [0, 1.1, 0] }
            : { y: [0, -1.1, 0] }
        }
        transition={{
          duration: isLaughing ? 0.65 : activeExpr === 'sparkle' ? 0.9 : isSleepy ? 3.2 : 2.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <defs>
          <linearGradient id="miniBotBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>
          <linearGradient id="miniBotGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>
        </defs>

        {/* Antenna Stem + Mood-Responsive Beacon */}
        <motion.g
          style={{ originX: '19px', originY: '11px' }}
          animate={
            prefersReducedMotion
              ? undefined
              : isWaving
              ? { rotate: [-6, 8, -5, 6, 0] }
              : isSleepy
              ? { rotate: [0, 7, 4] }
              : { rotate: [-2, 3, -2] }
          }
          transition={{ duration: isWaving ? 1.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <line
            x1="19"
            y1="10.5"
            x2="19"
            y2="4.5"
            stroke="#facc15"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <motion.circle
            cx="19"
            cy="3.5"
            r="2.4"
            fill="url(#miniBotGold)"
            animate={
              prefersReducedMotion
                ? undefined
                : isThinking
                ? { opacity: [0.45, 1, 0.45], scale: [0.88, 1.25, 0.88] }
                : { opacity: [0.8, 1, 0.8], scale: [0.92, 1.14, 0.92] }
            }
            transition={{ duration: isThinking ? 1.0 : 1.7, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.g>

        {/* Tiny Floating Human Thought Dots when Thinking */}
        {isThinking && !prefersReducedMotion && (
          <g aria-hidden="true">
            <motion.circle
              cx="30"
              cy="6.5"
              r="0.9"
              fill="#fde047"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -1, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: 0 }}
            />
            <motion.circle
              cx="33.5"
              cy="4.3"
              r="1.1"
              fill="#fde047"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -1.2, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.circle
              cx="37.2"
              cy="2.2"
              r="1.35"
              fill="#fef08a"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -1.5, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: 0.4 }}
            />
          </g>
        )}

        {/* Tiny Shoulder / Torso Base (Tucked behind the pill edge on left) */}
        <rect
          x="10"
          y="29"
          width="18"
          height="8"
          rx="4"
          fill="url(#miniBotBodyGrad)"
          stroke="#facc15"
          strokeWidth="1.2"
        />
        <rect x="15.5" y="31.5" width="7" height="2" rx="1" fill="#facc15" opacity="0.85" />

        {/* Articulated Arm (Waves on greeting, scratches chin/raises when thinking, relaxed otherwise) */}
        <motion.g
          style={{ originX: '28px', originY: '30px' }}
          animate={
            prefersReducedMotion
              ? { rotate: 18 }
              : isWaving
              ? { rotate: [-14, -48, -18, -48, -14] }
              : isThinking
              ? { rotate: [-28, -34, -28] }
              : activeExpr === 'surprised'
              ? { rotate: [-38, -44, -38] }
              : { rotate: [-4, 6, -4] }
          }
          transition={{
            duration: isWaving ? 0.92 : isThinking ? 1.8 : 2.6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <path
            d="M27.5 30.5 Q33.5 29.5 35.5 23.5"
            fill="none"
            stroke="#27272a"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d="M27.5 30.5 Q33.5 29.5 35.5 23.5"
            fill="none"
            stroke="#facc15"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="36" cy="22.5" r="2.7" fill="url(#miniBotGold)" stroke="#18181b" strokeWidth="0.9" />
          {isWaving && !prefersReducedMotion && (
            <motion.path
              d="M38.5 18.2 Q40.6 20 39.6 22.4"
              fill="none"
              stroke="#facc15"
              strokeWidth="1.25"
              strokeLinecap="round"
              animate={{ opacity: [0.15, 0.95, 0.15] }}
              transition={{ duration: 0.75, repeat: Infinity }}
            />
          )}
        </motion.g>

        {/* Left & Right Ear Nodes */}
        <rect x="4.5" y="16" width="3" height="7.5" rx="1.5" fill="#facc15" />
        <rect x="30.5" y="16" width="3" height="7.5" rx="1.5" fill="#facc15" />

        {/* Rounded Robot Head Chassis */}
        <rect
          x="6.5"
          y="10"
          width="25"
          height="19.5"
          rx="7"
          fill="url(#miniBotBodyGrad)"
          stroke="#facc15"
          strokeWidth="1.5"
        />

        {/* Deep Obsidian Visor Screen */}
        <rect x="9.5" y="13" width="19" height="13.5" rx="4.5" fill="#09090b" />

        {/* Top subtle glass gleam on visor */}
        <path
          d="M12 14.4 H24.5"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* Expressive Human-Like Eyes, Eyebrows, Cheeks & Mouth */}
        <AnimatePresence mode="wait">
          {blinkNow && !isHovered && !isLaughing && !isSleepy ? (
            <g key="eyes-blink">
              <line x1="12.5" y1="18.8" x2="16.5" y2="18.8" stroke="#facc15" strokeWidth="1.7" strokeLinecap="round" />
              <line x1="21.5" y1="18.8" x2="25.5" y2="18.8" stroke="#facc15" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M16.5 22.6 Q19 24.3 21.5 22.6" fill="none" stroke="#facc15" strokeWidth="1.4" strokeLinecap="round" />
            </g>
          ) : activeExpr === 'wave' ? (
            <motion.g
              key="eyes-wave"
              initial={{ opacity: 0.4, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Soft happy eyebrows */}
              <path d="M12.3 15.8 Q14.5 14.8 16.5 15.8" fill="none" stroke="#facc15" strokeWidth="1" strokeLinecap="round" opacity="0.85" />
              <path d="M21.5 15.8 Q23.5 14.8 25.7 15.8" fill="none" stroke="#facc15" strokeWidth="1" strokeLinecap="round" opacity="0.85" />
              {/* Warm arched smiling eyes */}
              <path d="M12.4 19.4 Q14.5 16.5 16.6 19.4" fill="none" stroke="#fde047" strokeWidth="1.85" strokeLinecap="round" />
              <path d="M21.4 19.4 Q23.5 16.5 25.6 19.4" fill="none" stroke="#fde047" strokeWidth="1.85" strokeLinecap="round" />
              {/* Warm smile */}
              <path d="M15.8 22.1 Q19 25.1 22.2 22.1" fill="none" stroke="#facc15" strokeWidth="1.65" strokeLinecap="round" />
              {/* Rosy coral-amber cheeks */}
              <ellipse cx="12.2" cy="21.4" rx="1.4" ry="0.9" fill="#fb7185" opacity="0.55" />
              <ellipse cx="25.8" cy="21.4" rx="1.4" ry="0.9" fill="#fb7185" opacity="0.55" />
            </motion.g>
          ) : activeExpr === 'happy' ? (
            <motion.g
              key="eyes-happy"
              initial={{ opacity: 0.4, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Bright soulful eyes with dual catchlights */}
              <circle cx="14.5" cy="18.2" r="2.05" fill="#fde047" />
              <circle cx="23.5" cy="18.2" r="2.05" fill="#fde047" />
              <circle cx="15.2" cy="17.4" r="0.7" fill="#ffffff" />
              <circle cx="24.2" cy="17.4" r="0.7" fill="#ffffff" />
              <circle cx="13.8" cy="19" r="0.35" fill="#ffffff" opacity="0.85" />
              <circle cx="22.8" cy="19" r="0.35" fill="#ffffff" opacity="0.85" />
              {/* Beaming open grin */}
              <path d="M15.6 21.8 H22.4 Q19 25.4 15.6 21.8 Z" fill="#facc15" stroke="#facc15" strokeWidth="0.9" strokeLinejoin="round" />
              <ellipse cx="12.1" cy="21.2" rx="1.35" ry="0.85" fill="#fb7185" opacity="0.5" />
              <ellipse cx="25.9" cy="21.2" rx="1.35" ry="0.85" fill="#fb7185" opacity="0.5" />
            </motion.g>
          ) : activeExpr === 'glance' ? (
            <motion.g
              key="eyes-glance"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Eyebrows slightly expressive */}
              <path d="M12.3 15.8 L16.4 15.3" fill="none" stroke="#facc15" strokeWidth="1.05" strokeLinecap="round" opacity="0.9" />
              <path d="M21.6 15.3 L25.7 15.8" fill="none" stroke="#facc15" strokeWidth="1.05" strokeLinecap="round" opacity="0.9" />
              {/* Eye sockets + glancing pupils moving left & right like a curious person */}
              <ellipse cx="14.5" cy="18.5" rx="2.1" ry="2.2" fill="#fef08a" />
              <ellipse cx="23.5" cy="18.5" rx="2.1" ry="2.2" fill="#fef08a" />
              <motion.g
                animate={
                  prefersReducedMotion
                    ? undefined
                    : { x: [-0.9, -0.9, 0.9, 0.9, 0] }
                }
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <circle cx="14.5" cy="18.6" r="1.05" fill="#09090b" />
                <circle cx="23.5" cy="18.6" r="1.05" fill="#09090b" />
                <circle cx="14.9" cy="18.1" r="0.4" fill="#ffffff" />
                <circle cx="23.9" cy="18.1" r="0.4" fill="#ffffff" />
              </motion.g>
              {/* Relaxed observant smile */}
              <path d="M16.4 22.8 Q19.2 24 21.8 22.4" fill="none" stroke="#facc15" strokeWidth="1.45" strokeLinecap="round" />
            </motion.g>
          ) : activeExpr === 'thinking' ? (
            <motion.g
              key="eyes-thinking"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* One raised pondering eyebrow, one level */}
              <path d="M12.3 15.8 H16.3" fill="none" stroke="#facc15" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M21.5 15.3 Q23.6 13.8 25.8 14.9" fill="none" stroke="#fde047" strokeWidth="1.2" strokeLinecap="round" />
              {/* Eyes looking upward-right thoughtfully */}
              <ellipse cx="14.5" cy="18.5" rx="2" ry="2.1" fill="#fef08a" />
              <ellipse cx="23.5" cy="18.5" rx="2" ry="2.1" fill="#fef08a" />
              <circle cx="15.2" cy="17.6" r="0.95" fill="#09090b" />
              <circle cx="24.2" cy="17.6" r="0.95" fill="#09090b" />
              <circle cx="15.5" cy="17.2" r="0.35" fill="#ffffff" />
              <circle cx="24.5" cy="17.2" r="0.35" fill="#ffffff" />
              {/* Tiny tilted pondering mouth */}
              <path d="M16.5 23.1 Q19 22.2 21.3 23.2" fill="none" stroke="#facc15" strokeWidth="1.45" strokeLinecap="round" />
            </motion.g>
          ) : activeExpr === 'wink' ? (
            <motion.g
              key="eyes-wink"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Raised eyebrow over open eye */}
              <path d="M12.3 15.4 Q14.5 14.1 16.7 15.4" fill="none" stroke="#facc15" strokeWidth="1.1" strokeLinecap="round" />
              {/* Left glowing LED eye with catchlight */}
              <circle cx="14.5" cy="18.6" r="2.05" fill="#fde047" />
              <circle cx="15.2" cy="17.9" r="0.7" fill="#ffffff" />
              {/* Right cheeky human wink arc */}
              <path
                d="M21.4 17.7 Q23.6 19.2 25.6 17.9"
                fill="none"
                stroke="#fde047"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              {/* Playful side smirk */}
              <path d="M16.2 22.4 Q19.5 24.8 22.5 21.8" fill="none" stroke="#facc15" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="25.6" cy="21" rx="1.25" ry="0.8" fill="#fb7185" opacity="0.5" />
            </motion.g>
          ) : activeExpr === 'laugh' ? (
            <motion.g
              key="eyes-laugh"
              initial={{ opacity: 0.4, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.15 }}
            >
              {/* Squinted > < laughing eyes */}
              <path d="M12.2 17 L15.8 18.5 L12.2 20" fill="none" stroke="#fef08a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M25.8 17 L22.2 18.5 L25.8 20" fill="none" stroke="#fef08a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              {/* Wide happy laughing open mouth */}
              <path d="M15 21.4 H23 Q19 26 15 21.4 Z" fill="#facc15" stroke="#fde047" strokeWidth="0.9" strokeLinejoin="round" />
              <ellipse cx="11.9" cy="21.5" rx="1.45" ry="0.9" fill="#fb7185" opacity="0.68" />
              <ellipse cx="26.1" cy="21.5" rx="1.45" ry="0.9" fill="#fb7185" opacity="0.68" />
            </motion.g>
          ) : activeExpr === 'blush' ? (
            <motion.g
              key="eyes-blush"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Soft shy angled brows */}
              <path d="M12.2 15.8 L16.2 15.1" fill="none" stroke="#facc15" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
              <path d="M25.8 15.8 L21.8 15.1" fill="none" stroke="#facc15" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
              {/* Big tender oval eyes looking slightly inward */}
              <ellipse cx="14.7" cy="18.6" rx="1.85" ry="2.2" fill="#fde047" />
              <ellipse cx="23.3" cy="18.6" rx="1.85" ry="2.2" fill="#fde047" />
              <circle cx="15.3" cy="17.8" r="0.7" fill="#ffffff" />
              <circle cx="22.7" cy="17.8" r="0.7" fill="#ffffff" />
              {/* Warm rosy glowing cheeks */}
              <ellipse cx="12" cy="21.5" rx="1.85" ry="1.1" fill="#fb7185" opacity="0.75" />
              <ellipse cx="26" cy="21.5" rx="1.85" ry="1.1" fill="#fb7185" opacity="0.75" />
              {/* Sweet shy smile */}
              <path d="M16.5 22.3 Q17.8 23.7 19 22.5 Q20.2 23.7 21.5 22.3" fill="none" stroke="#facc15" strokeWidth="1.4" strokeLinecap="round" />
            </motion.g>
          ) : activeExpr === 'surprised' ? (
            <motion.g
              key="eyes-surprised"
              initial={{ opacity: 0.4, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.14 }}
            >
              {/* High raised brows */}
              <path d="M12.2 15.2 Q14.5 13.7 16.8 15.2" fill="none" stroke="#fde047" strokeWidth="1.15" strokeLinecap="round" />
              <path d="M21.2 15.2 Q23.5 13.7 25.8 15.2" fill="none" stroke="#fde047" strokeWidth="1.15" strokeLinecap="round" />
              {/* Wide surprised eyes with bright highlights */}
              <circle cx="14.5" cy="18.4" r="2.3" fill="#fef08a" />
              <circle cx="23.5" cy="18.4" r="2.3" fill="#fef08a" />
              <circle cx="14.5" cy="18.5" r="0.95" fill="#09090b" />
              <circle cx="23.5" cy="18.5" r="0.95" fill="#09090b" />
              <circle cx="15.1" cy="17.7" r="0.5" fill="#ffffff" />
              <circle cx="24.1" cy="17.7" r="0.5" fill="#ffffff" />
              {/* Little 'o' mouth */}
              <ellipse cx="19" cy="23" rx="1.25" ry="1.5" fill="none" stroke="#facc15" strokeWidth="1.5" />
            </motion.g>
          ) : activeExpr === 'sleepy' ? (
            <motion.g
              key="eyes-sleepy"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.18 }}
            >
              {/* Half-lidded cozy drowsy eyes */}
              <path d="M12.2 18.2 H16.8" fill="none" stroke="#fde047" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M21.2 18.2 H25.8" fill="none" stroke="#fde047" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12.6 18.3 A1.9 1.7 0 0 0 16.4 18.3 Z" fill="#facc15" opacity="0.85" />
              <path d="M21.6 18.3 A1.9 1.7 0 0 0 25.4 18.3 Z" fill="#facc15" opacity="0.85" />
              {/* Gentle micro-yawn mouth */}
              <motion.ellipse
                cx="19"
                cy="22.8"
                rx="1.2"
                ry="1.3"
                fill="#09090b"
                stroke="#facc15"
                strokeWidth="1.35"
                animate={prefersReducedMotion ? undefined : { ry: [0.8, 1.7, 0.8], rx: [0.9, 1.35, 0.9] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.g>
          ) : (
            <motion.g
              key="eyes-sparkle"
              initial={{ opacity: 0.4, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.16 }}
            >
              {/* Twin Star Eyes */}
              <path
                d="M14.5 16.1 L15.3 17.9 L17.1 18.6 L15.3 19.3 L14.5 21.1 L13.7 19.3 L11.9 18.6 L13.7 17.9 Z"
                fill="#fef08a"
              />
              <path
                d="M23.5 16.1 L24.3 17.9 L26.1 18.6 L24.3 19.3 L23.5 21.1 L22.7 19.3 L20.9 18.6 L22.7 17.9 Z"
                fill="#fef08a"
              />
              <path d="M16.2 22.5 Q19 25.1 21.8 22.5" fill="none" stroke="#facc15" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="12.1" cy="21.4" rx="1.25" ry="0.8" fill="#fb7185" opacity="0.5" />
              <ellipse cx="25.9" cy="21.4" rx="1.25" ry="0.8" fill="#fb7185" opacity="0.5" />
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>
    </motion.button>
  );
};
