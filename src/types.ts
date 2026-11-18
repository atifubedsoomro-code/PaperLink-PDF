export type PaperSize = 'a4' | 'letter';

export type FontStyle = 'inter' | 'playfair' | 'space' | 'mono' | 'merriweather' | 'montserrat' | 'oswald';

export type QRPosition = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'sidebar' | 'hero';

export type DriveUploadMode = 'source' | 'merged';

export interface CoverTheme {
  id: string;
  name: string;
  description: string;
  category: 'Plain' | 'Corporate' | 'Minimalist' | 'Creative' | 'Academic' | 'Modern' | 'Luxury' | 'Editorial';
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
    | 'plain-centered';
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
  /** Optional dynamic QR verification metadata printed on cover footer */
  version?: string;
  showSyncTimestamp?: boolean;
  expiryNote?: string;
  /** Optional stamping across appended original document pages */
  stampPageNumbers?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
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
