import React from 'react';
import { CoverData, UploadedDocInfo } from '../types';
import { COVER_THEMES } from '../constants/themes';
import { Eye, Layout, Palette, QrCode } from 'lucide-react';

interface MiniPreviewProps {
  coverData: CoverData;
  currentDoc: UploadedDocInfo | null;
  qrDataUrl: string | null;
  activeStep: number;
  onJumpToThemes?: () => void;
  onJumpToColors?: () => void;
  onOpenFullPreview?: () => void;
}

const PAPER_W = 500;
const THUMB_W = 112;
const SCALE = THUMB_W / PAPER_W;

const paperHeightFor = (size: CoverData['paperSize']) =>
  size === 'letter' ? Math.round((PAPER_W * 792) / 612) : Math.round((PAPER_W * 841.89) / 595.28);

export const MiniPreview: React.FC<MiniPreviewProps> = ({
  coverData,
  currentDoc,
  qrDataUrl,
  activeStep,
  onJumpToThemes,
  onJumpToColors,
  onOpenFullPreview,
}) => {
  const theme = COVER_THEMES.find((t) => t.id === coverData.themeId) || COVER_THEMES[0];
  const paperH = paperHeightFor(coverData.paperSize);
  const thumbH = Math.round(paperH * SCALE);

  const isDarkModeTheme = !!theme.isDark;
  const isCentered = theme.layoutStyle === 'plain-centered';
  const isLeftBar = theme.layoutStyle === 'plain-left-bar';

  const effectiveTitleColor = coverData.titleColor || (isDarkModeTheme ? '#ffffff' : coverData.primaryColor);
  const effectiveSubtitleColor = coverData.subtitleColor || coverData.accentColor;
  const effectiveTextColor = coverData.textColor || (isDarkModeTheme ? '#cbd5e1' : '#334155');

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

  const miniQrBlock = (
    <div
      className="p-[6px] rounded-[8px] border flex flex-col items-center flex-shrink-0"
      style={{ backgroundColor: coverData.qrBgColor || '#ffffff', borderColor: '#cbd5e1' }}
    >
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt="Mini QR Preview"
          referrerPolicy="no-referrer"
          className="w-[94px] h-[94px] object-contain rounded-[4px]"
        />
      ) : (
        <div className="w-[94px] h-[94px] bg-slate-100 rounded-[4px] flex items-center justify-center text-slate-400">
          <QrCode className="w-8 h-8" />
        </div>
      )}
    </div>
  );

  const miniMetaBlock = (
    <div className="space-y-[6px] text-[12px]" style={{ color: effectiveTextColor }}>
      {(coverData.preparedBy || currentDoc?.name) && (
        <div>
          <span className="text-[10px] uppercase font-bold opacity-60 block leading-tight">Prepared By</span>
          <span className="font-semibold leading-tight truncate block max-w-[220px]">
            {coverData.preparedBy || 'Author'}
          </span>
        </div>
      )}
      {coverData.date && (
        <div className="text-[11px] font-medium opacity-85 leading-tight">{coverData.date}</div>
      )}
      <div className="pt-[2px] text-[9px] opacity-60 font-mono">Official Soft Copy</div>
    </div>
  );

  return (
    <section
      aria-label="Cover Mini Preview"
      className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Scaled Live Cover Thumbnail */}
        <div
          className="shrink-0 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 shadow-sm bg-zinc-100 dark:bg-zinc-950 mx-auto sm:mx-0"
          style={{ width: THUMB_W, height: thumbH }}
        >
          <div
            style={{
              ...getFontStyle(),
              width: PAPER_W,
              height: paperH,
              transform: `scale(${SCALE})`,
              transformOrigin: 'top left',
              backgroundColor: theme.backgroundColor,
              color: isDarkModeTheme ? '#f8fafc' : '#0f172a',
            }}
            className="relative overflow-hidden flex flex-col justify-between pointer-events-none select-none"
          >
            {coverData.backgroundImageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center z-0"
                style={{
                  backgroundImage: `url(${coverData.backgroundImageUrl})`,
                  opacity: coverData.backgroundImageOpacity ?? 0.35,
                }}
              />
            )}

            {(theme.layoutStyle === 'banner-top' || theme.layoutStyle === 'split-vertical') &&
              !coverData.backgroundImageUrl && (
                <div className="relative z-10">
                  <div className="relative w-full h-[160px] overflow-hidden" style={{ backgroundColor: coverData.primaryColor }}>
                    {coverData.imageUrl && (
                      <img
                        src={coverData.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-90"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                    <div className="absolute bottom-0 inset-x-0 h-[6px]" style={{ backgroundColor: coverData.accentColor }} />
                  </div>
                </div>
              )}

            {theme.layoutStyle === 'bordered-formal' && (
              <div
                className="absolute inset-[12px] border-2 rounded z-10"
                style={{ borderColor: coverData.primaryColor }}
              >
                <div className="absolute inset-[6px] border" style={{ borderColor: coverData.accentColor }} />
              </div>
            )}

            {theme.layoutStyle === 'minimal-frame' && (
              <div
                className="absolute inset-[16px] border z-10"
                style={{ borderColor: `${coverData.accentColor}55` }}
              >
                <div className="absolute top-0 left-0 w-[16px] h-[16px] border-t-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
                <div className="absolute top-0 right-0 w-[16px] h-[16px] border-t-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
                <div className="absolute bottom-0 left-0 w-[16px] h-[16px] border-b-2 border-l-2" style={{ borderColor: coverData.accentColor }} />
                <div className="absolute bottom-0 right-0 w-[16px] h-[16px] border-b-2 border-r-2" style={{ borderColor: coverData.accentColor }} />
              </div>
            )}

            {theme.layoutStyle === 'geometric-grid' && (
              <div className="absolute inset-0 z-10">
                <div className="h-[6px] w-full" style={{ backgroundColor: coverData.accentColor }} />
                <div className="w-[6px] h-full absolute left-[24px] top-0" style={{ backgroundColor: `${coverData.accentColor}44` }} />
              </div>
            )}

            {theme.layoutStyle === 'card-centered' && (
              <div
                className="absolute inset-x-[32px] top-[48px] bottom-[48px] rounded-[12px] border z-0"
                style={{
                  borderColor: `${coverData.accentColor}40`,
                  backgroundColor: isDarkModeTheme ? '#18181b' : '#fafafa',
                }}
              />
            )}

            {theme.layoutStyle === 'bottom-accent' && (
              <div
                className="absolute inset-x-0 bottom-0 h-[112px] z-0 opacity-15"
                style={{ backgroundColor: coverData.primaryColor }}
              />
            )}

            {theme.layoutStyle === 'plain-rule' && (
              <>
                <div className="absolute top-[32px] inset-x-[40px] h-[2px] z-10" style={{ backgroundColor: coverData.primaryColor }} />
                <div className="absolute bottom-[24px] inset-x-[40px] h-[1px] z-10" style={{ backgroundColor: coverData.accentColor }} />
              </>
            )}

            {isLeftBar && (
              <>
                <div className="absolute left-0 inset-y-0 w-[12px] z-10" style={{ backgroundColor: coverData.primaryColor }} />
                <div className="absolute left-[20px] inset-y-0 w-[1px] z-10" style={{ backgroundColor: `${coverData.accentColor}66` }} />
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
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-[40px] max-w-[160px] object-contain"
                    />
                  </div>
                )}

                <div className={`mt-[8px] space-y-[10px] ${isCentered ? 'text-center' : ''}`}>
                  <h4
                    className="text-[30px] font-extrabold leading-[1.2] tracking-tight break-words line-clamp-3"
                    style={{ color: effectiveTitleColor }}
                  >
                    {coverData.title || currentDoc?.extractedTitle || currentDoc?.name || 'Document Title'}
                  </h4>

                  {coverData.subtitle && (
                    <p
                      className="text-[14px] font-medium leading-[1.35] opacity-90 line-clamp-2"
                      style={{ color: effectiveSubtitleColor }}
                    >
                      {coverData.subtitle}
                    </p>
                  )}

                  <div
                    className={`w-[48px] h-[4px] rounded-full my-[12px] ${isCentered ? 'mx-auto' : ''}`}
                    style={{ backgroundColor: coverData.accentColor }}
                  />
                </div>
              </div>

              {coverData.qrPosition === 'bottom-center' ? (
                <div className="pt-[16px] border-t border-slate-200/60 flex flex-col items-center gap-[8px]">
                  {miniQrBlock}
                </div>
              ) : coverData.qrPosition === 'bottom-left' ? (
                <div className="pt-[16px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
                  {miniQrBlock}
                  <div className="text-right">{miniMetaBlock}</div>
                </div>
              ) : (
                <div className="pt-[16px] border-t border-slate-200/60 flex items-end justify-between gap-[16px]">
                  {miniMetaBlock}
                  {miniQrBlock}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Layout Readout & Quick Jump Controls */}
        <div className="flex-1 min-w-0 w-full space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white tracking-tight">
                Mini Preview · {theme.name}
              </h3>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
                {theme.category} <span aria-hidden="true">·</span>{' '}
                {coverData.paperSize === 'letter' ? 'US Letter' : 'A4'} <span aria-hidden="true">·</span>{' '}
                <span className="capitalize">{coverData.font}</span>
              </p>
            </div>

            {onOpenFullPreview && (
              <button
                type="button"
                onClick={onOpenFullPreview}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-yellow-400 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Full Preview</span>
              </button>
            )}
          </div>

          {/* Real-Time Color & QR Summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 border-y border-zinc-200/80 dark:border-zinc-800/80 text-[11px] text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className="w-3 h-3 rounded-sm border border-zinc-300 dark:border-zinc-700 shrink-0"
                style={{ backgroundColor: coverData.primaryColor }}
              />
              <span>Primary {coverData.primaryColor.toUpperCase()}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className="w-3 h-3 rounded-sm border border-zinc-300 dark:border-zinc-700 shrink-0"
                style={{ backgroundColor: coverData.accentColor }}
              />
              <span>Accent {coverData.accentColor.toUpperCase()}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className="w-3 h-3 rounded-sm border border-zinc-300 dark:border-zinc-700 shrink-0"
                style={{ backgroundColor: effectiveTitleColor }}
              />
              <span>Title {effectiveTitleColor.toUpperCase()}</span>
            </span>
          </div>

          {/* Quick Jump Buttons Alongside Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {onJumpToThemes && (
              <button
                type="button"
                onClick={onJumpToThemes}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeStep === 2
                    ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400/70'
                }`}
              >
                <Layout className="w-3 h-3" />
                <span>Theme Styles</span>
              </button>
            )}

            {onJumpToColors && (
              <button
                type="button"
                onClick={onJumpToColors}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeStep === 3
                    ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-yellow-400/70'
                }`}
              >
                <Palette className="w-3 h-3" />
                <span>Colors & Text</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
