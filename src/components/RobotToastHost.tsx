import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, X } from 'lucide-react';
import { MiniAiRobot } from './MiniAiRobot';
import { ROBOT_TOAST_EVENT, RobotToastDetail } from '../services/robotToast';

export const RobotToastHost: React.FC = () => {
  const prefersReduced = useReducedMotion();
  const [toast, setToast] = useState<RobotToastDetail | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const customEvent = event as CustomEvent<RobotToastDetail>;
      const detail = customEvent.detail;
      if (!detail || !detail.message) return;

      setToast(detail);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setToast(null);
      }, detail.durationMs ?? 2800);
    };

    window.addEventListener(ROBOT_TOAST_EVENT, handleToastEvent);
    return () => {
      window.removeEventListener(ROBOT_TOAST_EVENT, handleToastEvent);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setToast(null);
  };

  return (
    <div
      className="no-print pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 sm:left-5 sm:translate-x-0 z-[100] w-[calc(100vw-2rem)] sm:w-auto sm:max-w-sm"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.16 } }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/85 bg-white/95 dark:bg-[var(--pl-surface)]/95 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_14px_34px_-10px_rgba(15,23,42,0.28),0_0_16px_-6px_rgba(var(--pl-accent-rgb),0.22)]"
          >
            <div className="shrink-0 -my-1">
              <MiniAiRobot
                variant="topbar"
                expressionOverride={toast.expression ?? 'thumbs-up'}
                externalPopup={null}
                sizeClassName="w-10 h-10 overflow-visible"
                title="PaperLink Assistant"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                  {toast.message}
                </p>
              </div>
              {toast.subText && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug mt-0.5">
                  {toast.subText}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
