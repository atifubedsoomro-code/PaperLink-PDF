import JSZip from 'jszip';

export type ImageOutputFormat = 'png' | 'jpg' | 'webp' | 'bmp' | 'ico';
export type PdfToImageFormat = 'png' | 'jpg' | 'webp';
export type PdfToImageScale = 1 | 1.5 | 2 | 3;
export type BgRemoveEngine = 'ai' | 'studio-flood' | 'color-key';
export type BgFillMode = 'transparent' | 'solid' | 'gradient';
export type ImageResizeFit = 'exact' | 'contain' | 'cover';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PdfRenderedImagePage {
  pageNumber: number;
  width: number;
  height: number;
  blob: Blob;
  dataUrl: string;
  sizeBytes: number;
  fileName: string;
}

export interface PdfToImageResult {
  pages: PdfRenderedImagePage[];
  totalPagesInPdf: number;
  format: PdfToImageFormat;
  zipBlob?: Blob;
  zipFileName: string;
}

export interface ProcessedImageResult {
  id: string;
  originalName: string;
  fileName: string;
  format: ImageOutputFormat;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  sizeBytes: number;
  blob: Blob;
  dataUrl: string;
  usedFallback?: boolean;
  notice?: string;
}

export interface ImageFiltersConfig {
  brightness: number; // 100 = default (50..180)
  contrast: number;   // 100 = default (50..180)
  saturate: number;   // 100 = default (0..200)
  hueRotate: number;  // 0 = default (-180..180)
  blur: number;       // 0 = default (0..10 px)
  grayscale: number;  // 0 = default (0..100%)
  sepia: number;      // 0 = default (0..100%)
  sharpen: boolean;
}

export const DEFAULT_IMAGE_FILTERS: ImageFiltersConfig = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  sharpen: false,
};

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

function formatMime(fmt: ImageOutputFormat): string {
  switch (fmt) {
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'png':
    default:
      return 'image/png';
  }
}

export function inferFormatFromFile(file: File): 'png' | 'jpg' | 'webp' {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || file.type === 'image/jpeg') {
    return 'jpg';
  }
  if (lower.endsWith('.webp') || file.type === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  ).toUpperCase();
}

export async function loadImageElement(source: File | Blob | string): Promise<{
  img: HTMLImageElement;
  width: number;
  height: number;
  objectUrl?: string;
}> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file. Please verify it is a valid image.'));
      el.src = url;
    });
    return {
      img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      objectUrl: typeof source === 'string' ? undefined : url,
    };
  } catch (err) {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
    throw err;
  }
}

