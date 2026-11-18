import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  Minus,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
  Zap,
  Archive,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';
import { ChatMarkdown } from './ChatMarkdown';
import { PreviewTarget } from './DocumentPreviewModal';
import {
  CompressionLevel,
  PdfToWordMode,
  SplitMode,
  compressPdfFile,
  convertImagesToPdf,
  convertPdfToWord,
  convertWordToPdf,
  inspectPdfSource,
  mergeMultiplePdfs,
  splitPdfFile,
} from '../services/pdfToolkit';
import {
  BgRemoveEngine,
  ImageOutputFormat,
  ImageResizeFit,
  PdfToImageFormat,
  PdfToImageScale,
  compressImageFile,
  convertImageFormat,
  convertPdfToImages,
  createImagesZip,
  removeImageBackground,
  resizeImageFile,
} from '../services/imageToolkit';
import { protectPdfWithPassword, unlockPdfWithPassword } from '../services/pdfSecurity';
import { mergeCoverWithPdf } from '../services/pdfService';
import { generateQRCodeDataUrl } from '../services/qrService';
import { COVER_THEMES } from '../constants/themes';
import { CoverData } from '../types';

export interface PaperLinkChatbotProps {
  activeView: AppView;
  onNavigateView: (view: AppView | 'batch' | 'library') => void;
  onOpenPdfTool: (tool: PdfToolTab) => void;
  onOpenImageTool: (tool: ImageToolTab) => void;
  onOpenDocInCoverStudio: (file: File) => void;
  onUseImageAsCoverLogo: (dataUrl: string) => void;
  onPreviewDocument?: (target: PreviewTarget) => void;
  neonGlowMode?: 'full' | 'subtle';
  defaultSpeedMode?: 'balanced' | 'fast';
  onSpeedModeChange?: (mode: 'balanced' | 'fast') => void;
  isMinimized?: boolean;
  onMinimizeChange?: (minimized: boolean) => void;
}

interface ChatArtifact {
  id: string;
  fileName: string;
  summary: string;
  blob: Blob;
  kind: 'pdf' | 'word' | 'image' | 'zip';
  fileObj?: File;
  dataUrl?: string;
  isEncrypted?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachedNames?: string[];
  artifacts?: ChatArtifact[];
  actionBadge?: string;
  modelUsed?: string;
  isError?: boolean;
}

interface GeminiFunctionCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

type PipelineMediaKind = 'pdf' | 'image' | 'word' | 'none';

interface ToolExecutionOutput {
  summaryText: string;
  artifacts: ChatArtifact[];
  badge: string;
  producedFiles: File[];
  consumedKind: PipelineMediaKind;
  producedKind: PipelineMediaKind;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || getFileExt(file.name) === 'pdf';
}

function isWordFile(file: File): boolean {
  const ext = getFileExt(file.name);
  return ext === 'docx' || ext === 'doc';
}

