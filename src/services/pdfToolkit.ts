import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import * as mammoth from 'mammoth';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  ImageRun,
  PageBreak,
  AlignmentType,
} from 'docx';

export type PdfToWordMode = 'editable' | 'layout';
export type CompressionLevel = 'lossless' | 'balanced' | 'maximum';
export type SplitMode = 'extract-range' | 'fixed-chunks';

export interface PdfToWordResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
  wordCount: number;
  mode: PdfToWordMode;
}

export interface WordToPdfResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  previewHtml: string;
}

export interface PdfMergeSource {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  pageRange?: string; // e.g. "1-3, 5"
  buffer: ArrayBuffer;
}

export interface PdfMergeResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  totalPages: number;
}

export interface PdfCompressResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  pageCount: number;
  level: CompressionLevel;
  keptOriginalBecauseSmaller: boolean;
}

export interface PdfSplitOutputFile {
  blob: Blob;
  fileName: string;
  pageCount: number;
  label: string;
}

export interface PdfSplitResult {
  files: PdfSplitOutputFile[];
  totalSourcePages: number;
}

export interface ImagesToPdfResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
}

export interface PdfPageThumb {
  originalIndex: number; // 0-based
  pageNumber: number; // 1-based
  thumbnailUrl: string;
  rotationDelta: number; // 0, 90, 180, 270
  deleted: boolean;
}

export interface PdfTransformResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
}

export interface SignaturePlacement {
  pageNumber: number; // 1-based
  xFraction: number; // 0..1 from left
  yFraction: number; // 0..1 from top
  widthFraction: number; // 0.08..0.6
  dataUrl: string; // PNG data url
  signerNote?: string;
}

export interface PdfSignResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
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

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u00B7]/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, ' ');
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'document';
}

/**
 * Parses a human page-range expression like "1-3, 5, 7-8" against maxPages (1-based).
 * Returns 0-based page indices in specified order.
 */
export function parsePageRange(rangeExpr: string | undefined, maxPages: number): number[] {
  const trimmed = (rangeExpr || '').trim();
  if (!trimmed) {
    return Array.from({ length: maxPages }, (_, i) => i);
  }

  const indices: number[] = [];
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > end || end > maxPages) {
        throw new Error(`Invalid page range "${part}". Must be between 1 and ${maxPages}.`);
      }
      for (let p = start; p <= end; p++) {
        indices.push(p - 1);
      }
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1 || num > maxPages) {
        throw new Error(`Invalid page number "${part}". Must be between 1 and ${maxPages}.`);
      }
      indices.push(num - 1);
    }
  }

  if (indices.length === 0) {
    throw new Error('No pages selected.');
  }
  return indices;
}

/**
 * Tool 1: Real PDF -> Word (.docx) converter
 */
