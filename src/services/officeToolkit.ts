import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { ImageOutputFormat } from './imageToolkit';

export type PptToPdfLayout = 'slide-fit' | 'a4-landscape' | 'a4-portrait';
export type PptImageScale = 1 | 1.5 | 2;
export type ExcelPdfOrientation = 'landscape' | 'portrait';
export type PdfToExcelFormat = 'xlsx' | 'csv';

export interface PptRenderedSlide {
  slideNumber: number;
  title: string;
  notes: string;
  width: number;
  height: number;
  sizeBytes: number;
  fileName: string;
  dataUrl: string;
  blob: Blob;
}

export interface PptToImageResult {
  slides: PptRenderedSlide[];
  zipBlob: Blob | null;
  zipFileName: string;
  format: ImageOutputFormat;
}

export interface PptToPdfResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  slideCount: number;
  thumbnails: string[];
}

export interface ExcelWorkbookInspection {
  fileName: string;
  sheets: {
    name: string;
    rowCount: number;
    colCount: number;
    previewRows: string[][];
  }[];
}

export interface ExcelRenderedPage {
  pageNumber: number;
  sheetName: string;
  width: number;
  height: number;
  sizeBytes: number;
  fileName: string;
  dataUrl: string;
  blob: Blob;
}

export interface ExcelToImageResult {
  pages: ExcelRenderedPage[];
  zipBlob: Blob | null;
  zipFileName: string;
  format: ImageOutputFormat;
}

export interface ExcelToPdfResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  sheetCount: number;
  thumbnails: string[];
}

export interface PdfToExcelResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
  totalRows: number;
  format: PdfToExcelFormat;
  previewRows: string[][];
}

export interface PdfToPptResult {
  blob: Blob;
  fileName: string;
  slideCount: number;
  thumbnails: string[];
}

function getPdfJs(): any {
  if (typeof window === 'undefined' || !window.pdfjsLib) {
    throw new Error('PDF engine is still initializing. Please try again in a moment.');
  }
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return window.pdfjsLib;
}

function cleanBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'document';
}

function parseRangeIndices(expr: string | undefined, maxCount: number): number[] {
  const trimmed = (expr || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    return Array.from({ length: maxCount }, (_, i) => i + 1);
  }
  const result: number[] = [];
  const seen = new Set<number>();
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes('-')) {
      const [sStr, eStr] = part.split('-').map((v) => v.trim());
      const start = parseInt(sStr, 10);
      const end = parseInt(eStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start || end > maxCount) {
        throw new Error(`Invalid slide range "${part}". Choose values between 1 and ${maxCount}.`);
      }
      for (let i = start; i <= end; i++) {
        if (!seen.has(i)) {
          seen.add(i);
          result.push(i);
        }
      }
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < 1 || n > maxCount) {
        throw new Error(`Invalid slide number "${part}". Choose values between 1 and ${maxCount}.`);
      }
      if (!seen.has(n)) {
        seen.add(n);
        result.push(n);
      }
    }
  }
  return result.length > 0 ? result : Array.from({ length: maxCount }, (_, i) => i + 1);
}

async function canvasToOutputBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpg' | 'webp',
  quality: number
): Promise<{ blob: Blob; dataUrl: string }> {
  const mime =
    format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const q = format === 'png' ? undefined : Math.max(0.4, Math.min(1, quality));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), mime, q)
  );
  const dataUrl = canvas.toDataURL(mime, q);
  return { blob, dataUrl };
}

function getElementsByTagLocal(parent: Element | Document, localName: string): Element[] {
  const all = parent.getElementsByTagName('*');
  const out: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
}

function getDirectChildrenByLocal(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName === localName) out.push(parent.children[i]);
  }
  return out;
}

function getFirstDescendantByLocal(parent: Element | Document, localName: string): Element | null {
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i];
  }
  return null;
}

const DEFAULT_PPT_THEME: Record<string, string> = {
  dk1: '#111827',
  lt1: '#FFFFFF',
  dk2: '#1E293B',
  lt2: '#F8FAFC',
  tx1: '#111827',
  tx2: '#475569',
  bg1: '#FFFFFF',
  bg2: '#F1F5F9',
  accent1: '#2563EB',
  accent2: '#F59E0B',
  accent3: '#10B981',
  accent4: '#6366F1',
  accent5: '#EC4899',
  accent6: '#14B8A6',
};

function resolveColorNode(
  node: Element | null,
  themeMap: Record<string, string>
): string | null {
  if (!node) return null;
  const srgb = getFirstDescendantByLocal(node, 'srgbClr');
  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val && /^[0-9a-fA-F]{6}$/.test(val)) return `#${val}`;
  }
  const sysClr = getFirstDescendantByLocal(node, 'sysClr');
  if (sysClr) {
    const last = sysClr.getAttribute('lastClr');
    if (last && /^[0-9a-fA-F]{6}$/.test(last)) return `#${last}`;
  }
  const scheme = getFirstDescendantByLocal(node, 'schemeClr');
  if (scheme) {
    const val = scheme.getAttribute('val') || '';
    if (themeMap[val]) return themeMap[val];
  }
  return null;
}

function resolveZipRelativePath(baseFolder: string, target: string): string {
  if (!target) return '';
  if (target.startsWith('/')) return target.slice(1);
  const stack = baseFolder ? baseFolder.split('/').filter(Boolean) : [];
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') stack.pop();
    else stack.push(seg);
  }
  return stack.join('/');
}

