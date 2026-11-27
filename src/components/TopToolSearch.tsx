import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Crop,
  Droplets,
  Edit3,
  Eraser,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Layers,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  PenTool,
  Presentation,
  QrCode,
  RefreshCw,
  RotateCw,
  ScanLine,
  Scissors,
  Search,
  Sliders,
  Stamp,
  Table2,
  X,
} from 'lucide-react';
import { AppView } from './Navbar';
import { PdfToolTab } from './PdfToolsPanel';
import { ImageToolTab } from './ImageToolsPanel';

export interface SearchableToolItem {
  id: string;
  title: string;
  category: 'Cover Studio' | 'PDF Tools' | 'Office' | 'Image Tools';
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  target:
    | { kind: 'view'; view: AppView | 'batch' | 'library' }
    | { kind: 'pdf'; tool: PdfToolTab }
    | { kind: 'image'; tool: ImageToolTab };
}

export const ALL_SEARCHABLE_TOOLS: SearchableToolItem[] = [
  // Cover Studio & Workspace
  {
    id: 'studio-cover',
    title: 'QR Cover Studio',
    category: 'Cover Studio',
    description: 'Create custom cover sheets with Drive QR codes',
    keywords: 'cover page builder qr drive sync theme print studio',
    icon: QrCode,
    target: { kind: 'view', view: 'studio' },
  },
  {
    id: 'studio-batch',
    title: 'Batch Cover Queue',
    category: 'Cover Studio',
    description: 'Generate multiple QR cover packets in one batch',
    keywords: 'batch multiple documents queue zip bulk upload',
    icon: Layers,
    target: { kind: 'view', view: 'batch' },
  },
  {
    id: 'studio-library',
    title: 'Document Library',
    category: 'Cover Studio',
    description: 'View saved Drive links, QR history & sent emails',
    keywords: 'library history saved links email log drive',
    icon: FolderOpen,
    target: { kind: 'view', view: 'library' },
  },

  // PDF Tools
  {
    id: 'pdf-edit',
    title: 'Edit PDF',
    category: 'PDF Tools',
    description: 'Add text, images, whiteout, shapes & freehand ink',
    keywords: 'editor annotate write draw whiteout insert picture',
    icon: Edit3,
    target: { kind: 'pdf', tool: 'pdf-edit' },
  },
  {
    id: 'pdf-merge',
    title: 'PDF Merge & Arrange',
    category: 'PDF Tools',
    description: 'Combine multiple PDFs and rearrange pages directly',
    keywords: 'merge combine join bind pdf rearrange order',
    icon: Layers,
    target: { kind: 'pdf', tool: 'pdf-merge' },
  },
  {
    id: 'pdf-organize',
    title: 'Rearrange, Rotate & Delete Pages',
    category: 'PDF Tools',
    description: 'Reorder PDF sequence, rotate scans, or remove pages',
    keywords: 'rearrange reorder organize rotate delete pages turn',
    icon: RotateCw,
    target: { kind: 'pdf', tool: 'pdf-organize' },
  },
  {
    id: 'pdf-to-word',
    title: 'PDF to Word (.docx)',
    category: 'PDF Tools',
    description: 'Convert PDF pages into editable Word documents',
    keywords: 'pdf to word docx convert editable document',
    icon: FileType2,
    target: { kind: 'pdf', tool: 'pdf-to-word' },
  },
  {
    id: 'word-to-pdf',
    title: 'Word to PDF',
    category: 'PDF Tools',
    description: 'Turn .docx documents into clean print-ready PDFs',
    keywords: 'word to pdf docx doc convert',
    icon: FileText,
    target: { kind: 'pdf', tool: 'word-to-pdf' },
  },
  {
    id: 'pdf-compress',
    title: 'Compress PDF',
    category: 'PDF Tools',
    description: 'Reduce PDF file size with live size preview',
    keywords: 'compress shrink optimize reduce size mb kb',
    icon: Minimize2,
    target: { kind: 'pdf', tool: 'pdf-compress' },
  },
  {
    id: 'pdf-split',
    title: 'Split & Extract PDF',
    category: 'PDF Tools',
    description: 'Extract custom page ranges or burst individual pages',
    keywords: 'split extract cut burst pages range',
    icon: Scissors,
    target: { kind: 'pdf', tool: 'pdf-split' },
  },
  {
    id: 'pdf-to-image',
    title: 'PDF to Image',
    category: 'PDF Tools',
    description: 'Export PDF pages as crisp PNG, JPG, or WebP + ZIP',
    keywords: 'pdf to image png jpg webp zip render export',
    icon: FileImage,
    target: { kind: 'pdf', tool: 'pdf-to-image' },
  },
  {
    id: 'image-to-pdf',
    title: 'Images to PDF',
    category: 'PDF Tools',
    description: 'Combine photos and scans into an A4 or Letter PDF',
    keywords: 'images to pdf jpg png photos combine scan',
    icon: ImageIcon,
    target: { kind: 'pdf', tool: 'image-to-pdf' },
  },
  {
    id: 'pdf-add-images',
    title: 'Add Pictures to PDF',
    category: 'PDF Tools',
    description: 'Place photos, ID cards, or logos onto PDF pages',
    keywords: 'add pictures images photo id logo insert pdf',
    icon: ImagePlus,
    target: { kind: 'pdf', tool: 'pdf-add-images' },
  },
  {
    id: 'pdf-scan-crop',
    title: 'Crop & Auto-Scan PDF',
    category: 'PDF Tools',
    description: 'Flatten phone photos, fix skew & clean shadows',
    keywords: 'crop scan perspective deskew camscanner clean flatten',
    icon: ScanLine,
    target: { kind: 'pdf', tool: 'pdf-scan-crop' },
  },
  {
    id: 'pdf-watermark-remove',
    title: 'PDF Watermark Remover',
    category: 'PDF Tools',
    description: 'Clean diagonal stamps and scanner marks from PDFs',
    keywords: 'remove watermark clean stamp erase pdf',
    icon: Droplets,
    target: { kind: 'pdf', tool: 'pdf-watermark-remove' },
  },
  {
    id: 'pdf-watermark-add',
    title: 'Watermark & Page Numbers',
    category: 'PDF Tools',
    description: 'Stamp CONFIDENTIAL/DRAFT text and page numbers',
    keywords: 'add watermark stamp page numbers header footer',
    icon: Stamp,
    target: { kind: 'pdf', tool: 'pdf-watermark-add' },
  },
  {
    id: 'pdf-sign',
    title: 'Sign & Stamp PDF',
    category: 'PDF Tools',
    description: 'Draw or upload a signature and stamp pages cleanly',
    keywords: 'sign signature stamp initial approve e-sign',
    icon: PenTool,
    target: { kind: 'pdf', tool: 'pdf-sign' },
  },
  {
    id: 'pdf-protect',
    title: 'Protect / Unlock PDF',
    category: 'PDF Tools',
    description: 'Add password encryption or unlock protected PDFs',
    keywords: 'protect lock password encrypt unlock decrypt security',
    icon: Lock,
    target: { kind: 'pdf', tool: 'pdf-protect' },
  },

  // Office Utilities
  {
    id: 'office-ppt-to-pdf',
    title: 'PPT to PDF',
    category: 'Office',
    description: 'Convert PowerPoint (.pptx) presentations to PDF',
    keywords: 'ppt pptx powerpoint slides to pdf',
    icon: Presentation,
    target: { kind: 'pdf', tool: 'ppt-to-pdf' },
  },
  {
    id: 'office-ppt-to-image',
    title: 'PPT to Image',
    category: 'Office',
    description: 'Export presentation slides as HD PNG/JPG images',
    keywords: 'ppt pptx powerpoint slides to image png jpg',
    icon: ImageIcon,
    target: { kind: 'pdf', tool: 'ppt-to-image' },
  },
  {
    id: 'office-excel-to-pdf',
    title: 'Excel to PDF',
    category: 'Office',
    description: 'Convert .xlsx or .csv spreadsheets into PDF tables',
    keywords: 'excel xlsx csv spreadsheet to pdf table',
    icon: FileSpreadsheet,
    target: { kind: 'pdf', tool: 'excel-to-pdf' },
  },
  {
    id: 'office-excel-to-image',
    title: 'Excel to Image',
    category: 'Office',
    description: 'Render spreadsheet tables into crisp image cards',
    keywords: 'excel xlsx csv to image table png',
    icon: ImageIcon,
    target: { kind: 'pdf', tool: 'excel-to-image' },
  },
  {
    id: 'office-pdf-to-excel',
    title: 'PDF to Excel',
    category: 'Office',
    description: 'Extract PDF tables into .xlsx or .csv sheets',
    keywords: 'pdf to excel xlsx csv extract table',
    icon: Table2,
    target: { kind: 'pdf', tool: 'pdf-to-excel' },
  },
  {
    id: 'office-pdf-to-ppt',
    title: 'PDF to PPT',
    category: 'Office',
    description: 'Build editable PowerPoint decks from PDF sheets',
    keywords: 'pdf to ppt pptx powerpoint slides',
    icon: Presentation,
    target: { kind: 'pdf', tool: 'pdf-to-ppt' },
  },

  // Image Tools
  {
    id: 'img-bg-remove',
    title: 'Background Remover',
    category: 'Image Tools',
    description: 'Remove image backgrounds locally with split preview',
    keywords: 'bg background remover cutout transparent eraser ai',
    icon: Eraser,
    target: { kind: 'image', tool: 'bg-remove' },
  },
  {
    id: 'img-bulk-bg-remove',
    title: 'Bulk BG Remover',
    category: 'Image Tools',
    description: 'Remove backgrounds across multiple photos into a ZIP',
    keywords: 'bulk batch background remove product photos zip',
    icon: Layers,
    target: { kind: 'image', tool: 'bulk-bg-remove' },
  },
  {
    id: 'img-photo-batch',
    title: 'Photo Batch Studio',
    category: 'Image Tools',
    description: 'Color looks, categorized presets, frames & ZIP export',
    keywords: 'photo batch studio presets filter frame watermark zip professional minimalist creative',
    icon: Images,
    target: { kind: 'image', tool: 'photo-batch' },
  },
  {
    id: 'img-watermark-remove',
    title: 'Image Watermark Remover',
    category: 'Image Tools',
    description: 'Brush or box-select unwanted text & marks from photos',
    keywords: 'watermark remover brush erase clean photo object',
    icon: Droplets,
    target: { kind: 'image', tool: 'watermark-remove' },
  },
  {
    id: 'img-blur-redact',
    title: 'Blur & Redact',
    category: 'Image Tools',
    description: 'Hide faces, phone numbers & sensitive areas',
    keywords: 'blur redact pixelate censor hide face phone privacy',
    icon: EyeOff,
    target: { kind: 'image', tool: 'blur-redact' },
  },
  {
    id: 'img-grid-collage',
    title: 'Photo Grid / IDs',
    category: 'Image Tools',
    description: 'Join front+back ID cards or build clean photo grids',
    keywords: 'grid collage id card front back combine photos',
    icon: LayoutGrid,
    target: { kind: 'image', tool: 'grid-collage' },
  },
  {
    id: 'img-resize',
    title: 'Image Resize',
    category: 'Image Tools',
    description: 'Resize photos for social, print, or custom pixels',
    keywords: 'resize dimensions width height pixels scale social',
    icon: Maximize2,
    target: { kind: 'image', tool: 'resize' },
  },
  {
    id: 'img-convert',
    title: 'Convert Image Format',
    category: 'Image Tools',
    description: 'Convert between PNG, JPG, WebP, BMP & ICO Favicons',
    keywords: 'convert format png jpg jpeg webp bmp ico favicon',
    icon: RefreshCw,
    target: { kind: 'image', tool: 'convert' },
  },
  {
    id: 'img-crop',
    title: 'Crop & Rotate Image',
    category: 'Image Tools',
    description: 'Crop 1:1, 4:5, 16:9 ratios, rotate or flip images',
    keywords: 'crop rotate flip aspect ratio trim',
    icon: Crop,
    target: { kind: 'image', tool: 'crop' },
  },
  {
    id: 'img-compress',
    title: 'Compress Image',
    category: 'Image Tools',
    description: 'Shrink JPG/WebP size with instant before/after preview',
    keywords: 'compress image shrink size quality optimize',
    icon: Minimize2,
    target: { kind: 'image', tool: 'compress' },
  },
  {
    id: 'img-filters',
    title: 'Filters & Hex Palette',
    category: 'Image Tools',
    description: 'Adjust color grading and extract top hex brand colors',
    keywords: 'filters hex color palette brightness contrast grade',
    icon: Sliders,
    target: { kind: 'image', tool: 'filters' },
  },
];

