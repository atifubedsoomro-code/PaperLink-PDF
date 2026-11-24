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
}

const supportsHover = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover)').matches;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Icon-first button with liquid-crystal surface-tension ripple and droplet sheen.
 * At rest only the icon is visible; on hover (or keyboard focus) the button widens
 * and the label types itself out like a typewriter.
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
}) => {
  const prefersReduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const [typed, setTyped] = useState('');
  const [canHover] = useState(supportsHover);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const alwaysShowText = !icon || !canHover || loading;
  const showLabel = alwaysShowText || (active && !disabled);

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
    if (timerRef.current) clearInterval(timerRef.current);

    if (alwaysShowText) {
      setTyped(text);
      return;
    }
    if (!active || disabled) {
      setTyped('');
      return;
    }
    if (prefersReducedMotion()) {
      setTyped(text);
      return;
    }

    typewriterAudio.playHoverTick();
    setTyped('');
    let idx = 0;
    timerRef.current = setInterval(() => {
      idx++;
      setTyped(text.slice(0, idx));
      if (idx % 3 === 0) typewriterAudio.playHoverTick();
      if (idx >= text.length && timerRef.current) {
        clearInterval(timerRef.current);
      }
    }, 28);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, alwaysShowText, disabled, text]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-amber-400 hover:from-yellow-200 hover:via-yellow-300 hover:to-yellow-400 text-black border-yellow-300 font-extrabold shadow-[0_6px_22px_-4px_rgba(250,204,21,0.38),inset_0_1px_0_rgba(255,255,255,0.75)] hover:shadow-[0_8px_28px_-4px_rgba(250,204,21,0.52),inset_0_1px_0_rgba(255,255,255,0.85)]';
      case 'secondary':
        return 'bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 text-yellow-300 hover:text-yellow-200 border-zinc-800 dark:border-yellow-500/40 hover:border-yellow-400 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)]';
      case 'dark':
        return 'bg-white/85 dark:bg-zinc-900/85 backdrop-blur-lg backdrop-saturate-[160%] hover:bg-zinc-100 dark:hover:bg-zinc-800/95 text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white border-zinc-300/90 dark:border-zinc-800 hover:border-yellow-400/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]';
      case 'outline':
        return 'bg-transparent backdrop-blur-md hover:bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border-amber-500/40 dark:border-yellow-500/30 hover:border-amber-500 dark:hover:border-yellow-400';
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
        return 'px-6 py-3.5 text-sm';
      case 'md':
      default:
        return 'px-4 py-2 text-xs sm:text-sm';
    }
  };

  const iconNode = loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon;
  const isTyping = !alwaysShowText && active && typed.length < text.length;

  const labelStyle: React.CSSProperties = alwaysShowText
    ? {}
    : { maxWidth: showLabel ? `calc(${text.length + 2}ch + 0.5rem)` : 0 };

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
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPointerDown={handlePointerDown}
      whileHover={prefersReduced || disabled || loading ? undefined : { y: -1 }}
      whileTap={prefersReduced || disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      title={title ?? text}
      aria-label={text}
      className={`group relative overflow-hidden inline-flex items-center justify-center rounded-xl border font-mono transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${getVariantStyles()} ${getSizeStyles()} ${className}`}
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
            active
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
                ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.18) 50%, transparent 78%)'
                : 'radial-gradient(ellipse at center, rgba(250,204,21,0.28) 0%, rgba(255,255,255,0.2) 50%, transparent 78%)',
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
                ? 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, transparent 72%)'
                : 'radial-gradient(circle, rgba(250,204,21,0.28) 0%, transparent 72%)',
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
