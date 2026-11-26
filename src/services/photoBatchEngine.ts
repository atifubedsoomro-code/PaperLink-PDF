import {
  PhotoBatchAdjustConfig,
  PhotoBatchAnchor,
  PhotoBatchMark,
  PhotoBatchSetup,
} from '../types';

export interface PhotoBatchLook {
  id: string;
  name: string;
  p: Partial<PhotoBatchAdjustConfig>;
}

export const PHOTO_BATCH_LOOKS: PhotoBatchLook[] = [
  { id: 'none', name: 'Original', p: {} },
  { id: 'vivid', name: 'Vivid', p: { contrast: 18, saturation: 26, vibrance: 18, brightness: 2 } },
  { id: 'punch', name: 'Stage Punch', p: { contrast: 30, saturation: 22, shadows: -12, highlights: 8, clarity: 14 } },
  { id: 'warm', name: 'Warm Glow', p: { temperature: 28, saturation: 8, vibrance: 12, tint: 4, contrast: 6 } },
  { id: 'golden', name: 'Golden Hour', p: { temperature: 40, exposure: 8, saturation: 16, highlights: -10, fade: 6 } },
  { id: 'cool', name: 'Cool Crisp', p: { temperature: -26, contrast: 10, saturation: 6, clarity: 10 } },
  { id: 'fresh', name: 'Fresh', p: { brightness: 8, vibrance: 18, temperature: -6, highlights: -8, shadows: 14 } },
  { id: 'cinema', name: 'Cinematic', p: { contrast: 24, saturation: -12, temperature: -10, shadows: -8, fade: 10, tint: -6 } },
  { id: 'matte', name: 'Matte', p: { fade: 28, contrast: -8, saturation: -10 } },
  { id: 'editorial', name: 'Editorial', p: { contrast: 14, clarity: 20, vibrance: 10, highlights: -12, shadows: 10 } },
  { id: 'fuji', name: 'Film Chrome', p: { contrast: 16, vibrance: 22, fade: 8, temperature: 8, tint: -6 } },
  { id: 'bw', name: 'Mono', p: { grayscale: 100, contrast: 20 } },
  { id: 'noir', name: 'Noir', p: { grayscale: 100, contrast: 42, brightness: -6, shadows: -16 } },
  { id: 'sepia', name: 'Sepia', p: { sepia: 80, contrast: 8, fade: 8 } },
];

export const VIGNETTE_PROFILES = {
  subtle: { strength: 35, size: 62, feather: 70, roundness: 40, color: '#000000' },
  classic: { strength: 60, size: 50, feather: 60, roundness: 40, color: '#000000' },
  heavy: { strength: 85, size: 38, feather: 55, roundness: 55, color: '#000000' },
  spotlight: { strength: 92, size: 24, feather: 45, roundness: 100, color: '#000000' },
  light: { strength: 55, size: 50, feather: 70, roundness: 40, color: '#ffffff' },
} as const;

export const MARK_FONT_OPTIONS = [
  'Plus Jakarta Sans',
  'DM Sans',
  'Playfair Display',
  'Oswald',
  'Dancing Script',
  'Georgia',
  'JetBrains Mono',
];

export const ANCHOR_LABELS: Record<Exclude<PhotoBatchAnchor, 'custom'>, string> = {
  tl: 'Top Left',
  tc: 'Top Center',
  tr: 'Top Right',
  ml: 'Middle Left',
  mc: 'Center',
  mr: 'Middle Right',
  bl: 'Bottom Left',
  bc: 'Bottom Center',
  br: 'Bottom Right',
};

export const ADJUST_KEYS: Array<Exclude<keyof PhotoBatchAdjustConfig, 'sharpen' | 'clarity'>> = [
  'exposure',
  'brightness',
  'contrast',
  'highlights',
  'shadows',
  'saturation',
  'vibrance',
  'temperature',
  'tint',
  'fade',
  'grayscale',
  'sepia',
];