export async function convertPdfToWord(
  file: File,
  mode: PdfToWordMode,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfToWordResult> {
  const pdfjsLib = getPdfJs();
  onProgress?.(8, 'Reading PDF structure...');

  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const pageCount: number = pdf.numPages;

  const children: Paragraph[] = [];
  let totalWords = 0;

  if (mode === 'layout') {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      onProgress?.(
        10 + Math.round(((pageNum - 1) / pageCount) * 80),
        `Rendering page ${pageNum} of ${pageCount}...`
      );
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/png')
      );
      const imgBytes = new Uint8Array(await blob.arrayBuffer());

      const targetWidth = 590;
      const targetHeight = Math.round((viewport.height / viewport.width) * targetWidth);

      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: imgBytes,
              transformation: { width: targetWidth, height: targetHeight },
              type: 'png',
            }),
          ],
        })
      );

      if (pageNum < pageCount) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }
  } else {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      onProgress?.(
        10 + Math.round(((pageNum - 1) / pageCount) * 80),
        `Extracting structured text from page ${pageNum} of ${pageCount}...`
      );
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      interface LineBucket {
        y: number;
        maxFont: number;
        items: { x: number; text: string }[];
      }

      const lines: LineBucket[] = [];
      for (const rawItem of textContent.items as any[]) {
        const str: string = rawItem.str || '';
        if (!str.trim()) continue;
        const y = Math.round(rawItem.transform?.[5] ?? 0);
        const x = rawItem.transform?.[4] ?? 0;
        const fontSize = Math.abs(rawItem.transform?.[0] ?? rawItem.height ?? 11);

        const existing = lines.find((l) => Math.abs(l.y - y) <= 3);
        if (existing) {
          existing.items.push({ x, text: str });
          if (fontSize > existing.maxFont) existing.maxFont = fontSize;
        } else {
          lines.push({ y, maxFont: fontSize, items: [{ x, text: str }] });
        }
      }

      lines.sort((a, b) => b.y - a.y);

      const fontSizes = lines.map((l) => l.maxFont).sort((a, b) => a - b);
      const medianFont = fontSizes.length > 0 ? fontSizes[Math.floor(fontSizes.length / 2)] : 11;

      if (lines.length === 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[Page ${pageNum}: No selectable text found. Re-convert using Exact Layout mode if this page is scanned.]`,
                italics: true,
                color: '666666',
              }),
            ],
          })
        );
      } else {
        for (const line of lines) {
          line.items.sort((a, b) => a.x - b.x);
          const lineText = line.items
            .map((i) => i.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (!lineText) continue;

          totalWords += lineText.split(/\s+/).filter(Boolean).length;

          if (line.maxFont >= medianFont * 1.45 && lineText.length < 120) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 220, after: 100 },
                children: [new TextRun({ text: lineText, bold: true })],
              })
            );
          } else if (line.maxFont >= medianFont * 1.2 && lineText.length < 120) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 160, after: 80 },
                children: [new TextRun({ text: lineText, bold: true })],
              })
            );
          } else {
            children.push(
              new Paragraph({
                spacing: { after: 110, line: 276 },
                children: [new TextRun({ text: lineText, size: 22 })],
              })
            );
          }
        }
      }

      if (pageNum < pageCount) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }
  }

  onProgress?.(94, 'Packaging Microsoft Word (.docx) archive...');
  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  onProgress?.(100, 'Conversion complete');

  return {
    blob,
    fileName: `${baseName(file.name)}.docx`,
    pageCount,
    wordCount: totalWords,
    mode,
  };
}

/**
 * Tool 2: Real Word (.docx) -> PDF converter
 */
export async function convertWordToPdf(
  file: File,
  paperSize: 'a4' | 'letter' = 'a4',
  onProgress?: (percent: number, status: string) => void
): Promise<WordToPdfResult> {
  onProgress?.(12, 'Parsing Word document...');
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  onProgress?.(40, 'Extracting headings, paragraphs, and lists...');
  const parser = new DOMParser();
  const parsedDom = parser.parseFromString(html || '<p></p>', 'text/html');

  const dims = paperSize === 'letter' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const marginX = 54;
  const marginTop = 58;
  const marginBottom = 56;
  const maxWidth = dims.width - marginX * 2;

  let page = pdfDoc.addPage([dims.width, dims.height]);
  let cursorY = dims.height - marginTop;

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < marginBottom) {
      page = pdfDoc.addPage([dims.width, dims.height]);
      cursorY = dims.height - marginTop;
    }
  };

  const drawWrappedBlock = (
    rawText: string,
    options: {
      fontSize: number;
      font: typeof fontRegular;
      color: ReturnType<typeof rgb>;
      lineHeight?: number;
      indentX?: number;
      spaceAfter?: number;
      spaceBefore?: number;
    }
  ) => {
    const clean = sanitizeWinAnsi(rawText).replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const indent = options.indentX || 0;
    const availW = maxWidth - indent;
    const lh = options.lineHeight || options.fontSize * 1.45;
    cursorY -= options.spaceBefore || 0;

    const words = clean.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (options.font.widthOfTextAtSize(candidate, options.fontSize) > availW && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      ensureSpace(lh);
      page.drawText(l, {
        x: marginX + indent,
        y: cursorY,
        size: options.fontSize,
        font: options.font,
        color: options.color,
      });
      cursorY -= lh;
    }

    cursorY -= options.spaceAfter ?? 6;
  };

  const walkBlocks = (root: Element) => {
    for (const node of Array.from(root.children)) {
      const tag = node.tagName.toLowerCase();
      const text = node.textContent || '';

      if (tag === 'h1') {
        drawWrappedBlock(text, {
          fontSize: 20,
          font: fontBold,
          color: rgb(0.06, 0.09, 0.16),
          spaceBefore: 10,
          spaceAfter: 8,
        });
      } else if (tag === 'h2') {
        drawWrappedBlock(text, {
          fontSize: 15.5,
          font: fontBold,
          color: rgb(0.1, 0.13, 0.2),
          spaceBefore: 8,
          spaceAfter: 6,
        });
      } else if (tag === 'h3' || tag === 'h4') {
        drawWrappedBlock(text, {
          fontSize: 13,
          font: fontBold,
          color: rgb(0.15, 0.18, 0.25),
          spaceBefore: 6,
          spaceAfter: 4,
        });
      } else if (tag === 'ul' || tag === 'ol') {
        const listItems = Array.from(node.children).filter((c) => c.tagName.toLowerCase() === 'li');
        listItems.forEach((li, idx) => {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '* ';
          drawWrappedBlock(`${prefix}${li.textContent || ''}`, {
            fontSize: 11,
            font: fontRegular,
            color: rgb(0.18, 0.2, 0.25),
            indentX: 16,
            spaceAfter: 4,
          });
        });
        cursorY -= 4;
      } else if (tag === 'blockquote') {
        drawWrappedBlock(text, {
          fontSize: 11,
          font: fontItalic,
          color: rgb(0.32, 0.35, 0.42),
          indentX: 20,
          spaceAfter: 8,
        });
      } else if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr'));
        rows.forEach((tr, rIdx) => {
          const cells = Array.from(tr.querySelectorAll('th, td'))
            .map((td) => (td.textContent || '').trim())
            .filter(Boolean);
          if (cells.length > 0) {
            drawWrappedBlock(cells.join('   |   '), {
              fontSize: 10,
              font: rIdx === 0 ? fontBold : fontRegular,
              color: rgb(0.16, 0.18, 0.22),
              indentX: 6,
              spaceAfter: 4,
            });
          }
        });
        cursorY -= 6;
      } else if (tag === 'p') {
        const isOnlyStrong =
          node.children.length === 1 &&
          node.children[0].tagName.toLowerCase() === 'strong' &&
          (node.textContent || '').trim() === (node.children[0].textContent || '').trim();
        drawWrappedBlock(text, {
          fontSize: 11,
          font: isOnlyStrong ? fontBold : fontRegular,
          color: rgb(0.15, 0.17, 0.22),
          spaceAfter: 7,
        });
      } else if (node.children.length > 0) {
        walkBlocks(node);
      } else if (text.trim()) {
        drawWrappedBlock(text, {
          fontSize: 11,
          font: fontRegular,
          color: rgb(0.15, 0.17, 0.22),
          spaceAfter: 6,
        });
      }
    }
  };

  onProgress?.(68, 'Composing PDF pages...');
  walkBlocks(parsedDom.body);

  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: dims.width - marginX - 55,
      y: 26,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.45, 0.48, 0.54),
    });
  });

  onProgress?.(92, 'Finalizing PDF binary...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });

  onProgress?.(100, 'Word converted to PDF');
  return {
    blob,
    bytes,
    fileName: `${baseName(file.name)}.pdf`,
    pageCount: pages.length,
    previewHtml: html,
  };
}

/**
 * Helper: Convert plain text (.txt / .md / .rtf) to a paginated PDF so Cover Studio
 * appends full text pages cleanly instead of exporting only Page 1.
 */
export async function convertTextToPdf(
  rawText: string,
  fileName: string,
  paperSize: 'a4' | 'letter' = 'a4'
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const dims = paperSize === 'letter' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const marginX = 52;
  const marginTop = 54;
  const marginBottom = 52;
  const maxWidth = dims.width - marginX * 2;
  const fontSize = 11;
  const lh = 16;

  let page = pdfDoc.addPage([dims.width, dims.height]);
  let cursorY = dims.height - marginTop;

  const linesRaw = rawText.split(/\r?\n/);
  for (const rawLine of linesRaw) {
    const clean = sanitizeWinAnsi(rawLine).trim();
    if (!clean) {
      cursorY -= lh * 0.6;
      if (cursorY < marginBottom) {
        page = pdfDoc.addPage([dims.width, dims.height]);
        cursorY = dims.height - marginTop;
      }
      continue;
    }

    const words = clean.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
        if (cursorY < marginBottom + lh) {
          page = pdfDoc.addPage([dims.width, dims.height]);
          cursorY = dims.height - marginTop;
        }
        page.drawText(current, { x: marginX, y: cursorY, size: fontSize, font, color: rgb(0.14, 0.16, 0.2) });
        cursorY -= lh;
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      if (cursorY < marginBottom + lh) {
        page = pdfDoc.addPage([dims.width, dims.height]);
        cursorY = dims.height - marginTop;
      }
      page.drawText(current, { x: marginX, y: cursorY, size: fontSize, font, color: rgb(0.14, 0.16, 0.2) });
      cursorY -= lh + 3;
    }
  }

  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`${baseName(fileName)} · Page ${idx + 1} of ${pages.length}`, {
      x: marginX,
      y: 26,
      size: 8.5,
      font,
      color: rgb(0.45, 0.48, 0.54),
    });
  });

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return { bytes, pageCount: pages.length };
}

/**
 * Helper to inspect a PDF before adding to Merge queue
 */
export async function inspectPdfSource(file: File): Promise<PdfMergeSource> {
  const buffer = await file.arrayBuffer();
  const safeBuffer = new Uint8Array(buffer).slice().buffer;
  const pdf = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });
  return {
    id: `merge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    file,
    name: file.name,
    size: file.size,
    pageCount: pdf.getPageCount(),
    pageRange: '',
    buffer: safeBuffer,
  };
}

