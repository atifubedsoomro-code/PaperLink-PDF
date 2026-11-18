import { PDFDocument, PDFPage, PDFFont, rgb, degrees, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { CoverData, FontStyle } from '../types';
import { COVER_THEMES } from '../constants/themes';

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
 * Normalizes smart punctuation for WinAnsi vector drawing when text is purely Latin-1.
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
  switch (fontStyle) {
    case 'playfair':
      return '"Playfair Display", Georgia, serif';
    case 'merriweather':
      return '"Merriweather", Georgia, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, monospace';
    case 'montserrat':
      return '"Montserrat", "Plus Jakarta Sans", sans-serif';
    case 'oswald':
      return '"Oswald", "Plus Jakarta Sans", sans-serif';
    case 'space':
    case 'inter':
    default:
      return '"Plus Jakarta Sans", "DM Sans", system-ui, sans-serif';
  }
}

/**
 * Renders rich Unicode / Non-Latin (Arabic, Urdu, CJK, Cyrillic, Emoji) or custom-font lines
 * as a crisp 3x DPI transparent PNG strip and embeds it cleanly at exact PDF coordinates.
 */
async function drawCanvasTextLines(
  pdfDoc: PDFDocument,
  page: PDFPage,
  lines: string[],
  options: {
    xLeft: number;
    maxWidth: number;
    topBaselineY: number;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
    fontFamily: string;
    colorHex: string;
    opacity?: number;
    align: 'left' | 'center' | 'right';
  }
): Promise<void> {
  if (typeof document === 'undefined' || lines.length === 0) return;

  const scale = 3; // 216+ DPI rasterization for ultra-sharp print text
  const blockW = Math.max(10, Math.ceil(options.maxWidth));
  const blockH = Math.max(10, Math.ceil(lines.length * options.lineHeight + options.fontSize * 0.4));

  const canvas = document.createElement('canvas');
  canvas.width = blockW * scale;
  canvas.height = blockH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  ctx.fillStyle = options.colorHex;
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, idx) => {
    const isRtl = HAS_RTL_RE.test(line);
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    const baselineY = options.fontSize + idx * options.lineHeight;
    if (options.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(line, blockW / 2, baselineY);
    } else if (options.align === 'right' || isRtl) {
      ctx.textAlign = 'right';
      ctx.fillText(line, options.align === 'right' ? blockW : Math.min(blockW, blockW), baselineY);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line, 0, baselineY);
    }
  });

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const embedded = await pdfDoc.embedPng(bytes);
  page.drawImage(embedded, {
    x: options.xLeft,
    y: options.topBaselineY - blockH + options.fontSize,
    width: blockW,
    height: blockH,
  });
}

function wrapUnicodeTextCanvas(
  text: string,
  fontWeight: number,
  fontSize: number,
  fontFamily: string,
  maxWidth: number
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (typeof document === 'undefined') return [clean];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [clean];
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  const paragraphs = clean.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
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

/**
 * Fetch image bytes as Uint8Array (raw fallback if canvas rendering is unavailable)
 */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png' } | null> {
  try {
    if (url.startsWith('data:image/')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || '';
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
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
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, format: mime === 'image/png' ? 'png' : 'jpg' };
  } catch {
    return await fetchImageBytes(url);
  }
}

/**
 * Pixel-accurate text wrapper using pdf-lib font glyph measurements.
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
    if (words.length === 0) continue;

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
 * Registers @pdf-lib/fontkit and handles both Latin vector text and Arabic/Urdu/CJK/Emoji scripts cleanly.
 */
