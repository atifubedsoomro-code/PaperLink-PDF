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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';
import { ChatMarkdown } from './ChatMarkdown';
import { PreviewTarget } from './DocumentPreviewModal';
import { typewriterAudio } from '../services/soundEffects';
import { ClipingPapersLogo } from './ClipingPapersLogo';
import { MiniAiRobot } from './MiniAiRobot';
import {
  CompressionLevel,
  PdfPageThumb,
  PdfStampEditElement,
  PdfToWordMode,
  SplitMode,
  applyPdfEdits,
  compressPdfFile,
  convertImagesToPdf,
  convertPdfToWord,
  convertTextToPdf,
  convertWordToPdf,
  inspectPdfSource,
  mergeMultiplePdfs,
  parsePageRange,
  splitPdfFile,
  transformPdfPages,
} from '../services/pdfToolkit';
import {
  BgRemoveEngine,
  DEFAULT_IMAGE_FILTERS,
  ImageFiltersConfig,
  ImageOutputFormat,
  ImageResizeFit,
  PdfToImageFormat,
  PdfToImageScale,
  applyImageFilters,
  compressImageFile,
  convertImageFormat,
  convertPdfToImages,
  createImagesZip,
  cropRotateFlipImage,
  extractDominantPalette,
  removeImageBackground,
  resizeImageFile,
} from '../services/imageToolkit';
import { protectPdfWithPassword, unlockPdfWithPassword } from '../services/pdfSecurity';
import { mergeCoverWithPdf } from '../services/pdfService';
import { generateQRCodeDataUrl } from '../services/qrService';
import { COVER_THEMES } from '../constants/themes';
import { CoverData } from '../types';
import {
  convertExcelToImages,
  convertExcelToPdf,
  convertPdfToExcel,
  convertPdfToPpt,
  convertPptToImages,
  convertPptToPdf,
} from '../services/officeToolkit';
import { solveDocumentWithAI, SolverInkStyle } from '../services/pdfSolverService';

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
  soundEnabled?: boolean;
  onSoundEnabledChange?: (enabled: boolean) => void;
  showMiniRobot?: boolean;
  onOpenFeedback?: () => void;
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

type PipelineMediaKind = 'pdf' | 'image' | 'word' | 'ppt' | 'excel' | 'text' | 'none';

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

function isPptFile(file: File): boolean {
  const ext = getFileExt(file.name);
  return ext === 'pptx' || ext === 'ppt';
}

function isExcelFile(file: File): boolean {
  const ext = getFileExt(file.name);
  return ['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext);
}

function isTextFile(file: File): boolean {
  const ext = getFileExt(file.name);
  return file.type.startsWith('text/') || ['txt', 'md', 'markdown', 'rtf'].includes(ext);
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

function stabilizePartialMarkdown(partial: string): string {
  // Prevent mid-word raw '**' or '`' markers from flashing while typewriter streams text
  let cleaned = partial;
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) {
    cleaned += '**';
  }
  const codeCount = (cleaned.match(/`/g) || []).length;
  if (codeCount % 2 === 1) {
    cleaned += '`';
  }
  return cleaned;
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

let sharedChatAudioCtx: AudioContext | null = null;

function getOrUnlockAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedChatAudioCtx || sharedChatAudioCtx.state === 'closed') {
      sharedChatAudioCtx = new AudioCtx();
    }
    if (sharedChatAudioCtx.state === 'suspended') {
      void sharedChatAudioCtx.resume();
    }
    return sharedChatAudioCtx;
  } catch {
    return null;
  }
}