async function loadZipRels(zip: JSZip, relsPath: string): Promise<Record<string, string>> {
  const file = zip.file(relsPath);
  if (!file) return {};
  const xmlText = await file.async('text');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const map: Record<string, string> = {};
  for (const rel of getElementsByTagLocal(doc, 'Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map[id] = target;
  }
  return map;
}

interface ParsedSlideRun {
  text: string;
  bold: boolean;
  italic: boolean;
  fontPt: number;
  color: string;
}

interface ParsedSlideParagraph {
  align: 'left' | 'center' | 'right';
  bullet: string;
  runs: ParsedSlideRun[];
}

interface ParsedSlideShape {
  kind: 'shape' | 'pic' | 'table';
  x: number; // 0..1
  y: number;
  w: number;
  h: number;
  fill?: string | null;
  stroke?: string | null;
  strokeWidthPt?: number;
  rounded?: boolean;
  paragraphs?: ParsedSlideParagraph[];
  imageDataUrl?: string;
  tableRows?: { text: string; fill?: string | null; isHeader?: boolean }[][];
}

interface ParsedSlide {
  slideNumber: number;
  bgFill: string;
  bgGradientTo?: string;
  bgImageDataUrl?: string;
  shapes: ParsedSlideShape[];
  title: string;
  notes: string;
}

interface ParsedPresentation {
  slideWidthEmu: number;
  slideHeightEmu: number;
  slides: ParsedSlide[];
}

async function readZipImageDataUrl(zip: JSZip, mediaPath: string): Promise<string | undefined> {
  const f = zip.file(mediaPath);
  if (!f) return undefined;
  const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
  if (ext === 'emf' || ext === 'wmf') return undefined;
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'gif'
      ? 'image/gif'
      : ext === 'svg'
      ? 'image/svg+xml'
      : 'image/png';
  const b64 = await f.async('base64');
  return `data:${mime};base64,${b64}`;
}

async function parsePptxDeck(
  file: File,
  onProgress?: (percent: number, status: string) => void
): Promise<ParsedPresentation> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.ppt') && !lower.endsWith('.pptx')) {
    throw new Error(
      'Legacy binary .ppt files require PowerPoint desktop encoding. Save the presentation as .pptx first and upload it here.'
    );
  }

  onProgress?.(6, 'Opening PowerPoint (.pptx) archive...');
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const presFile = zip.file('ppt/presentation.xml');
  if (!presFile) {
    throw new Error('Could not find ppt/presentation.xml. Make sure the file is a valid .pptx presentation.');
  }

  const presXml = await presFile.async('text');
  const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
  const sldSzEl = getFirstDescendantByLocal(presDoc, 'sldSz');
  const slideWidthEmu = Math.max(1000000, Number(sldSzEl?.getAttribute('cx') || 12192000));
  const slideHeightEmu = Math.max(1000000, Number(sldSzEl?.getAttribute('cy') || 6858000));

  // Parse theme colors
  const themeColors: Record<string, string> = { ...DEFAULT_PPT_THEME };
  const themeFile = zip.file('ppt/theme/theme1.xml');
  if (themeFile) {
    const themeXml = await themeFile.async('text');
    const themeDoc = new DOMParser().parseFromString(themeXml, 'application/xml');
    const clrScheme = getFirstDescendantByLocal(themeDoc, 'clrScheme');
    if (clrScheme) {
      for (let i = 0; i < clrScheme.children.length; i++) {
        const child = clrScheme.children[i];
        const colorHex = resolveColorNode(child, themeColors);
        if (colorHex) themeColors[child.localName] = colorHex;
      }
      themeColors.tx1 = themeColors.dk1;
      themeColors.tx2 = themeColors.dk2;
      themeColors.bg1 = themeColors.lt1;
      themeColors.bg2 = themeColors.lt2;
    }
  }

  // Determine ordered slide paths
  const presRels = await loadZipRels(zip, 'ppt/_rels/presentation.xml.rels');
  const orderedSlidePaths: string[] = [];
  for (const sldId of getElementsByTagLocal(presDoc, 'sldId')) {
    const rId =
      sldId.getAttribute('r:id') ||
      sldId.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
      '';
    const relTarget = presRels[rId];
    if (relTarget) {
      orderedSlidePaths.push(resolveZipRelativePath('ppt', relTarget));
    }
  }

  if (orderedSlidePaths.length === 0) {
    const fallbackSlides = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        return na - nb;
      });
    orderedSlidePaths.push(...fallbackSlides);
  }

  if (orderedSlidePaths.length === 0) {
    throw new Error('No slides were found inside this .pptx deck.');
  }

  const parseXfrm = (node: Element, parentTransform = { ox: 0, oy: 0, sx: 1, sy: 1 }) => {
    const spPr = getDirectChildrenByLocal(node, 'spPr')[0] || getFirstDescendantByLocal(node, 'spPr');
    const xfrm =
      getDirectChildrenByLocal(node, 'xfrm')[0] ||
      (spPr ? getDirectChildrenByLocal(spPr, 'xfrm')[0] : null) ||
      getFirstDescendantByLocal(node, 'xfrm');
    if (!xfrm) return null;
    const off = getDirectChildrenByLocal(xfrm, 'off')[0];
    const ext = getDirectChildrenByLocal(xfrm, 'ext')[0];
    if (!off || !ext) return null;
    const xEmu = Number(off.getAttribute('x') || 0);
    const yEmu = Number(off.getAttribute('y') || 0);
    const wEmu = Number(ext.getAttribute('cx') || 0);
    const hEmu = Number(ext.getAttribute('cy') || 0);
    return {
      x: parentTransform.ox + (xEmu / slideWidthEmu) * parentTransform.sx,
      y: parentTransform.oy + (yEmu / slideHeightEmu) * parentTransform.sy,
      w: (wEmu / slideWidthEmu) * parentTransform.sx,
      h: (hEmu / slideHeightEmu) * parentTransform.sy,
    };
  };

  const slides: ParsedSlide[] = [];

  for (let idx = 0; idx < orderedSlidePaths.length; idx++) {
    const slidePath = orderedSlidePaths[idx];
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    onProgress?.(
      10 + Math.round((idx / orderedSlidePaths.length) * 35),
      `Parsing slide ${idx + 1} of ${orderedSlidePaths.length}...`
    );

    const slideXml = await slideFile.async('text');
    const slideDoc = new DOMParser().parseFromString(slideXml, 'application/xml');
    const slideFolder = slidePath.substring(0, slidePath.lastIndexOf('/'));
    const slideFileName = slidePath.substring(slidePath.lastIndexOf('/') + 1);
    const slideRels = await loadZipRels(zip, `${slideFolder}/_rels/${slideFileName}.rels`);

    // Extract notes if linked
    let notes = '';
    for (const relTarget of Object.values(slideRels)) {
      if (relTarget.includes('notesSlide')) {
        const notesPath = resolveZipRelativePath(slideFolder, relTarget);
        const notesZipFile = zip.file(notesPath);
        if (notesZipFile) {
          const notesXml = await notesZipFile.async('text');
          const notesDoc = new DOMParser().parseFromString(notesXml, 'application/xml');
          const texts = getElementsByTagLocal(notesDoc, 't')
            .map((t) => t.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          // Ignore single numeric placeholder artifact from slide master notes number
          notes = texts.replace(/\s*\d+\s*$/, '').trim();
        }
      }
    }

    // Parse slide background
    let bgFill = '#FFFFFF';
    let bgGradientTo: string | undefined;
    let bgImageDataUrl: string | undefined;

    const bgEl = getFirstDescendantByLocal(slideDoc, 'bg');
    if (bgEl) {
      const solid = getFirstDescendantByLocal(bgEl, 'solidFill');
      const grad = getFirstDescendantByLocal(bgEl, 'gradFill');
      const blip = getFirstDescendantByLocal(bgEl, 'blip');
      if (blip) {
        const embedId =
          blip.getAttribute('r:embed') ||
          blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
          '';
        if (embedId && slideRels[embedId]) {
          const mediaPath = resolveZipRelativePath(slideFolder, slideRels[embedId]);
          bgImageDataUrl = await readZipImageDataUrl(zip, mediaPath);
        }
      } else if (grad) {
        const stops = getElementsByTagLocal(grad, 'gs');
        const c1 = stops[0] ? resolveColorNode(stops[0], themeColors) : null;
        const c2 = stops[stops.length - 1] ? resolveColorNode(stops[stops.length - 1], themeColors) : null;
        if (c1) bgFill = c1;
        if (c2 && c2 !== c1) bgGradientTo = c2;
      } else if (solid) {
        const c = resolveColorNode(solid, themeColors);
        if (c) bgFill = c;
      }
    }

    const shapes: ParsedSlideShape[] = [];
    let slideTitle = '';

    const walkSpTree = async (container: Element, parentTransform = { ox: 0, oy: 0, sx: 1, sy: 1 }) => {
      for (let c = 0; c < container.children.length; c++) {
        const child = container.children[c];
        const tag = child.localName;

        if (tag === 'grpSp') {
          const grpSpPr = getDirectChildrenByLocal(child, 'grpSpPr')[0];
          const grpXfrm = grpSpPr ? getDirectChildrenByLocal(grpSpPr, 'xfrm')[0] : null;
          if (grpXfrm) {
            const off = getDirectChildrenByLocal(grpXfrm, 'off')[0];
            const ext = getDirectChildrenByLocal(grpXfrm, 'ext')[0];
            const chOff = getDirectChildrenByLocal(grpXfrm, 'chOff')[0];
            const chExt = getDirectChildrenByLocal(grpXfrm, 'chExt')[0];
            const gx = Number(off?.getAttribute('x') || 0);
            const gy = Number(off?.getAttribute('y') || 0);
            const gw = Number(ext?.getAttribute('cx') || slideWidthEmu);
            const gh = Number(ext?.getAttribute('cy') || slideHeightEmu);
            const cx0 = Number(chOff?.getAttribute('x') || 0);
            const cy0 = Number(chOff?.getAttribute('y') || 0);
            const cw = Math.max(1, Number(chExt?.getAttribute('cx') || gw));
            const ch = Math.max(1, Number(chExt?.getAttribute('cy') || gh));

            await walkSpTree(child, {
              ox: parentTransform.ox + ((gx - cx0 * (gw / cw)) / slideWidthEmu) * parentTransform.sx,
              oy: parentTransform.oy + ((gy - cy0 * (gh / ch)) / slideHeightEmu) * parentTransform.sy,
              sx: parentTransform.sx * (gw / cw),
              sy: parentTransform.sy * (gh / ch),
            });
          } else {
            await walkSpTree(child, parentTransform);
          }
          continue;
        }

        if (tag === 'pic') {
          const rect = parseXfrm(child, parentTransform);
          const blip = getFirstDescendantByLocal(child, 'blip');
          const embedId =
            blip?.getAttribute('r:embed') ||
            blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
            '';
          if (rect && rect.w > 0 && rect.h > 0 && embedId && slideRels[embedId]) {
            const mediaPath = resolveZipRelativePath(slideFolder, slideRels[embedId]);
            const dataUrl = await readZipImageDataUrl(zip, mediaPath);
            if (dataUrl) {
              shapes.push({
                kind: 'pic',
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                imageDataUrl: dataUrl,
              });
            }
          }
          continue;
        }

        if (tag === 'graphicFrame') {
          const tbl = getFirstDescendantByLocal(child, 'tbl');
          const rect = parseXfrm(child, parentTransform);
          if (tbl && rect && rect.w > 0 && rect.h > 0) {
            const rows: { text: string; fill?: string | null; isHeader?: boolean }[][] = [];
            const trs = getDirectChildrenByLocal(tbl, 'tr');
            trs.forEach((tr, rIdx) => {
              const rowCells: { text: string; fill?: string | null; isHeader?: boolean }[] = [];
              for (const tc of getDirectChildrenByLocal(tr, 'tc')) {
                const cellText = getElementsByTagLocal(tc, 't')
                  .map((t) => t.textContent || '')
                  .join('')
                  .trim();
                const tcPr = getDirectChildrenByLocal(tc, 'tcPr')[0];
                const solid = tcPr ? getFirstDescendantByLocal(tcPr, 'solidFill') : null;
                const fill = resolveColorNode(solid, themeColors);
                rowCells.push({ text: cellText, fill, isHeader: rIdx === 0 });
              }
              if (rowCells.length > 0) rows.push(rowCells);
            });
            if (rows.length > 0) {
              shapes.push({
                kind: 'table',
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                tableRows: rows,
              });
            }
          }
          continue;
        }

        if (tag === 'sp' || tag === 'cxnSp') {
          const rect = parseXfrm(child, parentTransform);
          if (!rect || (rect.w <= 0 && rect.h <= 0)) continue;

          const spPr = getDirectChildrenByLocal(child, 'spPr')[0];
          const prstGeom = spPr ? getFirstDescendantByLocal(spPr, 'prstGeom') : null;
          const rounded = prstGeom?.getAttribute('prst') === 'roundRect';

          let fill: string | null = null;
          if (spPr) {
            const noFill = getDirectChildrenByLocal(spPr, 'noFill')[0];
            if (!noFill) {
              const solid = getDirectChildrenByLocal(spPr, 'solidFill')[0];
              const grad = getDirectChildrenByLocal(spPr, 'gradFill')[0];
              if (solid) fill = resolveColorNode(solid, themeColors);
              else if (grad) {
                const gs = getFirstDescendantByLocal(grad, 'gs');
                if (gs) fill = resolveColorNode(gs, themeColors);
              }
            }
          }

          let stroke: string | null = null;
          let strokeWidthPt = 1;
          const ln = spPr ? getDirectChildrenByLocal(spPr, 'ln')[0] : null;
          if (ln && !getDirectChildrenByLocal(ln, 'noFill')[0]) {
            const lnSolid = getDirectChildrenByLocal(ln, 'solidFill')[0];
            stroke = resolveColorNode(lnSolid || ln, themeColors);
            const wAttr = Number(ln.getAttribute('w') || 12700);
            strokeWidthPt = Math.max(0.75, wAttr / 12700);
          }

          const nvSpPr = getDirectChildrenByLocal(child, 'nvSpPr')[0];
          const ph = nvSpPr ? getFirstDescendantByLocal(nvSpPr, 'ph') : null;
          const phType = ph?.getAttribute('type') || '';
          const isTitlePh = phType === 'title' || phType === 'ctrTitle';
          const defaultFontPt = isTitlePh ? 34 : phType === 'subTitle' ? 20 : 16;

          const txBody = getDirectChildrenByLocal(child, 'txBody')[0];
          const paragraphs: ParsedSlideParagraph[] = [];

          if (txBody) {
            for (const pNode of getDirectChildrenByLocal(txBody, 'p')) {
              const pPr = getDirectChildrenByLocal(pNode, 'pPr')[0];
              const algnAttr = pPr?.getAttribute('algn') || (isTitlePh || phType === 'ctrTitle' ? 'ctr' : 'l');
              const align: 'left' | 'center' | 'right' =
                algnAttr === 'ctr' ? 'center' : algnAttr === 'r' ? 'right' : 'left';
              const buChar = pPr ? getFirstDescendantByLocal(pPr, 'buChar')?.getAttribute('char') : '';
              const buNone = pPr ? getFirstDescendantByLocal(pPr, 'buNone') : null;
              const buAuto = pPr ? getFirstDescendantByLocal(pPr, 'buAutoNum') : null;
              const bullet = buNone
                ? ''
                : buChar
                ? `${buChar} `
                : buAuto
                ? '• '
                : '';

              const runs: ParsedSlideRun[] = [];
              for (const rNode of getDirectChildrenByLocal(pNode, 'r')) {
                const tEl = getFirstDescendantByLocal(rNode, 't');
                const txt = tEl?.textContent || '';
                if (!txt) continue;
                const rPr = getDirectChildrenByLocal(rNode, 'rPr')[0];
                const szAttr = Number(rPr?.getAttribute('sz') || 0);
                const fontPt = szAttr > 0 ? szAttr / 100 : defaultFontPt;
                const bold = rPr?.getAttribute('b') === '1' || isTitlePh;
                const italic = rPr?.getAttribute('i') === '1';
                const rSolid = rPr ? getFirstDescendantByLocal(rPr, 'solidFill') : null;
                let color = resolveColorNode(rSolid, themeColors);
                if (!color) {
                  // Auto-contrast against dark shape fill or dark slide bg
                  const bgRef = fill || bgFill;
                  color = isDarkHex(bgRef) ? '#F8FAFC' : themeColors.dk1 || '#111827';
                }
                runs.push({ text: txt, bold, italic, fontPt, color });
              }

              if (runs.length > 0) {
                paragraphs.push({ align, bullet, runs });
                if (isTitlePh && !slideTitle) {
                  slideTitle = runs.map((r) => r.text).join('').trim();
                }
              }
            }
          }

          if (fill || stroke || paragraphs.length > 0) {
            shapes.push({
              kind: 'shape',
              x: rect.x,
              y: rect.y,
              w: Math.max(0.01, rect.w),
              h: Math.max(0.01, rect.h),
              fill,
              stroke,
              strokeWidthPt,
              rounded,
              paragraphs,
            });
          }
        }
      }
    };

    const spTree = getFirstDescendantByLocal(slideDoc, 'spTree');
    if (spTree) {
      await walkSpTree(spTree);
    }

    if (!slideTitle) {
      for (const sh of shapes) {
        const firstText = sh.paragraphs?.[0]?.runs.map((r) => r.text).join('').trim();
        if (firstText) {
          slideTitle = firstText.slice(0, 72);
          break;
        }
      }
    }

    slides.push({
      slideNumber: idx + 1,
      bgFill,
      bgGradientTo,
      bgImageDataUrl,
      shapes,
      title: slideTitle || `Slide ${idx + 1}`,
      notes,
    });
  }

  return { slideWidthEmu, slideHeightEmu, slides };
}