const QUICK_PICKS = new Set([
  'pdf-merge',
  'pdf-edit',
  'pdf-organize',
  'pdf-to-word',
  'img-bg-remove',
  'img-photo-batch',
  'studio-cover',
]);

interface TopToolSearchProps {
  onSelectTool: (tool: SearchableToolItem) => void;
  className?: string;
  autoFocus?: boolean;
  onAfterSelect?: () => void;
}

export const TopToolSearch: React.FC<TopToolSearchProps> = ({
  onSelectTool,
  className = '',
  autoFocus = false,
  onAfterSelect,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Global keyboard shortcuts: Cmd/Ctrl + K or "/" (when not typing in a field)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable =
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          activeTag === 'select' ||
          (document.activeElement as HTMLElement | null)?.isContentEditable;
        if (!isEditable && inputRef.current && inputRef.current.offsetParent !== null) {
          e.preventDefault();
          inputRef.current.focus();
          setIsOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return ALL_SEARCHABLE_TOOLS.filter((t) => QUICK_PICKS.has(t.id));
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = ALL_SEARCHABLE_TOOLS.map((tool) => {
      const titleLow = tool.title.toLowerCase();
      const catLow = tool.category.toLowerCase();
      const haystack = `${titleLow} ${catLow} ${tool.description.toLowerCase()} ${tool.keywords.toLowerCase()}`;
      if (!terms.every((t) => haystack.includes(t))) return null;

      let score = 0;
      if (titleLow === q) score += 100;
      else if (titleLow.startsWith(q)) score += 60;
      else if (titleLow.includes(q)) score += 35;
      else if (catLow.includes(q)) score += 15;
      else score += 5;
      return { tool, score };
    }).filter((x): x is { tool: SearchableToolItem; score: number } => x !== null);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map((s) => s.tool);
  }, [query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, isOpen]);

  const handlePick = (item: SearchableToolItem) => {
    onSelectTool(item);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
    onAfterSelect?.();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightIdx((prev) =>
        filteredTools.length === 0 ? 0 : (prev + 1) % filteredTools.length
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightIdx((prev) =>
        filteredTools.length === 0 ? 0 : (prev - 1 + filteredTools.length) % filteredTools.length
      );
      return;
    }
    if (e.key === 'Enter' && filteredTools.length > 0) {
      e.preventDefault();
      const target = filteredTools[highlightIdx] || filteredTools[0];
      if (target) handlePick(target);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="group relative flex items-center rounded-full">
        {/* Theme-matched rounded ambient glowing light */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-[2px] rounded-full blur-[6px] transition-opacity duration-300 ${
            isOpen
              ? 'opacity-90'
              : 'opacity-55 group-hover:opacity-80'
          }`}
          style={{
            background:
              'linear-gradient(95deg, rgba(var(--pl-accent-rgb), 0.55), rgba(var(--pl-glow-rgb), 0.45), rgba(var(--pl-accent-rgb), 0.55))',
          }}
        />
        <Search
          className={`w-3.5 h-3.5 absolute left-3 z-10 pointer-events-none transition-colors ${
            isOpen
              ? 'text-[var(--pl-accent-text)] dark:text-[var(--pl-accent)]'
              : 'text-zinc-500 dark:text-zinc-400 group-hover:text-[var(--pl-accent-text)] dark:group-hover:text-[var(--pl-accent)]'
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="paperlink-tool-search-list"
          aria-label="Search tools"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search tools..."
          className="relative z-10 w-full h-9 pl-8.5 pr-11 rounded-full border border-[var(--pl-accent)]/50 dark:border-[var(--pl-accent)]/45 bg-[var(--pl-surface)]/95 dark:bg-zinc-900/95 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-[0_0_16px_-3px_rgba(var(--pl-accent-rgb),0.4),0_0_6px_rgba(var(--pl-glow-rgb),0.22)] hover:border-[var(--pl-accent)]/75 focus:outline-none focus:border-[var(--pl-accent)] focus:bg-[var(--pl-surface)] dark:focus:bg-zinc-950 focus:shadow-[0_0_22px_-2px_rgba(var(--pl-accent-rgb),0.65),0_0_10px_rgba(var(--pl-glow-rgb),0.35)] transition-all duration-200"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear tool search"
            className="absolute right-2.5 z-10 p-0.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 border border-[var(--pl-accent)]/35 rounded-full absolute right-2 z-10 pointer-events-none select-none bg-zinc-50/80 dark:bg-zinc-800/80">
            /
          </kbd>
        )}
      </div>

      {isOpen && (
        <div
          id="paperlink-tool-search-list"
          role="listbox"
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-[360px] rounded-2xl border border-[var(--pl-accent)]/35 bg-white dark:bg-zinc-950 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.35),0_0_20px_-6px_rgba(var(--pl-accent-rgb),0.3)] z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">
              {query.trim() ? `Matches for "${query.trim()}"` : 'Quick Jump Tools'}
            </span>
            <span className="tabular-nums font-mono">{filteredTools.length}</span>
          </div>

          {filteredTools.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No matching tools found. Try &ldquo;merge&rdquo;, &ldquo;rearrange&rdquo;, &ldquo;word&rdquo;, or &ldquo;bg&rdquo;.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900/80">
              {filteredTools.map((tool, idx) => {
                const Icon = tool.icon;
                const active = idx === highlightIdx;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => handlePick(tool)}
                    className={`w-full px-3 py-2.5 text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-zinc-100 dark:bg-zinc-900'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center shrink-0 text-blue-700 dark:text-yellow-400">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white truncate">
                        <span className="truncate">{tool.title}</span>
                        <span className="text-zinc-400 dark:text-zinc-500 font-normal shrink-0">·</span>
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                          {tool.category}
                        </span>
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {tool.description}
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