export async function getImageDimensions(file: File | Blob): Promise<ImageDimensions> {
  const loaded = await loadImageElement(file);
  if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  return { width: loaded.width, height: loaded.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Browser could not encode image as ${mime}.`));
          return;
        }
        resolve(blob);
      },
      mime,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read encoded image preview.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Encode 24-bit uncompressed Windows BMP directly from RGBA canvas pixels.
 */
function encodeCanvasToBmp(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');
  const { data } = ctx.getImageData(0, 0, w, h);

  const rowStride = Math.floor((24 * w + 31) / 32) * 4;
  const pixelArraySize = rowStride * h;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // BITMAPFILEHEADER (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true); // positive => bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  for (let y = 0; y < h; y++) {
    const srcRow = h - 1 - y;
    const dstRowOffset = 54 + y * rowStride;
    for (let x = 0; x < w; x++) {
      const idx = (srcRow * w + x) * 4;
      const dst = dstRowOffset + x * 3;
      bytes[dst] = data[idx + 2];     // B
      bytes[dst + 1] = data[idx + 1]; // G
      bytes[dst + 2] = data[idx];     // R
    }
  }

  return new Blob([buf], { type: 'image/bmp' });
}

/**
 * Encode a modern PNG-embedded multi-size ICO favicon (32x32 + 64x64).
 */
async function encodeCanvasToIco(sourceCanvas: HTMLCanvasElement): Promise<Blob> {
  const sizes = [32, 64];
  const pngBuffers: { size: number; bytes: Uint8Array }[] = [];

  for (const sz of sizes) {
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = sz;
    iconCanvas.height = sz;
    const ctx = iconCanvas.getContext('2d');
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const aspect = sourceCanvas.width / Math.max(1, sourceCanvas.height);
    let drawW = sz;
    let drawH = sz;
    if (aspect > 1) drawH = sz / aspect;
    else drawW = sz * aspect;
    ctx.drawImage(sourceCanvas, (sz - drawW) / 2, (sz - drawH) / 2, drawW, drawH);
    const pngBlob = await canvasToBlob(iconCanvas, 'image/png', 1);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    pngBuffers.push({ size: sz, bytes: pngBytes });
  }

  const headerSize = 6;
  const dirEntrySize = 16;
  const totalDataOffset = headerSize + dirEntrySize * pngBuffers.length;
  const totalBytes =
    totalDataOffset + pngBuffers.reduce((acc, item) => acc + item.bytes.byteLength, 0);

  const out = new ArrayBuffer(totalBytes);
  const view = new DataView(out);
  const outBytes = new Uint8Array(out);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // 1 = ICO
  view.setUint16(4, pngBuffers.length, true);

  let dataOffset = totalDataOffset;
  pngBuffers.forEach((entry, idx) => {
    const pos = headerSize + idx * dirEntrySize;
    view.setUint8(pos, entry.size >= 256 ? 0 : entry.size);
    view.setUint8(pos + 1, entry.size >= 256 ? 0 : entry.size);
    view.setUint8(pos + 2, 0);
    view.setUint8(pos + 3, 0);
    view.setUint16(pos + 4, 1, true);
    view.setUint16(pos + 6, 32, true);
    view.setUint32(pos + 8, entry.bytes.byteLength, true);
    view.setUint32(pos + 12, dataOffset, true);
    outBytes.set(entry.bytes, dataOffset);
    dataOffset += entry.bytes.byteLength;
  });

  return new Blob([out], { type: 'image/x-icon' });
}

async function encodeCanvasToFormat(
  canvas: HTMLCanvasElement,
  targetFormat: ImageOutputFormat,
  quality: number,
  transparentMatteHex = '#FFFFFF'
): Promise<Blob> {
  const needsOpaqueMatte = targetFormat === 'jpg' || targetFormat === 'bmp';
  let exportCanvas = canvas;

  if (needsOpaqueMatte) {
    const matte = document.createElement('canvas');
    matte.width = canvas.width;
    matte.height = canvas.height;
    const mCtx = matte.getContext('2d');
    if (mCtx) {
      mCtx.fillStyle = transparentMatteHex;
      mCtx.fillRect(0, 0, matte.width, matte.height);
      mCtx.drawImage(canvas, 0, 0);
      exportCanvas = matte;
    }
  }

  if (targetFormat === 'bmp') return encodeCanvasToBmp(exportCanvas);
  if (targetFormat === 'ico') return encodeCanvasToIco(exportCanvas);
  return canvasToBlob(exportCanvas, formatMime(targetFormat), quality);
}

/**
 * Create a downloadable ZIP archive from processed images or rendered PDF pages.
 */
export async function createImagesZip(
  items: { fileName: string; blob: Blob }[]
): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Map<string, number>();

  for (const item of items) {
    let finalName = item.fileName;
    const count = usedNames.get(finalName) || 0;
    if (count > 0) {
      const dot = finalName.lastIndexOf('.');
      if (dot > 0) {
        finalName = `${finalName.slice(0, dot)}_${count + 1}${finalName.slice(dot)}`;
      } else {
        finalName = `${finalName}_${count + 1}`;
      }
    }
    usedNames.set(item.fileName, count + 1);
    zip.file(finalName, item.blob);
  }

  return await zip.generateAsync({ type: 'blob' });
}

function parsePageRange(expr: string, totalPages: number): number[] {
  const cleaned = expr.trim().toLowerCase();
  if (!cleaned || cleaned === 'all' || cleaned === '*') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>();
  for (const part of cleaned.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    if (seg.includes('-')) {
      const [aStr, bStr] = seg.split('-').map((s) => s.trim());
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(totalPages, Math.max(a, b));
        for (let p = start; p <= end; p++) set.add(p);
      }
    } else {
      const n = parseInt(seg, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= totalPages) set.add(n);
    }
  }
  const sorted = Array.from(set).sort((x, y) => x - y);
  return sorted.length > 0 ? sorted : Array.from({ length: totalPages }, (_, i) => i + 1);
}

/**
 * TOOL: PDF -> Images (High-DPI PNG, JPG, or WebP + ZIP bundle)
 * Used in both PDF Tools and Graphic Designer Image Tools.
 */
export async function convertPdfToImages(
  file: File,
  options: {
    format: PdfToImageFormat;
    scale: PdfToImageScale;
    quality: number;
    pageRangeExpr: string;
    transparentBg?: boolean;
  },
  onProgress?: (percent: number, status: string) => void
): Promise<PdfToImageResult> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rendering requires a browser environment.');
  }

  onProgress?.(5, 'Initializing PDF renderer...');
  if (!window.pdfjsLib) {
    let waited = 0;
    while (!window.pdfjsLib && waited < 20) {
      await new Promise((r) => setTimeout(r, 100));
      waited++;
    }
  }
  if (!window.pdfjsLib) {
    throw new Error('PDF.js engine is still loading or unavailable. Please check your connection and try again.');
  }

  try {
    if (window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  } catch {
    // ignore worker hint errors
  }

  const buf = await file.arrayBuffer();
  const safeBuffer = new Uint8Array(buf).slice().buffer;
  const pdf = await window.pdfjsLib.getDocument({ data: safeBuffer, useSystemFonts: true }).promise;
  const totalPagesInPdf: number = pdf.numPages;

  const selectedPages = parsePageRange(options.pageRangeExpr, totalPagesInPdf);
  const baseName = stripExtension(file.name);
  const rendered: PdfRenderedImagePage[] = [];

  for (let i = 0; i < selectedPages.length; i++) {
    const pageNum = selectedPages[i];
    const pct = Math.round(12 + ((i + 0.3) / selectedPages.length) * 75);
    onProgress?.(pct, `Rendering page ${pageNum} (${i + 1}/${selectedPages.length}) at ${options.scale}× resolution...`);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    const useWhiteBg = options.format === 'jpg' || !options.transparentBg;
    if (useWhiteBg) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await canvasToBlob(canvas, formatMime(options.format), options.quality);
    const dataUrl = await blobToDataUrl(blob);
    const padded = String(pageNum).padStart(String(totalPagesInPdf).length, '0');
    rendered.push({
      pageNumber: pageNum,
      width: canvas.width,
      height: canvas.height,
      blob,
      dataUrl,
      sizeBytes: blob.size,
      fileName: `${baseName}_page_${padded}.${options.format}`,
    });
  }

  onProgress?.(92, 'Packaging ZIP archive...');
  const zipBlob =
    rendered.length > 1
      ? await createImagesZip(rendered.map((p) => ({ fileName: p.fileName, blob: p.blob })))
      : undefined;

  onProgress?.(100, `Rendered ${rendered.length} page image${rendered.length === 1 ? '' : 's'}.`);

  return {
    pages: rendered,
    totalPagesInPdf,
    format: options.format,
    zipBlob,
    zipFileName: `${baseName}_pages_${options.format}.zip`,
  };
}

/**
 * TOOL: Image Resize (Exact px, Contain w/ matte, or Cover smart-crop)
 */
export async function resizeImageFile(
  file: File,
  options: {
    width: number;
    height: number;
    fit: ImageResizeFit;
    format: 'original' | 'png' | 'jpg' | 'webp';
    quality: number;
    padColor?: string;
  }
): Promise<ProcessedImageResult> {
  const loaded = await loadImageElement(file);
  try {
    const targetW = Math.max(1, Math.min(10000, Math.round(options.width)));
    const targetH = Math.max(1, Math.min(10000, Math.round(options.height)));
    const outFormat: ImageOutputFormat =
      options.format === 'original' ? inferFormatFromFile(file) : options.format;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (outFormat === 'jpg') {
      ctx.fillStyle = options.padColor || '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (options.fit === 'contain' && options.padColor && options.padColor !== 'transparent') {
      ctx.fillStyle = options.padColor;
      ctx.fillRect(0, 0, targetW, targetH);
    }

    if (options.fit === 'exact') {
      ctx.drawImage(loaded.img, 0, 0, targetW, targetH);
    } else if (options.fit === 'contain') {
      const scale = Math.min(targetW / loaded.width, targetH / loaded.height);
      const drawW = loaded.width * scale;
      const drawH = loaded.height * scale;
      const dx = (targetW - drawW) / 2;
      const dy = (targetH - drawH) / 2;
      ctx.drawImage(loaded.img, dx, dy, drawW, drawH);
    } else {
      // cover crop
      const scale = Math.max(targetW / loaded.width, targetH / loaded.height);
      const srcW = targetW / scale;
      const srcH = targetH / scale;
      const sx = (loaded.width - srcW) / 2;
      const sy = (loaded.height - srcH) / 2;
      ctx.drawImage(loaded.img, sx, sy, srcW, srcH, 0, 0, targetW, targetH);
    }

    const blob = await encodeCanvasToFormat(canvas, outFormat, options.quality, options.padColor || '#FFFFFF');
    const dataUrl = await blobToDataUrl(blob);

    return {
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}_${targetW}x${targetH}.${outFormat}`,
      format: outFormat,
      width: targetW,
      height: targetH,
      originalWidth: loaded.width,
      originalHeight: loaded.height,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
    };
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}

