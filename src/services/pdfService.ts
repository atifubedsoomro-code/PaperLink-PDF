import { PDFDocument, PDFPage, PDFFont, rgb, degrees, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { AppliedPdfStamp, CoverData, CoverDraggableKey, FontStyle, PdfStampPlacement } from '../types';
import { COVER_THEMES } from '../constants/themes';
import {
  getCoverFontCssFamily,
  hasBannerHeaderLayout,
  isCenteredCoverLayout,
  parseSummaryLines,
  resolveEffectiveColors,
} from '../utils/coverFormatting';
import { renderCustomTextStampDataUrl } from '../utils/stampRenderer';

/**
 * Standard paper dimensions in PDF points (72 points per inch)
 */
export const PAPER_SIZES = {
  a4: { width: 595.28, height: 841.89 }, // 210mm x 297mm
  letter: { width: 612.0, height: 792.0 }, // 8.5" x 11"
};

/** Reference preview width in CoverPreview.tsx so every point scales 1:1 */
const PREVIEW_PAPER_W = 500;

const HAS_NON_WINANSI_RE = /[^\x09\x0A\x0D\x20-\xFF]/;
const HAS_RTL_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function hexToCss(hex?: string, fallback = '#000000'): string {
  return hex && hex.startsWith('#') && hex.length >= 7 ? hex : fallback;
}

function hexToPdfRgb(hex?: string, fallback = '#000000') {
  const target = hexToCss(hex, fallback);
  const cleanHex = target.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

/**
 * Normalizes smart punctuation for WinAnsi vector drawing when canvas fallback is unavailable.
 */
function sanitizeWinAnsiText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u00B7]/g, '-')
    .replace(/[^\x00-\xFF]/g, ' ')
    .trim();
}

function getCssFontFamily(fontStyle: FontStyle): string {
  return getCoverFontCssFamily(fontStyle);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function drawDashedRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  borderWidth: number,
  color: ReturnType<typeof rgb>,
  dash = 8,
  gap = 5
) {
  const drawDashedLine = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return;
    const ux = dx / len;
    const uy = dy / len;
    let pos = 0;
    while (pos < len) {
      const segEnd = Math.min(len, pos + dash);
      page.drawLine({
        start: { x: x1 + ux * pos, y: y1 + uy * pos },
        end: { x: x1 + ux * segEnd, y: y1 + uy * segEnd },
        thickness: borderWidth,
        color,
      });
      pos += dash + gap;
    }
  };
  drawDashedLine(x, y + height, x + width, y + height);
  drawDashedLine(x + width, y + height, x + width, y);
  drawDashedLine(x + width, y, x, y);
  drawDashedLine(x, y, x, y + height);
}

function wrapLinesWithCanvasCtx(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          let chunk = '';
          for (const ch of Array.from(word)) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

interface MeasuredCanvasBlock {
  lines: string[];
  width: number;
  height: number;
  dataUrl: string;
}

function renderRichTextBlockToPng(options: {
  text: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  italic?: boolean;
  underline?: boolean;
  fontFamily: string;
  colorHex: string;
  opacity?: number;
  align: 'left' | 'center' | 'right';
}): MeasuredCanvasBlock | null {
  if (typeof document === 'undefined' || !options.text) return null;

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) return null;

  const fontPrefix = `${options.italic ? 'italic ' : ''}${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  measureCtx.font = fontPrefix;

  const lines = wrapLinesWithCanvasCtx(measureCtx, options.text, Math.max(20, options.maxWidth));
  if (lines.length === 0) return null;

  const scale = 3.5;
  const blockW = Math.max(12, Math.ceil(options.maxWidth));
  const blockH = Math.max(
    12,
    Math.ceil(lines.length * options.lineHeight + options.fontSize * 0.35)
  );

  canvas.width = Math.ceil(blockW * scale);
  canvas.height = Math.ceil(blockH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.font = fontPrefix;
  ctx.fillStyle = options.colorHex;
  ctx.strokeStyle = options.colorHex;
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, idx) => {
    if (!line) return;
    const isRtl = HAS_RTL_RE.test(line);
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    const baselineY = options.fontSize * 0.92 + idx * options.lineHeight;
    let drawX = 0;
    if (options.align === 'center') {
      ctx.textAlign = 'center';
      drawX = blockW / 2;
    } else if (options.align === 'right' || isRtl) {
      ctx.textAlign = 'right';
      drawX = blockW;
    } else {
      ctx.textAlign = 'left';
      drawX = 0;
    }
    ctx.fillText(line, drawX, baselineY);

    if (options.underline) {
      const measuredW = Math.min(blockW, ctx.measureText(line).width);
      const uY = baselineY + Math.max(1.2, options.fontSize * 0.12);
      const uStart =
        options.align === 'center'
          ? (blockW - measuredW) / 2
          : options.align === 'right' || isRtl
          ? blockW - measuredW
          : 0;
      ctx.lineWidth = Math.max(1, options.fontSize * 0.065);
      ctx.beginPath();
      ctx.moveTo(uStart, uY);
      ctx.lineTo(uStart + measuredW, uY);
      ctx.stroke();
    }
  });

  return {
    lines,
    width: blockW,
    height: blockH,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

function renderSummaryBlockToPng(options: {
  rawSummary: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  italic?: boolean;
  underline?: boolean;
  fontFamily: string;
  textColorHex: string;
  accentColorHex: string;
  centered: boolean;
  scalePt: number;
}): { width: number; height: number; dataUrl: string } | null {
  if (typeof document === 'undefined' || !options.rawSummary) return null;
  const parsed = parseSummaryLines(options.rawSummary);
  if (parsed.length === 0) return null;

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) return null;

  const normalFont = `${options.italic ? 'italic ' : ''}${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  const boldMarkerFont = `${options.italic ? 'italic ' : ''}700 ${options.fontSize}px ${options.fontFamily}`;
  const blockW = Math.max(20, Math.ceil(options.maxWidth));
  const blankGap = 6 * options.scalePt;
  const lineGap = 3 * options.scalePt;
  const indentUnit = 12 * options.scalePt;
  const markerGap = 6 * options.scalePt;

  interface LayoutRow {
    y: number;
    kind: 'paragraph' | 'bullet' | 'numbered';
    marker?: string;
    markerW: number;
    indentX: number;
    wrappedLines: string[];
  }

  const rows: LayoutRow[] = [];
  let curY = 0;

  for (const item of parsed) {
    if (item.kind === 'blank') {
      curY += blankGap + lineGap;
      continue;
    }

    const indentX = options.centered ? 0 : item.indentLevel * indentUnit;
    measureCtx.font = boldMarkerFont;
    const markerW = item.marker ? measureCtx.measureText(item.marker).width + markerGap : 0;
    const availW = Math.max(40, blockW - indentX - markerW);

    measureCtx.font = normalFont;
    const wrapped = wrapLinesWithCanvasCtx(measureCtx, item.text, availW);
    const safeWrapped = wrapped.length > 0 ? wrapped : [''];

    rows.push({
      y: curY,
      kind: item.kind,
      marker: item.marker,
      markerW,
      indentX,
      wrappedLines: safeWrapped,
    });

    curY += safeWrapped.length * options.lineHeight + lineGap;
  }

  if (rows.length === 0) return null;

  const blockH = Math.max(12, Math.ceil(curY + options.fontSize * 0.3));
  const dpr = 3.5;
  canvas.width = Math.ceil(blockW * dpr);
  canvas.height = Math.ceil(blockH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'alphabetic';

  for (const row of rows) {
    const firstBaselineY = row.y + options.fontSize * 0.95;
    let totalVisualW = 0;
    if (options.centered && row.wrappedLines.length === 1) {
      ctx.font = normalFont;
      totalVisualW = row.markerW + ctx.measureText(row.wrappedLines[0]).width;
    }

    const startX =
      options.centered && row.wrappedLines.length === 1 && row.marker
        ? Math.max(0, (blockW - totalVisualW) / 2)
        : row.indentX;

    if (row.marker) {
      ctx.font = boldMarkerFont;
      ctx.fillStyle = options.accentColorHex;
      ctx.textAlign = 'left';
      ctx.fillText(row.marker, startX, firstBaselineY);
    }

    ctx.font = normalFont;
    ctx.fillStyle = options.textColorHex;
    ctx.strokeStyle = options.textColorHex;

    row.wrappedLines.forEach((line, idx) => {
      if (!line) return;
      const baselineY = firstBaselineY + idx * options.lineHeight;
      const isRtl = HAS_RTL_RE.test(line);
      ctx.direction = isRtl ? 'rtl' : 'ltr';

      let drawX: number;
      if (options.centered && !row.marker) {
        ctx.textAlign = 'center';
        drawX = blockW / 2;
      } else if (isRtl) {
        ctx.textAlign = 'right';
        drawX = blockW;
      } else {
        ctx.textAlign = 'left';
        drawX = startX + row.markerW;
      }

      ctx.fillText(line, drawX, baselineY);

      if (options.underline) {
        const w = Math.min(blockW, ctx.measureText(line).width);
        const uY = baselineY + Math.max(1, options.fontSize * 0.12);
        const uStart =
          options.centered && !row.marker
            ? (blockW - w) / 2
            : isRtl
            ? blockW - w
            : drawX;
        ctx.lineWidth = Math.max(0.9, options.fontSize * 0.065);
        ctx.beginPath();
        ctx.moveTo(uStart, uY);
        ctx.lineTo(uStart + w, uY);
        ctx.stroke();
      }
    });
  }

  return {
    width: blockW,
    height: blockH,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

/**
 * Fetch image bytes as Uint8Array (raw fallback if canvas rendering is unavailable)
 */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png' } | null> {
  try {
    if (url.startsWith('data:image/')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || '';
      const bytes = dataUrlToUint8Array(url);
      return { bytes, format: mime.includes('png') ? 'png' : 'jpg' };
    }

    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || '';
    const format = contentType.includes('png') || url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    return { bytes: new Uint8Array(arrayBuffer), format };
  } catch (err) {
    console.warn('Could not fetch image for PDF embedding:', err);
    return null;
  }
}

/**
 * Normalize an image to clean PNG/JPG bytes via canvas (supports WebP, SVG, transparent logos/signatures)
 */
async function embedAnyImage(
  pdfDoc: PDFDocument,
  url: string
): Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>> | null> {
  try {
    if (typeof document !== 'undefined') {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = url;
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          return await pdfDoc.embedPng(dataUrlToUint8Array(canvas.toDataURL('image/png')));
        }
      }
    }
    const raw = await fetchImageBytes(url);
    if (!raw) return null;
    return raw.format === 'png'
      ? await pdfDoc.embedPng(raw.bytes)
      : await pdfDoc.embedJpg(raw.bytes);
  } catch (err) {
    console.warn('Image embed failed:', err);
    return null;
  }
}

/**
 * Render an image with CSS `object-cover` center-crop mathematics onto a high-DPI canvas
 * so banner images & full-page watermarks never stretch or distort in PDF output.
 */
async function renderCroppedCoverImageBytes(
  url: string,
  targetWidthPt: number,
  targetHeightPt: number,
  options: { withBannerScrim?: boolean; imageOpacity?: number } = {}
): Promise<{ bytes: Uint8Array; format: 'png' | 'jpg' } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = url;
    });

    const dpiScale = 2;
    const canvasW = Math.max(1, Math.round(targetWidthPt * dpiScale));
    const canvasH = Math.max(1, Math.round(targetHeightPt * dpiScale));
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return await fetchImageBytes(url);

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) return await fetchImageBytes(url);

    const coverScale = Math.max(canvasW / naturalW, canvasH / naturalH);
    const drawW = naturalW * coverScale;
    const drawH = naturalH * coverScale;
    const dx = (canvasW - drawW) / 2;
    const dy = (canvasH - drawH) / 2;

    ctx.save();
    if (options.imageOpacity !== undefined) {
      ctx.globalAlpha = Math.max(0.05, Math.min(1, options.imageOpacity));
    }
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();

    if (options.withBannerScrim) {
      const grad = ctx.createLinearGradient(0, canvasH, 0, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.70)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    const mime = options.withBannerScrim ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mime, 0.92);
    return { bytes: dataUrlToUint8Array(dataUrl), format: mime === 'image/png' ? 'png' : 'jpg' };
  } catch {
    return await fetchImageBytes(url);
  }
}

