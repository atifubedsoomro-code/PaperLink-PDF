import { PdfStampShape } from '../types';

export interface StampRenderInput {
  text?: string;
  subtext?: string;
  shape?: PdfStampShape;
  color?: string;
}

export const STAMP_INK_PALETTE: { label: string; value: string }[] = [
  { label: 'Crimson Red', value: '#dc2626' },
  { label: 'Approval Emerald', value: '#059669' },
  { label: 'Official Blue', value: '#2563eb' },
  { label: 'Royal Indigo', value: '#4338ca' },
  { label: 'Amber Gold', value: '#b45309' },
  { label: 'Graphite Ink', value: '#0f172a' },
];

export const QUICK_STAMP_PHRASES: {
  text: string;
  subtext?: string;
  shape: PdfStampShape;
  color: string;
}[] = [
  { text: 'APPROVED', subtext: 'AUTHORIZED', shape: 'double-rect', color: '#059669' },
  { text: 'CONFIDENTIAL', subtext: 'INTERNAL ONLY', shape: 'rect', color: '#dc2626' },
  { text: 'VERIFIED', subtext: 'CHECKED', shape: 'round', color: '#2563eb' },
  { text: 'DRAFT', subtext: 'REVIEW COPY', shape: 'solid-badge', color: '#b45309' },
];

/**
 * Renders an unrotated high-DPI transparent PNG data URL for any custom text stamp.
 * Rotation and placement are applied identically by both CoverPreview (CSS) and pdfService (PDF points).
 */
export function renderCustomTextStampDataUrl(
  input: StampRenderInput,
  baseWidthPx = 420
): string {
  if (typeof document === 'undefined') return '';
  const shape: PdfStampShape = input.shape || 'rect';
  const color = input.color || '#dc2626';
  const label = (input.text || 'APPROVED').trim().toUpperCase().slice(0, 48) || 'APPROVED';
  const sub = (input.subtext || '').trim().toUpperCase().slice(0, 48);

  const cw = Math.max(160, Math.round(baseWidthPx));
  const ch = shape === 'round' ? cw : Math.round(cw * 0.42);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2, ch / 2);

  if (shape === 'round') {
    const radius = Math.max(24, cw * 0.45);
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(3, radius * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = Math.max(1.5, radius * 0.032);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.84, 0, Math.PI * 2);
    ctx.stroke();

    let fs = Math.max(12, radius * 0.34);
    ctx.font = `900 ${fs}px Inter, Arial, sans-serif`;
    while (fs > 10 && ctx.measureText(label).width > radius * 1.54) {
      fs -= 1;
      ctx.font = `900 ${fs}px Inter, Arial, sans-serif`;
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, sub ? -fs * 0.28 : 0);

    if (sub) {
      let sfs = Math.max(9, fs * 0.46);
      ctx.font = `700 ${sfs}px "JetBrains Mono", monospace`;
      while (sfs > 8 && ctx.measureText(sub).width > radius * 1.42) {
        sfs -= 1;
        ctx.font = `700 ${sfs}px "JetBrains Mono", monospace`;
      }
      ctx.fillText(sub, 0, fs * 0.56);
    }
  } else {
    const pad = Math.max(6, Math.round(cw * 0.025));
    const rw = cw - pad * 2;
    const rh = ch - pad * 2;
    const r = Math.max(8, Math.round(rh * 0.14));

    ctx.beginPath();
    ctx.roundRect(-rw / 2, -rh / 2, rw, rh, r);
    if (shape === 'solid-badge') {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, rh * 0.08);
      ctx.stroke();

      if (shape === 'double-rect') {
        const inset = Math.max(6, Math.round(rh * 0.085));
        ctx.lineWidth = Math.max(1.5, rh * 0.032);
        ctx.beginPath();
        ctx.roundRect(
          -rw / 2 + inset,
          -rh / 2 + inset,
          rw - inset * 2,
          rh - inset * 2,
          Math.max(4, r - 3)
        );
        ctx.stroke();
      }
    }

    let fs = Math.max(14, Math.min(rh * (sub ? 0.37 : 0.48), 54));
    ctx.font = `900 ${fs}px Inter, Arial, sans-serif`;
    while (fs > 10 && ctx.measureText(label).width > rw * 0.85) {
      fs -= 1;
      ctx.font = `900 ${fs}px Inter, Arial, sans-serif`;
    }
    ctx.fillStyle = shape === 'solid-badge' ? '#ffffff' : color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, sub ? -rh * 0.14 : 0);

    if (sub) {
      let sfs = Math.max(9, Math.min(fs * 0.46, 20));
      ctx.font = `700 ${sfs}px "JetBrains Mono", monospace`;
      while (sfs > 8 && ctx.measureText(sub).width > rw * 0.84) {
        sfs -= 1;
        ctx.font = `700 ${sfs}px "JetBrains Mono", monospace`;
      }
      ctx.fillText(sub, 0, rh * 0.23);
    }
  }

  ctx.restore();
  return canvas.toDataURL('image/png');
}
