import React, { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export type DropletTransitionMode =
  | 'from-minimized-to-dock'
  | 'from-minimized-to-window'
  | 'from-closed-to-window';

export interface DropletBurstState {
  id: number;
  mode: DropletTransitionMode;
  originPoint?: {
    x: number;
    y: number;
  };
  targetRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface DropletTrajectory {
  id: string;
  xs: number[];
  ys: number[];
  scaleXs: number[];
  scaleYs: number[];
  opacities: number[];
  times: number[];
  size: number;
  delay: number;
  duration: number;
  angleDeg: number;
  isMicroDew: boolean;
}

interface RippleWave {
  id: string;
  cx: number;
  cy: number;
  size: number;
  delay: number;
  duration: number;
}

function sampleQuadBezier(
  p0x: number,
  p0y: number,
  cpx: number,
  cpy: number,
  p1x: number,
  p1y: number,
  tValues: number[]
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of tValues) {
    const inv = 1 - t;
    xs.push(inv * inv * p0x + 2 * inv * t * cpx + t * t * p1x);
    ys.push(inv * inv * p0y + 2 * inv * t * cpy + t * t * p1y);
  }
  return { xs, ys };
}

function buildWaterSystem(burst: DropletBurstState): {
  droplets: DropletTrajectory[];
  ripples: RippleWave[];
} {
  const { mode, targetRect, originPoint } = burst;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const tSamples = [0, 0.28, 0.58, 0.84, 1];

  if (mode === 'from-closed-to-window') {
    const ox = originPoint?.x ?? targetRect.left + targetRect.width * 0.56;
    const oy = originPoint?.y ?? targetRect.top + targetRect.height - 44;

    const anchors = [
      { rx: 0.14, ry: 0.14, size: 34, delay: 0, curve: -26, micro: false },
      { rx: 0.48, ry: 0.10, size: 42, delay: 0.02, curve: -18, micro: false },
      { rx: 0.84, ry: 0.16, size: 32, delay: 0.03, curve: 28, micro: false },
      { rx: 0.18, ry: 0.48, size: 38, delay: 0.04, curve: -34, micro: false },
      { rx: 0.52, ry: 0.46, size: 48, delay: 0.01, curve: -12, micro: false },
      { rx: 0.86, ry: 0.52, size: 30, delay: 0.05, curve: 32, micro: false },
      { rx: 0.28, ry: 0.82, size: 28, delay: 0.035, curve: -22, micro: false },
      { rx: 0.72, ry: 0.78, size: 26, delay: 0.055, curve: 24, micro: false },
      // Delicate condensation micro-dew beads
      { rx: 0.08, ry: 0.30, size: 15, delay: 0.045, curve: -40, micro: true },
      { rx: 0.92, ry: 0.32, size: 14, delay: 0.06, curve: 42, micro: true },
      { rx: 0.34, ry: 0.24, size: 16, delay: 0.025, curve: -16, micro: true },
      { rx: 0.68, ry: 0.28, size: 13, delay: 0.05, curve: 18, micro: true },
    ];

    const droplets: DropletTrajectory[] = anchors.map((a, idx) => {
      const endX = targetRect.left + targetRect.width * a.rx;
      const endY = targetRect.top + targetRect.height * a.ry;
      const sx = ox + ((idx % 5) - 2) * 14;
      const sy = oy;
      const cpx = (sx + endX) / 2 + a.curve;
      const cpy = (sy + endY) / 2 - Math.abs(a.curve) * 0.45;
      const { xs, ys } = sampleQuadBezier(sx, sy, cpx, cpy, endX, endY, tSamples);
      const angleDeg = (Math.atan2(endY - sy, endX - sx) * 180) / Math.PI;
      const half = a.size / 2;

      return {
        id: `${burst.id}_cw_${idx}`,
        xs: xs.map((v) => v - half),
        ys: ys.map((v) => v - half),
        scaleXs: a.micro ? [0.6, 1.55, 1.35, 0.92, 0.4] : [0.65, 1.75, 1.95, 0.88, 0.55],
        scaleYs: a.micro ? [0.6, 0.65, 0.72, 1.05, 0.4] : [0.65, 0.62, 0.58, 1.12, 0.5],
        opacities: [0.92, 0.98, 0.96, 0.62, 0],
        times: tSamples,
        size: a.size,
        delay: a.delay,
        duration: a.micro ? 0.48 : 0.54,
        angleDeg,
        isMicroDew: a.micro,
      };
    });

    const ripples: RippleWave[] = [
      {
        id: `${burst.id}_rc1`,
        cx: targetRect.left + targetRect.width * 0.5,
        cy: targetRect.top + targetRect.height * 0.5,
        size: Math.min(targetRect.width, targetRect.height) * 0.72,
        delay: 0.14,
        duration: 0.52,
      },
      {
        id: `${burst.id}_rc2`,
        cx: targetRect.left + targetRect.width * 0.5,
        cy: targetRect.top + targetRect.height * 0.5,
        size: Math.min(targetRect.width, targetRect.height) * 0.94,
        delay: 0.22,
        duration: 0.56,
      },
    ];

    return { droplets, ripples };
  }

  // Opening/Restoring from top-left minimized navbar "PaperLink AI" button
  const originX = originPoint?.x ?? (vw < 640 ? 156 : 212);
  const originY = originPoint?.y ?? 32;

  const landingPoints = [
    { rx: 0.14, ry: 0.16, size: 38, delay: 0, arcX: -28, arcY: -24, micro: false },
    { rx: 0.48, ry: 0.14, size: 46, delay: 0.02, arcX: 16, arcY: -44, micro: false },
    { rx: 0.84, ry: 0.20, size: 34, delay: 0.045, arcX: 48, arcY: -22, micro: false },
    { rx: 0.34, ry: 0.48, size: 52, delay: 0.03, arcX: -36, arcY: 20, micro: false },
    { rx: 0.66, ry: 0.52, size: 42, delay: 0.06, arcX: 42, arcY: 28, micro: false },
    { rx: 0.86, ry: 0.82, size: 32, delay: 0.08, arcX: 54, arcY: 16, micro: false },
    { rx: 0.22, ry: 0.84, size: 30, delay: 0.095, arcX: -40, arcY: 36, micro: false },
    // Dew spray trailing along liquid path
    { rx: 0.26, ry: 0.32, size: 15, delay: 0.04, arcX: -52, arcY: -12, micro: true },
    { rx: 0.62, ry: 0.28, size: 16, delay: 0.055, arcX: 58, arcY: -36, micro: true },
    { rx: 0.50, ry: 0.68, size: 14, delay: 0.075, arcX: 14, arcY: 48, micro: true },
    { rx: 0.78, ry: 0.66, size: 13, delay: 0.09, arcX: 64, arcY: 8, micro: true },
  ];

  const droplets: DropletTrajectory[] = landingPoints.map((pt, idx) => {
    const endX = targetRect.left + targetRect.width * pt.rx;
    const endY = targetRect.top + targetRect.height * pt.ry;
    const sx = originX + ((idx % 3) - 1) * 5;
    const sy = originY;
    const cpx = sx + (endX - sx) * 0.52 + pt.arcX;
    const cpy = sy + (endY - sy) * 0.44 + pt.arcY;
    const { xs, ys } = sampleQuadBezier(sx, sy, cpx, cpy, endX, endY, tSamples);
    const angleDeg = (Math.atan2(endY - sy, endX - sx) * 180) / Math.PI;
    const half = pt.size / 2;

    return {
      id: `${burst.id}_mw_${idx}`,
      xs: xs.map((v) => v - half),
      ys: ys.map((v) => v - half),
      scaleXs: pt.micro ? [0.6, 1.85, 1.45, 0.9, 0.35] : [0.65, 2.25, 1.85, 0.88, 0.5],
      scaleYs: pt.micro ? [0.6, 0.58, 0.68, 1.05, 0.35] : [0.65, 0.52, 0.62, 1.12, 0.45],
      opacities: [0.95, 1, 0.96, 0.58, 0],
      times: tSamples,
      size: pt.size,
      delay: pt.delay,
      duration: pt.micro ? 0.56 : 0.62,
      angleDeg,
      isMicroDew: pt.micro,
    };
  });

  const ripples: RippleWave[] = [
    {
      id: `${burst.id}_rm1`,
      cx: targetRect.left + targetRect.width * 0.5,
      cy: targetRect.top + targetRect.height * 0.5,
      size: Math.min(targetRect.width, targetRect.height) * 0.78,
      delay: 0.24,
      duration: 0.54,
    },
    {
      id: `${burst.id}_rm2`,
      cx: targetRect.left + targetRect.width * 0.5,
      cy: targetRect.top + targetRect.height * 0.5,
      size: Math.min(targetRect.width, targetRect.height) * 1.04,
      delay: 0.32,
      duration: 0.58,
    },
  ];

  return { droplets, ripples };
}

export const LiquidDropletOverlay: React.FC<{ burst: DropletBurstState | null }> = ({ burst }) => {
  const prefersReduced = useReducedMotion();

  const waterSystem = useMemo(() => {
    if (!burst) return null;
    return buildWaterSystem(burst);
  }, [burst]);

  if (prefersReduced || !burst || !waterSystem) return null;

  const mainDroplets = waterSystem.droplets.filter((d) => !d.isMicroDew);

  return (
    <AnimatePresence>
      <div
        key={burst.id}
        aria-hidden="true"
        className="no-print fixed inset-0 pointer-events-none z-50 overflow-hidden"
      >
        {/* SVG Liquid Surface-Tension Goo Filter */}
        <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
          <defs>
            <filter id="paperlink-water-crystal-goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>

        {/* Layer 1: Fused Crystal Water Viscous Bridges (Goo Metaball Stream) */}
        <div
          className="absolute inset-0"
          style={{ filter: 'url(#paperlink-water-crystal-goo)' }}
        >
          {mainDroplets.map((d) => (
            <motion.div
              key={`${d.id}_goo`}
              initial={{
                x: d.xs[0],
                y: d.ys[0],
                scaleX: d.scaleXs[0],
                scaleY: d.scaleYs[0],
                rotate: d.angleDeg,
                opacity: 0.85,
              }}
              animate={{
                x: d.xs,
                y: d.ys,
                scaleX: d.scaleXs,
                scaleY: d.scaleYs,
                opacity: d.opacities,
              }}
              transition={{
                duration: d.duration,
                delay: d.delay,
                times: d.times,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                width: `${d.size}px`,
                height: `${d.size}px`,
                background:
                  'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.88) 0%, rgba(224,242,254,0.58) 52%, rgba(186,230,253,0.42) 82%, rgba(254,240,138,0.28) 100%)',
              }}
              className="absolute rounded-full"
            />
          ))}
        </div>

        {/* Layer 2: True Refractive Liquid-Crystal Lens Beads & Micro-Dew */}
        {waterSystem.droplets.map((d) => (
          <motion.div
            key={d.id}
            initial={{
              x: d.xs[0],
              y: d.ys[0],
              scaleX: d.scaleXs[0],
              scaleY: d.scaleYs[0],
              rotate: d.angleDeg,
              opacity: 0.95,
            }}
            animate={{
              x: d.xs,
              y: d.ys,
              scaleX: d.scaleXs,
              scaleY: d.scaleYs,
              opacity: d.opacities,
            }}
            transition={{
              duration: d.duration,
              delay: d.delay,
              times: d.times,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              width: `${d.size}px`,
              height: `${d.size}px`,
              background:
                'radial-gradient(circle at 30% 26%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.28) 38%, rgba(186,230,253,0.18) 72%, rgba(254,240,138,0.20) 100%)',
              boxShadow:
                'inset 0 2px 3px rgba(255,255,255,0.95), inset 0 -3px 6px rgba(125,211,252,0.45), inset -1px -1px 4px rgba(250,204,21,0.22), 0 8px 18px -4px rgba(15,23,42,0.20)',
            }}
            className="absolute rounded-full backdrop-blur-[6px] backdrop-saturate-[175%] border border-white/80"
          >
            {/* Pinpoint Specular Wet Glint */}
            <span
              className="block rounded-full bg-white/95"
              style={{
                width: `${Math.max(3, Math.round(d.size * 0.24))}px`,
                height: `${Math.max(2, Math.round(d.size * 0.16))}px`,
                marginLeft: `${Math.max(2, Math.round(d.size * 0.22))}px`,
                marginTop: `${Math.max(2, Math.round(d.size * 0.18))}px`,
                transform: 'rotate(-28deg)',
              }}
            />
          </motion.div>
        ))}

        {/* Layer 3: Expanding Surface-Tension Meniscus Ripple Rings */}
        {waterSystem.ripples.map((r) => (
          <motion.div
            key={r.id}
            initial={{
              x: r.cx - r.size / 2,
              y: r.cy - r.size / 2,
              scale: 0.22,
              opacity: 0.72,
            }}
            animate={{
              scale: [0.22, 0.85, 1.24],
              opacity: [0.72, 0.42, 0],
            }}
            transition={{
              duration: r.duration,
              delay: r.delay,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              width: `${r.size}px`,
              height: `${r.size}px`,
              boxShadow:
                '0 0 18px rgba(186,230,253,0.45), inset 0 0 10px rgba(255,255,255,0.55)',
            }}
            className="absolute rounded-full border border-white/75"
          />
        ))}
      </div>
    </AnimatePresence>
  );
};