/**
 * Tool 3: Real PDF Merger (custom order + optional page ranges)
 */
export async function mergeMultiplePdfs(
  sources: PdfMergeSource[],
  outputName = 'merged_document',
  onProgress?: (percent: number, status: string) => void
): Promise<PdfMergeResult> {
  if (sources.length < 2) {
    throw new Error('Please add at least 2 PDF files to merge.');
  }

  const merged = await PDFDocument.create();
  merged.setProducer('PaperLink');
  merged.setCreator('PaperLink');
  let totalPages = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    onProgress?.(
      Math.round((i / sources.length) * 85),
      `Merging ${src.name} (${i + 1}/${sources.length})...`
    );

    const cloned = new Uint8Array(src.buffer).slice().buffer;
    const pdf = await PDFDocument.load(cloned, { ignoreEncryption: true });
    const indices = parsePageRange(src.pageRange, pdf.getPageCount());
    const copied = await merged.copyPages(pdf, indices);
    copied.forEach((p) => merged.addPage(p));
    totalPages += copied.length;
  }

  onProgress?.(92, 'Saving combined PDF...');
  const bytes = await merged.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });

  onProgress?.(100, 'PDF merge complete');
  return {
    blob,
    bytes,
    fileName: `${baseName(outputName)}.pdf`,
    totalPages,
  };
}

