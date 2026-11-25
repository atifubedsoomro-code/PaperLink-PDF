import React, { useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

export type LiquidButtonVariant = 'primary' | 'secondary' | 'neutral' | 'yellow-parent';

interface TapRipple {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface LiquidCrystalButtonProps {
  children: React.ReactNode;
  variant?: LiquidButtonVariant;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  'aria-label'?: string;
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * High-fidelity liquid-crystal button using Motion animations for:
 * - Viscous crystal water-droplet sweep on hover (stretches along glide path)
 * - Surface-tension meniscus ripple radiating from tap/click point
 * - Crisp top-edge optical specular rim matching PaperLink's Black + Yellow palette
 */
export const LiquidCrystalButton: React.FC<LiquidCrystalButtonProps> = ({
  children,
  variant = 'primary',
  className = '',
  onClick,
  disabled = false,
  type = 'button',
  title,
  'aria-label': ariaLabel,
  href,
  target,
  rel,
}) => {
  const prefersReduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [ripples, setRipples] = useState<TapRipple[]>([]);
  const btnRef = useRef<HTMLElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || prefersReduced || !btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 1.35;
      const id = Date.now() + Math.random();
      setRipples((prev) => [...prev.slice(-2), { id, x, y, size }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 650);
    },
    [disabled, prefersReduced]
  );

  const variantClasses = (() => {
    switch (variant) {
      case 'primary':
        return 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-via)_55%,var(--pl-cta-to))] hover:bg-[linear-gradient(180deg,var(--pl-cta-hover-from),var(--pl-cta-hover-via)_55%,var(--pl-cta-hover-to))] text-[var(--pl-cta-text)] font-bold border border-[var(--pl-cta-border)] shadow-[0_8px_22px_-4px_rgba(var(--pl-accent-rgb),0.42),inset_0_1px_0_rgba(255,255,255,0.45)]';
      case 'secondary':
        return 'bg-gradient-to-b from-slate-900 to-slate-950 dark:from-zinc-800/95 dark:to-zinc-950/95 hover:from-slate-800 hover:to-slate-900 text-sky-200 dark:text-yellow-400 font-bold border border-slate-700/90 dark:border-zinc-700/90 shadow-[0_6px_18px_-6px_rgba(15,23,42,0.38),inset_0_1px_0_rgba(255,255,255,0.16)]';
      case 'yellow-parent':
        return 'border-2 border-yellow-400 backdrop-blur-xl backdrop-saturate-[160%] shadow-[0_6px_20px_-4px_rgba(var(--pl-accent-rgb),0.34),inset_0_1px_0_rgba(255,255,255,0.65)]';
      case 'neutral':
      default:
        return 'bg-[var(--pl-surface)]/92 dark:bg-zinc-900/85 backdrop-blur-xl backdrop-saturate-[160%] hover:bg-white dark:hover:bg-zinc-800/95 border border-zinc-200/95 dark:border-zinc-700/85 hover:border-yellow-500 text-zinc-900 dark:text-zinc-100 font-semibold shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]';
    }
  })();

  const innerCrystalLayers = (
    <>
      {/* Optical Top Meniscus Highlight */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1.5 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/40 to-transparent"
      />

      {/* Smooth Water Droplet Lens Glide on Hover */}
      {!prefersReduced && !disabled && (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={
            hovered
              ? {
                  x: ['-120%', '220%'],
                  scaleX: [0.8, 1.55, 1.15],
                  scaleY: [1, 0.72, 0.95],
                  opacity: [0, 0.85, 0],
                }
              : { x: '-120%', opacity: 0 }
          }
          transition={{
            duration: 0.72,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            background:
              variant === 'primary' || variant === 'yellow-parent'
                ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.24) 48%, transparent 76%)'
                : 'radial-gradient(ellipse at center, rgba(var(--pl-accent-rgb),0.32) 0%, rgba(255,255,255,0.22) 48%, transparent 76%)',
          }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12"
        />
      )}

      {/* Surface-Tension Tap Ripple */}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden="true"
          initial={{ scale: 0.12, opacity: 0.6 }}
          animate={{ scale: 1.65, opacity: 0 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
          style={{
            left: r.x - r.size / 2,
            top: r.y - r.size / 2,
            width: r.size,
            height: r.size,
            background:
              variant === 'primary'
                ? 'radial-gradient(circle, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.12) 60%, transparent 75%)'
                : 'radial-gradient(circle, rgba(var(--pl-accent-rgb),0.32) 0%, rgba(255,255,255,0.16) 60%, transparent 75%)',
          }}
          className="pointer-events-none absolute rounded-full"
        />
      ))}

      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </>
  );

  const sharedMotionProps = {
    whileHover: prefersReduced || disabled ? undefined : { y: -1.5, scale: 1.01 },
    whileTap: prefersReduced || disabled ? undefined : { scale: 0.985, y: 0 },
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onPointerDown: handlePointerDown,
    title,
    'aria-label': ariaLabel,
  };

  if (href) {
    return (
      <motion.a
        ref={btnRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        target={target}
        rel={rel}
        onClick={onClick}
        {...sharedMotionProps}
        className={`relative overflow-hidden inline-flex items-center justify-center cursor-pointer transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${variantClasses} ${className}`}
      >
        {innerCrystalLayers}
      </motion.a>
    );
  }

  return (
    <motion.button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={onClick}
      {...sharedMotionProps}
      className={`relative overflow-hidden inline-flex items-center justify-center cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${variantClasses} ${className}`}
    >
      {innerCrystalLayers}
    </motion.button>
  );
};

