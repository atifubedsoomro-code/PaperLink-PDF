import React, { useMemo, useRef, useState } from 'react';
import {
  AppliedPdfStamp,
  CustomStampPreset,
  PdfStampPageScope,
  PdfStampPlacement,
  PdfStampShape,
} from '../types';
import {
  QUICK_STAMP_PHRASES,
  STAMP_INK_PALETTE,
  renderCustomTextStampDataUrl,
} from '../utils/stampRenderer';
import { compressDocumentImageDataUrl } from '../firebase';
import {
  BookmarkPlus,
  Check,
  CheckCircle2,
  Cloud,
  Edit3,
  HardDrive,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Save,
  Stamp,
  Trash2,
  Type,
  X,
} from 'lucide-react';

interface CustomStampSectionProps {
  appliedStamps: AppliedPdfStamp[];
  onChangeAppliedStamps: (next: AppliedPdfStamp[]) => void;
  stampPresets: CustomStampPreset[];
  onSaveStampPreset: (preset: CustomStampPreset) => Promise<CustomStampPreset>;
  onDeleteStampPreset: (presetId: string) => Promise<void>;
  userEmail?: string;
}

const POSITION_OPTIONS: { value: PdfStampPlacement; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'center', label: 'Page Center' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

const SCOPE_OPTIONS: { value: PdfStampPageScope; label: string; short: string }[] = [
  { value: 'all-attached', label: 'Attached PDF Pages (P2+)', short: 'Pages 2+' },
  { value: 'all-including-cover', label: 'All Pages (Cover + PDF)', short: 'All Pages' },
  { value: 'first-attached', label: 'First Attached Page (P2)', short: 'Page 2' },
  { value: 'cover-only', label: 'Cover Page Only (P1)', short: 'Cover P1' },
];

const SHAPE_OPTIONS: { value: PdfStampShape; label: string }[] = [
  { value: 'rect', label: 'Frame' },
  { value: 'double-rect', label: 'Double Frame' },
  { value: 'round', label: 'Round Seal' },
  { value: 'solid-badge', label: 'Solid Badge' },
];

export const CustomStampSection: React.FC<CustomStampSectionProps> = ({
  appliedStamps,
  onChangeAppliedStamps,
  stampPresets,
  onSaveStampPreset,
  onDeleteStampPreset,
  userEmail = '',
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState<string>('');
  const [kind, setKind] = useState<'text' | 'image'>('text');

  // Text stamp fields
  const [text, setText] = useState<string>('APPROVED');
  const [subtext, setSubtext] = useState<string>('');
  const [shape, setShape] = useState<PdfStampShape>('double-rect');
  const [color, setColor] = useState<string>('#059669');

  // Image stamp fields
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imageLabel, setImageLabel] = useState<string>('');

  // Shared placement & style fields
  const [position, setPosition] = useState<PdfStampPlacement>('bottom-right');
  const [pageScope, setPageScope] = useState<PdfStampPageScope>('all-attached');
  const [scale, setScale] = useState<number>(20);
  const [opacity, setOpacity] = useState<number>(0.88);
  const [rotationDeg, setRotationDeg] = useState<number>(-12);

  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showNotice = (type: 'ok' | 'err', msg: string) => {
    setNotice({ type, text: msg });
    window.setTimeout(() => {
      setNotice((cur) => (cur?.text === msg ? null : cur));
    }, 4000);
  };

  const liveTextPreviewUrl = useMemo(() => {
    if (kind !== 'text') return '';
    return renderCustomTextStampDataUrl({ text, subtext, shape, color }, 360);
  }, [kind, text, subtext, shape, color]);

  const activePreviewUrl = kind === 'image' ? imageUrl || '' : liveTextPreviewUrl;

  const canBuildStamp =
    kind === 'image' ? Boolean(imageUrl) : Boolean(text.trim().length > 0);

  const handleUploadStampImage = async (file: File | undefined) => {
    if (!file) return;
    setIsCompressingImage(true);
    try {
      const compressed = await compressDocumentImageDataUrl(file, {
        maxDim: 480,
        preservePngTransparency: true,
        maxLength: 165_000,
      });
      const finalUrl =
        compressed.length > 168_000
          ? await compressDocumentImageDataUrl(file, {
              maxDim: 420,
              quality: 0.72,
              preservePngTransparency: false,
              maxLength: 165_000,
            })
          : compressed;

      setKind('image');
      setImageUrl(finalUrl);
      const baseTitle = file.name.replace(/\.[^/.]+$/, '').slice(0, 48);
      setImageLabel(baseTitle);
      if (!presetName.trim()) {
        setPresetName(baseTitle || 'Custom Image Stamp');
      }
      setNotice(null);
    } catch (err: any) {
      showNotice('err', err?.message || 'Could not process the selected stamp image.');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const resetDesigner = () => {
    setEditingPresetId(null);
    setPresetName('');
    setKind('text');
    setText('APPROVED');
    setSubtext('');
    setShape('double-rect');
    setColor('#059669');
    setImageUrl(undefined);
    setImageLabel('');
    setPosition('bottom-right');
    setPageScope('all-attached');
    setScale(20);
    setOpacity(0.88);
    setRotationDeg(-12);
  };

  const handleSaveToLibrary = async () => {
    if (!canBuildStamp) {
      showNotice(
        'err',
        kind === 'image' ? 'Upload a stamp image first.' : 'Enter stamp text before saving.'
      );
      return;
    }

    const derivedName = (
      presetName.trim() ||
      (kind === 'image' ? imageLabel.trim() || 'Image Stamp' : text.trim())
    ).slice(0, 80);

    const existing = editingPresetId
      ? stampPresets.find((p) => p.id === editingPresetId)
      : undefined;
    const now = Date.now();

    const record: CustomStampPreset = {
      id: existing?.id || `stamp_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: derivedName,
      kind,
      ...(kind === 'image'
        ? { imageUrl }
        : {
            text: text.trim().slice(0, 48),
            subtext: subtext.trim().slice(0, 48) || undefined,
            shape,
            color,
          }),
      position,
      scale,
      opacity,
      rotationDeg,
      pageScope,
      userEmail: userEmail.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    setIsSavingPreset(true);
    try {
      const saved = await onSaveStampPreset(record);
      setEditingPresetId(null);
      setPresetName('');
      showNotice(
        'ok',
        userEmail.trim()
          ? `Saved "${saved.name}" to your stamp library (${userEmail.trim()}).`
          : `Saved "${saved.name}" to your browser stamp library.`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'Failed to save stamp preset.');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const applyStampObject = (source: {
    presetId?: string;
    name: string;
    kind: 'image' | 'text';
    imageUrl?: string;
    text?: string;
    subtext?: string;
    shape?: PdfStampShape;
    color?: string;
    position: PdfStampPlacement;
    scale: number;
    opacity: number;
    rotationDeg: number;
    pageScope: PdfStampPageScope;
  }) => {
    const newApplied: AppliedPdfStamp = {
      id: `app_st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...source,
    };
    onChangeAppliedStamps([...appliedStamps, newApplied]);
    showNotice('ok', `Applied "${source.name}" onto PDF pages (${SCOPE_OPTIONS.find((s) => s.value === source.pageScope)?.short || 'Pages 2+'}).`);
  };

  const handleApplyCurrentDesigner = () => {
    if (!canBuildStamp) {
      showNotice(
        'err',
        kind === 'image' ? 'Upload a stamp image first.' : 'Enter stamp text to apply.'
      );
      return;
    }
    const label = (
      presetName.trim() ||
      (kind === 'image' ? imageLabel.trim() || 'Image Stamp' : text.trim())
    ).slice(0, 80);

    applyStampObject({
      presetId: editingPresetId || undefined,
      name: label,
      kind,
      ...(kind === 'image'
        ? { imageUrl }
        : {
            text: text.trim().slice(0, 48),
            subtext: subtext.trim().slice(0, 48) || undefined,
            shape,
            color,
          }),
      position,
      scale,
      opacity,
      rotationDeg,
      pageScope,
    });
  };

  const handleLoadPresetForEdit = (preset: CustomStampPreset) => {
    setEditingPresetId(preset.id);
    setPresetName(preset.name);
    setKind(preset.kind);
    if (preset.kind === 'image') {
      setImageUrl(preset.imageUrl);
      setImageLabel(preset.name);
    } else {
      setText(preset.text || 'APPROVED');
      setSubtext(preset.subtext || '');
      setShape(preset.shape || 'rect');
      setColor(preset.color || '#dc2626');
    }
    setPosition(preset.position);
    setPageScope(preset.pageScope);
    setScale(preset.scale);
    setOpacity(preset.opacity);
    setRotationDeg(preset.rotationDeg);
  };

  const updateAppliedStamp = (id: string, patch: Partial<AppliedPdfStamp>) => {
    onChangeAppliedStamps(
      appliedStamps.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const removeAppliedStamp = (id: string) => {
    onChangeAppliedStamps(appliedStamps.filter((s) => s.id !== id));
  };

  return (
    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4 text-xs">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <Stamp className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
            <span>Custom Image &amp; Text PDF Stamps Library</span>
          </h4>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
            Upload image seals or build text stamps, save reusable presets to your library, and stamp PDF pages directly.
          </p>
        </div>

        {/* Kind Switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => setKind('text')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
              kind === 'text'
                ? 'bg-yellow-400 text-black'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <Type className="w-3 h-3" />
            <span>Text Stamp</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('image')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
              kind === 'image'
                ? 'bg-yellow-400 text-black'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <ImagePlus className="w-3 h-3" />
            <span>Image Stamp</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Notice */}
      {notice && (
        <div
          className={`px-3 py-2 rounded-lg border text-[11px] font-semibold flex items-center justify-between gap-2 ${
            notice.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{notice.text}</span>
          </span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer opacity-75 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Designer + Live Stamp Preview */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start pt-1">
        {/* Controls Column */}
        <div className="md:col-span-8 space-y-3">
          {kind === 'text' ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_STAMP_PHRASES.map((p) => (
                  <button
                    key={p.text}
                    type="button"
                    onClick={() => {
                      setText(p.text);
                      setSubtext(p.subtext || '');
                      setShape(p.shape);
                      setColor(p.color);
                      if (!editingPresetId) setPresetName(`${p.text} Stamp`);
                    }}
                    className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-yellow-400 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                  >
                    {p.text}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-semibold">
                    Stamp Headline
                  </label>
                  <input
                    type="text"
                    maxLength={48}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. APPROVED"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-bold uppercase focus:border-yellow-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-semibold">
                    Subtitle / Dept (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={48}
                    value={subtext}
                    onChange={(e) => setSubtext(e.target.value)}
                    placeholder="e.g. ACCOUNTS DEPT"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white uppercase font-mono focus:border-yellow-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1">
                  {SHAPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setShape(opt.value)}
                      className={`px-2 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                        shape === opt.value
                          ? 'border-yellow-400 bg-yellow-400/15 text-amber-800 dark:text-yellow-300 font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  {STAMP_INK_PALETTE.map((ink) => (
                    <button
                      key={ink.value}
                      type="button"
                      title={ink.label}
                      onClick={() => setColor(ink.value)}
                      className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                        color.toLowerCase() === ink.value.toLowerCase()
                          ? 'ring-2 ring-yellow-400 scale-110 border-white'
                          : 'border-black/20 dark:border-white/25'
                      }`}
                      style={{ backgroundColor: ink.value }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    title="Custom stamp ink color"
                    className="w-6 h-6 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-zinc-900 dark:text-white text-xs">
                  {imageUrl ? imageLabel || 'Uploaded Stamp Image' : 'Upload PNG, JPG, or SVG Seal'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Transparent PNGs work best for realistic ink-over-text PDF stamps.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl(undefined);
                      setImageLabel('');
                    }}
                    className="text-[11px] text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleUploadStampImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isCompressingImage}
                  onClick={() => imageInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isCompressingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  <span>{imageUrl ? 'Replace Image' : 'Upload Stamp'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Target Pages, Position & Geometry Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                Apply To PDF Pages
              </label>
              <select
                value={pageScope}
                onChange={(e) => setPageScope(e.target.value as PdfStampPageScope)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white cursor-pointer"
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                Placement on Page
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as PdfStampPlacement)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white cursor-pointer"
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <div className="flex justify-between text-[10px] text-zinc-600 dark:text-zinc-400 mb-0.5 tabular-nums">
                <span>Size</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{scale}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={45}
                step={1}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-zinc-600 dark:text-zinc-400 mb-0.5 tabular-nums">
                <span>Opacity</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-zinc-600 dark:text-zinc-400 mb-0.5 tabular-nums">
                <span>Tilt</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{rotationDeg}°</span>
              </div>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
                className="w-full accent-yellow-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Live Stamp Specimen Card */}
        <div className="md:col-span-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white p-3 flex flex-col items-center justify-center min-h-[150px] relative overflow-hidden">
          <span className="text-[10px] font-semibold text-zinc-400 self-start mb-1">
            Stamp Preview
          </span>
          <div className="flex-1 w-full flex items-center justify-center py-2">
            {activePreviewUrl ? (
              <img
                src={activePreviewUrl}
                alt="Live stamp preview"
                className="max-w-[140px] max-h-[96px] object-contain select-none"
                style={{
                  opacity,
                  transform: `rotate(${rotationDeg}deg)`,
                }}
              />
            ) : (
              <span className="text-[11px] text-zinc-400 text-center">
                Upload an image or type text to preview
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
            {POSITION_OPTIONS.find((p) => p.value === position)?.label} ·{' '}
            {SCOPE_OPTIONS.find((s) => s.value === pageScope)?.short}
          </span>
        </div>
      </div>

      {/* Save Preset & Apply Directly Footer Row */}
      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="text"
          maxLength={80}
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="Preset label (e.g. Verified Seal)"
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold focus:border-yellow-400 focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {editingPresetId && (
            <button
              type="button"
              onClick={resetDesigner}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 font-semibold cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
          <button
            type="button"
            disabled={isSavingPreset || !canBuildStamp}
            onClick={handleSaveToLibrary}
            className="px-3 py-1.5 rounded-lg border border-amber-500/45 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSavingPreset ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : editingPresetId ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            <span>{editingPresetId ? 'Update Preset' : 'Save to Library'}</span>
          </button>

          <button
            type="button"
            disabled={!canBuildStamp}
            onClick={handleApplyCurrentDesigner}
            className="px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Apply to PDF Pages</span>
          </button>
        </div>
      </div>

      {/* Saved Stamp Library Presets */}
      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
            <span>Saved Stamp Library ({stampPresets.length})</span>
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {userEmail ? `Synced to ${userEmail}` : 'Saved locally in browser'}
          </span>
        </div>

        {stampPresets.length === 0 ? (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 py-1">
            No custom stamps saved yet. Design a text badge or upload a stamp PNG above and click Save to Library.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-0.5">
            {stampPresets.map((preset) => {
              const thumbUrl =
                preset.kind === 'image'
                  ? preset.imageUrl || ''
                  : renderCustomTextStampDataUrl(
                      {
                        text: preset.text,
                        subtext: preset.subtext,
                        shape: preset.shape,
                        color: preset.color,
                      },
                      220
                    );
              const isApplied = appliedStamps.some((a) => a.presetId === preset.id);
              const scopeShort =
                SCOPE_OPTIONS.find((s) => s.value === preset.pageScope)?.short || 'Pages 2+';
              const posShort =
                POSITION_OPTIONS.find((p) => p.value === preset.position)?.label || 'Bottom Right';

              return (
                <div
                  key={preset.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-xl border bg-white dark:bg-zinc-900 ${
                    editingPresetId === preset.id
                      ? 'border-yellow-400'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-11 h-9 rounded-lg bg-white border border-zinc-200 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={preset.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <Stamp className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-zinc-900 dark:text-white truncate text-[11px]">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
                        {preset.userEmail ? (
                          <Cloud className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <HardDrive className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {scopeShort} · {posShort}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        applyStampObject({
                          presetId: preset.id,
                          name: preset.name,
                          kind: preset.kind,
                          imageUrl: preset.imageUrl,
                          text: preset.text,
                          subtext: preset.subtext,
                          shape: preset.shape,
                          color: preset.color,
                          position: preset.position,
                          scale: preset.scale,
                          opacity: preset.opacity,
                          rotationDeg: preset.rotationDeg,
                          pageScope: preset.pageScope,
                        })
                      }
                      className={`px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                        isApplied
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                          : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                      }`}
                    >
                      {isApplied ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      <span>{isApplied ? 'Added' : 'Apply'}</span>
                    </button>

                    <button
                      type="button"
                      title="Edit preset"
                      onClick={() => handleLoadPresetForEdit(preset)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      title="Delete preset"
                      onClick={() => void onDeleteStampPreset(preset.id)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Currently Applied Stamps on Active PDF */}
      {appliedStamps.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Active Stamps on PDF ({appliedStamps.length})</span>
            </span>
            <button
              type="button"
              onClick={() => onChangeAppliedStamps([])}
              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
            >
              Clear all stamps
            </button>
          </div>

          <div className="space-y-2">
            {appliedStamps.map((st) => (
              <div
                key={st.id}
                className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-900 dark:text-white text-[11px] truncate">
                    {st.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      value={st.pageScope}
                      onChange={(e) =>
                        updateAppliedStamp(st.id, {
                          pageScope: e.target.value as PdfStampPageScope,
                        })
                      }
                      className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
                    >
                      {SCOPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.short}
                        </option>
                      ))}
                    </select>
                    <select
                      value={st.position}
                      onChange={(e) =>
                        updateAppliedStamp(st.id, {
                          position: e.target.value as PdfStampPlacement,
                        })
                      }
                      className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
                    >
                      {POSITION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Remove stamp from PDF"
                      onClick={() => removeAppliedStamp(st.id)}
                      className="p-1 rounded text-zinc-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  <label className="flex items-center gap-1.5">
                    <span>Size {st.scale}%</span>
                    <input
                      type="range"
                      min={10}
                      max={45}
                      value={st.scale}
                      onChange={(e) =>
                        updateAppliedStamp(st.id, { scale: Number(e.target.value) })
                      }
                      className="flex-1 accent-yellow-400 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span>{Math.round(st.opacity * 100)}%</span>
                    <input
                      type="range"
                      min={0.15}
                      max={1}
                      step={0.05}
                      value={st.opacity}
                      onChange={(e) =>
                        updateAppliedStamp(st.id, { opacity: Number(e.target.value) })
                      }
                      className="flex-1 accent-yellow-400 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span>{st.rotationDeg}°</span>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      value={st.rotationDeg}
                      onChange={(e) =>
                        updateAppliedStamp(st.id, { rotationDeg: Number(e.target.value) })
                      }
                      className="flex-1 accent-yellow-400 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