export interface MarkHitbox {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export function createMarkId(): string {
  return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createBaseMark(overrides?: Partial<PhotoBatchMark>): PhotoBatchMark {
  return {
    id: createMarkId(),
    type: 'text',
    text: '© Your Studio',
    font: 'Plus Jakarta Sans',
    weight: 600,
    color: '#ffffff',
    size: 3.0,
    opacity: 85,
    rotation: 0,
    anchor: 'br',
    margin: 2.8,
    tile: false,
    gap: 12,
    shadow: true,
    visible: true,
    x: 0.5,
    y: 0.5,
    imgData: null,
    imgName: '',
    ...overrides,
  };
}

export function createDefaultPhotoBatchSetup(): PhotoBatchSetup {
  return {
    filter: { preset: 'none', intensity: 100 },
    adjust: {
      exposure: 0,
      brightness: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      saturation: 0,
      vibrance: 0,
      clarity: 0,
      temperature: 0,
      tint: 0,
      fade: 0,
      grayscale: 0,
      sepia: 0,
      sharpen: 0,
    },
    vignette: {
      on: false,
      strength: 50,
      size: 52,
      feather: 62,
      roundness: 42,
      color: '#000000',
    },
    grain: { amount: 0 },
    frame: {
      enabled: false,
      thickness: 3.5,
      radius: 0,
      color: '#ffffff',
      innerStroke: false,
    },
    marks: [
      createBaseMark({
        id: 'starter_credit',
        text: '© PaperLink Studio',
        anchor: 'br',
        visible: false,
      }),
      createBaseMark({
        id: 'starter_tile',
        text: 'PROOF · DO NOT COPY',
        font: 'Oswald',
        weight: 700,
        size: 3.8,
        opacity: 14,
        rotation: -30,
        tile: true,
        gap: 14,
        shadow: false,
        visible: false,
      }),
    ],
    out: {
      format: 'jpeg',
      quality: 90,
      maxSide: 0,
      aspectCrop: 'original',
      prefix: '',
      suffix: '_edited',
      zipName: 'photo-batch-edited',
      perZip: 0,
    },
  };
}

export function mergePhotoBatchSetup(raw: Partial<PhotoBatchSetup> | null | undefined): PhotoBatchSetup {
  const def = createDefaultPhotoBatchSetup();
  if (!raw || typeof raw !== 'object') return def;

  return {
    filter: { ...def.filter, ...(raw.filter || {}) },
    adjust: { ...def.adjust, ...(raw.adjust || {}) },
    vignette: { ...def.vignette, ...(raw.vignette || {}) },
    grain: { ...def.grain, ...(raw.grain || {}) },
    frame: { ...def.frame, ...(raw.frame || {}) },
    marks: Array.isArray(raw.marks)
      ? raw.marks.map((m) => createBaseMark({ ...m, id: m.id || createMarkId() }))
      : def.marks,
    out: { ...def.out, ...(raw.out || {}) },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = String(hex || '#000000').replace('#', '');
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const num = parseInt(expanded, 16) || 0;
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${clamp(alpha, 0, 1)})`;
}

export function computeEffectiveParams(setup: PhotoBatchSetup): PhotoBatchAdjustConfig {
  const k = clamp(setup.filter.intensity, 0, 100) / 100;
  const look = PHOTO_BATCH_LOOKS.find((l) => l.id === setup.filter.preset) || PHOTO_BATCH_LOOKS[0];
  const out: PhotoBatchAdjustConfig = { ...setup.adjust };

  for (const key of ADJUST_KEYS) {
    out[key] = (setup.adjust[key] || 0) + (look.p[key] || 0) * k;
  }
  out.clarity = (setup.adjust.clarity || 0) + (look.p.clarity || 0) * k;
  out.sharpen = (setup.adjust.sharpen || 0) + (look.p.sharpen || 0) * k;
  return out;
}

export function applyColorPassToContext(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: PhotoBatchAdjustConfig,
  grainAmount = 0
): void {
  const hasColorWork =
    ADJUST_KEYS.some((k) => Math.abs(params[k] || 0) > 0.01) || grainAmount > 0;
  if (!hasColorWork) return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const ex = Math.pow(2, ((params.exposure || 0) / 100) * 1.5);
  const br = (params.brightness || 0) * 1.28;
  const c = (params.contrast || 0) / 100;
  const ck = c >= 0 ? 1 + c * 1.3 : Math.max(0.1, 1 + c * 0.9);
  const sat = Math.max(0, 1 + (params.saturation || 0) / 100);
  const vib = (params.vibrance || 0) / 100;
  const temp = (params.temperature || 0) * 0.5;
  const tint = (params.tint || 0) * 0.4;
  const sh = (params.shadows || 0) * 0.6;
  const hi = (params.highlights || 0) * 0.6;
  const lift = clamp((params.fade || 0) / 100, 0, 1) * 60;
  const gray = clamp((params.grayscale || 0) / 100, 0, 1);
  const sep = clamp((params.sepia || 0) / 100, 0, 1);
  const gAmt = (grainAmount || 0) * 0.88;
  const rand = mulberry32(1234);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * ex + br + temp;
    let g = d[i + 1] * ex + br - tint;
    let b = d[i + 2] * ex + br - temp;

    r = (r - 128) * ck + 128;
    g = (g - 128) * ck + 128;
    b = (b - 128) * ck + 128;

    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ln = clamp(luma / 255, 0, 1);
    const tone = sh * (1 - ln) * (1 - ln) + hi * ln * ln;
    r += tone;
    g += tone;
    b += tone;

    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (Math.abs(vib) > 0.005) {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const curSat = mx > 1 ? (mx - mn) / mx : 0;
      const vibGain = 1 + vib * (1 - curSat) * 0.85;
      r = luma + (r - luma) * vibGain;
      g = luma + (g - luma) * vibGain;
      b = luma + (b - luma) * vibGain;
    }

    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;

    if (sep > 0) {
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (tr - r) * sep;
      g += (tg - g) * sep;
      b += (tb - b) * sep;
    }

    if (gray > 0) {
      const l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (l2 - r) * gray;
      g += (l2 - g) * gray;
      b += (l2 - b) * gray;
    }

    if (lift > 0) {
      const f = 1 - lift / 255;
      r = lift + r * f;
      g = lift + g * f;
      b = lift + b * f;
    }

    if (gAmt > 0) {
      const noise = (rand() - 0.5) * gAmt;
      r += noise;
      g += noise;
      b += noise;
    }

    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(g, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }

  ctx.putImageData(img, 0, 0);
}

function applyUnsharpPass(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  if (amount <= 0 || w < 3 || h < 3) return;
  const a = (amount / 100) * 0.85;
  const src = ctx.getImageData(0, 0, w, h);
  const s = src.data;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  o.set(s);
  const c0 = 1 + 4 * a;
  const stride = w * 4;

  for (let y = 1; y < h - 1; y++) {
    let p = y * stride + 4;
    for (let x = 1; x < w - 1; x++, p += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const idx = p + ch;
        o[idx] = clamp(
          c0 * s[idx] - a * (s[idx - 4] + s[idx + 4] + s[idx - stride] + s[idx + stride]),
          0,
          255
        );
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

function applyVignettePass(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vig: PhotoBatchSetup['vignette']
): void {
  const k = clamp(vig.roundness, 0, 100) / 100;
  const sy = (h / Math.max(1, w)) * (1 - k) + k;
  const radius = Math.hypot(w / 2, h / (2 * Math.max(0.1, sy)));
  const inner = radius * (clamp(vig.size, 0, 100) / 100) * (1 - clamp(vig.feather, 0, 100) / 100);
  const outer = inner + radius * (0.1 + 0.9 * (clamp(vig.feather, 0, 100) / 100));

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, Math.max(0.1, sy));
  const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, Math.max(outer, inner + 1));
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    grad.addColorStop(t, hexToRgba(vig.color, (clamp(vig.strength, 0, 100) / 100) * (t * t * (3 - 2 * t))));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-w / 2 - 2, -h / (2 * sy) - 2, w + 4, h / sy + 4);
  ctx.restore();
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function resolveTokenText(
  raw: string,
  meta?: { photoIndex?: number; totalPhotos?: number; fileName?: string }
): string {
  if (!meta) return raw;
  const cleanName = (meta.fileName || 'photo').replace(/\.[^.]+$/, '');
  return raw
    .replace(/\{index\}/gi, String((meta.photoIndex ?? 0) + 1))
    .replace(/\{total\}/gi, String(meta.totalPhotos ?? 1))
    .replace(/\{name\}/gi, cleanName);
}

const loadedFontCache = new Set<string>();
export async function ensureMarkFontsLoaded(marks: PhotoBatchMark[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const jobs: Promise<FontFace[]>[] = [];
  for (const m of marks) {
    if (!m.visible || m.type !== 'text') continue;
    const key = `${m.font}|${m.weight}`;
    if (loadedFontCache.has(key)) continue;
    loadedFontCache.add(key);
    jobs.push(document.fonts.load(`${m.weight} 32px "${m.font}"`, m.text || 'A').catch(() => []));
  }
  if (jobs.length) await Promise.all(jobs);
}

export function getLogoElementFromCache(
  dataUrl: string,
  cache: Map<string, HTMLImageElement>
): Promise<HTMLImageElement | null> {
  const hit = cache.get(dataUrl);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function getAspectCropSourceRect(
  sw: number,
  sh: number,
  crop: PhotoBatchSetup['out']['aspectCrop']
): { sx: number; sy: number; sw: number; sh: number } {
  if (crop === 'original') return { sx: 0, sy: 0, sw, sh };
  const targetRatio = crop === '1:1' ? 1 : crop === '4:5' ? 4 / 5 : 16 / 9;
  const srcRatio = sw / Math.max(1, sh);
  if (Math.abs(srcRatio - targetRatio) < 0.005) return { sx: 0, sy: 0, sw, sh };
  if (srcRatio > targetRatio) {
    const nextW = sh * targetRatio;
    return { sx: (sw - nextW) / 2, sy: 0, sw: nextW, sh };
  }
  const nextH = sw / targetRatio;
  return { sx: 0, sy: (sh - nextH) / 2, sw, sh: nextH };
}

export function getOutputDimensions(
  srcW: number,
  srcH: number,
  out: PhotoBatchSetup['out']
): { width: number; height: number } {
  const cropRect = getAspectCropSourceRect(srcW, srcH, out.aspectCrop);
  let w = Math.round(cropRect.sw);
  let h = Math.round(cropRect.sh);
  const longest = Math.max(w, h);
  if (out.maxSide > 0 && longest > out.maxSide) {
    const scale = out.maxSide / longest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  return { width: w, height: h };
}

export function renderPhotoBatchFrame(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  w: number,
  h: number,
  setup: PhotoBatchSetup,
  options?: {
    photoIndex?: number;
    totalPhotos?: number;
    fileName?: string;
    logoCache?: Map<string, HTMLImageElement>;
  }
): Record<string, MarkHitbox> {
  const srcW = (src as HTMLCanvasElement).width || (src as HTMLImageElement).naturalWidth || w;
  const srcH = (src as HTMLCanvasElement).height || (src as HTMLImageElement).naturalHeight || h;
  const crop = getAspectCropSourceRect(srcW, srcH, setup.out.aspectCrop);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const frame = setup.frame;
  const pad = frame?.enabled ? Math.round((Math.min(w, h) * clamp(frame.thickness, 0, 14)) / 100) : 0;
  const radiusPx = frame?.enabled ? Math.round((Math.min(w, h) * clamp(frame.radius, 0, 18)) / 100) : 0;

  if (pad > 0) {
    ctx.fillStyle = frame.color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  const innerX = pad;
  const innerY = pad;
  const innerW = Math.max(2, w - pad * 2);
  const innerH = Math.max(2, h - pad * 2);

  // Render photo into an offscreen buffer if framed or clipped so pixel pass never tints border mat
  if (pad > 0 || radiusPx > 0) {
    const work = document.createElement('canvas');
    work.width = innerW;
    work.height = innerH;
    const wCtx = work.getContext('2d', { willReadFrequently: true });
    if (wCtx) {
      wCtx.imageSmoothingEnabled = true;
      wCtx.imageSmoothingQuality = 'high';
      wCtx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, innerW, innerH);
      const effective = computeEffectiveParams(setup);
      const sharpAmt = Math.min(100, (effective.sharpen || 0) + Math.max(0, effective.clarity || 0) * 0.45);
      if (sharpAmt > 0) applyUnsharpPass(wCtx, innerW, innerH, sharpAmt);
      applyColorPassToContext(wCtx, innerW, innerH, effective, setup.grain.amount);
      if (setup.vignette.on && setup.vignette.strength > 0) {
        applyVignettePass(wCtx, innerW, innerH, setup.vignette);
      }

      ctx.save();
      if (radiusPx > 0) {
        drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, radiusPx);
        ctx.clip();
      }
      ctx.drawImage(work, innerX, innerY);
      ctx.restore();

      if (frame.innerStroke) {
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) * 0.0025));
        if (radiusPx > 0) {
          drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, radiusPx);
          ctx.stroke();
        } else {
          ctx.strokeRect(innerX, innerY, innerW, innerH);
        }
        ctx.restore();
      }
      work.width = 1;
      work.height = 1;
    }
  } else {
    ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
    const effective = computeEffectiveParams(setup);
    const sharpAmt = Math.min(100, (effective.sharpen || 0) + Math.max(0, effective.clarity || 0) * 0.45);
    if (sharpAmt > 0) applyUnsharpPass(ctx, w, h, sharpAmt);
    applyColorPassToContext(ctx, w, h, effective, setup.grain.amount);
    if (setup.vignette.on && setup.vignette.strength > 0) {
      applyVignettePass(ctx, w, h, setup.vignette);
    }
  }

  // Draw layered watermarks & collect hitboxes for interactive dragging
  const boxes: Record<string, MarkHitbox> = {};
  for (const m of setup.marks) {
    if (!m.visible) continue;
    const sizePx = (m.size / 100) * w;
    let bw = 0;
    let bh = 0;
    let paintFn: (() => void) | null = null;

    if (m.type === 'text') {
      const renderedText = resolveTokenText(m.text, options);
      if (!renderedText) continue;
      const fontDef = `${m.weight} ${sizePx}px "${m.font}", sans-serif`;
      ctx.font = fontDef;
      bw = ctx.measureText(renderedText).width;
      bh = sizePx * 1.15;
      paintFn = () => {
        ctx.font = fontDef;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = m.color || '#ffffff';
        ctx.fillText(renderedText, 0, 0);
      };
    } else if (m.imgData && options?.logoCache) {
      const logoImg = options.logoCache.get(m.imgData);
      if (!logoImg || !logoImg.naturalWidth) continue;
      bw = sizePx;
      bh = sizePx * (logoImg.naturalHeight / logoImg.naturalWidth);
      paintFn = () => {
        ctx.drawImage(logoImg, -bw / 2, -bh / 2, bw, bh);
      };
    }

    if (!paintFn || bw <= 0 || bh <= 0) continue;

    ctx.save();
    ctx.globalAlpha = clamp(m.opacity / 100, 0, 1);
    if (m.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.48)';
      ctx.shadowBlur = Math.max(2, w * 0.003);
      ctx.shadowOffsetY = w * 0.0012;
    }

    const rad = (m.rotation * Math.PI) / 180;
    const cs = Math.abs(Math.cos(rad));
    const sn = Math.abs(Math.sin(rad));
    const rw = bw * cs + bh * sn;
    const rh = bw * sn + bh * cs;

    if (m.tile) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      const gap = (m.gap / 100) * w;
      const stepX = Math.max(bw + gap, w * 0.03);
      const stepY = Math.max(bh + gap * 0.65, w * 0.02);
      const diag = Math.hypot(w, h);
      let row = 0;
      for (let yy = -diag / 2; yy <= diag / 2; yy += stepY, row++) {
        const offset = (row % 2) * (stepX / 2);
        for (let xx = -diag / 2 - offset; xx <= diag / 2; xx += stepX) {
          ctx.save();
          ctx.translate(xx, yy);
          paintFn();
          ctx.restore();
        }
      }
    } else {
      const marginPx = (m.margin / 100) * w + pad;
      let cx: number;
      let cy: number;
      if (m.anchor === 'custom') {
        cx = m.x * w;
        cy = m.y * h;
      } else {
        const rowChar = m.anchor[0];
        const colChar = m.anchor[1];
        cx =
          colChar === 'l'
            ? marginPx + rw / 2
            : colChar === 'r'
            ? w - marginPx - rw / 2
            : w / 2;
        cy =
          rowChar === 't'
            ? marginPx + rh / 2
            : rowChar === 'b'
            ? h - marginPx - rh / 2
            : h / 2;
      }
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      paintFn();
      boxes[m.id] = { cx: cx / w, cy: cy / h, hw: rw / 2 / w, hh: rh / 2 / h };
    }

    ctx.restore();
  }

  ctx.restore();
  return boxes;
}

export function computeAutoToneAdjustments(canvas: HTMLCanvasElement): Partial<PhotoBatchAdjustConfig> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width < 2 || canvas.height < 2) return {};

  const sampleW = Math.min(180, canvas.width);
  const sampleH = Math.min(180, canvas.height);
  const off = document.createElement('canvas');
  off.width = sampleW;
  off.height = sampleH;
  const oCtx = off.getContext('2d', { willReadFrequently: true });
  if (!oCtx) return {};
  oCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const data = oCtx.getImageData(0, 0, sampleW, sampleH).data;
  off.width = 1;
  off.height = 1;

  const hist = new Uint32Array(256);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let satSum = 0;
  const totalPixels = sampleW * sampleH;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = clamp(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b), 0, 255);
    hist[luma] += 1;
    rSum += r;
    gSum += g;
    bSum += b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    satSum += mx > 0 ? (mx - mn) / mx : 0;
  }

  let acc = 0;
  let p02 = 0;
  let p50 = 128;
  let p98 = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= totalPixels * 0.02 && p02 === 0) p02 = v;
    if (acc >= totalPixels * 0.5 && p50 === 128) p50 = v;
    if (acc >= totalPixels * 0.98) {
      p98 = v;
      break;
    }
  }

  const avgR = rSum / totalPixels;
  const avgB = bSum / totalPixels;
  const avgSat = satSum / totalPixels;

  const exposureAdj = clamp(Math.round(((126 - p50) / 128) * 32), -24, 24);
  const range = Math.max(20, p98 - p02);
  const contrastAdj = clamp(Math.round(((225 - range) / 160) * 28), 4, 26);
  const shadowsAdj = p02 < 24 ? 14 : 6;
  const highlightsAdj = p98 > 240 ? -14 : -4;
  const vibranceAdj = avgSat < 0.35 ? 18 : 10;
  const tempAdj = clamp(Math.round(((avgB - avgR) / 255) * 36), -14, 14);

  return {
    exposure: exposureAdj,
    contrast: contrastAdj,
    shadows: shadowsAdj,
    highlights: highlightsAdj,
    vibrance: vibranceAdj,
    clarity: 10,
    temperature: tempAdj,
  };
}

export function createSampleBatchCanvas(): HTMLCanvasElement {
  const W = 1200;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return c;

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(0.55, '#1e3a8a');
  g.addColorStop(1, '#090d16');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  for (const [sx, sy, rad, col] of [
    [220, 60, 420, 'rgba(96, 165, 250, 0.35)'],
    [980, 60, 420, 'rgba(250, 204, 21, 0.28)'],
    [600, 320, 320, 'rgba(255, 255, 255, 0.24)'],
  ] as const) {
    const sg = x.createRadialGradient(sx, sy, 10, sx, sy, rad);
    sg.addColorStop(0, col);
    sg.addColorStop(1, 'transparent');
    x.fillStyle = sg;
    x.fillRect(0, 0, W, H);
  }

  // Stage platform & screen
  x.fillStyle = '#172554';
  x.fillRect(240, 500, 720, 96);
  x.fillStyle = '#facc15';
  x.fillRect(240, 500, 720, 5);
  x.fillStyle = '#1e293b';
  x.fillRect(465, 315, 270, 175);
  x.fillStyle = '#fde68a';
  x.fillRect(482, 332, 236, 130);

  // Speaker silhouette
  x.fillStyle = '#0f172a';
  x.beginPath();
  x.arc(600, 412, 22, 0, Math.PI * 2);
  x.fill();
  x.fillRect(580, 434, 40, 28);

  // Audience bokeh silhouettes
  const rand = mulberry32(42);
  for (let row = 0; row < 5; row++) {
    const yy = 635 + row * 48;
    for (let px = -20 + (row % 2) * 24; px < W + 30; px += 46) {
      const rad = 18 + row * 4;
      const jy = (rand() - 0.5) * 12;
      x.fillStyle = `rgba(${10 + row * 6}, ${14 + row * 6}, ${28 + row * 6}, 0.96)`;
      x.beginPath();
      x.arc(px, yy + jy, rad, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.ellipse(px, yy + jy + rad * 2.0, rad * 1.65, rad * 1.45, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  return c;
}

const heicCache = new WeakMap<File, Blob>();
let libheifPromise: Promise<any> | null = null;

function isHeicFile(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name || '') || /image\/hei[cf]/i.test(file.type || '');
}

function loadLibheif(): Promise<any> {
  if (libheifPromise) return libheifPromise;
  libheifPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif/libheif.js';
    s.onload = async () => {
      try {
        let lib = (window as any).libheif;
        if (typeof lib === 'function') lib = lib();
        if (lib && lib.ready) lib = await lib.ready;
        resolve(lib);
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error('HEIC reader could not be loaded'));
    document.head.appendChild(s);
  });
  libheifPromise.catch(() => {
    libheifPromise = null;
  });
  return libheifPromise;
}

async function convertHeicToJpegBlob(file: File): Promise<Blob> {
  const lib = await loadLibheif();
  const buf = new Uint8Array(await file.arrayBuffer());
  const imgs = new lib.HeifDecoder().decode(buf);
  if (!imgs || !imgs.length) throw new Error('No image found in HEIC file');
  const im = imgs[0];
  const w = im.get_width();
  const h = im.get_height();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const data = ctx.createImageData(w, h);
  await new Promise<void>((res, rej) =>
    im.display(data, (d: ImageData | null) => (d ? res() : rej(new Error('HEIC decode failed'))))
  );
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('HEIC encode failed'))), 'image/jpeg', 0.95)
  );
  c.width = 1;
  c.height = 1;
  return blob;
}

async function toReadableImageSource(file: File): Promise<Blob> {
  if (!isHeicFile(file)) return file;
  const cached = heicCache.get(file);
  if (cached) return cached;
  try {
    const bmp = await createImageBitmap(file);
    bmp.close();
    heicCache.set(file, file);
    return file;
  } catch {
    const jpg = await convertHeicToJpegBlob(file);
    heicCache.set(file, jpg);
    return jpg;
  }
}

export async function decodeBatchPhotoFile(
  file: File
): Promise<ImageBitmap | HTMLImageElement> {
  const readable = await toReadableImageSource(file);
  try {
    return await createImageBitmap(readable);
  } catch {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(readable);
      const im = new Image();
      im.onload = () => {
        resolve(im);
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      };
      im.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Unable to decode ${file.name}`));
      };
      im.src = url;
    });
  }
}

export async function createBatchPhotoThumbnailUrl(file: File): Promise<string> {
  const readable = await toReadableImageSource(file);
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(readable, { resizeWidth: 240, resizeQuality: 'medium' });
  } catch {
    bmp = await decodeBatchPhotoFile(file);
  }
  const bw = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth;
  const bh = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight;
  const k = Math.min(1, 240 / Math.max(bw, bh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bw * k));
  c.height = Math.max(1, Math.round(bh * k));
  const ctx = c.getContext('2d');
  ctx?.drawImage(bmp, 0, 0, c.width, c.height);
  if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
  const dataUrl = c.toDataURL('image/jpeg', 0.82);
  c.width = 1;
  c.height = 1;
  return dataUrl;
}