function isDarkHex(hex: string): boolean {
  const m = hex.replace('#', '');
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 130;
}

async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

async function renderParsedSlideToCanvas(
  slide: ParsedSlide,
  deck: ParsedPresentation,
  targetWidthPx: number
): Promise<HTMLCanvasElement> {
  const aspect = deck.slideHeightEmu / deck.slideWidthEmu;
  const w = Math.max(640, Math.round(targetWidthPx));
  const h = Math.max(400, Math.round(w * aspect));
  // Reference height of standard PowerPoint slide in points (7.5 in * 72 = 540 pt)
  const ptScale = h / 540;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background fill / gradient / image
  if (slide.bgGradientTo) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, slide.bgFill);
    grad.addColorStop(1, slide.bgGradientTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = slide.bgFill || '#FFFFFF';
  }
  ctx.fillRect(0, 0, w, h);

  if (slide.bgImageDataUrl) {
    const bgImg = await loadImageElement(slide.bgImageDataUrl);
    if (bgImg) {
      const imgScale = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
      const dw = bgImg.naturalWidth * imgScale;
      const dh = bgImg.naturalHeight * imgScale;
      ctx.drawImage(bgImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
  }

  for (const sh of slide.shapes) {
    const sx = sh.x * w;
    const sy = sh.y * h;
    const sw = sh.w * w;
    const shH = sh.h * h;

    if (sh.kind === 'pic' && sh.imageDataUrl) {
      const pic = await loadImageElement(sh.imageDataUrl);
      if (pic) {
        ctx.drawImage(pic, sx, sy, sw, shH);
      }
      continue;
    }

    if (sh.kind === 'table' && sh.tableRows && sh.tableRows.length > 0) {
      const rows = sh.tableRows;
      const colCount = Math.max(...rows.map((r) => r.length));
      const rowH = shH / rows.length;
      const colW = sw / colCount;
      const tblFontPx = Math.max(10, Math.min(16 * ptScale, rowH * 0.42));

      rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          const cx = sx + cIdx * colW;
          const cy = sy + rIdx * rowH;
          ctx.fillStyle =
            cell.fill || (rIdx === 0 ? '#1E293B' : rIdx % 2 === 1 ? '#FFFFFF' : '#F8FAFC');
          ctx.fillRect(cx, cy, colW, rowH);
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = Math.max(1, ptScale * 0.8);
          ctx.strokeRect(cx, cy, colW, rowH);

          ctx.fillStyle =
            rIdx === 0 && !cell.fill
              ? '#FFFFFF'
              : cell.fill && isDarkHex(cell.fill)
              ? '#FFFFFF'
              : '#0F172A';
          ctx.font = `${rIdx === 0 ? 'bold' : 'normal'} ${tblFontPx}px system-ui, -apple-system, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';

          ctx.save();
          ctx.beginPath();
          ctx.rect(cx + 4, cy + 2, colW - 8, rowH - 4);
          ctx.clip();
          ctx.fillText(cell.text, cx + 8 * ptScale, cy + rowH / 2);
          ctx.restore();
        });
      });
      continue;
    }

    // Shape box fill & stroke
    if (sh.fill || sh.stroke) {
      const rad = sh.rounded ? Math.min(sw, shH) * 0.12 : 0;
      if (rad > 0) {
        drawRoundedRectPath(ctx, sx, sy, sw, shH, rad);
      } else {
        ctx.beginPath();
        ctx.rect(sx, sy, sw, shH);
      }
      if (sh.fill) {
        ctx.fillStyle = sh.fill;
        ctx.fill();
      }
      if (sh.stroke) {
        ctx.strokeStyle = sh.stroke;
        ctx.lineWidth = Math.max(1, (sh.strokeWidthPt || 1) * ptScale);
        ctx.stroke();
      }
    }

    // Text paragraphs inside shape
    if (sh.paragraphs && sh.paragraphs.length > 0) {
      const padX = Math.max(6, 10 * ptScale);
      const padY = Math.max(4, 8 * ptScale);
      const availW = Math.max(40, sw - padX * 2);
      let cursorY = sy + padY;

      for (const para of sh.paragraphs) {
        const firstRun = para.runs[0];
        const fontSizePx = Math.max(9, (firstRun?.fontPt || 16) * ptScale);
        const lineHeight = fontSizePx * 1.32;
        const fullText = `${para.bullet}${para.runs.map((r) => r.text).join('')}`;
        const weight = firstRun?.bold ? '700' : '400';
        const style = firstRun?.italic ? 'italic ' : '';
        ctx.font = `${style}${weight} ${fontSizePx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillStyle = firstRun?.color || '#111827';
        ctx.textBaseline = 'top';

        // Word-wrap paragraph cleanly inside box bounds
        const words = fullText.split(/\s+/).filter(Boolean);
        const wrappedLines: string[] = [];
        let cur = '';
        for (const wd of words) {
          const cand = cur ? `${cur} ${wd}` : wd;
          if (ctx.measureText(cand).width > availW && cur) {
            wrappedLines.push(cur);
            cur = wd;
          } else {
            cur = cand;
          }
        }
        if (cur) wrappedLines.push(cur);

        for (const line of wrappedLines) {
          if (cursorY + lineHeight > sy + shH + 16) break;
          let drawX = sx + padX;
          ctx.textAlign = 'left';
          if (para.align === 'center') {
            drawX = sx + sw / 2;
            ctx.textAlign = 'center';
          } else if (para.align === 'right') {
            drawX = sx + sw - padX;
            ctx.textAlign = 'right';
          }
          ctx.fillText(line, drawX, cursorY);
          cursorY += lineHeight;
        }
        cursorY += fontSizePx * 0.28;
      }
    }
  }

  return canvas;
}

/**
 * Office Tool 1: PPTX -> Images (PNG / JPG / WebP + ZIP archive)
 */
export async function convertPptToImages(
  file: File,
  options: {
    format?: ImageOutputFormat;
    scale?: PptImageScale;
    quality?: number;
    slideRangeExpr?: string;
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<PptToImageResult> {
  const fmtRaw = options.format || 'png';
  const format: 'png' | 'jpg' | 'webp' =
    fmtRaw === 'jpg' || fmtRaw === 'webp' ? fmtRaw : 'png';
  const scale = options.scale || 1.5;
  const targetWidthPx = Math.round(1280 * scale);
  const quality = options.quality ?? 0.92;

  const deck = await parsePptxDeck(file, onProgress);
  const selectedNums = parseRangeIndices(options.slideRangeExpr, deck.slides.length);
  const base = cleanBaseName(file.name);
  const rendered: PptRenderedSlide[] = [];

  for (let i = 0; i < selectedNums.length; i++) {
    const slideNum = selectedNums[i];
    const slide = deck.slides[slideNum - 1];
    onProgress?.(
      45 + Math.round(((i + 1) / selectedNums.length) * 45),
      `Rendering slide ${slideNum} of ${deck.slides.length}...`
    );

    const canvas = await renderParsedSlideToCanvas(slide, deck, targetWidthPx);
    const { blob, dataUrl } = await canvasToOutputBlob(canvas, format, quality);
    rendered.push({
      slideNumber: slideNum,
      title: slide.title,
      notes: slide.notes,
      width: canvas.width,
      height: canvas.height,
      sizeBytes: blob.size,
      fileName: `${base}_slide_${String(slideNum).padStart(2, '0')}.${format}`,
      dataUrl,
      blob,
    });
  }

  let zipBlob: Blob | null = null;
  if (rendered.length > 1) {
    onProgress?.(94, 'Packaging slides into ZIP archive...');
    const zip = new JSZip();
    for (const sl of rendered) {
      zip.file(sl.fileName, sl.blob);
    }
    zipBlob = await zip.generateAsync({ type: 'blob' });
  }

  onProgress?.(100, 'PPT slides exported');
  return {
    slides: rendered,
    zipBlob,
    zipFileName: `${base}_slides.zip`,
    format,
  };
}

/**
 * Office Tool 2: PPTX -> PDF
 */
export async function convertPptToPdf(
  file: File,
  options: {
    layout?: PptToPdfLayout;
    includeNotes?: boolean;
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<PptToPdfResult> {
  const layout = options.layout || 'slide-fit';
  const includeNotes = Boolean(options.includeNotes);
  const deck = await parsePptxDeck(file, onProgress);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink Office Utility');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const aspect = deck.slideHeightEmu / deck.slideWidthEmu;
  const thumbnails: string[] = [];

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    onProgress?.(
      45 + Math.round(((i + 1) / deck.slides.length) * 45),
      `Converting slide ${i + 1} of ${deck.slides.length} to PDF...`
    );

    const canvas = await renderParsedSlideToCanvas(slide, deck, 1600);
    const { blob, dataUrl } = await canvasToOutputBlob(canvas, 'jpg', 0.92);
    if (thumbnails.length < 12) thumbnails.push(dataUrl);
    const imgBytes = new Uint8Array(await blob.arrayBuffer());
    const embedded = await pdfDoc.embedJpg(imgBytes);

    if (layout === 'slide-fit') {
      const pageW = 960;
      const pageH = Math.round(pageW * aspect);
      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
    } else if (layout === 'a4-landscape') {
      const pageW = 841.89;
      const pageH = 595.28;
      const page = pdfDoc.addPage([pageW, pageH]);
      const margin = 24;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const drawScale = Math.min(availW / canvas.width, availH / canvas.height);
      const dw = canvas.width * drawScale;
      const dh = canvas.height * drawScale;
      page.drawImage(embedded, {
        x: (pageW - dw) / 2,
        y: (pageH - dh) / 2,
        width: dw,
        height: dh,
      });
    } else {
      // a4-portrait (optional notes below slide)
      const pageW = 595.28;
      const pageH = 841.89;
      const page = pdfDoc.addPage([pageW, pageH]);
      const margin = 36;
      const availW = pageW - margin * 2;
      const dh = availW * aspect;
      const slideY = includeNotes ? pageH - margin - dh - 28 : (pageH - dh) / 2;

      page.drawText(`Slide ${slide.slideNumber} of ${deck.slides.length}  ·  ${slide.title.slice(0, 64)}`, {
        x: margin,
        y: pageH - margin - 12,
        size: 10,
        font: fontBold,
        color: rgb(0.25, 0.28, 0.35),
      });

      page.drawRectangle({
        x: margin - 1,
        y: slideY - 1,
        width: availW + 2,
        height: dh + 2,
        borderColor: rgb(0.84, 0.86, 0.9),
        borderWidth: 1,
      });
      page.drawImage(embedded, { x: margin, y: slideY, width: availW, height: dh });

      if (includeNotes) {
        let noteY = slideY - 26;
        page.drawText('Speaker Notes', {
          x: margin,
          y: noteY,
          size: 10,
          font: fontBold,
          color: rgb(0.15, 0.18, 0.25),
        });
        noteY -= 16;
        const cleanNotes = (slide.notes || 'No speaker notes for this slide.')
          .replace(/[^\x20-\x7E]/g, ' ')
          .trim();
        const words = cleanNotes.split(/\s+/);
        let line = '';
        for (const wd of words) {
          const cand = line ? `${line} ${wd}` : wd;
          if (font.widthOfTextAtSize(cand, 10) > availW && line) {
            if (noteY < 42) break;
            page.drawText(line, { x: margin, y: noteY, size: 10, font, color: rgb(0.3, 0.33, 0.4) });
            noteY -= 15;
            line = wd;
          } else {
            line = cand;
          }
        }
        if (line && noteY >= 42) {
          page.drawText(line, { x: margin, y: noteY, size: 10, font, color: rgb(0.3, 0.33, 0.4) });
        }
      }
    }
  }

  onProgress?.(94, 'Finalizing PDF file...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
  onProgress?.(100, 'PowerPoint converted to PDF');

  return {
    blob,
    bytes,
    fileName: `${cleanBaseName(file.name)}.pdf`,
    slideCount: deck.slides.length,
    thumbnails,
  };
}

/**
 * Read workbook metadata & sheet preview rows
 */
export async function inspectExcelWorkbook(file: File): Promise<ExcelWorkbookInspection> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
    const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
    return {
      name,
      rowCount: rows.length,
      colCount,
      previewRows: rows.slice(0, 6).map((r) => r.slice(0, 8).map((c) => String(c ?? ''))),
    };
  });
  return { fileName: file.name, sheets };
}

interface ExcelCanvasRenderOptions {
  sheetNames?: string[];
  widthPx: number;
  rowsPerPage?: number;
}

function renderExcelSheetCanvases(
  wb: XLSX.WorkBook,
  sourceFileName: string,
  opts: ExcelCanvasRenderOptions
): { sheetName: string; canvas: HTMLCanvasElement }[] {
  const targetSheets =
    opts.sheetNames && opts.sheetNames.length > 0
      ? opts.sheetNames.filter((n) => wb.SheetNames.includes(n))
      : wb.SheetNames;

  const canvases: { sheetName: string; canvas: HTMLCanvasElement }[] = [];
  const rowsPerPage = opts.rowsPerPage || 34;

  for (const sheetName of targetSheets) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as any[][];

    // Trim completely empty trailing rows
    let lastNonEmpty = rawRows.length - 1;
    while (lastNonEmpty > 0 && rawRows[lastNonEmpty].every((c) => String(c ?? '').trim() === '')) {
      lastNonEmpty--;
    }
    const rows = rawRows.slice(0, lastNonEmpty + 1).map((r) => r.map((c) => String(c ?? '')));
    const colCount = Math.max(1, Math.min(18, rows.reduce((m, r) => Math.max(m, r.length), 1)));
    const safeRows = rows.length > 0 ? rows : [['(Empty worksheet)']];

    const headerRow = safeRows[0];
    const bodyRows = safeRows.slice(1);
    const totalChunks = Math.max(1, Math.ceil(bodyRows.length / (rowsPerPage - 1)));

    // Compute proportional column weights from sample values
    const weights = Array.from({ length: colCount }, (_, cIdx) => {
      let maxLen = Math.max(4, String(headerRow[cIdx] || '').length);
      for (let r = 0; r < Math.min(bodyRows.length, 60); r++) {
        maxLen = Math.max(maxLen, String(bodyRows[r]?.[cIdx] || '').length);
      }
      return Math.min(34, Math.max(6, maxLen));
    });
    const weightSum = weights.reduce((a, b) => a + b, 0);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const sliceBody = bodyRows.slice(
        chunkIdx * (rowsPerPage - 1),
        (chunkIdx + 1) * (rowsPerPage - 1)
      );
      const pageRows = [headerRow, ...sliceBody];

      const canvasW = opts.widthPx;
      const padX = Math.round(canvasW * 0.032);
      const topBannerH = Math.round(canvasW * 0.048);
      const rowH = Math.max(28, Math.round(canvasW * 0.022));
      const footerH = Math.round(canvasW * 0.026);
      const tableW = canvasW - padX * 2;
      const canvasH = Math.max(
        Math.round(canvasW * 0.56),
        topBannerH + pageRows.length * rowH + footerH + padX
      );

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Top clean document banner
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(padX, Math.round(padX * 0.55), tableW, topBannerH - Math.round(padX * 0.35));

      ctx.fillStyle = '#FACC15';
      ctx.fillRect(padX, Math.round(padX * 0.55), 6, topBannerH - Math.round(padX * 0.35));

      const titleSize = Math.max(14, Math.round(rowH * 0.48));
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${titleSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${sourceFileName}  ·  ${sheetName}`,
        padX + 18,
        Math.round(padX * 0.55) + (topBannerH - Math.round(padX * 0.35)) / 2
      );

      ctx.fillStyle = '#94A3B8';
      ctx.font = `600 ${Math.round(titleSize * 0.78)}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `Sheet Page ${chunkIdx + 1}/${totalChunks}`,
        padX + tableW - 14,
        Math.round(padX * 0.55) + (topBannerH - Math.round(padX * 0.35)) / 2
      );

      const tableStartY = Math.round(padX * 0.55) + (topBannerH - Math.round(padX * 0.35)) + 10;
      const cellFontSize = Math.max(10, Math.min(Math.round(rowH * 0.42), Math.round(tableW / (weightSum * 0.75))));

      pageRows.forEach((row, rIdx) => {
        const ry = tableStartY + rIdx * rowH;
        const isHeader = rIdx === 0;
        let cx = padX;

        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const cw = (weights[cIdx] / weightSum) * tableW;
          ctx.fillStyle = isHeader
            ? '#E2E8F0'
            : rIdx % 2 === 1
            ? '#FFFFFF'
            : '#F8FAFC';
          ctx.fillRect(cx, ry, cw, rowH);

          ctx.strokeStyle = isHeader ? '#94A3B8' : '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, ry, cw, rowH);

          const val = String(row[cIdx] ?? '').trim();
          if (val) {
            const isNumeric = !isHeader && /^[$€£¥+-]?[\d,]+(\.\d+)?%?$/.test(val);
            ctx.fillStyle = isHeader ? '#0F172A' : '#1E293B';
            ctx.font = `${isHeader ? '700' : '400'} ${cellFontSize}px ${
              isNumeric ? 'ui-monospace, SFMono-Regular, monospace' : 'system-ui, -apple-system, sans-serif'
            }`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = isNumeric ? 'right' : 'left';

            ctx.save();
            ctx.beginPath();
            ctx.rect(cx + 4, ry + 2, Math.max(4, cw - 8), rowH - 4);
            ctx.clip();
            const textX = isNumeric ? cx + cw - 8 : cx + 8;
            ctx.fillText(val, textX, ry + rowH / 2);
            ctx.restore();
          }

          cx += cw;
        }
      });

      canvases.push({ sheetName, canvas });
    }
  }

  return canvases;
}

