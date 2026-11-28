import { CoverData, CoverTheme, FontStyle } from '../types';

export interface ParsedSummaryLine {
  kind: 'blank' | 'bullet' | 'numbered' | 'paragraph';
  indentLevel: number;
  marker?: string;
  text: string;
}

export function getCoverFontCssFamily(font: FontStyle): string {
  switch (font) {
    case 'playfair':
      return '"Playfair Display", Georgia, serif';
    case 'merriweather':
      return '"Merriweather", Georgia, serif';
    case 'mono':
      return '"JetBrains Mono", monospace';
    case 'montserrat':
      return '"Montserrat", "Plus Jakarta Sans", sans-serif';
    case 'oswald':
      return '"Oswald", sans-serif';
    case 'space':
    case 'inter':
    default:
      return '"Plus Jakarta Sans", "DM Sans", sans-serif';
  }
}

export function parseSummaryLines(raw: string): ParsedSummaryLine[] {
  if (!raw) return [];
  const rawLines = raw.replace(/\r\n/g, '\n').split('\n');
  return rawLines.map((line) => {
    if (line.trim() === '') {
      return { kind: 'blank', indentLevel: 0, text: '' };
    }
    const leadingSpacesMatch = line.match(/^(\s*)/);
    const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[1].length : 0;
    const indentLevel = Math.min(4, Math.floor(leadingSpaces / 2));

    const bulletMatch = line.match(/^\s*([-*•◦▪])\s+(.*)$/);
    if (bulletMatch) {
      return {
        kind: 'bullet',
        indentLevel,
        marker: '•',
        text: bulletMatch[2],
      };
    }

    const numMatch = line.match(/^\s*(\d+[.)])\s+(.*)$/);
    if (numMatch) {
      return {
        kind: 'numbered',
        indentLevel,
        marker: numMatch[1],
        text: numMatch[2],
      };
    }

    return {
      kind: 'paragraph',
      indentLevel,
      text: line.replace(/^\s+/, (ws) => '\u00A0'.repeat(Math.min(8, ws.length))),
    };
  });
}

export function isCenteredCoverLayout(layoutStyle: CoverTheme['layoutStyle']): boolean {
  return (
    layoutStyle === 'plain-centered' ||
    layoutStyle === 'card-centered' ||
    layoutStyle === 'certificate-frame'
  );
}

export function hasBannerHeaderLayout(
  layoutStyle: CoverTheme['layoutStyle'],
  hasBackgroundImage: boolean
): boolean {
  if (hasBackgroundImage) return false;
  return (
    layoutStyle === 'banner-top' ||
    layoutStyle === 'split-vertical' ||
    layoutStyle === 'full-bleed-hero'
  );
}

export function resolveEffectiveColors(coverData: CoverData, theme: CoverTheme) {
  const isDarkModeTheme = !!theme.isDark;
  return {
    isDarkModeTheme,
    effectiveTitleColor:
      coverData.titleColor || (isDarkModeTheme ? '#ffffff' : coverData.primaryColor),
    effectiveSubtitleColor: coverData.subtitleColor || coverData.accentColor,
    effectiveTextColor:
      coverData.textColor || (isDarkModeTheme ? '#cbd5e1' : '#334155'),
    effectiveBorderColor: coverData.borderColor || coverData.primaryColor,
    effectiveBorderWidth: Math.max(1, Math.min(6, coverData.borderWidth ?? 2)),
  };
}