/**
 * TOOL: Image Format Conversion (PNG, JPG, WebP, BMP, ICO Favicon)
 */
export async function convertImageFormat(
  file: File,
  options: {
    targetFormat: ImageOutputFormat;
    quality: number;
    backgroundColor: string;
  }
): Promise<ProcessedImageResult> {
  const loaded = await loadImageElement(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = loaded.width;
    canvas.height = loaded.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded.img, 0, 0);

    const blob = await encodeCanvasToFormat(
      canvas,
      options.targetFormat,
      options.quality,
      options.backgroundColor || '#FFFFFF'
    );
    const dataUrl = await blobToDataUrl(blob);
    const outW = options.targetFormat === 'ico' ? 64 : loaded.width;
    const outH = options.targetFormat === 'ico' ? 64 : loaded.height;

    return {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}.${options.targetFormat}`,
      format: options.targetFormat,
      width: outW,
      height: outH,
      originalWidth: loaded.width,
      originalHeight: loaded.height,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
    };
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}

/**
 * Local smart border-connected Flood Fill or global Color-Key with edge feather & despill.
 */
function applyStudioCutoutOnCanvas(
  img: HTMLImageElement,
  w: number,
  h: number,
  mode: 'studio-flood' | 'color-key',
  targetColorHex: string | undefined,
  tolerance: number, // 1..100
  feather: number,   // 0..10
  despill: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Determine seed background color: either explicit hex or dominant corner average
  let bgR = 255;
  let bgG = 255;
  let bgB = 255;
  if (targetColorHex) {
    [bgR, bgG, bgB] = hexToRgb(targetColorHex);
  } else {
    const corners = [
      0,
      (w - 1) * 4,
      (h - 1) * w * 4,
      ((h - 1) * w + (w - 1)) * 4,
    ];
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let cnt = 0;
    for (const c of corners) {
      if (data[c + 3] > 20) {
        sumR += data[c];
        sumG += data[c + 1];
        sumB += data[c + 2];
        cnt++;
      }
    }
    if (cnt > 0) {
      bgR = sumR / cnt;
      bgG = sumG / cnt;
      bgB = sumB / cnt;
    }
  }

  // Perceptual color distance threshold (0..441 max Euclidean)
  const hardThresh = Math.max(4, (tolerance / 100) * 195);
  const softRange = hardThresh + Math.max(8, feather * 9);

  const colorDist = (idx: number) => {
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114) * 1.65;
  };

  const alphaMask = new Float32Array(w * h);
  alphaMask.fill(1);

  if (mode === 'color-key') {
    for (let p = 0; p < w * h; p++) {
      const idx = p * 4;
      if (data[idx + 3] === 0) {
        alphaMask[p] = 0;
        continue;
      }
      const dist = colorDist(idx);
      if (dist <= hardThresh) {
        alphaMask[p] = 0;
      } else if (dist < softRange) {
        alphaMask[p] = (dist - hardThresh) / Math.max(1, softRange - hardThresh);
      }
    }
  } else {
    // 4-connected BFS flood fill seeded along all border pixels
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const trySeed = (p: number) => {
      if (visited[p]) return;
      const idx = p * 4;
      if (data[idx + 3] < 16 || colorDist(idx) <= hardThresh * 1.08) {
        visited[p] = 1;
        queue[tail++] = p;
      }
    };

    for (let x = 0; x < w; x++) {
      trySeed(x);
      trySeed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      trySeed(y * w);
      trySeed(y * w + (w - 1));
    }

    while (head < tail) {
      const p = queue[head++];
      alphaMask[p] = 0;

      const x = p % w;
      const y = (p - x) / w;
      const neighbors = [
        x > 0 ? p - 1 : -1,
        x + 1 < w ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y + 1 < h ? p + w : -1,
      ];

      for (const np of neighbors) {
        if (np < 0 || visited[np]) continue;
        visited[np] = 1;
        const nIdx = np * 4;
        const dist = colorDist(nIdx);
        if (data[nIdx + 3] < 16 || dist <= hardThresh) {
          queue[tail++] = np;
        } else if (dist < softRange) {
          alphaMask[np] = Math.min(
            alphaMask[np],
            (dist - hardThresh) / Math.max(1, softRange - hardThresh)
          );
        }
      }
    }
  }

  // Optional 1-pass box blur on alpha fringe when feather > 0
  if (feather > 0) {
    const copy = new Float32Array(alphaMask);
    const radius = feather >= 6 ? 2 : 1;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (copy[p] === 0 || copy[p] === 1) {
          // Only soften edges directly adjacent to transition
          const hasEdge =
            copy[p - 1] !== copy[p] ||
            copy[p + 1] !== copy[p] ||
            copy[p - w] !== copy[p] ||
            copy[p + w] !== copy[p];
          if (!hasEdge) continue;
        }
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += copy[yy * w + xx];
            count++;
          }
        }
        alphaMask[p] = sum / Math.max(1, count);
      }
    }
  }

  // Write final alpha & optional color spill decontamination
  for (let p = 0; p < w * h; p++) {
    const idx = p * 4;
    const origA = data[idx + 3] / 255;
    const m = alphaMask[p];
    const nextA = origA * m;
    data[idx + 3] = Math.round(nextA * 255);

    if (despill && m > 0.02 && m < 0.96) {
      // Pull edge pixel color away from background tint to erase halos
      const inv = 1 / Math.max(0.25, m);
      data[idx] = Math.max(0, Math.min(255, Math.round((data[idx] - bgR * (1 - m)) * inv)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round((data[idx + 1] - bgG * (1 - m)) * inv)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round((data[idx + 2] - bgB * (1 - m)) * inv)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * TOOL: Background Removal (AI Neural Subject Segmentation + Studio Flood-Fill / Color-Key)
 */
export async function removeImageBackground(
  file: File,
  options: {
    engine: BgRemoveEngine;
    targetColorHex?: string;
    tolerance?: number;
    feather?: number;
    despill?: boolean;
    fillMode?: BgFillMode;
    fillColor?: string;
    fillGradientEnd?: string;
    dropShadow?: boolean;
    outputFormat?: 'png' | 'webp';
  },
  onProgress?: (percent: number, status: string) => void
): Promise<ProcessedImageResult> {
  const outFormat: 'png' | 'webp' = options.outputFormat || 'png';
  const fillMode: BgFillMode = options.fillMode || 'transparent';
  let cutoutCanvas: HTMLCanvasElement | null = null;
  let origW = 0;
  let origH = 0;
  let usedFallback = false;
  let notice: string | undefined;

  const loadedOrig = await loadImageElement(file);
  origW = loadedOrig.width;
  origH = loadedOrig.height;

  try {
    if (options.engine === 'ai') {
      try {
        onProgress?.(12, 'Loading local AI cutout model...');
        const mod = await import('@imgly/background-removal');
        const resultBlob = await mod.removeBackground(file, {
          output: { format: 'image/png', quality: 1 },
          progress: (key: string, current: number, total: number) => {
            if (total > 0) {
              const frac = Math.min(1, Math.max(0, current / total));
              const label = key.includes('fetch') ? 'Downloading AI segmentation weights (cached offline after first run)...' : 'Separating foreground subject...';
              onProgress?.(Math.round(15 + frac * 70), label);
            }
          },
        });
        const cutoutLoaded = await loadImageElement(resultBlob);
        try {
          cutoutCanvas = document.createElement('canvas');
          cutoutCanvas.width = cutoutLoaded.width;
          cutoutCanvas.height = cutoutLoaded.height;
          const cCtx = cutoutCanvas.getContext('2d');
          if (cCtx) cCtx.drawImage(cutoutLoaded.img, 0, 0);
        } finally {
          if (cutoutLoaded.objectUrl) URL.revokeObjectURL(cutoutLoaded.objectUrl);
        }
      } catch (aiErr: any) {
        console.warn('AI BG model fallback to studio edge cutout:', aiErr);
        usedFallback = true;
        notice =
          'AI model assets could not be fetched in this offline/restricted session — switched automatically to Smart Studio Edge Cutout.';
        onProgress?.(55, 'Applying Smart Studio Edge Cutout fallback...');
        cutoutCanvas = applyStudioCutoutOnCanvas(
          loadedOrig.img,
          origW,
          origH,
          'studio-flood',
          options.targetColorHex,
          options.tolerance ?? 28,
          options.feather ?? 2,
          options.despill ?? true
        );
      }
    } else {
      onProgress?.(45, 'Removing backdrop with Studio Precision...');
      cutoutCanvas = applyStudioCutoutOnCanvas(
        loadedOrig.img,
        origW,
        origH,
        options.engine,
        options.targetColorHex,
        options.tolerance ?? 26,
        options.feather ?? 2,
        options.despill ?? true
      );
    }

    if (!cutoutCanvas) throw new Error('Failed to create cutout buffer.');

    onProgress?.(88, 'Compositing final backdrop & alpha channel...');
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = cutoutCanvas.width;
    finalCanvas.height = cutoutCanvas.height;
    const fCtx = finalCanvas.getContext('2d');
    if (!fCtx) throw new Error('Canvas context unavailable.');

    if (fillMode === 'solid') {
      fCtx.fillStyle = options.fillColor || '#FFFFFF';
      fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    } else if (fillMode === 'gradient') {
      const grad = fCtx.createLinearGradient(0, 0, finalCanvas.width, finalCanvas.height);
      grad.addColorStop(0, options.fillColor || '#facc15');
      grad.addColorStop(1, options.fillGradientEnd || '#f97316');
      fCtx.fillStyle = grad;
      fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    }

    if (options.dropShadow) {
      fCtx.save();
      fCtx.shadowColor = 'rgba(0, 0, 0, 0.36)';
      fCtx.shadowBlur = Math.max(12, Math.round(finalCanvas.width * 0.028));
      fCtx.shadowOffsetX = 0;
      fCtx.shadowOffsetY = Math.max(6, Math.round(finalCanvas.height * 0.015));
      fCtx.drawImage(cutoutCanvas, 0, 0);
      fCtx.restore();
    } else {
      fCtx.drawImage(cutoutCanvas, 0, 0);
    }

    const blob = await canvasToBlob(finalCanvas, formatMime(outFormat), 0.96);
    const dataUrl = await blobToDataUrl(blob);
    onProgress?.(100, 'Background removed cleanly.');

    return {
      id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}_nobg.${outFormat}`,
      format: outFormat,
      width: finalCanvas.width,
      height: finalCanvas.height,
      originalWidth: origW,
      originalHeight: origH,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
      usedFallback,
      notice,
    };
  } finally {
    if (loadedOrig.objectUrl) URL.revokeObjectURL(loadedOrig.objectUrl);
  }
}

