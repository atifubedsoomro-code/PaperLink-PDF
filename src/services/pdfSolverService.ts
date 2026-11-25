import { PDFDocument } from 'pdf-lib';
import { PDFDocument as CantooPDFDocument } from '@cantoo/pdf-lib';
import { convertImagesToPdf, convertWordToPdf } from './pdfToolkit';
import type {
  AnswerSheetQuestionItem,
  InPlaceFillItem,
  SolveDocumentPageInput,
  SolvedDocumentPlan,
} from '../../api/solve-document';

export type SolverInkStyle = 'blue-ink' | 'black';

export interface SolveDocumentOptions {
  userInstruction?: string;
  mode?: 'auto' | 'fill-in-place' | 'separate-answer-sheet';
  inkStyle?: SolverInkStyle;
}

export interface SolveDocumentResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  sourcePageCount: number;
  outputPageCount: number;
  detectedType: SolvedDocumentPlan['detectedType'];
  chosenMode: SolvedDocumentPlan['chosenMode'];
  documentTitle: string;
  fillsApplied: number;
  diagramsDrawn: number;
  answerSectionsCount: number;
  summaryNote: string;
  previewSections: AnswerSheetQuestionItem[];
}

function getPdfJs(): any {
  if (typeof window === 'undefined' || !window.pdfjsLib) {
    throw new Error('PDF rendering engine is still loading. Please try again in a moment.');
  }
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return window.pdfjsLib;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function baseNameClean(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'document';
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function sanitizeSvgMarkup(rawSvg: string): string {
  let clean = (rawSvg || '').trim();
  const match = clean.match(/<svg[\s\S]*<\/svg>/i);
  if (match) clean = match[0];

  clean = clean
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&copy;/g, '&#169;')
    .replace(/&mdash;/g, '&#8212;')
    .replace(/&ndash;/g, '&#8211;')
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

  if (!/xmlns\s*=/i.test(clean)) {
    clean = clean.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return clean;
}

function parseSvgDimensions(svg: string): { w: number; h: number } {
  const vbMatch = svg.match(/viewBox\s*=\s*["']\s*[-+]?[\d.]+\s+[-+]?[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (vbMatch) {
    const w = parseFloat(vbMatch[1]);
    const h = parseFloat(vbMatch[2]);
    if (w > 10 && h > 10) return { w, h };
  }
  const wMatch = svg.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
  const hMatch = svg.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
  const w = wMatch ? parseFloat(wMatch[1]) : 440;
  const h = hMatch ? parseFloat(hMatch[1]) : 260;
  return { w: w > 10 ? w : 440, h: h > 10 ? h : 260 };
}

async function rasterizeSvgToCanvasImage(
  rawSvg: string,
  maxTargetW: number,
  maxTargetH: number,
  dpiScale = 3
): Promise<{ pngBytes: Uint8Array; canvas: HTMLCanvasElement; drawW: number; drawH: number } | null> {
  try {
    const cleanSvg = sanitizeSvgMarkup(rawSvg);
    if (!cleanSvg.toLowerCase().startsWith('<svg')) return null;

    const { w: natW, h: natH } = parseSvgDimensions(cleanSvg);
    const fitScale = Math.min(maxTargetW / natW, maxTargetH / natH);
    const drawW = Math.max(24, Math.round(natW * fitScale));
    const drawH = Math.max(20, Math.round(natH * fitScale));

    // Inject explicit width/height so browser SVG rasterizer honors target crisp pixel size
    let sizedSvg = cleanSvg
      .replace(/(<svg\b[^>]*?)\s+width\s*=\s*["'][^"']*["']/i, '$1')
      .replace(/(<svg\b[^>]*?)\s+height\s*=\s*["'][^"']*["']/i, '$1');
    sizedSvg = sizedSvg.replace(
      /<svg\b/i,
      `<svg width="${Math.round(drawW * dpiScale)}" height="${Math.round(drawH * dpiScale)}"`
    );

    const svgBlob = new Blob([sizedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        const timer = window.setTimeout(() => reject(new Error('SVG load timeout')), 4500);
        el.onload = () => {
          window.clearTimeout(timer);
          resolve(el);
        };
        el.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('Invalid SVG geometry'));
        };
        el.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(drawW * dpiScale));
      canvas.height = Math.max(1, Math.round(drawH * dpiScale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const pngBytes = dataUrlToUint8Array(canvas.toDataURL('image/png'));
      return { pngBytes, canvas, drawW, drawH };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Wraps and draws an in-place answer onto a transparent high-DPI canvas sized exactly to the target PDF box.
 * Supports `firstLineXmin` so "Answer: _____" begins cleanly after the colon on line 1 then wraps back to left margin!
 */
function renderInPlaceTextToPngBytes(
  item: InPlaceFillItem,
  boxWidthPt: number,
  boxHeightPt: number,
  inkColor: string
): Uint8Array | null {
  const rawText = (item.answerText || '').replace(/\r\n/g, '\n').trim();
  if (!rawText) return null;

  const dpi = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(24, Math.ceil(boxWidthPt * dpi));
  canvas.height = Math.max(20, Math.ceil(boxHeightPt * dpi));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpi, dpi);

  const isCell = item.fieldKind === 'table-cell' || item.fieldKind === 'short-blank';
  const padX = isCell ? 3.5 : 2;
  const padY = isCell ? 2 : 1.5;

  const spanNorm = Math.max(1, item.xmax - item.xmin);
  const firstLineIndentPt =
    typeof item.firstLineXmin === 'number' && item.firstLineXmin > item.xmin && item.firstLineXmin < item.xmax
      ? ((item.firstLineXmin - item.xmin) / spanNorm) * boxWidthPt
      : 0;

  const maxFont = Math.min(11.5, Math.max(8, item.preferredFontSizePt || (isCell ? 9.8 : 10)));
  const minFont = 6.6;
  const fontFamily = '"Inter", "Segoe UI", Arial, Helvetica, sans-serif';

  interface LayoutLine {
    text: string;
    xOffset: number;
    width: number;
  }

  let chosenFont = minFont;
  let chosenLines: LayoutLine[] = [];
  let chosenLineH = minFont * 1.28;

  for (let fs = maxFont; fs >= minFont; fs -= 0.4) {
    ctx.font = `${isCell ? 600 : 500} ${fs}px ${fontFamily}`;
    const lineH = fs * (isCell ? 1.22 : 1.32);
    const lines: LayoutLine[] = [];

    const paragraphs = rawText.split('\n');
    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) {
        lines.push({ text: '', xOffset: 0, width: 0 });
        continue;
      }

      const words = trimmedPara.split(/\s+/);
      let current = '';

      const getAvailW = (lineIdx: number) =>
        Math.max(18, boxWidthPt - padX * 2 - (lineIdx === 0 ? firstLineIndentPt : 0));

      for (const word of words) {
        const currentAvailW = getAvailW(lines.length);
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > currentAvailW && current) {
          const lineIdx = lines.length;
          lines.push({
            text: current,
            xOffset: lineIdx === 0 ? firstLineIndentPt : 0,
            width: ctx.measureText(current).width,
          });
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) {
        const lineIdx = lines.length;
        lines.push({
          text: current,
          xOffset: lineIdx === 0 ? firstLineIndentPt : 0,
          width: ctx.measureText(current).width,
        });
      }
    }

    const totalH = lines.length * lineH + padY * 2;
    if (totalH <= boxHeightPt + 1 || fs <= minFont + 0.05) {
      chosenFont = fs;
      chosenLines = lines;
      chosenLineH = lineH;
      break;
    }
  }

  ctx.clearRect(0, 0, boxWidthPt, boxHeightPt);

  if (item.clearBackground) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillRect(0, 0, boxWidthPt, boxHeightPt);
  }

  ctx.font = `${isCell ? 600 : 500} ${chosenFont}px ${fontFamily}`;
  ctx.fillStyle = inkColor;
  ctx.textBaseline = 'top';

  const contentH = chosenLines.length * chosenLineH;
  let startY = padY;
  if (isCell && contentH < boxHeightPt - padY * 2) {
    startY = Math.max(padY, (boxHeightPt - contentH) / 2);
  }

  const align = item.align || (isCell ? 'center' : 'left');

  let y = startY;
  for (const l of chosenLines) {
    if (y + chosenFont * 0.7 > boxHeightPt) break;
    if (l.text) {
      let x = padX + l.xOffset;
      if (align === 'center' && l.xOffset === 0) {
        x = Math.max(padX, (boxWidthPt - l.width) / 2);
      } else if (align === 'right' && l.xOffset === 0) {
        x = Math.max(padX, boxWidthPt - padX - l.width);
      }
      ctx.fillText(l.text, x, y);
    }
    y += chosenLineH;
  }

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

async function normalizeInputToPdfFile(
  file: File,
  onStatus?: (status: string) => void
): Promise<File> {
  const ext = getFileExt(file.name);
  if (file.type === 'application/pdf' || ext === 'pdf') {
    return file;
  }
  if (ext === 'docx' || ext === 'doc') {
    onStatus?.(`Converting ${file.name} to PDF for AI Solver...`);
    const res = await convertWordToPdf(file, 'a4');
    return new File([res.blob], `${baseNameClean(file.name)}.pdf`, { type: 'application/pdf' });
  }
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
    onStatus?.(`Preparing image ${file.name} for AI Solver...`);
    const res = await convertImagesToPdf([file], 'a4');
    return new File([res.blob], `${baseNameClean(file.name)}.pdf`, { type: 'application/pdf' });
  }
  throw new Error(
    `Unsupported file "${file.name}". Please upload a PDF, Word (.docx), or Image sheet.`
  );
}

async function extractPagesForVisionSolver(
  pdfFile: File,
  onStatus?: (status: string) => void
): Promise<{ pages: SolveDocumentPageInput[]; pageCount: number }> {
  const pdfjsLib = getPdfJs();
  const buffer = new Uint8Array(await pdfFile.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const pageCount: number = pdf.numPages;
  const pages: SolveDocumentPageInput[] = [];

  for (let p = 1; p <= pageCount; p++) {
    onStatus?.(`Reading & scanning page ${p} of ${pageCount}...`);
    const page = await pdf.getPage(p);
    const baseVp = page.getViewport({ scale: 1 });
    const targetMaxDim = 900;
    const renderScale = Math.min(1.85, Math.max(1.15, targetMaxDim / Math.max(baseVp.width, baseVp.height)));
    const vp = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.68);
    const imageBase64 = jpegDataUrl.split(',')[1] || '';

    // Extract structured line-sorted text WITH exact normalized 0..1000 [y, x..xmax] landmarks
    let extractedText = '';
    try {
      const tc = await page.getTextContent();
      const scaleW = Math.max(1, baseVp.width);
      const scaleH = Math.max(1, baseVp.height);
      const lines: Array<{
        yNorm: number;
        items: Array<{ x1: number; x2: number; text: string }>;
      }> = [];

      for (const item of tc.items as any[]) {
        const rawStr = String(item?.str || '');
        const s = rawStr.trim();
        if (!s) continue;

        const [vx, vy] = baseVp.convertToViewportPoint(
          item.transform?.[4] ?? 0,
          item.transform?.[5] ?? 0
        );
        const fontH = Math.max(6, Math.hypot(item.transform?.[2] ?? 0, item.transform?.[3] ?? 0) || item.height || 10);
        const yNorm = Math.max(0, Math.min(1000, Math.round(((vy - fontH * 0.85) / scaleH) * 1000)));
        const x1 = Math.max(0, Math.min(1000, Math.round((vx / scaleW) * 1000)));
        const x2 = Math.max(x1, Math.min(1000, Math.round(((vx + (item.width || 0)) / scaleW) * 1000)));

        // Collapse long underscore blank lines cleanly while preserving exact end X coordinate
        const compactText = /^_{4,}$/.test(s) ? '_____' : s.replace(/_{4,}/g, '_____');

        const bucket = lines.find((l) => Math.abs(l.yNorm - yNorm) <= 7);
        if (bucket) {
          bucket.items.push({ x1, x2, text: compactText });
        } else {
          lines.push({ yNorm, items: [{ x1, x2, text: compactText }] });
        }
      }

      lines.sort((a, b) => a.yNorm - b.yNorm);
      extractedText = lines
        .map((l) => {
          l.items.sort((a, b) => a.x1 - b.x1);
          const spans = l.items.map((it) => `"${it.text}"[x=${it.x1}..${it.x2}]`).join(' | ');
          return `[y=${l.yNorm}] ${spans}`;
        })
        .join('\n');
    } catch {
      extractedText = '';
    }

    pages.push({
      pageNumber: p,
      width: canvas.width,
      height: canvas.height,
      imageBase64,
      extractedText,
    });
  }

  return { pages, pageCount };
}

/**
 * Renders separate high-DPI A4 Authentic Answer Sheet pages onto canvas and appends them to pdfDoc.
 */
async function appendAnswerSheetPagesToPdf(
  pdfDoc: PDFDocument,
  plan: SolvedDocumentPlan,
  sourcePageCount: number,
  onStatus?: (status: string) => void
): Promise<number> {
  const sections = plan.answerSheetSections;
  if (!sections || sections.length === 0) return 0;

  // A4 in pt: 595.28 x 841.89; Render at 2.5x DPI -> 1488 x 2105 px
  const PT_W = 595.28;
  const PT_H = 841.89;
  const SCALE = 2.5;
  const CANVAS_W = Math.round(PT_W * SCALE);
  const CANVAS_H = Math.round(PT_H * SCALE);
  const MARGIN_X = 44;
  const MARGIN_TOP = 46;
  const MARGIN_BOTTOM = 46;
  const CONTENT_W = PT_W - MARGIN_X * 2;
  const FONT_SANS = '"Inter", "Segoe UI", Arial, Helvetica, sans-serif';
  const FONT_MONO = '"JetBrains Mono", "Consolas", "Courier New", monospace';

  // Pre-rasterize optional SVG diagrams for every question section
  const preRenderedDiagrams = new Map<
    number,
    { canvas: HTMLCanvasElement; drawW: number; drawH: number }
  >();
  for (let i = 0; i < sections.length; i++) {
    const svg = sections[i]?.svgMarkup?.trim();
    if (svg) {
      onStatus?.(`Rendering solution diagram ${i + 1}...`);
      const rendered = await rasterizeSvgToCanvasImage(svg, CONTENT_W - 44, 195, SCALE);
      if (rendered) {
        preRenderedDiagrams.set(i, {
          canvas: rendered.canvas,
          drawW: rendered.drawW,
          drawH: rendered.drawH,
        });
      }
    }
  }

  const pageCanvases: HTMLCanvasElement[] = [];

  const createSheetPage = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PT_W, PT_H);
    pageCanvases.push(canvas);
    return { canvas, ctx, y: MARGIN_TOP };
  };

  interface StyledToken {
    text: string;
    bold: boolean;
    code: boolean;
  }

  const tokenizeInline = (input: string): StyledToken[] => {
    const tokens: StyledToken[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(input)) !== null) {
      if (m.index > last) {
        tokens.push({ text: input.slice(last, m.index), bold: false, code: false });
      }
      const seg = m[0];
      if (seg.startsWith('**')) {
        tokens.push({ text: seg.slice(2, -2), bold: true, code: false });
      } else {
        tokens.push({ text: seg.slice(1, -1), bold: false, code: true });
      }
      last = regex.lastIndex;
    }
    if (last < input.length) {
      tokens.push({ text: input.slice(last), bold: false, code: false });
    }
    return tokens;
  };

  interface WrappedMixedLine {
    runs: Array<{ text: string; bold: boolean; code: boolean; width: number }>;
    isBullet: boolean;
  }

  const measureMixedParagraph = (
    ctx: CanvasRenderingContext2D,
    raw: string,
    availW: number,
    fontSize: number
  ): WrappedMixedLine[] => {
    let text = raw.trim();
    const isBullet = /^[-*•]\s+/.test(text);
    if (isBullet) text = text.replace(/^[-*•]\s+/, '');
    const indentOffset = isBullet ? 14 : 0;
    const effectiveW = Math.max(60, availW - indentOffset);

    const tokens = tokenizeInline(text);
    const wordChunks: Array<{ text: string; bold: boolean; code: boolean }> = [];
    for (const tok of tokens) {
      const parts = tok.text.split(/(\s+)/);
      for (const p of parts) {
        if (p) wordChunks.push({ text: p, bold: tok.bold, code: tok.code });
      }
    }

    const lines: WrappedMixedLine[] = [];
    let currRuns: Array<{ text: string; bold: boolean; code: boolean; width: number }> = [];
    let currW = 0;

    for (const chunk of wordChunks) {
      ctx.font = chunk.code
        ? `500 ${fontSize - 0.5}px ${FONT_MONO}`
        : `${chunk.bold ? 700 : 400} ${fontSize}px ${FONT_SANS}`;
      const w = ctx.measureText(chunk.text).width;
      const isSpace = /^\s+$/.test(chunk.text);

      if (currW + w > effectiveW && currRuns.length > 0 && !isSpace) {
        lines.push({ runs: currRuns, isBullet: isBullet && lines.length === 0 });
        currRuns = [];
        currW = 0;
        if (isSpace) continue;
      }
      if (!(currRuns.length === 0 && isSpace)) {
        currRuns.push({ ...chunk, width: w });
        currW += w;
      }
    }
    if (currRuns.length > 0 || lines.length === 0) {
      lines.push({ runs: currRuns, isBullet: isBullet && lines.length === 0 });
    }
    return lines;
  };

  const drawWrappedMixedLine = (
    ctx: CanvasRenderingContext2D,
    line: WrappedMixedLine,
    startX: number,
    y: number,
    fontSize: number,
    baseColor = '#1e293b',
    isFirstBulletParaLine = false
  ) => {
    let x = startX + (line.isBullet || isFirstBulletParaLine ? 14 : 0);
    if (line.isBullet) {
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.arc(startX + 5.5, y + fontSize * 0.52, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textBaseline = 'top';
    for (const r of line.runs) {
      if (r.code) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(x - 1, y + 0.5, r.width + 2, fontSize + 2);
        ctx.font = `500 ${fontSize - 0.5}px ${FONT_MONO}`;
        ctx.fillStyle = '#0f172a';
      } else {
        ctx.font = `${r.bold ? 700 : 400} ${fontSize}px ${FONT_SANS}`;
        ctx.fillStyle = r.bold ? '#0f172a' : baseColor;
      }
      ctx.fillText(r.text, x, y);
      x += r.width;
    }
  };

  const wrapPlainLines = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxW: number,
    font: string
  ): string[] => {
    ctx.font = font;
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(cand).width > maxW && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  // Start Page 1 of Answer Sheet
  let active = createSheetPage();
  const drawRunningHeader = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#64748b';
    ctx.font = `600 8px ${FONT_SANS}`;
    ctx.textBaseline = 'top';
    ctx.fillText(`${plan.documentTitle} · Authentic Answer Sheet`, MARGIN_X, 20);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, 32);
    ctx.lineTo(PT_W - MARGIN_X, 32);
    ctx.stroke();
  };

  const ensureSpace = (neededPt: number) => {
    if (active.y + neededPt > PT_H - MARGIN_BOTTOM) {
      active = createSheetPage();
      drawRunningHeader(active.ctx);
      active.y = MARGIN_TOP;
    }
  };

  // Cover/Banner Header on Answer Sheet Page 1
  {
    const { ctx } = active;
    const bannerH = 74;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(MARGIN_X, active.y, CONTENT_W, bannerH, 8);
    ctx.fill();

    // Accent amber stripe on left
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(MARGIN_X, active.y, 6, bannerH, [8, 0, 0, 8]);
    ctx.fill();

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#facc15';
    ctx.font = `700 8.5px ${FONT_SANS}`;
    ctx.fillText('AUTHENTIC SOLVED ANSWER SHEET', MARGIN_X + 18, active.y + 12);

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 14.5px ${FONT_SANS}`;
    const titleLines = wrapPlainLines(ctx, plan.documentTitle, CONTENT_W - 34, `700 14.5px ${FONT_SANS}`);
    ctx.fillText(titleLines[0] || 'Solved Answer Sheet', MARGIN_X + 18, active.y + 26);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `500 9.2px ${FONT_SANS}`;
    const subMeta = `${plan.subjectOrCourse}  ·  ${sections.length} Question Solution${
      sections.length === 1 ? '' : 's'
    }  ·  Attached after Source Pages 1–${sourcePageCount}`;
    ctx.fillText(subMeta.slice(0, 96), MARGIN_X + 18, active.y + 50);

    active.y += bannerH + 18;
  }

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];

    // Measure question header + first paragraph to avoid orphaned headers at page bottom
    const qTitleFont = `700 11px ${FONT_SANS}`;
    const titleLines = wrapPlainLines(
      active.ctx,
      sec.questionTitle || 'Solution',
      CONTENT_W - 24,
      qTitleFont
    );
    const headerBlockH = 26 + titleLines.length * 15 + 8;
    ensureSpace(headerBlockH + 28);

    // Draw Question Header Card
    {
      const { ctx } = active;
      const boxTop = active.y;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(MARGIN_X, boxTop, CONTENT_W, headerBlockH, 6);
      ctx.fill();
      ctx.stroke();

      // Left gold bar
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.roundRect(MARGIN_X, boxTop, 4, headerBlockH, [6, 0, 0, 6]);
      ctx.fill();

      // Question Number Pill
      const qNum = (sec.questionNumber || `Q${sIdx + 1}`).trim();
      ctx.font = `700 9px ${FONT_SANS}`;
      const pillW = Math.max(34, ctx.measureText(qNum).width + 14);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(MARGIN_X + 12, boxTop + 8, pillW, 16, 4);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.textBaseline = 'top';
      ctx.fillText(qNum, MARGIN_X + 19, boxTop + 11.5);

      if (sec.marksOrType) {
        ctx.fillStyle = '#64748b';
        ctx.font = `600 8.5px ${FONT_SANS}`;
        ctx.fillText(sec.marksOrType, MARGIN_X + 18 + pillW, boxTop + 11.5);
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = qTitleFont;
      let ty = boxTop + 30;
      for (const tl of titleLines) {
        ctx.fillText(tl, MARGIN_X + 12, ty);
        ty += 15;
      }

      active.y = boxTop + headerBlockH + 10;
    }

    // Answer Paragraphs
    const bodyFontSize = 9.8;
    const bodyLineH = 14.2;
    const paragraphs = Array.isArray(sec.answerParagraphs) ? sec.answerParagraphs : [];
    for (const para of paragraphs) {
      if (!para || !para.trim()) continue;
      const lines = measureMixedParagraph(active.ctx, para, CONTENT_W - 8, bodyFontSize);
      for (let li = 0; li < lines.length; li++) {
        ensureSpace(bodyLineH + 4);
        drawWrappedMixedLine(
          active.ctx,
          lines[li],
          MARGIN_X + 4,
          active.y,
          bodyFontSize,
          '#1e293b',
          li > 0 && /^[-*•]\s+/.test(para.trim())
        );
        active.y += bodyLineH;
      }
      active.y += 4;
    }

    // Structured Table (Truth Table / Observation / Comparison)
    const headers = Array.isArray(sec.tableHeaders) ? sec.tableHeaders : [];
    const rows = Array.isArray(sec.tableRows) ? sec.tableRows : [];
    if (headers.length > 0 && rows.length > 0) {
      const colCount = headers.length;
      const colW = CONTENT_W / colCount;
      const cellPadX = 6;
      const cellPadY = 5;
      const tblFont = `400 8.8px ${FONT_SANS}`;
      const tblHeadFont = `700 8.8px ${FONT_SANS}`;

      const headLines = headers.map((h) =>
        wrapPlainLines(active.ctx, h, colW - cellPadX * 2, tblHeadFont)
      );
      const headH = Math.max(...headLines.map((l) => l.length)) * 11.5 + cellPadY * 2;
      ensureSpace(headH + 24);

      const drawTableHeader = (ctx: CanvasRenderingContext2D, topY: number) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, headH);
        ctx.textBaseline = 'top';
        for (let c = 0; c < colCount; c++) {
          ctx.fillStyle = '#f8fafc';
          ctx.font = tblHeadFont;
          headLines[c].forEach((ln, li) => {
            ctx.fillText(ln, MARGIN_X + c * colW + cellPadX, topY + cellPadY + li * 11.5);
          });
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(MARGIN_X + c * colW, topY, colW, headH);
        }
        return topY + headH;
      };

      active.y = drawTableHeader(active.ctx, active.y);

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx] || [];
        const cellLines = Array.from({ length: colCount }, (_, c) =>
          wrapPlainLines(active.ctx, row[c] ?? '', colW - cellPadX * 2, tblFont)
        );
        const rowH = Math.max(18, Math.max(...cellLines.map((l) => l.length)) * 11.5 + cellPadY * 2);

        if (active.y + rowH > PT_H - MARGIN_BOTTOM) {
          ensureSpace(rowH + headH + 10);
          active.y = drawTableHeader(active.ctx, active.y);
        }

        const { ctx } = active;
        ctx.fillStyle = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
        ctx.fillRect(MARGIN_X, active.y, CONTENT_W, rowH);
        ctx.textBaseline = 'top';
        for (let c = 0; c < colCount; c++) {
          ctx.fillStyle = '#0f172a';
          ctx.font = tblFont;
          cellLines[c].forEach((ln, li) => {
            ctx.fillText(ln, MARGIN_X + c * colW + cellPadX, active.y + cellPadY + li * 11.5);
          });
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(MARGIN_X + c * colW, active.y, colW, rowH);
        }
        active.y += rowH;
      }
      active.y += 10;
    }

    // Embedded Crisp SVG Diagram
    const diag = preRenderedDiagrams.get(sIdx);
    if (diag) {
      const capText = sec.diagramCaption || `Fig: Diagram for ${sec.questionNumber}`;
      const diagBoxH = diag.drawH + 34;
      ensureSpace(diagBoxH + 8);
      const { ctx } = active;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(MARGIN_X, active.y, CONTENT_W, diagBoxH, 6);
      ctx.fill();
      ctx.stroke();

      const imgX = MARGIN_X + (CONTENT_W - diag.drawW) / 2;
      ctx.drawImage(diag.canvas, imgX, active.y + 10, diag.drawW, diag.drawH);

      ctx.fillStyle = '#475569';
      ctx.font = `italic 8.5px ${FONT_SANS}`;
      ctx.textBaseline = 'top';
      const cw = ctx.measureText(capText).width;
      ctx.fillText(capText, MARGIN_X + Math.max(10, (CONTENT_W - cw) / 2), active.y + diag.drawH + 16);

      active.y += diagBoxH + 10;
    }

    // Highlighted Key Result / Final Answer Callout
    if (sec.keyTakeaway && sec.keyTakeaway.trim()) {
      const tkFont = `600 9.4px ${FONT_SANS}`;
      const tkLines = wrapPlainLines(
        active.ctx,
        `Final Answer / Key Result: ${sec.keyTakeaway.trim()}`,
        CONTENT_W - 26,
        tkFont
      );
      const tkH = tkLines.length * 13 + 12;
      ensureSpace(tkH + 6);
      const { ctx } = active;
      ctx.fillStyle = '#fefce8';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(MARGIN_X, active.y, CONTENT_W, tkH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(MARGIN_X, active.y, 3.5, tkH);

      ctx.fillStyle = '#713f12';
      ctx.font = tkFont;
      ctx.textBaseline = 'top';
      tkLines.forEach((ln, idx) => {
        ctx.fillText(ln, MARGIN_X + 12, active.y + 6 + idx * 13);
      });
      active.y += tkH + 10;
    }

    active.y += 8;
  }

  // Paint page footers & embed Answer Sheet pages into PDF
  const totalAnswerPages = pageCanvases.length;
  for (let i = 0; i < totalAnswerPages; i++) {
    onStatus?.(`Compiling Answer Sheet page ${i + 1} of ${totalAnswerPages}...`);
    const canvas = pageCanvases[i];
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#64748b';
    ctx.font = `500 8.5px ${FONT_SANS}`;
    ctx.textBaseline = 'top';
    const footerLeft = 'PaperLink AI Solver · 100% Authentic Reference Solution';
    const footerRight = `Answer Page ${i + 1} of ${totalAnswerPages}`;
    ctx.fillText(footerLeft, MARGIN_X, PT_H - 26);
    const rw = ctx.measureText(footerRight).width;
    ctx.fillText(footerRight, PT_W - MARGIN_X - rw, PT_H - 26);

    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const jpgBytes = dataUrlToUint8Array(jpgDataUrl);
    const embedded = await pdfDoc.embedJpg(jpgBytes);
    const newPage = pdfDoc.addPage([PT_W, PT_H]);
    newPage.drawImage(embedded, { x: 0, y: 0, width: PT_W, height: PT_H });
  }

  return totalAnswerPages;
}

/**
 * Main AI Document Solver pipeline:
 * 1. Normalizes PDF / Word / Image input
 * 2. Sends rendered page images + extracted text to /api/solve-document (in batches of 5 pages)
 * 3. Either fills tables, lines, blanks & SVG diagrams directly on the original pages OR attaches Separate Authentic Answer Sheet pages
 */
export async function solveDocumentWithAI(
  file: File,
  options: SolveDocumentOptions = {},
  onStatus?: (status: string) => void
): Promise<SolveDocumentResult> {
  const normalizedPdf = await normalizeInputToPdfFile(file, onStatus);
  const { pages, pageCount } = await extractPagesForVisionSolver(normalizedPdf, onStatus);

  const requestedMode = options.mode || 'auto';
  const BATCH_SIZE = 4;
  const allFills: InPlaceFillItem[] = [];
  const allSections: AnswerSheetQuestionItem[] = [];
  let detectedType: SolvedDocumentPlan['detectedType'] = 'lab-manual-with-blanks';
  let chosenMode: SolvedDocumentPlan['chosenMode'] =
    requestedMode === 'separate-answer-sheet' ? 'separate-answer-sheet' : 'fill-in-place';
  let documentTitle = baseNameClean(file.name);
  let subjectOrCourse = 'Solved Academic Document';
  const notes: string[] = [];

  // Compact plain-text digest from Page 1 (title/theory/IC specs) so later batches keep experiment context
  const documentContext = pages
    .slice(0, 1)
    .map((p) => {
      const plain = (p.extractedText || '')
        .replace(/\[y=\d+\]\s*/g, '')
        .replace(/\[x=\d+\.\.\d+\]/g, '')
        .replace(/["|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700);
      return plain ? `[Page ${p.pageNumber} Intro/Theory]: ${plain}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const callSolverEndpoint = async (
    url: string,
    payload: Record<string, any>
  ): Promise<{ ok: boolean; status: number; data: any; looksHtml: boolean }> => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    try {
      const parsed = txt ? JSON.parse(txt) : {};
      return { ok: r.ok, status: r.status, data: parsed, looksHtml: false };
    } catch {
      return { ok: false, status: r.status, data: null, looksHtml: /^\s*</.test(txt) };
    }
  };

  const runBatch = async (
    batch: SolveDocumentPageInput[],
    batchMode: 'auto' | 'fill-in-place' | 'separate-answer-sheet',
    extraInstruction?: string
  ): Promise<SolvedDocumentPlan> => {
    const requestPayload = {
      fileName: file.name,
      userInstruction: extraInstruction || options.userInstruction,
      requestedMode: batchMode,
      documentContext,
      pages: batch,
    };

    let result = await callSolverEndpoint('/api/solve-document', requestPayload);
    if (result.looksHtml || result.status === 404) {
      result = await callSolverEndpoint('/api/chat', {
        action: 'solve-document',
        ...requestPayload,
      });
    }

    // Only do a single client-side backoff retry for transient 500s (server already retried models/backoffs);
    // do not re-burn daily 429 quota immediately.
    if (!result.looksHtml && !result.ok && result.status === 500) {
      await new Promise((r) => setTimeout(r, 1800));
      const retryRes = await callSolverEndpoint('/api/solve-document', requestPayload);
      if (retryRes.ok || !retryRes.looksHtml) {
        result = retryRes;
      }
    }

    if (result.looksHtml) {
      throw new Error(
        `AI Solver endpoint returned HTML instead of JSON (HTTP ${result.status}). Please redeploy or restart the backend server.`
      );
    }

    const data = result.data || {};
    if (!result.ok || !data?.plan) {
      throw new Error(data?.error || `AI Solver failed (HTTP ${result.status}).`);
    }
    const plan = data.plan as SolvedDocumentPlan;

    // Client-side safety remap so relative batch numbers never paint onto wrong pages
    if (Array.isArray(plan.inPlaceFills) && plan.inPlaceFills.length > 0 && batch.length > 0) {
      const batchPageNums = batch.map((b) => b.pageNumber);
      const batchSet = new Set(batchPageNums);
      const emittedNums = plan.inPlaceFills.map((f) => Math.round(f.pageNumber));
      const allBatchRel =
        batch.length === 1 ||
        (emittedNums.every((n) => n >= 1 && n <= batch.length) &&
          !batchPageNums.every((n, i) => n === i + 1) &&
          emittedNums.some((n) => !batchSet.has(n)));

      plan.inPlaceFills = plan.inPlaceFills.map((fill) => {
        const n = Math.round(fill.pageNumber);
        let mapped = n;
        if (batch.length === 1) {
          mapped = batchPageNums[0];
        } else if (allBatchRel && n >= 1 && n <= batch.length) {
          mapped = batchPageNums[n - 1];
        } else if (!batchSet.has(n)) {
          mapped = batchPageNums.reduce((best, cur) =>
            Math.abs(cur - n) < Math.abs(best - n) ? cur : best
          );
        }
        return { ...fill, pageNumber: mapped };
      });
    }

    return plan;
  };

  const pageBatches: SolveDocumentPageInput[][] = [];
  for (let start = 0; start < pages.length; start += BATCH_SIZE) {
    pageBatches.push(pages.slice(start, start + BATCH_SIZE));
  }

  onStatus?.(
    `Wait patiently — AI is analyzing ${pageCount} page${pageCount === 1 ? '' : 's'} (may take a moment)...`
  );

  // Process multi-page batches sequentially so we use minimal API quota (1 request for <=4 pages)
  const batchPlans: SolvedDocumentPlan[] = [];
  for (let i = 0; i < pageBatches.length; i++) {
    const b = pageBatches[i];
    const startPageNum = b[0].pageNumber;
    const endPageNum = b[b.length - 1].pageNumber;
    onStatus?.(
      startPageNum === endPageNum
        ? `Wait patiently — AI is analyzing page ${startPageNum} of ${pageCount}...`
        : `Wait patiently — AI is solving pages ${startPageNum}–${endPageNum} of ${pageCount}...`
    );
    const batchRes = await runBatch(b, requestedMode);
    batchPlans.push(batchRes);
  }

  for (const plan of batchPlans) {
    if (plan.documentTitle && documentTitle === baseNameClean(file.name)) {
      documentTitle = plan.documentTitle;
    }
    if (plan.subjectOrCourse && subjectOrCourse === 'Solved Academic Document') {
      subjectOrCourse = plan.subjectOrCourse;
    }
    if (plan.summaryNote) notes.push(plan.summaryNote);
    if (Array.isArray(plan.inPlaceFills)) allFills.push(...plan.inPlaceFills);
    if (Array.isArray(plan.answerSheetSections)) allSections.push(...plan.answerSheetSections);
  }

  if (requestedMode === 'fill-in-place') {
    chosenMode = 'fill-in-place';
    detectedType = allSections.length > 0 ? 'mixed-worksheet' : 'lab-manual-with-blanks';
  } else if (requestedMode === 'separate-answer-sheet') {
    chosenMode = 'separate-answer-sheet';
    detectedType = 'question-paper';
  } else if (allFills.length > 0 && allSections.length > 0) {
    detectedType = 'mixed-worksheet';
    chosenMode = 'fill-in-place';
  } else if (allFills.length === 0 && allSections.length > 0) {
    detectedType = 'question-paper';
    chosenMode = 'separate-answer-sheet';
  } else {
    detectedType = 'lab-manual-with-blanks';
    chosenMode = 'fill-in-place';
  }

  // Fallback guarantee: if AI returned zero fills AND zero answer sections (e.g. questions lacked blank lines),
  // automatically solve all questions/tasks into a Separate Authentic Answer Sheet so the user always gets full answers!
  let ranFallbackPass = false;
  if (allFills.length === 0 && allSections.length === 0 && pages.length > 0) {
    ranFallbackPass = true;
    onStatus?.('Generating authentic Answer Sheet sections for detected questions & tasks...');
    for (const b of pageBatches) {
      const fp = await runBatch(
        b,
        'separate-answer-sheet',
        `${options.userInstruction ? options.userInstruction + ' — ' : ''}Even if example truth tables or circuits are shown earlier, extract EVERY Review Question, Exercise, Task, or Verification Question from these pages and provide 100% authentic step-by-step answers, truth tables, and SVG diagrams in answerSheetSections.`
      );
      if (fp.summaryNote) notes.push(fp.summaryNote);
      if (Array.isArray(fp.answerSheetSections)) allSections.push(...fp.answerSheetSections);
    }
    if (allSections.length > 0) {
      chosenMode = 'separate-answer-sheet';
    }
  }

  onStatus?.('Writing solved answers & diagrams into PDF...');
  const rawPdfBuf = new Uint8Array(await normalizedPdf.arrayBuffer()).slice().buffer;
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(new Uint8Array(rawPdfBuf).slice().buffer, {
      ignoreEncryption: false,
    });
  } catch {
    // Source PDF has owner/permission encryption — try clean empty-password decrypt first, else rebuild clean pages via pdf.js
    try {
      const cantoo = await CantooPDFDocument.load(new Uint8Array(rawPdfBuf).slice().buffer, {
        password: '',
      });
      const cleanCopy = await CantooPDFDocument.create();
      const idx = Array.from({ length: cantoo.getPageCount() }, (_, k) => k);
      const copied = await cleanCopy.copyPages(cantoo, idx);
      copied.forEach((p) => cleanCopy.addPage(p));
      const unlockedBytes = await cleanCopy.save({ useObjectStreams: false });
      pdfDoc = await PDFDocument.load(new Uint8Array(unlockedBytes).slice().buffer);
    } catch {
      const pdfjsLib = getPdfJs();
      const srcProxy = await pdfjsLib.getDocument({
        data: new Uint8Array(rawPdfBuf).slice().buffer,
        useSystemFonts: true,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
      }).promise;
      const rebuiltDoc = await PDFDocument.create();
      for (let pn = 1; pn <= srcProxy.numPages; pn++) {
        const pg = await srcProxy.getPage(pn);
        const vp1 = pg.getViewport({ scale: 1 });
        const renderVp = pg.getViewport({ scale: 2.0 });
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(renderVp.width));
        c.height = Math.max(1, Math.round(renderVp.height));
        const cx = c.getContext('2d');
        if (cx) {
          cx.fillStyle = '#ffffff';
          cx.fillRect(0, 0, c.width, c.height);
          await pg.render({ canvasContext: cx, viewport: renderVp }).promise;
          const jpgBytes = dataUrlToUint8Array(c.toDataURL('image/jpeg', 0.9));
          const emb = await rebuiltDoc.embedJpg(jpgBytes);
          const np = rebuiltDoc.addPage([vp1.width, vp1.height]);
          np.drawImage(emb, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        }
      }
      pdfDoc = rebuiltDoc;
    }
  }
  pdfDoc.setProducer('PaperLink AI Solver');
  pdfDoc.setCreator('PaperLink');

  const inkHex = options.inkStyle === 'black' ? '#111827' : '#123b82';
  const pdfPages = pdfDoc.getPages();
  let fillsApplied = 0;
  let diagramsDrawn = 0;

  // Apply all in-place fills onto original pages when available
  if (allFills.length > 0 && (chosenMode === 'fill-in-place' || detectedType === 'mixed-worksheet')) {
    for (let i = 0; i < allFills.length; i++) {
      const fill = allFills[i];
      const pageIdx = Math.min(pdfPages.length - 1, Math.max(0, Math.round(fill.pageNumber) - 1));
      const page = pdfPages[pageIdx];

      const cropBox = page.getCropBox();
      const pageW = cropBox.width;
      const pageH = cropBox.height;
      const offX = cropBox.x;
      const offY = cropBox.y;

      const xmin = Math.max(0, Math.min(995, fill.xmin));
      const xmax = Math.max(xmin + 10, Math.min(1000, fill.xmax));
      const ymin = Math.max(0, Math.min(995, fill.ymin));
      const ymax = Math.max(ymin + 10, Math.min(1000, fill.ymax));

      const boxX = offX + (xmin / 1000) * pageW;
      const boxW = Math.max(14, ((xmax - xmin) / 1000) * pageW);
      const boxTopY = (ymin / 1000) * pageH;
      const boxH = Math.max(12, ((ymax - ymin) / 1000) * pageH);
      const boxBottomY = offY + Math.max(0, pageH - boxTopY - boxH);

      if (fill.fieldKind === 'diagram' && fill.svgMarkup) {
        onStatus?.(`Drawing schematic diagram on page ${pageIdx + 1}...`);
        const diagImg = await rasterizeSvgToCanvasImage(fill.svgMarkup, boxW, boxH, 3);
        if (diagImg) {
          const embedded = await pdfDoc.embedPng(diagImg.pngBytes);
          const drawX = boxX + Math.max(0, (boxW - diagImg.drawW) / 2);
          const drawY = boxBottomY + Math.max(0, (boxH - diagImg.drawH) / 2);
          page.drawImage(embedded, {
            x: drawX,
            y: drawY,
            width: diagImg.drawW,
            height: diagImg.drawH,
          });
          diagramsDrawn++;
          continue;
        }
      }

      if (fill.answerText && fill.answerText.trim()) {
        const pngBytes = renderInPlaceTextToPngBytes(fill, boxW, boxH, inkHex);
        if (pngBytes && pngBytes.byteLength > 0) {
          const embedded = await pdfDoc.embedPng(pngBytes);
          page.drawImage(embedded, {
            x: boxX,
            y: boxBottomY,
            width: boxW,
            height: boxH,
          });
          fillsApplied++;
        }
      } else if (fill.svgMarkup && fill.svgMarkup.trim()) {
        // Fallback: if model returned SVG for a non-diagram fill, rasterize cleanly into that box
        const diagImg = await rasterizeSvgToCanvasImage(fill.svgMarkup, boxW, boxH, 3);
        if (diagImg) {
          const embedded = await pdfDoc.embedPng(diagImg.pngBytes);
          page.drawImage(embedded, {
            x: boxX,
            y: boxBottomY + Math.max(0, (boxH - diagImg.drawH) / 2),
            width: Math.min(boxW, diagImg.drawW),
            height: Math.min(boxH, diagImg.drawH),
          });
          fillsApplied++;
        }
      }
    }
  }

  // Fallback guarantee: only run sequentially if not already attempted
  if (!ranFallbackPass && fillsApplied === 0 && diagramsDrawn === 0 && allSections.length === 0 && pages.length > 0) {
    onStatus?.('Generating authentic Answer Sheet sections for document questions...');
    for (const b of pageBatches) {
      const rp = await runBatch(
        b,
        'separate-answer-sheet',
        `${options.userInstruction ? options.userInstruction + ' — ' : ''}Extract EVERY Review Question, Exercise, Task, or blank exercise from these pages and provide 100% authentic step-by-step answers, truth tables, and SVG diagrams in answerSheetSections.`
      );
      if (rp.summaryNote) notes.push(rp.summaryNote);
      if (Array.isArray(rp.answerSheetSections)) allSections.push(...rp.answerSheetSections);
    }
    if (allSections.length > 0) chosenMode = 'separate-answer-sheet';
  }

  // Append separate authentic Answer Sheet pages only for Question Paper mode, when 0 in-place fills applied, or when genuinely mixed
  let answerPagesAdded = 0;
  const shouldAppendSeparate =
    allSections.length > 0 &&
    (chosenMode === 'separate-answer-sheet' ||
      fillsApplied === 0 ||
      (detectedType === 'mixed-worksheet' && chosenMode !== 'fill-in-place'));

  if (shouldAppendSeparate) {
    const mergedPlan: SolvedDocumentPlan = {
      detectedType,
      chosenMode,
      documentTitle,
      subjectOrCourse,
      summaryNote: notes[0] || '',
      inPlaceFills: allFills,
      answerSheetSections: allSections,
    };
    answerPagesAdded = await appendAnswerSheetPagesToPdf(
      pdfDoc,
      mergedPlan,
      pageCount,
      onStatus
    );
    diagramsDrawn += allSections.filter((s) => Boolean(s.svgMarkup?.trim())).length;
  }

  onStatus?.('Packaging final solved PDF...');
  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  const safeBytes = new Uint8Array(finalBytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });

  const suffix = answerPagesAdded > 0 && fillsApplied === 0 ? 'with_answers' : 'solved';
  const outName = `${baseNameClean(file.name)}_${suffix}.pdf`;

  return {
    blob,
    bytes: safeBytes,
    fileName: outName,
    sourcePageCount: pageCount,
    outputPageCount: pdfDoc.getPageCount(),
    detectedType,
    chosenMode,
    documentTitle,
    fillsApplied,
    diagramsDrawn,
    answerSectionsCount: answerPagesAdded > 0 ? allSections.length : 0,
    summaryNote:
      notes[0] ||
      (answerPagesAdded > 0
        ? `Attached ${answerPagesAdded} authentic answer page(s).`
        : `Filled ${fillsApplied} field(s) directly in place.`),
    previewSections: allSections,
  };
}
