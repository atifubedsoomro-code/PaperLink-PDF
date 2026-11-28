export type PaperSize = 'a4' | 'letter';

export type FontStyle = 'inter' | 'playfair' | 'space' | 'mono' | 'merriweather' | 'montserrat' | 'oswald';

export type QRPosition = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'sidebar' | 'hero';

export type DriveUploadMode = 'source' | 'merged';

export type CoverBorderStyle =
  | 'none'
  | 'solid'
  | 'double'
  | 'dashed'
  | 'corner-accents'
  | 'inset-frame';

export type CoverDraggableKey =
  | 'logo'
  | 'headerMeta'
  | 'titleBlock'
  | 'summary'
  | 'metaBlock'
  | 'qrBlock'
  | 'signature';

export interface CoverTheme {
  id: string;
  name: string;
  description: string;
  category:
    | 'Plain'
    | 'Corporate'
    | 'Minimalist'
    | 'Creative'
    | 'Academic'
    | 'Modern'
    | 'Luxury'
    | 'Editorial'
    | 'Official';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  defaultFont: FontStyle;
  defaultImage: string;
  layoutStyle:
    | 'banner-top'
    | 'split-vertical'
    | 'minimal-frame'
    | 'full-overlay'
    | 'geometric-grid'
    | 'bottom-accent'
    | 'card-centered'
    | 'bordered-formal'
    // Picture-free layouts
    | 'plain'
    | 'plain-rule'
    | 'plain-left-bar'
    | 'plain-centered'
    // Expanded architectural & official templates
    | 'ribbon-crest'
    | 'diagonal-accent'
    | 'split-cover'
    | 'certificate-frame'
    | 'executive-memo'
    | 'full-bleed-hero';
  /** Dark background theme: light title and body text */
  isDark?: boolean;
}

export interface CoverData {
  title: string;
  subtitle: string;
  preparedBy: string;
  organization: string;
  documentId: string;
  date: string;
  summary: string;
  qrCallToAction: string;
  imageUrl: string;
  logoUrl?: string;
  logoSize?: 'small' | 'medium' | 'large';
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'qr-center';
  themeId: string;
  primaryColor: string;
  accentColor: string;
  titleColor?: string;
  subtitleColor?: string;
  textColor?: string;
  backgroundImageUrl?: string;
  backgroundImageOpacity?: number;
  backgroundImageStyle?: 'banner' | 'full' | 'frame';
  font: FontStyle;
  paperSize: PaperSize;
  qrPosition: QRPosition;
  qrColor: string;
  qrBgColor: string;
  showLogoInQR: boolean;
  /** Set to false for clean basic covers without a QR code block */
  includeQr?: boolean;
  /** Text formatting & sizing flags (px at 500px preview scale) */
  titleFontSize?: number;
  subtitleFontSize?: number;
  summaryFontSize?: number;
  aiAnalyzedCategory?: string;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  subtitleBold?: boolean;
  subtitleItalic?: boolean;
  subtitleUnderline?: boolean;
  summaryBold?: boolean;
  summaryItalic?: boolean;
  summaryUnderline?: boolean;
  /** Custom page border styling */
  borderStyle?: CoverBorderStyle;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  /** Drag-and-drop canvas element offsets in base 500px preview units */
  elementOffsets?: Partial<Record<CoverDraggableKey, { x: number; y: number }>>;
  /** Optional saved signature drawn directly onto the cover */
  signatureUrl?: string;
  signatureLabel?: string;
  /** Optional dynamic QR verification metadata printed on cover footer */
  version?: string;
  showSyncTimestamp?: boolean;
  expiryNote?: string;
  /** Optional stamping across appended original document pages */
  stampPageNumbers?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
  /** Scaling percentage (50–125, default 100) of uploaded document pages relative to the cover page */
  documentPageScale?: number;
  /** Custom image/text stamps applied directly onto Cover or appended PDF pages */
  appliedStamps?: AppliedPdfStamp[];
}

export type PdfStampShape = 'rect' | 'double-rect' | 'round' | 'solid-badge';

export type PdfStampPlacement =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type PdfStampPageScope =
  | 'all-attached'
  | 'all-including-cover'
  | 'first-attached'
  | 'cover-only';

export interface CustomStampPreset {
  id: string;
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
  userEmail: string;
  createdAt: number;
  updatedAt?: number;
}

export interface AppliedPdfStamp {
  id: string;
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
}

export interface UserBiodataPreset {
  id: string;
  name: string;
  fullName: string;
  fatherName: string;
  contactNumber: string;
  email: string;
  organization: string;
  designation: string;
  nationalIdNumber: string;
  passportNumber: string;
  address: string;
  notes: string;
  coverTitle: string;
  coverSubtitle: string;
  updatedAt: number;
}

export interface UserProfileData {
  uid: string;
  userEmail: string;
  fullName: string;
  fatherName: string;
  contactNumber: string;
  email: string;
  dateOfBirth: string;
  nationalIdNumber: string;
  passportNumber: string;
  organization: string;
  designation: string;
  address: string;
  bioNotes: string;
  nationalIdFrontUrl?: string;
  nationalIdBackUrl?: string;
  passportImageUrl?: string;
  signatureUrl?: string;
  avatarUrl?: string;
  presets: UserBiodataPreset[];
  createdAt: number;
  updatedAt: number;
}