/**
 * TOOL: Crop, Rotate (90/180/270) & Flip H/V
 */
export async function cropRotateFlipImage(
  file: File,
  options: {
    cropX: number; // 0..1 fraction of rotated image
    cropY: number;
    cropW: number;
    cropH: number;
    rotateDeg: 0 | 90 | 180 | 270;
    flipH: boolean;
    flipV: boolean;
    format: 'png' | 'jpg' | 'webp';
    quality: number;
  }
): Promise<ProcessedImageResult> {
  const loaded = await loadImageElement(file);
  try {
    const swapDims = options.rotateDeg === 90 || options.rotateDeg === 270;
    const rotW = swapDims ? loaded.height : loaded.width;
    const rotH = swapDims ? loaded.width : loaded.height;

    const stage = document.createElement('canvas');
    stage.width = rotW;
    stage.height = rotH;
    const sCtx = stage.getContext('2d');
    if (!sCtx) throw new Error('Canvas context unavailable.');

    sCtx.save();
    sCtx.translate(rotW / 2, rotH / 2);
    sCtx.rotate((options.rotateDeg * Math.PI) / 180);
    sCtx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
    sCtx.drawImage(loaded.img, -loaded.width / 2, -loaded.height / 2);
    sCtx.restore();

    const sx = Math.max(0, Math.min(rotW - 1, Math.round(options.cropX * rotW)));
    const sy = Math.max(0, Math.min(rotH - 1, Math.round(options.cropY * rotH)));
    const sw = Math.max(1, Math.min(rotW - sx, Math.round(options.cropW * rotW)));
    const sh = Math.max(1, Math.min(rotH - sy, Math.round(options.cropH * rotH)));

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const oCtx = out.getContext('2d');
    if (!oCtx) throw new Error('Canvas context unavailable.');

    if (options.format === 'jpg') {
      oCtx.fillStyle = '#FFFFFF';
      oCtx.fillRect(0, 0, sw, sh);
    }
    oCtx.drawImage(stage, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await encodeCanvasToFormat(out, options.format, options.quality, '#FFFFFF');
    const dataUrl = await blobToDataUrl(blob);

    return {
      id: `crop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}_edited.${options.format}`,
      format: options.format,
      width: sw,
      height: sh,
      originalWidth: loaded.width,
      originalHeight: loaded.height,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
    };
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}

/**
 * TOOL: Image Compression & Web Optimization
 */
export async function compressImageFile(
  file: File,
  options: {
    format: 'jpg' | 'webp' | 'png';
    quality: number; // 0.1..1
    maxWidth?: number;
  }
): Promise<ProcessedImageResult> {
  const loaded = await loadImageElement(file);
  try {
    let outW = loaded.width;
    let outH = loaded.height;
    if (options.maxWidth && loaded.width > options.maxWidth) {
      const ratio = options.maxWidth / loaded.width;
      outW = Math.round(options.maxWidth);
      outH = Math.max(1, Math.round(loaded.height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (options.format === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(loaded.img, 0, 0, outW, outH);

    const blob = await encodeCanvasToFormat(canvas, options.format, options.quality, '#FFFFFF');
    const dataUrl = await blobToDataUrl(blob);

    return {
      id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}_optimized.${options.format}`,
      format: options.format,
      width: outW,
      height: outH,
      originalWidth: loaded.width,
      originalHeight: loaded.height,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
    };
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}

/**
 * Extract top dominant Hex color swatches from an image for graphic designers.
 */
export async function extractDominantPalette(file: File | Blob, maxColors = 6): Promise<string[]> {
  const loaded = await loadImageElement(file);
  try {
    const sampleSize = 84;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(loaded.img, 0, 0, sampleSize, sampleSize);
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // ignore transparent pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Quantize into 24-step buckets
      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.r += r;
        existing.g += g;
        existing.b += b;
        existing.count++;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
    const chosen: { r: number; g: number; b: number }[] = [];

    for (const bucket of sorted) {
      const avgR = bucket.r / bucket.count;
      const avgG = bucket.g / bucket.count;
      const avgB = bucket.b / bucket.count;
      const tooClose = chosen.some((c) => {
        const d = Math.hypot(c.r - avgR, c.g - avgG, c.b - avgB);
        return d < 52;
      });
      if (!tooClose) {
        chosen.push({ r: avgR, g: avgG, b: avgB });
        if (chosen.length >= maxColors) break;
      }
    }

    return chosen.map((c) => rgbToHex(c.r, c.g, c.b));
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}

/**
 * TOOL: Apply color adjustments & optional crisp sharpen convolution
 */
export async function applyImageFilters(
  file: File,
  filters: ImageFiltersConfig,
  format: 'png' | 'jpg' | 'webp',
  quality: number
): Promise<ProcessedImageResult> {
  const loaded = await loadImageElement(file);
  try {
    const w = loaded.width;
    const h = loaded.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');

    if (format === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.filter = [
      `brightness(${filters.brightness}%)`,
      `contrast(${filters.contrast}%)`,
      `saturate(${filters.saturate}%)`,
      `hue-rotate(${filters.hueRotate}deg)`,
      `blur(${filters.blur}px)`,
      `grayscale(${filters.grayscale}%)`,
      `sepia(${filters.sepia}%)`,
    ].join(' ');
    ctx.drawImage(loaded.img, 0, 0, w, h);
    ctx.filter = 'none';

    if (filters.sharpen) {
      const srcData = ctx.getImageData(0, 0, w, h);
      const src = srcData.data;
      const dstData = ctx.createImageData(w, h);
      const dst = dstData.data;
      // Gentle unsharp kernel [0,-0.4,0, -0.4,2.6,-0.4, 0,-0.4,0]
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
            dst[i] = src[i];
            dst[i + 1] = src[i + 1];
            dst[i + 2] = src[i + 2];
            dst[i + 3] = src[i + 3];
            continue;
          }
          const top = ((y - 1) * w + x) * 4;
          const bot = ((y + 1) * w + x) * 4;
          const left = (y * w + (x - 1)) * 4;
          const right = (y * w + (x + 1)) * 4;
          for (let c = 0; c < 3; c++) {
            const val =
              src[i + c] * 2.6 -
              (src[top + c] + src[bot + c] + src[left + c] + src[right + c]) * 0.4;
            dst[i + c] = Math.max(0, Math.min(255, Math.round(val)));
          }
          dst[i + 3] = src[i + 3];
        }
      }
      ctx.putImageData(dstData, 0, 0);
    }

    const blob = await encodeCanvasToFormat(canvas, format, quality, '#FFFFFF');
    const dataUrl = await blobToDataUrl(blob);

    return {
      id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalName: file.name,
      fileName: `${stripExtension(file.name)}_graded.${format}`,
      format,
      width: w,
      height: h,
      originalWidth: w,
      originalHeight: h,
      originalSizeBytes: file.size,
      sizeBytes: blob.size,
      blob,
      dataUrl,
    };
  } finally {
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
}
