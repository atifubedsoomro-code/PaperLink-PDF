import { PDFDocument } from 'pdf-lib';
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

export type LetterheadTemplateId =
  | 'executive-navy'
  | 'gold-monogram'
  | 'minimal-hairline'
  | 'diagonal-studio'
  | 'dual-accent-bar'
  | 'classic-chartered'
  | 'emerald-crest'
  | 'obsidian-tech'
  | 'medical-clean'
  | 'sidebar-strip'
  | 'archival-double'
  | 'royal-indigo';

export interface LetterheadTemplateDef {
  id: LetterheadTemplateId;
  name: string;
  category: 'Corporate' | 'Executive' | 'Minimalist' | 'Creative' | 'Official';
  description: string;
  primaryColor: string;
  accentColor: string;
  paperTint: string;
  layout:
    | 'top-band'
    | 'monogram-crest'
    | 'hairline'
    | 'diagonal-ribbon'
    | 'dual-bar'
    | 'chartered-double'
    | 'emerald-wave'
    | 'tech-grid'
    | 'clinical-cross'
    | 'left-spine'
    | 'bordered-seal'
    | 'indigo-block';
}

export const LETTERHEAD_TEMPLATES: LetterheadTemplateDef[] = [
  {
    id: 'executive-navy',
    name: 'Executive Navy Band',
    category: 'Executive',
    description: 'Deep slate top masthead with gold accent rule and crisp footer',
    primaryColor: '#0f172a',
    accentColor: '#d97706',
    paperTint: '#ffffff',
    layout: 'top-band',
  },
  {
    id: 'gold-monogram',
    name: 'Gilded Monogram Crest',
    category: 'Official',
    description: 'Centered emblem badge, heritage serif title & subtle center watermark',
    primaryColor: '#1e293b',
    accentColor: '#b45309',
    paperTint: '#fffdf8',
    layout: 'monogram-crest',
  },
  {
    id: 'minimal-hairline',
    name: 'Minimalist Swiss Hairline',
    category: 'Minimalist',
    description: 'Ultra-clean typographic header with razor-thin divider and wide whitespace',
    primaryColor: '#18181b',
    accentColor: '#2563eb',
    paperTint: '#ffffff',
    layout: 'hairline',
  },
  {
    id: 'diagonal-studio',
    name: 'Diagonal Architect Ribbon',
    category: 'Creative',
    description: 'Dynamic slanted top corner ribbon with matching bottom accent blade',
    primaryColor: '#1e1b4b',
    accentColor: '#ec4899',
    paperTint: '#ffffff',
    layout: 'diagonal-ribbon',
  },
  {
    id: 'dual-accent-bar',
    name: 'Dual Split Crimson & Slate',
    category: 'Corporate',
    description: 'Symmetric asymmetric split header for law, consulting & finance firms',
    primaryColor: '#1f2937',
    accentColor: '#b91c1c',
    paperTint: '#ffffff',
    layout: 'dual-bar',
  },
  {
    id: 'classic-chartered',
    name: 'Chartered Double Border',
    category: 'Official',
    description: 'Classic double-ruled archival frame suited for official notices & decrees',
    primaryColor: '#292524',
    accentColor: '#92400e',
    paperTint: '#fdfcf7',
    layout: 'chartered-double',
  },
  {
    id: 'emerald-crest',
    name: 'Emerald Growth Modern',
    category: 'Corporate',
    description: 'Crisp emerald top pill strip with bottom contact badge bar',
    primaryColor: '#064e3b',
    accentColor: '#10b981',
    paperTint: '#ffffff',
    layout: 'emerald-wave',
  },
  {
    id: 'obsidian-tech',
    name: 'Cyber & Engineering Grid',
    category: 'Creative',
    description: 'Precision monospace reference header with subtle corner alignment marks',
    primaryColor: '#09090b',
    accentColor: '#06b6d4',
    paperTint: '#ffffff',
    layout: 'tech-grid',
  },
  {
    id: 'medical-clean',
    name: 'Clinical & Advisory Blue',
    category: 'Executive',
    description: 'Clean teal-blue clinical masthead designed for clinics, labs & boards',
    primaryColor: '#0c4a6e',
    accentColor: '#0ea5e9',
    paperTint: '#ffffff',
    layout: 'clinical-cross',
  },
  {
    id: 'sidebar-strip',
    name: 'Vertical Left Spine',
    category: 'Minimalist',
    description: 'Continuous left vertical color column anchoring company identity',
    primaryColor: '#111827',
    accentColor: '#f59e0b',
    paperTint: '#ffffff',
    layout: 'left-spine',
  },
  {
    id: 'archival-double',
    name: 'Seal & Watermark Ledger',
    category: 'Official',
    description: 'Inset corner frame with prominent diagonal monogram watermark',
    primaryColor: '#312e81',
    accentColor: '#eab308',
    paperTint: '#ffffff',
    layout: 'bordered-seal',
  },
  {
    id: 'royal-indigo',
    name: 'Royal Studio Block',
    category: 'Executive',
    description: 'Bold indigo header card paired with structured two-column contact strip',
    primaryColor: '#3730a3',
    accentColor: '#f43f5e',
    paperTint: '#ffffff',
    layout: 'indigo-block',
  },
];

