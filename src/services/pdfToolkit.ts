import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
  StandardFonts,
  rgb,
  degrees,
} from 'pdf-lib';
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

function cloneArrayBuffer(buf: ArrayBuffer): ArrayBuffer {
  return new Uint8Array(buf).slice().buffer;
}

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
  const originalBytesBackup = new Uint8Array(originalBuffer).slice();
  const originalSize = file.size;

  const isLosslessRun =
    typeof qualityPercent === 'number' ? qualityPercent >= 96 : level === 'lossless';

  if (isLosslessRun) {
    onProgress?.(35, 'Optimizing PDF object streams lossless...');
    const src = await PDFDocument.load(cloneArrayBuffer(originalBuffer), { ignoreEncryption: true });
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
    const finalBytes = keptOriginalBecauseSmaller ? originalBytesBackup : new Uint8Array(bytes).slice();

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
  const pdf = await pdfjsLib.getDocument({
    data: cloneArrayBuffer(originalBuffer),
    useSystemFonts: true,
  }).promise;
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
  const finalBytes = keptOriginalBecauseSmaller ? originalBytesBackup : new Uint8Array(bytes).slice();

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

// ==========================================
// Tool 10: Dedicated Add Pictures to PDF
// ==========================================

export type PictureCornerStyle = 'square' | 'rounded' | 'circle';

export interface PdfPicturePlacement {
  id: string;
  pageNumber: number; // 1-based
  xFraction: number; // 0..1 from left
  yFraction: number; // 0..1 from top
  widthFraction: number; // 0.04..0.95
  heightFraction: number; // 0.04..0.95
  dataUrl: string;
  rotationDeg: number; // 0, 90, 180, 270
  opacity: number; // 0.1..1
  cornerStyle: PictureCornerStyle;
  borderWidth: number; // 0..8 px
  borderColor: string;
  label: string;
}

export interface PdfAddPicturesResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  picturesCount: number;
}

