import React, { useRef, useState } from 'react';
import { BrandKitPreset, CoverData, FontStyle, QRPosition } from '../types';
import { PRESET_IMAGES } from '../constants/themes';
import {
  Palette,
  Type,
  Upload,
  Check,
  RotateCcw,
  Image as ImageIcon,
  QrCode,
  Bookmark,
  Trash2,
  ShieldCheck,
  Stamp,
} from 'lucide-react';

interface ColorPreset {
  id: string;
  name: string;
  primary: string;
  accent: string;
  titleColor: string;
  subtitleColor: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'electric-yellow',
    name: 'Yellow & Ink',
    primary: '#09090b',
    accent: '#facc15',
    titleColor: '#facc15',
    subtitleColor: '#fde047',
  },
  {
    id: 'executive-slate',
    name: 'Slate Blue',
    primary: '#0f172a',
    accent: '#3b82f6',
    titleColor: '#0f172a',
    subtitleColor: '#2563eb',
  },
  {
    id: 'imperial-crimson',
    name: 'Crimson',
    primary: '#18181b',
    accent: '#dc2626',
    titleColor: '#18181b',
    subtitleColor: '#dc2626',
  },
  {
    id: 'emerald-eco',
    name: 'Forest Green',
    primary: '#064e3b',
    accent: '#10b981',
    titleColor: '#064e3b',
    subtitleColor: '#059669',
  },
  {
    id: 'royal-indigo',
    name: 'Deep Indigo',
    primary: '#1e1b4b',
    accent: '#6366f1',
    titleColor: '#1e1b4b',
    subtitleColor: '#4f46e5',
  },
  {
    id: 'luxury-gold',
    name: 'Obsidian Gold',
    primary: '#09090b',
    accent: '#d97706',
    titleColor: '#fbbf24',
    subtitleColor: '#fde68a',
  },
];

interface ColorCarouselProps {
  coverData: CoverData;
  onChange: (updated: CoverData) => void;
  brandKits?: BrandKitPreset[];
  onSaveBrandKit?: (name: string) => void;
  onApplyBrandKit?: (kit: BrandKitPreset) => void;
  onDeleteBrandKit?: (id: string) => void;
}