/**
 * Estimate approximate compressed PDF size for live compression slider feedback.
 */
export function estimateCompressedPdfSize(
  originalBytes: number,
  qualityPercent: number,
  level: CompressionLevel
): { estimatedBytes: number; reductionPct: number } {
  if (originalBytes <= 0) return { estimatedBytes: 0, reductionPct: 0 };
  const clampedQ = Math.max(15, Math.min(100, qualityPercent));
  if (clampedQ >= 96 || (level === 'lossless' && clampedQ >= 95)) {
    const est = Math.round(originalBytes * 0.88);
    return { estimatedBytes: est, reductionPct: 12 };
  }
  // Smooth calibrated curve across 15%..95%: ~18% of original at 15% -> ~72% at 95%
  const ratio = 0.16 + Math.pow((clampedQ - 15) / 80, 1.15) * 0.56;
  const est = Math.max(4096, Math.min(originalBytes, Math.round(originalBytes * ratio)));
  const reductionPct = Math.max(5, Math.round(((originalBytes - est) / originalBytes) * 100));
  return { estimatedBytes: est, reductionPct };
}

/**
 * Tool 4: Real PDF Compressor (Supports both discrete profiles and continuous slider %)
 */
export async function compressPdfFile(
  file: File,
  level: CompressionLevel,
  onProgress?: (percent: number, status: string) => void,
  qualityPercent?: number
): Promise<PdfCompressResult> {
  const originalBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const originalSize = file.size;

  const isLosslessRun =
    typeof qualityPercent === 'number' ? qualityPercent >= 96 : level === 'lossless';

  if (isLosslessRun) {
    onProgress?.(35, 'Optimizing PDF object streams lossless...');
    const src = await PDFDocument.load(originalBuffer, { ignoreEncryption: true });
    src.setTitle('');
    src.setSubject('');
    src.setKeywords([]);
    src.setProducer('PaperLink');
    src.setCreator('PaperLink');

    const compressedDoc = await PDFDocument.create();
    const indices = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const copied = await compressedDoc.copyPages(src, indices);
    copied.forEach((p) => compressedDoc.addPage(p));

    onProgress?.(85, 'Compressing cross-reference tables...');
    const bytes = await compressedDoc.save({ useObjectStreams: true, addDefaultPage: false });
    const keptOriginalBecauseSmaller = bytes.byteLength >= originalSize;
    const finalBytes = keptOriginalBecauseSmaller ? new Uint8Array(originalBuffer) : bytes;

    onProgress?.(100, 'Optimization complete');
    return {
      blob: new Blob([new Uint8Array(finalBytes).slice().buffer], { type: 'application/pdf' }),
      bytes: finalBytes,
      fileName: `${baseName(file.name)}_optimized.pdf`,
      originalSize,
      compressedSize: finalBytes.byteLength,
      pageCount: src.getPageCount(),
      level,
      keptOriginalBecauseSmaller,
    };
  }

  const pdfjsLib = getPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: originalBuffer, useSystemFonts: true }).promise;
  const pageCount: number = pdf.numPages;

  const sliderQ = typeof qualityPercent === 'number' ? Math.max(15, Math.min(95, qualityPercent)) : null;
  const targetScale =
    sliderQ !== null
      ? Number((0.75 + ((sliderQ - 15) / 80) * 1.05).toFixed(2))
      : level === 'balanced'
      ? 1.35
      : 1.0;
  const jpegQuality =
    sliderQ !== null
      ? Number(Math.max(0.24, Math.min(0.92, sliderQ / 100)).toFixed(2))
      : level === 'balanced'
      ? 0.72
      : 0.48;

  const outPdf = await PDFDocument.create();
  outPdf.setProducer('PaperLink');
  outPdf.setCreator('PaperLink');

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    onProgress?.(
      Math.round(((pageNum - 1) / pageCount) * 85),
      `Compressing page ${pageNum} of ${pageCount}...`
    );

    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale: targetScale });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const jpgBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('JPEG compression failed'))),
        'image/jpeg',
        jpegQuality
      )
    );
    const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
    const embedded = await outPdf.embedJpg(jpgBytes);

    const outPage = outPdf.addPage([baseViewport.width, baseViewport.height]);
    outPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });
  }

  onProgress?.(92, 'Rebuilding compressed PDF...');
  const bytes = await outPdf.save({ useObjectStreams: true });
  const keptOriginalBecauseSmaller = bytes.byteLength >= originalSize;
  const finalBytes = keptOriginalBecauseSmaller ? new Uint8Array(originalBuffer) : bytes;

  onProgress?.(100, 'Compression complete');
  return {
    blob: new Blob([new Uint8Array(finalBytes).slice().buffer], { type: 'application/pdf' }),
    bytes: finalBytes,
    fileName: `${baseName(file.name)}_compressed.pdf`,
    originalSize,
    compressedSize: finalBytes.byteLength,
    pageCount,
    level,
    keptOriginalBecauseSmaller,
  };
}

