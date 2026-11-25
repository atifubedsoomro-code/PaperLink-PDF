import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { typewriterAudio } from '../services/soundEffects';

interface TypewriterButtonProps {
  icon?: React.ReactNode;
  text: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'dark' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  /** Put the icon after the label (e.g. a "Next" arrow) */
  iconPosition?: 'left' | 'right';
  /** Keep the full label always expanded instead of icon-first collapse */
  alwaysExpanded?: boolean;
  /** Duration in ms to keep the typewriter label visible after mouse leaves (5–8s per spec) */
  lingerMs?: number;
}

const supportsHover = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover)').matches;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULT_LINGER_MS = 6500;

/**
 * Icon-first button with liquid-crystal surface-tension ripple and droplet sheen.
 * At rest only the icon is visible; on hover (or keyboard focus) the button widens
 * and types out its label like a mechanical typewriter, then lingers cleanly for 6.5s
 * after pointer leave instead of collapsing abruptly.
 */
export const TypewriterButton: React.FC<TypewriterButtonProps> = ({
  icon,
  text,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  title,
  iconPosition = 'left',
  alwaysExpanded = false,
  lingerMs = DEFAULT_LINGER_MS,
}) => {
  const prefersReduced = useReducedMotion();
  const [pointerInside, setPointerInside] = useState(false);
  const [labelVisible, setLabelVisible] = useState(false);
  const [typed, setTyped] = useState('');
  const [canHover] = useState(supportsHover);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lingerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTypedForCycleRef = useRef(false);

  const alwaysShowText = alwaysExpanded || !icon || !canHover || loading;
  const showLabel = alwaysShowText || (labelVisible && !disabled);

  const clearLingerTimer = useCallback(() => {
    if (lingerTimeoutRef.current) {
      clearTimeout(lingerTimeoutRef.current);
      lingerTimeoutRef.current = null;
    }
  }, []);

  const activateHover = useCallback(() => {
    clearLingerTimer();
    setPointerInside(true);
    setLabelVisible(true);
  }, [clearLingerTimer]);

  const scheduleDeactivate = useCallback(() => {
    setPointerInside(false);
    clearLingerTimer();
    lingerTimeoutRef.current = setTimeout(() => {
      setLabelVisible(false);
      hasTypedForCycleRef.current = false;
    }, Math.max(5000, Math.min(8000, lingerMs)));
  }, [clearLingerTimer, lingerMs]);

  useEffect(() => {
    return () => {
      clearLingerTimer();
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, [clearLingerTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || loading || prefersReduced || !btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const sizePx = Math.max(rect.width, rect.height) * 1.4;
      const id = Date.now() + Math.random();
      setRipples((prev) => [
        ...prev.slice(-2),
        { id, x: e.clientX - rect.left, y: e.clientY - rect.top, size: sizePx },
      ]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 620);
    },
    [disabled, loading, prefersReduced]
  );

  useEffect(() => {
    if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);

    if (alwaysShowText) {
      setTyped(text);
      return;
    }
    if (!labelVisible || disabled) {
      setTyped('');
      hasTypedForCycleRef.current = false;
      return;
    }
    if (prefersReducedMotion()) {
      setTyped(text);
      hasTypedForCycleRef.current = true;
      return;
    }
    if (hasTypedForCycleRef.current && typed === text) {
      return;
    }

    hasTypedForCycleRef.current = true;
    typewriterAudio.playHoverTick();
    setTyped('');
    let idx = 0;
    typeIntervalRef.current = setInterval(() => {
      idx++;
      setTyped(text.slice(0, idx));
      if (idx % 3 === 0) typewriterAudio.playHoverTick();
      if (idx >= text.length && typeIntervalRef.current) {
        clearInterval(typeIntervalRef.current);
      }
    }, 26);

    return () => {
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, [labelVisible, alwaysShowText, disabled, text]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[linear-gradient(180deg,var(--pl-cta-from),var(--pl-cta-via)_55%,var(--pl-cta-to))] hover:bg-[linear-gradient(180deg,var(--pl-cta-hover-from),var(--pl-cta-hover-via)_55%,var(--pl-cta-hover-to))] text-[var(--pl-cta-text)] border-[var(--pl-cta-border)] font-extrabold shadow-[0_6px_22px_-4px_rgba(var(--pl-accent-rgb),0.4),inset_0_1px_0_rgba(255,255,255,0.45)] hover:shadow-[0_10px_26px_-4px_rgba(var(--pl-accent-rgb),0.55),inset_0_1px_0_rgba(255,255,255,0.6)]';
      case 'secondary':
        return 'bg-gradient-to-b from-slate-900 to-slate-950 dark:from-zinc-800 dark:to-zinc-950 hover:from-slate-800 hover:to-slate-900 dark:hover:from-zinc-700 dark:hover:to-zinc-900 text-sky-200 dark:text-yellow-300 border-slate-700/85 dark:border-yellow-500/40 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.16)]';
      case 'dark':
        return 'bg-white/90 dark:bg-zinc-900/85 backdrop-blur-lg backdrop-saturate-[160%] hover:bg-zinc-100 dark:hover:bg-zinc-800/95 text-zinc-900 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white border-zinc-300/90 dark:border-zinc-800 hover:border-yellow-400/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]';
      case 'outline':
        return 'bg-transparent backdrop-blur-md hover:bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border-amber-500/45 dark:border-yellow-500/30 hover:border-amber-600 dark:hover:border-yellow-400';
      case 'danger':
        return 'bg-red-50/90 dark:bg-red-950/60 backdrop-blur-md hover:bg-red-100 dark:hover:bg-red-900/70 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/40';
      default:
        return 'bg-yellow-400 text-black border-yellow-400';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-xs';
      case 'lg':
        return 'px-5 py-3 text-sm';
      case 'md':
      default:
        return 'px-3.5 py-2 text-xs sm:text-sm';
    }
  };

  const iconNode = loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon;
  const isTyping = !alwaysShowText && showLabel && typed.length < text.length;

  const labelStyle: React.CSSProperties = alwaysShowText
    ? {}
    : { maxWidth: showLabel ? `calc(${text.length + 2}ch + 0.65rem)` : 0 };

  const label = (
    <span
      className={`inline-flex items-center font-bold tracking-tight ${
        alwaysShowText ? '' : 'overflow-hidden whitespace-nowrap transition-[max-width] duration-300 ease-out'
      }`}
      style={labelStyle}
      aria-hidden={!showLabel}
    >
      <span className={iconNode ? (iconPosition === 'right' ? 'pr-2' : 'pl-2') : ''}>
        {typed}
        {isTyping && <span className="inline-block w-1.5 h-3.5 align-middle bg-current ml-0.5 animate-pulse" />}
      </span>
    </span>
  );

  const iconEl = iconNode ? (
    <span className="flex-shrink-0 inline-flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
      {iconNode}
    </span>
  ) : null;

  return (
    <motion.button
      ref={btnRef}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={activateHover}
      onMouseLeave={scheduleDeactivate}
      onFocus={activateHover}
      onBlur={scheduleDeactivate}
      onPointerDown={handlePointerDown}
      whileHover={prefersReduced || disabled || loading ? undefined : { y: -1.5, scale: 1.01 }}
      whileTap={prefersReduced || disabled || loading ? undefined : { scale: 0.975 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      title={title ?? text}
      aria-label={text}
      className={`group relative overflow-hidden inline-flex items-center justify-center rounded-xl border font-mono transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] ${getVariantStyles()} ${getSizeStyles()} ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1.5 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/75 dark:via-white/35 to-transparent"
      />

      {!prefersReduced && !disabled && !loading && (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={
            pointerInside
              ? {
                  x: ['-120%', '220%'],
                  scaleX: [0.85, 1.5, 1.1],
                  scaleY: [1, 0.72, 0.95],
                  opacity: [0, 0.75, 0],
                }
              : { x: '-120%', opacity: 0 }
          }
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background:
              variant === 'primary'
                ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 50%, transparent 78%)'
                : 'radial-gradient(ellipse at center, rgba(var(--pl-accent-rgb),0.28) 0%, rgba(255,255,255,0.2) 50%, transparent 78%)',
          }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12"
        />
      )}

      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden="true"
          initial={{ scale: 0.12, opacity: 0.55 }}
          animate={{ scale: 1.65, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            left: r.x - r.size / 2,
            top: r.y - r.size / 2,
            width: r.size,
            height: r.size,
            background:
              variant === 'primary'
                ? 'radial-gradient(circle, rgba(255,255,255,0.52) 0%, transparent 72%)'
                : 'radial-gradient(circle, rgba(var(--pl-accent-rgb),0.28) 0%, transparent 72%)',
          }}
          className="pointer-events-none absolute rounded-full"
        />
      ))}

      <span className="relative z-10 inline-flex items-center justify-center">
        {iconPosition === 'right' ? (
          <>
            {label}
            {iconEl}
          </>
        ) : (
          <>
            {iconEl}
            {label}
          </>
        )}
      </span>
    </motion.button>
  );
};