export async function generateCoverPagePdf(
  coverData: CoverData,
  qrDataUrl: string
): Promise<PDFDocument> {
  const theme = COVER_THEMES.find((t) => t.id === coverData.themeId) || COVER_THEMES[0];
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  const dims = PAPER_SIZES[coverData.paperSize] || PAPER_SIZES.a4;
  const s = dims.width / PREVIEW_PAPER_W;
  const page = pdfDoc.addPage([dims.width, dims.height]);

  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontTimesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontTimesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const isSerif = coverData.font === 'playfair' || coverData.font === 'merriweather';
  const isMono = coverData.font === 'mono';
  const cssFontFamily = getCssFontFamily(coverData.font);

  const titleFont = isSerif ? fontTimesRomanBold : isMono ? fontCourierBold : fontHelveticaBold;
  const bodyFont = isSerif ? fontTimesRoman : isMono ? fontCourierBold : fontHelvetica;
  const bodyBoldFont = isSerif ? fontTimesRomanBold : isMono ? fontCourierBold : fontHelveticaBold;

  const isDarkTheme = !!theme.isDark;
  const primaryHex = hexToCss(coverData.primaryColor || theme.primaryColor, '#000000');
  const accentHex = hexToCss(coverData.accentColor || theme.accentColor, '#facc15');
  const titleHex = hexToCss(coverData.titleColor, isDarkTheme ? '#ffffff' : primaryHex);
  const subtitleHex = hexToCss(coverData.subtitleColor, accentHex);
  const bodyHex = hexToCss(coverData.textColor, isDarkTheme ? '#cbd5e1' : '#334155');

  const primaryRgb = hexToPdfRgb(primaryHex);
  const accentRgb = hexToPdfRgb(accentHex);
  const titleRgb = hexToPdfRgb(titleHex);
  const subtitleRgb = hexToPdfRgb(subtitleHex);
  const bodyRgb = hexToPdfRgb(bodyHex);
  const bgRgb = hexToPdfRgb(theme.backgroundColor, '#ffffff');
  const dividerRgb = hexToPdfRgb(isDarkTheme ? '#334155' : '#e2e8f0');

  /** Smart drawer that keeps sharp vector fonts for Latin-1 and seamlessly renders Unicode/custom fonts via hi-DPI canvas */
  const drawSmartTextLines = async (
    rawText: string,
    opts: {
      xLeft: number;
      maxWidth: number;
      topBaselineY: number;
      fontSize: number;
      lineHeight: number;
      font: PDFFont;
      fontWeight: number;
      colorRgb: ReturnType<typeof rgb>;
      colorHex: string;
      opacity?: number;
      align: 'left' | 'center' | 'right';
      lines: string[];
    }
  ) => {
    const needsUnicodeCanvas =
      HAS_NON_WINANSI_RE.test(rawText) ||
      coverData.font === 'montserrat' ||
      coverData.font === 'oswald' ||
      coverData.font === 'playfair';

    if (needsUnicodeCanvas && typeof document !== 'undefined') {
      await drawCanvasTextLines(pdfDoc, page, opts.lines, {
        xLeft: opts.xLeft,
        maxWidth: opts.maxWidth,
        topBaselineY: opts.topBaselineY,
        fontSize: opts.fontSize,
        lineHeight: opts.lineHeight,
        fontWeight: opts.fontWeight,
        fontFamily: cssFontFamily,
        colorHex: opts.colorHex,
        opacity: opts.opacity,
        align: opts.align,
      });
      return;
    }

    let y = opts.topBaselineY;
    for (const line of opts.lines) {
      const safeLine = sanitizeWinAnsiText(line);
      const w = opts.font.widthOfTextAtSize(safeLine, opts.fontSize);
      const x =
        opts.align === 'center'
          ? opts.xLeft + (opts.maxWidth - w) / 2
          : opts.align === 'right'
          ? opts.xLeft + opts.maxWidth - w
          : opts.xLeft;
      page.drawText(safeLine, {
        x,
        y,
        size: opts.fontSize,
        font: opts.font,
        color: opts.colorRgb,
        opacity: opts.opacity,
      });
      y -= opts.lineHeight;
    }
  };

  // 1. Page Background Fill
  page.drawRectangle({
    x: 0,
    y: 0,
    width: dims.width,
    height: dims.height,
    color: bgRgb,
  });

  // 2. Custom Background Watermark
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
  const isCentered = layout === 'plain-centered';
  const isLeftBar = layout === 'plain-left-bar';
  const hasBanner =
    (layout === 'banner-top' || layout === 'split-vertical') && !coverData.backgroundImageUrl;

  const padXRight = 40 * s;
  const padXLeft = (isLeftBar ? 56 : 40) * s;
  const contentWidth = dims.width - padXLeft - padXRight;
  const bannerHeight = 160 * s;

  // 3. Theme Layout Decorations
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

    const bannerMetaY = dims.height - 25 * s;
    if (coverData.documentId) {
      const docIdText = coverData.documentId;
      await drawSmartTextLines(docIdText, {
        xLeft: 24 * s,
        maxWidth: contentWidth * 0.5,
        topBaselineY: bannerMetaY,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        font: fontCourierBold,
        fontWeight: 700,
        colorRgb: rgb(1, 1, 1),
        colorHex: '#ffffff',
        align: 'left',
        lines: [docIdText],
      });
    }
    if (coverData.organization) {
      const orgUpper = coverData.organization.toUpperCase();
      await drawSmartTextLines(orgUpper, {
        xLeft: dims.width - 24 * s - contentWidth * 0.55,
        maxWidth: contentWidth * 0.55,
        topBaselineY: bannerMetaY,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        font: fontHelveticaBold,
        fontWeight: 700,
        colorRgb: rgb(1, 1, 1),
        colorHex: '#ffffff',
        align: 'right',
        lines: [orgUpper],
      });
    }
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

  // 4. Bottom Footer Section (QR Card + Metadata + Optional Verification Badge)
  const bottomPad = 40 * s;
  const shouldIncludeQr = coverData.includeQr !== false;
  const qrPos = coverData.qrPosition || 'bottom-right';
  const qrImgSize = 112 * s;
  const qrCardPad = 8 * s;
  const qrLabelH = 18 * s;
  const qrCardW = qrImgSize + qrCardPad * 2;
  const qrCardH = qrImgSize + qrCardPad * 2 + qrLabelH;
  const ctaRaw =
    coverData.qrCallToAction || 'Scan with phone camera to view full soft copy on Google Drive.';
  const ctaLines = shouldIncludeQr
    ? (HAS_NON_WINANSI_RE.test(ctaRaw)
        ? wrapUnicodeTextCanvas(ctaRaw, 500, 9 * s, cssFontFamily, 130 * s).slice(0, 3)
        : wrapTextByWidth(ctaRaw, bodyFont, 9 * s, 130 * s).slice(0, 3))
    : [];
  const ctaBlockH = ctaLines.length > 0 ? 6 * s + ctaLines.length * (11 * s) : 0;

  // Build Verification Pills/Lines (version, sync timestamp, expiry note)
  const syncStampText = coverData.showSyncTimestamp
    ? `Synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : '';
  const verificationParts = [
    coverData.version?.trim() ? `Rev ${coverData.version.trim()}` : '',
    syncStampText,
    coverData.expiryNote?.trim() || '',
  ].filter(Boolean);

  const verificationLine = verificationParts.join(' · ');

  let footerTopY = bottomPad + qrCardH + ctaBlockH;
  let qrCardBottomY = bottomPad + ctaBlockH;

  if (!shouldIncludeQr) {
    const basicMetaHeight =
      (coverData.preparedBy ? 34 * s : 0) +
      (coverData.date ? 30 * s : 0) +
      (verificationLine ? 18 * s : 0);
    footerTopY = bottomPad + Math.max(24 * s, basicMetaHeight);
  } else if (qrPos === 'bottom-center') {
    const hasMeta = Boolean(coverData.preparedBy || coverData.date || verificationLine);
    const metaRowH = hasMeta ? (verificationLine ? 34 * s : 22 * s) : 0;
    footerTopY = bottomPad + metaRowH + ctaBlockH + qrCardH;
    qrCardBottomY = bottomPad + metaRowH + ctaBlockH;
  }

  const footerDividerY = footerTopY + 18 * s;

  page.drawLine({
    start: { x: padXLeft, y: footerDividerY },
    end: { x: dims.width - padXRight, y: footerDividerY },
    thickness: 0.8 * s,
    color: dividerRgb,
  });

  // Draw Metadata Block
  const metaRightAligned = shouldIncludeQr && qrPos === 'bottom-left';
  if (!shouldIncludeQr) {
    const inlineParts = [coverData.preparedBy, coverData.date, verificationLine].filter(Boolean) as string[];
    if (inlineParts.length > 0) {
      const footerSummary = inlineParts.join('   ·   ');
      await drawSmartTextLines(footerSummary, {
        xLeft: padXLeft,
        maxWidth: contentWidth,
        topBaselineY: bottomPad + 6 * s,
        fontSize: 11 * s,
        lineHeight: 14 * s,
        font: bodyFont,
        fontWeight: 500,
        colorRgb: bodyRgb,
        colorHex: bodyHex,
        align: isCentered ? 'center' : 'left',
        lines: [footerSummary],
      });
    }
  } else if (qrPos === 'bottom-center') {
    let inlineY = bottomPad + (verificationLine ? 16 * s : 4 * s);
    if (coverData.preparedBy || coverData.date) {
      const parts = [coverData.preparedBy, coverData.date].filter(Boolean) as string[];
      const inlineMeta = parts.join('   -   ');
      await drawSmartTextLines(inlineMeta, {
        xLeft: padXLeft,
        maxWidth: contentWidth,
        topBaselineY: inlineY,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        font: bodyFont,
        fontWeight: 500,
        colorRgb: bodyRgb,
        colorHex: bodyHex,
        align: 'center',
        lines: [inlineMeta],
      });
    }
    if (verificationLine) {
      const safeVer = sanitizeWinAnsiText(verificationLine);
      const vw = fontCourierBold.widthOfTextAtSize(safeVer, 8.5 * s);
      page.drawText(safeVer, {
        x: (dims.width - vw) / 2,
        y: bottomPad + 2 * s,
        size: 8.5 * s,
        font: fontCourierBold,
        color: accentRgb,
        opacity: 0.88,
      });
    }
  } else {
    let metaCursorY = bottomPad;
    const metaMaxW = dims.width - padXLeft - padXRight - qrCardW - 18 * s;
    const metaXLeft = metaRightAligned ? padXLeft + qrCardW + 18 * s : padXLeft;
    const metaAlign = metaRightAligned ? 'right' : 'left';

    const drawSimpleMeta = (text: string, font: PDFFont, size: number, color: ReturnType<typeof rgb>, opacity = 1) => {
      const w = font.widthOfTextAtSize(text, size);
      const x = metaRightAligned ? dims.width - padXRight - w : padXLeft;
      page.drawText(text, { x, y: metaCursorY, size, font, color, opacity });
    };

    drawSimpleMeta('Official Soft Copy · Google Drive', fontCourierBold, 9 * s, bodyRgb, 0.58);
    metaCursorY += 15 * s;

    if (verificationLine) {
      drawSimpleMeta(sanitizeWinAnsiText(verificationLine), fontCourierBold, 8.5 * s, accentRgb, 0.9);
      metaCursorY += 16 * s;
    } else {
      metaCursorY += 5 * s;
    }

    if (coverData.date) {
      await drawSmartTextLines(coverData.date, {
        xLeft: metaXLeft,
        maxWidth: metaMaxW,
        topBaselineY: metaCursorY,
        fontSize: 12 * s,
        lineHeight: 14 * s,
        font: bodyFont,
        fontWeight: 500,
        colorRgb: bodyRgb,
        colorHex: bodyHex,
        opacity: 0.9,
        align: metaAlign,
        lines: [coverData.date],
      });
      metaCursorY += 14 * s;
      drawSimpleMeta('DATE', bodyBoldFont, 10 * s, accentRgb, 0.75);
      metaCursorY += 18 * s;
    }

    if (coverData.preparedBy) {
      await drawSmartTextLines(coverData.preparedBy, {
        xLeft: metaXLeft,
        maxWidth: metaMaxW,
        topBaselineY: metaCursorY,
        fontSize: 12 * s,
        lineHeight: 14 * s,
        font: bodyBoldFont,
        fontWeight: 700,
        colorRgb: bodyRgb,
        colorHex: bodyHex,
        opacity: 1,
        align: metaAlign,
        lines: [coverData.preparedBy],
      });
      metaCursorY += 14 * s;
      drawSimpleMeta('PREPARED BY', bodyBoldFont, 10 * s, accentRgb, 0.75);
    }
  }

  // Draw QR Code Block (only when includeQr !== false)
  if (shouldIncludeQr) {
    const qrCardX =
      qrPos === 'bottom-left'
        ? padXLeft
        : qrPos === 'bottom-center'
        ? (dims.width - qrCardW) / 2
        : dims.width - padXRight - qrCardW;

    page.drawRectangle({
      x: qrCardX,
      y: qrCardBottomY,
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
          y: qrCardBottomY + qrCardPad + qrLabelH,
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
      y: qrCardBottomY + qrCardPad + 4 * s,
      size: 8 * s,
      font: fontHelveticaBold,
      color: hexToPdfRgb('#0f172a'),
    });

    const qrCenterX = qrCardX + qrCardW / 2;
    await drawSmartTextLines(ctaRaw, {
      xLeft: qrCenterX - 68 * s,
      maxWidth: 136 * s,
      topBaselineY: qrCardBottomY - 12 * s,
      fontSize: 9 * s,
      lineHeight: 11 * s,
      font: bodyFont,
      fontWeight: 500,
      colorRgb: bodyRgb,
      colorHex: bodyHex,
      opacity: 0.78,
      align: 'center',
      lines: ctaLines,
    });
  }

  // 5. Middle Content Stack (Logo + Header Meta + Title + Subtitle + Accent Rule + Summary)
  const topAreaStart = (hasBanner ? dims.height - bannerHeight : dims.height) - 40 * s;
  const availableMiddleH = Math.max(120 * s, topAreaStart - (footerDividerY + 14 * s));

  let embeddedLogo: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoDrawW = 0;
  let logoDrawH = 0;
  if (coverData.logoUrl && coverData.logoPosition !== 'qr-center') {
    const logoData = await fetchImageBytes(coverData.logoUrl);
    if (logoData) {
      try {
        embeddedLogo =
          logoData.format === 'png'
            ? await pdfDoc.embedPng(logoData.bytes)
            : await pdfDoc.embedJpg(logoData.bytes);
        const maxH = (coverData.logoSize === 'large' ? 56 : coverData.logoSize === 'small' ? 32 : 40) * s;
        const maxW = (coverData.logoSize === 'large' ? 200 : coverData.logoSize === 'small' ? 120 : 160) * s;
        const ratio = Math.min(maxW / embeddedLogo.width, maxH / embeddedLogo.height);
        logoDrawW = embeddedLogo.width * ratio;
        logoDrawH = embeddedLogo.height * ratio;
      } catch (err) {
        console.warn('Logo embed failed:', err);
      }
    }
  }

  const showNonBannerMeta = !hasBanner && Boolean(coverData.documentId || coverData.organization);
  const rawTitle = (coverData.title || '').trim() || 'Document Title';
  const titleUsesUnicode =
    HAS_NON_WINANSI_RE.test(rawTitle) ||
    coverData.font === 'montserrat' ||
    coverData.font === 'oswald' ||
    coverData.font === 'playfair';

  let titleSize = 30 * s;
  let titleLines = titleUsesUnicode
    ? wrapUnicodeTextCanvas(rawTitle, 800, titleSize, cssFontFamily, contentWidth)
    : wrapTextByWidth(rawTitle, titleFont, titleSize, contentWidth);
  if (titleLines.length > 4) {
    titleSize = 24 * s;
    titleLines = titleUsesUnicode
      ? wrapUnicodeTextCanvas(rawTitle, 800, titleSize, cssFontFamily, contentWidth)
      : wrapTextByWidth(rawTitle, titleFont, titleSize, contentWidth);
  }
  const titleLineH = titleSize * 1.2;

  const rawSub = (coverData.subtitle || '').trim();
  const subSize = 14 * s;
  const subUsesUnicode =
    HAS_NON_WINANSI_RE.test(rawSub) ||
    coverData.font === 'montserrat' ||
    coverData.font === 'oswald' ||
    coverData.font === 'playfair';
  const subLines = rawSub
    ? (subUsesUnicode
        ? wrapUnicodeTextCanvas(rawSub, 500, subSize, cssFontFamily, contentWidth)
        : wrapTextByWidth(rawSub, bodyFont, subSize, contentWidth)
      ).slice(0, 3)
    : [];
  const subLineH = subSize * 1.35;

  const rawSummary = (coverData.summary || '').trim();
  const sumSize = 12 * s;
  const sumUsesUnicode =
    HAS_NON_WINANSI_RE.test(rawSummary) ||
    coverData.font === 'montserrat' ||
    coverData.font === 'oswald' ||
    coverData.font === 'playfair';
  const sumLines = rawSummary
    ? (sumUsesUnicode
        ? wrapUnicodeTextCanvas(rawSummary, 400, sumSize, cssFontFamily, contentWidth)
        : wrapTextByWidth(rawSummary, bodyFont, sumSize, contentWidth)
      ).slice(0, 4)
    : [];
  const sumLineH = sumSize * 1.45;

  let totalMiddleH = 0;
  if (embeddedLogo) totalMiddleH += logoDrawH + 16 * s;
  if (showNonBannerMeta) totalMiddleH += 34 * s;
  totalMiddleH += 8 * s + titleLines.length * titleLineH;
  if (subLines.length > 0) totalMiddleH += 8 * s + subLines.length * subLineH;
  totalMiddleH += 16 * s + 4 * s;
  if (sumLines.length > 0) totalMiddleH += 16 * s + sumLines.length * sumLineH;

  let cursorY = isCentered
    ? footerDividerY + 14 * s + Math.max(0, (availableMiddleH - totalMiddleH) / 2) + totalMiddleH
    : topAreaStart;

  if (embeddedLogo) {
    const lx =
      coverData.logoPosition === 'top-center'
        ? (dims.width - logoDrawW) / 2
        : coverData.logoPosition === 'top-right'
        ? dims.width - padXRight - logoDrawW
        : padXLeft;
    page.drawImage(embeddedLogo, {
      x: lx,
      y: cursorY - logoDrawH,
      width: logoDrawW,
      height: logoDrawH,
    });
    cursorY -= logoDrawH + 16 * s;
  }

  if (showNonBannerMeta) {
    cursorY -= 12 * s;
    if (isCentered) {
      const parts: string[] = [];
      if (coverData.documentId) parts.push(coverData.documentId);
      if (coverData.organization) parts.push(coverData.organization.toUpperCase());
      const combined = parts.join('   ·   ');
      await drawSmartTextLines(combined, {
        xLeft: padXLeft,
        maxWidth: contentWidth,
        topBaselineY: cursorY,
        fontSize: 11 * s,
        lineHeight: 13 * s,
        font: fontHelveticaBold,
        fontWeight: 700,
        colorRgb: bodyRgb,
        colorHex: bodyHex,
        align: 'center',
        lines: [combined],
      });
    } else {
      if (coverData.documentId) {
        await drawSmartTextLines(coverData.documentId, {
          xLeft: padXLeft,
          maxWidth: contentWidth * 0.48,
          topBaselineY: cursorY,
          fontSize: 11 * s,
          lineHeight: 13 * s,
          font: fontCourierBold,
          fontWeight: 700,
          colorRgb: accentRgb,
          colorHex: accentHex,
          align: 'left',
          lines: [coverData.documentId],
        });
      }
      if (coverData.organization) {
        const orgUpper = coverData.organization.toUpperCase();
        await drawSmartTextLines(orgUpper, {
          xLeft: padXLeft + contentWidth * 0.48,
          maxWidth: contentWidth * 0.52,
          topBaselineY: cursorY,
          fontSize: 12 * s,
          lineHeight: 14 * s,
          font: fontHelveticaBold,
          fontWeight: 700,
          colorRgb: isDarkTheme ? titleRgb : primaryRgb,
          colorHex: isDarkTheme ? titleHex : primaryHex,
          align: 'right',
          lines: [orgUpper],
        });
      }
    }
    page.drawLine({
      start: { x: padXLeft, y: cursorY - 8 * s },
      end: { x: dims.width - padXRight, y: cursorY - 8 * s },
      thickness: 0.75 * s,
      color: dividerRgb,
    });
    cursorY -= 26 * s;
  }

  // Draw Title
  cursorY -= titleSize * 0.9;
  await drawSmartTextLines(rawTitle, {
    xLeft: padXLeft,
    maxWidth: contentWidth,
    topBaselineY: cursorY,
    fontSize: titleSize,
    lineHeight: titleLineH,
    font: titleFont,
    fontWeight: 800,
    colorRgb: titleRgb,
    colorHex: titleHex,
    align: isCentered ? 'center' : 'left',
    lines: titleLines,
  });
  cursorY -= titleLines.length * titleLineH;

  // Draw Subtitle
  if (subLines.length > 0) {
    cursorY -= 4 * s;
    await drawSmartTextLines(rawSub, {
      xLeft: padXLeft,
      maxWidth: contentWidth,
      topBaselineY: cursorY,
      fontSize: subSize,
      lineHeight: subLineH,
      font: bodyFont,
      fontWeight: 500,
      colorRgb: subtitleRgb,
      colorHex: subtitleHex,
      opacity: 0.92,
      align: isCentered ? 'center' : 'left',
      lines: subLines,
    });
    cursorY -= subLines.length * subLineH;
  }

  // Accent Pill Bar
  cursorY -= 8 * s;
  page.drawRectangle({
    x: isCentered ? (dims.width - 48 * s) / 2 : padXLeft,
    y: cursorY - 4 * s,
    width: 48 * s,
    height: 4 * s,
    color: accentRgb,
  });
  cursorY -= 16 * s;

  // Draw Summary
  if (sumLines.length > 0) {
    cursorY -= 6 * s;
    await drawSmartTextLines(rawSummary, {
      xLeft: padXLeft,
      maxWidth: contentWidth,
      topBaselineY: cursorY,
      fontSize: sumSize,
      lineHeight: sumLineH,
      font: bodyFont,
      fontWeight: 400,
      colorRgb: bodyRgb,
      colorHex: bodyHex,
      align: isCentered ? 'center' : 'left',
      lines: sumLines,
    });
  }

  return pdfDoc;
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
  const safeBuffer = new Uint8Array(originalPdfArrayBuffer).slice().buffer;
  const originalPdf = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });

  const mergedPdf = await PDFDocument.create();
  mergedPdf.registerFontkit(fontkit);
  mergedPdf.setProducer('PaperLink');
  mergedPdf.setCreator('PaperLink');

  const [copiedCover] = await mergedPdf.copyPages(coverPdf, [0]);
  mergedPdf.addPage(copiedCover);

  const originalPageCount = originalPdf.getPageCount();
  const pageIndices = Array.from({ length: originalPageCount }, (_, i) => i);
  const copiedPages = await mergedPdf.copyPages(originalPdf, pageIndices);

  const shouldStampNumbers = !!coverData.stampPageNumbers;
  const watermarkText = (coverData.watermarkText || '').trim();
  const watermarkOpacity = Math.max(0.05, Math.min(0.45, coverData.watermarkOpacity ?? 0.14));

  const stampFont =
    shouldStampNumbers || watermarkText
      ? await mergedPdf.embedFont(StandardFonts.HelveticaBold)
      : null;

  const totalFinalPages = 1 + copiedPages.length;

  copiedPages.forEach((p, idx) => {
    const { width, height } = p.getSize();
    const pageNum = idx + 2; // Cover is Page 1

    if (watermarkText && stampFont) {
      const safeWm = sanitizeWinAnsiText(watermarkText) || 'CONFIDENTIAL';
      const fontSize = Math.max(24, Math.min(54, width * 0.08));
      const textWidth = stampFont.widthOfTextAtSize(safeWm, fontSize);
      p.drawText(safeWm, {
        x: width / 2 - textWidth * 0.35,
        y: height / 2 - textWidth * 0.25,
        size: fontSize,
        font: stampFont,
        color: rgb(0.45, 0.48, 0.54),
        opacity: watermarkOpacity,
        rotate: degrees(42),
      });
    }

    if (shouldStampNumbers && stampFont) {
      const label = `Page ${pageNum} of ${totalFinalPages}`;
      const lw = stampFont.widthOfTextAtSize(label, 8.5);
      p.drawText(label, {
        x: width - lw - 24,
        y: 16,
        size: 8.5,
        font: stampFont,
        color: rgb(0.35, 0.38, 0.45),
        opacity: 0.85,
      });
    }

    mergedPdf.addPage(p);
  });

  return await mergedPdf.save();
}