/**
 * Pixel-accurate text wrapper fallback for non-DOM environments.
 */
function wrapTextByWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizeWinAnsiText(text);
  if (!clean) return [];

  const paragraphs = clean.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          let chunk = '';
          for (const ch of word) {
            const testChunk = chunk + ch;
            if (font.widthOfTextAtSize(testChunk, fontSize) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk = testChunk;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * Generate a standalone high-resolution Cover Page PDF document that matches CoverPreview 1:1.
 * Synchronizes web fonts, bold/italic/underline formatting, multiline/bulleted descriptions,
 * custom borders, drag offsets, and embedded signatures.
 */
export async function generateCoverPagePdf(
  coverData: CoverData,
  qrDataUrl: string
): Promise<PDFDocument> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // continue if font API rejects
    }
  }

  const theme = COVER_THEMES.find((t) => t.id === coverData.themeId) || COVER_THEMES[0];
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  const dims = PAPER_SIZES[coverData.paperSize] || PAPER_SIZES.a4;
  const s = dims.width / PREVIEW_PAPER_W;
  const page = pdfDoc.addPage([dims.width, dims.height]);

  const off = (key: CoverDraggableKey) => {
    const o = coverData.elementOffsets?.[key];
    return {
      dx: (o?.x ?? 0) * s,
      dy: -(o?.y ?? 0) * s, // CSS positive Y is downward; PDF positive Y is upward
    };
  };

  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontTimesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontTimesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const isSerif = coverData.font === 'playfair' || coverData.font === 'merriweather';
  const isMono = coverData.font === 'mono';
  const cssFontFamily = getCssFontFamily(coverData.font);

  const titleFallbackFont = isSerif ? fontTimesRomanBold : isMono ? fontCourierBold : fontHelveticaBold;
  const bodyFallbackFont = isSerif ? fontTimesRoman : isMono ? fontCourierBold : fontHelvetica;
  const bodyBoldFallbackFont = isSerif ? fontTimesRomanBold : isMono ? fontCourierBold : fontHelveticaBold;

  const {
    isDarkModeTheme: isDarkTheme,
    effectiveTitleColor,
    effectiveSubtitleColor,
    effectiveTextColor,
    effectiveBorderColor,
    effectiveBorderWidth,
  } = resolveEffectiveColors(coverData, theme);

  const primaryHex = hexToCss(coverData.primaryColor || theme.primaryColor, '#000000');
  const accentHex = hexToCss(coverData.accentColor || theme.accentColor, '#facc15');
  const titleHex = hexToCss(effectiveTitleColor, isDarkTheme ? '#ffffff' : primaryHex);
  const subtitleHex = hexToCss(effectiveSubtitleColor, accentHex);
  const bodyHex = hexToCss(effectiveTextColor, isDarkTheme ? '#cbd5e1' : '#334155');
  const borderHex = hexToCss(effectiveBorderColor, primaryHex);

  const primaryRgb = hexToPdfRgb(primaryHex);
  const accentRgb = hexToPdfRgb(accentHex);
  const bgRgb = hexToPdfRgb(theme.backgroundColor, '#ffffff');
  const borderRgb = hexToPdfRgb(borderHex);
  const dividerRgb = hexToPdfRgb(isDarkTheme ? '#334155' : '#e2e8f0');

  /** Draws rich browser-matched text via crisp 3.5x canvas or WinAnsi fallback */
  const drawRichBlock = async (opts: {
    text: string;
    xLeft: number;
    topY: number; // Top edge in PDF space
    maxWidth: number;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
    italic?: boolean;
    underline?: boolean;
    fontFamily?: string;
    colorHex: string;
    opacity?: number;
    align: 'left' | 'center' | 'right';
    fallbackFont: PDFFont;
  }): Promise<number> => {
    if (!opts.text) return 0;

    if (typeof document !== 'undefined') {
      const rendered = renderRichTextBlockToPng({
        text: opts.text,
        maxWidth: opts.maxWidth,
        fontSize: opts.fontSize,
        lineHeight: opts.lineHeight,
        fontWeight: opts.fontWeight,
        italic: opts.italic,
        underline: opts.underline,
        fontFamily: opts.fontFamily || cssFontFamily,
        colorHex: opts.colorHex,
        opacity: opts.opacity,
        align: opts.align,
      });
      if (rendered) {
        const embedded = await pdfDoc.embedPng(dataUrlToUint8Array(rendered.dataUrl));
        page.drawImage(embedded, {
          x: opts.xLeft,
          y: opts.topY - rendered.height,
          width: rendered.width,
          height: rendered.height,
        });
        return rendered.height;
      }
    }

    const lines = wrapTextByWidth(opts.text, opts.fallbackFont, opts.fontSize, opts.maxWidth);
    const colorRgb = hexToPdfRgb(opts.colorHex);
    let baselineY = opts.topY - opts.fontSize * 0.9;
    for (const line of lines) {
      if (line) {
        const w = opts.fallbackFont.widthOfTextAtSize(line, opts.fontSize);
        const x =
          opts.align === 'center'
            ? opts.xLeft + (opts.maxWidth - w) / 2
            : opts.align === 'right'
            ? opts.xLeft + opts.maxWidth - w
            : opts.xLeft;
        page.drawText(line, {
          x,
          y: baselineY,
          size: opts.fontSize,
          font: opts.fallbackFont,
          color: colorRgb,
          opacity: opts.opacity,
        });
      }
      baselineY -= opts.lineHeight;
    }
    return lines.length * opts.lineHeight;
  };

  // 1. Page Background Fill
  page.drawRectangle({
    x: 0,
    y: 0,
    width: dims.width,
    height: dims.height,
    color: bgRgb,
  });

  // 2. Custom Background Watermark / Full Cover Image
  const bgImgUrl =
    coverData.backgroundImageUrl || (coverData.backgroundImageStyle === 'full' ? coverData.imageUrl : undefined);
  if (bgImgUrl) {
    const bgOpacity = Math.max(0.05, Math.min(0.95, coverData.backgroundImageOpacity ?? 0.35));
    const bgImgData = await renderCroppedCoverImageBytes(bgImgUrl, dims.width, dims.height, {
      imageOpacity: bgOpacity,
    });
    if (bgImgData) {
      try {
        const embeddedBg =
          bgImgData.format === 'png'
            ? await pdfDoc.embedPng(bgImgData.bytes)
            : await pdfDoc.embedJpg(bgImgData.bytes);
        page.drawImage(embeddedBg, {
          x: 0,
          y: 0,
          width: dims.width,
          height: dims.height,
        });
      } catch (e) {
        console.warn('Background image embed failed:', e);
      }
    }
  }

  const layout = theme.layoutStyle;
  const isCentered = isCenteredCoverLayout(layout);
  const isLeftBar = layout === 'plain-left-bar';
  const isSplitCover = layout === 'split-cover';
  const hasBanner = hasBannerHeaderLayout(layout, !!coverData.backgroundImageUrl);

  const padXRight = 40 * s;
  const padXLeft = (isSplitCover ? 148 : isLeftBar ? 56 : 40) * s;
  const contentWidth = dims.width - padXLeft - padXRight;
  const bannerHeight = (layout === 'full-bleed-hero' ? 195 : 160) * s;

  // 3. Theme Layout Decorations (All 17 layoutStyle variants)
  if (hasBanner) {
    const bannerY = dims.height - bannerHeight;

    page.drawRectangle({
      x: 0,
      y: bannerY,
      width: dims.width,
      height: bannerHeight,
      color: primaryRgb,
    });

    if (coverData.imageUrl) {
      const bannerData = await renderCroppedCoverImageBytes(coverData.imageUrl, dims.width, bannerHeight, {
        withBannerScrim: true,
        imageOpacity: 0.9,
      });
      if (bannerData) {
        try {
          const embeddedBanner =
            bannerData.format === 'png'
              ? await pdfDoc.embedPng(bannerData.bytes)
              : await pdfDoc.embedJpg(bannerData.bytes);
          page.drawImage(embeddedBanner, {
            x: 0,
            y: bannerY,
            width: dims.width,
            height: bannerHeight,
          });
        } catch (e) {
          console.warn('Banner image embed failed:', e);
        }
      }
    }

    page.drawRectangle({
      x: 0,
      y: bannerY,
      width: dims.width,
      height: 6 * s,
      color: accentRgb,
    });

    const bannerMetaTopY = dims.height - 16 * s;
    if (coverData.documentId) {
      await drawRichBlock({
        text: coverData.documentId,
        xLeft: 24 * s,
        topY: bannerMetaTopY,
        maxWidth: (dims.width - 48 * s) * 0.48,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        fontWeight: 600,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: '#ffffff',
        opacity: 0.9,
        align: 'left',
        fallbackFont: fontCourierBold,
      });
    }
    if (coverData.organization) {
      await drawRichBlock({
        text: coverData.organization.toUpperCase(),
        xLeft: 24 * s + (dims.width - 48 * s) * 0.45,
        topY: bannerMetaTopY,
        maxWidth: (dims.width - 48 * s) * 0.55,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        fontWeight: 600,
        colorHex: '#ffffff',
        align: 'right',
        fallbackFont: fontHelveticaBold,
      });
    }
  } else if (isSplitCover) {
    const panelW = 124 * s;
    page.drawRectangle({
      x: 0,
      y: 0,
      width: panelW,
      height: dims.height,
      color: primaryRgb,
    });
    if (coverData.imageUrl) {
      const splitData = await renderCroppedCoverImageBytes(coverData.imageUrl, panelW, dims.height, {
        imageOpacity: 0.35,
      });
      if (splitData) {
        try {
          const embeddedSplit =
            splitData.format === 'png'
              ? await pdfDoc.embedPng(splitData.bytes)
              : await pdfDoc.embedJpg(splitData.bytes);
          page.drawImage(embeddedSplit, {
            x: 0,
            y: 0,
            width: panelW,
            height: dims.height,
          });
        } catch (e) {
          console.warn('Split panel image embed failed:', e);
        }
      }
    }
    page.drawRectangle({
      x: panelW - 4 * s,
      y: 0,
      width: 4 * s,
      height: dims.height,
      color: accentRgb,
    });
  } else if (layout === 'ribbon-crest') {
    const barH = 44 * s;
    page.drawRectangle({
      x: 0,
      y: dims.height - barH,
      width: dims.width,
      height: barH,
      color: primaryRgb,
    });
    page.drawRectangle({
      x: 0,
      y: dims.height - barH - 4 * s,
      width: dims.width,
      height: 4 * s,
      color: accentRgb,
    });
    await drawRichBlock({
      text: (coverData.organization || 'Official Submission').toUpperCase(),
      xLeft: 36 * s,
      topY: dims.height - 15 * s,
      maxWidth: (dims.width - 72 * s) * 0.65,
      fontSize: 10 * s,
      lineHeight: 13 * s,
      fontWeight: 700,
      colorHex: '#ffffff',
      opacity: 0.95,
      align: 'left',
      fallbackFont: fontHelveticaBold,
    });
    if (coverData.documentId) {
      await drawRichBlock({
        text: coverData.documentId,
        xLeft: 36 * s + (dims.width - 72 * s) * 0.65,
        topY: dims.height - 15 * s,
        maxWidth: (dims.width - 72 * s) * 0.35,
        fontSize: 10 * s,
        lineHeight: 13 * s,
        fontWeight: 600,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: '#ffffff',
        opacity: 0.9,
        align: 'right',
        fallbackFont: fontCourierBold,
      });
    }
  } else if (layout === 'executive-memo') {
    const pillX = 40 * s;
    const pillW = dims.width - 80 * s;
    const pillH = 34 * s;
    const pillY = dims.height - 28 * s - pillH;
    page.drawRectangle({
      x: pillX,
      y: pillY,
      width: pillW,
      height: pillH,
      color: primaryRgb,
    });
    page.drawRectangle({
      x: pillX,
      y: pillY - 7 * s,
      width: pillW,
      height: 3 * s,
      color: accentRgb,
    });
    await drawRichBlock({
      text: (coverData.organization || 'Executive Dossier').toUpperCase(),
      xLeft: pillX + 16 * s,
      topY: pillY + pillH - 10 * s,
      maxWidth: (pillW - 32 * s) * 0.62,
      fontSize: 11 * s,
      lineHeight: 14 * s,
      fontWeight: 800,
      colorHex: '#ffffff',
      align: 'left',
      fallbackFont: fontHelveticaBold,
    });
    const rightVal = coverData.documentId || coverData.date;
    if (rightVal) {
      await drawRichBlock({
        text: rightVal,
        xLeft: pillX + 16 * s + (pillW - 32 * s) * 0.62,
        topY: pillY + pillH - 10 * s,
        maxWidth: (pillW - 32 * s) * 0.38,
        fontSize: 10 * s,
        lineHeight: 13 * s,
        fontWeight: 600,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: '#ffffff',
        opacity: 0.9,
        align: 'right',
        fallbackFont: fontCourierBold,
      });
    }
  } else if (layout === 'certificate-frame') {
    const o = 14 * s;
    const inn = 20 * s;
    page.drawRectangle({
      x: o,
      y: o,
      width: dims.width - o * 2,
      height: dims.height - o * 2,
      borderColor: primaryRgb,
      borderWidth: 3 * s,
    });
    page.drawRectangle({
      x: inn,
      y: inn,
      width: dims.width - inn * 2,
      height: dims.height - inn * 2,
      borderColor: accentRgb,
      borderWidth: 1 * s,
    });
    const bLen = 14 * s;
    const bThick = 2 * s;
    page.drawLine({ start: { x: inn, y: dims.height - inn }, end: { x: inn + bLen, y: dims.height - inn }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: inn, y: dims.height - inn }, end: { x: inn, y: dims.height - inn - bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - inn, y: dims.height - inn }, end: { x: dims.width - inn - bLen, y: dims.height - inn }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - inn, y: dims.height - inn }, end: { x: dims.width - inn, y: dims.height - inn - bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: inn, y: inn }, end: { x: inn + bLen, y: inn }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: inn, y: inn }, end: { x: inn, y: inn + bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - inn, y: inn }, end: { x: dims.width - inn - bLen, y: inn }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - inn, y: inn }, end: { x: dims.width - inn, y: inn + bLen }, thickness: bThick, color: accentRgb });
  } else if (layout === 'diagonal-accent') {
    const side = 240 * s;
    const halfDiag = (side * Math.SQRT2) / 2;
    page.drawRectangle({
      x: 456 * s,
      y: dims.height - 24 * s - halfDiag,
      width: side,
      height: side,
      rotate: degrees(45),
      borderColor: accentRgb,
      borderWidth: 6 * s,
    });
    page.drawRectangle({
      x: 468 * s,
      y: dims.height - 32 * s - halfDiag,
      width: side,
      height: side,
      rotate: degrees(45),
      color: primaryRgb,
    });
    page.drawRectangle({
      x: 0,
      y: 0,
      width: dims.width,
      height: 5 * s,
      color: accentRgb,
    });
  } else if (layout === 'bordered-formal') {
    const outerInset = 12 * s;
    const innerInset = 18 * s;
    page.drawRectangle({
      x: outerInset,
      y: outerInset,
      width: dims.width - outerInset * 2,
      height: dims.height - outerInset * 2,
      borderColor: primaryRgb,
      borderWidth: 2 * s,
    });
    page.drawRectangle({
      x: innerInset,
      y: innerInset,
      width: dims.width - innerInset * 2,
      height: dims.height - innerInset * 2,
      borderColor: accentRgb,
      borderWidth: 1 * s,
    });
  } else if (layout === 'minimal-frame') {
    const m = 16 * s;
    page.drawRectangle({
      x: m,
      y: m,
      width: dims.width - m * 2,
      height: dims.height - m * 2,
      borderColor: accentRgb,
      borderOpacity: 0.35,
      borderWidth: 1 * s,
    });
    const bLen = 16 * s;
    const bThick = 2 * s;
    page.drawLine({ start: { x: m, y: dims.height - m }, end: { x: m + bLen, y: dims.height - m }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: m, y: dims.height - m }, end: { x: m, y: dims.height - m - bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - m, y: dims.height - m }, end: { x: dims.width - m - bLen, y: dims.height - m }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - m, y: dims.height - m }, end: { x: dims.width - m, y: dims.height - m - bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: m, y: m }, end: { x: m + bLen, y: m }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: m, y: m }, end: { x: m, y: m + bLen }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - m, y: m }, end: { x: dims.width - m - bLen, y: m }, thickness: bThick, color: accentRgb });
    page.drawLine({ start: { x: dims.width - m, y: m }, end: { x: dims.width - m, y: m + bLen }, thickness: bThick, color: accentRgb });
  } else if (layout === 'geometric-grid') {
    page.drawRectangle({
      x: 0,
      y: dims.height - 6 * s,
      width: dims.width,
      height: 6 * s,
      color: accentRgb,
    });
    page.drawRectangle({
      x: 24 * s,
      y: 0,
      width: 6 * s,
      height: dims.height,
      color: accentRgb,
      opacity: 0.28,
    });
  } else if (layout === 'card-centered') {
    page.drawRectangle({
      x: 32 * s,
      y: 48 * s,
      width: dims.width - 64 * s,
      height: dims.height - 96 * s,
      color: hexToPdfRgb(isDarkTheme ? '#18181b' : '#fafafa'),
      borderColor: accentRgb,
      borderOpacity: 0.25,
      borderWidth: 1 * s,
    });
  } else if (layout === 'bottom-accent') {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: dims.width,
      height: 112 * s,
      color: primaryRgb,
      opacity: 0.15,
    });
  } else if (layout === 'plain-rule') {
    page.drawLine({
      start: { x: 40 * s, y: dims.height - 32 * s },
      end: { x: dims.width - 40 * s, y: dims.height - 32 * s },
      thickness: 2 * s,
      color: primaryRgb,
    });
    page.drawLine({
      start: { x: 40 * s, y: 24 * s },
      end: { x: dims.width - 40 * s, y: 24 * s },
      thickness: 1 * s,
      color: accentRgb,
    });
  } else if (isLeftBar) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 12 * s,
      height: dims.height,
      color: primaryRgb,
    });
    page.drawLine({
      start: { x: 20 * s, y: 0 },
      end: { x: 20 * s, y: dims.height },
      thickness: 1 * s,
      color: accentRgb,
      opacity: 0.4,
    });
  }

  // 3b. Custom User Page Border Overlay
  const customBorder = coverData.borderStyle || 'none';
  if (customBorder === 'solid') {
    const ins = 14 * s;
    page.drawRectangle({
      x: ins,
      y: ins,
      width: dims.width - ins * 2,
      height: dims.height - ins * 2,
      borderColor: borderRgb,
      borderWidth: effectiveBorderWidth * s,
    });
  } else if (customBorder === 'dashed') {
    const ins = 14 * s;
    drawDashedRect(
      page,
      ins,
      ins,
      dims.width - ins * 2,
      dims.height - ins * 2,
      effectiveBorderWidth * s,
      borderRgb,
      8 * s,
      5 * s
    );
  } else if (customBorder === 'double') {
    const o = 12 * s;
    const i = 17 * s;
    page.drawRectangle({
      x: o,
      y: o,
      width: dims.width - o * 2,
      height: dims.height - o * 2,
      borderColor: borderRgb,
      borderWidth: effectiveBorderWidth * s,
    });
    page.drawRectangle({
      x: i,
      y: i,
      width: dims.width - i * 2,
      height: dims.height - i * 2,
      borderColor: accentRgb,
      borderWidth: 1 * s,
    });
  } else if (customBorder === 'corner-accents') {
    const m = 16 * s;
    const len = 26 * s;
    const th = (effectiveBorderWidth + 1) * s;
    page.drawLine({ start: { x: m, y: dims.height - m }, end: { x: m + len, y: dims.height - m }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: m, y: dims.height - m }, end: { x: m, y: dims.height - m - len }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: dims.width - m, y: dims.height - m }, end: { x: dims.width - m - len, y: dims.height - m }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: dims.width - m, y: dims.height - m }, end: { x: dims.width - m, y: dims.height - m - len }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: m, y: m }, end: { x: m + len, y: m }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: m, y: m }, end: { x: m, y: m + len }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: dims.width - m, y: m }, end: { x: dims.width - m - len, y: m }, thickness: th, color: borderRgb });
    page.drawLine({ start: { x: dims.width - m, y: m }, end: { x: dims.width - m, y: m + len }, thickness: th, color: borderRgb });
  } else if (customBorder === 'inset-frame') {
    const o = 10 * s;
    const i = 20 * s;
    page.drawRectangle({
      x: o,
      y: o,
      width: dims.width - o * 2,
      height: dims.height - o * 2,
      borderColor: borderRgb,
      borderOpacity: 0.9,
      borderWidth: effectiveBorderWidth * s,
    });
    page.drawRectangle({
      x: i,
      y: i,
      width: dims.width - i * 2,
      height: dims.height - i * 2,
      borderColor: accentRgb,
      borderOpacity: 0.65,
      borderWidth: 1 * s,
    });
  }

  // 4. Bottom Footer Section (QR Card + Metadata + Verification + Signature)
  const bottomPad = 40 * s;
  const shouldIncludeQr = coverData.includeQr !== false;
  const qrPos = coverData.qrPosition || 'bottom-right';
  const qrImgSize = 108 * s;
  const qrCardPad = 8 * s;
  const qrLabelH = 16 * s;
  const qrCardW = qrImgSize + qrCardPad * 2;
  const qrCardH = qrImgSize + qrCardPad * 2 + qrLabelH;
  const ctaRaw =
    coverData.qrCallToAction || 'Scan with phone camera to view full soft copy on Google Drive.';
  const ctaLineCount = shouldIncludeQr
    ? Math.max(1, Math.min(3, Math.ceil(ctaRaw.length / 24)))
    : 0;
  const ctaBlockH = ctaLineCount > 0 ? 6 * s + ctaLineCount * (11.5 * s) : 0;

  const syncStampText = coverData.showSyncTimestamp
    ? `Synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : '';
  const verificationParts = [
    coverData.version?.trim() ? `Rev ${coverData.version.trim()}` : '',
    syncStampText,
    coverData.expiryNote?.trim() || '',
  ].filter(Boolean);
  const verificationLine = verificationParts.join(' · ');

  let embeddedSignature: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let sigDrawW = 0;
  let sigDrawH = 0;
  if (coverData.signatureUrl) {
    embeddedSignature = await embedAnyImage(pdfDoc, coverData.signatureUrl);
    if (embeddedSignature) {
      const maxH = 36 * s;
      const maxW = 125 * s;
      const ratio = Math.min(maxW / embeddedSignature.width, maxH / embeddedSignature.height);
      sigDrawW = embeddedSignature.width * ratio;
      sigDrawH = embeddedSignature.height * ratio;
    }
  }
  const hasSignature = !!embeddedSignature;
  const sigTotalH = hasSignature ? sigDrawH + 16 * s : 0;

  const metaStackHeight =
    (coverData.preparedBy ? 34 * s : 0) +
    (coverData.date ? 30 * s : 0) +
    (verificationLine ? 16 * s : 0) +
    (shouldIncludeQr ? 14 * s : 0);

  let footerTopY = bottomPad + Math.max(qrCardH + ctaBlockH, metaStackHeight + (hasSignature ? sigTotalH + 10 * s : 0));
  let qrCardBottomY = bottomPad + ctaBlockH;

  if (!shouldIncludeQr) {
    const nonQrH = isCentered
      ? metaStackHeight + (hasSignature ? sigTotalH + 12 * s : 0)
      : Math.max(28 * s, metaStackHeight, sigTotalH);
    footerTopY = bottomPad + nonQrH;
  } else if (qrPos === 'bottom-center') {
    const hasMeta = Boolean(coverData.preparedBy || coverData.date || verificationLine);
    const metaRowH = hasMeta ? (verificationLine ? 32 * s : 18 * s) + 8 * s : 0;
    footerTopY = bottomPad + metaRowH + ctaBlockH + qrCardH + (hasSignature ? sigTotalH + 10 * s : 0);
    qrCardBottomY = bottomPad + metaRowH + ctaBlockH;
  }

  const footerDividerY = footerTopY + 16 * s;

  page.drawLine({
    start: { x: padXLeft, y: footerDividerY },
    end: { x: dims.width - padXRight, y: footerDividerY },
    thickness: 0.8 * s,
    color: dividerRgb,
  });

  const drawSignatureAt = async (centerX: number, bottomY: number) => {
    if (!embeddedSignature) return;
    const sigOff = off('signature');
    const sx = centerX + sigOff.dx;
    const sy = bottomY + sigOff.dy;
    const lineW = 115 * s;
    const sigLabel = coverData.signatureLabel || coverData.preparedBy || 'Authorized Signature';

    page.drawImage(embeddedSignature, {
      x: sx - sigDrawW / 2,
      y: sy + 14 * s,
      width: sigDrawW,
      height: sigDrawH,
    });
    page.drawLine({
      start: { x: sx - lineW / 2, y: sy + 12 * s },
      end: { x: sx + lineW / 2, y: sy + 12 * s },
      thickness: 0.75 * s,
      color: hexToPdfRgb(bodyHex),
      opacity: 0.85,
    });
    await drawRichBlock({
      text: sigLabel,
      xLeft: sx - lineW / 2,
      topY: sy + 10 * s,
      maxWidth: lineW,
      fontSize: 9 * s,
      lineHeight: 11 * s,
      fontWeight: 600,
      colorHex: bodyHex,
      opacity: 0.82,
      align: 'center',
      fallbackFont: bodyBoldFallbackFont,
    });
  };

  // Draw Metadata & Signature Block
  const metaOff = off('metaBlock');
  const metaRightAligned = shouldIncludeQr && qrPos === 'bottom-left';

  if (!shouldIncludeQr) {
    const metaMaxW = isCentered
      ? contentWidth
      : hasSignature
      ? Math.max(140 * s, contentWidth - 135 * s)
      : contentWidth;
    let mY = bottomPad + (isCentered && hasSignature ? sigTotalH + 12 * s : 0) + metaStackHeight;

    if (coverData.preparedBy) {
      await drawRichBlock({
        text: 'PREPARED BY',
        xLeft: padXLeft + metaOff.dx,
        topY: mY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 10 * s,
        lineHeight: 12 * s,
        fontWeight: 700,
        colorHex: bodyHex,
        opacity: 0.6,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyBoldFallbackFont,
      });
      mY -= 13 * s;
      await drawRichBlock({
        text: coverData.preparedBy,
        xLeft: padXLeft + metaOff.dx,
        topY: mY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 12 * s,
        lineHeight: 15 * s,
        fontWeight: 600,
        colorHex: bodyHex,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyBoldFallbackFont,
      });
      mY -= 20 * s;
    }
    if (coverData.date) {
      await drawRichBlock({
        text: 'DATE',
        xLeft: padXLeft + metaOff.dx,
        topY: mY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 10 * s,
        lineHeight: 12 * s,
        fontWeight: 700,
        colorHex: bodyHex,
        opacity: 0.6,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyBoldFallbackFont,
      });
      mY -= 13 * s;
      await drawRichBlock({
        text: coverData.date,
        xLeft: padXLeft + metaOff.dx,
        topY: mY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 12 * s,
        lineHeight: 15 * s,
        fontWeight: 500,
        colorHex: bodyHex,
        opacity: 0.9,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyFallbackFont,
      });
      mY -= 18 * s;
    }
    if (verificationLine) {
      await drawRichBlock({
        text: verificationLine,
        xLeft: padXLeft + metaOff.dx,
        topY: mY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 8.5 * s,
        lineHeight: 11 * s,
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: accentHex,
        align: isCentered ? 'center' : 'left',
        fallbackFont: fontCourierBold,
      });
    }
    if (hasSignature) {
      const sigCenterX = isCentered ? padXLeft + contentWidth / 2 : dims.width - padXRight - 60 * s;
      await drawSignatureAt(sigCenterX, bottomPad);
    }
  } else if (qrPos === 'bottom-center') {
    let inlineTopY = bottomPad + (verificationLine ? 28 * s : 14 * s);
    if (coverData.preparedBy || coverData.date) {
      const parts = [coverData.preparedBy, coverData.date].filter(Boolean) as string[];
      const inlineMeta = parts.join('   ·   ');
      await drawRichBlock({
        text: inlineMeta,
        xLeft: padXLeft + metaOff.dx,
        topY: inlineTopY + metaOff.dy,
        maxWidth: contentWidth,
        fontSize: 11 * s,
        lineHeight: 14 * s,
        fontWeight: 500,
        colorHex: bodyHex,
        align: 'center',
        fallbackFont: bodyFallbackFont,
      });
      inlineTopY -= 16 * s;
    }
    if (verificationLine) {
      await drawRichBlock({
        text: verificationLine,
        xLeft: padXLeft + metaOff.dx,
        topY: inlineTopY + metaOff.dy,
        maxWidth: contentWidth,
        fontSize: 8.5 * s,
        lineHeight: 11 * s,
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: accentHex,
        align: 'center',
        fallbackFont: fontCourierBold,
      });
    }
    if (hasSignature) {
      await drawSignatureAt(padXLeft + contentWidth / 2, qrCardBottomY + qrCardH + 10 * s);
    }
  } else {
    const metaMaxW = Math.max(120 * s, dims.width - padXLeft - padXRight - qrCardW - 18 * s);
    const metaXLeft = (metaRightAligned ? padXLeft + qrCardW + 18 * s : padXLeft) + metaOff.dx;
    const metaAlign: 'left' | 'right' = metaRightAligned ? 'right' : 'left';

    let metaCursorTopY = bottomPad + metaStackHeight;

    if (coverData.preparedBy) {
      await drawRichBlock({
        text: 'PREPARED BY',
        xLeft: metaXLeft,
        topY: metaCursorTopY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 10 * s,
        lineHeight: 12 * s,
        fontWeight: 700,
        colorHex: bodyHex,
        opacity: 0.6,
        align: metaAlign,
        fallbackFont: bodyBoldFallbackFont,
      });
      metaCursorTopY -= 12.5 * s;
      await drawRichBlock({
        text: coverData.preparedBy,
        xLeft: metaXLeft,
        topY: metaCursorTopY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 12 * s,
        lineHeight: 15 * s,
        fontWeight: 600,
        colorHex: bodyHex,
        align: metaAlign,
        fallbackFont: bodyBoldFallbackFont,
      });
      metaCursorTopY -= 19 * s;
    }

    if (coverData.date) {
      await drawRichBlock({
        text: 'DATE',
        xLeft: metaXLeft,
        topY: metaCursorTopY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 10 * s,
        lineHeight: 12 * s,
        fontWeight: 700,
        colorHex: bodyHex,
        opacity: 0.6,
        align: metaAlign,
        fallbackFont: bodyBoldFallbackFont,
      });
      metaCursorTopY -= 12.5 * s;
      await drawRichBlock({
        text: coverData.date,
        xLeft: metaXLeft,
        topY: metaCursorTopY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 12 * s,
        lineHeight: 15 * s,
        fontWeight: 500,
        colorHex: bodyHex,
        opacity: 0.9,
        align: metaAlign,
        fallbackFont: bodyFallbackFont,
      });
      metaCursorTopY -= 18 * s;
    }

    if (verificationLine) {
      await drawRichBlock({
        text: verificationLine,
        xLeft: metaXLeft,
        topY: metaCursorTopY + metaOff.dy,
        maxWidth: metaMaxW,
        fontSize: 8.5 * s,
        lineHeight: 11 * s,
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
        colorHex: accentHex,
        align: metaAlign,
        fallbackFont: fontCourierBold,
      });
      metaCursorTopY -= 14 * s;
    }

    await drawRichBlock({
      text: 'Official Soft Copy · Google Drive',
      xLeft: metaXLeft,
      topY: metaCursorTopY + metaOff.dy,
      maxWidth: metaMaxW,
      fontSize: 9 * s,
      lineHeight: 11 * s,
      fontWeight: 500,
      fontFamily: '"JetBrains Mono", monospace',
      colorHex: bodyHex,
      opacity: 0.6,
      align: metaAlign,
      fallbackFont: fontCourierBold,
    });

    if (hasSignature) {
      const sigCenterX = metaRightAligned ? dims.width - padXRight - 58 * s : padXLeft + 58 * s;
      await drawSignatureAt(sigCenterX, bottomPad + metaStackHeight + 8 * s);
    }
  }

  // Draw QR Code Block (only when includeQr !== false)
  if (shouldIncludeQr) {
    const qrOff = off('qrBlock');
    const baseQrX =
      qrPos === 'bottom-left'
        ? padXLeft
        : qrPos === 'bottom-center'
        ? (dims.width - qrCardW) / 2
        : dims.width - padXRight - qrCardW;
    const qrCardX = baseQrX + qrOff.dx;
    const adjustedQrBottomY = qrCardBottomY + qrOff.dy;

    page.drawRectangle({
      x: qrCardX,
      y: adjustedQrBottomY,
      width: qrCardW,
      height: qrCardH,
      color: hexToPdfRgb(coverData.qrBgColor || '#ffffff', '#ffffff'),
      borderColor: hexToPdfRgb('#cbd5e1'),
      borderWidth: 1 * s,
    });

    if (qrDataUrl) {
      try {
        const qrBytes = await fetch(qrDataUrl).then((r) => r.arrayBuffer());
        const embeddedQr = await pdfDoc.embedPng(new Uint8Array(qrBytes));
        page.drawImage(embeddedQr, {
          x: qrCardX + qrCardPad,
          y: adjustedQrBottomY + qrCardPad + qrLabelH,
          width: qrImgSize,
          height: qrImgSize,
        });
      } catch (e) {
        console.warn('QR embed error:', e);
      }
    }

    const qrBadgeText = 'SCAN FOR DRIVE COPY';
    const qrBadgeW = fontHelveticaBold.widthOfTextAtSize(qrBadgeText, 8 * s);
    page.drawText(qrBadgeText, {
      x: qrCardX + (qrCardW - qrBadgeW) / 2,
      y: adjustedQrBottomY + qrCardPad + 4 * s,
      size: 8 * s,
      font: fontHelveticaBold,
      color: hexToPdfRgb('#0f172a'),
    });

    const qrCenterX = qrCardX + qrCardW / 2;
    await drawRichBlock({
      text: ctaRaw,
      xLeft: qrCenterX - 65 * s,
      topY: adjustedQrBottomY - 6 * s,
      maxWidth: 130 * s,
      fontSize: 9 * s,
      lineHeight: 11.25 * s,
      fontWeight: 400,
      colorHex: bodyHex,
      opacity: 0.75,
      align: 'center',
      fallbackFont: bodyFallbackFont,
    });
  }

  // 5. Middle Content Stack (Logo + Header Meta + Title + Subtitle + Accent Rule + Full Bulleted Summary)
  const topInset =
    layout === 'ribbon-crest'
      ? 48 * s + 24 * s
      : layout === 'executive-memo'
      ? 72 * s + 24 * s
      : hasBanner
      ? bannerHeight + 40 * s
      : 40 * s;
  const topAreaStart = dims.height - topInset;
  const availableMiddleH = Math.max(120 * s, topAreaStart - (footerDividerY + 14 * s));

  let embeddedLogo: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoDrawW = 0;
  let logoDrawH = 0;
  if (coverData.logoUrl && coverData.logoPosition !== 'qr-center') {
    embeddedLogo = await embedAnyImage(pdfDoc, coverData.logoUrl);
    if (embeddedLogo) {
      const maxH = (coverData.logoSize === 'large' ? 56 : coverData.logoSize === 'small' ? 32 : 40) * s;
      const maxW = (coverData.logoSize === 'large' ? 200 : coverData.logoSize === 'small' ? 120 : 160) * s;
      const ratio = Math.min(maxW / embeddedLogo.width, maxH / embeddedLogo.height);
      logoDrawW = embeddedLogo.width * ratio;
      logoDrawH = embeddedLogo.height * ratio;
    }
  }

  const showNonBannerMeta =
    !hasBanner &&
    layout !== 'ribbon-crest' &&
    layout !== 'executive-memo' &&
    Boolean(coverData.documentId || coverData.organization);

  const rawTitle = (coverData.title || '').trim() || 'Document Title';
  const rawSub = (coverData.subtitle || '').trim();
  const rawSummary = coverData.summary || '';

  const titlePx = Math.max(18, Math.min(48, coverData.titleFontSize || 30));
  const titleFontSize = titlePx * s;
  const titleLineH = titleFontSize * 1.2;
  const titleWeight = coverData.titleBold === false ? 500 : 800;

  const subPx = Math.max(10, Math.min(26, coverData.subtitleFontSize || 14));
  const subFontSize = subPx * s;
  const subLineH = subFontSize * 1.35;
  const subWeight = coverData.subtitleBold ? 700 : 500;

  const sumPx = Math.max(9, Math.min(20, coverData.summaryFontSize || 12));
  const sumFontSize = sumPx * s;
  const sumLineH = sumFontSize * 1.45;
  const sumWeight = coverData.summaryBold ? 700 : 400;

  // Pre-measure heights using exact browser canvas (when available) so centered layouts match CoverPreview 1:1
  const titleRendered =
    typeof document !== 'undefined'
      ? renderRichTextBlockToPng({
          text: rawTitle,
          maxWidth: contentWidth,
          fontSize: titleFontSize,
          lineHeight: titleLineH,
          fontWeight: titleWeight,
          italic: coverData.titleItalic,
          underline: coverData.titleUnderline,
          fontFamily: cssFontFamily,
          colorHex: titleHex,
          align: isCentered ? 'center' : 'left',
        })
      : null;

  const subRendered =
    rawSub && typeof document !== 'undefined'
      ? renderRichTextBlockToPng({
          text: rawSub,
          maxWidth: contentWidth,
          fontSize: subFontSize,
          lineHeight: subLineH,
          fontWeight: subWeight,
          italic: coverData.subtitleItalic,
          underline: coverData.subtitleUnderline,
          fontFamily: cssFontFamily,
          colorHex: subtitleHex,
          opacity: 0.9,
          align: isCentered ? 'center' : 'left',
        })
      : null;

  const summaryRendered =
    rawSummary.trim() && typeof document !== 'undefined'
      ? renderSummaryBlockToPng({
          rawSummary,
          maxWidth: contentWidth,
          fontSize: sumFontSize,
          lineHeight: sumLineH,
          fontWeight: sumWeight,
          italic: coverData.summaryItalic,
          underline: coverData.summaryUnderline,
          fontFamily: cssFontFamily,
          textColorHex: bodyHex,
          accentColorHex: accentHex,
          centered: isCentered,
          scalePt: s,
        })
      : null;

  const measuredTitleH = titleRendered
    ? titleRendered.height
    : wrapTextByWidth(rawTitle, titleFallbackFont, titleFontSize, contentWidth).length * titleLineH;
  const measuredSubH = subRendered
    ? subRendered.height
    : rawSub
    ? wrapTextByWidth(rawSub, bodyFallbackFont, subFontSize, contentWidth).length * subLineH
    : 0;
  const measuredSummaryH = summaryRendered
    ? summaryRendered.height
    : rawSummary.trim()
    ? wrapTextByWidth(rawSummary, bodyFallbackFont, sumFontSize, contentWidth).length * sumLineH
    : 0;

  let totalMiddleH = 0;
  if (embeddedLogo) totalMiddleH += logoDrawH + 16 * s;
  if (showNonBannerMeta) totalMiddleH += 26 * s;
  totalMiddleH += 8 * s + measuredTitleH;
  if (measuredSubH > 0) totalMiddleH += 10 * s + measuredSubH;
  totalMiddleH += 12 * s + 4 * s + 12 * s;
  if (measuredSummaryH > 0) totalMiddleH += 12 * s + measuredSummaryH;

  let cursorY = isCentered
    ? Math.min(
        topAreaStart,
        footerDividerY + 14 * s + Math.max(0, (availableMiddleH - totalMiddleH) / 2) + totalMiddleH
      )
    : topAreaStart;

  // Logo
  if (embeddedLogo) {
    const logoOff = off('logo');
    const baseLx =
      coverData.logoPosition === 'top-center'
        ? padXLeft + (contentWidth - logoDrawW) / 2
        : coverData.logoPosition === 'top-right'
        ? dims.width - padXRight - logoDrawW
        : padXLeft;
    page.drawImage(embeddedLogo, {
      x: baseLx + logoOff.dx,
      y: cursorY - logoDrawH + logoOff.dy,
      width: logoDrawW,
      height: logoDrawH,
    });
    cursorY -= logoDrawH + 16 * s;
  }

  // Non-banner Header Meta (docId + organization)
  if (showNonBannerMeta) {
    const hOff = off('headerMeta');
    const metaTopY = cursorY + hOff.dy;
    if (isCentered) {
      const parts: string[] = [];
      if (coverData.documentId) parts.push(coverData.documentId);
      if (coverData.organization) parts.push(coverData.organization.toUpperCase());
      const combined = parts.join('   ·   ');
      await drawRichBlock({
        text: combined,
        xLeft: padXLeft + hOff.dx,
        topY: metaTopY,
        maxWidth: contentWidth,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        fontWeight: 700,
        colorHex: bodyHex,
        align: 'center',
        fallbackFont: fontHelveticaBold,
      });
    } else {
      if (coverData.documentId) {
        await drawRichBlock({
          text: coverData.documentId,
          xLeft: padXLeft + hOff.dx,
          topY: metaTopY,
          maxWidth: contentWidth * 0.48,
          fontSize: 11 * s,
          lineHeight: 13 * s,
          fontWeight: 600,
          fontFamily: '"JetBrains Mono", monospace',
          colorHex: accentHex,
          align: 'left',
          fallbackFont: fontCourierBold,
        });
      }
      if (coverData.organization) {
        await drawRichBlock({
          text: coverData.organization.toUpperCase(),
          xLeft: padXLeft + contentWidth * 0.48 + hOff.dx,
          topY: metaTopY,
          maxWidth: contentWidth * 0.52,
          fontSize: 12 * s,
          lineHeight: 14 * s,
          fontWeight: 700,
          colorHex: isDarkTheme ? '#f8fafc' : '#0f172a',
          align: 'right',
          fallbackFont: fontHelveticaBold,
        });
      }
    }
    page.drawLine({
      start: { x: padXLeft + hOff.dx, y: cursorY - 19 * s + hOff.dy },
      end: { x: dims.width - padXRight + hOff.dx, y: cursorY - 19 * s + hOff.dy },
      thickness: 0.75 * s,
      color: dividerRgb,
    });
    cursorY -= 32 * s;
  }

  // Title, Subtitle & Accent Bar (share 'titleBlock' offset to match CoverPreview.tsx!)
  const tbOff = off('titleBlock');
  cursorY -= 8 * s;

  if (titleRendered) {
    const embTitle = await pdfDoc.embedPng(dataUrlToUint8Array(titleRendered.dataUrl));
    page.drawImage(embTitle, {
      x: padXLeft + tbOff.dx,
      y: cursorY - titleRendered.height + tbOff.dy,
      width: titleRendered.width,
      height: titleRendered.height,
    });
  } else {
    await drawRichBlock({
      text: rawTitle,
      xLeft: padXLeft + tbOff.dx,
      topY: cursorY + tbOff.dy,
      maxWidth: contentWidth,
      fontSize: titleFontSize,
      lineHeight: titleLineH,
      fontWeight: titleWeight,
      italic: coverData.titleItalic,
      underline: coverData.titleUnderline,
      colorHex: titleHex,
      align: isCentered ? 'center' : 'left',
      fallbackFont: titleFallbackFont,
    });
  }
  cursorY -= measuredTitleH;

  if (rawSub) {
    cursorY -= 10 * s;
    if (subRendered) {
      const embSub = await pdfDoc.embedPng(dataUrlToUint8Array(subRendered.dataUrl));
      page.drawImage(embSub, {
        x: padXLeft + tbOff.dx,
        y: cursorY - subRendered.height + tbOff.dy,
        width: subRendered.width,
        height: subRendered.height,
      });
    } else {
      await drawRichBlock({
        text: rawSub,
        xLeft: padXLeft + tbOff.dx,
        topY: cursorY + tbOff.dy,
        maxWidth: contentWidth,
        fontSize: subFontSize,
        lineHeight: subLineH,
        fontWeight: subWeight,
        italic: coverData.subtitleItalic,
        underline: coverData.subtitleUnderline,
        colorHex: subtitleHex,
        opacity: 0.9,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyFallbackFont,
      });
    }
    cursorY -= measuredSubH;
  }

  // Accent Pill Bar
  cursorY -= 12 * s;
  page.drawRectangle({
    x: (isCentered ? padXLeft + (contentWidth - 48 * s) / 2 : padXLeft) + tbOff.dx,
    y: cursorY - 4 * s + tbOff.dy,
    width: 48 * s,
    height: 4 * s,
    color: accentRgb,
  });
  cursorY -= 16 * s;

  // Multiline / Bulleted Summary Description (Zero truncation)
  if (rawSummary.trim()) {
    cursorY -= 12 * s;
    const sumOff = off('summary');
    const maxAllowedSumH = Math.max(40 * s, cursorY - (footerDividerY + 12 * s));

    if (summaryRendered) {
      const embSum = await pdfDoc.embedPng(dataUrlToUint8Array(summaryRendered.dataUrl));
      const drawH = Math.min(summaryRendered.height, maxAllowedSumH);
      const scaleFit = drawH < summaryRendered.height ? drawH / summaryRendered.height : 1;
      const drawW = summaryRendered.width * scaleFit;
      page.drawImage(embSum, {
        x: (isCentered ? padXLeft + (contentWidth - drawW) / 2 : padXLeft) + sumOff.dx,
        y: cursorY - drawH + sumOff.dy,
        width: drawW,
        height: drawH,
      });
    } else {
      await drawRichBlock({
        text: rawSummary,
        xLeft: padXLeft + sumOff.dx,
        topY: cursorY + sumOff.dy,
        maxWidth: contentWidth,
        fontSize: sumFontSize,
        lineHeight: sumLineH,
        fontWeight: sumWeight,
        italic: coverData.summaryItalic,
        underline: coverData.summaryUnderline,
        colorHex: bodyHex,
        align: isCentered ? 'center' : 'left',
        fallbackFont: bodyFallbackFont,
      });
    }
  }

  const coverScopedStamps = (coverData.appliedStamps || []).filter(
    (st) => st.pageScope === 'cover-only' || st.pageScope === 'all-including-cover'
  );
  if (coverScopedStamps.length > 0) {
    await drawAppliedStampsOnPage(pdfDoc, page, coverScopedStamps, new Map());
  }

  return pdfDoc;
}

type EmbeddedImageHandle = Awaited<ReturnType<PDFDocument['embedPng']>>;

function resolveStampCenterPoint(
  placement: PdfStampPlacement,
  pageW: number,
  pageH: number,
  stampW: number,
  stampH: number
): { cx: number; cy: number } {
  const marginX = pageW * 0.055;
  const marginTop = pageH * 0.055;
  const marginBottom = pageH * 0.065;

  switch (placement) {
    case 'top-left':
      return { cx: marginX + stampW / 2, cy: pageH - marginTop - stampH / 2 };
    case 'top-center':
      return { cx: pageW / 2, cy: pageH - marginTop - stampH / 2 };
    case 'top-right':
      return { cx: pageW - marginX - stampW / 2, cy: pageH - marginTop - stampH / 2 };
    case 'center':
      return { cx: pageW / 2, cy: pageH / 2 };
    case 'bottom-left':
      return { cx: marginX + stampW / 2, cy: marginBottom + stampH / 2 };
    case 'bottom-center':
      return { cx: pageW / 2, cy: marginBottom + stampH / 2 };
    case 'bottom-right':
    default:
      return { cx: pageW - marginX - stampW / 2, cy: marginBottom + stampH / 2 };
  }
}

async function drawAppliedStampsOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  stamps: AppliedPdfStamp[],
  cache: Map<string, EmbeddedImageHandle | null>
): Promise<void> {
  if (!stamps.length) return;
  const { width, height } = page.getSize();

  for (const stamp of stamps) {
    const sourceUrl =
      stamp.kind === 'image'
        ? stamp.imageUrl || ''
        : renderCustomTextStampDataUrl(
            {
              text: stamp.text,
              subtext: stamp.subtext,
              shape: stamp.shape,
              color: stamp.color,
            },
            440
          );

    if (!sourceUrl) continue;

    const cacheKey = `${stamp.kind}:${sourceUrl.length}:${sourceUrl.slice(0, 96)}`;
    let embedded = cache.get(cacheKey);
    if (embedded === undefined) {
      embedded = await embedAnyImage(pdfDoc, sourceUrl);
      cache.set(cacheKey, embedded);
    }
    if (!embedded) continue;

    const scaleRatio = Math.max(0.08, Math.min(0.5, (stamp.scale || 18) / 100));
    let drawW = width * scaleRatio;
    let drawH = drawW * (embedded.height / Math.max(1, embedded.width));
    const maxH = height * 0.45;
    if (drawH > maxH) {
      const shrink = maxH / drawH;
      drawW *= shrink;
      drawH *= shrink;
    }

    const { cx, cy } = resolveStampCenterPoint(
      stamp.position || 'bottom-right',
      width,
      height,
      drawW,
      drawH
    );

    const pdfAngleDeg = -(Number(stamp.rotationDeg) || 0);
    const rad = (pdfAngleDeg * Math.PI) / 180;
    const x = cx - ((drawW / 2) * Math.cos(rad) - (drawH / 2) * Math.sin(rad));
    const y = cy - ((drawW / 2) * Math.sin(rad) + (drawH / 2) * Math.cos(rad));

    page.drawImage(embedded, {
      x,
      y,
      width: drawW,
      height: drawH,
      rotate: degrees(pdfAngleDeg),
      opacity: Math.min(1, Math.max(0.1, stamp.opacity ?? 0.88)),
    });
  }
}

/**
 * Merge newly created Cover Page as Page 1 with an uploaded PDF document.
 * Optionally stamps page numbers ("Page X of Y") and diagonal watermarks across appended pages.
 */
export async function mergeCoverWithPdf(
  originalPdfArrayBuffer: ArrayBuffer,
  coverData: CoverData,
  qrDataUrl: string
): Promise<Uint8Array> {
  const coverPdf = await generateCoverPagePdf(coverData, qrDataUrl);
  if (!originalPdfArrayBuffer || originalPdfArrayBuffer.byteLength === 0) {
    throw new Error('The uploaded PDF buffer is empty or unavailable. Please re-upload your PDF.');
  }
  const safeBuffer = new Uint8Array(originalPdfArrayBuffer).slice().buffer;
  const originalPdf = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });

  const mergedPdf = await PDFDocument.create();
  mergedPdf.registerFontkit(fontkit);
  mergedPdf.setProducer('PaperLink');
  mergedPdf.setCreator('PaperLink');

  const [copiedCover] = await mergedPdf.copyPages(coverPdf, [0]);
  mergedPdf.addPage(copiedCover);

  const coverDims = PAPER_SIZES[coverData.paperSize] || PAPER_SIZES.a4;
  const coverW = coverDims.width;
  const coverH = coverDims.height;
  const scalePercent = Math.max(50, Math.min(125, coverData.documentPageScale ?? 100));
  const userScaleRatio = scalePercent / 100;

  const origPages = originalPdf.getPages();
  const shouldStampNumbers = !!coverData.stampPageNumbers;
  const watermarkText = (coverData.watermarkText || '').trim();
  const watermarkOpacity = Math.max(0.05, Math.min(0.45, coverData.watermarkOpacity ?? 0.14));

  const stampFont =
    shouldStampNumbers || watermarkText
      ? await mergedPdf.embedFont(StandardFonts.HelveticaBold)
      : null;

  const totalFinalPages = 1 + origPages.length;
  const stampImageCache = new Map<string, EmbeddedImageHandle | null>();
  const allAppliedStamps = coverData.appliedStamps || [];

  for (let idx = 0; idx < origPages.length; idx++) {
    const origPage = origPages[idx];
    const { width: origW, height: origH } = origPage.getSize();
    const rot = (((origPage.getRotation()?.angle ?? 0) % 360) + 360) % 360;
    const isQuarterTurn = rot === 90 || rot === 270;
    const visW = isQuarterTurn ? origH : origW;
    const visH = isQuarterTurn ? origW : origH;

    const matchesCoverSize =
      rot === 0 && Math.abs(origW - coverW) <= 2 && Math.abs(origH - coverH) <= 2;

    let targetPage: PDFPage;

    if (scalePercent === 100 && matchesCoverSize) {
      const [copied] = await mergedPdf.copyPages(originalPdf, [idx]);
      targetPage = mergedPdf.addPage(copied);
    } else {
      targetPage = mergedPdf.addPage([coverW, coverH]);
      const safeVisW = Math.max(1, visW);
      const safeVisH = Math.max(1, visH);
      const fitScale = Math.min(coverW / safeVisW, coverH / safeVisH);
      const finalScale = fitScale * userScaleRatio;
      const drawW = origW * finalScale;
      const drawH = origH * finalScale;

      let drawX = (coverW - drawW) / 2;
      let drawY = (coverH - drawH) / 2;
      let drawAngle = 0;

      if (rot === 90) {
        drawX = (coverW - drawH) / 2;
        drawY = (coverH + drawW) / 2;
        drawAngle = -90;
      } else if (rot === 180) {
        drawX = (coverW + drawW) / 2;
        drawY = (coverH + drawH) / 2;
        drawAngle = 180;
      } else if (rot === 270) {
        drawX = (coverW + drawH) / 2;
        drawY = (coverH - drawW) / 2;
        drawAngle = 90;
      }

      try {
        const embedded = await mergedPdf.embedPage(origPage);
        targetPage.drawPage(embedded, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
          rotate: degrees(drawAngle),
        });
      } catch {
        // Fallback for empty/missing-content PDF pages so merge never aborts
        if (!origPage.node.Contents()) {
          // Intentionally blank page preserved at normalized cover dimensions
        } else {
          mergedPdf.removePage(mergedPdf.getPageCount() - 1);
          const [fallbackCopied] = await mergedPdf.copyPages(originalPdf, [idx]);
          targetPage = mergedPdf.addPage(fallbackCopied);
        }
      }
    }

    const { width, height } = targetPage.getSize();
    const pageNum = idx + 2; // Cover is Page 1

    if (watermarkText && stampFont) {
      const safeWm = sanitizeWinAnsiText(watermarkText) || 'CONFIDENTIAL';
      const fontSize = Math.max(24, Math.min(54, width * 0.08));
      const textWidth = stampFont.widthOfTextAtSize(safeWm, fontSize);
      targetPage.drawText(safeWm, {
        x: width / 2 - textWidth * 0.35,
        y: height / 2 - textWidth * 0.25,
        size: fontSize,
        font: stampFont,
        color: rgb(0.45, 0.48, 0.54),
        opacity: watermarkOpacity,
        rotate: degrees(42),
      });
    }

    // Apply custom uploaded/text stamps scoped to this attached PDF page
    const pageStamps = allAppliedStamps.filter(
      (st) =>
        st.pageScope === 'all-attached' ||
        st.pageScope === 'all-including-cover' ||
        (st.pageScope === 'first-attached' && idx === 0)
    );
    if (pageStamps.length > 0) {
      await drawAppliedStampsOnPage(mergedPdf, targetPage, pageStamps, stampImageCache);
    }

    if (shouldStampNumbers && stampFont) {
      const label = `Page ${pageNum} of ${totalFinalPages}`;
      const lw = stampFont.widthOfTextAtSize(label, 8.5);
      targetPage.drawText(label, {
        x: width - lw - 24,
        y: 16,
        size: 8.5,
        font: stampFont,
        color: rgb(0.35, 0.38, 0.45),
        opacity: 0.85,
      });
    }
  }

  return await mergedPdf.save();
}