interface LiquidCrystalCardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  accentGlow?: 'yellow' | 'crystal';
  onClick?: () => void;
  asButton?: boolean;
  delay?: number;
}

/**
 * Refractive liquid-crystal glass container with cursor-following droplet lens
 * refraction (GPU compositor transforms via MotionValue/Spring, zero layout jitter)
 * and smooth organic water-droplet surface-tension bead highlights.
 */
export const LiquidCrystalCard: React.FC<LiquidCrystalCardProps> = ({
  children,
  className = '',
  interactive = false,
  accentGlow = 'yellow',
  onClick,
  asButton = false,
  delay = 0,
}) => {
  const prefersReduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const rawX = useMotionValue(-180);
  const rawY = useMotionValue(-180);
  const springX = useSpring(rawX, { stiffness: 220, damping: 26, mass: 0.55 });
  const springY = useSpring(rawY, { stiffness: 220, damping: 26, mass: 0.55 });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (prefersReduced || !cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      rawX.set(e.clientX - rect.left - 96);
      rawY.set(e.clientY - rect.top - 96);
    },
    [prefersReduced, rawX, rawY]
  );

  const baseGlassClasses =
    'relative overflow-hidden backdrop-blur-xl backdrop-saturate-[155%] bg-white/90 dark:bg-[var(--pl-surface)]/90 border border-zinc-200/95 dark:border-zinc-800/95 shadow-[0_8px_28px_-10px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_14px_34px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]';

  const overlayContent = (
    <>
      {/* Top Optical Glass Specular Edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/55 dark:via-yellow-300/40 to-transparent"
      />

      {/* Fluid Cursor-Tracking Water Lens Bead */}
      {!prefersReduced && (
        <motion.span
          aria-hidden="true"
          style={{
            x: springX,
            y: springY,
            width: 192,
            height: 192,
            background:
              accentGlow === 'yellow'
                ? 'radial-gradient(circle, rgba(var(--pl-accent-rgb),0.16) 0%, rgba(255,255,255,0.22) 34%, transparent 70%)'
                : 'radial-gradient(circle, rgba(186,230,253,0.22) 0%, rgba(255,255,255,0.22) 34%, transparent 70%)',
          }}
          animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1.06 : 0.85 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute top-0 left-0 rounded-full blur-xl"
        />
      )}

      {/* Drifting Liquid Meniscus Droplet Sheen on Hover */}
      {!prefersReduced && interactive && (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={
            isHovered
              ? {
                  x: ['-110%', '220%'],
                  scaleX: [0.85, 1.45, 1],
                  opacity: [0, 0.55, 0],
                }
              : { x: '-110%', opacity: 0 }
          }
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background:
              'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.42) 48%, rgba(var(--pl-accent-rgb),0.18) 56%, transparent 80%)',
          }}
          className="pointer-events-none absolute inset-y-0 left-0 w-2/3"
        />
      )}

      <div
        className={`relative z-10 ${
          className.includes('flex') ? 'flex-1 flex flex-col min-h-0 h-full' : ''
        }`}
      >
        {children}
      </div>
    </>
  );

  if (asButton || onClick) {
    return (
      <motion.button
        ref={cardRef as unknown as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
        whileHover={prefersReduced ? undefined : { y: -3, scale: 1.008 }}
        whileTap={prefersReduced ? undefined : { scale: 0.99 }}
        onPointerMove={handlePointerMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${baseGlassClasses} hover:border-yellow-400/90 transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${className}`}
      >
        {overlayContent}
      </motion.button>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${baseGlassClasses} ${className}`}
    >
      {overlayContent}
    </motion.div>
  );
};
