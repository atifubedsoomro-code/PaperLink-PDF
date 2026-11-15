import { PDFDocument as CantooPDFDocument } from '@cantoo/pdf-lib';

export type PdfCipherAlgorithm = 'AES-256' | 'AES-128';

export interface PdfProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  algorithm?: PdfCipherAlgorithm;
  permissions: {
    printing: 'highResolution' | 'lowResolution' | false;
    modifying: boolean;
    copying: boolean;
    annotating: boolean;
    fillingForms: boolean;
    contentAccessibility: boolean;
    documentAssembly: boolean;
  };
}

export interface PdfProtectResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  algorithm: PdfCipherAlgorithm;
}

export interface PdfUnlockResult {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
}

function cleanBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'document';
}

/**
 * Inspect whether a PDF is already password-protected / encrypted.
 */
export async function inspectPdfSecurity(file: File): Promise<{
  isEncrypted: boolean;
  requiresOpenPassword: boolean;
  pageCount: number | null;
}> {
  const rawBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;
  try {
    const doc = await CantooPDFDocument.load(rawBuffer, { ignoreEncryption: false });
    return {
      isEncrypted: doc.isEncrypted,
      requiresOpenPassword: false,
      pageCount: doc.getPageCount(),
    };
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('encrypt') || msg.includes('password') || msg.includes('decrypt')) {
      return {
        isEncrypted: true,
        requiresOpenPassword: true,
        pageCount: null,
      };
    }
    throw new Error('Could not inspect PDF file. Ensure it is a valid PDF.');
  }
}

/**
 * Encrypts a PDF with AES-256 or AES-128 password protection and granular permission locks.
 */
export async function protectPdfWithPassword(
  file: File,
  options: PdfProtectOptions,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfProtectResult> {
  if (!options.userPassword && !options.ownerPassword) {
    throw new Error('Enter a password to protect this PDF.');
  }

  onProgress?.(15, 'Reading source PDF...');
  const rawBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;

  let pdfDoc: CantooPDFDocument;
  try {
    pdfDoc = await CantooPDFDocument.load(rawBuffer, { ignoreEncryption: false });
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('encrypt') || msg.includes('password')) {
      throw new Error(
        'This PDF is already password-protected. Switch to "Unlock PDF" first with its current password before re-encrypting.'
      );
    }
    throw new Error('Could not parse this PDF file. Please verify it is not corrupted.');
  }

  onProgress?.(45, 'Configuring encryption & permission rules...');
  const algorithm: PdfCipherAlgorithm = options.algorithm || 'AES-256';
  const effectiveOwnerPassword =
    (options.ownerPassword || '').trim() ||
    `${options.userPassword}_owner_${Math.random().toString(36).slice(2, 8)}`;

  pdfDoc.setProducer('PaperLink');
  pdfDoc.setCreator('PaperLink');

  pdfDoc.encrypt({
    userPassword: options.userPassword,
    ownerPassword: effectiveOwnerPassword,
    algorithm,
    permissions: {
      printing: options.permissions.printing,
      modifying: options.permissions.modifying,
      copying: options.permissions.copying,
      annotating: options.permissions.annotating,
      fillingForms: options.permissions.fillingForms,
      contentAccessibility: options.permissions.contentAccessibility,
      documentAssembly: options.permissions.documentAssembly,
    },
  });

  onProgress?.(85, `Encrypting document streams (${algorithm})...`);
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });

  onProgress?.(100, 'Encrypted PDF ready');
  return {
    blob,
    bytes: safeBytes,
    fileName: `${cleanBaseName(file.name)}_protected.pdf`,
    pageCount: pdfDoc.getPageCount(),
    algorithm,
  };
}

/**
 * Unlocks / removes password protection from an encrypted PDF given its valid password.
 */
export async function unlockPdfWithPassword(
  file: File,
  password: string,
  onProgress?: (percent: number, status: string) => void
): Promise<PdfUnlockResult> {
  if (!password) {
    throw new Error('Enter the current PDF password to unlock it.');
  }

  onProgress?.(20, 'Decrypting PDF with provided password...');
  const rawBuffer = new Uint8Array(await file.arrayBuffer()).slice().buffer;

  let pdfDoc: CantooPDFDocument;
  try {
    pdfDoc = await CantooPDFDocument.load(rawBuffer, { password });
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('password') || msg.includes('decrypt') || msg.includes('invalid')) {
      throw new Error('Incorrect password. Please check spelling and case sensitivity.');
    }
    throw new Error(err?.message || 'Could not decrypt this PDF.');
  }

  onProgress?.(65, 'Rebuilding clean unlocked PDF...');
  const unlockedDoc = await CantooPDFDocument.create();
  unlockedDoc.setProducer('PaperLink');
  unlockedDoc.setCreator('PaperLink');

  const indices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
  const copiedPages = await unlockedDoc.copyPages(pdfDoc, indices);
  copiedPages.forEach((p) => unlockedDoc.addPage(p));

  const bytes = await unlockedDoc.save({ useObjectStreams: true });
  const safeBytes = new Uint8Array(bytes).slice();
  const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });

  onProgress?.(100, 'PDF unlocked cleanly');
  return {
    blob,
    bytes: safeBytes,
    fileName: `${cleanBaseName(file.name)}_unlocked.pdf`,
    pageCount: unlockedDoc.getPageCount(),
  };
}