async function prepareStyledPicturePng(item: PdfPicturePlacement): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Could not decode picture "${item.label}"`));
    el.src = item.dataUrl;
  });

  const swap = item.rotationDeg === 90 || item.rotationDeg === 270;
  const natW = img.naturalWidth || img.width || 400;
  const natH = img.naturalHeight || img.height || 300;
  const outW = Math.min(1600, swap ? natH : natW);
  const outH = Math.min(1600, swap ? natW : natH);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(20, outW);
  canvas.height = Math.max(20, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.save();
  if (item.cornerStyle === 'circle') {
    const r = Math.min(canvas.width, canvas.height) / 2;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else if (item.cornerStyle === 'rounded') {
    const rad = Math.min(canvas.width, canvas.height) * 0.1;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, rad);
    ctx.closePath();
    ctx.clip();
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((item.rotationDeg * Math.PI) / 180);
  const drawW = swap ? canvas.height : canvas.width;
  const drawH = swap ? canvas.width : canvas.height;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (item.borderWidth > 0) {
    const bw = Math.max(2, (item.borderWidth / 200) * Math.min(canvas.width, canvas.height));
    ctx.strokeStyle = item.borderColor || '#09090b';
    ctx.lineWidth = bw;
    if (item.cornerStyle === 'circle') {
      const r = Math.min(canvas.width, canvas.height) / 2 - bw / 2;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.max(4, r), 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.cornerStyle === 'rounded') {
      const rad = Math.min(canvas.width, canvas.height) * 0.1;
      ctx.beginPath();
      ctx.roundRect(bw / 2, bw / 2, canvas.width - bw, canvas.height - bw, rad);
      ctx.stroke();
    } else {
      ctx.strokeRect(bw / 2, bw / 2, canvas.width - bw, canvas.height - bw);
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/png')
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function applyPicturesToPdf(
  file: File,
  placements: PdfPicturePlacement[],
  onProgress?: (percent: number, status: string) => void
): Promise<PdfAddPicturesResult> {
  if (placements.length === 0) {
    throw new Error('Place at least one picture onto a PDF page before exporting.');
  }

  onProgress?.(12, 'Loading source PDF...');
  const buf = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');
  const pages = pdfDoc.getPages();

  for (let i = 0; i < placements.length; i++) {
    const item = placements[i];
    onProgress?.(
      18 + Math.round(((i + 1) / placements.length) * 68),
      `Embedding picture ${i + 1} of ${placements.length}: ${item.label}`
    );

    const pageIdx = Math.min(pages.length - 1, Math.max(0, item.pageNumber - 1));
    const page = pages[pageIdx];
    const { width: pageW, height: pageH } = page.getSize();

    const needsCanvasStyle =
      item.rotationDeg !== 0 ||
      item.cornerStyle !== 'square' ||
      item.borderWidth > 0 ||
      (!item.dataUrl.startsWith('data:image/jpeg') && !item.dataUrl.startsWith('data:image/png'));

    let embedded;
    if (needsCanvasStyle) {
      const pngBytes = await prepareStyledPicturePng(item);
      embedded = await pdfDoc.embedPng(pngBytes);
    } else {
      const rawBytes = await fetch(item.dataUrl).then((r) => r.arrayBuffer());
      embedded = item.dataUrl.startsWith('data:image/jpeg')
        ? await pdfDoc.embedJpg(new Uint8Array(rawBytes))
        : await pdfDoc.embedPng(new Uint8Array(rawBytes));
    }

    const boxW = Math.max(12, item.widthFraction * pageW);
    const boxH = Math.max(12, item.heightFraction * pageH);
    const pdfX = Math.max(0, Math.min(pageW - boxW, item.xFraction * pageW));
    const pdfTopY = item.yFraction * pageH;
    const pdfBottomY = Math.max(0, Math.min(pageH - boxH, pageH - pdfTopY - boxH));

    page.drawImage(embedded, {
      x: pdfX,
      y: pdfBottomY,
      width: boxW,
      height: boxH,
      opacity: Math.max(0.1, Math.min(1, item.opacity)),
    });
  }

  onProgress?.(92, 'Saving PDF with embedded pictures...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'PDF pictures applied');

  return {
    blob,
    bytes: safeBytes,
    fileName: `${baseName(file.name)}_with_pictures.pdf`,
    pageCount: pages.length,
    picturesCount: placements.length,
  };
}

// ==========================================
// Tool 11: Add PDF Watermark & Page Numbers
// ==========================================

export interface PdfWatermarkAddOptions {
  watermarkText: string;
  layout: 'diagonal' | 'center' | 'tiled';
  fontSize: number;
  colorHex: string;
  opacity: number; // 0.05..0.9
  rotationDeg: number; // -75..75
  logoDataUrl?: string | null;
  logoScale?: number; // 0.1..0.5
  showPageNumbers: boolean;
  pageNumberFormat: 'Page X of Y' | 'X / Y' | 'X';
  pageNumberPosition: 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right';
  pageRangeExpr?: string;
}

export interface PdfWatermarkResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  processedPages: number;
}

export async function applyPdfWatermarkAndNumbers(
  file: File,
  options: PdfWatermarkAddOptions,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfWatermarkResult> {
  if (!options.watermarkText.trim() && !options.logoDataUrl && !options.showPageNumbers) {
    throw new Error('Enter watermark text, upload a watermark logo, or enable page numbers.');
  }

  onProgress?.(14, 'Loading PDF...');
  const buf = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  const totalPages = pdfDoc.getPageCount();
  const targetIndices = parsePageRange(options.pageRangeExpr, totalPages);
  const targetSet = new Set(targetIndices);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let embeddedLogo: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (options.logoDataUrl) {
    const logoResp = await fetch(options.logoDataUrl);
    const logoAb = await logoResp.arrayBuffer();
    const logoBytes = new Uint8Array(logoAb);
    embeddedLogo = options.logoDataUrl.startsWith('data:image/jpeg')
      ? await pdfDoc.embedJpg(logoBytes)
      : await pdfDoc.embedPng(logoBytes);
  }

  const [wr, wg, wb] = hexToRgbTuple(options.colorHex || '#64748b');
  const cleanText = sanitizeWinAnsi(options.watermarkText.trim());
  const pages = pdfDoc.getPages();

  for (let idx = 0; idx < totalPages; idx++) {
    if (!targetSet.has(idx)) continue;
    onProgress?.(
      20 + Math.round(((idx + 1) / totalPages) * 68),
      `Applying stamps to page ${idx + 1} of ${totalPages}...`
    );

    const page = pages[idx];
    const { width: pw, height: ph } = page.getSize();

    if (embeddedLogo) {
      const lScale = Math.max(0.08, Math.min(0.55, options.logoScale || 0.24));
      const lw = pw * lScale;
      const lh = lw * (embeddedLogo.height / Math.max(1, embeddedLogo.width));
      page.drawImage(embeddedLogo, {
        x: (pw - lw) / 2,
        y: (ph - lh) / 2,
        width: lw,
        height: lh,
        opacity: Math.max(0.05, Math.min(0.9, options.opacity)),
      });
    }

    if (cleanText) {
      const fSize = Math.max(12, Math.min(96, options.fontSize || 44));
      const textW = fontBold.widthOfTextAtSize(cleanText, fSize);
      const angle = options.layout === 'center' ? 0 : options.rotationDeg || 40;
      const rad = (angle * Math.PI) / 180;

      const drawAt = (cx: number, cy: number) => {
        const dx = (textW / 2) * Math.cos(rad) - (fSize * 0.35) * Math.sin(rad);
        const dy = (textW / 2) * Math.sin(rad) + (fSize * 0.35) * Math.cos(rad);
        page.drawText(cleanText, {
          x: cx - dx,
          y: cy - dy,
          size: fSize,
          font: fontBold,
          color: rgb(wr, wg, wb),
          opacity: Math.max(0.05, Math.min(0.9, options.opacity)),
          rotate: degrees(angle),
        });
      };

      if (options.layout === 'tiled') {
        const cols = [pw * 0.24, pw * 0.74];
        const rows = [ph * 0.2, ph * 0.5, ph * 0.8];
        for (const cy of rows) {
          for (const cx of cols) {
            drawAt(cx, cy);
          }
        }
      } else {
        drawAt(pw / 2, ph / 2);
      }
    }

    if (options.showPageNumbers) {
      const label =
        options.pageNumberFormat === 'Page X of Y'
          ? `Page ${idx + 1} of ${totalPages}`
          : options.pageNumberFormat === 'X / Y'
          ? `${idx + 1} / ${totalPages}`
          : `${idx + 1}`;
      const numSize = 9.5;
      const numW = fontRegular.widthOfTextAtSize(label, numSize);
      let nx = pw - 36 - numW;
      let ny = 24;
      if (options.pageNumberPosition === 'bottom-center') {
        nx = (pw - numW) / 2;
        ny = 24;
      } else if (options.pageNumberPosition === 'bottom-left') {
        nx = 36;
        ny = 24;
      } else if (options.pageNumberPosition === 'top-right') {
        nx = pw - 36 - numW;
        ny = ph - 28;
      }
      page.drawText(label, {
        x: nx,
        y: ny,
        size: numSize,
        font: fontRegular,
        color: rgb(0.28, 0.31, 0.36),
      });
    }
  }

  onProgress?.(92, 'Saving watermarked PDF...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'PDF watermark applied');

  return {
    blob,
    bytes: safeBytes,
    fileName: `${baseName(file.name)}_stamped.pdf`,
    pageCount: totalPages,
    processedPages: targetIndices.length,
  };
}

// ==========================================
// Tool 12: PDF Watermark Remover (Vector + Pixel Clean)
// ==========================================

export type PdfWatermarkRemoveEngine = 'pixel-clean' | 'vector-layer';

export interface PdfExcludeBox {
  id: string;
  pageNumber: number | 'all';
  xFraction: number;
  yFraction: number;
  widthFraction: number;
  heightFraction: number;
}

export interface PdfWatermarkRemoveOptions {
  engine: PdfWatermarkRemoveEngine;
  luminanceCutoff: number; // 115..245 — pixels lighter than this with watermark characteristics lift to white
  textDarkenBoost: number; // 0..100 — deepens true dark ink
  targetTintHex?: string; // optional targeted watermark color
  tintSensitivity: number; // 0..80
  removeLightGreyWatermarks: boolean;
  watermarkKeywords?: string; // comma-separated strings for vector-layer stripping
  pageRangeExpr?: string;
  excludeBoxes?: PdfExcludeBox[];
}

export interface PdfWatermarkRemoveResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  cleanedPages: number;
  strippedVectorItems: number;
}

export function cleanWatermarkImageData(
  imgData: ImageData,
  opts: {
    luminanceCutoff: number;
    textDarkenBoost: number;
    targetTintHex?: string;
    tintSensitivity: number;
    removeLightGreyWatermarks: boolean;
    excludeBoxes?: Array<{ xFraction: number; yFraction: number; widthFraction: number; heightFraction: number }>;
  }
): void {
  const { width: w, height: h, data } = imgData;

  if (opts.excludeBoxes && opts.excludeBoxes.length > 0) {
    for (const box of opts.excludeBoxes) {
      const x0 = Math.max(0, Math.floor(box.xFraction * w));
      const y0 = Math.max(0, Math.floor(box.yFraction * h));
      const x1 = Math.min(w, Math.ceil((box.xFraction + box.widthFraction) * w));
      const y1 = Math.min(h, Math.ceil((box.yFraction + box.heightFraction) * h));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * w + px) * 4;
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
    }
  }

  let hasTint = false;
  let tr = 200;
  let tg = 200;
  let tb = 200;
  if (opts.targetTintHex && opts.tintSensitivity > 0) {
    const cleaned = opts.targetTintHex.replace('#', '');
    const num = parseInt(cleaned, 16);
    if (!Number.isNaN(num)) {
      tr = (num >> 16) & 255;
      tg = (num >> 8) & 255;
      tb = num & 255;
      hasTint = true;
    }
  }

  const lumCutoff = Math.max(105, Math.min(248, opts.luminanceCutoff));
  const tintDistMax = Math.max(10, opts.tintSensitivity * 2.4);
  const boostFactor = Math.max(0, Math.min(1, opts.textDarkenBoost / 100));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum >= 246) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      continue;
    }

    let erase = false;

    if (opts.removeLightGreyWatermarks && lum >= lumCutoff && chroma <= 58) {
      erase = true;
    } else if (lum >= Math.min(238, lumCutoff + 18)) {
      erase = true;
    }

    if (!erase && hasTint && lum > 90) {
      const dist = Math.hypot(r - tr, g - tg, b - tb);
      if (dist <= tintDistMax) {
        erase = true;
      }
    }

    if (erase) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else if (boostFactor > 0 && lum < lumCutoff) {
      // Gently deepen surviving body text / crisp diagram strokes
      const gammaPull = 1 - boostFactor * 0.48 * (1 - lum / Math.max(1, lumCutoff));
      data[i] = Math.max(0, Math.min(255, Math.round(r * gammaPull)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * gammaPull)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * gammaPull)));
    }
  }
}

function stripWatermarkContentStream(
  rawText: string,
  keywords: string[]
): { cleaned: string; removedCount: number } {
  let removedCount = 0;
  const kwLower = keywords.map((k) => k.toLowerCase()).filter(Boolean);

  // Clean matching or watermark-styled BT ... ET text blocks
  const cleaned = rawText.replace(/BT[\s\S]*?ET/g, (block) => {
    const blockLower = block.toLowerCase();
    const matchesKeyword = kwLower.some((kw) => blockLower.includes(kw));

    // Check rotated Tm matrix: a b c d e f Tm where |b| > 0.14 && |c| > 0.14
    const tmMatch = block.match(
      /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Tm/
    );
    const isDiagonal =
      tmMatch && Math.abs(parseFloat(tmMatch[2])) > 0.14 && Math.abs(parseFloat(tmMatch[3])) > 0.14;

    // Check light gray or pale fill color (> 0.65 g or > 0.65 rg)
    const grayMatch = block.match(/(\d*\.?\d+)\s+g\b/);
    const isPaleGray = grayMatch ? parseFloat(grayMatch[1]) >= 0.65 : false;

    if (matchesKeyword || (isDiagonal && (isPaleGray || block.length < 360))) {
      removedCount++;
      return '';
    }
    return block;
  });

  return { cleaned, removedCount };
}

export async function removePdfWatermark(
  file: File,
  options: PdfWatermarkRemoveOptions,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfWatermarkRemoveResult> {
  const originalBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;

  if (options.engine === 'vector-layer') {
    onProgress?.(16, 'Inspecting PDF vector layers & watermark streams...');
    const pdfDoc = await PDFDocument.load(originalBuffer, { ignoreEncryption: true });
    pdfDoc.setProducer('PaperLink');
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const indices = parsePageRange(options.pageRangeExpr, totalPages);
    const defaultKeywords = ['watermark', 'confidential', 'draft', 'sample', 'camscanner', 'do not copy'];
    const extraKeywords = (options.watermarkKeywords || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const keywords = [...extraKeywords, ...defaultKeywords];

    let strippedCount = 0;

    for (let i = 0; i < indices.length; i++) {
      const pIdx = indices[i];
      onProgress?.(
        20 + Math.round(((i + 1) / indices.length) * 65),
        `Cleaning vector layers on page ${pIdx + 1}...`
      );
      const page = pages[pIdx];
      const pageNode = page.node;

      // 1. Strip Watermark / Stamp / Keyword Annotations
      const annots = pageNode.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (annots) {
        for (let a = annots.size() - 1; a >= 0; a--) {
          const annotDict = annots.lookupMaybe(a, PDFDict);
          if (!annotDict) continue;
          const subtype = annotDict.get(PDFName.of('Subtype'))?.toString() || '';
          const contents = annotDict.get(PDFName.of('Contents'))?.toString().toLowerCase() || '';
          const isWmAnnot =
            subtype.includes('Watermark') ||
            subtype.includes('Stamp') ||
            keywords.some((kw) => contents.includes(kw.toLowerCase()));
          if (isWmAnnot) {
            annots.remove(a);
            strippedCount++;
          }
        }
      }

      // 2. Inspect Form XObjects in Resources
      const resources = pageNode.lookupMaybe(PDFName.of('Resources'), PDFDict);
      const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (xObjects) {
        const keys = xObjects.keys();
        for (const key of keys) {
          const refOrStream = xObjects.get(key);
          const stream = pdfDoc.context.lookup(refOrStream);
          if (!(stream instanceof PDFRawStream)) continue;
          const subtype = stream.dict.get(PDFName.of('Subtype'))?.toString() || '';
          if (!subtype.includes('Form')) continue;
          try {
            const decodedBytes = decodePDFRawStream(stream).decode();
            const text = new TextDecoder('latin1').decode(decodedBytes);
            const textLower = text.toLowerCase();
            const hasKw = keywords.some((kw) => textLower.includes(kw.toLowerCase()));
            const hasDiagCm =
              /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+cm/.test(
                text
              ) && text.length < 1800;
            const hasAlpha = /\/GS\w*\s+gs/.test(text) && (text.includes('BT') || text.includes('Do'));

            if (hasKw || (hasDiagCm && hasAlpha)) {
              const emptyStream = pdfDoc.context.flateStream('');
              const emptyRef = pdfDoc.context.register(emptyStream);
              xObjects.set(key, emptyRef);
              strippedCount++;
            }
          } catch {
            // Skip unreadable binary XObject
          }
        }
      }

      // 3. Clean page Contents streams
      const contentsObj = pageNode.get(PDFName.of('Contents'));
      const cleanStreamRef = (ref: any) => {
        const st = pdfDoc.context.lookup(ref);
        if (!(st instanceof PDFRawStream)) return null;
        try {
          const decoded = decodePDFRawStream(st).decode();
          const rawStr = new TextDecoder('latin1').decode(decoded);
          const { cleaned, removedCount } = stripWatermarkContentStream(rawStr, keywords);
          if (removedCount > 0) {
            strippedCount += removedCount;
            const replacement = pdfDoc.context.flateStream(cleaned);
            return pdfDoc.context.register(replacement);
          }
        } catch {
          // ignore
        }
        return null;
      };

      if (contentsObj instanceof PDFArray) {
        for (let c = 0; c < contentsObj.size(); c++) {
          const rep = cleanStreamRef(contentsObj.get(c));
          if (rep) contentsObj.set(c, rep);
        }
      } else if (contentsObj) {
        const rep = cleanStreamRef(contentsObj);
        if (rep) pageNode.set(PDFName.of('Contents'), rep);
      }

      // Optional manual whiteout boxes
      const pageBoxes = (options.excludeBoxes || []).filter(
        (b) => b.pageNumber === 'all' || b.pageNumber === pIdx + 1
      );
      if (pageBoxes.length > 0) {
        const { width: pw, height: ph } = page.getSize();
        for (const box of pageBoxes) {
          const bw = box.widthFraction * pw;
          const bh = box.heightFraction * ph;
          const bx = box.xFraction * pw;
          const by = ph - box.yFraction * ph - bh;
          page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: rgb(1, 1, 1) });
          strippedCount++;
        }
      }
    }

    onProgress?.(92, 'Rebuilding cleaned PDF...');
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    const safeBytes = new Uint8Array(bytes).slice();
    const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
    onProgress?.(100, 'PDF watermark layers cleaned');

    return {
      blob,
      bytes: safeBytes,
      fileName: `${baseName(file.name)}_no_watermark.pdf`,
      pageCount: totalPages,
      cleanedPages: indices.length,
      strippedVectorItems: strippedCount,
    };
  }

  // Pixel Clean-Up Mode (Works on Scanned / Flattened / Color Watermarks)
  const pdfjsLib = getPdfJs();
  onProgress?.(10, 'Rendering PDF pages for pixel watermark removal...');
  const pdf = await pdfjsLib.getDocument({
    data: cloneArrayBuffer(originalBuffer),
    useSystemFonts: true,
  }).promise;
  const totalPages: number = pdf.numPages;
  const indices = parsePageRange(options.pageRangeExpr, totalPages);
  const targetSet = new Set(indices);

  const srcDocForPassthrough = await PDFDocument.load(cloneArrayBuffer(originalBuffer), {
    ignoreEncryption: true,
  });
  const outDoc = await PDFDocument.create();
  outDoc.setProducer('PaperLink');
  outDoc.setCreator('PaperLink');

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageNum = pIdx + 1;
    if (!targetSet.has(pIdx)) {
      const [copied] = await outDoc.copyPages(srcDocForPassthrough, [pIdx]);
      outDoc.addPage(copied);
      continue;
    }

    onProgress?.(
      14 + Math.round(((pIdx + 1) / totalPages) * 76),
      `Removing watermark pixels on page ${pageNum} of ${totalPages}...`
    );

    const page = await pdf.getPage(pageNum);
    const baseVp = page.getViewport({ scale: 1.0 });
    const hiVp = page.getViewport({ scale: 2.1 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(hiVp.width));
    canvas.height = Math.max(1, Math.round(hiVp.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: hiVp }).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pageBoxes = (options.excludeBoxes || []).filter(
      (b) => b.pageNumber === 'all' || b.pageNumber === pageNum
    );
    cleanWatermarkImageData(imgData, {
      luminanceCutoff: options.luminanceCutoff,
      textDarkenBoost: options.textDarkenBoost,
      targetTintHex: options.targetTintHex,
      tintSensitivity: options.tintSensitivity,
      removeLightGreyWatermarks: options.removeLightGreyWatermarks,
      excludeBoxes: pageBoxes,
    });
    ctx.putImageData(imgData, 0, 0);

    const jpgBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/jpeg', 0.92)
    );
    const embedded = await outDoc.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));
    const outPage = outDoc.addPage([baseVp.width, baseVp.height]);
    outPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: baseVp.width,
      height: baseVp.height,
    });
  }

  onProgress?.(94, 'Packaging clean PDF...');
  const bytes = await outDoc.save({ useObjectStreams: true });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Watermark removal complete');

  return {
    blob,
    bytes: safeBytes,
    fileName: `${baseName(file.name)}_no_watermark.pdf`,
    pageCount: totalPages,
    cleanedPages: indices.length,
    strippedVectorItems: indices.length,
  };
}

// ==========================================
// Tool 13: Crop & Auto-Scan Phone PDF
// (Auto Edge Crop + Shadow Flatten + Watermark Clean + Full-Page Fit)
// ==========================================

export type PdfScanEnhanceMode = 'magic-color' | 'bw-document' | 'clean-only' | 'none';
export type PdfScanFitPage = 'a4-fit' | 'a4-full-bleed' | 'letter-fit' | 'exact-crop';

export interface PdfCropRect {
  left: number; // 0..1 from left
  top: number; // 0..1 from top
  right: number; // 0..1 from left (> left)
  bottom: number; // 0..1 from top (> top)
}

export interface PdfScanCropOptions {
  cropRects?: Record<number, PdfCropRect>; // keyed by 1-based page number
  defaultCrop?: PdfCropRect;
  autoDetectEdges: boolean;
  autoRemoveWatermark: boolean;
  flattenShadows: boolean;
  enhanceMode: PdfScanEnhanceMode;
  fitPage: PdfScanFitPage;
  watermarkCutoff?: number;
  pageRangeExpr?: string;
}

export interface PdfScanCropResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  processedPages: number;
}

/**
 * Automatically detects the paper boundary inside a phone-captured page or bordered scan
 * so dark desk/camera margins are cropped away while preserving full document content.
 */
export function detectDocumentCropRectFromImageData(imgData: ImageData): PdfCropRect {
  const { width: w, height: h, data } = imgData;
  if (w < 24 || h < 24) {
    return { left: 0.01, top: 0.01, right: 0.99, bottom: 0.99 };
  }

  const getLum = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  // Sample average brightness of center paper vs outer 3% border ring
  const cx0 = Math.floor(w * 0.25);
  const cx1 = Math.floor(w * 0.75);
  const cy0 = Math.floor(h * 0.25);
  const cy1 = Math.floor(h * 0.75);
  let centerSum = 0;
  let centerN = 0;
  for (let y = cy0; y < cy1; y += 4) {
    for (let x = cx0; x < cx1; x += 4) {
      centerSum += getLum(x, y);
      centerN++;
    }
  }
  const centerAvg = centerN > 0 ? centerSum / centerN : 225;

  let edgeSum = 0;
  let edgeN = 0;
  const band = Math.max(2, Math.floor(Math.min(w, h) * 0.025));
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      if (x < band || x >= w - band || y < band || y >= h - band) {
        edgeSum += getLum(x, y);
        edgeN++;
      }
    }
  }
  const edgeAvg = edgeN > 0 ? edgeSum / edgeN : 225;

  // Case A: Dark desk / phone border surrounding brighter paper sheet
  const hasDarkOuterBorder = centerAvg - edgeAvg > 28 && edgeAvg < 185;
  if (hasDarkOuterBorder) {
    const paperThresh = edgeAvg + (centerAvg - edgeAvg) * 0.42;

    const rowPaperFraction = (y: number) => {
      let bright = 0;
      let total = 0;
      for (let x = Math.floor(w * 0.08); x < Math.floor(w * 0.92); x += 4) {
        if (getLum(x, y) >= paperThresh) bright++;
        total++;
      }
      return total > 0 ? bright / total : 0;
    };

    const colPaperFraction = (x: number, yStart: number, yEnd: number) => {
      let bright = 0;
      let total = 0;
      for (let y = yStart; y < yEnd; y += 4) {
        if (getLum(x, y) >= paperThresh) bright++;
        total++;
      }
      return total > 0 ? bright / total : 0;
    };

    let topPx = 0;
    while (topPx < Math.floor(h * 0.42) && rowPaperFraction(topPx) < 0.38) topPx += 2;

    let bottomPx = h - 1;
    while (bottomPx > Math.floor(h * 0.58) && rowPaperFraction(bottomPx) < 0.38) bottomPx -= 2;

    const spanY0 = Math.min(bottomPx - 10, topPx + 6);
    const spanY1 = Math.max(spanY0 + 10, bottomPx - 6);

    let leftPx = 0;
    while (leftPx < Math.floor(w * 0.42) && colPaperFraction(leftPx, spanY0, spanY1) < 0.38) {
      leftPx += 2;
    }

    let rightPx = w - 1;
    while (rightPx > Math.floor(w * 0.58) && colPaperFraction(rightPx, spanY0, spanY1) < 0.38) {
      rightPx -= 2;
    }

    // Small inward clean trim so residual dark edge hairline doesn't remain
    const trimX = Math.round(w * 0.008);
    const trimY = Math.round(h * 0.008);
    const l = Math.max(0, Math.min(0.42, (leftPx + trimX) / w));
    const t = Math.max(0, Math.min(0.42, (topPx + trimY) / h));
    const r = Math.min(1, Math.max(0.58, (rightPx - trimX) / w));
    const b = Math.min(1, Math.max(0.58, (bottomPx - trimY) / h));

    if (r - l >= 0.25 && b - t >= 0.25) {
      return {
        left: Number(l.toFixed(3)),
        top: Number(t.toFixed(3)),
        right: Number(r.toFixed(3)),
        bottom: Number(b.toFixed(3)),
      };
    }
  }

  // Case B: Already light/white scan — auto-trim oversized blank outer margins cleanly
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let inkHits = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      if (getLum(x, y) < 212) {
        inkHits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkHits > 25 && maxX - minX > w * 0.2 && maxY - minY > h * 0.2) {
    const padX = Math.round(w * 0.025);
    const padY = Math.round(h * 0.025);
    const l = Math.max(0, (minX - padX) / w);
    const t = Math.max(0, (minY - padY) / h);
    const r = Math.min(1, (maxX + padX) / w);
    const b = Math.min(1, (maxY + padY) / h);
    return {
      left: Number(l.toFixed(3)),
      top: Number(t.toFixed(3)),
      right: Number(r.toFixed(3)),
      bottom: Number(b.toFixed(3)),
    };
  }

  return { left: 0.015, top: 0.015, right: 0.985, bottom: 0.985 };
}

/**
 * Applies phone-camera scanner enhancement:
 * 1) Adaptive local background division (flattens phone shadows & uneven lighting into crisp paper white)
 * 2) Automatic watermark pixel cleaning (removes scanner logos & pale stamps)
 * 3) Magic Color or Crisp B&W enhancement
 */
export function applyPhoneScanFilterToImageData(
  imgData: ImageData,
  opts: {
    flattenShadows: boolean;
    autoRemoveWatermark: boolean;
    enhanceMode: PdfScanEnhanceMode;
    watermarkCutoff?: number;
  }
): void {
  const { width: w, height: h, data } = imgData;

  if (opts.flattenShadows && w >= 16 && h >= 16) {
    const gridW = 24;
    const gridH = 24;
    const cellW = w / gridW;
    const cellH = h / gridH;
    const bgR = new Float32Array(gridW * gridH);
    const bgG = new Float32Array(gridW * gridH);
    const bgB = new Float32Array(gridW * gridH);

    // Estimate local paper background using 88th percentile / max-bright cluster per cell
    for (let gy = 0; gy < gridH; gy++) {
      const y0 = Math.floor(gy * cellH);
      const y1 = Math.min(h, Math.ceil((gy + 1) * cellH));
      for (let gx = 0; gx < gridW; gx++) {
        const x0 = Math.floor(gx * cellW);
        const x1 = Math.min(w, Math.ceil((gx + 1) * cellW));
        let bestLum = -1;
        let br = 245;
        let bg = 245;
        let bb = 245;
        for (let py = y0; py < y1; py += 2) {
          for (let px = x0; px < x1; px += 2) {
            const idx = (py * w + px) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            if (lum > bestLum) {
              bestLum = lum;
              br = data[idx];
              bg = data[idx + 1];
              bb = data[idx + 2];
            }
          }
        }
        const gIdx = gy * gridW + gx;
        bgR[gIdx] = Math.max(95, br);
        bgG[gIdx] = Math.max(95, bg);
        bgB[gIdx] = Math.max(95, bb);
      }
    }

    // Smooth illumination grid twice to prevent blockiness around large images
    const smoothGrid = (arr: Float32Array) => {
      const copy = new Float32Array(arr);
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          let sum = 0;
          let cnt = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = Math.max(0, Math.min(gridH - 1, gy + dy));
              const nx = Math.max(0, Math.min(gridW - 1, gx + dx));
              sum += copy[ny * gridW + nx];
              cnt++;
            }
          }
          arr[gy * gridW + gx] = sum / cnt;
        }
      }
    };
    smoothGrid(bgR);
    smoothGrid(bgG);
    smoothGrid(bgB);

    // Bilinear local normalization
    for (let y = 0; y < h; y++) {
      const fy = Math.max(0, Math.min(gridH - 1.001, (y + 0.5) / cellH - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(gridH - 1, y0 + 1);
      const wy = fy - y0;

      for (let x = 0; x < w; x++) {
        const fx = Math.max(0, Math.min(gridW - 1.001, (x + 0.5) / cellW - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(gridW - 1, x0 + 1);
        const wx = fx - x0;

        const i00 = y0 * gridW + x0;
        const i10 = y0 * gridW + x1;
        const i01 = y1 * gridW + x0;
        const i11 = y1 * gridW + x1;

        const estR =
          (bgR[i00] * (1 - wx) + bgR[i10] * wx) * (1 - wy) +
          (bgR[i01] * (1 - wx) + bgR[i11] * wx) * wy;
        const estG =
          (bgG[i00] * (1 - wx) + bgG[i10] * wx) * (1 - wy) +
          (bgG[i01] * (1 - wx) + bgG[i11] * wx) * wy;
        const estB =
          (bgB[i00] * (1 - wx) + bgB[i10] * wx) * (1 - wy) +
          (bgB[i01] * (1 - wx) + bgB[i11] * wx) * wy;

        const p = (y * w + x) * 4;
        data[p] = Math.min(255, Math.round((data[p] / estR) * 255));
        data[p + 1] = Math.min(255, Math.round((data[p + 1] / estG) * 255));
        data[p + 2] = Math.min(255, Math.round((data[p + 2] / estB) * 255));
      }
    }
  }

  if (opts.enhanceMode === 'magic-color') {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c];
        const contrasted = ((v / 255 - 0.5) * 1.24 + 0.52) * 255;
        data[i + c] = contrasted > 224 ? 255 : Math.max(0, Math.min(255, Math.round(contrasted)));
      }
    }
  } else if (opts.enhanceMode === 'bw-document') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const bw = lum > 175 ? 255 : Math.max(0, Math.round(((lum / 175) ** 1.35) * 175));
      data[i] = bw;
      data[i + 1] = bw;
      data[i + 2] = bw;
    }
  }

  if (opts.autoRemoveWatermark) {
    cleanWatermarkImageData(imgData, {
      luminanceCutoff: opts.watermarkCutoff ?? 176,
      textDarkenBoost: opts.enhanceMode === 'bw-document' ? 68 : 48,
      tintSensitivity: 24,
      removeLightGreyWatermarks: true,
    });
  }
}

/**
 * Crops, auto-scans, strips watermarks, and fits every page neatly into the full PDF page.
 */
export async function scanCropAndCleanPdf(
  file: File,
  options: PdfScanCropOptions,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfScanCropResult> {
  const pdfjsLib = getPdfJs();
  onProgress?.(8, 'Inspecting PDF pages for crop & auto-scan...');
  const rawBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({
    data: cloneArrayBuffer(rawBuffer),
    useSystemFonts: true,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
  }).promise;

  const totalPages: number = pdf.numPages;
  const targetIndices = parsePageRange(options.pageRangeExpr, totalPages);
  const targetSet = new Set(targetIndices);

  const srcForPassthrough = await PDFDocument.load(cloneArrayBuffer(rawBuffer), {
    ignoreEncryption: true,
  });
  const outDoc = await PDFDocument.create();
  outDoc.setProducer('PaperLink Auto-Scanner');
  outDoc.setCreator('PaperLink');

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageNum = pIdx + 1;
    if (!targetSet.has(pIdx)) {
      const [copied] = await outDoc.copyPages(srcForPassthrough, [pIdx]);
      outDoc.addPage(copied);
      continue;
    }

    onProgress?.(
      14 + Math.round(((pIdx + 1) / totalPages) * 76),
      `Cropping, scanning & cleaning page ${pageNum} of ${totalPages}...`
    );

    const page = await pdf.getPage(pageNum);
    const renderVp = page.getViewport({ scale: 2.2 });

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = Math.max(1, Math.round(renderVp.width));
    srcCanvas.height = Math.max(1, Math.round(renderVp.height));
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Canvas unavailable');

    srcCtx.fillStyle = '#ffffff';
    srcCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
    await page.render({ canvasContext: srcCtx, viewport: renderVp }).promise;

    const fullImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const rect: PdfCropRect =
      options.cropRects?.[pageNum] ||
      (options.autoDetectEdges
        ? detectDocumentCropRectFromImageData(fullImgData)
        : options.defaultCrop || { left: 0, top: 0, right: 1, bottom: 1 });

    const sx = Math.max(0, Math.min(srcCanvas.width - 12, Math.round(rect.left * srcCanvas.width)));
    const sy = Math.max(0, Math.min(srcCanvas.height - 12, Math.round(rect.top * srcCanvas.height)));
    const sw = Math.max(12, Math.min(srcCanvas.width - sx, Math.round((rect.right - rect.left) * srcCanvas.width)));
    const sh = Math.max(12, Math.min(srcCanvas.height - sy, Math.round((rect.bottom - rect.top) * srcCanvas.height)));

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) throw new Error('Canvas unavailable');
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, sw, sh);
    cropCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    if (options.flattenShadows || options.autoRemoveWatermark || options.enhanceMode !== 'none') {
      const croppedImgData = cropCtx.getImageData(0, 0, sw, sh);
      applyPhoneScanFilterToImageData(croppedImgData, {
        flattenShadows: options.flattenShadows,
        autoRemoveWatermark: options.autoRemoveWatermark,
        enhanceMode: options.enhanceMode,
        watermarkCutoff: options.watermarkCutoff,
      });
      cropCtx.putImageData(croppedImgData, 0, 0);
    }

    const jpgBlob = await new Promise<Blob>((resolve, reject) =>
      cropCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Scanned image encode failed'))),
        'image/jpeg',
        0.92
      )
    );
    const embedded = await outDoc.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));

    // Compute fitted PDF output page dimensions so the cropped scan properly fills the whole page
    const isLandscape = sw > sh * 1.05;
    let pageW = 595.28;
    let pageH = 841.89;
    let drawW = pageW;
    let drawH = pageH;
    let drawX = 0;
    let drawY = 0;

    if (options.fitPage === 'exact-crop') {
      const normScale = 595.28 / Math.max(1, isLandscape ? sh : sw);
      pageW = Math.round(sw * normScale);
      pageH = Math.round(sh * normScale);
      drawW = pageW;
      drawH = pageH;
    } else if (options.fitPage === 'a4-full-bleed') {
      pageW = isLandscape ? 841.89 : 595.28;
      pageH = isLandscape ? 595.28 : 841.89;
      // Cover / fill whole page edge-to-edge cleanly
      const scale = Math.max(pageW / sw, pageH / sh);
      drawW = sw * scale;
      drawH = sh * scale;
      drawX = (pageW - drawW) / 2;
      drawY = (pageH - drawH) / 2;
    } else {
      const base =
        options.fitPage === 'letter-fit'
          ? { w: 612, h: 792 }
          : { w: 595.28, h: 841.89 };
      pageW = isLandscape ? base.h : base.w;
      pageH = isLandscape ? base.w : base.h;
      // Tight 8pt print-safe margin so cropped content fills ~97% of the whole page cleanly
      const margin = 8;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const scale = Math.min(availW / sw, availH / sh);
      drawW = sw * scale;
      drawH = sh * scale;
      drawX = (pageW - drawW) / 2;
      drawY = (pageH - drawH) / 2;
    }

    const outPage = outDoc.addPage([pageW, pageH]);
    outPage.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  onProgress?.(94, 'Packaging cropped & auto-scanned PDF...');
  const bytes = await outDoc.save({ useObjectStreams: false });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Crop & Auto-Scan complete');

  return {
    blob,
    bytes: safeBytes,
    fileName: `${baseName(file.name)}_scanned.pdf`,
    pageCount: totalPages,
    processedPages: targetIndices.length,
  };
}

export interface Point2D {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface PdfQuadCorners {
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
}

/**
 * Automatically detects the 4 perspective corners (tl, tr, br, bl) of a physical document
 * photographed on a desk/table, or falls back to a clean slightly inset document quad.
 */
export function detectDocumentQuadFromImageData(imgData: ImageData): PdfQuadCorners {
  const { width: w, height: h, data } = imgData;
  if (w < 40 || h < 40) {
    return {
      tl: { x: 0.04, y: 0.04 },
      tr: { x: 0.96, y: 0.04 },
      br: { x: 0.96, y: 0.96 },
      bl: { x: 0.04, y: 0.96 },
    };
  }

  const getLum = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(w - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(h - 1, Math.round(y)));
    const idx = (cy * w + cx) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  // Measure center vs border luminance
  let centerSum = 0;
  let centerCnt = 0;
  for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 6) {
    for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x += 6) {
      centerSum += getLum(x, y);
      centerCnt++;
    }
  }
  const centerAvg = centerCnt > 0 ? centerSum / centerCnt : 225;

  let edgeSum = 0;
  let edgeCnt = 0;
  const band = Math.max(4, Math.floor(Math.min(w, h) * 0.03));
  for (let y = 0; y < h; y += 5) {
    for (let x = 0; x < w; x += 5) {
      if (x < band || x >= w - band || y < band || y >= h - band) {
        edgeSum += getLum(x, y);
        edgeCnt++;
      }
    }
  }
  const edgeAvg = edgeCnt > 0 ? edgeSum / edgeCnt : 225;

  if (centerAvg - edgeAvg > 24 && edgeAvg < 190) {
    const thresh = edgeAvg + (centerAvg - edgeAvg) * 0.42;

    // Fit lines on top, bottom, left, right boundaries using sampled edge hits
    const topPts: { x: number; y: number }[] = [];
    const botPts: { x: number; y: number }[] = [];
    for (let xi = 0.2; xi <= 0.8; xi += 0.06) {
      const px = Math.round(xi * w);
      let ty = 0;
      while (ty < h * 0.48 && getLum(px, ty) < thresh) ty += 2;
      if (ty < h * 0.46) topPts.push({ x: px, y: ty });

      let by = h - 1;
      while (by > h * 0.52 && getLum(px, by) < thresh) by -= 2;
      if (by > h * 0.54) botPts.push({ x: px, y: by });
    }

    const leftPts: { x: number; y: number }[] = [];
    const rightPts: { x: number; y: number }[] = [];
    for (let yi = 0.2; yi <= 0.8; yi += 0.06) {
      const py = Math.round(yi * h);
      let lx = 0;
      while (lx < w * 0.48 && getLum(lx, py) < thresh) lx += 2;
      if (lx < w * 0.46) leftPts.push({ x: lx, y: py });

      let rx = w - 1;
      while (rx > w * 0.52 && getLum(rx, py) < thresh) rx -= 2;
      if (rx > w * 0.54) rightPts.push({ x: rx, y: py });
    }

    const fitHorizontal = (pts: { x: number; y: number }[], fallbackY: number) => {
      if (pts.length < 3) return { m: 0, b: fallbackY };
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
        sxx += p.x * p.x;
        sxy += p.x * p.y;
      }
      const n = pts.length;
      const denom = n * sxx - sx * sx;
      if (Math.abs(denom) < 1e-4) return { m: 0, b: sy / n };
      const m = Math.max(-0.45, Math.min(0.45, (n * sxy - sx * sy) / denom));
      const b = (sy - m * sx) / n;
      return { m, b };
    };

    const fitVertical = (pts: { x: number; y: number }[], fallbackX: number) => {
      if (pts.length < 3) return { m: 0, b: fallbackX };
      let sx = 0, sy = 0, syy = 0, sxy = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
        syy += p.y * p.y;
        sxy += p.x * p.y;
      }
      const n = pts.length;
      const denom = n * syy - sy * sy;
      if (Math.abs(denom) < 1e-4) return { m: 0, b: sx / n };
      const m = Math.max(-0.45, Math.min(0.45, (n * sxy - sy * sx) / denom));
      const b = (sx - m * sy) / n;
      return { m, b };
    };

    const topLine = fitHorizontal(topPts, h * 0.05);
    const botLine = fitHorizontal(botPts, h * 0.95);
    const leftLine = fitVertical(leftPts, w * 0.05);
    const rightLine = fitVertical(rightPts, w * 0.95);

    const intersect = (
      hLine: { m: number; b: number },
      vLine: { m: number; b: number }
    ): Point2D => {
      const denom = 1 - hLine.m * vLine.m;
      const y = Math.abs(denom) > 1e-4 ? (hLine.m * vLine.b + hLine.b) / denom : hLine.b;
      const x = vLine.m * y + vLine.b;
      return {
        x: Number(Math.max(0.01, Math.min(0.99, x / w)).toFixed(3)),
        y: Number(Math.max(0.01, Math.min(0.99, y / h)).toFixed(3)),
      };
    };

    const tl = intersect(topLine, leftLine);
    const tr = intersect(topLine, rightLine);
    const br = intersect(botLine, rightLine);
    const bl = intersect(botLine, leftLine);

    if (tr.x - tl.x > 0.25 && br.x - bl.x > 0.25 && bl.y - tl.y > 0.25 && br.y - tr.y > 0.25) {
      return { tl, tr, br, bl };
    }
  }

  // Fallback to clean tight box
  const rect = detectDocumentCropRectFromImageData(imgData);
  return {
    tl: { x: rect.left, y: rect.top },
    tr: { x: rect.right, y: rect.top },
    br: { x: rect.right, y: rect.bottom },
    bl: { x: rect.left, y: rect.bottom },
  };
}

function solveLinear8x8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    const tmp = M[col];
    M[col] = M[pivot];
    M[pivot] = tmp;

    const div = Math.abs(M[col][col]) < 1e-10 ? 1e-10 : M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }
  return M.map((row) => row[n]);
}

/**
 * Computes an exact 3x3 projective Homography mapping rectangular output (dstW x dstH)
 * back into arbitrary source quad coordinates and resamples via smooth bilinear interpolation.
 */
export function warpPerspectiveCanvas(
  srcCanvas: HTMLCanvasElement,
  quad: PdfQuadCorners,
  maxOutWidth = 1480
): HTMLCanvasElement {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const pTL = { x: quad.tl.x * sw, y: quad.tl.y * sh };
  const pTR = { x: quad.tr.x * sw, y: quad.tr.y * sh };
  const pBR = { x: quad.br.x * sw, y: quad.br.y * sh };
  const pBL = { x: quad.bl.x * sw, y: quad.bl.y * sh };

  const topW = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y);
  const botW = Math.hypot(pBR.x - pBL.x, pBR.y - pBL.y);
  const leftH = Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y);
  const rightH = Math.hypot(pBR.x - pTR.x, pBR.y - pTR.y);

  const rawW = Math.max(40, Math.round(Math.max(topW, botW)));
  const rawH = Math.max(40, Math.round(Math.max(leftH, rightH)));
  const scale = rawW > maxOutWidth ? maxOutWidth / rawW : 1;
  const dstW = Math.max(40, Math.round(rawW * scale));
  const dstH = Math.max(40, Math.round(rawH * scale));

  // Solve homography: dst (u,v) -> src (x,y)
  const dstPts = [
    { u: 0, v: 0, x: pTL.x, y: pTL.y },
    { u: dstW, v: 0, x: pTR.x, y: pTR.y },
    { u: dstW, v: dstH, x: pBR.x, y: pBR.y },
    { u: 0, v: dstH, x: pBL.x, y: pBL.y },
  ];

  const A: number[][] = [];
  const rhs: number[] = [];
  for (const pt of dstPts) {
    A.push([pt.u, pt.v, 1, 0, 0, 0, -pt.u * pt.x, -pt.v * pt.x]);
    rhs.push(pt.x);
    A.push([0, 0, 0, pt.u, pt.v, 1, -pt.u * pt.y, -pt.v * pt.y]);
    rhs.push(pt.y);
  }
  const [h0, h1, h2, h3, h4, h5, h6, h7] = solveLinear8x8(A, rhs);

  const srcCtx = srcCanvas.getContext('2d');
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d');
  if (!srcCtx || !dstCtx) return dstCanvas;

  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;
  const outImg = dstCtx.createImageData(dstW, dstH);
  const outData = outImg.data;

  for (let v = 0; v < dstH; v++) {
    for (let u = 0; u < dstW; u++) {
      const denom = h6 * u + h7 * v + 1;
      const sx = (h0 * u + h1 * v + h2) / denom;
      const sy = (h3 * u + h4 * v + h5) / denom;

      const outIdx = (v * dstW + u) * 4;
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        outData[outIdx] = 255;
        outData[outIdx + 1] = 255;
        outData[outIdx + 2] = 255;
        outData[outIdx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      outData[outIdx] = Math.round(srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11);
      outData[outIdx + 1] = Math.round(
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11
      );
      outData[outIdx + 2] = Math.round(
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11
      );
      outData[outIdx + 3] = 255;
    }
  }

  dstCtx.putImageData(outImg, 0, 0);
  return dstCanvas;
}

export interface PerspectiveScanPageInput {
  id: string;
  name: string;
  dataUrl: string;
  quad: PdfQuadCorners;
}

export async function perspectiveScanPagesToPdf(
  pages: PerspectiveScanPageInput[],
  options: {
    flattenShadows: boolean;
    autoRemoveWatermark: boolean;
    enhanceMode: PdfScanEnhanceMode;
    fitPage: PdfScanFitPage;
    watermarkCutoff?: number;
    outputName?: string;
  },
  onProgress?: (percent: number, status: string) => void
): Promise<PdfScanCropResult> {
  if (pages.length === 0) {
    throw new Error('Upload at least one physical document photo or PDF page.');
  }

  const outDoc = await PDFDocument.create();
  outDoc.setProducer('PaperLink Perspective Auto-Scanner');
  outDoc.setCreator('PaperLink');

  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    onProgress?.(
      10 + Math.round(((i + 1) / pages.length) * 80),
      `Perspective-correcting & cleaning page ${i + 1} of ${pages.length}...`
    );

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to decode page ${i + 1}`));
      el.src = item.dataUrl;
    });

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = Math.max(20, img.naturalWidth || 800);
    srcCanvas.height = Math.max(20, img.naturalHeight || 1100);
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Canvas unavailable');
    srcCtx.fillStyle = '#ffffff';
    srcCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
    srcCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);

    const warpedCanvas = warpPerspectiveCanvas(srcCanvas, item.quad, 1480);

    if (options.flattenShadows || options.autoRemoveWatermark || options.enhanceMode !== 'none') {
      const wCtx = warpedCanvas.getContext('2d');
      if (wCtx) {
        const wData = wCtx.getImageData(0, 0, warpedCanvas.width, warpedCanvas.height);
        applyPhoneScanFilterToImageData(wData, {
          flattenShadows: options.flattenShadows,
          autoRemoveWatermark: options.autoRemoveWatermark,
          enhanceMode: options.enhanceMode,
          watermarkCutoff: options.watermarkCutoff ?? 176,
        });
        wCtx.putImageData(wData, 0, 0);
      }
    }

    const jpgBlob = await new Promise<Blob>((resolve, reject) =>
      warpedCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Scan encode failed'))),
        'image/jpeg',
        0.92
      )
    );
    const embedded = await outDoc.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));

    const sw = warpedCanvas.width;
    const sh = warpedCanvas.height;
    const isLandscape = sw > sh * 1.05;
    let pageW = 595.28;
    let pageH = 841.89;
    let drawW = pageW;
    let drawH = pageH;
    let drawX = 0;
    let drawY = 0;

    if (options.fitPage === 'exact-crop') {
      const normScale = 595.28 / Math.max(1, isLandscape ? sh : sw);
      pageW = Math.round(sw * normScale);
      pageH = Math.round(sh * normScale);
      drawW = pageW;
      drawH = pageH;
    } else if (options.fitPage === 'a4-full-bleed') {
      pageW = isLandscape ? 841.89 : 595.28;
      pageH = isLandscape ? 595.28 : 841.89;
      const scale = Math.max(pageW / sw, pageH / sh);
      drawW = sw * scale;
      drawH = sh * scale;
      drawX = (pageW - drawW) / 2;
      drawY = (pageH - drawH) / 2;
    } else {
      const base =
        options.fitPage === 'letter-fit'
          ? { w: 612, h: 792 }
          : { w: 595.28, h: 841.89 };
      pageW = isLandscape ? base.h : base.w;
      pageH = isLandscape ? base.w : base.h;
      const margin = 8;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const scale = Math.min(availW / sw, availH / sh);
      drawW = sw * scale;
      drawH = sh * scale;
      drawX = (pageW - drawW) / 2;
      drawY = (pageH - drawH) / 2;
    }

    const outPage = outDoc.addPage([pageW, pageH]);
    outPage.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  onProgress?.(94, 'Packaging perspective-corrected PDF...');
  const bytes = await outDoc.save({ useObjectStreams: false });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
  onProgress?.(100, 'Perspective Scan Complete');

  const outBase = options.outputName ? baseName(options.outputName) : baseName(pages[0].name);
  return {
    blob,
    bytes: safeBytes,
    fileName: `${outBase}_scanned.pdf`,
    pageCount: pages.length,
    processedPages: pages.length,
  };
}




