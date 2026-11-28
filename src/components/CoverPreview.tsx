import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppliedPdfStamp, CoverData, CoverDraggableKey, PdfStampPlacement, UploadedDocInfo } from '../types';
import { COVER_THEMES } from '../constants/themes';
import {
  getCoverFontCssFamily,
  hasBannerHeaderLayout,
  isCenteredCoverLayout,
  parseSummaryLines,
  resolveEffectiveColors,
} from '../utils/coverFormatting';
import { renderCustomTextStampDataUrl } from '../utils/stampRenderer';
import {
  ExternalLink,
  QrCode,
  Maximize2,
  Minimize2,
  Printer,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  FileText,
  CheckCircle2,
  Info,
  Eye,
  Loader2,
  Move,
  RotateCcw,
} from 'lucide-react';
import { EdgeGrabRobot } from './EdgeGrabRobot';

interface CoverPreviewProps {
  coverData: CoverData;
  currentDoc: UploadedDocInfo | null;
  driveLink: string | null;
  qrDataUrl: string | null;
  onPrint?: () => void;
  onFullPreview?: () => void;
  isPreparingFullPreview?: boolean;
  isDriveUploaded: boolean;
  onUpdateCoverData?: (updater: (prev: CoverData) => CoverData) => void;
}

const PAPER_W = 500;
const paperHeightFor = (size: CoverData['paperSize']) =>
  size === 'letter' ? Math.round((PAPER_W * 792) / 612) : Math.round((PAPER_W * 841.89) / 595.28);

interface FitPageProps {
  width: number;
  height: number;
  mode: 'contain' | 'width';
  onScaleChange?: (scale: number) => void;
  children: React.ReactNode;
}

const FitPage: React.FC<FitPageProps> = ({ width, height, mode, onScaleChange, children }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const byWidth = rect.width / width;
      const next = Math.max(
        0.05,
        mode === 'width' ? byWidth : rect.height > 0 ? Math.min(byWidth, rect.height / height) * 0.97 : byWidth
      );
      setScale(next);
      onScaleChange?.(next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height, mode, onScaleChange]);

  return (
    <div
      ref={hostRef}
      className={
        mode === 'contain'
          ? 'w-full h-full flex items-center justify-center overflow-hidden'
          : 'w-full flex justify-center'
      }
    >
      <div className="fit-wrapper flex-shrink-0" style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
};