/**
 * Office Tool 3: Excel / CSV (.xlsx, .xls, .csv, .ods) -> Images (PNG / JPG / WebP + ZIP)
 */
export async function convertExcelToImages(
  file: File,
  options: {
    sheetNames?: string[];
    format?: ImageOutputFormat;
    scale?: 1 | 1.5 | 2;
    quality?: number;
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<ExcelToImageResult> {
  const fmtRaw = options.format || 'png';
  const format: 'png' | 'jpg' | 'webp' =
    fmtRaw === 'jpg' || fmtRaw === 'webp' ? fmtRaw : 'png';
  const widthPx = Math.round(1440 * (options.scale || 1.5));
  const quality = options.quality ?? 0.92;

  onProgress?.(15, 'Reading workbook & formatting worksheets...');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  if (wb.SheetNames.length === 0) {
    throw new Error('This workbook has no readable sheets.');
  }

  onProgress?.(42, 'Rendering spreadsheet gridlines & cells...');
  const sheetCanvases = renderExcelSheetCanvases(wb, file.name, {
    sheetNames: options.sheetNames,
    widthPx,
    rowsPerPage: 34,
  });

  const base = cleanBaseName(file.name);
  const pages: ExcelRenderedPage[] = [];

  for (let i = 0; i < sheetCanvases.length; i++) {
    const item = sheetCanvases[i];
    onProgress?.(
      50 + Math.round(((i + 1) / sheetCanvases.length) * 40),
      `Encoding ${item.sheetName} (${i + 1}/${sheetCanvases.length})...`
    );
    const { blob, dataUrl } = await canvasToOutputBlob(item.canvas, format, quality);
    pages.push({
      pageNumber: i + 1,
      sheetName: item.sheetName,
      width: item.canvas.width,
      height: item.canvas.height,
      sizeBytes: blob.size,
      fileName: `${base}_${cleanBaseName(item.sheetName)}_p${i + 1}.${format}`,
      dataUrl,
      blob,
    });
  }

  let zipBlob: Blob | null = null;
  if (pages.length > 1) {
    onProgress?.(94, 'Archiving spreadsheet images into ZIP...');
    const zip = new JSZip();
    for (const p of pages) {
      zip.file(p.fileName, p.blob);
    }
    zipBlob = await zip.generateAsync({ type: 'blob' });
  }

  onProgress?.(100, 'Excel sheets converted to images');
  return {
    pages,
    zipBlob,
    zipFileName: `${base}_sheets.zip`,
    format,
  };
}

/**
 * Office Tool 4: Excel / CSV (.xlsx, .xls, .csv, .ods) -> PDF
 */
export async function convertExcelToPdf(
  file: File,
  options: {
    sheetNames?: string[];
    orientation?: ExcelPdfOrientation;
    paperSize?: 'a4' | 'letter';
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<ExcelToPdfResult> {
  const orientation = options.orientation || 'landscape';
  const paper = options.paperSize || 'a4';

  onProgress?.(16, 'Parsing spreadsheet workbook...');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  if (wb.SheetNames.length === 0) {
    throw new Error('This spreadsheet file contains no worksheets.');
  }

  const widthPx = orientation === 'landscape' ? 1920 : 1400;
  const rowsPerPage = orientation === 'landscape' ? 32 : 44;

  onProgress?.(45, 'Composing formatted spreadsheet pages...');
  const renderedSheets = renderExcelSheetCanvases(wb, file.name, {
    sheetNames: options.sheetNames,
    widthPx,
    rowsPerPage,
  });

  const baseDims = paper === 'letter' ? { s: 612, l: 792 } : { s: 595.28, l: 841.89 };
  const pageW = orientation === 'landscape' ? baseDims.l : baseDims.s;
  const pageH = orientation === 'landscape' ? baseDims.s : baseDims.l;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink Office Utility');
  const thumbnails: string[] = [];

  for (let i = 0; i < renderedSheets.length; i++) {
    const item = renderedSheets[i];
    onProgress?.(
      55 + Math.round(((i + 1) / renderedSheets.length) * 35),
      `Embedding ${item.sheetName} page ${i + 1}...`
    );
    const { blob, dataUrl } = await canvasToOutputBlob(item.canvas, 'png', 0.95);
    if (thumbnails.length < 10) thumbnails.push(dataUrl);

    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const embedded = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([pageW, pageH]);

    const margin = 20;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;
    const scale = Math.min(availW / item.canvas.width, availH / item.canvas.height);
    const dw = item.canvas.width * scale;
    const dh = item.canvas.height * scale;

    page.drawImage(embedded, {
      x: (pageW - dw) / 2,
      y: pageH - margin - dh,
      width: dw,
      height: dh,
    });
  }

  onProgress?.(94, 'Packaging Excel PDF...');
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
  const usedSheetCount = new Set(renderedSheets.map((s) => s.sheetName)).size;

  onProgress?.(100, 'Spreadsheet converted to PDF');
  return {
    blob,
    bytes,
    fileName: `${cleanBaseName(file.name)}.pdf`,
    pageCount: renderedSheets.length,
    sheetCount: usedSheetCount,
    thumbnails,
  };
}

/**
 * Office Tool 5: PDF -> Excel (.xlsx) or CSV (.csv) via spatial column clustering
 */
export async function convertPdfToExcel(
  file: File,
  options: {
    format?: PdfToExcelFormat;
    singleCombinedSheet?: boolean;
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<PdfToExcelResult> {
  const format = options.format || 'xlsx';
  const singleSheet = Boolean(options.singleCombinedSheet);
  const pdfjsLib = getPdfJs();

  onProgress?.(10, 'Reading PDF text coordinates...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const pageCount: number = pdf.numPages;

  const wb = XLSX.utils.book_new();
  const combinedRows: string[][] = [];
  let totalRows = 0;

  for (let p = 1; p <= pageCount; p++) {
    onProgress?.(
      14 + Math.round((p / pageCount) * 72),
      `Extracting table columns from page ${p} of ${pageCount}...`
    );
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    interface CellToken {
      x: number;
      y: number;
      text: string;
    }
    const rowBuckets: { y: number; tokens: CellToken[] }[] = [];

    for (const raw of content.items as any[]) {
      const text = String(raw.str || '').trim();
      if (!text) continue;
      const x = Math.round(raw.transform?.[4] ?? 0);
      const y = Math.round(raw.transform?.[5] ?? 0);

      const match = rowBuckets.find((b) => Math.abs(b.y - y) <= 4);
      if (match) {
        match.tokens.push({ x, y, text });
      } else {
        rowBuckets.push({ y, tokens: [{ x, y, text }] });
      }
    }

    rowBuckets.sort((a, b) => b.y - a.y);

    // Discover dominant column X anchors across all rows on this page
    const allX: number[] = [];
    for (const row of rowBuckets) {
      row.tokens.sort((a, b) => a.x - b.x);
      for (const tok of row.tokens) {
        allX.push(tok.x);
      }
    }
    allX.sort((a, b) => a - b);

    const colAnchors: number[] = [];
    for (const xVal of allX) {
      if (colAnchors.length === 0 || xVal - colAnchors[colAnchors.length - 1] > 28) {
        colAnchors.push(xVal);
      }
    }

    const pageMatrix: string[][] = [];
    for (const row of rowBuckets) {
      const cells = Array.from({ length: Math.max(1, colAnchors.length) }, () => '');
      for (const tok of row.tokens) {
        // Assign token to nearest column anchor within tolerance, else last anchor before it
        let bestIdx = 0;
        let bestDist = Infinity;
        colAnchors.forEach((anchor, idx) => {
          const d = Math.abs(tok.x - anchor);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${tok.text}` : tok.text;
      }
      if (cells.some((c) => c.length > 0)) {
        pageMatrix.push(cells);
      }
    }

    const finalPageRows = pageMatrix.length > 0 ? pageMatrix : [['(No selectable text found on this page)']];
    totalRows += finalPageRows.length;

    if (singleSheet || format === 'csv') {
      if (pageCount > 1) combinedRows.push([`--- Page ${p} ---`]);
      combinedRows.push(...finalPageRows);
    } else {
      const ws = XLSX.utils.aoa_to_sheet(finalPageRows);
      const colWidths = Array.from(
        { length: Math.max(...finalPageRows.map((r) => r.length), 1) },
        (_, cIdx) => {
          const maxLen = finalPageRows.reduce(
            (m, r) => Math.max(m, String(r[cIdx] || '').length),
            8
          );
          return { wch: Math.min(48, maxLen + 3) };
        }
      );
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, `Page_${p}`);
    }
  }

  let outBlob: Blob;
  const previewSource =
    singleSheet || format === 'csv'
      ? combinedRows
      : (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][]);

  if (format === 'csv') {
    const csvWs = XLSX.utils.aoa_to_sheet(combinedRows);
    const csvString = XLSX.utils.sheet_to_csv(csvWs);
    outBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  } else {
    if (singleSheet) {
      const ws = XLSX.utils.aoa_to_sheet(combinedRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Extracted_Data');
    }
    const outArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    outBlob = new Blob([outArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  onProgress?.(100, 'PDF data exported cleanly');
  return {
    blob: outBlob,
    fileName: `${cleanBaseName(file.name)}.${format}`,
    pageCount,
    totalRows,
    format,
    previewRows: previewSource.slice(0, 10),
  };
}

/**
 * Office Tool 6: PDF -> PowerPoint (.pptx) clean slide deck builder
 */
export async function convertPdfToPpt(
  file: File,
  options: {
    scale?: 1.5 | 2;
  } = {},
  onProgress?: (percent: number, status: string) => void
): Promise<PdfToPptResult> {
  const pdfjsLib = getPdfJs();
  const renderScale = options.scale || 1.5;

  onProgress?.(8, 'Reading PDF pages...');
  const buffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const numPages: number = pdf.numPages;

  const zip = new JSZip();
  const thumbnails: string[] = [];

  // Render first page to compute canonical slide EMU geometry (1 inch = 914400 EMU, base 10in wide)
  const firstPage = await pdf.getPage(1);
  const vp1 = firstPage.getViewport({ scale: 1 });
  const slideCx = 12192000; // 13.33 in wide
  const slideCy = Math.max(4572000, Math.round(slideCx * (vp1.height / vp1.width)));

  const slideRelEntries: string[] = [];
  const sldIdEntries: string[] = [];
  const slideContentOverrides: string[] = [];

  for (let p = 1; p <= numPages; p++) {
    onProgress?.(
      14 + Math.round((p / numPages) * 70),
      `Converting PDF page ${p} of ${numPages} into slide...`
    );

    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const { blob, dataUrl } = await canvasToOutputBlob(canvas, 'png', 0.94);
    if (thumbnails.length < 12) thumbnails.push(dataUrl);

    const imgBytes = new Uint8Array(await blob.arrayBuffer());
    zip.file(`ppt/media/slide_img_${p}.png`, imgBytes);

    zip.file(
      `ppt/slides/slide${p}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="${p + 1}" name="Page ${p}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${slideCx}" cy="${slideCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`
    );

    zip.file(
      `ppt/slides/_rels/slide${p}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide_img_${p}.png"/>
</Relationships>`
    );

    slideRelEntries.push(
      `  <Relationship Id="rIdSld${p}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${p}.xml"/>`
    );
    sldIdEntries.push(`    <p:sldId id="${255 + p}" r:id="rIdSld${p}"/>`);
    slideContentOverrides.push(
      `  <Override PartName="/ppt/slides/slide${p}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    );
  }

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
${slideContentOverrides.join('\n')}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>
  <p:sldIdLst>
${sldIdEntries.join('\n')}
  </p:sldIdLst>
  <p:sldSz cx="${slideCx}" cy="${slideCy}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRelEntries.join('\n')}
</Relationships>`
  );

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout1"/></p:sldLayoutIdLst>
</p:sldMaster>`
  );

  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  onProgress?.(92, 'Packaging PowerPoint (.pptx) presentation...');
  const pptxBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  onProgress?.(100, 'PowerPoint deck ready');
  return {
    blob: pptxBlob,
    fileName: `${cleanBaseName(file.name)}.pptx`,
    slideCount: numPages,
    thumbnails,
  };
}