function isImageFile(file: File): boolean {
  const ext = getFileExt(file.name);
  return file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function createInlinePreviewBase64(file: File): Promise<{
  name: string;
  mimeType: string;
  base64Data: string;
} | null> {
  if (!isImageFile(file)) return null;
  try {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image preview load failed'));
      el.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = dataUrl.split(',')[1] || '';
    return base64Data ? { name: file.name, mimeType: 'image/jpeg', base64Data } : null;
  } catch {
    return null;
  }
}

export const PaperLinkChatbot: React.FC<PaperLinkChatbotProps> = ({
  activeView,
  onNavigateView,
  onOpenPdfTool,
  onOpenImageTool,
  onOpenDocInCoverStudio,
  onUseImageAsCoverLogo,
  onPreviewDocument,
  neonGlowMode = 'full',
  defaultSpeedMode = 'balanced',
  onSpeedModeChange,
  isMinimized = false,
  onMinimizeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [speedMode, setSpeedMode] = useState<'balanced' | 'fast'>(defaultSpeedMode);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [execStatus, setExecStatus] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  useEffect(() => {
    setSpeedMode(defaultSpeedMode);
  }, [defaultSpeedMode]);

  const handleCopyMessage = (id: string, text: string) => {
    try {
      void navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => {
        setCopiedMsgId((curr) => (curr === id ? null : curr));
      }, 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleMinimizeToTopBar = () => {
    setIsOpen(false);
    onMinimizeChange?.(true);
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hi! I am **PaperLink AI**, trained on every tool inside this website.\n\nAttach a PDF, Word file, or image using **+** below and tell me what to do:\n- **Compress** a PDF or shrink an image\n- **Convert** PDF to Word or Word to PDF\n- **Remove backgrounds** or resize graphics\n- **Open** files directly in **Cover Studio**`,
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compactPromptInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy, execStatus, isOpen]);

  const handleAttachFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    setAttachedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const unique = incoming.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...unique].slice(0, 8);
    });
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const executeWebsiteTool = async (
    fc: GeminiFunctionCall,
    files: File[],
    stepPrefix?: string
  ): Promise<ToolExecutionOutput> => {
    const args = fc.args || {};
    const artifacts: ChatArtifact[] = [];
    const producedFiles: File[] = [];
    const notes: string[] = [];
    const prefix = stepPrefix ? `${stepPrefix}: ` : '';

    const pdfs = files.filter(isPdfFile);
    const words = files.filter(isWordFile);
    const images = files.filter(isImageFile);

    switch (fc.name) {
      case 'compress_pdf': {
        if (pdfs.length === 0) {
          throw new Error('Attach a PDF file first so I can compress it.');
        }
        const levelRaw = String(args.level || 'balanced').toLowerCase();
        const level: CompressionLevel =
          levelRaw === 'maximum' || levelRaw === 'lossless' ? levelRaw : 'balanced';
        const qPct =
          typeof args.qualityPercent === 'number'
            ? Math.max(15, Math.min(100, args.qualityPercent))
            : level === 'maximum'
            ? 35
            : level === 'lossless'
            ? 98
            : 60;

        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Compressing ${pdf.name}...`);
          const res = await compressPdfFile(
            pdf,
            level,
            (_pct, st) => setExecStatus(`${prefix}${st}`),
            qPct
          );
          const savedPct = Math.max(
            0,
            Math.round(((res.originalSize - res.compressedSize) / Math.max(1, res.originalSize)) * 100)
          );
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${formatBytes(res.originalSize)} → ${formatBytes(res.compressedSize)} (${savedPct}% smaller)`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(
            `Compressed **${pdf.name}**: ${formatBytes(res.originalSize)} → **${formatBytes(
              res.compressedSize
            )}** (${savedPct}% reduction).`
          );
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PDF Compress',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'compress_image': {
        if (images.length === 0) {
          throw new Error('Attach at least one image (PNG, JPG, WebP, or BMP) to compress.');
        }
        const fmtRaw = String(args.format || 'webp').toLowerCase();
        const fmt: 'webp' | 'jpg' | 'png' =
          fmtRaw === 'jpg' || fmtRaw === 'jpeg' ? 'jpg' : fmtRaw === 'png' ? 'png' : 'webp';
        const quality =
          typeof args.quality === 'number' ? Math.max(0.2, Math.min(0.95, args.quality)) : 0.72;
        const maxWidth =
          typeof args.maxWidth === 'number' && args.maxWidth > 50 ? Math.round(args.maxWidth) : undefined;

        const outForZip: { fileName: string; blob: Blob }[] = [];
        for (const img of images) {
          setExecStatus(`${prefix}Compressing image ${img.name}...`);
          const res = await compressImageFile(img, { format: fmt, quality, maxWidth });
          const savedPct = Math.max(
            0,
            Math.round(((res.originalSizeBytes - res.sizeBytes) / Math.max(1, res.originalSizeBytes)) * 100)
          );
          const outFile = new File([res.blob], res.fileName, { type: res.blob.type || `image/${fmt}` });
          producedFiles.push(outFile);
          outForZip.push({ fileName: res.fileName, blob: res.blob });
          artifacts.push({
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${formatBytes(res.originalSizeBytes)} → ${formatBytes(res.sizeBytes)} (${savedPct}% smaller · ${res.width}×${res.height})`,
            blob: res.blob,
            kind: 'image',
            fileObj: outFile,
            dataUrl: res.dataUrl,
          });
          notes.push(
            `Compressed **${img.name}** → **${res.fileName}** (${formatBytes(res.sizeBytes)}, ${savedPct}% smaller).`
          );
        }
        if (outForZip.length > 1) {
          const zip = await createImagesZip(outForZip);
          artifacts.unshift({
            id: `zip_${Date.now()}`,
            fileName: 'paperlink_compressed_images.zip',
            summary: `All ${outForZip.length} compressed images bundled`,
            blob: zip,
            kind: 'zip',
          });
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'Image Compress',
          producedFiles,
          consumedKind: 'image',
          producedKind: 'image',
        };
      }

      case 'pdf_to_word': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to convert to Word (.docx).');
        const mode: PdfToWordMode = args.mode === 'layout' ? 'layout' : 'editable';
        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Converting ${pdf.name} to Word...`);
          const res = await convertPdfToWord(pdf, mode, (_p, st) => setExecStatus(`${prefix}${st}`));
          const outFile = new File([res.blob], res.fileName, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          producedFiles.push(outFile);
          artifacts.push({
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.pageCount} pages · ${res.wordCount.toLocaleString()} words (.docx)`,
            blob: res.blob,
            kind: 'word',
            fileObj: outFile,
          });
          notes.push(`Converted **${pdf.name}** into **${res.fileName}** (${res.pageCount} pages).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PDF → Word',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'word',
        };
      }

      case 'word_to_pdf': {
        if (words.length === 0) throw new Error('Attach a Word (.docx) file to convert to PDF.');
        const paperSize: 'a4' | 'letter' = args.paperSize === 'letter' ? 'letter' : 'a4';
        for (const w of words) {
          setExecStatus(`${prefix}Converting ${w.name} to PDF...`);
          const res = await convertWordToPdf(w, paperSize, (_p, st) => setExecStatus(`${prefix}${st}`));
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.pageCount} pages · ${paperSize.toUpperCase()} PDF`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(`Converted **${w.name}** to **${res.fileName}** (${res.pageCount} pages).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'Word → PDF',
          producedFiles,
          consumedKind: 'word',
          producedKind: 'pdf',
        };
      }

      case 'merge_pdfs': {
        if (pdfs.length < 2) {
          throw new Error('Attach at least 2 PDF files so I can merge them together.');
        }
        setExecStatus(`${prefix}Inspecting ${pdfs.length} PDF files...`);
        const sources = [];
        for (const pdf of pdfs) {
          sources.push(await inspectPdfSource(pdf));
        }
        const outName = String(args.outputName || 'paperlink_merged');
        const res = await mergeMultiplePdfs(sources, outName, (_p, st) => setExecStatus(`${prefix}${st}`));
        const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
        producedFiles.push(outFile);
        artifacts.push({
          id: `art_${Date.now()}`,
          fileName: res.fileName,
          summary: `${res.totalPages} combined pages · ${formatBytes(res.blob.size)}`,
          blob: res.blob,
          kind: 'pdf',
          fileObj: outFile,
        });
        return {
          summaryText: `Merged ${pdfs.length} PDFs into **${res.fileName}** (${res.totalPages} pages total).`,
          artifacts,
          badge: 'PDF Merge',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'split_pdf': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to split or extract pages.');
        const mode: SplitMode = args.mode === 'fixed-chunks' ? 'fixed-chunks' : 'extract-range';
        const expr = String(args.rangeOrInterval || '1');
        setExecStatus(`${prefix}Splitting ${pdfs[0].name}...`);
        const res = await splitPdfFile(pdfs[0], mode, expr, (_p, st) => setExecStatus(`${prefix}${st}`));
        for (const f of res.files) {
          const outFile = new File([f.blob], f.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: f.fileName,
            summary: `${f.label} · ${f.pageCount} page(s)`,
            blob: f.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
        }
        return {
          summaryText: `Created **${res.files.length}** output PDF file(s) from **${pdfs[0].name}**.`,
          artifacts,
          badge: 'PDF Split',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'pdf_to_images': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to render its pages as images.');
        const fmtRaw = String(args.format || 'png').toLowerCase();
        const format: PdfToImageFormat =
          fmtRaw === 'jpg' || fmtRaw === 'jpeg' ? 'jpg' : fmtRaw === 'webp' ? 'webp' : 'png';
        const allowedScales: PdfToImageScale[] = [1, 1.5, 2, 3];
        const reqScale = Number(args.scale || 2);
        const scale = (allowedScales.includes(reqScale as PdfToImageScale) ? reqScale : 2) as PdfToImageScale;
        const pageRangeExpr = typeof args.pageRangeExpr === 'string' ? args.pageRangeExpr : '';

        setExecStatus(`${prefix}Rendering ${pdfs[0].name} pages...`);
        const res = await convertPdfToImages(
          pdfs[0],
          { format, scale, quality: 0.92, pageRangeExpr },
          (_p, st) => setExecStatus(`${prefix}${st}`)
        );
        if (res.zipBlob) {
          artifacts.push({
            id: `zip_${Date.now()}`,
            fileName: res.zipFileName,
            summary: `ZIP with ${res.pages.length} rendered ${format.toUpperCase()} pages`,
            blob: res.zipBlob,
            kind: 'zip',
          });
        }
        for (const p of res.pages) {
          const imgFile = new File([p.blob], p.fileName, { type: p.blob.type || `image/${format}` });
          producedFiles.push(imgFile);
          if (artifacts.length < 5) {
            artifacts.push({
              id: `pg_${p.pageNumber}_${Date.now()}`,
              fileName: p.fileName,
              summary: `Page ${p.pageNumber} · ${p.width}×${p.height}px (${formatBytes(p.sizeBytes)})`,
              blob: p.blob,
              kind: 'image',
              fileObj: imgFile,
              dataUrl: p.dataUrl,
            });
          }
        }
        return {
          summaryText: `Rendered **${res.pages.length}** page(s) from **${pdfs[0].name}** as **${format.toUpperCase()}** at ${scale}× sharpness.`,
          artifacts,
          badge: 'PDF → Image',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'image',
        };
      }

      case 'images_to_pdf': {
        if (images.length === 0) throw new Error('Attach at least one image to convert into PDF.');
        const paperSize: 'a4' | 'letter' | 'fit' =
          args.paperSize === 'letter' || args.paperSize === 'fit' ? args.paperSize : 'a4';
        setExecStatus(`${prefix}Converting ${images.length} image(s) to PDF...`);
        const res = await convertImagesToPdf(images, paperSize, (_p, st) => setExecStatus(`${prefix}${st}`));
        const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
        producedFiles.push(outFile);
        artifacts.push({
          id: `art_${Date.now()}`,
          fileName: res.fileName,
          summary: `${res.pageCount} page(s) · ${formatBytes(res.blob.size)}`,
          blob: res.blob,
          kind: 'pdf',
          fileObj: outFile,
        });
        return {
          summaryText: `Converted ${images.length} image(s) into **${res.fileName}** (${res.pageCount} page${res.pageCount === 1 ? '' : 's'}).`,
          artifacts,
          badge: 'Images → PDF',
          producedFiles,
          consumedKind: 'image',
          producedKind: 'pdf',
        };
      }

      case 'add_cover_to_pdf': {
        if (pdfs.length === 0) {
          throw new Error('Attach or convert a PDF first before adding a cover page.');
        }
        const styleKey = String(args.themeStyle || 'basic').toLowerCase();
        const themeLookupId =
          styleKey === 'dark'
            ? 'cyber-slate'
            : styleKey === 'corporate'
            ? 'executive-horizon'
            : styleKey === 'academic'
            ? 'academic-thesis'
            : styleKey === 'centered'
            ? 'plain-centered-ink'
            : styleKey === 'left-bar'
            ? 'plain-sidebar-stripe'
            : 'plain-classic-rule';
        const chosenTheme = COVER_THEMES.find((t) => t.id === themeLookupId) || COVER_THEMES[0];
        const includeQr = args.includeQr === true;
        const paperSize: 'a4' | 'letter' = args.paperSize === 'letter' ? 'letter' : 'a4';

        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Adding ${includeQr ? 'cover' : 'basic cover (no QR)'} to ${pdf.name}...`);
          const baseClean = pdf.name.replace(/\.pdf$/i, '');
          const derivedTitle =
            String(args.title || '').trim() ||
            baseClean.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

          const coverConfig: CoverData = {
            title: derivedTitle || 'Document Cover',
            subtitle: String(args.subtitle || '').trim(),
            preparedBy: String(args.preparedBy || '').trim(),
            organization: String(args.organization || '').trim(),
            documentId: '',
            date: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }),
            summary: '',
            qrCallToAction: includeQr ? 'Scan with phone camera to view soft copy.' : '',
            imageUrl: chosenTheme.defaultImage || '',
            themeId: chosenTheme.id,
            primaryColor: chosenTheme.primaryColor,
            accentColor: chosenTheme.accentColor,
            font: chosenTheme.defaultFont,
            paperSize,
            qrPosition: 'bottom-right',
            qrColor: chosenTheme.primaryColor,
            qrBgColor: '#ffffff',
            showLogoInQR: false,
            includeQr,
          };

          const qrUrl = includeQr
            ? await generateQRCodeDataUrl({
                url: 'https://drive.google.com',
                colorDark: coverConfig.qrColor,
                colorLight: coverConfig.qrBgColor,
                width: 480,
              })
            : '';

          const srcBuffer = await pdf.arrayBuffer();
          const mergedBytes = await mergeCoverWithPdf(srcBuffer, coverConfig, qrUrl);
          const safeBuf = new Uint8Array(mergedBytes).slice().buffer;
          const outBlob = new Blob([safeBuf], { type: 'application/pdf' });
          const outName = `${baseClean.replace(/[^a-zA-Z0-9_-]+/g, '_')}_with_cover.pdf`;
          const outFile = new File([outBlob], outName, { type: 'application/pdf' });

          producedFiles.push(outFile);
          artifacts.push({
            id: `cov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: outName,
            summary: `${includeQr ? 'Styled Cover' : 'Basic Cover (No QR)'} + Original PDF · ${formatBytes(outBlob.size)}`,
            blob: outBlob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(
            `Prepended a **${chosenTheme.name}** cover page (${includeQr ? 'with QR' : 'without QR'}) to **${pdf.name}**.`
          );
        }

        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: includeQr ? 'Cover Added' : 'Basic Cover (No QR)',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'remove_image_background': {
        if (images.length === 0) throw new Error('Attach an image to remove its background.');
        const engineRaw = String(args.engine || 'ai');
        const engine: BgRemoveEngine =
          engineRaw === 'studio-flood' || engineRaw === 'color-key' ? engineRaw : 'ai';
        const outputFormat: 'png' | 'webp' = args.outputFormat === 'webp' ? 'webp' : 'png';

        const zipList: { fileName: string; blob: Blob }[] = [];
        for (const img of images) {
          setExecStatus(`${prefix}Removing background from ${img.name}...`);
          const res = await removeImageBackground(
            img,
            { engine, tolerance: 28, feather: 2, despill: true, fillMode: 'transparent', outputFormat },
            (_p, st) => setExecStatus(`${prefix}${st}`)
          );
          const outFile = new File([res.blob], res.fileName, { type: `image/${outputFormat}` });
          producedFiles.push(outFile);
          zipList.push({ fileName: res.fileName, blob: res.blob });
          artifacts.push({
            id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `Transparent cutout · ${res.width}×${res.height}px (${formatBytes(res.sizeBytes)})`,
            blob: res.blob,
            kind: 'image',
            fileObj: outFile,
            dataUrl: res.dataUrl,
          });
        }
        if (zipList.length > 1) {
          const zip = await createImagesZip(zipList);
          artifacts.unshift({
            id: `zip_bg_${Date.now()}`,
            fileName: 'paperlink_cutouts.zip',
            summary: `${zipList.length} clean cutouts ZIP archive`,
            blob: zip,
            kind: 'zip',
          });
        }
        return {
          summaryText: `Removed the background cleanly for **${images.length}** image(s).`,
          artifacts,
          badge: 'Background Removed',
          producedFiles,
          consumedKind: 'image',
          producedKind: 'image',
        };
      }

      case 'resize_image': {
        if (images.length === 0) throw new Error('Attach at least one image to resize.');
        const width = Math.max(16, Math.min(8000, Math.round(Number(args.width || 1080))));
        const height = Math.max(16, Math.min(8000, Math.round(Number(args.height || 1080))));
        const fitRaw = String(args.fit || 'contain');
        const fit: ImageResizeFit =
          fitRaw === 'cover' || fitRaw === 'exact' ? fitRaw : 'contain';

        for (const img of images) {
          setExecStatus(`${prefix}Resizing ${img.name} to ${width}×${height}...`);
          const res = await resizeImageFile(img, {
            width,
            height,
            fit,
            format: 'original',
            quality: 0.92,
            padColor: '#FFFFFF',
          });
          const outFile = new File([res.blob], res.fileName, { type: res.blob.type || 'image/png' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `rs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.width}×${res.height}px (${fit}) · ${formatBytes(res.sizeBytes)}`,
            blob: res.blob,
            kind: 'image',
            fileObj: outFile,
            dataUrl: res.dataUrl,
          });
        }
        return {
          summaryText: `Resized **${images.length}** image(s) to **${width}×${height}px**.`,
          artifacts,
          badge: 'Image Resize',
          producedFiles,
          consumedKind: 'image',
          producedKind: 'image',
        };
      }

      case 'convert_image_format': {
        if (images.length === 0) throw new Error('Attach an image to convert its format.');
        const fmtRaw = String(args.targetFormat || 'webp').toLowerCase();
        const targetFormat: ImageOutputFormat = (['png', 'jpg', 'webp', 'bmp', 'ico'].includes(fmtRaw)
          ? fmtRaw
          : 'webp') as ImageOutputFormat;
        for (const img of images) {
          setExecStatus(`${prefix}Converting ${img.name} to .${targetFormat}...`);
          const res = await convertImageFormat(img, {
            targetFormat,
            quality: 0.92,
            backgroundColor: '#FFFFFF',
          });
          const outFile = new File([res.blob], res.fileName, { type: res.blob.type || `image/${targetFormat}` });
          producedFiles.push(outFile);
          artifacts.push({
            id: `cv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `.${targetFormat.toUpperCase()} · ${res.width}×${res.height}px (${formatBytes(res.sizeBytes)})`,
            blob: res.blob,
            kind: 'image',
            fileObj: outFile,
            dataUrl: res.dataUrl,
          });
        }
        return {
          summaryText: `Converted **${images.length}** image(s) to **.${targetFormat.toUpperCase()}**.`,
          artifacts,
          badge: `Converted to .${targetFormat.toUpperCase()}`,
          producedFiles,
          consumedKind: 'image',
          producedKind: 'image',
        };
      }

      case 'protect_pdf': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to lock with a password.');
        const password = String(args.password || '').trim();
        if (!password) throw new Error('Specify a password to encrypt the PDF.');
        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Encrypting ${pdf.name} (AES-256)...`);
          const res = await protectPdfWithPassword(
            pdf,
            {
              userPassword: password,
              algorithm: 'AES-256',
              permissions: {
                printing: args.allowPrinting === false ? false : 'highResolution',
                copying: args.allowCopying === true,
                modifying: false,
                annotating: false,
                fillingForms: true,
                contentAccessibility: true,
                documentAssembly: false,
              },
            },
            (_p, st) => setExecStatus(`${prefix}${st}`)
          );
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `AES-256 Encrypted · ${res.pageCount} page(s) · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
            isEncrypted: true,
          });
          notes.push(`Locked **${pdf.name}** → **${res.fileName}** (${res.pageCount} page(s), AES-256 password protected).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PDF Protected (AES-256)',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'unlock_pdf': {
        if (pdfs.length === 0) throw new Error('Attach an encrypted PDF file to unlock.');
        const password = String(args.password || '').trim();
        if (!password) throw new Error('Provide the current password to unlock the PDF.');
        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Unlocking ${pdf.name}...`);
          const res = await unlockPdfWithPassword(pdf, password, (_p, st) => setExecStatus(`${prefix}${st}`));
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `unsec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `Decrypted PDF · ${res.pageCount} page(s) · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(`Unlocked **${pdf.name}** → **${res.fileName}** (${res.pageCount} page(s)).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PDF Unlocked',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'open_in_cover_studio': {
        const role = args.role === 'logo' ? 'logo' : 'document';
        if (role === 'logo' || (images.length > 0 && pdfs.length === 0 && words.length === 0)) {
          if (images.length === 0) throw new Error('Attach an image first to set it as Cover Logo.');
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Could not read image'));
            reader.readAsDataURL(images[0]);
          });
          onUseImageAsCoverLogo(dataUrl);
          return {
            summaryText: `Applied **${images[0].name}** as your Cover Studio logo and opened Customize (Step 3).`,
            artifacts: [],
            badge: 'Opened Cover Studio Logo',
            producedFiles: [],
            consumedKind: 'image',
            producedKind: 'none',
          };
        }

        const docCandidate = pdfs[0] || words[0] || files[0];
        if (!docCandidate) throw new Error('Attach a PDF, Word, or Text file to open in Cover Studio.');
        onOpenDocInCoverStudio(docCandidate);
        return {
          summaryText: `Loaded **${docCandidate.name}** into **Cover Studio**! You can now pick a cover theme and link Google Drive QR.`,
          artifacts: [],
          badge: 'Loaded in Cover Studio',
          producedFiles: [],
          consumedKind: 'pdf',
          producedKind: 'none',
        };
      }

      case 'navigate_workspace': {
        const viewRaw = String(args.view || 'studio');
        if (viewRaw === 'tools') {
          onNavigateView('tools');
          if (args.pdfTool) onOpenPdfTool(args.pdfTool as PdfToolTab);
          return {
            summaryText: `Switched workspace to **PDF & Word Tools**${args.pdfTool ? ` (${args.pdfTool})` : ''}.`,
            artifacts: [],
            badge: 'Navigated to PDF Tools',
            producedFiles: [],
            consumedKind: 'none',
            producedKind: 'none',
          };
        }
        if (viewRaw === 'image-tools') {
          onNavigateView('image-tools');
          if (args.imageTool) onOpenImageTool(args.imageTool as ImageToolTab);
          return {
            summaryText: `Switched workspace to **Designer Image Studio**${args.imageTool ? ` (${args.imageTool})` : ''}.`,
            artifacts: [],
            badge: 'Navigated to Image Studio',
            producedFiles: [],
            consumedKind: 'none',
            producedKind: 'none',
          };
        }
        if (viewRaw === 'batch' || viewRaw === 'library' || viewRaw === 'studio' || viewRaw === 'home') {
          onNavigateView(viewRaw);
          return {
            summaryText: `Opened **${viewRaw === 'batch' ? 'Batch Queue' : viewRaw === 'library' ? 'Document Library' : viewRaw === 'studio' ? 'Cover Studio' : 'Home'}**.`,
            artifacts: [],
            badge: `Opened ${viewRaw}`,
            producedFiles: [],
            consumedKind: 'none',
            producedKind: 'none',
          };
        }
        return {
          summaryText: 'Workspace ready.',
          artifacts: [],
          badge: 'Navigated',
          producedFiles: [],
          consumedKind: 'none',
          producedKind: 'none',
        };
      }

      default:
        return {
          summaryText: `Recognized action \`${fc.name}\`.`,
          artifacts: [],
          badge: fc.name,
          producedFiles: [],
          consumedKind: 'none',
          producedKind: 'none',
        };
    }
  };

  const handleSend = async (customPrompt?: string, overrideFiles?: File[]) => {
    const trimmed = (customPrompt ?? input).trim();
    const currentFiles = overrideFiles ? [...overrideFiles] : [...attachedFiles];
    if ((!trimmed && currentFiles.length === 0) || isBusy) return;

    const userDisplayText =
      trimmed || `Attached ${currentFiles.map((f) => f.name).join(', ')}`;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: userDisplayText,
      attachedNames: currentFiles.map((f) => `${f.name} (${formatBytes(f.size)})`),
    };

    const historySnapshot = messages
      .filter((m) => m.id !== 'welcome' && !m.isError)
      .map((m) => ({
        role: m.role,
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInput('');
    setIsBusy(true);
    setExecStatus('Planning workflow...');

    try {
      const encodedResults = await Promise.all(
        currentFiles.filter(isImageFile).slice(0, 3).map(createInlinePreviewBase64)
      );
      const inlineImages = encodedResults.filter(
        (item): item is { name: string; mimeType: string; base64Data: string } => item !== null
      );

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: historySnapshot,
          message: trimmed,
          attachedFilesSummary: currentFiles.map((f) => ({
            name: f.name,
            sizeBytes: f.size,
            extension: getFileExt(f.name),
            mimeType: f.type,
          })),
          inlineImages,
          activeView,
          speedMode,
        }),
      });

      const rawText = await resp.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          resp.status === 404
            ? 'Chat API route (/api/chat) was not found on this deployment. Please redeploy so /api/chat is published.'
            : `Unexpected server response (HTTP ${resp.status}). Please try again.`
        );
      }

      if (!resp.ok) {
        throw new Error(data?.error || `Server error (${resp.status})`);
      }

      const functionCalls: GeminiFunctionCall[] = Array.isArray(data.functionCalls)
        ? data.functionCalls
        : [];
      const collectedSummaries: string[] = [];
      const badges: string[] = [];
      const stepResults: ToolExecutionOutput[] = [];

      if (functionCalls.length > 0) {
        let workingFiles = [...currentFiles];
        const totalSteps = functionCalls.length;

        for (let i = 0; i < totalSteps; i++) {
          const fc = functionCalls[i];
          const stepLabel = totalSteps > 1 ? `Step ${i + 1}/${totalSteps}` : undefined;
          const result = await executeWebsiteTool(fc, workingFiles, stepLabel);
          stepResults.push(result);

          if (result.summaryText) {
            collectedSummaries.push(
              totalSteps > 1 ? `**${i + 1}.** ${result.summaryText}` : result.summaryText
            );
          }
          if (result.badge) badges.push(result.badge);

          // Feed produced output files cleanly into the next step of the chain
          if (result.producedFiles.length > 0) {
            const remaining = workingFiles.filter((f) => {
              if (result.consumedKind === 'pdf' && isPdfFile(f)) return false;
              if (result.consumedKind === 'image' && isImageFile(f)) return false;
              if (result.consumedKind === 'word' && isWordFile(f)) return false;
              return true;
            });
            workingFiles = [...result.producedFiles, ...remaining];
          }
        }
      }

      // Show only terminal unconsumed artifacts so chained workflows deliver the finished file cleanly
      const terminalArtifacts: ChatArtifact[] = [];
      stepResults.forEach((stepRes, idx) => {
        if (stepRes.artifacts.length === 0) return;
        const consumedByLaterStep =
          stepRes.producedKind !== 'none' &&
          stepResults
            .slice(idx + 1)
            .some((later) => later.consumedKind === stepRes.producedKind && later.artifacts.length > 0);
        if (!consumedByLaterStep) {
          terminalArtifacts.push(...stepRes.artifacts);
        }
      });

      const modelTextParts = [data.reply, ...collectedSummaries].filter(
        (t) => typeof t === 'string' && t.trim().length > 0
      );
      const finalReply =
        modelTextParts.join('\n\n') ||
        'Completed cleanly! Download your output file below.';

      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: finalReply,
          artifacts: terminalArtifacts,
          actionBadge: badges.join(' → ') || undefined,
          modelUsed: data.modelUsed,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'model',
          text: err?.message || 'Something went wrong while communicating with PaperLink AI.',
          isError: true,
        },
      ]);
    } finally {
      setIsBusy(false);
      setExecStatus(null);
    }
  };

  // Context-aware suggestion chips when files are attached
  const hasAttachedPdf = attachedFiles.some(isPdfFile);
  const hasAttachedWord = attachedFiles.some(isWordFile);
  const hasAttachedImg = attachedFiles.some(isImageFile);

  const quickChips: string[] = hasAttachedPdf
    ? ['Compress this PDF', 'Convert to Word (.docx)', 'Convert PDF to PNG images', 'Open in Cover Studio']
    : hasAttachedWord
    ? ['Convert Word to PDF', 'Open in Cover Studio']
    : hasAttachedImg
    ? ['Remove background', 'Compress to WebP', 'Resize 1080×1080', 'Use as Cover Logo']
    : ['What can PaperLink do?', 'Who developed PaperLink?', 'Take me to Image Studio'];

  // Avoid overlapping fixed right Cover Studio sidebar on lg+ desktop and mobile step bar
  const dockPositionClass =
    activeView === 'studio'
      ? 'bottom-16 lg:bottom-5 right-3 sm:right-5 lg:right-[19.5rem]'
      : 'bottom-4 sm:bottom-5 right-3 sm:right-5';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.md,.rtf,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleAttachFiles(e.target.files);
            setTimeout(() => compactPromptInputRef.current?.focus(), 60);
          }
          e.target.value = '';
        }}
      />

      {/* CONSTANT COMPACT BOTTOM-RIGHT "PAPER LINK AI" CARD */}
      {!isMinimized && !isOpen && (
        <div
          className={`no-print fixed ${dockPositionClass} z-40 w-[calc(100vw-1.5rem)] sm:w-[344px]`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files) {
              handleAttachFiles(e.dataTransfer.files);
              setTimeout(() => compactPromptInputRef.current?.focus(), 60);
            }
          }}
        >
          <div className="relative">
            {/* Ambient Breathing Neon Glow Halo */}
            {neonGlowMode === 'full' && (
              <motion.div
                aria-hidden="true"
                animate={{ opacity: [0.45, 0.8, 0.45], scale: [0.99, 1.015, 0.99] }}
                transition={{ repeat: Infinity, duration: 6.5, ease: 'easeInOut' }}
                className="pointer-events-none absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-cyan-400/40 via-yellow-400/35 to-blue-500/40 blur-lg"
              />
            )}

            {/* Neon Frame Border */}
            <div
              className={`relative p-[1.5px] rounded-2xl bg-gradient-to-r from-cyan-400 via-yellow-400 to-blue-500 ${
                neonGlowMode === 'full'
                  ? 'shadow-[0_0_24px_rgba(34,211,238,0.28),0_0_40px_rgba(250,204,21,0.18)]'
                  : 'shadow-lg'
              }`}
            >
              {/* Clipped Traveling Top Neon Laser Accent */}
              {neonGlowMode === 'full' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden z-20"
                >
                  <motion.div
                    initial={{ x: '-100%', opacity: 0 }}
                    animate={{ x: ['-100%', '340%'], opacity: [0, 1, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 5.2, repeatDelay: 0.8, ease: 'linear' }}
                    className="absolute top-0 left-0 h-[2px] w-1/3 bg-gradient-to-r from-transparent via-cyan-300 to-transparent blur-[0.5px] will-change-transform"
                  />
                </div>
              )}

              <div className="relative rounded-[14.5px] bg-white/95 dark:bg-[#0c0c12]/95 backdrop-blur-xl overflow-hidden">
                {isDragOver && (
                  <div className="absolute inset-0 z-30 bg-cyan-950/85 backdrop-blur-sm border-2 border-dashed border-cyan-400 rounded-[14.5px] flex items-center justify-center gap-2 p-3">
                    <Paperclip className="w-4 h-4 text-cyan-300" />
                    <span className="text-xs font-bold text-white">Drop file to attach</span>
                  </div>
                )}

                {/* Compact Top Strip: Paper Link AI */}
                <div className="px-3.5 py-2 border-b border-zinc-200 dark:border-zinc-800/90 bg-zinc-50/90 dark:bg-[#09090e] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-400 to-yellow-400 text-black flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span className="text-xs font-extrabold tracking-tight text-zinc-950 dark:text-white truncate">
                      Paper Link AI
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsOpen(true)}
                      aria-label="Expand PaperLink AI chat"
                      title="Expand full chat"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-cyan-400 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Maximize2 className="w-3 h-3 text-cyan-500" />
                      <span>{messages.length > 1 ? `Chat (${messages.length - 1})` : 'Expand'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleMinimizeToTopBar}
                      aria-label="Minimize chatbot to top bar"
                      title="Minimize to top bar near PaperLink logo"
                      className="p-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Compact Attached Files Strip (if user attached via + before running) */}
                {attachedFiles.length > 0 && (
                  <div className="px-2.5 pt-2 flex flex-wrap gap-1">
                    {attachedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}_${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-400/15 border border-yellow-400/40 text-[10px] font-mono text-zinc-900 dark:text-yellow-300 max-w-full"
                      >
                        <span className="truncate max-w-[155px] font-bold">{file.name}</span>
                        {onPreviewDocument && (
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewDocument({
                                title: file.name,
                                fileName: file.name,
                                blob: file,
                                subtitle: 'Attached Input Document',
                              })
                            }
                            aria-label={`Preview ${file.name}`}
                            title="Preview document"
                            className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachedFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          className="text-zinc-500 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Compact Circular (+) Attach & Type Prompt Here Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!input.trim() && attachedFiles.length === 0) {
                      setIsOpen(true);
                      return;
                    }
                    setIsOpen(true);
                    void handleSend();
                  }}
                  className="px-2.5 py-2.5 flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach PDF, Word, or Image file"
                    title="Attach file (PDF, Word, Image)"
                    className="w-9 h-9 rounded-full border-[1.5px] border-cyan-500/80 dark:border-cyan-400/80 bg-cyan-50/70 dark:bg-cyan-950/30 hover:bg-cyan-400 hover:text-black text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-[0_0_10px_rgba(34,211,238,0.2)] active:scale-95"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <input
                    ref={compactPromptInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      attachedFiles.length > 0
                        ? `Prompt for ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}...`
                        : 'Type Prompt Here'
                    }
                    aria-label="Type Prompt Here"
                    className="flex-1 min-w-0 px-1.5 py-1.5 text-xs sm:text-[13px] font-medium bg-transparent text-zinc-950 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                  />

                  <button
                    type="submit"
                    aria-label="Run PaperLink AI prompt"
                    className="w-8 h-8 rounded-xl bg-gradient-to-r from-yellow-400 to-cyan-400 hover:brightness-105 text-black flex items-center justify-center shrink-0 cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.3)] active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5 stroke-[2.25]" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED NEON-LIT MULTI-TURN CHATBOT DRAWER */}
      <AnimatePresence>
        {!isMinimized && isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`no-print fixed ${dockPositionClass} z-40 w-[calc(100vw-1.5rem)] sm:w-[410px] h-[min(78vh,620px)]`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files) handleAttachFiles(e.dataTransfer.files);
            }}
          >
            {/* Outer Breathing Neon Aura */}
            {neonGlowMode === 'full' && (
              <motion.div
                aria-hidden="true"
                animate={{ opacity: [0.6, 0.95, 0.6], scale: [0.99, 1.015, 0.99] }}
                transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
                className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-tr from-yellow-400/45 via-cyan-400/35 to-fuchsia-500/30 blur-2xl"
              />
            )}

            {/* Neon Rim Frame */}
            <div
              className={`relative h-full p-[2px] rounded-2xl bg-gradient-to-br from-yellow-400 via-cyan-400 to-amber-500 ${
                neonGlowMode === 'full'
                  ? 'shadow-[0_0_34px_rgba(250,204,21,0.34),0_0_64px_rgba(34,211,238,0.24)]'
                  : 'shadow-xl'
              }`}
            >
              {/* Clipped Traveling Neon Laser Accent */}
              {neonGlowMode === 'full' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden z-20"
                >
                  <motion.div
                    initial={{ x: '-100%', opacity: 0 }}
                    animate={{ x: ['-100%', '340%'], opacity: [0, 1, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 5.2, repeatDelay: 0.8, ease: 'linear' }}
                    className="absolute top-0 left-0 h-[2px] w-1/3 bg-gradient-to-r from-transparent via-cyan-300 to-transparent blur-[0.5px] will-change-transform"
                  />
                </div>
              )}

              <div className="relative h-full flex flex-col rounded-[14px] bg-white/95 dark:bg-[#0c0c11]/95 backdrop-blur-xl overflow-hidden">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-[#09090e] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-400 to-cyan-400 text-black flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(250,204,21,0.5)]">
                      <Bot className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-extrabold text-zinc-950 dark:text-white truncate">
                          PaperLink AI
                        </h3>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        Attach files · Run tools directly
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const next = speedMode === 'balanced' ? 'fast' : 'balanced';
                        setSpeedMode(next);
                        onSpeedModeChange?.(next);
                      }}
                      title={
                        speedMode === 'balanced'
                          ? 'Model: gemini-4-hydrogen (Smart Tool Agent)'
                          : 'Model: gemini-3.1-flash-lite (Fast Chat)'
                      }
                      className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        speedMode === 'fast'
                          ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-600 dark:text-cyan-300'
                          : 'border-yellow-400/60 bg-yellow-400/15 text-amber-700 dark:text-yellow-300'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>{speedMode === 'fast' ? 'Fast' : 'Smart'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowCredits((p) => !p)}
                      title="Developer Credits — Team Terminators"
                      className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                        showCredits
                          ? 'border-yellow-400 bg-yellow-400/15 text-amber-600 dark:text-yellow-400'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setMessages([
                          {
                            id: 'welcome',
                            role: 'model',
                            text: 'Conversation cleared! Drop or attach a file below, or ask me anything about PaperLink.',
                          },
                        ])
                      }
                      title="Clear chat history"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-red-500 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={handleMinimizeToTopBar}
                      title="Minimize to top bar near PaperLink logo"
                      aria-label="Minimize chatbot to top bar"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      title="Collapse to bottom-right compact bar"
                      aria-label="Collapse AI Assistant"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Developer Credits Strip (Expandable or Compact Footer) */}
                {showCredits && (
                  <div className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] space-y-1 shrink-0">
                    <p className="font-bold text-amber-700 dark:text-yellow-400">
                      Developed by Team Terminators:
                    </p>
                    <p className="font-mono text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      Lead: Atif Ubed · 2. Sufyan Ali · 3. Muhammad Bilal · 4. Muhammad Arham · 5. Manahil Shamsi
                    </p>
                  </div>
                )}

                {/* Scrollable Multi-Turn Conversation Thread */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3 relative">
                  {isDragOver && (
                    <div className="absolute inset-2 rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-950/75 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-center p-4">
                      <Paperclip className="w-7 h-7 text-cyan-300 mb-2" />
                      <p className="text-xs font-bold text-white">
                        Drop PDF, Word, or Image to Attach to Chat
                      </p>
                    </div>
                  )}

                  {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isCopied = copiedMsgId === msg.id;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                      >
                        {!isUser && (
                          <div className="flex items-center justify-between w-full max-w-[92%] mb-1 px-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-md bg-gradient-to-br from-cyan-400 to-yellow-400 text-black flex items-center justify-center shadow-xs">
                                <Bot className="w-2.5 h-2.5 stroke-[2.5]" />
                              </span>
                              <span className="text-[10px] font-bold tracking-tight text-zinc-600 dark:text-zinc-400">
                                PaperLink AI
                              </span>
                            </div>
                            {!msg.isError && msg.text && (
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(msg.id, msg.text)}
                                aria-label="Copy message"
                                title="Copy response"
                                className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span className="text-emerald-500 font-semibold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        <div
                          className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-gradient-to-br from-yellow-400 to-amber-400 text-zinc-950 font-medium rounded-br-sm shadow-[0_2px_12px_rgba(250,204,21,0.22)]'
                              : msg.isError
                              ? 'bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 rounded-bl-sm'
                              : msg.actionBadge
                              ? 'bg-white dark:bg-[#13131d] border border-cyan-400/35 text-zinc-800 dark:text-zinc-200 rounded-bl-sm shadow-[0_4px_18px_rgba(34,211,238,0.08)]'
                              : 'bg-zinc-100/90 dark:bg-[#13131b] border border-zinc-200/90 dark:border-zinc-800/90 text-zinc-800 dark:text-zinc-200 rounded-bl-sm shadow-xs'
                          }`}
                        >
                          {msg.actionBadge && (
                            <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>{msg.actionBadge}</span>
                            </div>
                          )}

                          {msg.attachedNames && msg.attachedNames.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                              {msg.attachedNames.map((n) => (
                                <span
                                  key={n}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/10 border border-black/10 text-[10px] font-mono font-semibold text-zinc-950"
                                >
                                  <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate max-w-[200px]">{n}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          <ChatMarkdown content={msg.text} isUser={isUser} />

                          {/* Executable Result Download Cards */}
                          {msg.artifacts && msg.artifacts.length > 0 && (
                            <div className="mt-3 space-y-2 pt-2.5 border-t border-zinc-200/80 dark:border-zinc-800">
                              {msg.artifacts.map((art) => (
                                <div
                                  key={art.id}
                                  className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800 space-y-2"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {art.dataUrl ? (
                                      <img
                                        src={art.dataUrl}
                                        alt={art.fileName}
                                        className="w-9 h-9 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400/20 to-cyan-400/20 border border-yellow-400/30 text-amber-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
                                        {art.kind === 'zip' ? (
                                          <Archive className="w-4 h-4" />
                                        ) : art.kind === 'image' ? (
                                          <ImageIcon className="w-4 h-4" />
                                        ) : (
                                          <FileText className="w-4 h-4" />
                                        )}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                                        {art.fileName}
                                      </p>
                                      <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                        {art.summary}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1.5">
                                    {onPreviewDocument && !art.isEncrypted && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onPreviewDocument({
                                            title: art.fileName,
                                            fileName: art.fileName,
                                            blob: art.blob,
                                            subtitle: art.summary,
                                          })
                                        }
                                        className="py-1.5 px-2.5 rounded-lg border border-cyan-400/50 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                                        title="Preview generated document"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Preview</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => triggerDownload(art.blob, art.fileName)}
                                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-400 hover:brightness-105 text-black text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Download</span>
                                    </button>

                                    {art.kind === 'pdf' && art.fileObj && !art.isEncrypted && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onOpenDocInCoverStudio(art.fileObj!);
                                          setIsOpen(false);
                                        }}
                                        className="py-1.5 px-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <ExternalLink className="w-3 h-3 text-yellow-400" />
                                        <span>Cover Studio</span>
                                      </button>
                                    )}

                                    {art.kind === 'image' && art.dataUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onUseImageAsCoverLogo(art.dataUrl!);
                                          setIsOpen(false);
                                        }}
                                        className="py-1.5 px-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <ExternalLink className="w-3 h-3 text-yellow-400" />
                                        <span>Use as Logo</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {isBusy && (
                    <div className="flex items-start">
                      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-zinc-100 dark:bg-[#13131b] border border-cyan-400/50 text-xs text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-2 shadow-[0_0_16px_rgba(34,211,238,0.12)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                        <span className="font-medium">{execStatus || 'Thinking...'}</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Context Chips */}
                <div className="px-3 py-1.5 border-t border-zinc-200/70 dark:border-zinc-800/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  {quickChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSend(chip)}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-cyan-400 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Attached Files Strip */}
                {attachedFiles.length > 0 && (
                  <div className="px-3 pt-2 flex flex-wrap gap-1.5 shrink-0">
                    {attachedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}_${idx}`}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-400/15 border border-yellow-400/40 text-[10px] font-mono text-zinc-900 dark:text-yellow-300 max-w-full"
                      >
                        <span className="truncate max-w-[145px] font-bold">{file.name}</span>
                        <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                          {formatBytes(file.size)}
                        </span>
                        {onPreviewDocument && (
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewDocument({
                                title: file.name,
                                fileName: file.name,
                                blob: file,
                                subtitle: 'Attached Input Document',
                              })
                            }
                            aria-label={`Preview ${file.name}`}
                            title="Preview document"
                            className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachedFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          className="text-zinc-500 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input Composer + Subtle Developer Credit Line */}
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#09090e] space-y-2 shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSend();
                    }}
                    className="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach PDF, Word, or Image file"
                      aria-label="Attach file"
                      className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-cyan-400 text-zinc-600 dark:text-zinc-300 cursor-pointer shrink-0 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        attachedFiles.length > 0
                          ? 'Tell me what to do with attached file...'
                          : 'Attach a file or ask PaperLink AI...'
                      }
                      className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-cyan-400 focus:outline-none text-zinc-900 dark:text-white"
                    />

                    <button
                      type="submit"
                      disabled={isBusy || (!input.trim() && attachedFiles.length === 0)}
                      aria-label="Send message"
                      className="p-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-cyan-400 hover:brightness-105 disabled:opacity-40 text-black font-bold cursor-pointer shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>

                  <p className="text-[10px] text-center text-zinc-500 dark:text-zinc-500 truncate">
                    Developed by <span className="font-semibold text-zinc-700 dark:text-zinc-300">Team Terminators</span> · Lead: Atif Ubed
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