export interface BrandKitPreset {
  id: string;
  name: string;
  organization?: string;
  preparedBy?: string;
  logoUrl?: string;
  logoSize?: 'small' | 'medium' | 'large';
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'qr-center';
  themeId?: string;
  primaryColor: string;
  accentColor: string;
  titleColor?: string;
  subtitleColor?: string;
  textColor?: string;
  font: FontStyle;
  qrPosition: QRPosition;
  qrColor?: string;
  qrBgColor?: string;
  showLogoInQR?: boolean;
  userEmail: string;
  createdAt: number;
}

export interface LetterheadPresetRecord {
  id: string;
  name: string;
  templateId: string;
  primaryColor: string;
  accentColor: string;
  paperSize: PaperSize;
  companyName: string;
  tagline?: string;
  registrationNo?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  logoUrl?: string;
  showWatermark?: boolean;
  showPageBorder?: boolean;
  includeSampleContent?: boolean;
  signerName?: string;
  signerTitle?: string;
  signatureUrl?: string;
  userEmail: string;
  createdAt: number;
  updatedAt?: number;
}

export interface UploadedDocInfo {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  extension: string;
  pageCount?: number;
  wordCount?: number;
  extractedText?: string;
  extractedTitle?: string;
  pdfArrayBuffer?: ArrayBuffer;
  renderedPagePreviews?: string[];
  convertedFromSource?: boolean;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
  publicPermissionGranted: boolean;
  /** Set when the file uploaded but "Anyone with the link" could not be applied */
  permissionWarning?: string;
  uploadMode?: DriveUploadMode;
}

export interface BatchItem {
  id: string;
  docInfo: UploadedDocInfo;
  coverData: CoverData;
  driveResult?: DriveUploadResult;
  qrDataUrl?: string;
  status: 'idle' | 'parsing' | 'uploading' | 'synced' | 'error';
  errorMessage?: string;
  progress?: number;
  stageLabel?: string;
}

export type CoverSuggestionEngine = 'ai' | 'ai-sites';

export interface CoverPictureSuggestion {
  id: string;
  label: string;
  visualStyle: string;
  prompt: string;
  searchQuery: string;
  palette: {
    primary: string;
    accent: string;
    background: string;
  };
  status: 'queued' | 'ready' | 'error';
  jobId?: string;
  imageDataUrl?: string;
  sourceType?: 'sd35' | 'flux' | 'ai-horde' | 'civitai-ai' | 'wikimedia-ai';
  queuePosition?: number;
  waitTimeSec?: number;
  errorMessage?: string;
}

export interface SavedDocRecord {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  driveFileId: string;
  driveLink: string;
  coverData: CoverData;
  createdAt: number;
  userEmail: string;
  sentEmails?: Array<{
    recipient: string;
    sentAt: number;
    subject: string;
  }>;
}

export type PhotoBatchAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'custom';

export interface PhotoBatchMark {
  id: string;
  type: 'text' | 'logo';
  text: string;
  font: string;
  weight: number;
  color: string;
  size: number;
  opacity: number;
  rotation: number;
  anchor: PhotoBatchAnchor;
  margin: number;
  tile: boolean;
  gap: number;
  shadow: boolean;
  visible: boolean;
  x: number;
  y: number;
  imgData: string | null;
  imgName: string;
}

export interface PhotoBatchFrameConfig {
  enabled: boolean;
  thickness: number;
  radius: number;
  color: string;
  innerStroke: boolean;
}

export interface PhotoBatchAdjustConfig {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  vibrance: number;
  clarity: number;
  temperature: number;
  tint: number;
  fade: number;
  grayscale: number;
  sepia: number;
  sharpen: number;
}

export interface PhotoBatchVignetteConfig {
  on: boolean;
  strength: number;
  size: number;
  feather: number;
  roundness: number;
  color: string;
}

export interface PhotoBatchSetup {
  filter: {
    preset: string;
    intensity: number;
  };
  adjust: PhotoBatchAdjustConfig;
  vignette: PhotoBatchVignetteConfig;
  grain: { amount: number };
  frame: PhotoBatchFrameConfig;
  marks: PhotoBatchMark[];
  out: {
    format: 'jpeg' | 'png' | 'webp';
    quality: number;
    maxSide: number;
    aspectCrop: 'original' | '1:1' | '4:5' | '16:9';
    prefix: string;
    suffix: string;
    zipName: string;
    perZip: number;
  };
}

export type PhotoBatchLookStyle = 'Professional' | 'Minimalist' | 'Creative';

export type PhotoBatchPresetCategory =
  | 'Professional'
  | 'Minimalist'
  | 'Creative'
  | 'Events'
  | 'Portraits'
  | 'Product'
  | 'Social'
  | 'Print'
  | 'Custom';

export interface PhotoBatchPresetRecord {
  id: string;
  name: string;
  category: PhotoBatchPresetCategory;
  includeMarks?: boolean;
  setup: PhotoBatchSetup;
  userEmail: string;
  createdAt: number;
  updatedAt?: number;
}