/**
 * Tool 5: PDF Split & Extract Pages
 */
export async function splitPdfFile(
  file: File,
  mode: SplitMode,
  rangeOrInterval: string,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfSplitResult> {
  onProgress?.(10, 'Loading source PDF...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = srcPdf.getPageCount();
  const rootName = baseName(file.name);
  const files: PdfSplitOutputFile[] = [];

  if (mode === 'extract-range') {
    const indices = parsePageRange(rangeOrInterval || `1-${totalPages}`, totalPages);
    onProgress?.(50, `Extracting ${indices.length} page(s)...`);
    const out = await PDFDocument.create();
    out.setProducer('PaperLink');
    const copied = await out.copyPages(srcPdf, indices);
    copied.forEach((p) => out.addPage(p));
    const bytes = await out.save({ useObjectStreams: true });
    files.push({
      blob: new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' }),
      fileName: `${rootName}_extracted.pdf`,
      pageCount: copied.length,
      label: `Extracted (${rangeOrInterval || `1-${totalPages}`})`,
    });
  } else {
    const chunkSize = Math.max(1, parseInt(rangeOrInterval, 10) || 1);
    const totalChunks = Math.ceil(totalPages / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      const startIdx = c * chunkSize;
      const endIdx = Math.min(totalPages, startIdx + chunkSize);
      onProgress?.(
        15 + Math.round(((c + 1) / totalChunks) * 80),
        `Creating part ${c + 1} of ${totalChunks} (pages ${startIdx + 1}-${endIdx})...`
      );
      const out = await PDFDocument.create();
      out.setProducer('PaperLink');
      const indices = Array.from({ length: endIdx - startIdx }, (_, k) => startIdx + k);
      const copied = await out.copyPages(srcPdf, indices);
      copied.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      files.push({
        blob: new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' }),
        fileName: `${rootName}_part${c + 1}_p${startIdx + 1}-${endIdx}.pdf`,
        pageCount: copied.length,
        label: `Part ${c + 1} · Pages ${startIdx + 1}-${endIdx}`,
      });
    }
  }

  onProgress?.(100, 'Split complete');
  return { files, totalSourcePages: totalPages };
}

/**
 * Tool 6: Image to PDF (JPG / PNG / WebP Scan Pack)
 */
export async function convertImagesToPdf(
  files: File[],
  paperSize: 'a4' | 'letter' | 'fit' = 'a4',
  onProgress?: (percent: number, status: string) => void
): Promise<ImagesToPdfResult> {
  if (files.length === 0) throw new Error('Select at least one image (JPG, PNG, WebP).');
  const outPdf = await PDFDocument.create();
  outPdf.setProducer('PaperLink');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(Math.round((i / files.length) * 88), `Embedding image ${i + 1} of ${files.length}...`);

    // Normalize any browser-supported image (JPG/PNG/WebP) onto clean JPEG/PNG bytes
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

    const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not decode image ${file.name}`));
      img.src = dataUrl;
    });

    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(imgEl, 0, 0, w, h);

    const jpgBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/jpeg', 0.9)
    );
    const embedded = await outPdf.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));

    let pageW = w;
    let pageH = h;
    let drawX = 0;
    let drawY = 0;
    let drawW = w;
    let drawH = h;

    if (paperSize !== 'fit') {
      const target = paperSize === 'letter' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
      pageW = target.width;
      pageH = target.height;
      const margin = 24;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const scale = Math.min(availW / w, availH / h);
      drawW = w * scale;
      drawH = h * scale;
      drawX = (pageW - drawW) / 2;
      drawY = (pageH - drawH) / 2;
    }

    const page = outPdf.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  onProgress?.(94, 'Packaging PDF...');
  const bytes = await outPdf.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Image packet ready');

  return {
    blob,
    bytes,
    fileName: `${baseName(files[0].name)}_scans.pdf`,
    pageCount: outPdf.getPageCount(),
  };
}

/**
 * Tool 7: Inspect Page Thumbnails + Rotate / Delete / Reorder PDF Pages
 */
export async function inspectPdfThumbnails(
  file: File,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfPageThumb[]> {
  const pdfjsLib = getPdfJs();
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const total: number = pdf.numPages;
  const thumbs: PdfPageThumb[] = [];

  for (let p = 1; p <= total; p++) {
    onProgress?.(Math.round((p / total) * 100), `Rendering thumbnail ${p} of ${total}...`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 0.45 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
    thumbs.push({
      originalIndex: p - 1,
      pageNumber: p,
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8),
      rotationDelta: 0,
      deleted: false,
    });
  }

  return thumbs;
}

export async function transformPdfPages(
  file: File,
  pagesOrder: PdfPageThumb[],
  onProgress?: (percent: number, status: string) => void
): Promise<PdfTransformResult> {
  const kept = pagesOrder.filter((p) => !p.deleted);
  if (kept.length === 0) {
    throw new Error('At least 1 page must remain in the document.');
  }

  onProgress?.(25, 'Applying page order and rotations...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const outPdf = await PDFDocument.create();
  outPdf.setProducer('PaperLink');

  const indices = kept.map((k) => k.originalIndex);
  const copied = await outPdf.copyPages(srcPdf, indices);

  copied.forEach((page, i) => {
    const delta = ((kept[i].rotationDelta % 360) + 360) % 360;
    if (delta !== 0) {
      const currentAngle = page.getRotation().angle;
      page.setRotation(degrees((currentAngle + delta) % 360));
    }
    outPdf.addPage(page);
  });

  onProgress?.(85, 'Saving transformed PDF...');
  const bytes = await outPdf.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Updated PDF ready');

  return {
    blob,
    bytes,
    fileName: `${baseName(file.name)}_organized.pdf`,
    pageCount: outPdf.getPageCount(),
  };
}

/**
 * Tool 8: Sign & Stamp PDF
 */
export async function signAndStampPdf(
  file: File,
  placement: SignaturePlacement,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfSignResult> {
  onProgress?.(20, 'Loading target PDF...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  pdfDoc.setProducer('PaperLink');

  const totalPages = pdfDoc.getPageCount();
  const pageIdx = Math.min(totalPages - 1, Math.max(0, placement.pageNumber - 1));
  const targetPage = pdfDoc.getPage(pageIdx);
  const { width, height } = targetPage.getSize();

  onProgress?.(55, 'Embedding signature graphic...');
  const sigBytes = await fetch(placement.dataUrl).then((r) => r.arrayBuffer());
  const isJpg = placement.dataUrl.startsWith('data:image/jpeg') || placement.dataUrl.startsWith('data:image/jpg');
  const embedded = isJpg
    ? await pdfDoc.embedJpg(new Uint8Array(sigBytes))
    : await pdfDoc.embedPng(new Uint8Array(sigBytes));

  const drawW = width * Math.min(0.65, Math.max(0.1, placement.widthFraction));
  const aspect = embedded.height / Math.max(1, embedded.width);
  const drawH = drawW * aspect;

  // Convert normalized top-left coordinates into PDF bottom-left coordinates
  const clampedX = Math.min(width - drawW - 12, Math.max(12, placement.xFraction * width));
  const topY = placement.yFraction * height;
  const drawY = Math.min(height - drawH - 12, Math.max(18, height - topY - drawH));

  targetPage.drawImage(embedded, {
    x: clampedX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  if (placement.signerNote?.trim()) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    targetPage.drawText(sanitizeWinAnsi(placement.signerNote.trim()), {
      x: clampedX,
      y: Math.max(8, drawY - 12),
      size: 8.5,
      font,
      color: rgb(0.28, 0.32, 0.38),
    });
  }

  onProgress?.(90, 'Finalizing signed PDF...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Signed PDF ready');

  return {
    blob,
    bytes,
    fileName: `${baseName(file.name)}_signed.pdf`,
    pageCount: totalPages,
  };
}

// ==========================================
// Tool 9: Interactive Visual PDF Editor
// ==========================================

export type PdfEditorFont = 'helvetica' | 'times' | 'courier';
export type PdfShapeKind = 'redact' | 'highlight' | 'outline';

export interface PdfEditBase {
  id: string;
  pageNumber: number; // 1-based
  xFraction: number; // 0..1
  yFraction: number; // 0..1
  widthFraction: number; // 0.04..0.96
  heightFraction: number; // 0.03..0.96
}

export interface PdfTextEditElement extends PdfEditBase {
  kind: 'text';
  text: string;
  fontSize: number; // PDF points (e.g. 16)
  fontFamily: PdfEditorFont;
  bold: boolean;
  italic: boolean;
  color: string; // hex
  backgroundColor: string; // 'transparent' or hex
  align: 'left' | 'center' | 'right';
}

export interface PdfImageEditElement extends PdfEditBase {
  kind: 'image';
  dataUrl: string; // PNG or JPEG data URL
  opacity: number; // 0.1..1
  label: string;
}

export interface PdfShapeEditElement extends PdfEditBase {
  kind: 'shape';
  shapeKind: PdfShapeKind;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
}

export interface PdfStampEditElement extends PdfEditBase {
  kind: 'stamp';
  text: string;
  color: string;
}

export type PdfEditElement =
  | PdfTextEditElement
  | PdfImageEditElement
  | PdfShapeEditElement
  | PdfStampEditElement;

export interface PdfEditResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  editCount: number;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const num = parseInt(full, 16);
  if (isNaN(num)) return [0.06, 0.09, 0.16];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function hasNonWinAnsiChars(text: string): boolean {
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u00B7]/g, '*')
    .replace(/\u00A0/g, ' ');
  return /[^\x09\x0A\x0D\x20-\xFF]/.test(normalized);
}

function isRtlScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF]/.test(text);
}

function renderTextBoxToPngBytes(
  el: PdfTextEditElement,
  boxWidthPt: number,
  boxHeightPt: number
): Uint8Array {
  const dpiScale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(24, Math.round(boxWidthPt * dpiScale));
  canvas.height = Math.max(24, Math.round(boxHeightPt * dpiScale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  ctx.scale(dpiScale, dpiScale);

  if (el.backgroundColor && el.backgroundColor !== 'transparent') {
    ctx.fillStyle = el.backgroundColor;
    ctx.fillRect(0, 0, boxWidthPt, boxHeightPt);
  }

  const fontName =
    el.fontFamily === 'times'
      ? 'Georgia, "Times New Roman", serif'
      : el.fontFamily === 'courier'
      ? '"Courier New", monospace'
      : '"DM Sans", "Plus Jakarta Sans", Arial, sans-serif';

  ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSize}px ${fontName}`;
  ctx.fillStyle = el.color || '#09090b';
  ctx.textBaseline = 'top';
  if (isRtlScript(el.text)) {
    ctx.direction = 'rtl';
  }

  const pad = 4;
  const maxW = Math.max(10, boxWidthPt - pad * 2);
  const lineHeight = el.fontSize * 1.25;
  const rawParagraphs = el.text.split(/\r?\n/);
  const wrapped: string[] = [];

  for (const para of rawParagraphs) {
    if (!para) {
      wrapped.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (ctx.measureText(candidate).width > maxW && line) {
        wrapped.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) wrapped.push(line);
  }

  let y = pad;
  for (const line of wrapped) {
    if (y + el.fontSize > boxHeightPt) break;
    const measuredW = ctx.measureText(line).width;
    let x = pad;
    if (el.align === 'center') {
      x = Math.max(pad, (boxWidthPt - measuredW) / 2);
    } else if (el.align === 'right' || isRtlScript(line)) {
      x = Math.max(pad, boxWidthPt - pad - measuredW);
    }
    ctx.fillText(line, x, y);
    y += lineHeight;
  }

  const dataUrl = canvas.toDataURL('image/png');
  const binStr = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Tool 9: Apply resizeable text boxes, pictures, shapes/redactions, and stamps to a PDF.
 */
export async function applyPdfEdits(
  file: File,
  elements: PdfEditElement[],
  onProgress?: (percent: number, status: string) => void
): Promise<PdfEditResult> {
  if (elements.length === 0) {
    throw new Error('Add at least one text block, picture, shape, or stamp before exporting.');
  }

  onProgress?.(12, 'Loading PDF document...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  const fontCache: Record<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {};
  const getStdFont = async (family: PdfEditorFont, bold: boolean, italic: boolean) => {
    const key = `${family}-${bold ? 'b' : 'r'}-${italic ? 'i' : 'n'}`;
    if (fontCache[key]) return fontCache[key];

    let std = StandardFonts.Helvetica;
    if (family === 'helvetica') {
      std =
        bold && italic
          ? StandardFonts.HelveticaBoldOblique
          : bold
          ? StandardFonts.HelveticaBold
          : italic
          ? StandardFonts.HelveticaOblique
          : StandardFonts.Helvetica;
    } else if (family === 'times') {
      std =
        bold && italic
          ? StandardFonts.TimesRomanBoldItalic
          : bold
          ? StandardFonts.TimesRomanBold
          : italic
          ? StandardFonts.TimesRomanItalic
          : StandardFonts.TimesRoman;
    } else {
      std =
        bold && italic
          ? StandardFonts.CourierBoldOblique
          : bold
          ? StandardFonts.CourierBold
          : italic
          ? StandardFonts.CourierOblique
          : StandardFonts.Courier;
    }
    fontCache[key] = await pdfDoc.embedFont(std);
    return fontCache[key];
  };

  const pages = pdfDoc.getPages();
  for (let idx = 0; idx < elements.length; idx++) {
    const el = elements[idx];
    onProgress?.(
      18 + Math.round(((idx + 1) / elements.length) * 68),
      `Applying edit ${idx + 1} of ${elements.length}...`
    );

    const pageIdx = Math.min(pages.length - 1, Math.max(0, el.pageNumber - 1));
    const page = pages[pageIdx];
    const { width: pageW, height: pageH } = page.getSize();

    const boxW = Math.max(16, el.widthFraction * pageW);
    const boxH = Math.max(14, el.heightFraction * pageH);
    const pdfX = Math.max(0, Math.min(pageW - boxW, el.xFraction * pageW));
    const pdfTopY = Math.max(0, el.yFraction * pageH);
    const pdfBottomY = Math.max(0, pageH - pdfTopY - boxH);

    if (el.kind === 'shape') {
      const [fr, fg, fb] = hexToRgbTuple(el.fillColor);
      const [sr, sg, sb] = hexToRgbTuple(el.strokeColor);
      if (el.shapeKind === 'outline') {
        page.drawRectangle({
          x: pdfX,
          y: pdfBottomY,
          width: boxW,
          height: boxH,
          borderColor: rgb(sr, sg, sb),
          borderWidth: Math.max(1, el.strokeWidth || 2),
          borderOpacity: el.opacity,
        });
      } else {
        page.drawRectangle({
          x: pdfX,
          y: pdfBottomY,
          width: boxW,
          height: boxH,
          color: rgb(fr, fg, fb),
          opacity: el.opacity,
        });
      }
    } else if (el.kind === 'image') {
      const imgBytes = await fetch(el.dataUrl).then((r) => r.arrayBuffer());
      const isJpg = el.dataUrl.startsWith('data:image/jpeg') || el.dataUrl.startsWith('data:image/jpg');
      const embedded = isJpg
        ? await pdfDoc.embedJpg(new Uint8Array(imgBytes))
        : await pdfDoc.embedPng(new Uint8Array(imgBytes));
      page.drawImage(embedded, {
        x: pdfX,
        y: pdfBottomY,
        width: boxW,
        height: boxH,
        opacity: Math.min(1, Math.max(0.1, el.opacity)),
      });
    } else if (el.kind === 'stamp') {
      const [r, g, b] = hexToRgbTuple(el.color || '#dc2626');
      const borderW = Math.max(2, Math.min(4, boxH * 0.08));
      page.drawRectangle({
        x: pdfX,
        y: pdfBottomY,
        width: boxW,
        height: boxH,
        borderColor: rgb(r, g, b),
        borderWidth: borderW,
        color: rgb(1, 1, 1),
        opacity: 0.9,
      });
      const stampFont = await getStdFont('helvetica', true, false);
      const label = sanitizeWinAnsi(el.text || 'APPROVED').toUpperCase();
      let stampSize = Math.max(10, Math.min(boxH * 0.52, 28));
      while (stampSize > 8 && stampFont.widthOfTextAtSize(label, stampSize) > boxW - 12) {
        stampSize -= 1;
      }
      const tw = stampFont.widthOfTextAtSize(label, stampSize);
      page.drawText(label, {
        x: pdfX + Math.max(4, (boxW - tw) / 2),
        y: pdfBottomY + Math.max(4, (boxH - stampSize * 0.72) / 2),
        size: stampSize,
        font: stampFont,
        color: rgb(r, g, b),
      });
    } else if (el.kind === 'text') {
      if (!el.text.trim()) continue;
      if (hasNonWinAnsiChars(el.text)) {
        const pngBytes = renderTextBoxToPngBytes(el, boxW, boxH);
        if (pngBytes.byteLength > 0) {
          const embedded = await pdfDoc.embedPng(pngBytes);
          page.drawImage(embedded, {
            x: pdfX,
            y: pdfBottomY,
            width: boxW,
            height: boxH,
          });
        }
      } else {
        if (el.backgroundColor && el.backgroundColor !== 'transparent') {
          const [br, bg, bb] = hexToRgbTuple(el.backgroundColor);
          page.drawRectangle({
            x: pdfX,
            y: pdfBottomY,
            width: boxW,
            height: boxH,
            color: rgb(br, bg, bb),
          });
        }
        const font = await getStdFont(el.fontFamily, el.bold, el.italic);
        const [tr, tg, tb] = hexToRgbTuple(el.color || '#09090b');
        const pad = 4;
        const maxW = Math.max(10, boxW - pad * 2);
        const lineHeight = el.fontSize * 1.25;
        const paragraphs = sanitizeWinAnsi(el.text).split(/\r?\n/);
        const lines: string[] = [];

        for (const para of paragraphs) {
          if (!para.trim()) {
            lines.push('');
            continue;
          }
          const words = para.split(/\s+/);
          let current = '';
          for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (font.widthOfTextAtSize(candidate, el.fontSize) > maxW && current) {
              lines.push(current);
              current = word;
            } else {
              current = candidate;
            }
          }
          if (current) lines.push(current);
        }

        let cursorY = pageH - pdfTopY - pad - el.fontSize * 0.85;
        for (const line of lines) {
          if (cursorY < pdfBottomY + 2) break;
          const lineW = font.widthOfTextAtSize(line, el.fontSize);
          let textX = pdfX + pad;
          if (el.align === 'center') {
            textX = pdfX + Math.max(pad, (boxW - lineW) / 2);
          } else if (el.align === 'right') {
            textX = pdfX + Math.max(pad, boxW - pad - lineW);
          }
          page.drawText(line, {
            x: textX,
            y: cursorY,
            size: el.fontSize,
            font,
            color: rgb(tr, tg, tb),
          });
          cursorY -= lineHeight;
        }
      }
    }
  }

  onProgress?.(92, 'Saving edited PDF...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Edited PDF ready');

  return {
    blob,
    bytes: safeBytes,
    fileName: `${baseName(file.name)}_edited.pdf`,
    pageCount: pages.length,
    editCount: elements.length,
  };
}