export interface LetterheadConfig {
  templateId: LetterheadTemplateId;
  primaryColor: string;
  accentColor: string;
  paperSize: 'a4' | 'letter';
  companyName: string;
  tagline: string;
  registrationNo: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  logoUrl?: string;
  showWatermark: boolean;
  showPageBorder: boolean;
  // Optional letter body content (users can leave blank for blank printable stationery!)
  includeSampleContent: boolean;
  refNumber: string;
  dateText: string;
  recipientBlock: string;
  subjectLine: string;
  bodyText: string;
  signerName: string;
  signerTitle: string;
  signatureUrl?: string;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (ctx.measureText(cand).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = cand;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderLetterheadToCanvas(
  config: LetterheadConfig,
  pixelWidth = 1240
): Promise<HTMLCanvasElement> {
  const tpl =
    LETTERHEAD_TEMPLATES.find((t) => t.id === config.templateId) || LETTERHEAD_TEMPLATES[0];
  const aspect = config.paperSize === 'letter' ? 11 / 8.5 : 841.89 / 595.28;
  const W = pixelWidth;
  const H = Math.round(pixelWidth * aspect);
  const s = W / 595.28; // scale relative to PDF pt

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const primary = config.primaryColor || tpl.primaryColor;
  const accent = config.accentColor || tpl.accentColor;

  // Base paper background
  ctx.fillStyle = tpl.paperTint || '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const logoImg = config.logoUrl ? await loadImg(config.logoUrl) : null;
  const sigImg = config.signatureUrl ? await loadImg(config.signatureUrl) : null;

  const padX = tpl.layout === 'left-spine' ? 64 * s : 46 * s;
  const contentW = W - padX - 42 * s;
  const company = (config.companyName || '').trim();
  const tagline = (config.tagline || '').trim();
  const initials = company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  // Optional Subtle Center Watermark Monogram / Logo
  if (config.showWatermark && (logoImg || initials)) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    if (logoImg) {
      const wmSize = 210 * s;
      const ratio = Math.min(wmSize / logoImg.naturalWidth, wmSize / logoImg.naturalHeight);
      const dw = logoImg.naturalWidth * ratio;
      const dh = logoImg.naturalHeight * ratio;
      ctx.drawImage(logoImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else if (initials) {
      ctx.fillStyle = primary;
      ctx.font = `900 ${Math.round(130 * s)}px "Plus Jakarta Sans", Georgia, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(W / 2, H / 2);
      ctx.rotate((-24 * Math.PI) / 180);
      ctx.fillText(initials, 0, 0);
    }
    ctx.restore();
  }

  // Optional crisp outer stationery border
  if (config.showPageBorder || tpl.layout === 'chartered-double' || tpl.layout === 'bordered-seal') {
    const m = 18 * s;
    ctx.save();
    ctx.strokeStyle = primary;
    ctx.lineWidth = tpl.layout === 'chartered-double' ? 2.2 * s : 1.2 * s;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    if (tpl.layout === 'chartered-double' || tpl.layout === 'bordered-seal') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.9 * s;
      ctx.strokeRect(m + 4.5 * s, m + 4.5 * s, W - (m + 4.5 * s) * 2, H - (m + 4.5 * s) * 2);
    }
    ctx.restore();
  }

  // Template Architectural Header Decorations
  let headerBottomY = 128 * s;

  if (tpl.layout === 'top-band' || tpl.layout === 'indigo-block') {
    const bandH = 108 * s;
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, W, bandH);
    ctx.fillStyle = accent;
    ctx.fillRect(0, bandH, W, 4 * s);

    let textX = padX;
    if (logoImg) {
      const maxH = 54 * s;
      const maxW = 120 * s;
      const r = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
      const dw = logoImg.naturalWidth * r;
      const dh = logoImg.naturalHeight * r;
      ctx.drawImage(logoImg, padX, (bandH - dh) / 2, dw, dh);
      textX += dw + 16 * s;
    }

    if (company) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(20 * s)}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(company.toUpperCase(), textX, 28 * s);
    }
    if (tagline) {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = `500 ${Math.round(10 * s)}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(tagline, textX, company ? 56 * s : 38 * s);
    }
    if (config.registrationNo) {
      ctx.fillStyle = accent;
      ctx.font = `700 ${Math.round(8.5 * s)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(config.registrationNo, W - 42 * s, 32 * s);
      ctx.textAlign = 'left';
    }
    headerBottomY = bandH + 28 * s;
  } else if (tpl.layout === 'monogram-crest') {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, W, 8 * s);
    let cy = 30 * s;
    if (logoImg) {
      const maxH = 44 * s;
      const r = Math.min((120 * s) / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
      const dw = logoImg.naturalWidth * r;
      const dh = logoImg.naturalHeight * r;
      ctx.drawImage(logoImg, (W - dw) / 2, cy, dw, dh);
      cy += dh + 10 * s;
    } else if (initials) {
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(W / 2, cy + 20 * s, 19 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = primary;
      ctx.font = `800 ${Math.round(13 * s)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, W / 2, cy + 20 * s);
      ctx.restore();
      cy += 48 * s;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (company) {
      ctx.fillStyle = primary;
      ctx.font = `700 ${Math.round(20 * s)}px Georgia, "Playfair Display", serif`;
      ctx.fillText(company, W / 2, cy);
      cy += 26 * s;
    }
    if (tagline) {
      ctx.fillStyle = '#52525b';
      ctx.font = `500 ${Math.round(9.5 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(tagline.toUpperCase(), W / 2, cy);
      cy += 16 * s;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(padX + 60 * s, cy + 8 * s);
    ctx.lineTo(W - padX - 60 * s, cy + 8 * s);
    ctx.stroke();
    ctx.textAlign = 'left';
    headerBottomY = cy + 24 * s;
  } else if (tpl.layout === 'diagonal-ribbon') {
    ctx.save();
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 64 * s);
    ctx.lineTo(0, 106 * s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, 106 * s);
    ctx.lineTo(W, 64 * s);
    ctx.lineTo(W, 71 * s);
    ctx.lineTo(0, 113 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    let tx = padX;
    if (logoImg) {
      const r = Math.min((100 * s) / logoImg.naturalWidth, (44 * s) / logoImg.naturalHeight);
      ctx.drawImage(logoImg, padX, 20 * s, logoImg.naturalWidth * r, logoImg.naturalHeight * r);
      tx += logoImg.naturalWidth * r + 14 * s;
    }
    if (company) {
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.font = `800 ${Math.round(18 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(company, tx, 24 * s);
    }
    if (tagline) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textBaseline = 'top';
      ctx.font = `500 ${Math.round(9.5 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(tagline, tx, company ? 49 * s : 28 * s);
    }
    headerBottomY = 128 * s;
  } else if (tpl.layout === 'left-spine') {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 26 * s, H);
    ctx.fillStyle = accent;
    ctx.fillRect(26 * s, 0, 4 * s, H);

    let tx = padX;
    if (logoImg) {
      const r = Math.min((96 * s) / logoImg.naturalWidth, (42 * s) / logoImg.naturalHeight);
      ctx.drawImage(logoImg, padX, 34 * s, logoImg.naturalWidth * r, logoImg.naturalHeight * r);
      tx += logoImg.naturalWidth * r + 14 * s;
    }
    if (company) {
      ctx.fillStyle = primary;
      ctx.textBaseline = 'top';
      ctx.font = `800 ${Math.round(20 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(company, tx, 36 * s);
    }
    if (tagline) {
      ctx.fillStyle = '#52525b';
      ctx.textBaseline = 'top';
      ctx.font = `500 ${Math.round(10 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(tagline, tx, company ? 62 * s : 40 * s);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(padX, 92 * s, contentW, 1.5 * s);
    headerBottomY = 112 * s;
  } else {
    // Clean / Hairline / Dual-bar / Clinical / Tech-grid / Chartered / Emerald / Bordered-seal
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, W * 0.65, 6 * s);
    ctx.fillStyle = accent;
    ctx.fillRect(W * 0.65, 0, W * 0.35, 6 * s);

    if (tpl.layout === 'tech-grid') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * s;
      // Top-left & Top-right corner brackets
      ctx.beginPath();
      ctx.moveTo(26 * s, 44 * s);
      ctx.lineTo(26 * s, 24 * s);
      ctx.lineTo(46 * s, 24 * s);
      ctx.moveTo(W - 46 * s, 24 * s);
      ctx.lineTo(W - 26 * s, 24 * s);
      ctx.lineTo(W - 26 * s, 44 * s);
      ctx.stroke();
    }

    let tx = padX;
    if (logoImg) {
      const maxH = 44 * s;
      const r = Math.min((110 * s) / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
      const dw = logoImg.naturalWidth * r;
      const dh = logoImg.naturalHeight * r;
      ctx.drawImage(logoImg, padX, 34 * s, dw, dh);
      tx += dw + 14 * s;
    }
    ctx.textBaseline = 'top';
    if (company) {
      ctx.fillStyle = primary;
      ctx.font =
        tpl.layout === 'chartered-double' || tpl.layout === 'bordered-seal'
          ? `700 ${Math.round(19 * s)}px Georgia, serif`
          : tpl.layout === 'tech-grid'
          ? `800 ${Math.round(18 * s)}px "Plus Jakarta Sans", sans-serif`
          : `800 ${Math.round(19 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(company, tx, 34 * s);
    }

    if (tagline) {
      ctx.fillStyle = accent;
      ctx.font = `600 ${Math.round(9.5 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(tagline, tx, company ? 59 * s : 38 * s);
    }

    // Right-aligned compact contact lines in header
    const rightMeta = [config.phone, config.email, config.website].filter(Boolean);
    if (rightMeta.length > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = `500 ${Math.round(8.5 * s)}px "Plus Jakarta Sans", sans-serif`;
      rightMeta.slice(0, 3).forEach((line, idx) => {
        ctx.fillText(line, W - 42 * s, (34 + idx * 13) * s);
      });
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = primary;
    ctx.fillRect(padX, 88 * s, contentW, tpl.layout === 'dual-bar' ? 2.2 * s : 1 * s);
    ctx.fillStyle = accent;
    ctx.fillRect(padX, 88 * s, 72 * s, tpl.layout === 'dual-bar' ? 2.2 * s : 1.5 * s);
    headerBottomY = 108 * s;
  }

  // Optional Letter Body (Reference, Date, Recipient, Subject, Paragraphs, Signature)
  const footerTopY = H - 72 * s;
  if (config.includeSampleContent) {
    let curY = headerBottomY + 8 * s;
    ctx.textBaseline = 'top';

    // Ref & Date row
    if (config.refNumber || config.dateText) {
      ctx.font = `600 ${Math.round(9.5 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#475569';
      if (config.refNumber) ctx.fillText(`Ref: ${config.refNumber}`, padX, curY);
      if (config.dateText) {
        ctx.textAlign = 'right';
        ctx.fillText(config.dateText, W - 42 * s, curY);
        ctx.textAlign = 'left';
      }
      curY += 22 * s;
    }

    // Recipient block
    if (config.recipientBlock.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `500 ${Math.round(10 * s)}px "Plus Jakarta Sans", sans-serif`;
      for (const rLine of config.recipientBlock.split(/\r?\n/)) {
        ctx.fillText(rLine, padX, curY);
        curY += 14.5 * s;
      }
      curY += 12 * s;
    }

    // Subject Line
    if (config.subjectLine.trim()) {
      ctx.fillStyle = primary;
      ctx.font = `700 ${Math.round(11 * s)}px "Plus Jakarta Sans", sans-serif`;
      const subjLines = wrapCanvasText(ctx, `Subject: ${config.subjectLine.trim()}`, contentW);
      for (const sl of subjLines) {
        ctx.fillText(sl, padX, curY);
        curY += 16 * s;
      }
      curY += 10 * s;
    }

    // Letter Body Paragraphs & Bullets
    if (config.bodyText.trim()) {
      ctx.fillStyle = '#1e293b';
      ctx.font = `400 ${Math.round(10.2 * s)}px "Plus Jakarta Sans", sans-serif`;
      const rawLines = config.bodyText.split(/\r?\n/);
      for (const rawLine of rawLines) {
        if (curY > footerTopY - 96 * s) break;
        const trimmed = rawLine.trim();
        if (!trimmed) {
          curY += 9 * s;
          continue;
        }
        const wrapped = wrapCanvasText(ctx, trimmed, contentW);
        for (const wl of wrapped) {
          if (curY > footerTopY - 96 * s) break;
          ctx.fillText(wl, padX, curY);
          curY += 15 * s;
        }
      }
    }

    // Signature Block (only render if signature image, name, or title is provided)
    if (sigImg || config.signerName.trim() || config.signerTitle.trim()) {
      const sigBaseY = Math.min(footerTopY - 78 * s, Math.max(curY + 24 * s, footerTopY - 120 * s));
      if (sigImg) {
        const r = Math.min((120 * s) / sigImg.naturalWidth, (38 * s) / sigImg.naturalHeight);
        ctx.drawImage(sigImg, padX, sigBaseY, sigImg.naturalWidth * r, sigImg.naturalHeight * r);
      }
      const lineY = sigBaseY + 42 * s;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      ctx.moveTo(padX, lineY);
      ctx.lineTo(padX + 165 * s, lineY);
      ctx.stroke();

      if (config.signerName.trim()) {
        ctx.fillStyle = primary;
        ctx.font = `700 ${Math.round(10 * s)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(config.signerName.trim(), padX, lineY + 6 * s);
      }
      if (config.signerTitle.trim()) {
        ctx.fillStyle = '#64748b';
        ctx.font = `500 ${Math.round(8.8 * s)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(config.signerTitle.trim(), padX, lineY + 20 * s);
      }
    }
  }

  // Footer Contact & Address Bar
  ctx.fillStyle = accent;
  ctx.fillRect(padX, footerTopY, 44 * s, 2 * s);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(padX + 48 * s, footerTopY + 0.5 * s, contentW - 48 * s, 0.8 * s);

  const contactBits = [config.phone, config.email, config.website].filter(Boolean);
  ctx.fillStyle = '#334155';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(8.5 * s)}px "Plus Jakarta Sans", sans-serif`;
  if (contactBits.length > 0) {
    ctx.fillText(contactBits.join('   ·   '), padX, footerTopY + 10 * s);
  }
  if (config.address.trim()) {
    ctx.fillStyle = '#64748b';
    ctx.font = `400 ${Math.round(8.2 * s)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(config.address.trim(), padX, footerTopY + 24 * s);
  }
  if (config.registrationNo && tpl.layout !== 'top-band' && tpl.layout !== 'indigo-block') {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${Math.round(8 * s)}px "JetBrains Mono", monospace`;
    ctx.fillText(config.registrationNo, W - 42 * s, footerTopY + 10 * s);
    ctx.textAlign = 'left';
  }

  return canvas;
}

export async function generateLetterheadPdf(config: LetterheadConfig): Promise<{
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
}> {
  const canvas = await renderLetterheadToCanvas(config, 1654); // Crisp ~200 DPI A4/Letter
  const pngUrl = canvas.toDataURL('image/png');
  const pngBytes = await fetch(pngUrl).then((r) => r.arrayBuffer());

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');
  pdfDoc.setTitle(`${config.companyName || 'Company'} Letterhead`);

  const dims =
    config.paperSize === 'letter'
      ? { width: 612, height: 792 }
      : { width: 595.28, height: 841.89 };
  const page = pdfDoc.addPage([dims.width, dims.height]);
  const embedded = await pdfDoc.embedPng(new Uint8Array(pngBytes));
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: dims.width,
    height: dims.height,
  });

  const saved = await pdfDoc.save({ useObjectStreams: true });
  const bytes = new Uint8Array(saved).slice();
  const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
  const slug = (config.companyName || 'company_letterhead')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return {
    blob,
    bytes,
    fileName: `${slug || 'company'}_letterhead.pdf`,
  };
}

function normalizeDocxHex(color: string | undefined, fallback: string): string {
  const cleaned = (color || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

async function imageSrcToDocxPng(
  src: string,
  maxWidthPx: number,
  maxHeightPx: number
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  const img = await loadImg(src);
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const ratio = Math.min(maxWidthPx / img.naturalWidth, maxHeightPx / img.naturalHeight, 1);
  const w = Math.max(12, Math.round(img.naturalWidth * ratio));
  const h = Math.max(12, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { data: bytes, width: w, height: h };
}

export async function generateLetterheadDocx(config: LetterheadConfig): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const tpl =
    LETTERHEAD_TEMPLATES.find((t) => t.id === config.templateId) || LETTERHEAD_TEMPLATES[0];
  const primaryHex = normalizeDocxHex(config.primaryColor || tpl.primaryColor, '0F172A');
  const accentHex = normalizeDocxHex(config.accentColor || tpl.accentColor, 'D97706');

  const company = (config.companyName || '').trim();
  const tagline = (config.tagline || '').trim();
  const regNo = (config.registrationNo || '').trim();
  const contactBits = [config.phone, config.email, config.website]
    .map((v) => v.trim())
    .filter(Boolean);
  const address = (config.address || '').trim();

  const logoAsset = config.logoUrl ? await imageSrcToDocxPng(config.logoUrl, 130, 56) : null;
  const sigAsset =
    config.includeSampleContent && config.signatureUrl
      ? await imageSrcToDocxPng(config.signatureUrl, 150, 52)
      : null;

  const isBandHeader =
    tpl.layout === 'top-band' ||
    tpl.layout === 'indigo-block' ||
    tpl.layout === 'diagonal-ribbon';
  const isCenteredHeader = tpl.layout === 'monogram-crest';

  const headerParagraphs: (Paragraph | Table)[] = [];

  if (isBandHeader) {
    const leftCellChildren: Paragraph[] = [];
    if (logoAsset) {
      leftCellChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new ImageRun({
              data: logoAsset.data,
              transformation: { width: logoAsset.width, height: logoAsset.height },
              type: 'png',
            }),
          ],
        })
      );
    }
    if (company) {
      leftCellChildren.push(
        new Paragraph({
          spacing: { after: tagline ? 40 : 0 },
          children: [
            new TextRun({
              text: company.toUpperCase(),
              bold: true,
              size: 30,
              color: 'FFFFFF',
              font: 'Calibri',
            }),
          ],
        })
      );
    }
    if (tagline) {
      leftCellChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: tagline,
              size: 19,
              color: 'E2E8F0',
              font: 'Calibri',
            }),
          ],
        })
      );
    }
    if (leftCellChildren.length === 0) {
      leftCellChildren.push(new Paragraph({ children: [] }));
    }

    const rightCellChildren: Paragraph[] = [];
    if (regNo) {
      rightCellChildren.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: regNo,
              bold: true,
              size: 17,
              color: accentHex,
              font: 'Consolas',
            }),
          ],
        })
      );
    }
    contactBits.slice(0, 3).forEach((c) => {
      rightCellChildren.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: c,
              size: 17,
              color: 'F1F5F9',
              font: 'Calibri',
            }),
          ],
        })
      );
    });
    if (rightCellChildren.length === 0) {
      rightCellChildren.push(new Paragraph({ children: [] }));
    }

    headerParagraphs.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, fill: primaryHex, color: 'auto' },
                margins: { top: 180, bottom: 180, left: 220, right: 140 },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  bottom: { style: BorderStyle.SINGLE, size: 24, color: accentHex },
                },
                children: leftCellChildren,
              }),
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, fill: primaryHex, color: 'auto' },
                margins: { top: 180, bottom: 180, left: 120, right: 220 },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  bottom: { style: BorderStyle.SINGLE, size: 24, color: accentHex },
                },
                children: rightCellChildren,
              }),
            ],
          }),
        ],
      })
    );
  } else if (isCenteredHeader) {
    if (logoAsset) {
      headerParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new ImageRun({
              data: logoAsset.data,
              transformation: { width: logoAsset.width, height: logoAsset.height },
              type: 'png',
            }),
          ],
        })
      );
    }
    if (company) {
      headerParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: company,
              bold: true,
              size: 32,
              color: primaryHex,
              font: 'Georgia',
            }),
          ],
        })
      );
    }
    if (tagline) {
      headerParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: tagline.toUpperCase(),
              size: 18,
              color: '52525B',
              font: 'Calibri',
            }),
          ],
        })
      );
    }
    headerParagraphs.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 12, color: accentHex },
        },
        spacing: { after: 120 },
        children: [],
      })
    );
  } else {
    const leftCellChildren: Paragraph[] = [];
    if (logoAsset) {
      leftCellChildren.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new ImageRun({
              data: logoAsset.data,
              transformation: { width: logoAsset.width, height: logoAsset.height },
              type: 'png',
            }),
          ],
        })
      );
    }
    if (company) {
      leftCellChildren.push(
        new Paragraph({
          spacing: { after: 30 },
          children: [
            new TextRun({
              text: company,
              bold: true,
              size: 30,
              color: primaryHex,
              font: 'Calibri',
            }),
          ],
        })
      );
    }
    if (tagline) {
      leftCellChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: tagline,
              bold: true,
              size: 18,
              color: accentHex,
              font: 'Calibri',
            }),
          ],
        })
      );
    }
    if (leftCellChildren.length === 0) {
      leftCellChildren.push(new Paragraph({ children: [] }));
    }

    const rightCellChildren: Paragraph[] = contactBits.slice(0, 3).map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: line,
              size: 17,
              color: '475569',
              font: 'Calibri',
            }),
          ],
        })
    );
    if (rightCellChildren.length === 0) {
      rightCellChildren.push(new Paragraph({ children: [] }));
    }

    headerParagraphs.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 62, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 120, left: 0, right: 120 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 18, color: primaryHex },
                  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  bottom: { style: BorderStyle.SINGLE, size: 12, color: accentHex },
                },
                children: leftCellChildren,
              }),
              new TableCell({
                width: { size: 38, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 120, left: 100, right: 0 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 18, color: accentHex },
                  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  bottom: { style: BorderStyle.SINGLE, size: 12, color: primaryHex },
                },
                children: rightCellChildren,
              }),
            ],
          }),
        ],
      })
    );
  }

  const footerParagraphs: Paragraph[] = [];
  footerParagraphs.push(
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 8, color: accentHex },
      },
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({
          text: contactBits.join('   ·   ') || company || '',
          bold: true,
          size: 17,
          color: '334155',
          font: 'Calibri',
        }),
      ],
    })
  );
  if (address || regNo) {
    footerParagraphs.push(
      new Paragraph({
        children: [
          ...(address
            ? [
                new TextRun({
                  text: address,
                  size: 16,
                  color: '64748B',
                  font: 'Calibri',
                }),
              ]
            : []),
          ...(regNo
            ? [
                new TextRun({
                  text: address ? `   ·   ${regNo}` : regNo,
                  size: 16,
                  color: '64748B',
                  font: 'Consolas',
                }),
              ]
            : []),
        ],
      })
    );
  }

  const bodyChildren: (Paragraph | Table)[] = [];
  if (config.includeSampleContent) {
    if (config.refNumber.trim() || config.dateText.trim()) {
      bodyChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  },
                  children: [
                    new Paragraph({
                      children: config.refNumber.trim()
                        ? [
                            new TextRun({
                              text: `Ref: ${config.refNumber.trim()}`,
                              bold: true,
                              size: 19,
                              color: '475569',
                            }),
                          ]
                        : [],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                    bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: config.dateText.trim()
                        ? [
                            new TextRun({
                              text: config.dateText.trim(),
                              bold: true,
                              size: 19,
                              color: '475569',
                            }),
                          ]
                        : [],
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
      bodyChildren.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
    }

    if (config.recipientBlock.trim()) {
      config.recipientBlock.split(/\r?\n/).forEach((line, idx, arr) => {
        bodyChildren.push(
          new Paragraph({
            spacing: { after: idx === arr.length - 1 ? 180 : 40 },
            children: [
              new TextRun({
                text: line,
                size: 21,
                color: '0F172A',
              }),
            ],
          })
        );
      });
    }

    if (config.subjectLine.trim()) {
      bodyChildren.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [
            new TextRun({
              text: `Subject: ${config.subjectLine.trim()}`,
              bold: true,
              size: 22,
              color: primaryHex,
            }),
          ],
        })
      );
    }

    if (config.bodyText.trim()) {
      config.bodyText.split(/\r?\n/).forEach((rawLine) => {
        const trimmed = rawLine.trim();
        bodyChildren.push(
          new Paragraph({
            spacing: { after: trimmed ? 120 : 140, line: 276 },
            children: trimmed
              ? [
                  new TextRun({
                    text: trimmed,
                    size: 21,
                    color: '1E293B',
                  }),
                ]
              : [],
          })
        );
      });
    }

    if (sigAsset || config.signerName.trim() || config.signerTitle.trim()) {
      bodyChildren.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
      if (sigAsset) {
        bodyChildren.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new ImageRun({
                data: sigAsset.data,
                transformation: { width: sigAsset.width, height: sigAsset.height },
                type: 'png',
              }),
            ],
          })
        );
      }
      bodyChildren.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: '____________________________',
              size: 20,
              color: '94A3B8',
            }),
          ],
        })
      );
      if (config.signerName.trim()) {
        bodyChildren.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: config.signerName.trim(),
                bold: true,
                size: 21,
                color: primaryHex,
              }),
            ],
          })
        );
      }
      if (config.signerTitle.trim()) {
        bodyChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: config.signerTitle.trim(),
                size: 18,
                color: '64748B',
              }),
            ],
          })
        );
      }
    }
  } else {
    bodyChildren.push(
      new Paragraph({ spacing: { before: 240, after: 240 }, children: [] }),
      new Paragraph({ spacing: { after: 240 }, children: [] })
    );
  }

  const pageSize =
    config.paperSize === 'letter'
      ? { width: 12240, height: 15840 }
      : { width: 11906, height: 16838 };

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            size: pageSize,
            margin: { top: 1400, bottom: 1200, left: 1080, right: 1080, header: 540, footer: 540 },
          },
        },
        headers: {
          default: new Header({ children: headerParagraphs }),
        },
        footers: {
          default: new Footer({ children: footerParagraphs }),
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const slug = (config.companyName || 'company_letterhead')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return {
    blob,
    fileName: `${slug || 'company'}_letterhead.docx`,
  };
}

export function buildLetterheadMailtoHref(
  config: LetterheadConfig,
  recipientEmail?: string
): string {
  const company = config.companyName.trim();
  const subject =
    config.subjectLine.trim() ||
    (company ? `${company} — Official Correspondence` : 'Official Letterhead Correspondence');

  const sections: string[] = [];
  if (company) {
    sections.push(company.toUpperCase());
    if (config.tagline.trim()) sections.push(config.tagline.trim());
    sections.push('');
  }

  if (config.refNumber.trim() || config.dateText.trim()) {
    const metaParts: string[] = [];
    if (config.refNumber.trim()) metaParts.push(`Ref: ${config.refNumber.trim()}`);
    if (config.dateText.trim()) metaParts.push(`Date: ${config.dateText.trim()}`);
    sections.push(metaParts.join('  |  '));
    sections.push('');
  }

  if (config.recipientBlock.trim()) {
    sections.push(config.recipientBlock.trim());
    sections.push('');
  }

  if (config.bodyText.trim()) {
    sections.push(config.bodyText.trim());
    sections.push('');
  }

  const signOff: string[] = [];
  if (config.signerName.trim()) signOff.push(config.signerName.trim());
  if (config.signerTitle.trim()) signOff.push(config.signerTitle.trim());
  if (company && !signOff.includes(company)) signOff.push(company);
  const contactLine = [config.phone.trim(), config.email.trim(), config.website.trim()]
    .filter(Boolean)
    .join(' · ');
  if (contactLine) signOff.push(contactLine);
  if (config.address.trim()) signOff.push(config.address.trim());

  if (signOff.length > 0) {
    sections.push('---');
    sections.push(...signOff);
  }

  const body = sections.join('\n').slice(0, 1450);
  const to = (recipientEmail || '').trim();
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