export const ColorCarousel: React.FC<ColorCarouselProps> = ({
  coverData,
  onChange,
  brandKits = [],
  onSaveBrandKit,
  onApplyBrandKit,
  onDeleteBrandKit,
}) => {
  const [subTab, setSubTab] = useState<'colors' | 'details' | 'branding'>('colors');
  const [newKitName, setNewKitName] = useState('');
  const [showKitSaveInput, setShowKitSaveInput] = useState(false);
  const customLogoInputRef = useRef<HTMLInputElement>(null);
  const customBgInputRef = useRef<HTMLInputElement>(null);
  const includeQr = coverData.includeQr !== false;

  const applyPreset = (preset: ColorPreset) => {
    onChange({
      ...coverData,
      primaryColor: preset.primary,
      accentColor: preset.accent,
      titleColor: preset.titleColor,
      subtitleColor: preset.subtitleColor,
    });
  };

  const updateField = <K extends keyof CoverData>(field: K, value: CoverData[K]) => {
    onChange({
      ...coverData,
      [field]: value,
    });
  };

  const handleImageFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) onLoaded(event.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSaveKit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKitName.trim() || coverData.organization || 'My Brand Kit';
    onSaveBrandKit?.(trimmed);
    setNewKitName('');
    setShowKitSaveInput(false);
  };

  const fonts: { id: FontStyle; name: string }[] = [
    { id: 'inter', name: 'Plus Jakarta / Clean Sans' },
    { id: 'playfair', name: 'Playfair Display (Editorial Serif)' },
    { id: 'space', name: 'Geometric Tech Sans' },
    { id: 'mono', name: 'JetBrains Mono (Technical)' },
    { id: 'merriweather', name: 'Merriweather (Academic Serif)' },
    { id: 'montserrat', name: 'Montserrat (Bold Headline)' },
    { id: 'oswald', name: 'Oswald (Condensed Headline)' },
  ];

  return (
    <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-5">
      {/* Header & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            03. Customize Colors, Copy & Branding
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            {includeQr
              ? 'Fine-tune palette, fonts, verification stamps, Brand Kits, and QR position'
              : 'Fine-tune palette, typography, logo, and verification stamps'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shrink-0">
          {[
            { id: 'colors' as const, label: 'Palette & Fonts' },
            { id: 'details' as const, label: 'Cover Text' },
            { id: 'branding' as const, label: 'Logo & Stamps' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                subTab === tab.id
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Kit Quick Bar */}
      {onSaveBrandKit && (
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              Brand Kit Presets
            </span>

            {!showKitSaveInput ? (
              <button
                type="button"
                onClick={() => setShowKitSaveInput(true)}
                className="text-xs font-semibold text-amber-700 dark:text-yellow-400 hover:underline cursor-pointer"
              >
                + Save current style as kit
              </button>
            ) : (
              <form onSubmit={handleConfirmSaveKit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  placeholder="Kit name (e.g. Acme Corp)"
                  className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none w-44"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowKitSaveInput(false)}
                  className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {brandKits.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {brandKits.map((kit) => (
                <div
                  key={kit.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => onApplyBrandKit?.(kit)}
                    className="inline-flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-yellow-400 cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-zinc-300 dark:border-zinc-700"
                      style={{ backgroundColor: kit.accentColor }}
                    />
                    <span>{kit.name}</span>
                  </button>
                  {onDeleteBrandKit && (
                    <button
                      type="button"
                      onClick={() => onDeleteBrandKit(kit.id)}
                      aria-label={`Delete ${kit.name}`}
                      className="text-zinc-400 hover:text-red-500 ml-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Save your organization, logo, fonts, and palette to reuse them across documents in one click.
            </p>
          )}
        </div>
      )}

      {/* TAB 1: PALETTE, COLORS & FONT */}
      {subTab === 'colors' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-amber-700 dark:text-yellow-400 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              Color Presets
            </span>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-none">
              {COLOR_PRESETS.map((preset) => {
                const isSelected =
                  coverData.accentColor === preset.accent &&
                  coverData.titleColor === preset.titleColor;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`flex-shrink-0 p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between w-36 h-22 relative ${
                      isSelected
                        ? 'border-yellow-400 bg-yellow-400/10 dark:bg-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-300 dark:border-white/20"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-300 dark:border-white/20"
                        style={{ backgroundColor: preset.titleColor }}
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700"
                        style={{ backgroundColor: preset.primary }}
                      />
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{preset.name}</h4>
                      <span
                        className="text-[11px] font-mono truncate block font-semibold"
                        style={{ color: preset.accent === '#facc15' ? '#a16207' : preset.accent }}
                      >
                        {preset.accent}
                      </span>
                    </div>

                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-yellow-400 text-black flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 dark:text-white">Individual Colors</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...coverData,
                    titleColor: undefined,
                    subtitleColor: undefined,
                    textColor: undefined,
                  })
                }
                className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-yellow-400 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset text defaults
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                {
                  label: 'Title Color',
                  value: coverData.titleColor || coverData.primaryColor,
                  onPick: (val: string) => updateField('titleColor', val),
                },
                {
                  label: 'Accent Highlight',
                  value: coverData.accentColor,
                  onPick: (val: string) => updateField('accentColor', val),
                },
                {
                  label: 'Subtitle Color',
                  value: coverData.subtitleColor || coverData.accentColor,
                  onPick: (val: string) => updateField('subtitleColor', val),
                },
                {
                  label: 'Body Text',
                  value: coverData.textColor || '#334155',
                  onPick: (val: string) => updateField('textColor', val),
                },
              ].map((c) => (
                <div key={c.label}>
                  <span className="text-zinc-600 dark:text-zinc-400 block mb-1">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={c.value}
                      onChange={(e) => c.onPick(e.target.value)}
                      className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-zinc-900 dark:text-white uppercase">{c.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                Cover Typography Font
              </label>
              <select
                value={coverData.font}
                onChange={(e) => updateField('font', e.target.value as FontStyle)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium focus:border-yellow-400 focus:outline-none cursor-pointer"
              >
                {fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                Paper Size
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['a4', 'letter'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateField('paperSize', sz)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      coverData.paperSize === sz
                        ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    {sz === 'a4' ? 'A4 Print' : 'US Letter'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OPTIONAL COVER METADATA + VERIFICATION BADGE */}
      {subTab === 'details' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={coverData.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Auto-filled from document filename"
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-white font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Subtitle (Optional)
              </label>
              <input
                type="text"
                value={coverData.subtitle}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="e.g. Annual Audit or Project Dossier"
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Author / Prepared By (Optional)
              </label>
              <input
                type="text"
                value={coverData.preparedBy}
                onChange={(e) => updateField('preparedBy', e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Organization (Optional)
              </label>
              <input
                type="text"
                value={coverData.organization}
                onChange={(e) => updateField('organization', e.target.value)}
                placeholder="Company or institution"
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Document ID / Ref (Optional)
              </label>
              <input
                type="text"
                value={coverData.documentId}
                onChange={(e) => updateField('documentId', e.target.value)}
                placeholder="e.g. DOC-2026-01"
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none font-mono text-amber-700 dark:text-yellow-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Date (Optional)
              </label>
              <input
                type="text"
                value={coverData.date}
                onChange={(e) => updateField('date', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Summary / Description (Optional)
            </label>
            <textarea
              rows={2}
              value={coverData.summary}
              onChange={(e) => updateField('summary', e.target.value)}
              placeholder="Optional short overview printed on the cover sheet"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
            />
          </div>

          {includeQr && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                QR Scan Caption
              </label>
              <input
                type="text"
                value={coverData.qrCallToAction}
                onChange={(e) => updateField('qrCallToAction', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-yellow-400 focus:outline-none text-zinc-900 dark:text-zinc-200"
              />
            </div>
          )}

          {/* Dynamic QR Cover Verification Badge */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                Verification Footer Stamp (Optional)
              </span>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!coverData.showSyncTimestamp}
                  onChange={(e) => updateField('showSyncTimestamp', e.target.checked)}
                  className="w-3.5 h-3.5 accent-yellow-400"
                />
                <span>Print sync timestamp</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                  Revision / Version
                </label>
                <input
                  type="text"
                  value={coverData.version || ''}
                  onChange={(e) => updateField('version', e.target.value)}
                  placeholder="e.g. v1.0"
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 font-mono text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                  Validity / Expiry Note
                </label>
                <input
                  type="text"
                  value={coverData.expiryNote || ''}
                  onChange={(e) => updateField('expiryNote', e.target.value)}
                  placeholder="e.g. Valid through Q4 2026"
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOGO, BACKGROUND, QR & APPENDED PAGE STAMPS */}
      {subTab === 'branding' && (
        <div className="space-y-4">
          {/* Logo Upload */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  Personal or Brand Logo (Optional)
                </h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Placed on header or inside the QR center</p>
              </div>
              <div className="flex items-center gap-2">
                {coverData.logoUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('logoUrl', undefined)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => customLogoInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer"
                >
                  {coverData.logoUrl ? 'Replace' : 'Upload Logo'}
                </button>
                <input
                  ref={customLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageFile(e, (url) =>
                      onChange({
                        ...coverData,
                        logoUrl: url,
                        logoSize: coverData.logoSize || 'medium',
                        logoPosition: coverData.logoPosition || 'top-left',
                      })
                    )
                  }
                  className="hidden"
                />
              </div>
            </div>

            {coverData.logoUrl && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block mb-1">Logo Position</span>
                  <select
                    value={coverData.logoPosition || 'top-left'}
                    onChange={(e) => updateField('logoPosition', e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    {includeQr && <option value="qr-center">QR Center Only</option>}
                  </select>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block mb-1">Logo Size</span>
                  <select
                    value={coverData.logoSize || 'medium'}
                    onChange={(e) => updateField('logoSize', e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Background Image & Theme Art */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  Custom Background Watermark (Optional)
                </h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Overlay a custom image across the cover sheet
                </p>
              </div>
              <div className="flex items-center gap-2">
                {coverData.backgroundImageUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('backgroundImageUrl', undefined)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => customBgInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-zinc-800 dark:text-zinc-200 font-semibold text-xs cursor-pointer"
                >
                  {coverData.backgroundImageUrl ? 'Replace' : 'Upload Background'}
                </button>
                <input
                  ref={customBgInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageFile(e, (url) =>
                      onChange({
                        ...coverData,
                        backgroundImageUrl: url,
                        backgroundImageOpacity: coverData.backgroundImageOpacity ?? 0.35,
                      })
                    )
                  }
                  className="hidden"
                />
              </div>
            </div>

            {coverData.backgroundImageUrl && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Background Opacity</span>
                  <span className="font-mono text-amber-700 dark:text-yellow-400 tabular-nums">
                    {Math.round((coverData.backgroundImageOpacity ?? 0.35) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  value={coverData.backgroundImageOpacity ?? 0.35}
                  onChange={(e) => updateField('backgroundImageOpacity', parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 pt-1">
              {PRESET_IMAGES.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => updateField('imageUrl', img.url)}
                  className={`relative rounded-lg overflow-hidden h-12 border cursor-pointer ${
                    coverData.imageUrl === img.url
                      ? 'ring-2 ring-yellow-400 border-transparent'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* QR Block Placement & Colors (only when With QR mode is active) */}
          {includeQr && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  QR Placement
                </label>
                <select
                  value={coverData.qrPosition}
                  onChange={(e) => updateField('qrPosition', e.target.value as QRPosition)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>

              <div>
                <span className="text-zinc-600 dark:text-zinc-400 block mb-1">QR Foreground</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={coverData.qrColor}
                    onChange={(e) => updateField('qrColor', e.target.value)}
                    className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-zinc-900 dark:text-white uppercase">{coverData.qrColor}</span>
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={coverData.showLogoInQR}
                    onChange={(e) => updateField('showLogoInQR', e.target.checked)}
                    className="w-4 h-4 accent-yellow-400"
                  />
                  <span>Embed logo inside QR</span>
                </label>
              </div>
            </div>
          )}

          {/* Appended Document Pages Stamper (Pages 2..N) */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Stamp className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  Appended Pages Stamper (Pages 2+)
                </h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Optionally stamp page numbers or a diagonal watermark across attached pages
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300 shrink-0">
                <input
                  type="checkbox"
                  checked={!!coverData.stampPageNumbers}
                  onChange={(e) => updateField('stampPageNumbers', e.target.checked)}
                  className="w-4 h-4 accent-yellow-400"
                />
                <span>Page numbers</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 block mb-1">
                  Diagonal Watermark Text (Optional)
                </label>
                <input
                  type="text"
                  value={coverData.watermarkText || ''}
                  onChange={(e) => updateField('watermarkText', e.target.value)}
                  placeholder="e.g. CONFIDENTIAL or DRAFT"
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>

              {coverData.watermarkText && (
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                    <span>Watermark Opacity</span>
                    <span className="font-mono text-amber-700 dark:text-yellow-400 tabular-nums">
                      {Math.round((coverData.watermarkOpacity ?? 0.14) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.06"
                    max="0.4"
                    step="0.02"
                    value={coverData.watermarkOpacity ?? 0.14}
                    onChange={(e) => updateField('watermarkOpacity', parseFloat(e.target.value))}
                    className="w-full accent-yellow-400 cursor-pointer mt-1.5"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
