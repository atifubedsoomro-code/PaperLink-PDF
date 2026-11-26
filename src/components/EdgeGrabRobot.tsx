import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { MiniAiRobot, RobotPromptItem, RobotQuickAction } from './MiniAiRobot';

interface EdgeGrabRobotProps {
  /** Outer Document Preview container whose edges/resize the robot clamps onto */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Optional inner scrollable element (e.g. grid viewport or modal body) */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Edge to grab ('right' or 'left' or 'top') */
  edge?: 'right' | 'left' | 'top';
  /** Functional preview actions shown on hover */
  quickActions?: RobotQuickAction[];
  /** Custom hover callout text */
  idleTip?: string;
  /** Optional click callback passed to popup CTA */
  onAction?: () => void;
  className?: string;
}

export const EdgeGrabRobot: React.FC<EdgeGrabRobotProps> = ({
  containerRef,
  scrollRef,
  edge = 'right',
  quickActions,
  idleTip = 'Holding preview frame steady!',
  onAction,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const [isHoldingHard, setIsHoldingHard] = useState(false);
  const [transientMsg, setTransientMsg] = useState<string | null>(null);

  // Spring physics values driven by real scroll velocity & ResizeObserver container deltas
  const rawLagY = useMotionValue(0);
  const rawLagX = useMotionValue(0);
  const rawSwingDeg = useMotionValue(0);
  const rawAnchorOffset = useMotionValue(0);

  const springY = useSpring(rawLagY, { stiffness: 155, damping: 13, mass: 1.15 });
  const springX = useSpring(rawLagX, { stiffness: 170, damping: 14, mass: 1.05 });
  const springRotate = useSpring(rawSwingDeg, { stiffness: 165, damping: 11, mass: 1.0 });
  const springAnchor = useSpring(rawAnchorOffset, { stiffness: 110, damping: 18, mass: 0.9 });

  const settleTimerRef = useRef<number | null>(null);
  const msgTimerRef = useRef<number | null>(null);
  const lastHintAtRef = useRef<number>(0);

  const triggerPhysicsImpulse = (vx: number, vy: number, reason: 'scroll' | 'resize') => {
    if (prefersReducedMotion) return;

    const clampedY = Math.max(-20, Math.min(20, vy));
    const clampedX = Math.max(-14, Math.min(14, vx));

    rawLagY.set(clampedY);
    rawLagX.set(clampedX);
    rawSwingDeg.set(
      edge === 'top'
        ? Math.max(-18, Math.min(18, vx * 1.1))
        : Math.max(-18, Math.min(18, -clampedY * 0.9 + clampedX * 0.5))
    );

    if (Math.abs(vy) > 6 || Math.abs(vx) > 6) {
      setIsHoldingHard(true);
    }

    // Subtle non-spammy brace message ONLY on notable resize/fast scroll with 14s cooldown
    const now = Date.now();
    if (
      reason === 'resize' &&
      (Math.abs(vx) >= 9 || Math.abs(vy) >= 9) &&
      now - lastHintAtRef.current > 14000
    ) {
      lastHintAtRef.current = now;
      setTransientMsg('Resizing… holding tight!');
      if (msgTimerRef.current) window.clearTimeout(msgTimerRef.current);
      msgTimerRef.current = window.setTimeout(() => setTransientMsg(null), 1900);
    }

    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      rawLagY.set(0);
      rawLagX.set(0);
      rawSwingDeg.set(0);
      setIsHoldingHard(false);
    }, 115);
  };

  // Track inner container scroll AND window scroll to drive vertical hold & pendulum sway
  useEffect(() => {
    if (prefersReducedMotion) return;

    let prevWinY = window.scrollY;
    let prevInnerY = scrollRef?.current?.scrollTop ?? 0;

    const handleWindowScroll = () => {
      const nextY = window.scrollY;
      const dy = nextY - prevWinY;
      prevWinY = nextY;

      // Gently slide along the vertical edge (bounded +/- 36px) while lagging behind velocity
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const maxTravel = Math.max(12, Math.min(44, rect.height * 0.14));
        const ratio = Math.max(-1, Math.min(1, (rect.top - 96) / 360));
        rawAnchorOffset.set(-ratio * maxTravel);
      }

      triggerPhysicsImpulse(edge === 'right' ? 2.5 : -2.5, dy * 0.65, 'scroll');
    };

    const handleInnerScroll = () => {
      const target = scrollRef?.current;
      if (!target) return;
      const nextY = target.scrollTop;
      const dy = nextY - prevInnerY;
      prevInnerY = nextY;

      const maxScroll = Math.max(1, target.scrollHeight - target.clientHeight);
      const frac = target.scrollTop / maxScroll;
      rawAnchorOffset.set((frac - 0.5) * 56);
      triggerPhysicsImpulse(edge === 'right' ? 2 : -2, -dy * 0.65, 'scroll');
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    const innerEl = scrollRef?.current;
    if (innerEl) {
      innerEl.addEventListener('scroll', handleInnerScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      if (innerEl) {
        innerEl.removeEventListener('scroll', handleInnerScroll);
      }
    };
  }, [containerRef, scrollRef, edge, prefersReducedMotion]);

  // Track container & workspace resizes via ResizeObserver so the robot clings smoothly to moving edges
  useEffect(() => {
    if (prefersReducedMotion) return;
    const target = containerRef.current;
    if (!target) return;

    let lastW = target.getBoundingClientRect().width;
    let lastH = target.getBoundingClientRect().height;
    let initialized = false;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (!initialized) {
        initialized = true;
        lastW = width;
        lastH = height;
        return;
      }

      const dw = width - lastW;
      const dh = height - lastH;
      lastW = width;
      lastH = height;

      if (Math.abs(dw) < 1.5 && Math.abs(dh) < 1.5) return;
      triggerPhysicsImpulse(-dw * 0.35, -dh * 0.35, 'resize');
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [containerRef, edge, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (msgTimerRef.current) window.clearTimeout(msgTimerRef.current);
    };
  }, []);

  const activePopup: RobotPromptItem | null = transientMsg
    ? { text: transientMsg }
    : isHovered
    ? { text: idleTip }
    : null;

  const anchorPositionClasses =
    edge === 'left'
      ? 'left-0 top-1/2 -translate-x-[58%] -translate-y-1/2'
      : edge === 'top'
      ? 'top-0 left-1/2 -translate-x-1/2 -translate-y-[42%]'
      : 'right-0 top-1/2 translate-x-[58%] -translate-y-1/2';

  const popupPlacement =
    edge === 'left' ? 'side-right' : edge === 'top' ? 'below-center' : 'side-left';

  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        x: springX,
        y: edge === 'top' ? springY : springAnchor,
        rotate: springRotate,
        transformOrigin: edge === 'left' ? 'right center' : edge === 'top' ? 'top center' : 'left center',
      }}
      className={`pointer-events-auto absolute z-30 ${anchorPositionClasses} ${className}`}
    >
      <motion.div style={edge === 'top' ? undefined : { y: springY }}>
        <MiniAiRobot
          variant="topbar"
          isHovered={isHovered}
          expressionOverride={isHoldingHard ? 'surprised' : 'edge-grab'}
          grabEdge={edge}
          externalPopup={activePopup}
          quickActions={quickActions}
          popupPlacement={popupPlacement}
          onPopupClick={onAction}
          title="Clinging to Document Preview — click to say hi or hover for quick controls!"
          sizeClassName="w-10 h-10 overflow-visible drop-shadow-[0_6px_12px_rgba(15,23,42,0.3)]"
        />
      </motion.div>
    </motion.div>
  );
};