export const CoverPreview: React.FC<CoverPreviewProps> = ({
  coverData,
  currentDoc,
  driveLink,
  qrDataUrl,
  onPrint,
  onFullPreview,
  isPreparingFullPreview = false,
  isDriveUploaded,
  onUpdateCoverData,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [dragMode, setDragMode] = useState(false);
  const [draggingKey, setDraggingKey] = useState<CoverDraggableKey | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const stageScrollRef = useRef<HTMLDivElement>(null);

  const dragSessionRef = useRef<{
    key: CoverDraggableKey;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    scale: number;
  } | null>(null);

  const theme = COVER_THEMES.find((t) => t.id === coverData.themeId) || COVER_THEMES[0];
  const paperH = paperHeightFor(coverData.paperSize);
  const includeQr = coverData.includeQr !== false;

  const {
    isDarkModeTheme,
    effectiveTitleColor,
    effectiveSubtitleColor,
    effectiveTextColor,
    effectiveBorderColor,
    effectiveBorderWidth,
  } = resolveEffectiveColors(coverData, theme);

  const isCentered = isCenteredCoverLayout(theme.layoutStyle);
  const isLeftBar = theme.layoutStyle === 'plain-left-bar';
  const isSplitCover = theme.layoutStyle === 'split-cover';
  const hasTopBanner = hasBannerHeaderLayout(theme.layoutStyle, !!coverData.backgroundImageUrl);

  const fontCssStyle: React.CSSProperties = {
    fontFamily: getCoverFontCssFamily(coverData.font),
    letterSpacing: coverData.font === 'oswald' ? '-0.01em' : undefined,
  };

  const originalPagesCount =
    currentDoc?.pageCount || (currentDoc?.renderedPagePreviews?.length ?? (currentDoc ? 1 : 0));
  const previewableOriginalCount =
    currentDoc?.renderedPagePreviews && currentDoc.renderedPagePreviews.length > 0
      ? currentDoc.renderedPagePreviews.length
      : currentDoc
      ? originalPagesCount
      : 0;
  const isPreviewCapped =
    !!currentDoc?.pageCount &&
    !!currentDoc?.renderedPagePreviews &&
    currentDoc.renderedPagePreviews.length > 0 &&
    currentDoc.pageCount > currentDoc.renderedPagePreviews.length;

  const totalPreviewPages = 1 + previewableOriginalCount;
  const totalExportPages = 1 + (currentDoc ? originalPagesCount : 0);

  useEffect(() => {
    if (activePageIndex > totalPreviewPages - 1) setActivePageIndex(0);
  }, [totalPreviewPages, activePageIndex]);

  // Pointer drag tracking on canvas
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ds = dragSessionRef.current;
      if (!ds || !onUpdateCoverData) return;
      const dx = Math.round((e.clientX - ds.startClientX) / ds.scale);
      const dy = Math.round((e.clientY - ds.startClientY) / ds.scale);
      const nx = Math.max(-240, Math.min(240, ds.origX + dx));
      const ny = Math.max(-340, Math.min(340, ds.origY + dy));
      onUpdateCoverData((prev) => ({
        ...prev,
        elementOffsets: {
          ...(prev.elementOffsets || {}),
          [ds.key]: { x: nx, y: ny },
        },
      }));
    };

    const onPointerUp = () => {
      if (dragSessionRef.current) {
        dragSessionRef.current = null;
        setDraggingKey(null);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onUpdateCoverData]);

  const hasAnyOffsets = !!(
    coverData.elementOffsets &&
    Object.values(coverData.elementOffsets).some((v) => v && (v.x !== 0 || v.y !== 0))
  );

  const getOffsetTransform = (key: CoverDraggableKey): React.CSSProperties => {
    const off = coverData.elementOffsets?.[key];
    if (!off || (off.x === 0 && off.y === 0)) return {};
    return { transform: `translate(${off.x}px, ${off.y}px)` };
  };

  const getDragProps = (key: CoverDraggableKey, extraStyle?: React.CSSProperties) => {
    const baseStyle: React.CSSProperties = {
      ...extraStyle,
      ...getOffsetTransform(key),
    };
    if (!onUpdateCoverData) {
      return { style: baseStyle };
    }
    const interactive = dragMode || draggingKey === key;
    return {
      style: {
        ...baseStyle,
        touchAction: dragMode ? ('none' as const) : ('auto' as const),
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl && targetEl.closest('button, a, input, textarea, select')) return;
        if (!dragMode && !e.altKey) {
          // Direct click-and-drag enabled by default on cover blocks! Track movement cleanly
        }
        e.stopPropagation();
        const cur = coverData.elementOffsets?.[key] || { x: 0, y: 0 };
        setDraggingKey(key);
        dragSessionRef.current = {
          key,
          startClientX: e.clientX,
          startClientY: e.clientY,
          origX: cur.x,
          origY: cur.y,
          scale: canvasScale || 1,
        };
      },
      className: `${dragMode ? 'cursor-move' : 'hover:cursor-grab active:cursor-grabbing'} transition-shadow select-none ${
        draggingKey === key
          ? 'ring-2 ring-yellow-400 rounded-md bg-yellow-400/12'
          : interactive
          ? 'hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md'
          : 'hover:ring-1 hover:ring-dotted hover:ring-yellow-400/60 rounded-md'
      }`,
      title: 'Drag with mouse to move this element anywhere on Cover',
    };
  };

  const syncStampText = coverData.showSyncTimestamp
    ? `Synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : '';
  const verificationParts = [
    coverData.version?.trim() ? `Rev ${coverData.version.trim()}` : '',
    syncStampText,
    coverData.expiryNote?.trim() || '',
  ].filter(Boolean);
  const verificationLine = verificationParts.join(' · ');

  const qrBlock = (
    <div {...getDragProps('qrBlock')} className={`flex flex-col items-center flex-shrink-0 ${dragMode ? 'cursor-move p-0.5 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md' : ''}`}>
      <div
        className="p-[8px] rounded-[10px] border shadow-md flex flex-col items-center"
        style={{ backgroundColor: coverData.qrBgColor || '#ffffff', borderColor: '#cbd5e1' }}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Drive Document QR Code"
            referrerPolicy="no-referrer"
            className="w-[108px] h-[108px] object-contain rounded-[4px] pointer-events-none"
          />
        ) : (
          <div className="w-[108px] h-[108px] bg-slate-100 rounded-[4px] flex flex-col items-center justify-center text-slate-400 p-[8px] text-center">
            <QrCode className="w-8 h-8 mb-1" />
            <span className="text-[9px]">Preparing QR</span>
          </div>
        )}

        <span
          className="text-[8px] font-bold tracking-wider mt-[6px] uppercase text-center leading-none"
          style={{ color: '#0f172a' }}
        >
          Scan For Drive Copy
        </span>
      </div>

      <p className="text-[9px] text-center max-w-[130px] mt-[6px] opacity-75 leading-[1.25]">
        {coverData.qrCallToAction || 'Scan with phone camera to view full soft copy on Google Drive.'}
      </p>
    </div>
  );

  const metaBlock = (
    <div
      {...getDragProps('metaBlock', { color: effectiveTextColor })}
      className={`space-y-[7px] text-[12px] ${dragMode ? 'cursor-move p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md' : ''}`}
    >
      {coverData.preparedBy && (
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block leading-tight">
            Prepared By
          </span>
          <span className="font-semibold leading-tight">{coverData.preparedBy}</span>
        </div>
      )}

      {coverData.date && (
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block leading-tight">
            Date
          </span>
          <span className="font-medium opacity-90 leading-tight">{coverData.date}</span>
        </div>
      )}

      {verificationLine && (
        <div className="text-[8.5px] font-mono font-bold tracking-tight" style={{ color: coverData.accentColor }}>
          {verificationLine}
        </div>
      )}

      {includeQr && (
        <div className="pt-[3px] text-[9px] opacity-60 font-mono">Official Soft Copy · Google Drive</div>
      )}
    </div>
  );

  const signatureNode = coverData.signatureUrl ? (
    <div
      {...getDragProps('signature')}
      className={`inline-flex flex-col items-center ${dragMode ? 'cursor-move p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md' : ''}`}
    >
      <img
        src={coverData.signatureUrl}
        alt="Authorized signature"
        className="h-[36px] max-w-[125px] object-contain pointer-events-none"
      />
      <div
        className="w-[115px] border-t mt-[2px] pt-[2px] text-center text-[9px] font-semibold opacity-80 truncate"
        style={{ borderColor: effectiveTextColor, color: effectiveTextColor }}
      >
        {coverData.signatureLabel || coverData.preparedBy || 'Authorized Signature'}
      </div>
    </div>
  ) : null;

  const renderCustomBorderOverlay = () => {
    const style = coverData.borderStyle || 'none';
    if (style === 'none') return null;

    if (style === 'solid') {
      return (
        <div
          className="absolute inset-[14px] pointer-events-none z-20"
          style={{
            border: `${effectiveBorderWidth}px solid ${effectiveBorderColor}`,
            borderRadius: coverData.borderRadius ?? 6,
          }}
        />
      );
    }
    if (style === 'dashed') {
      return (
        <div
          className="absolute inset-[14px] pointer-events-none z-20"
          style={{
            border: `${effectiveBorderWidth}px dashed ${effectiveBorderColor}`,
            borderRadius: coverData.borderRadius ?? 6,
          }}
        />
      );
    }
    if (style === 'double') {
      return (
        <div
          className="absolute inset-[12px] pointer-events-none z-20"
          style={{
            border: `${effectiveBorderWidth}px solid ${effectiveBorderColor}`,
            borderRadius: coverData.borderRadius ?? 4,
          }}
        >
          <div
            className="absolute inset-[5px] pointer-events-none"
            style={{
              border: `1px solid ${coverData.accentColor}`,
              borderRadius: Math.max(0, (coverData.borderRadius ?? 4) - 2),
            }}
          />
        </div>
      );
    }
    if (style === 'corner-accents') {
      const b = `${effectiveBorderWidth + 1}px`;
      return (
        <div className="absolute inset-[16px] pointer-events-none z-20">
          <div className="absolute top-0 left-0 w-[26px] h-[26px]" style={{ borderTop: `${b} solid ${effectiveBorderColor}`, borderLeft: `${b} solid ${effectiveBorderColor}` }} />
          <div className="absolute top-0 right-0 w-[26px] h-[26px]" style={{ borderTop: `${b} solid ${effectiveBorderColor}`, borderRight: `${b} solid ${effectiveBorderColor}` }} />
          <div className="absolute bottom-0 left-0 w-[26px] h-[26px]" style={{ borderBottom: `${b} solid ${effectiveBorderColor}`, borderLeft: `${b} solid ${effectiveBorderColor}` }} />
          <div className="absolute bottom-0 right-0 w-[26px] h-[26px]" style={{ borderBottom: `${b} solid ${effectiveBorderColor}`, borderRight: `${b} solid ${effectiveBorderColor}` }} />
        </div>
      );
    }
    if (style === 'inset-frame') {
      return (
        <>
          <div
            className="absolute inset-[10px] pointer-events-none z-20"
            style={{ border: `${effectiveBorderWidth}px solid ${effectiveBorderColor}`, opacity: 0.9 }}
          />
          <div
            className="absolute inset-[20px] pointer-events-none z-20"
            style={{ border: `1px solid ${coverData.accentColor}`, opacity: 0.65 }}
          />
        </>
      );
    }
    return null;
  };

  const summaryParsedLines = parseSummaryLines(coverData.summary || '');

  const renderCoverPage = (withId = true) => (
    <div
      id={withId ? 'printable-cover-sheet' : undefined}
      onDragOver={(e) => {
        if (onUpdateCoverData && e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (!onUpdateCoverData) return;
        const file = e.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const url = String(ev.target?.result || '');
          if (url) {
            onUpdateCoverData((prev) => ({ ...prev, logoUrl: url, logoPosition: prev.logoPosition || 'top-left' }));
          }
        };
        reader.readAsDataURL(file);
      }}
      className="rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 relative overflow-hidden flex flex-col justify-between select-none"
      style={{
        ...fontCssStyle,
        width: PAPER_W,
        height: paperH,
        backgroundColor: theme.backgroundColor,
        color: isDarkModeTheme ? '#f8fafc' : '#0f172a',
      }}
    >
      {/* Background Watermark / Art Image */}
      {coverData.backgroundImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none bg-cover bg-center z-0"
          style={{
            backgroundImage: `url(${coverData.backgroundImageUrl})`,
            opacity: coverData.backgroundImageOpacity ?? 0.35,
          }}
        />
      )}

      {/* Top Banner Styles: banner-top, split-vertical, full-bleed-hero */}
      {hasTopBanner && (
        <div className="relative z-10">
          <div
            className="relative w-full overflow-hidden"
            style={{
              height: theme.layoutStyle === 'full-bleed-hero' ? 195 : 160,
              backgroundColor: coverData.primaryColor,
            }}
          >
            {coverData.imageUrl && (
              <img
                src={coverData.imageUrl}
                alt="Cover Banner"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-90"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

            {(coverData.documentId || coverData.organization) && (
              <div className="absolute top-[16px] inset-x-[24px] flex items-center justify-between text-white text-[11px] font-medium tracking-wider">
                {coverData.documentId ? <span className="font-mono opacity-90">{coverData.documentId}</span> : <span />}
                {coverData.organization && (
                  <span className="font-semibold uppercase tracking-wider">{coverData.organization}</span>
                )}
              </div>
            )}

            <div className="absolute bottom-0 inset-x-0 h-[6px]" style={{ backgroundColor: coverData.accentColor }} />
          </div>
        </div>
      )}

      {/* Split-Cover Vertical Color Panel */}
      {isSplitCover && (
        <div
          className="absolute left-0 inset-y-0 w-[124px] pointer-events-none z-0 overflow-hidden"
          style={{ backgroundColor: coverData.primaryColor }}
        >
          {coverData.imageUrl && (
            <img
              src={coverData.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-35"
            />
          )}
          <div className="absolute inset-y-0 right-0 w-[4px]" style={{ backgroundColor: coverData.accentColor }} />
        </div>
      )}

      {/* Ribbon Crest Template */}
      {theme.layoutStyle === 'ribbon-crest' && (
        <div className="relative z-10 shrink-0">
          <div className="h-[44px] w-full flex items-center justify-between px-[36px]" style={{ backgroundColor: coverData.primaryColor }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/95 truncate">
              {coverData.organization || 'Official Submission'}
            </span>
            {coverData.documentId && (
              <span className="text-[10px] font-mono text-white/90">{coverData.documentId}</span>
            )}
          </div>
          <div className="h-[4px] w-full" style={{ backgroundColor: coverData.accentColor }} />
        </div>
      )}

      {/* Executive Memo Bar Template */}
      {theme.layoutStyle === 'executive-memo' && (
        <div className="relative z-10 px-[40px] pt-[28px] shrink-0">
          <div
            className="px-[16px] py-[10px] rounded-md flex items-center justify-between text-white"
            style={{ backgroundColor: coverData.primaryColor }}
          >
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] truncate">
              {coverData.organization || 'Executive Dossier'}
            </span>
            <span className="text-[10px] font-mono opacity-90">{coverData.documentId || coverData.date}</span>
          </div>
          <div className="h-[3px] w-full mt-[4px]" style={{ backgroundColor: coverData.accentColor }} />
        </div>
      )}

      {/* Certificate / Charter Filigree Frame */}
      {theme.layoutStyle === 'certificate-frame' && (
        <div
          className="absolute inset-[14px] border-[3px] pointer-events-none z-10"
          style={{ borderColor: coverData.primaryColor }}
        >
          <div className="absolute inset-[6px] border pointer-events-none" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute top-[6px] left-[6px] w-[14px] h-[14px] border-t-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute top-[6px] right-[6px] w-[14px] h-[14px] border-t-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute bottom-[6px] left-[6px] w-[14px] h-[14px] border-b-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute bottom-[6px] right-[6px] w-[14px] h-[14px] border-b-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
        </div>
      )}

      {/* Diagonal Modern Corner Accent */}
      {theme.layoutStyle === 'diagonal-accent' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div
            className="absolute -top-[88px] -right-[88px] w-[240px] h-[240px] rotate-45"
            style={{ backgroundColor: coverData.primaryColor }}
          />
          <div
            className="absolute -top-[96px] -right-[76px] w-[240px] h-[240px] rotate-45 border-b-[6px]"
            style={{ borderColor: coverData.accentColor }}
          />
          <div className="absolute bottom-0 inset-x-0 h-[5px]" style={{ backgroundColor: coverData.accentColor }} />
        </div>
      )}

      {theme.layoutStyle === 'bordered-formal' && (
        <div
          className="absolute inset-[12px] border-2 pointer-events-none rounded z-10"
          style={{ borderColor: coverData.primaryColor }}
        >
          <div className="absolute inset-[6px] border pointer-events-none" style={{ borderColor: coverData.accentColor }} />
        </div>
      )}

      {theme.layoutStyle === 'minimal-frame' && (
        <div
          className="absolute inset-[16px] border pointer-events-none z-10"
          style={{ borderColor: `${coverData.accentColor}55` }}
        >
          <div className="absolute top-0 left-0 w-[16px] h-[16px] border-t-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute top-0 right-0 w-[16px] h-[16px] border-t-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute bottom-0 left-0 w-[16px] h-[16px] border-b-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
          <div className="absolute bottom-0 right-0 w-[16px] h-[16px] border-b-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
        </div>
      )}

      {theme.layoutStyle === 'geometric-grid' && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-[6px] w-full" style={{ backgroundColor: coverData.accentColor }} />
          <div className="w-[6px] h-full absolute left-[24px] top-0" style={{ backgroundColor: `${coverData.accentColor}44` }} />
        </div>
      )}

      {theme.layoutStyle === 'card-centered' && (
        <div
          className="absolute inset-x-[32px] top-[48px] bottom-[48px] rounded-[12px] border pointer-events-none z-0"
          style={{ borderColor: `${coverData.accentColor}40`, backgroundColor: isDarkModeTheme ? '#18181b' : '#fafafa' }}
        />
      )}

      {theme.layoutStyle === 'bottom-accent' && (
        <div
          className="absolute inset-x-0 bottom-0 h-[112px] pointer-events-none z-0 opacity-15"
          style={{ backgroundColor: coverData.primaryColor }}
        />
      )}

      {theme.layoutStyle === 'plain-rule' && (
        <>
          <div className="absolute top-[32px] inset-x-[40px] h-[2px] pointer-events-none z-10" style={{ backgroundColor: coverData.primaryColor }} />
          <div className="absolute bottom-[24px] inset-x-[40px] h-[1px] pointer-events-none z-10" style={{ backgroundColor: coverData.accentColor }} />
        </>
      )}

      {isLeftBar && (
        <>
          <div className="absolute left-0 inset-y-0 w-[12px] pointer-events-none z-10" style={{ backgroundColor: coverData.primaryColor }} />
          <div className="absolute left-[20px] inset-y-0 w-[1px] pointer-events-none z-10" style={{ backgroundColor: `${coverData.accentColor}66` }} />
        </>
      )}

      {/* User Custom Border Overlay */}
      {renderCustomBorderOverlay()}

      {/* Main Content Stage */}
      <div
        className="flex-1 flex flex-col justify-between z-10 relative min-h-0"
        style={{
          padding: 40,
          paddingTop: theme.layoutStyle === 'ribbon-crest' || theme.layoutStyle === 'executive-memo' ? 24 : 40,
          paddingLeft: isSplitCover ? 148 : isLeftBar ? 56 : 40,
        }}
      >
        <div className={isCentered ? 'flex-1 flex flex-col justify-center' : ''}>
          {/* Draggable Logo */}
          {coverData.logoUrl && coverData.logoPosition !== 'qr-center' && (
            <div
              {...getDragProps('logo')}
              className={`mb-[16px] flex ${
                coverData.logoPosition === 'top-center'
                  ? 'justify-center'
                  : coverData.logoPosition === 'top-right'
                  ? 'justify-end'
                  : 'justify-start'
              } ${dragMode ? 'cursor-move p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md' : ''}`}
            >
              <img
                src={coverData.logoUrl}
                alt="Organization logo"
                referrerPolicy="no-referrer"
                className={`object-contain pointer-events-none ${
                  coverData.logoSize === 'large'
                    ? 'h-[56px] max-w-[200px]'
                    : coverData.logoSize === 'small'
                    ? 'h-[32px] max-w-[120px]'
                    : 'h-[40px] max-w-[160px]'
                }`}
              />
            </div>
          )}

          {/* Draggable Header Meta */}
          {(coverData.documentId || coverData.organization) &&
            !hasTopBanner &&
            theme.layoutStyle !== 'ribbon-crest' &&
            theme.layoutStyle !== 'executive-memo' && (
              <div
                {...getDragProps('headerMeta')}
                className={`flex items-center text-[11px] mb-[18px] pb-[8px] border-b border-slate-200/60 ${
                  isCentered ? 'justify-center gap-[16px]' : 'justify-between'
                } ${dragMode ? 'cursor-move p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/80 rounded-md' : ''}`}
              >
                {coverData.documentId ? (
                  <span className="font-mono font-semibold" style={{ color: coverData.accentColor }}>
                    {coverData.documentId}
                  </span>
                ) : (
                  !isCentered && <span />
                )}
                {coverData.organization && (
                  <span className="font-bold uppercase tracking-wider text-[12px]">{coverData.organization}</span>
                )}
              </div>
            )}

          {/* Draggable Title & Subtitle Block */}
          <div
            {...getDragProps('titleBlock')}
            className={`mt-[8px] space-y-[10px] ${isCentered ? 'text-center' : ''} ${
              onUpdateCoverData ? 'cursor-grab active:cursor-grabbing p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/70 rounded-md' : ''
            }`}
          >
            <h1
              className="leading-[1.2] tracking-tight break-words"
              style={{
                fontSize: `${coverData.titleFontSize ?? 30}px`,
                color: effectiveTitleColor,
                fontWeight: coverData.titleBold === false ? 500 : 800,
                fontStyle: coverData.titleItalic ? 'italic' : 'normal',
                textDecoration: coverData.titleUnderline ? 'underline' : 'none',
                textUnderlineOffset: '4px',
              }}
            >
              {coverData.title || currentDoc?.extractedTitle || currentDoc?.name || 'Document Title'}
            </h1>

            {coverData.subtitle && (
              <p
                className="leading-[1.35] opacity-90 break-words"
                style={{
                  fontSize: `${coverData.subtitleFontSize ?? 14}px`,
                  color: effectiveSubtitleColor,
                  fontWeight: coverData.subtitleBold ? 700 : 500,
                  fontStyle: coverData.subtitleItalic ? 'italic' : 'normal',
                  textDecoration: coverData.subtitleUnderline ? 'underline' : 'none',
                  textUnderlineOffset: '3px',
                }}
              >
                {coverData.subtitle}
              </p>
            )}

            <div
              className={`w-[48px] h-[4px] rounded-full my-[12px] ${isCentered ? 'mx-auto' : ''}`}
              style={{ backgroundColor: coverData.accentColor }}
            />
          </div>

          {/* Draggable Multiline / Bulleted Summary Description (Zero truncation) */}
          {coverData.summary && (
            <div
              {...getDragProps('summary')}
              className={`mt-[12px] space-y-[3px] leading-[1.45] ${isCentered ? 'text-center' : ''} ${
                onUpdateCoverData ? 'cursor-grab active:cursor-grabbing p-1 hover:ring-1 hover:ring-dashed hover:ring-yellow-400/70 rounded-md' : ''
              }`}
              style={{
                ...getOffsetTransform('summary'),
                fontSize: `${coverData.summaryFontSize ?? 12}px`,
                color: effectiveTextColor,
                fontWeight: coverData.summaryBold ? 700 : 400,
                fontStyle: coverData.summaryItalic ? 'italic' : 'normal',
                textDecoration: coverData.summaryUnderline ? 'underline' : 'none',
                textUnderlineOffset: '2px',
              }}
            >
              {summaryParsedLines.map((item, idx) => {
                if (item.kind === 'blank') {
                  return <div key={idx} className="h-[6px]" />;
                }
                if (item.kind === 'bullet' || item.kind === 'numbered') {
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-[6px] ${isCentered ? 'justify-center' : ''}`}
                      style={{ paddingLeft: isCentered ? 0 : item.indentLevel * 12 }}
                    >
                      <span
                        className="font-bold shrink-0"
                        style={{ color: coverData.accentColor }}
                      >
                        {item.marker}
                      </span>
                      <span className="whitespace-pre-wrap break-words text-left">{item.text}</span>
                    </div>
                  );
                }
                return (
                  <p
                    key={idx}
                    className="whitespace-pre-wrap break-words"
                    style={{ paddingLeft: isCentered ? 0 : item.indentLevel * 12 }}
                  >
                    {item.text}
                  </p>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Footer arranged cleanly based on includeQr, signatureUrl & qrPosition */}
        {!includeQr ? (
          <div
            className={`pt-[16px] border-t border-slate-200/60 flex ${
              isCentered
                ? 'flex-col items-center text-center gap-[10px]'
                : 'items-end justify-between gap-[16px]'
            }`}
          >
            {metaBlock}
            {signatureNode}
          </div>
        ) : coverData.qrPosition === 'bottom-center' ? (
          <div className="pt-[16px] border-t border-slate-200/60 flex flex-col items-center gap-[8px] text-center">
            {signatureNode && <div className="mb-1">{signatureNode}</div>}
            {qrBlock}
            {(coverData.preparedBy || coverData.date) && (
              <div className="flex items-center gap-[14px] text-[11px]" style={{ color: effectiveTextColor }}>
                {coverData.preparedBy && <span>{coverData.preparedBy}</span>}
                {coverData.preparedBy && coverData.date && <span aria-hidden="true">·</span>}
                {coverData.date && <span>{coverData.date}</span>}
              </div>
            )}
            {verificationLine && (
              <div className="text-[8.5px] font-mono font-bold" style={{ color: coverData.accentColor }}>
                {verificationLine}
              </div>
            )}
          </div>
        ) : coverData.qrPosition === 'bottom-left' ? (
          <div className="pt-[16px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
            {qrBlock}
            <div className="flex flex-col items-end gap-[10px] text-right">
              {signatureNode}
              {metaBlock}
            </div>
          </div>
        ) : (
          <div className="pt-[16px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
            <div className="flex flex-col items-start gap-[10px]">
              {metaBlock}
              {signatureNode}
            </div>
            {qrBlock}
          </div>
        )}
      </div>

      {/* Applied custom stamps targeting Cover Page */}
      {renderAppliedStampsLayer(
        (coverData.appliedStamps || []).filter(
          (st) => st.pageScope === 'cover-only' || st.pageScope === 'all-including-cover'
        )
      )}
    </div>
  );

  function getStampWrapperPositionStyle(
    placement: PdfStampPlacement,
    scalePercent: number
  ): React.CSSProperties {
    const safeWidth = `${Math.max(8, Math.min(50, scalePercent || 18))}%`;
    switch (placement) {
      case 'top-left':
        return { width: safeWidth, left: '5.5%', top: '5.5%' };
      case 'top-center':
        return { width: safeWidth, left: '50%', top: '5.5%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { width: safeWidth, right: '5.5%', top: '5.5%' };
      case 'center':
        return { width: safeWidth, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
      case 'bottom-left':
        return { width: safeWidth, left: '5.5%', bottom: '6.5%' };
      case 'bottom-center':
        return { width: safeWidth, left: '50%', bottom: '6.5%', transform: 'translateX(-50%)' };
      case 'bottom-right':
      default:
        return { width: safeWidth, right: '5.5%', bottom: '6.5%' };
    }
  }

  function renderAppliedStampsLayer(stamps: AppliedPdfStamp[]) {
    if (!stamps.length) return null;
    return (
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {stamps.map((stamp) => {
          const src =
            stamp.kind === 'image'
              ? stamp.imageUrl || ''
              : renderCustomTextStampDataUrl(
                  {
                    text: stamp.text,
                    subtext: stamp.subtext,
                    shape: stamp.shape,
                    color: stamp.color,
                  },
                  360
                );
          if (!src) return null;
          return (
            <div
              key={stamp.id}
              className="absolute pointer-events-none"
              style={getStampWrapperPositionStyle(stamp.position, stamp.scale)}
            >
              <img
                src={src}
                alt={stamp.name}
                className="w-full h-auto max-h-[45%] object-contain select-none"
                style={{
                  opacity: Math.min(1, Math.max(0.1, stamp.opacity ?? 0.88)),
                  transform: `rotate(${stamp.rotationDeg || 0}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const renderDocumentPage = (pageIndex: number) => {
    const origIndex = pageIndex - 1;
    const previewImg = currentDoc?.renderedPagePreviews?.[origIndex];

    const attachedPageStamps = (coverData.appliedStamps || []).filter(
      (st) =>
        st.pageScope === 'all-attached' ||
        st.pageScope === 'all-including-cover' ||
        (st.pageScope === 'first-attached' && origIndex === 0)
    );

    const watermarkOverlay = coverData.watermarkText?.trim() ? (
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
      >
        <span
          className="font-black uppercase tracking-widest text-slate-600 select-none text-center px-6"
          style={{
            fontSize: 34,
            opacity: coverData.watermarkOpacity ?? 0.14,
            transform: 'rotate(-42deg)',
          }}
        >
          {coverData.watermarkText}
        </span>
      </div>
    ) : null;

    const docScalePercent = Math.max(50, Math.min(125, coverData.documentPageScale ?? 100));
    const docScale = docScalePercent / 100;

    if (previewImg) {
      return (
        <div
          className="bg-white rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 overflow-hidden relative flex items-center justify-center"
          style={{ width: PAPER_W, height: paperH }}
        >
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-150"
            style={{ transform: `scale(${docScale})`, transformOrigin: 'center center' }}
          >
            <img
              src={previewImg}
              alt={`Page ${pageIndex + 1}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          {watermarkOverlay}
          {renderAppliedStampsLayer(attachedPageStamps)}
          {docScalePercent !== 100 && (
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-yellow-400/90 text-black font-mono font-bold text-[10px] tabular-nums shadow-xs">
              Scale {docScalePercent}%
            </div>
          )}
          {coverData.stampPageNumbers && (
            <div className="absolute bottom-3 right-4 px-2 py-0.5 rounded bg-black/75 text-white font-mono text-[10px] tabular-nums">
              Page {pageIndex + 1} of {totalExportPages}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className="bg-white text-slate-900 rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 overflow-hidden relative"
        style={{ width: PAPER_W, height: paperH }}
      >
        <div
          className="w-full h-full p-[40px] flex flex-col justify-between transition-transform duration-150"
          style={{ transform: `scale(${docScale})`, transformOrigin: 'center center' }}
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-[12px] text-slate-500 font-mono">
              <span className="truncate max-w-[200px]">{currentDoc?.name || 'Document'}</span>
              <span className="tabular-nums">Page {pageIndex + 1}</span>
            </div>

            <div className="mt-8 space-y-4">
              <h3 className="text-[18px] font-bold text-slate-900">
                {origIndex === 0 ? 'Document Content' : `Section ${origIndex + 1}`}
              </h3>

              {currentDoc?.extractedText ? (
                <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{currentDoc.extractedText}</p>
              ) : (
                <p className="text-[12px] text-slate-500 italic">
                  Original content from {currentDoc?.name}.
                  {includeQr ? ' The QR code on Page 1 opens the complete document on Google Drive.' : ''}
                </p>
              )}

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 mt-6 text-[12px] text-slate-600">
                <div>
                  File: <span className="font-semibold text-slate-800">{currentDoc?.name}</span>
                </div>
                <div>
                  Format: <span className="font-semibold uppercase text-slate-800">{currentDoc?.extension}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[12px] text-slate-400 font-mono tabular-nums">
            <span>{coverData.organization || 'Document'}</span>
            {coverData.stampPageNumbers && (
              <span>
                Page {pageIndex + 1} of {totalExportPages}
              </span>
            )}
          </div>
        </div>
        {watermarkOverlay}
        {renderAppliedStampsLayer(attachedPageStamps)}
      </div>
    );
  };

  return (
    <div
      ref={previewContainerRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-zinc-950/95 p-4 sm:p-8 backdrop-blur-md flex flex-col'
          : 'relative flex flex-col h-full min-h-0'
      }
    >
      <EdgeGrabRobot
        containerRef={previewContainerRef}
        scrollRef={stageScrollRef}
        edge={isFullscreen ? 'top' : 'right'}
        idleTip={
          dragMode
            ? 'Drag any element on the cover sheet!'
            : viewMode === 'grid'
            ? 'Holding on while you browse pages!'
            : 'Holding onto Document Preview!'
        }
        quickActions={[
          {
            label: viewMode === 'grid' ? 'Single Page' : `All ${totalPreviewPages}`,
            onClick: () => setViewMode(viewMode === 'single' ? 'grid' : 'single'),
          },
          ...(onFullPreview ? [{ label: 'Full Preview', onClick: onFullPreview }] : []),
          ...(onPrint ? [{ label: 'Print', onClick: onPrint }] : []),
        ]}
        onAction={onFullPreview}
        className={isFullscreen ? 'top-2' : 'hidden md:block'}
      />

      {/* Top Controls Bar */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 px-1 gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-bold text-zinc-900 dark:text-white">Preview</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-amber-600 dark:text-yellow-400 tabular-nums font-semibold">
            {totalExportPages} {totalExportPages === 1 ? 'Pg' : 'Pgs'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onUpdateCoverData && activePageIndex === 0 && viewMode === 'single' && (
            <>
              <button
                type="button"
                onClick={() => setDragMode((d) => !d)}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  dragMode
                    ? 'bg-yellow-400 text-black border-yellow-400 shadow-xs'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-yellow-400'
                }`}
                title="Drag & drop text, logo, signature, or QR freely on Cover"
              >
                <Move className="w-3 h-3" />
                <span>{dragMode ? 'Done' : 'Move Items'}</span>
              </button>

              {hasAnyOffsets && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateCoverData((prev) => ({
                      ...prev,
                      elementOffsets: undefined,
                    }))
                  }
                  className="p-1 text-zinc-500 hover:text-amber-600 dark:hover:text-yellow-400 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 cursor-pointer"
                  title="Reset dragged element positions"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}

          {viewMode === 'single' && totalPreviewPages > 1 && (
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 text-xs text-zinc-700 dark:text-zinc-300">
              <button
                type="button"
                onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                disabled={activePageIndex === 0}
                className="p-1 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-1.5 font-mono font-bold text-amber-700 dark:text-yellow-300 text-[11px] whitespace-nowrap tabular-nums">
                {activePageIndex === 0 ? 'P1' : `${activePageIndex + 1}/${totalPreviewPages}`}
              </span>
              <button
                type="button"
                onClick={() => setActivePageIndex((prev) => Math.min(totalPreviewPages - 1, prev + 1))}
                disabled={activePageIndex >= totalPreviewPages - 1}
                className="p-1 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
            className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              viewMode === 'grid'
                ? 'bg-yellow-400 text-black border-yellow-400'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            <span className="hidden sm:inline">{viewMode === 'grid' ? 'Single' : `All ${totalPreviewPages}`}</span>
          </button>

          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Drive</span>
            </a>
          )}

          {onFullPreview && (
            <button
              type="button"
              onClick={onFullPreview}
              disabled={isPreparingFullPreview}
              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait flex items-center gap-1 whitespace-nowrap shadow-xs"
              title={`Open full ${totalExportPages}-page PDF preview`}
            >
              {isPreparingFullPreview ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
              <span>{isPreparingFullPreview ? 'Preparing...' : 'PDF View'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {dragMode && activePageIndex === 0 && viewMode === 'single' && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-yellow-400/15 border border-yellow-400/50 text-[11px] text-amber-800 dark:text-yellow-300 font-medium flex items-center justify-between gap-2 shrink-0">
          <span>Drag any text, logo, signature, or QR block directly on Page 1.</span>
          <button
            type="button"
            onClick={() => setDragMode(false)}
            className="font-bold underline cursor-pointer shrink-0"
          >
            Finish
          </button>
        </div>
      )}

      {/* Page Preview Cap Notice */}
      {isPreviewCapped && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 shrink-0">
          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
          <span>
            Showing Cover + first {currentDoc!.renderedPagePreviews!.length} of {currentDoc!.pageCount} original pages · All {totalExportPages} pages included in downloaded PDF
          </span>
        </div>
      )}

      {/* Stage */}
      <div
        ref={stageScrollRef}
        className={`min-h-0 ${viewMode === 'grid' ? 'overflow-y-auto pr-1' : ''} ${
          isFullscreen ? 'flex-1' : 'h-[56vh] md:h-auto md:flex-1'
        }`}
      >
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-yellow-400 mb-1.5">
                {includeQr ? 'Page 1 · Cover & QR' : 'Page 1 · Cover Sheet'}
              </span>
              <FitPage width={PAPER_W} height={paperH} mode="width">
                {renderCoverPage(false)}
              </FitPage>
            </div>

            {Array.from({ length: totalPreviewPages - 1 }, (_, i) => i + 1).map((pNum) => (
              <div key={pNum} className="flex flex-col items-center">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 tabular-nums">
                  Page {pNum + 1} of {totalExportPages}
                </span>
                <FitPage width={PAPER_W} height={paperH} mode="width">
                  {renderDocumentPage(pNum)}
                </FitPage>
              </div>
            ))}
          </div>
        ) : (
          <FitPage width={PAPER_W} height={paperH} mode="contain" onScaleChange={setCanvasScale}>
            {activePageIndex === 0 ? renderCoverPage(true) : renderDocumentPage(activePageIndex)}
          </FitPage>
        )}
      </div>

      {/* Filmstrip */}
      {totalPreviewPages > 1 && viewMode === 'single' && (
        <div className="flex-shrink-0 mt-3 py-1 px-1 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {Array.from({ length: totalPreviewPages }, (_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActivePageIndex(idx)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activePageIndex === idx
                  ? 'bg-yellow-400 text-black border-yellow-400'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {idx === 0 ? <QrCode className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              <span className="tabular-nums">{idx === 0 ? 'Cover' : `P${idx + 1}`}</span>
            </button>
          ))}
        </div>
      )}

      {/* Status Footer */}
      <div className="flex-shrink-0 mt-2 flex items-center justify-between text-xs px-1 py-1 text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          {!includeQr ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
              <span className="text-cyan-700 dark:text-cyan-300 font-semibold">
                Clean cover mode · No sign-in required
              </span>
            </>
          ) : isDriveUploaded ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">QR bound to Drive file</span>
            </>
          ) : (
            <span>Upload in Step 4 to bind live Drive link</span>
          )}
        </span>

        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-yellow-400 flex items-center gap-1 text-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        )}
      </div>
    </div>
  );
};
