import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CoverData, UploadedDocInfo } from '../types';
import { COVER_THEMES } from '../constants/themes';
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
} from 'lucide-react';

interface CoverPreviewProps {
  coverData: CoverData;
  currentDoc: UploadedDocInfo | null;
  driveLink: string | null;
  qrDataUrl: string | null;
  onPrint?: () => void;
  onFullPreview?: () => void;
  isPreparingFullPreview?: boolean;
  isDriveUploaded: boolean;
}

const PAPER_W = 500;
const paperHeightFor = (size: CoverData['paperSize']) =>
  size === 'letter' ? Math.round((PAPER_W * 792) / 612) : Math.round((PAPER_W * 841.89) / 595.28);

interface FitPageProps {
  width: number;
  height: number;
  mode: 'contain' | 'width';
  children: React.ReactNode;
}

const FitPage: React.FC<FitPageProps> = ({ width, height, mode, children }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const byWidth = rect.width / width;
      const next =
        mode === 'width' ? byWidth : rect.height > 0 ? Math.min(byWidth, rect.height / height) * 0.97 : byWidth;
      setScale(Math.max(0.05, next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height, mode]);

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
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  const theme = COVER_THEMES.find((t) => t.id === coverData.themeId) || COVER_THEMES[0];
  const paperH = paperHeightFor(coverData.paperSize);
  const includeQr = coverData.includeQr !== false;

  const getFontStyle = (): React.CSSProperties => {
    switch (coverData.font) {
      case 'playfair':
        return { fontFamily: '"Playfair Display", Georgia, serif' };
      case 'merriweather':
        return { fontFamily: '"Merriweather", Georgia, serif' };
      case 'mono':
        return { fontFamily: '"JetBrains Mono", monospace' };
      case 'montserrat':
        return { fontFamily: '"Montserrat", "Plus Jakarta Sans", sans-serif' };
      case 'oswald':
        return { fontFamily: '"Oswald", sans-serif', letterSpacing: '-0.01em' };
      case 'space':
      case 'inter':
      default:
        return { fontFamily: '"Plus Jakarta Sans", "DM Sans", sans-serif' };
    }
  };

  const isDarkModeTheme = !!theme.isDark;
  const isCentered = theme.layoutStyle === 'plain-centered' || theme.layoutStyle === 'card-centered';
  const isLeftBar = theme.layoutStyle === 'plain-left-bar';

  const effectiveTitleColor = coverData.titleColor || (isDarkModeTheme ? '#ffffff' : coverData.primaryColor);
  const effectiveSubtitleColor = coverData.subtitleColor || coverData.accentColor;
  const effectiveTextColor = coverData.textColor || (isDarkModeTheme ? '#cbd5e1' : '#334155');

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
    <div className="flex flex-col items-center flex-shrink-0">
      <div
        className="p-[8px] rounded-[10px] border shadow-md flex flex-col items-center"
        style={{ backgroundColor: coverData.qrBgColor || '#ffffff', borderColor: '#cbd5e1' }}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Drive Document QR Code"
            referrerPolicy="no-referrer"
            className="w-[112px] h-[112px] object-contain rounded-[4px]"
          />
        ) : (
          <div className="w-[112px] h-[112px] bg-slate-100 rounded-[4px] flex flex-col items-center justify-center text-slate-400 p-[8px] text-center">
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
    <div className="space-y-[8px] text-[12px]" style={{ color: effectiveTextColor }}>
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
        <div className="pt-[4px] text-[9px] opacity-60 font-mono">Official Soft Copy · Google Drive</div>
      )}
    </div>
  );

  const renderCoverPage = (withId = true) => (
    <div
      id={withId ? 'printable-cover-sheet' : undefined}
      className="rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 relative overflow-hidden flex flex-col justify-between"
      style={{
        ...getFontStyle(),
        width: PAPER_W,
        height: paperH,
        backgroundColor: theme.backgroundColor,
        color: isDarkModeTheme ? '#f8fafc' : '#0f172a',
      }}
    >
      {coverData.backgroundImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none bg-cover bg-center z-0"
          style={{
            backgroundImage: `url(${coverData.backgroundImageUrl})`,
            opacity: coverData.backgroundImageOpacity ?? 0.35,
          }}
        />
      )}

      {(theme.layoutStyle === 'banner-top' || theme.layoutStyle === 'split-vertical') && !coverData.backgroundImageUrl && (
        <div className="relative z-10">
          <div className="relative w-full h-[160px] overflow-hidden" style={{ backgroundColor: coverData.primaryColor }}>
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

      <div
        className="flex-1 flex flex-col justify-between z-10 relative"
        style={{
          padding: 40,
          paddingLeft: isLeftBar ? 56 : 40,
        }}
      >
        <div className={isCentered ? 'flex-1 flex flex-col justify-center' : ''}>
          {coverData.logoUrl && coverData.logoPosition !== 'qr-center' && (
            <div
              className={`mb-[16px] flex ${
                coverData.logoPosition === 'top-center'
                  ? 'justify-center'
                  : coverData.logoPosition === 'top-right'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              <img
                src={coverData.logoUrl}
                alt="Organization logo"
                referrerPolicy="no-referrer"
                className={`object-contain ${
                  coverData.logoSize === 'large'
                    ? 'h-[56px] max-w-[200px]'
                    : coverData.logoSize === 'small'
                    ? 'h-[32px] max-w-[120px]'
                    : 'h-[40px] max-w-[160px]'
                }`}
              />
            </div>
          )}

          {(coverData.documentId || coverData.organization) &&
            ((theme.layoutStyle !== 'banner-top' && theme.layoutStyle !== 'split-vertical') || coverData.backgroundImageUrl) && (
              <div
                className={`flex items-center text-[11px] mb-[20px] pb-[8px] border-b border-slate-200/60 ${
                  isCentered ? 'justify-center gap-[16px]' : 'justify-between'
                }`}
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

          <div className={`mt-[8px] space-y-[10px] ${isCentered ? 'text-center' : ''}`}>
            <h1
              className="text-[30px] font-extrabold leading-[1.2] tracking-tight break-words"
              style={{ color: effectiveTitleColor }}
            >
              {coverData.title || currentDoc?.extractedTitle || currentDoc?.name || 'Document Title'}
            </h1>

            {coverData.subtitle && (
              <p className="text-[14px] font-medium leading-[1.35] opacity-90 break-words" style={{ color: effectiveSubtitleColor }}>
                {coverData.subtitle}
              </p>
            )}

            <div
              className={`w-[48px] h-[4px] rounded-full my-[12px] ${isCentered ? 'mx-auto' : ''}`}
              style={{ backgroundColor: coverData.accentColor }}
            />
          </div>

          {coverData.summary && (
            <div className={`mt-[14px] ${isCentered ? 'text-center' : ''}`}>
              <p className="text-[12px] leading-[1.45] line-clamp-4" style={{ color: effectiveTextColor }}>
                {coverData.summary}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Footer arranged cleanly based on includeQr & qrPosition */}
        {!includeQr ? (
          <div
            className={`pt-[18px] border-t border-slate-200/60 flex ${
              isCentered ? 'flex-col items-center text-center gap-[6px]' : 'items-end justify-between gap-[16px]'
            }`}
          >
            {metaBlock}
          </div>
        ) : coverData.qrPosition === 'bottom-center' ? (
          <div className="pt-[18px] border-t border-slate-200/60 flex flex-col items-center gap-[8px] text-center">
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
          <div className="pt-[18px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
            {qrBlock}
            <div className="text-right">{metaBlock}</div>
          </div>
        ) : (
          <div className="pt-[18px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
            {metaBlock}
            {qrBlock}
          </div>
        )}
      </div>
    </div>
  );

  const renderDocumentPage = (pageIndex: number) => {
    const origIndex = pageIndex - 1;
    const previewImg = currentDoc?.renderedPagePreviews?.[origIndex];

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

    if (previewImg) {
      return (
        <div
          className="bg-white rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 overflow-hidden relative"
          style={{ width: PAPER_W, height: paperH }}
        >
          <img
            src={previewImg}
            alt={`Page ${pageIndex + 1}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
          {watermarkOverlay}
          {(coverData.stampPageNumbers || true) && (
            <div className="absolute bottom-3 right-4 px-2 py-0.5 rounded bg-black/75 text-white font-mono text-[10px] tabular-nums">
              Page {pageIndex + 1} of {totalExportPages}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className="bg-white text-slate-900 rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-800 p-[40px] flex flex-col justify-between relative overflow-hidden"
        style={{ width: PAPER_W, height: paperH }}
      >
        {watermarkOverlay}
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
              <p className="text-[12px] text-slate-700 leading-relaxed">{currentDoc.extractedText}</p>
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
          <span>
            Page {pageIndex + 1} of {totalExportPages}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-zinc-950/95 p-4 sm:p-8 backdrop-blur-md flex flex-col'
          : 'relative flex flex-col h-full min-h-0'
      }
    >
      {/* Top Controls Bar */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between pb-3 px-1 gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-bold text-zinc-900 dark:text-white">Document Preview</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-amber-600 dark:text-yellow-400 tabular-nums font-semibold">
            {totalExportPages} {totalExportPages === 1 ? 'Page' : 'Pages'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'single' && (
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
              <span className="px-2 font-mono font-bold text-amber-700 dark:text-yellow-300 text-[11px] whitespace-nowrap tabular-nums">
                {activePageIndex === 0 ? 'Page 1 (Cover)' : `Page ${activePageIndex + 1} / ${totalPreviewPages}`}
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
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              viewMode === 'grid'
                ? 'bg-yellow-400 text-black border-yellow-400'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{viewMode === 'grid' ? 'Single' : `All ${totalPreviewPages}`}</span>
          </button>

          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Drive Link</span>
            </a>
          )}

          {onFullPreview && (
            <button
              type="button"
              onClick={onFullPreview}
              disabled={isPreparingFullPreview}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5 whitespace-nowrap shadow-xs"
              title={`Open full ${totalExportPages}-page PDF preview`}
            >
              {isPreparingFullPreview ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span>{isPreparingFullPreview ? 'Preparing...' : 'Full Preview'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

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
        className={`min-h-0 ${viewMode === 'grid' ? 'overflow-y-auto pr-1' : ''} ${
          isFullscreen ? 'flex-1' : 'h-[62vh] lg:h-auto lg:flex-1'
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
          <FitPage width={PAPER_W} height={paperH} mode="contain">
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
