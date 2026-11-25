import { PDFDocument } from 'pdf-lib';
import * as mammoth from 'mammoth';
import { UploadedDocInfo } from '../types';
import { convertWordToPdf, convertTextToPdf } from './pdfToolkit';

function cloneArrayBuffer(buf: ArrayBuffer): ArrayBuffer {
  if (!buf || buf.byteLength === 0) {
    throw new Error('Document buffer is empty or detached. Please re-upload the file.');
  }
  return new Uint8Array(buf).slice().buffer;
}

export async function parseUploadedDocument(file: File): Promise<UploadedDocInfo> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const arrayBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;

  const baseInfo: UploadedDocInfo = {
    id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    extension,
  };

  try {
    if (extension === 'pdf') {
      const pdfDoc = await PDFDocument.load(cloneArrayBuffer(arrayBuffer), { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      const title = pdfDoc.getTitle();

      let renderedPagePreviews: string[] = [];
      let extractedText = '';
      try {
        const extracted = await renderPdfPagesAndExtractText(cloneArrayBuffer(arrayBuffer));
        renderedPagePreviews = extracted.pageImageUrls;
        extractedText = extracted.extractedText;
      } catch (e) {
        console.warn('Page preview extraction skipped:', e);
      }

      return {
        ...baseInfo,
        pageCount,
        extractedTitle: title || cleanFileName(file.name),
        extractedText: extractedText || undefined,
        pdfArrayBuffer: cloneArrayBuffer(arrayBuffer),
        renderedPagePreviews,
      };
    }

    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: cloneArrayBuffer(arrayBuffer) });
      const rawText = result.value || '';
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const wordCount = rawText.split(/\s+/).filter(Boolean).length;
      const sampleSnippet = lines.join(' ').replace(/\s+/g, ' ').slice(0, 4000);

      // Automatically convert .docx into a real paginated PDF buffer so downloads & previews include all pages!
      let pdfArrayBuffer: ArrayBuffer | undefined;
      let pageCount = Math.max(1, Math.ceil(wordCount / 400));
      let renderedPagePreviews: string[] = [];

      try {
        const converted = await convertWordToPdf(file, 'a4');
        pdfArrayBuffer = new Uint8Array(converted.bytes).slice().buffer;
        pageCount = converted.pageCount;
        renderedPagePreviews = await renderPdfPages(pdfArrayBuffer);
      } catch (convErr) {
        console.warn('Auto Word-to-PDF conversion notice (falling back to text summary):', convErr);
      }

      return {
        ...baseInfo,
        pageCount,
        wordCount,
        extractedTitle: firstLine.length < 90 && firstLine.length > 3 ? firstLine : cleanFileName(file.name),
        extractedText: sampleSnippet,
        pdfArrayBuffer,
        renderedPagePreviews,
        convertedFromSource: !!pdfArrayBuffer,
      };
    }

    if (['txt', 'md', 'rtf'].includes(extension)) {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const sampleSnippet = lines.join(' ').replace(/\s+/g, ' ').slice(0, 4000);

      let pdfArrayBuffer: ArrayBuffer | undefined;
      let pageCount = Math.max(1, Math.ceil(wordCount / 400));
      let renderedPagePreviews: string[] = [];

      try {
        const converted = await convertTextToPdf(text, file.name, 'a4');
        pdfArrayBuffer = new Uint8Array(converted.bytes).slice().buffer;
        pageCount = converted.pageCount;
        renderedPagePreviews = await renderPdfPages(pdfArrayBuffer);
      } catch (convErr) {
        console.warn('Auto Text-to-PDF conversion notice:', convErr);
      }

      return {
        ...baseInfo,
        pageCount,
        wordCount,
        extractedTitle: lines[0]?.slice(0, 80) || cleanFileName(file.name),
        extractedText: sampleSnippet,
        pdfArrayBuffer,
        renderedPagePreviews,
        convertedFromSource: !!pdfArrayBuffer,
      };
    }
  } catch (err) {
    console.warn('Could not parse document details, using defaults:', err);
  }

  return {
    ...baseInfo,
    extractedTitle: cleanFileName(file.name),
  };
}

export function cleanFileName(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

async function renderPdfPagesAndExtractText(
  arrayBuffer: ArrayBuffer,
  maxPages = 12
): Promise<{ pageImageUrls: string[]; extractedText: string }> {
  if (typeof window === 'undefined' || !arrayBuffer || arrayBuffer.byteLength === 0) {
    return { pageImageUrls: [], extractedText: '' };
  }

  if (!window.pdfjsLib) {
    let waited = 0;
    while (!window.pdfjsLib && waited < 10) {
      await new Promise((r) => setTimeout(r, 100));
      waited++;
    }
  }

  if (!window.pdfjsLib) {
    return { pageImageUrls: [], extractedText: '' };
  }

  try {
    try {
      if (window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    } catch {
      // ignore worker setup errors
    }

    const safeBuffer = cloneArrayBuffer(arrayBuffer);
    const loadingTask = window.pdfjsLib.getDocument({
      data: safeBuffer,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const totalPages = Math.min(pdf.numPages, maxPages);
    const pageImageUrls: string[] = [];
    const textChunks: string[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        if (pageNum <= 5 && textChunks.join(' ').length < 4000) {
          try {
            const textContent = await page.getTextContent();
            const pageStr = (textContent?.items || [])
              .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (pageStr) textChunks.push(pageStr);
          } catch {
            // ignore per-page text extraction errors
          }
        }

        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          pageImageUrls.push(canvas.toDataURL('image/jpeg', 0.85));
        }
      } catch (pageErr) {
        console.warn(`Failed rendering page ${pageNum}:`, pageErr);
      }
    }

    return {
      pageImageUrls,
      extractedText: textChunks.join(' ').slice(0, 4000),
    };
  } catch (err) {
    console.warn('PDF page rendering caught error (safe fallback):', err);
    return { pageImageUrls: [], extractedText: '' };
  }
}

/**
 * Render PDF pages onto canvas and return data URLs for multi-page print preview.
 */
export async function renderPdfPages(arrayBuffer: ArrayBuffer, maxPages = 12): Promise<string[]> {
  const result = await renderPdfPagesAndExtractText(arrayBuffer, maxPages);
  return result.pageImageUrls;
}