function playOutputSuccessSound() {
  try {
    const ctx = getOrUnlockAudioContext();
    if (!ctx) return;

    const playChimeNotes = () => {
      const now = ctx.currentTime;
      // Crisp, warm ascending C5 -> E5 -> G5 completion chime
      const notes = [
        { freq: 523.25, delay: 0, duration: 0.22, gain: 0.085 },
        { freq: 659.25, delay: 0.085, duration: 0.24, gain: 0.09 },
        { freq: 783.99, delay: 0.175, duration: 0.38, gain: 0.1 },
      ];

      for (const note of notes) {
        const startAt = now + note.delay;
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const overtoneGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, startAt);

        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(note.freq * 2, startAt);

        gainNode.gain.setValueAtTime(0.0001, startAt);
        gainNode.gain.exponentialRampToValueAtTime(note.gain, startAt + 0.018);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);

        overtoneGain.gain.setValueAtTime(0.0001, startAt);
        overtoneGain.gain.exponentialRampToValueAtTime(note.gain * 0.22, startAt + 0.015);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration * 0.65);

        osc.connect(gainNode);
        overtone.connect(overtoneGain);
        gainNode.connect(ctx.destination);
        overtoneGain.connect(ctx.destination);

        osc.start(startAt);
        overtone.start(startAt);
        osc.stop(startAt + note.duration + 0.03);
        overtone.stop(startAt + note.duration + 0.03);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx.resume().then(playChimeNotes).catch(() => {});
    } else {
      playChimeNotes();
    }
  } catch {
    // Ignore audio API errors on restricted environments
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
  soundEnabled,
  onSoundEnabledChange,
  showMiniRobot = true,
  onOpenFeedback,
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
  const [typingMsgId, setTypingMsgId] = useState<string | null>(null);
  const [typedCharCount, setTypedCharCount] = useState(0);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('paperlink_chat_sound') !== 'muted';
    } catch {
      return true;
    }
  });
  const isSoundEnabledRef = useRef(isSoundEnabled);

  // Resizable & draggable floating window geometry
  type ResizeDir = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';
  interface WindowRect {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  const getDefaultRect = (customSize?: { width: number; height: number } | null): WindowRect => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const isMobile = vw < 640;
    const topSafePad = isMobile ? 54 : 58;
    const minW = Math.min(320, Math.max(260, vw - 16));
    const minH = Math.min(340, Math.max(260, vh - topSafePad - 16));
    const maxW = Math.max(minW, vw - 16);
    const maxH = Math.max(minH, vh - topSafePad - 16);
    const baseW = customSize?.width ?? (isMobile ? vw - 16 : 416);
    const baseH = customSize?.height ?? Math.min(Math.round(vh * (isMobile ? 0.72 : 0.76)), 610);
    const width = Math.max(minW, Math.min(maxW, baseW));
    const height = Math.max(minH, Math.min(maxH, baseH));
    const rightGap = isMobile ? 8 : 20;
    const bottomGap = isMobile ? 12 : 20;
    const left = Math.max(8, Math.min(vw - width - 8, vw - rightGap - width));
    const top = Math.max(topSafePad, Math.min(vh - height - 8, vh - bottomGap - height));
    return { left, top, width, height };
  };

  const [windowRect, setWindowRect] = useState<WindowRect>(() => {
    try {
      const saved = localStorage.getItem('paperlink_chat_window_size');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.width === 'number' && typeof parsed?.height === 'number') {
          return getDefaultRect({ width: parsed.width, height: parsed.height });
        }
      }
    } catch {
      // ignore storage errors
    }
    return getDefaultRect();
  });
  const [activeResizeDir, setActiveResizeDir] = useState<ResizeDir | null>(null);
  const windowRectRef = useRef(windowRect);
  useEffect(() => {
    windowRectRef.current = windowRect;
  }, [windowRect]);

  const hasCustomMovedRef = useRef(false);

  // Re-anchor cleanly when activeView changes (unless user dragged it manually) & clamp on viewport resize
  useEffect(() => {
    const syncToViewport = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setWindowRect((prev) => {
        if (!hasCustomMovedRef.current || vw < 640) {
          return getDefaultRect(vw < 640 ? null : { width: prev.width, height: prev.height });
        }
        const minW = Math.min(320, Math.max(260, vw - 16));
        const minH = Math.min(340, Math.max(260, vh - 24));
        const width = Math.max(minW, Math.min(vw - 16, prev.width));
        const height = Math.max(minH, Math.min(vh - 24, prev.height));
        const left = Math.max(8, Math.min(vw - width - 8, prev.left));
        const top = Math.max(8, Math.min(vh - height - 8, prev.top));
        return { left, top, width, height };
      });
    };
    syncToViewport();
    window.addEventListener('resize', syncToViewport);
    return () => window.removeEventListener('resize', syncToViewport);
  }, [activeView, isOpen]);

  const startWindowInteraction = (dir: ResizeDir, e: React.PointerEvent) => {
    if (e.button !== 0 || (typeof window !== 'undefined' && window.innerWidth < 640)) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...windowRectRef.current };
    setActiveResizeDir(dir);
    if (dir === 'move') {
      hasCustomMovedRef.current = true;
    }

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const minW = Math.min(320, Math.max(260, vw - 16));
      const minH = Math.min(360, Math.max(280, vh - 24));
      const maxRight = vw - 8;
      const maxBottom = vh - 8;

      if (dir === 'move') {
        const left = Math.max(8, Math.min(vw - startRect.width - 8, startRect.left + dx));
        const top = Math.max(8, Math.min(vh - startRect.height - 8, startRect.top + dy));
        setWindowRect({ left, top, width: startRect.width, height: startRect.height });
        return;
      }

      let { left, top, width, height } = startRect;
      const rightEdge = startRect.left + startRect.width;
      const bottomEdge = startRect.top + startRect.height;

      if (dir.includes('w')) {
        const clampedLeft = Math.max(8, Math.min(rightEdge - minW, startRect.left + dx));
        left = clampedLeft;
        width = rightEdge - clampedLeft;
      }
      if (dir.includes('e')) {
        width = Math.max(minW, Math.min(maxRight - startRect.left, startRect.width + dx));
      }
      if (dir.includes('n')) {
        const clampedTop = Math.max(8, Math.min(bottomEdge - minH, startRect.top + dy));
        top = clampedTop;
        height = bottomEdge - clampedTop;
      }
      if (dir.includes('s')) {
        height = Math.max(minH, Math.min(maxBottom - startRect.top, startRect.height + dy));
      }

      setWindowRect({ left, top, width, height });
    };

    const onPointerUp = () => {
      document.body.style.userSelect = prevUserSelect;
      setActiveResizeDir(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      try {
        localStorage.setItem(
          'paperlink_chat_window_size',
          JSON.stringify({
            width: Math.round(windowRectRef.current.width),
            height: Math.round(windowRectRef.current.height),
          })
        );
      } catch {
        // ignore storage restrictions
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const resetWindowSize = () => {
    hasCustomMovedRef.current = false;
    const def = getDefaultRect(null);
    setWindowRect(def);
    try {
      localStorage.removeItem('paperlink_chat_window_size');
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  useEffect(() => {
    if (typeof soundEnabled === 'boolean') {
      setIsSoundEnabled(soundEnabled);
      isSoundEnabledRef.current = soundEnabled;
    }
  }, [soundEnabled]);

  useEffect(() => {
    setSpeedMode(defaultSpeedMode);
  }, [defaultSpeedMode]);

  const toggleChatSound = () => {
    const next = !isSoundEnabled;
    setIsSoundEnabled(next);
    isSoundEnabledRef.current = next;
    try {
      localStorage.setItem('paperlink_chat_sound', next ? 'on' : 'muted');
    } catch {
      // ignore storage restrictions
    }
    if (next) {
      typewriterAudio.unlock();
      playOutputSuccessSound();
    }
    onSoundEnabledChange?.(next);
  };

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

  const prefersReducedMotion = useReducedMotion();

  const handleMinimizeToTopBar = () => {
    setActiveResizeDir(null);
    setIsDragOver(false);
    setIsOpen(false);
    onMinimizeChange?.(true);
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hi! I am **PaperLink AI**, trained on every tool inside this website.\n\nAttach a PDF, Word file, or image using **+** below and tell me what to do:\n- **AI Solver**: Fill empty Lab Manual tables, answers & diagrams in-place — OR attach 100% authentic separate Answer Sheet pages to Question Papers\n- **Compress** a PDF or shrink an image\n- **Convert** PDF to Word, Word, PPT, Excel & more\n- **Open** files directly in **Cover Studio**`,
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compactPromptInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProducedFilesRef = useRef<File[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy, execStatus, isOpen]);

  const handleSkipTyping = (hasArtifacts: boolean) => {
    setTypingMsgId(null);
    setTypedCharCount(0);
    if (isSoundEnabledRef.current) {
      if (hasArtifacts) {
        playOutputSuccessSound();
      } else {
        typewriterAudio.playSoftBell();
      }
    }
  };

  // 2x faster typewriter text reveal while keeping the slower 1x mechanical keystroke sound cadence
  useEffect(() => {
    if (!typingMsgId) return;
    const targetMsg = messages.find((m) => m.id === typingMsgId);
    if (!targetMsg || !targetMsg.text) {
      setTypingMsgId(null);
      return;
    }

    const fullText = targetMsg.text;
    const step = fullText.length > 650 ? 2 : 1;
    const baseTickMs =
      fullText.length <= 280 ? 27 : fullText.length <= 650 ? 20 : 24;
    const minSoundIntervalMs =
      fullText.length <= 280 ? 54 : fullText.length <= 650 ? 44 : 48;

    let cursor = 0;
    let lastSoundAt = 0;
    let timerId: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      cursor = Math.min(fullText.length, cursor + step);
      setTypedCharCount(cursor);

      const ch = fullText[cursor - 1] || '';
      if (isSoundEnabledRef.current && ch) {
        const now = performance.now();
        if (lastSoundAt === 0 || now - lastSoundAt >= minSoundIntervalMs) {
          lastSoundAt = now;
          const isSpaceOrPunct = /[\s.,!?;:\n-]/.test(ch);
          typewriterAudio.playChatKeyStroke(isSpaceOrPunct);
        }
      }

      if (cursor % 20 === 0 || cursor >= fullText.length) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }

      if (cursor >= fullText.length) {
        timerId = window.setTimeout(() => {
          if (cancelled) return;
          setTypingMsgId(null);
          if (isSoundEnabledRef.current && !targetMsg.isError) {
            if (targetMsg.artifacts && targetMsg.artifacts.length > 0) {
              playOutputSuccessSound();
            } else {
              typewriterAudio.playSoftBell();
            }
          }
        }, 75);
        return;
      }

      const extraPause = /[.!?\n]/.test(ch) ? 28 : /[,;:]/.test(ch) ? 14 : 0;
      timerId = window.setTimeout(tick, baseTickMs + extraPause);
    };

    timerId = window.setTimeout(tick, 45);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [typingMsgId]);

  const handleAttachFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    if (isSoundEnabledRef.current) {
      typewriterAudio.unlock();
      typewriterAudio.playSendTick();
    }
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
    const ppts = files.filter(isPptFile);
    const excels = files.filter(isExcelFile);
    const textFiles = files.filter(isTextFile);
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

      case 'ppt_to_pdf': {
        if (ppts.length === 0) throw new Error('Attach a PowerPoint (.pptx) file to convert to PDF.');
        const layoutRaw = String(args.layout || 'slide-fit');
        const layout =
          layoutRaw === 'a4-landscape' || layoutRaw === 'a4-portrait' ? layoutRaw : 'slide-fit';
        for (const ppt of ppts) {
          setExecStatus(`${prefix}Converting ${ppt.name} to PDF...`);
          const res = await convertPptToPdf(
            ppt,
            { layout, includeNotes: Boolean(args.includeNotes) },
            (_p, st) => setExecStatus(`${prefix}${st}`)
          );
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `pptpdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.slideCount} slides · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(`Converted **${ppt.name}** to **${res.fileName}** (${res.slideCount} slides).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PPT → PDF',
          producedFiles,
          consumedKind: 'ppt',
          producedKind: 'pdf',
        };
      }

      case 'ppt_to_images': {
        if (ppts.length === 0) throw new Error('Attach a PowerPoint (.pptx) file to export as images.');
        const fmtRaw = String(args.format || 'png').toLowerCase();
        const format = fmtRaw === 'jpg' || fmtRaw === 'webp' ? fmtRaw : 'png';
        const scale = Number(args.scale) === 2 ? 2 : Number(args.scale) === 1 ? 1 : 1.5;
        setExecStatus(`${prefix}Exporting ${ppts[0].name} slides...`);
        const res = await convertPptToImages(
          ppts[0],
          { format, scale, quality: 0.92 },
          (_p, st) => setExecStatus(`${prefix}${st}`)
        );
        if (res.zipBlob) {
          artifacts.push({
            id: `zip_ppt_${Date.now()}`,
            fileName: res.zipFileName,
            summary: `ZIP with ${res.slides.length} rendered slides (.${format})`,
            blob: res.zipBlob,
            kind: 'zip',
          });
        }
        for (const sl of res.slides) {
          const imgFile = new File([sl.blob], sl.fileName, { type: sl.blob.type || `image/${format}` });
          producedFiles.push(imgFile);
          if (artifacts.length < 5) {
            artifacts.push({
              id: `pptsl_${sl.slideNumber}_${Date.now()}`,
              fileName: sl.fileName,
              summary: `Slide ${sl.slideNumber} · ${sl.width}×${sl.height} (${formatBytes(sl.sizeBytes)})`,
              blob: sl.blob,
              kind: 'image',
              fileObj: imgFile,
              dataUrl: sl.dataUrl,
            });
          }
        }
        return {
          summaryText: `Exported **${res.slides.length}** slide(s) from **${ppts[0].name}** as **.${format.toUpperCase()}**.`,
          artifacts,
          badge: 'PPT → Image',
          producedFiles,
          consumedKind: 'ppt',
          producedKind: 'image',
        };
      }

      case 'excel_to_pdf': {
        if (excels.length === 0) throw new Error('Attach an Excel or CSV file (.xlsx, .xls, .csv) to convert to PDF.');
        const orientation = args.orientation === 'portrait' ? 'portrait' : 'landscape';
        const paperSize = args.paperSize === 'letter' ? 'letter' : 'a4';
        for (const xl of excels) {
          setExecStatus(`${prefix}Converting ${xl.name} to PDF...`);
          const res = await convertExcelToPdf(
            xl,
            { orientation, paperSize },
            (_p, st) => setExecStatus(`${prefix}${st}`)
          );
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `xlpdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.sheetCount} sheet(s) · ${res.pageCount} page(s) · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(`Converted **${xl.name}** to **${res.fileName}** (${res.pageCount} pages).`);
        }
        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'Excel → PDF',
          producedFiles,
          consumedKind: 'excel',
          producedKind: 'pdf',
        };
      }

      case 'excel_to_images': {
        if (excels.length === 0) throw new Error('Attach an Excel or CSV file (.xlsx, .xls, .csv) to export as images.');
        const fmtRaw = String(args.format || 'png').toLowerCase();
        const format = fmtRaw === 'jpg' || fmtRaw === 'webp' ? fmtRaw : 'png';
        const scale = Number(args.scale) === 2 ? 2 : Number(args.scale) === 1 ? 1 : 1.5;
        setExecStatus(`${prefix}Rendering ${excels[0].name} sheets...`);
        const res = await convertExcelToImages(
          excels[0],
          { format, scale, quality: 0.92 },
          (_p, st) => setExecStatus(`${prefix}${st}`)
        );
        if (res.zipBlob) {
          artifacts.push({
            id: `zip_xl_${Date.now()}`,
            fileName: res.zipFileName,
            summary: `ZIP with ${res.pages.length} rendered sheet image(s)`,
            blob: res.zipBlob,
            kind: 'zip',
          });
        }
        for (const pg of res.pages) {
          const imgFile = new File([pg.blob], pg.fileName, { type: pg.blob.type || `image/${format}` });
          producedFiles.push(imgFile);
          if (artifacts.length < 5) {
            artifacts.push({
              id: `xlpg_${pg.pageNumber}_${Date.now()}`,
              fileName: pg.fileName,
              summary: `${pg.sheetName} · ${pg.width}×${pg.height} (${formatBytes(pg.sizeBytes)})`,
              blob: pg.blob,
              kind: 'image',
              fileObj: imgFile,
              dataUrl: pg.dataUrl,
            });
          }
        }
        return {
          summaryText: `Rendered **${res.pages.length}** spreadsheet image(s) from **${excels[0].name}** as **.${format.toUpperCase()}**.`,
          artifacts,
          badge: 'Excel → Image',
          producedFiles,
          consumedKind: 'excel',
          producedKind: 'image',
        };
      }

      case 'pdf_to_excel': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to extract tables into Excel/CSV.');
        const format = args.format === 'csv' ? 'csv' : 'xlsx';
        setExecStatus(`${prefix}Extracting ${pdfs[0].name} tables to ${format.toUpperCase()}...`);
        const res = await convertPdfToExcel(
          pdfs[0],
          { format },
          (_p, st) => setExecStatus(`${prefix}${st}`)
        );
        const outFile = new File([res.blob], res.fileName, {
          type:
            format === 'csv'
              ? 'text/csv'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        producedFiles.push(outFile);
        artifacts.push({
          id: `pdfxl_${Date.now()}`,
          fileName: res.fileName,
          summary: `${res.totalRows} rows · ${res.pageCount} page(s) (.${format})`,
          blob: res.blob,
          kind: 'word',
          fileObj: outFile,
        });
        return {
          summaryText: `Extracted **${res.totalRows} rows** from **${pdfs[0].name}** into **${res.fileName}**.`,
          artifacts,
          badge: `PDF → ${format.toUpperCase()}`,
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'excel',
        };
      }

      case 'pdf_to_ppt': {
        if (pdfs.length === 0) throw new Error('Attach a PDF file to convert into PowerPoint (.pptx).');
        const scale = Number(args.scale) === 2 ? 2 : 1.5;
        setExecStatus(`${prefix}Building PowerPoint deck from ${pdfs[0].name}...`);
        const res = await convertPdfToPpt(
          pdfs[0],
          { scale },
          (_p, st) => setExecStatus(`${prefix}${st}`)
        );
        const outFile = new File([res.blob], res.fileName, {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
        producedFiles.push(outFile);
        artifacts.push({
          id: `pdfppt_${Date.now()}`,
          fileName: res.fileName,
          summary: `${res.slideCount} slides (.pptx) · ${formatBytes(res.blob.size)}`,
          blob: res.blob,
          kind: 'word',
          fileObj: outFile,
        });
        return {
          summaryText: `Converted **${pdfs[0].name}** (${res.slideCount} pages) into **${res.fileName}**.`,
          artifacts,
          badge: 'PDF → PPT',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'ppt',
        };
      }

      case 'text_to_pdf': {
        const paperSize: 'a4' | 'letter' = args.paperSize === 'letter' ? 'letter' : 'a4';
        const pastedContent = typeof args.contentText === 'string' ? args.contentText.trim() : '';

        if (textFiles.length === 0 && !pastedContent) {
          throw new Error('Attach a .txt/.md file or paste text in your prompt to convert to PDF.');
        }

        const sources: Array<{ title: string; body: string }> = [];
        if (textFiles.length > 0) {
          for (const tf of textFiles) {
            sources.push({
              title: tf.name.replace(/\.[^/.]+$/, ''),
              body: await tf.text(),
            });
          }
        } else {
          sources.push({
            title: String(args.title || 'paperlink_notes'),
            body: pastedContent,
          });
        }

        for (const src of sources) {
          setExecStatus(`${prefix}Converting "${src.title}" text to PDF...`);
          const res = await convertTextToPdf(src.body, src.title, paperSize);
          const safeBuf = new Uint8Array(res.bytes).slice().buffer;
          const outBlob = new Blob([safeBuf], { type: 'application/pdf' });
          const cleanName =
            src.title.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
          const outFileName = `${cleanName}.pdf`;
          const outFile = new File([outBlob], outFileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `txtpdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: outFileName,
            summary: `${res.pageCount} page(s) · ${paperSize.toUpperCase()} PDF (${formatBytes(outBlob.size)})`,
            blob: outBlob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(`Created **${outFileName}** (${res.pageCount} page${res.pageCount === 1 ? '' : 's'}).`);
        }

        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'Text → PDF',
          producedFiles,
          consumedKind: textFiles.length > 0 ? 'text' : 'none',
          producedKind: 'pdf',
        };
      }

      case 'organize_pdf_pages': {
        if (pdfs.length === 0) {
          throw new Error('Attach or create a PDF first before rotating, keeping, or deleting pages.');
        }
        const rotateDegRaw = Number(args.rotateDegrees || 0);
        const rotateDeg = (((rotateDegRaw % 360) + 360) % 360);
        const rotatePagesExpr =
          typeof args.rotatePagesExpr === 'string' ? args.rotatePagesExpr.trim() : '';
        const deletePagesExpr =
          typeof args.deletePagesExpr === 'string' ? args.deletePagesExpr.trim() : '';
        const keepPagesExpr =
          typeof args.keepPagesExpr === 'string' ? args.keepPagesExpr.trim() : '';
        const reverseOrder = args.reverseOrder === true;

        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Organizing pages in ${pdf.name}...`);
          const info = await inspectPdfSource(pdf);
          const maxPages = Math.max(1, info.pageCount);

          let pagesOrder: PdfPageThumb[] = Array.from({ length: maxPages }, (_, idx) => ({
            originalIndex: idx,
            pageNumber: idx + 1,
            thumbnailUrl: '',
            rotationDelta: 0,
            deleted: false,
          }));

          if (keepPagesExpr) {
            const keepSet = new Set(parsePageRange(keepPagesExpr, maxPages));
            pagesOrder = pagesOrder.map((p) => ({
              ...p,
              deleted: !keepSet.has(p.originalIndex),
            }));
          }

          if (deletePagesExpr) {
            const delSet = new Set(parsePageRange(deletePagesExpr, maxPages));
            pagesOrder = pagesOrder.map((p) => ({
              ...p,
              deleted: p.deleted || delSet.has(p.originalIndex),
            }));
          }

          if (rotateDeg !== 0) {
            const rotSet = rotatePagesExpr
              ? new Set(parsePageRange(rotatePagesExpr, maxPages))
              : null;
            pagesOrder = pagesOrder.map((p) => ({
              ...p,
              rotationDelta: !rotSet || rotSet.has(p.originalIndex) ? rotateDeg : p.rotationDelta,
            }));
          }

          if (reverseOrder) {
            pagesOrder = [...pagesOrder].reverse();
          }

          const res = await transformPdfPages(pdf, pagesOrder, (_p, st) =>
            setExecStatus(`${prefix}${st}`)
          );
          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `org_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.pageCount} page(s) · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(
            `Updated **${pdf.name}** → **${res.fileName}** (${res.pageCount} page${
              res.pageCount === 1 ? '' : 's'
            }${rotateDeg ? `, rotated ${rotateDeg}°` : ''}${
              reverseOrder ? ', reversed order' : ''
            }).`
          );
        }

        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'PDF Organized',
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'stamp_pdf': {
        if (pdfs.length === 0) {
          throw new Error('Attach or create a PDF first so I can apply a stamp.');
        }
        const stampText = String(args.text || 'APPROVED').trim().toUpperCase().slice(0, 28) || 'APPROVED';
        const stampColor =
          typeof args.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(args.color.trim())
            ? args.color.trim()
            : /approved|verified|final/i.test(stampText)
            ? '#16a34a'
            : /draft|pending/i.test(stampText)
            ? '#d97706'
            : '#dc2626';
        const pagesArg = String(args.pages || 'all').trim().toLowerCase();
        const pos = String(args.position || 'top-right').trim().toLowerCase();

        const boxCoords =
          pos === 'top-left'
            ? { xFraction: 0.06, yFraction: 0.05 }
            : pos === 'bottom-right'
            ? { xFraction: 0.66, yFraction: 0.86 }
            : pos === 'center'
            ? { xFraction: 0.34, yFraction: 0.45 }
            : { xFraction: 0.66, yFraction: 0.05 };

        for (const pdf of pdfs) {
          setExecStatus(`${prefix}Stamping "${stampText}" onto ${pdf.name}...`);
          const info = await inspectPdfSource(pdf);
          const maxPages = Math.max(1, info.pageCount);
          const targetPageNums: number[] =
            pagesArg === 'all' || !pagesArg
              ? Array.from({ length: maxPages }, (_, idx) => idx + 1)
              : pagesArg === 'first'
              ? [1]
              : parsePageRange(pagesArg, maxPages).map((idx) => idx + 1);

          const elements: PdfStampEditElement[] = targetPageNums.map((pageNumber, idx) => ({
            id: `st_${Date.now()}_${idx}`,
            kind: 'stamp',
            pageNumber,
            xFraction: boxCoords.xFraction,
            yFraction: boxCoords.yFraction,
            widthFraction: 0.28,
            heightFraction: 0.075,
            text: stampText,
            color: stampColor,
          }));

          const res = await applyPdfEdits(pdf, elements, (_p, st) => setExecStatus(`${prefix}${st}`));
          const stampedName = `${pdf.name.replace(/\.pdf$/i, '')}_stamped.pdf`;
          const outFile = new File([res.blob], stampedName, { type: 'application/pdf' });
          producedFiles.push(outFile);
          artifacts.push({
            id: `stamp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: stampedName,
            summary: `"${stampText}" on ${targetPageNums.length} page(s) · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });
          notes.push(
            `Stamped **${stampText}** on ${targetPageNums.length} page(s) of **${pdf.name}**.`
          );
        }

        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: `Stamped: ${stampText}`,
          producedFiles,
          consumedKind: 'pdf',
          producedKind: 'pdf',
        };
      }

      case 'crop_rotate_image': {
        if (images.length === 0) {
          throw new Error('Attach at least one image to rotate, flip, or crop.');
        }
        const rotNum = (((Number(args.rotateDeg || 0) % 360) + 360) % 360);
        const rotateDeg: 0 | 90 | 180 | 270 =
          rotNum === 90 || rotNum === 180 || rotNum === 270 ? rotNum : 0;
        const flipH = args.flipH === true;
        const flipV = args.flipV === true;
        const ratioStr = String(args.aspectRatio || 'original').trim();
        const fmtRaw = String(args.format || 'png').toLowerCase();
        const format: 'png' | 'jpg' | 'webp' =
          fmtRaw === 'jpg' || fmtRaw === 'jpeg' ? 'jpg' : fmtRaw === 'webp' ? 'webp' : 'png';

        const parseAspect = (r: string): number | null => {
          const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(r);
          if (!m) return null;
          const w = parseFloat(m[1]);
          const h = parseFloat(m[2]);
          return w > 0 && h > 0 ? w / h : null;
        };
        const targetRatio = parseAspect(ratioStr);

        const zipList: { fileName: string; blob: Blob }[] = [];
        for (const img of images) {
          setExecStatus(`${prefix}Transforming ${img.name}...`);
          let cropX = 0;
          let cropY = 0;
          let cropW = 1;
          let cropH = 1;

          if (targetRatio) {
            const url = URL.createObjectURL(img);
            try {
              const el = await new Promise<HTMLImageElement>((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => reject(new Error('Image dimensions read failed'));
                im.src = url;
              });
              const swap = rotateDeg === 90 || rotateDeg === 270;
              const rw = swap ? el.naturalHeight : el.naturalWidth;
              const rh = swap ? el.naturalWidth : el.naturalHeight;
              const currentRatio = rw / Math.max(1, rh);
              if (currentRatio > targetRatio) {
                cropW = targetRatio / currentRatio;
                cropX = (1 - cropW) / 2;
              } else if (currentRatio < targetRatio) {
                cropH = currentRatio / targetRatio;
                cropY = (1 - cropH) / 2;
              }
            } finally {
              URL.revokeObjectURL(url);
            }
          }

          const res = await cropRotateFlipImage(img, {
            cropX,
            cropY,
            cropW,
            cropH,
            rotateDeg,
            flipH,
            flipV,
            format,
            quality: 0.92,
          });
          const outFile = new File([res.blob], res.fileName, { type: res.blob.type || `image/${format}` });
          producedFiles.push(outFile);
          zipList.push({ fileName: res.fileName, blob: res.blob });
          artifacts.push({
            id: `crp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${res.width}×${res.height}px · ${formatBytes(res.sizeBytes)}`,
            blob: res.blob,
            kind: 'image',
            fileObj: outFile,
            dataUrl: res.dataUrl,
          });
        }
        if (zipList.length > 1) {
          const zip = await createImagesZip(zipList);
          artifacts.unshift({
            id: `zip_crp_${Date.now()}`,
            fileName: 'paperlink_edited_images.zip',
            summary: `${zipList.length} edited images ZIP`,
            blob: zip,
            kind: 'zip',
          });
        }
        return {
          summaryText: `Transformed **${images.length}** image(s)${
            rotateDeg ? ` (rotated ${rotateDeg}°)` : ''
          }${targetRatio ? ` · cropped ${ratioStr}` : ''}.`,
          artifacts,
          badge: 'Crop / Rotate Image',
          producedFiles,
          consumedKind: 'image',
          producedKind: 'image',
        };
      }

      case 'filter_or_palette_image': {
        if (images.length === 0) {
          throw new Error('Attach at least one image to apply filters or extract its hex color palette.');
        }
        const preset = String(args.preset || 'none').toLowerCase();
        const filters: ImageFiltersConfig = { ...DEFAULT_IMAGE_FILTERS };
        if (preset === 'bw') {
          filters.grayscale = 100;
          filters.contrast = 112;
        } else if (preset === 'vintage') {
          filters.sepia = 78;
          filters.contrast = 108;
          filters.saturate = 85;
        } else if (preset === 'vivid') {
          filters.saturate = 142;
          filters.contrast = 115;
          filters.brightness = 104;
        } else if (preset === 'crisp') {
          filters.sharpen = true;
          filters.contrast = 108;
        }

        if (typeof args.grayscale === 'number') filters.grayscale = Math.max(0, Math.min(100, args.grayscale));
        if (typeof args.sepia === 'number') filters.sepia = Math.max(0, Math.min(100, args.sepia));
        if (typeof args.brightness === 'number') filters.brightness = Math.max(50, Math.min(180, args.brightness));
        if (typeof args.contrast === 'number') filters.contrast = Math.max(50, Math.min(180, args.contrast));
        if (typeof args.saturate === 'number') filters.saturate = Math.max(0, Math.min(200, args.saturate));
        if (typeof args.blur === 'number') filters.blur = Math.max(0, Math.min(10, args.blur));
        if (typeof args.sharpen === 'boolean') filters.sharpen = args.sharpen;

        const hasFilterChange =
          filters.brightness !== DEFAULT_IMAGE_FILTERS.brightness ||
          filters.contrast !== DEFAULT_IMAGE_FILTERS.contrast ||
          filters.saturate !== DEFAULT_IMAGE_FILTERS.saturate ||
          filters.hueRotate !== DEFAULT_IMAGE_FILTERS.hueRotate ||
          filters.blur !== DEFAULT_IMAGE_FILTERS.blur ||
          filters.grayscale !== DEFAULT_IMAGE_FILTERS.grayscale ||
          filters.sepia !== DEFAULT_IMAGE_FILTERS.sepia ||
          filters.sharpen;

        const extractPalette = args.extractPalette === true || !hasFilterChange;
        const fmtRaw = String(args.format || 'png').toLowerCase();
        const format: 'png' | 'jpg' | 'webp' =
          fmtRaw === 'jpg' || fmtRaw === 'jpeg' ? 'jpg' : fmtRaw === 'webp' ? 'webp' : 'png';

        if (hasFilterChange) {
          for (const img of images) {
            setExecStatus(`${prefix}Applying studio filters to ${img.name}...`);
            const res = await applyImageFilters(img, filters, format, 0.92);
            const outFile = new File([res.blob], res.fileName, { type: res.blob.type || `image/${format}` });
            producedFiles.push(outFile);
            artifacts.push({
              id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              fileName: res.fileName,
              summary: `Filtered · ${res.width}×${res.height}px (${formatBytes(res.sizeBytes)})`,
              blob: res.blob,
              kind: 'image',
              fileObj: outFile,
              dataUrl: res.dataUrl,
            });
          }
          notes.push(`Applied studio color filters to **${images.length}** image(s).`);
        }

        if (extractPalette) {
          setExecStatus(`${prefix}Extracting dominant color palette from ${images[0].name}...`);
          const swatches = await extractDominantPalette(images[0], 6);
          if (swatches.length > 0) {
            notes.push(
              `Extracted dominant palette for **${images[0].name}**: ${swatches
                .map((hex) => `\`${hex}\``)
                .join(' · ')}`
            );
          }
        }

        return {
          summaryText: notes.join('\n') || 'Image analysis complete.',
          artifacts,
          badge: hasFilterChange && extractPalette ? 'Filters + Hex Palette' : hasFilterChange ? 'Image Filters' : 'Hex Palette',
          producedFiles,
          consumedKind: hasFilterChange ? 'image' : 'none',
          producedKind: hasFilterChange ? 'image' : 'none',
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

      case 'solve_document_ai': {
        const solvableFiles = [...pdfs, ...words, ...images];
        if (solvableFiles.length === 0) {
          throw new Error(
            'Attach a Lab Manual, Worksheet, or Question Paper (PDF, Word .docx, or Image) first so I can solve it.'
          );
        }

        const modeRaw = String(args.mode || 'auto').toLowerCase();
        const mode: 'auto' | 'fill-in-place' | 'separate-answer-sheet' =
          modeRaw === 'fill-in-place' || modeRaw === 'fill' || modeRaw === 'in-place'
            ? 'fill-in-place'
            : modeRaw === 'separate-answer-sheet' || modeRaw === 'answer-sheet' || modeRaw === 'separate'
            ? 'separate-answer-sheet'
            : 'auto';

        const inkRaw = String(args.inkStyle || 'blue-ink').toLowerCase();
        const inkStyle: SolverInkStyle = inkRaw === 'black' ? 'black' : 'blue-ink';
        const instruction =
          typeof args.instruction === 'string' && args.instruction.trim()
            ? args.instruction.trim()
            : undefined;

        let lastConsumedKind: PipelineMediaKind = 'pdf';
        if (pdfs.length === 0 && words.length > 0) lastConsumedKind = 'word';
        else if (pdfs.length === 0 && words.length === 0 && images.length > 0) lastConsumedKind = 'image';

        for (let idx = 0; idx < solvableFiles.length; idx++) {
          const targetFile = solvableFiles[idx];
          setExecStatus(
            `${prefix}AI Solving ${targetFile.name}${
              solvableFiles.length > 1 ? ` (${idx + 1}/${solvableFiles.length})` : ''
            }...`
          );

          const res = await solveDocumentWithAI(
            targetFile,
            { userInstruction: instruction, mode, inkStyle },
            (st) => setExecStatus(`${prefix}${st}`)
          );

          const outFile = new File([res.blob], res.fileName, { type: 'application/pdf' });
          producedFiles.push(outFile);

          const modeSummary =
            res.answerSectionsCount > 0 && res.fillsApplied === 0
              ? `${res.answerSectionsCount} Qs solved · ${res.outputPageCount} pages`
              : res.answerSectionsCount > 0
              ? `${res.fillsApplied} in-place + ${res.answerSectionsCount} answer sheet Qs`
              : `${res.fillsApplied} fields filled${
                  res.diagramsDrawn > 0 ? ` + ${res.diagramsDrawn} diagram(s)` : ''
                }`;

          artifacts.push({
            id: `solve_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            summary: `${modeSummary} · ${formatBytes(res.blob.size)}`,
            blob: res.blob,
            kind: 'pdf',
            fileObj: outFile,
          });

          const details: string[] = [];
          if (res.fillsApplied > 0) details.push(`**${res.fillsApplied}** blank field(s)/table cell(s) filled in-place`);
          if (res.diagramsDrawn > 0) details.push(`**${res.diagramsDrawn}** diagram(s) drawn`);
          if (res.answerSectionsCount > 0) {
            details.push(
              `**${res.answerSectionsCount}** authentic answer section(s) attached as separate page(s) (${res.outputPageCount} total pages)`
            );
          }

          notes.push(
            `Solved **${targetFile.name}** (${
              res.chosenMode === 'separate-answer-sheet' ? 'Question Paper + Separate Answer Sheet' : 'Same-Format In-Place Fill'
            }): ${details.join(', ') || res.summaryNote}.`
          );
        }

        return {
          summaryText: notes.join('\n'),
          artifacts,
          badge: 'AI Document Solved',
          producedFiles,
          consumedKind: lastConsumedKind,
          producedKind: 'pdf',
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
    setExecStatus('Analyzing… Wait patiently, AI may take a moment to work on it.');
    // Unlock Web Audio inside the user's send gesture so typewriter clicks & chimes play reliably
    if (isSoundEnabledRef.current) {
      getOrUnlockAudioContext();
      typewriterAudio.unlock();
      typewriterAudio.playSendTick();
    }

    try {
      const availableSolveInputs =
        currentFiles.length > 0 ? currentFiles : lastProducedFilesRef.current;
      const hasSolvableAttachment = availableSolveInputs.some(
        (f) => isPdfFile(f) || isWordFile(f) || isImageFile(f)
      );
      const isDirectSolvePrompt =
        hasSolvableAttachment &&
        !(/\b(compress|merge|split|stamp|protect|lock|encrypt|cover\s+studio|convert\s+to\s+word|convert\s+word|convert\s+ppt|convert\s+excel|resize|crop|rotate|remove\s+bg)\b/i.test(
          trimmed
        )) &&
        (/^(?:ai\s+)?solve\b/i.test(trimmed) ||
          /fill\s+blanks|answer\s+sheet|solve\s+(?:this|my|the|all)\s+(?:lab|manual|sheet|paper|worksheet|assignment|pdf|doc)/i.test(
            trimmed
          ));

      let data: any = {};

      if (isDirectSolvePrompt) {
        const requestedMode = /separate\s+answer|only\s+answer\s+sheet|question\s+paper/i.test(
          trimmed
        )
          ? 'separate-answer-sheet'
          : /in[-\s]?place|fill\s+blanks\s+only/i.test(trimmed)
          ? 'fill-in-place'
          : 'auto';
        const inkStyle = /black\s+ink/i.test(trimmed) ? 'black' : 'blue-ink';
        data = {
          reply: '',
          functionCalls: [
            {
              name: 'solve_document_ai',
              args: {
                mode: requestedMode,
                inkStyle,
                instruction: trimmed,
              },
            },
          ],
        };
      } else {
        const encodedResults = await Promise.all(
          currentFiles.filter(isImageFile).slice(0, 3).map(createInlinePreviewBase64)
        );
        const inlineImages = encodedResults.filter(
          (item): item is { name: string; mimeType: string; base64Data: string } => item !== null
        );

        const chatPayloadStr = JSON.stringify({
          history: historySnapshot,
          message: trimmed,
          attachedFilesSummary: currentFiles.map((f) => ({
            name: f.name,
            sizeBytes: f.size,
            extension: getFileExt(f.name),
            mimeType: f.type,
          })),
          previousOutputsSummary: lastProducedFilesRef.current.map((f) => ({
            name: f.name,
            sizeBytes: f.size,
            extension: getFileExt(f.name),
          })),
          inlineImages,
          activeView,
          speedMode,
        });

        let resp: Response | null = null;
        let rawText = '';

        for (let chatAttempt = 0; chatAttempt < 2; chatAttempt++) {
          resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: chatPayloadStr,
          });
          rawText = await resp.text();
          try {
            data = rawText ? JSON.parse(rawText) : {};
            break;
          } catch {
            const looksHtml = /^\s*</.test(rawText);
            if (looksHtml && chatAttempt === 0) {
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }
            throw new Error(
              resp.status === 404
                ? 'Chat API route (/api/chat) was not found on this deployment. Please redeploy so /api/chat is published.'
                : `Unexpected server response (HTTP ${resp.status}). Please try again.`
            );
          }
        }

        if (!resp || !resp.ok) {
          throw new Error(data?.error || `Server error (${resp?.status ?? 500})`);
        }
      }

      const functionCalls: GeminiFunctionCall[] = Array.isArray(data.functionCalls)
        ? data.functionCalls
        : [];
      const collectedSummaries: string[] = [];
      const badges: string[] = [];
      const stepResults: ToolExecutionOutput[] = [];
      let failedStepNote: string | null = null;

      if (functionCalls.length > 0) {
        // Seed workingFiles with attached files, or reuse previous turn outputs seamlessly for follow-up commands
        let workingFiles =
          currentFiles.length > 0 ? [...currentFiles] : [...lastProducedFilesRef.current];
        const totalSteps = functionCalls.length;

        for (let i = 0; i < totalSteps; i++) {
          const fc = functionCalls[i];
          const stepLabel = totalSteps > 1 ? `Step ${i + 1}/${totalSteps}` : undefined;
          try {
            const result = await executeWebsiteTool(fc, workingFiles, stepLabel);
            stepResults.push(result);

            if (result.summaryText) {
              collectedSummaries.push(
                totalSteps > 1 ? `**${i + 1}.** ${result.summaryText}` : result.summaryText
              );
            }
            if (result.badge) badges.push(result.badge);

            // Feed produced output files cleanly into the next step while preserving untouched file types
            if (result.producedFiles.length > 0) {
              const remaining = workingFiles.filter((f) => {
                if (result.consumedKind === 'pdf' && isPdfFile(f)) return false;
                if (result.consumedKind === 'image' && isImageFile(f)) return false;
                if (result.consumedKind === 'word' && isWordFile(f)) return false;
                if (result.consumedKind === 'ppt' && isPptFile(f)) return false;
                if (result.consumedKind === 'excel' && isExcelFile(f)) return false;
                if (result.consumedKind === 'text' && isTextFile(f)) return false;
                return true;
              });
              workingFiles = [...result.producedFiles, ...remaining];
            }
          } catch (stepErr: any) {
            const msg = stepErr?.message || `Step ${i + 1} (${fc.name}) could not be completed.`;
            if (stepResults.length === 0) {
              throw stepErr;
            }
            failedStepNote = `Stopped at **Step ${i + 1}/${totalSteps}** (\`${fc.name}\`): ${msg}`;
            break;
          }
        }
      }

      // Show terminal unconsumed artifacts so multi-step & parallel workflows return exact final files cleanly
      const terminalArtifacts: ChatArtifact[] = [];
      stepResults.forEach((stepRes, idx) => {
        if (stepRes.artifacts.length === 0) return;
        const consumedByLaterStep =
          stepRes.producedKind !== 'none' &&
          stepResults
            .slice(idx + 1)
            .some(
              (later) =>
                later.consumedKind === stepRes.producedKind && later.producedFiles.length > 0
            );
        if (!consumedByLaterStep) {
          terminalArtifacts.push(...stepRes.artifacts);
        }
      });

      const producedTurnFiles = terminalArtifacts
        .map((art) => art.fileObj)
        .filter((f): f is File => Boolean(f));
      if (producedTurnFiles.length > 0) {
        lastProducedFilesRef.current = producedTurnFiles.slice(0, 8);
      }

      const modelTextParts = [data.reply, ...collectedSummaries, failedStepNote].filter(
        (t) => typeof t === 'string' && t.trim().length > 0
      );
      const finalReply =
        modelTextParts.join('\n\n') ||
        'Completed cleanly! Download your output file below.';

      const replyMsgId = `m_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: replyMsgId,
          role: 'model',
          text: finalReply,
          artifacts: terminalArtifacts,
          actionBadge: badges.join(' → ') || undefined,
          modelUsed: data.modelUsed,
        },
      ]);
      setTypedCharCount(0);
      setTypingMsgId(replyMsgId);
    } catch (err: any) {
      const errMsgId = `err_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: errMsgId,
          role: 'model',
          text: err?.message || 'Something went wrong while communicating with PaperLink AI.',
          isError: true,
        },
      ]);
      setTypedCharCount(0);
      setTypingMsgId(errMsgId);
    } finally {
      setIsBusy(false);
      setExecStatus(null);
    }
  };

  // Context-aware suggestion chips when files are attached
  const hasAttachedPdf = attachedFiles.some(isPdfFile);
  const hasAttachedWord = attachedFiles.some(isWordFile);
  const hasAttachedPpt = attachedFiles.some(isPptFile);
  const hasAttachedExcel = attachedFiles.some(isExcelFile);
  const hasAttachedText = attachedFiles.some(isTextFile);
  const hasAttachedImg = attachedFiles.some(isImageFile);

  const quickChips: string[] =
    attachedFiles.length > 1
      ? ['Solve & fill all attached sheets', 'Convert all to PDF & merge them', 'Compress all files']
      : hasAttachedPpt
      ? ['Convert PPT to PDF', 'Export PPT slides as PNG']
      : hasAttachedExcel
      ? ['Convert Excel to PDF', 'Export Excel as PNG images']
      : hasAttachedText
      ? ['Convert text to PDF + add basic cover', 'Convert to PDF & stamp APPROVED']
      : hasAttachedPdf
      ? [
          'AI Solve (Fill blanks / Answer sheet)',
          'Solve with diagrams & blue ink',
          'Compress + add basic cover',
          'Convert to Word (.docx)',
        ]
      : hasAttachedWord
      ? ['AI Solve Word worksheet', 'Convert Word to PDF & compress', 'Open in Cover Studio']
      : hasAttachedImg
      ? [
          'AI Solve Paper / Worksheet',
          'Convert to PDF + basic cover (no QR)',
          'Remove BG & resize 1080×1080',
        ]
      : [
          'How does AI Lab Manual Solver work?',
          'What multiwork chains can you do?',
          'Take me to Image Studio',
        ];

  const dockPositionClass =
    activeView === 'studio' ? 'bottom-16 sm:bottom-5 right-3 sm:right-5' : 'bottom-4 sm:bottom-5 right-3 sm:right-5';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.ods,.txt,.md,.rtf,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleAttachFiles(e.target.files);
            setTimeout(() => compactPromptInputRef.current?.focus(), 60);
          }
          e.target.value = '';
        }}
      />

      {/* CONSTANT COMPACT BOTTOM-RIGHT "PAPERLINK AI" CRYSTAL GLASS BAR */}
      <AnimatePresence>
        {!isMinimized && !isOpen && (
          <motion.div
            key="paperlink-compact-dock"
            data-paperlink-compact-dock="true"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.16 } }
            }
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`no-print fixed ${dockPositionClass} z-40 w-[calc(100vw-1.5rem)] max-w-[360px] sm:w-[348px]`}
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
              {/* 3D Robot Mascot Sitting Right Above the Compact AI Chatbot Card */}
              {showMiniRobot && (
                <div className="absolute -top-[44px] sm:-top-[48px] right-4 z-30 pointer-events-auto">
                  <MiniAiRobot
                    variant="chatbot-perch"
                    expressionOverride={
                      isDragOver
                        ? 'surprised'
                        : isBusy || execStatus
                        ? 'thinking'
                        : typingMsgId
                        ? 'sparkle'
                        : undefined
                    }
                    externalPopup={
                      isDragOver
                        ? { text: 'Drop your files right in!' }
                        : isBusy || execStatus
                        ? { text: execStatus || 'Working on your files...' }
                        : undefined
                    }
                    quickActions={[
                      { label: 'Open AI', onClick: () => setIsOpen(true) },
                      ...(onOpenFeedback ? [{ label: 'Feedback', onClick: onOpenFeedback }] : []),
                    ]}
                    onPopupClick={() => setIsOpen(true)}
                    onFeedbackClick={onOpenFeedback}
                    title="Click to say hi (or poke 3x!)"
                  />
                </div>
              )}

              {/* Soft Water-Caustic Crystal Halo with Yellow & Sky Refraction */}
              {neonGlowMode === 'full' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-2 rounded-[30px] bg-gradient-to-tr from-sky-200/30 via-white/35 to-yellow-300/24 dark:from-sky-400/14 dark:via-white/[0.05] dark:to-yellow-400/12 blur-xl"
                />
              )}

              {/* Apple Clear Crystal Water Glass Shell */}
              <div className="relative rounded-[24px] overflow-hidden bg-white/54 dark:bg-[var(--pl-chatbot-bg)] bg-gradient-to-b from-white/78 via-sky-50/15 to-white/46 dark:from-white/[0.13] dark:via-sky-300/[0.04] dark:to-white/[0.04] backdrop-blur-2xl backdrop-saturate-[195%] border border-white/88 dark:border-white/[0.22] ring-1 ring-inset ring-white/75 dark:ring-white/[0.14] shadow-[0_22px_54px_-14px_rgba(15,23,42,0.18),0_4px_18px_-4px_rgba(var(--pl-glow-rgb),0.22),inset_0_1.5px_0_rgba(255,255,255,0.96)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.68),0_0_24px_-6px_rgba(var(--pl-glow-rgb),0.14),inset_0_1.5px_0_rgba(255,255,255,0.28)]">
                {/* Specular Water Meniscus & Surface Refraction */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_16%_0%,rgba(255,255,255,0.72),transparent_65%)] dark:bg-[radial-gradient(ellipse_90%_55%_at_16%_0%,rgba(255,255,255,0.18),transparent_65%)]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-5 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/95 dark:via-white/60 to-transparent"
                />

                {isDragOver && (
                  <div className="absolute inset-0 z-30 bg-yellow-400/25 dark:bg-yellow-950/60 backdrop-blur-xl border-2 border-dashed border-yellow-400 rounded-[24px] flex items-center justify-center gap-2 p-3">
                    <Paperclip className="w-4 h-4 text-amber-800 dark:text-yellow-300" />
                    <span className="text-xs font-bold text-zinc-950 dark:text-white">
                      Drop file to attach
                    </span>
                  </div>
                )}

                {/* Compact Frosted Header Strip */}
                <div className="relative px-3.5 py-2.5 border-b border-black/[0.06] dark:border-white/[0.10] bg-white/32 dark:bg-white/[0.03] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isBusy ? (
                      <ClipingPapersLogo size="xs" showWordmark={false} />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-yellow-400/90 dark:bg-yellow-400/22 border border-yellow-300 dark:border-yellow-400/45 text-zinc-950 dark:text-yellow-300 flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(var(--pl-accent-rgb),0.28),inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                        <Bot className="w-3.5 h-3.5 stroke-[2.25]" />
                      </div>
                    )}
                    <span className="text-xs font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                      {isBusy ? (
                        <>
                          Cliping <span className="text-amber-600 dark:text-yellow-400">Papers</span>
                        </>
                      ) : (
                        <>
                          PaperLink <span className="text-amber-600 dark:text-yellow-400">AI</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsOpen(true)}
                      aria-label="Expand PaperLink AI chat"
                      title="Expand full chat"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/20 dark:bg-yellow-400/[0.12] hover:bg-yellow-400/35 dark:hover:bg-yellow-400/[0.22] border border-yellow-400/60 dark:border-yellow-400/30 text-[10px] font-semibold text-zinc-900 dark:text-yellow-100 transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                    >
                      <Maximize2 className="w-3 h-3 text-amber-700 dark:text-yellow-400" />
                      <span>{messages.length > 1 ? `Chat (${messages.length - 1})` : 'Expand'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleMinimizeToTopBar}
                      aria-label="Minimize chatbot to top bar"
                      title="Minimize to top bar near PaperLink logo"
                      className="w-8 h-8 sm:w-auto sm:h-auto sm:p-1.5 rounded-full bg-white/75 dark:bg-white/[0.10] hover:bg-yellow-400/25 dark:hover:bg-yellow-400/[0.18] border border-zinc-200 dark:border-white/[0.16] text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-yellow-200 transition-all cursor-pointer shrink-0 flex items-center justify-center shadow-xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Compact Attached Files Strip */}
                {attachedFiles.length > 0 && (
                  <div className="relative px-3 pt-2 flex flex-wrap gap-1.5">
                    {attachedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}_${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-400/18 dark:bg-yellow-400/[0.12] border border-yellow-400/50 dark:border-yellow-400/30 text-[10px] font-mono text-zinc-900 dark:text-yellow-100 max-w-full shadow-xs"
                      >
                        <span className="truncate max-w-[155px] font-semibold">{file.name}</span>
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
                            className="text-amber-700 dark:text-yellow-300 hover:opacity-80 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachedFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          className="text-zinc-600 dark:text-zinc-300 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Compact Circular (+) Attach & Frosted Input Bar */}
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
                  className="relative px-3 py-2.5 flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach PDF, Word, or Image file"
                    title="Attach file (PDF, Word, PPT, Excel, Text, Image)"
                    className="w-9 h-9 rounded-full bg-yellow-400/24 dark:bg-yellow-400/18 hover:bg-yellow-400/42 dark:hover:bg-yellow-400/30 border border-yellow-400/70 dark:border-yellow-400/40 text-amber-800 dark:text-yellow-300 flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-[0_2px_10px_rgba(var(--pl-accent-rgb),0.16),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-95"
                  >
                    <Plus className="w-4 h-4 stroke-[2.25]" />
                  </button>

                  <input
                    ref={compactPromptInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      attachedFiles.length > 0
                        ? `Prompt for ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}...`
                        : 'Ask or drop files for multiwork...'
                    }
                    aria-label="Type Prompt Here"
                    className="flex-1 min-w-0 px-3 py-2 rounded-full bg-white/52 dark:bg-white/[0.07] border border-white/80 dark:border-white/[0.16] text-xs sm:text-[13px] font-medium text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400/85 focus:bg-white/75 dark:focus:bg-white/[0.12] transition-all shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
                  />

                  <button
                    type="submit"
                    aria-label="Run PaperLink AI prompt"
                    className="w-9 h-9 rounded-full bg-[var(--pl-cta-via)] hover:bg-[var(--pl-cta-from)] text-[var(--pl-cta-text)] border border-[var(--pl-cta-border)] font-bold flex items-center justify-center shrink-0 cursor-pointer shadow-[0_4px_14px_rgba(var(--pl-accent-rgb),0.38)] transition-all active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5 stroke-[2.25]" />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXPANDED RESIZABLE APPLE CLEAR CRYSTAL WATER CHATBOT WINDOW */}
      <AnimatePresence>
        {!isMinimized && isOpen && (
          <motion.div
            key="paperlink-expanded-window"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }
            }
            transition={{
              duration: activeResizeDir ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              left: `${windowRect.left}px`,
              top: `${windowRect.top}px`,
              width: `${windowRect.width}px`,
              height: `${windowRect.height}px`,
            }}
            className="no-print fixed z-40"
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
            {/* OS-Style Edge & Corner Resize Handles (Desktop sm+ only so mobile Minimize/Close buttons are never blocked) */}
            <div
              onPointerDown={(e) => startWindowInteraction('n', e)}
              onDoubleClick={resetWindowSize}
              title="Drag to resize height (double-click to reset size)"
              className="hidden sm:block absolute -top-1.5 left-4 right-4 h-3 z-30 cursor-ns-resize touch-none"
            />
            <div
              onPointerDown={(e) => startWindowInteraction('s', e)}
              onDoubleClick={resetWindowSize}
              title="Drag to resize height (double-click to reset size)"
              className="hidden sm:block absolute -bottom-1.5 left-4 right-4 h-3 z-30 cursor-ns-resize touch-none"
            />
            <div
              onPointerDown={(e) => startWindowInteraction('w', e)}
              onDoubleClick={resetWindowSize}
              title="Drag to resize width (double-click to reset size)"
              className="hidden sm:block absolute top-4 bottom-4 -left-1.5 w-3 z-30 cursor-ew-resize touch-none"
            />
            <div
              onPointerDown={(e) => startWindowInteraction('e', e)}
              onDoubleClick={resetWindowSize}
              title="Drag to resize width (double-click to reset size)"
              className="hidden sm:block absolute top-4 bottom-4 -right-1.5 w-3 z-30 cursor-ew-resize touch-none"
            />

            {/* 4 Corner Handles (Desktop sm+ only) */}
            <div
              onPointerDown={(e) => startWindowInteraction('nw', e)}
              onDoubleClick={resetWindowSize}
              title="Drag corner to stretch window (double-click to reset)"
              className="hidden sm:flex group absolute -top-1.5 -left-1.5 w-5 h-5 z-40 cursor-nwse-resize touch-none items-start justify-start p-1"
            >
              <span className="w-2.5 h-2.5 rounded-tl-[5px] border-t-2 border-l-2 border-amber-500/45 dark:border-yellow-400/45 group-hover:border-amber-500 dark:group-hover:border-yellow-300 transition-colors" />
            </div>
            <div
              onPointerDown={(e) => startWindowInteraction('ne', e)}
              onDoubleClick={resetWindowSize}
              title="Drag corner to stretch window (double-click to reset)"
              className="hidden sm:flex group absolute -top-1.5 -right-1.5 w-5 h-5 z-40 cursor-nesw-resize touch-none items-start justify-end p-1"
            >
              <span className="w-2.5 h-2.5 rounded-tr-[5px] border-t-2 border-r-2 border-transparent group-hover:border-amber-500 dark:group-hover:border-yellow-300 transition-colors" />
            </div>
            <div
              onPointerDown={(e) => startWindowInteraction('sw', e)}
              onDoubleClick={resetWindowSize}
              title="Drag corner to stretch window (double-click to reset)"
              className="hidden sm:flex group absolute -bottom-1.5 -left-1.5 w-5 h-5 z-40 cursor-nesw-resize touch-none items-end justify-start p-1"
            >
              <span className="w-2.5 h-2.5 rounded-bl-[5px] border-b-2 border-l-2 border-transparent group-hover:border-amber-500 dark:group-hover:border-yellow-300 transition-colors" />
            </div>
            <div
              onPointerDown={(e) => startWindowInteraction('se', e)}
              onDoubleClick={resetWindowSize}
              title="Drag corner to stretch window (double-click to reset)"
              className="hidden sm:flex group absolute -bottom-1.5 -right-1.5 w-5 h-5 z-40 cursor-nwse-resize touch-none items-end justify-end p-1"
            >
              <span className="w-2.5 h-2.5 rounded-br-[5px] border-b-2 border-r-2 border-amber-500/45 dark:border-yellow-400/45 group-hover:border-amber-500 dark:group-hover:border-yellow-300 transition-colors" />
            </div>

            {/* Live Resize Dimension Badge */}
            {activeResizeDir && activeResizeDir !== 'move' && (
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-50 px-2.5 py-0.5 rounded-full bg-zinc-950/90 text-yellow-300 border border-yellow-400/40 text-[10px] font-mono font-bold shadow-lg whitespace-nowrap">
                {Math.round(windowRect.width)} × {Math.round(windowRect.height)} px
              </div>
            )}

            {/* 3D Robot Perched Sitting Above the Expanded Bottom-Right Chatbot Card */}
            {showMiniRobot && windowRect.top >= 46 && (
              <div className="hidden sm:block absolute -top-[48px] right-6 z-40 pointer-events-auto">
                <MiniAiRobot
                  variant="chatbot-perch"
                  expressionOverride={
                    isDragOver
                      ? 'surprised'
                      : isBusy || execStatus
                      ? 'thinking'
                      : typingMsgId
                      ? 'sparkle'
                      : undefined
                  }
                  externalPopup={
                    isDragOver
                      ? { text: 'Drop your files right here!' }
                      : isBusy || execStatus
                      ? { text: execStatus || 'Processing your request...' }
                      : undefined
                  }
                  quickActions={[
                    { label: 'Focus Input', onClick: () => compactPromptInputRef.current?.focus() },
                    ...(onOpenFeedback ? [{ label: 'Feedback', onClick: onOpenFeedback }] : []),
                  ]}
                  onClick={() => compactPromptInputRef.current?.focus()}
                  onFeedbackClick={onOpenFeedback}
                  title="PaperLink Assistant"
                />
              </div>
            )}

            {/* Soft Water-Caustic Crystal Halo with Sky & Yellow Refraction */}
            {neonGlowMode === 'full' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-3 rounded-[34px] bg-gradient-to-tr from-sky-200/28 via-white/35 to-yellow-300/22 dark:from-sky-400/14 dark:via-white/[0.05] dark:to-yellow-400/12 blur-2xl"
              />
            )}

            {/* Apple Liquid Crystal Glass Outer Frame */}
            <div className="relative h-full flex flex-col rounded-[26px] overflow-hidden bg-white/54 dark:bg-[var(--pl-chatbot-bg)] bg-gradient-to-b from-white/78 via-sky-50/15 to-white/46 dark:from-white/[0.13] dark:via-sky-300/[0.04] dark:to-white/[0.04] backdrop-blur-2xl backdrop-saturate-[195%] border border-white/88 dark:border-white/[0.22] ring-1 ring-inset ring-white/75 dark:ring-white/[0.14] shadow-[0_28px_72px_-14px_rgba(15,23,42,0.20),0_6px_24px_-4px_rgba(var(--pl-glow-rgb),0.22),inset_0_1.5px_0_rgba(255,255,255,0.96)] dark:shadow-[0_32px_76px_-12px_rgba(0,0,0,0.72),0_0_28px_-6px_rgba(var(--pl-glow-rgb),0.16),inset_0_1.5px_0_rgba(255,255,255,0.28)]">
              {/* Top Specular Meniscus & Curved Glass Highlight */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_42%_at_18%_0%,rgba(255,255,255,0.72),transparent_65%)] dark:bg-[radial-gradient(ellipse_90%_42%_at_18%_0%,rgba(255,255,255,0.18),transparent_65%)]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/95 dark:via-white/60 to-transparent z-20"
              />

              {/* Frosted Crystal Header (Drag to Move · Double-Click to Reset Size) */}
              <div
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  startWindowInteraction('move', e);
                }}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  resetWindowSize();
                }}
                title="Drag to move window · Drag corners/edges to resize · Double-click to reset"
                className="relative px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.10] bg-white/35 dark:bg-white/[0.04] flex items-center justify-between gap-2 shrink-0 cursor-grab active:cursor-grabbing select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-yellow-400/90 dark:bg-yellow-400/22 border border-yellow-300 dark:border-yellow-400/45 text-zinc-950 dark:text-yellow-300 flex items-center justify-center shrink-0 shadow-[0_3px_12px_rgba(var(--pl-accent-rgb),0.30),inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    <Bot className="w-4 h-4 stroke-[2.25]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                      PaperLink <span className="text-amber-600 dark:text-yellow-400">AI</span>
                    </h3>
                    <p className="hidden sm:block text-[10px] text-zinc-600 dark:text-zinc-300/80 truncate">
                      Multiwork pipelines · Drag corners to resize
                    </p>
                  </div>
                </div>

                <div className="relative z-30 flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = speedMode === 'balanced' ? 'fast' : 'balanced';
                      setSpeedMode(next);
                      onSpeedModeChange?.(next);
                    }}
                    title={
                      speedMode === 'balanced'
                        ? 'Model: gemini-4-hydrogen (Smart Multiwork Agent)'
                        : 'Model: gemini-3.1-flash-lite (Fast Chat)'
                    }
                    className={`px-2 sm:px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer transition-all shadow-xs ${
                      speedMode === 'fast'
                        ? 'border-yellow-400/85 dark:border-yellow-400/45 bg-yellow-400/28 text-amber-950 dark:text-yellow-200'
                        : 'border-yellow-400/60 dark:border-yellow-400/30 bg-yellow-400/16 dark:bg-yellow-400/[0.10] text-zinc-900 dark:text-yellow-100'
                    }`}
                  >
                    <Zap className="w-3 h-3 text-amber-700 dark:text-yellow-400" />
                    <span>{speedMode === 'fast' ? 'Fast' : 'Smart'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleChatSound}
                    title={
                      isSoundEnabled
                        ? 'Typewriter & completion sound on — click to mute'
                        : 'Typewriter & completion sound muted — click to unmute'
                    }
                    aria-label={isSoundEnabled ? 'Mute typewriter and output sound' : 'Unmute typewriter and output sound'}
                    className={`w-8 h-8 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border cursor-pointer transition-all shadow-xs ${
                      isSoundEnabled
                        ? 'border-yellow-400/80 dark:border-yellow-400/40 bg-yellow-400/24 text-amber-800 dark:text-yellow-300 hover:bg-yellow-400/35'
                        : 'border-white/75 dark:border-white/[0.16] bg-white/55 dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {isSoundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCredits((p) => !p)}
                    title="Developer Credits — Team Terminators"
                    className={`hidden sm:flex p-1.5 rounded-full border cursor-pointer transition-all shadow-xs ${
                      showCredits
                        ? 'border-yellow-400/85 dark:border-yellow-400/45 bg-yellow-400/28 text-amber-900 dark:text-yellow-200'
                        : 'border-white/75 dark:border-white/[0.16] bg-white/55 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:bg-yellow-400/18 hover:text-zinc-950 dark:hover:text-yellow-200'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      lastProducedFilesRef.current = [];
                      setTypingMsgId(null);
                      setTypedCharCount(0);
                      setMessages([
                        {
                          id: 'welcome',
                          role: 'model',
                          text: 'Conversation cleared! Drop or attach files below for single or multiwork pipelines.',
                        },
                      ]);
                    }}
                    title="Clear chat history"
                    className="w-8 h-8 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/[0.16] bg-white/65 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-all shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleMinimizeToTopBar}
                    title="Minimize to top bar near PaperLink logo"
                    aria-label="Minimize chatbot to top bar"
                    className="w-9 h-9 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/[0.16] bg-white/75 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 hover:bg-yellow-400/20 hover:text-zinc-950 dark:hover:text-yellow-200 cursor-pointer transition-all shadow-xs"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Collapse to bottom-right compact bar"
                    aria-label="Collapse AI Assistant"
                    className="w-8 h-8 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/[0.16] bg-white/75 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 hover:bg-yellow-400/20 hover:text-zinc-950 dark:hover:text-yellow-200 cursor-pointer transition-all shadow-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Developer Credits Strip */}
              {showCredits && (
                <div className="relative px-4 py-2.5 bg-yellow-400/12 dark:bg-yellow-400/[0.06] border-b border-black/[0.06] dark:border-white/[0.10] text-[11px] space-y-1 shrink-0">
                  <p className="font-bold text-amber-800 dark:text-yellow-300">
                    Developed by Team Terminators:
                  </p>
                  <p className="font-mono text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    Lead: Atif Ubed · 2. Sufyan Ali · 3. Muhammad Bilal · 4. Muhammad Arham · 5. Manahil Shamsi
                  </p>
                </div>
              )}

              {/* Scrollable Multi-Turn Conversation Thread */}
              <div className="relative flex-1 overflow-y-auto p-3.5 space-y-3">
                {isDragOver && (
                  <div className="absolute inset-2 rounded-2xl border-2 border-dashed border-yellow-400 bg-yellow-400/22 dark:bg-yellow-950/65 backdrop-blur-xl z-10 flex flex-col items-center justify-center text-center p-4">
                    <Paperclip className="w-7 h-7 text-amber-700 dark:text-yellow-300 mb-2" />
                    <p className="text-xs font-bold text-zinc-950 dark:text-white">
                      Drop PDF, Word, PPT, Excel, Text, or Images to Attach
                    </p>
                  </div>
                )}

                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const isCopied = copiedMsgId === msg.id;
                  const isActivelyTyping =
                    !isUser && typingMsgId === msg.id && typedCharCount < msg.text.length;
                  const visibleText = isActivelyTyping
                    ? stabilizePartialMarkdown(msg.text.slice(0, typedCharCount))
                    : msg.text;
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
                            <span className="w-4 h-4 rounded-full bg-yellow-400/85 dark:bg-yellow-400/22 border border-yellow-300 dark:border-yellow-400/40 text-zinc-950 dark:text-yellow-300 flex items-center justify-center shadow-xs">
                              <Bot className="w-2.5 h-2.5 stroke-[2.25]" />
                            </span>
                            <span className="text-[10px] font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
                              PaperLink <span className="text-amber-600 dark:text-yellow-400">AI</span>
                            </span>
                          </div>
                          {!msg.isError && msg.text && (
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.id, msg.text)}
                              aria-label="Copy message"
                              title="Copy response"
                              className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-amber-700 dark:hover:text-yellow-300 transition-colors cursor-pointer"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
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
                        className={`max-w-[92%] rounded-[20px] px-3.5 py-2.5 text-xs leading-relaxed ${
                          isUser
                            ? 'bg-yellow-400/88 dark:bg-yellow-400/24 backdrop-blur-md border border-yellow-300/90 dark:border-yellow-300/35 text-zinc-950 dark:text-yellow-50 font-medium rounded-br-md shadow-[0_8px_22px_-6px_rgba(var(--pl-accent-rgb),0.38),inset_0_1px_0_rgba(255,255,255,0.68)] dark:shadow-[0_8px_22px_-6px_rgba(var(--pl-accent-rgb),0.18),inset_0_1px_0_rgba(255,255,255,0.22)]'
                            : msg.isError
                            ? 'bg-rose-500/15 dark:bg-rose-500/20 backdrop-blur-md border border-rose-300/70 dark:border-rose-400/35 text-rose-800 dark:text-rose-200 rounded-bl-md'
                            : 'bg-white/65 dark:bg-white/[0.08] backdrop-blur-md border border-white/85 dark:border-white/[0.15] text-zinc-900 dark:text-zinc-100 rounded-bl-md shadow-[0_4px_16px_-6px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                        }`}
                      >
                        {msg.actionBadge && (
                          <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-400/22 border border-yellow-500/45 text-amber-900 dark:text-yellow-200 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 shrink-0 text-amber-700 dark:text-yellow-300" />
                            <span>{msg.actionBadge}</span>
                          </div>
                        )}

                        {msg.attachedNames && msg.attachedNames.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {msg.attachedNames.map((n) => (
                              <span
                                key={n}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/10 dark:bg-yellow-300/15 border border-black/15 dark:border-yellow-300/30 text-[10px] font-mono font-semibold text-zinc-950 dark:text-yellow-50"
                              >
                                <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate max-w-[200px]">{n}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        <ChatMarkdown content={visibleText} isUser={isUser} />

                        {isActivelyTyping && (
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-amber-700 dark:text-yellow-300">
                              <span
                                aria-hidden="true"
                                className="inline-block w-1.5 h-3.5 bg-amber-600 dark:bg-yellow-300 rounded-[1px] animate-pulse"
                              />
                              <span>Typing...</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleSkipTyping(Boolean(msg.artifacts && msg.artifacts.length > 0))
                              }
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-400/20 hover:bg-yellow-400/35 border border-yellow-500/35 text-amber-900 dark:text-yellow-200 cursor-pointer transition-colors"
                            >
                              Skip →
                            </button>
                          </div>
                        )}

                        {/* Frosted Crystal Output Result Cards */}
                        {msg.artifacts && msg.artifacts.length > 0 && !isActivelyTyping && (
                          <div className="mt-3 space-y-2 pt-2.5 border-t border-black/[0.06] dark:border-white/[0.10]">
                            {msg.artifacts.map((art) => (
                              <div
                                key={art.id}
                                className="p-2.5 rounded-2xl bg-white/75 dark:bg-white/[0.07] border border-white/85 dark:border-white/[0.15] space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {art.dataUrl ? (
                                    <img
                                      src={art.dataUrl}
                                      alt={art.fileName}
                                      className="w-9 h-9 rounded-xl object-cover border border-white/80 dark:border-white/20 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-xl bg-yellow-400/20 border border-yellow-400/45 text-amber-700 dark:text-yellow-300 flex items-center justify-center shrink-0">
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
                                    <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
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
                                      className="py-1.5 px-2.5 rounded-xl border border-yellow-400/55 dark:border-yellow-400/30 bg-yellow-400/14 dark:bg-yellow-400/[0.10] hover:bg-yellow-400/26 dark:hover:bg-yellow-400/[0.20] text-amber-900 dark:text-yellow-200 text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-all"
                                      title="Preview generated document"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Preview</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => triggerDownload(art.blob, art.fileName)}
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-zinc-950 text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer shadow-[0_4px_12px_rgba(var(--pl-accent-rgb),0.32),inset_0_1px_0_rgba(255,255,255,0.65)] transition-all"
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
                                      className="py-1.5 px-2.5 rounded-xl bg-zinc-900/90 dark:bg-white/15 hover:bg-zinc-900 dark:hover:bg-white/25 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                      <ExternalLink className="w-3 h-3 text-yellow-300" />
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
                                      className="py-1.5 px-2.5 rounded-xl bg-zinc-900/90 dark:bg-white/15 hover:bg-zinc-900 dark:hover:bg-white/25 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                      <ExternalLink className="w-3 h-3 text-yellow-300" />
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
                    <div className="px-3.5 py-2.5 rounded-[18px] rounded-bl-md bg-yellow-400/18 dark:bg-yellow-400/[0.12] backdrop-blur-md border border-yellow-400/50 dark:border-yellow-400/30 shadow-[0_4px_16px_rgba(var(--pl-accent-rgb),0.16),inset_0_1px_0_rgba(255,255,255,0.65)]">
                      <ClipingPapersLogo
                        size="sm"
                        layout="inline"
                        statusText={
                          execStatus ||
                          'Fetching results… Wait patiently, AI may take a moment to work on it.'
                        }
                      />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Context Frosted Yellow Chips */}
              <div className="relative px-3 py-1.5 border-t border-black/[0.06] dark:border-white/[0.10] bg-white/20 dark:bg-white/[0.02] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {quickChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSend(chip)}
                    className="px-2.5 py-1 rounded-full border border-yellow-400/50 dark:border-yellow-400/28 bg-yellow-400/14 dark:bg-yellow-400/[0.09] hover:bg-yellow-400/30 dark:hover:bg-yellow-400/[0.20] text-[10px] font-semibold text-zinc-900 dark:text-yellow-100 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Attached Files Strip */}
              {attachedFiles.length > 0 && (
                <div className="relative px-3 pt-2 flex flex-wrap gap-1.5 shrink-0">
                  {attachedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}_${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-400/18 dark:bg-yellow-400/[0.12] border border-yellow-400/50 dark:border-yellow-400/30 text-[10px] font-mono text-zinc-900 dark:text-yellow-100 max-w-full shadow-xs"
                    >
                      <span className="truncate max-w-[145px] font-semibold">{file.name}</span>
                      <span className="text-zinc-600 dark:text-zinc-300 shrink-0">
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
                          className="text-amber-700 dark:text-yellow-300 hover:opacity-80 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachedFile(idx)}
                        aria-label={`Remove ${file.name}`}
                        className="text-zinc-600 dark:text-zinc-300 hover:text-red-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Frosted Glass Input Composer + Subtle Developer Credit Line */}
              <div className="relative p-3 border-t border-black/[0.06] dark:border-white/[0.10] bg-white/30 dark:bg-white/[0.03] space-y-2 shrink-0">
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
                    title="Attach PDF, Word, PPT, Excel, Text, or Image files"
                    aria-label="Attach file"
                    className="w-9 h-9 rounded-full border border-yellow-400/65 dark:border-yellow-400/35 bg-yellow-400/22 dark:bg-yellow-400/16 hover:bg-yellow-400/38 dark:hover:bg-yellow-400/28 text-amber-800 dark:text-yellow-300 flex items-center justify-center cursor-pointer shrink-0 transition-all shadow-[0_2px_8px_rgba(var(--pl-accent-rgb),0.14),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      attachedFiles.length > 0
                        ? 'Run single or multi-step workflow...'
                        : 'Ask anything or paste multi-step tasks...'
                    }
                    className="flex-1 min-w-0 px-3.5 py-2 text-xs rounded-full bg-white/55 dark:bg-white/[0.08] border border-white/80 dark:border-white/[0.16] focus:border-yellow-400/85 focus:bg-white/82 dark:focus:bg-white/[0.14] focus:outline-none text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 transition-all shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
                  />

                  <button
                    type="submit"
                    disabled={isBusy || (!input.trim() && attachedFiles.length === 0)}
                    aria-label="Send message"
                    className="w-9 h-9 rounded-full bg-[var(--pl-cta-via)] hover:bg-[var(--pl-cta-from)] disabled:opacity-40 text-[var(--pl-cta-text)] border border-[var(--pl-cta-border)] font-bold flex items-center justify-center cursor-pointer shrink-0 shadow-[0_4px_14px_rgba(var(--pl-accent-rgb),0.38)] transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <p className="text-[10px] text-center text-zinc-600 dark:text-zinc-400 truncate">
                  Developed by <span className="font-semibold text-zinc-800 dark:text-zinc-200">Team Terminators</span> · Lead: Atif Ubed
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
