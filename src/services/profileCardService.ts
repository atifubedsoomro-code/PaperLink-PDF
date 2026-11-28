import { UserProfileData } from '../types';

export interface ProfileCardOptions {
  profile: UserProfileData;
  photoUrl?: string | null;
  googleDisplayName?: string | null;
  googleEmail?: string | null;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function loadImageCorsSafe(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;

  // Data/blob URLs can be drawn directly without CORS tainting
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = trimmed;
    });
  }

  // Remote image (e.g. Google profile photo): try CORS fetch -> object URL first
  try {
    const resp = await fetch(trimmed, { mode: 'cors', credentials: 'omit' });
    if (resp.ok) {
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = objUrl;
      });
      if (loaded) return loaded;
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    // Fallback to crossOrigin anonymous below
  }

  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = trimmed;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        // Append remaining truncated cleanly if reaching last allowed line
        const rest = [current, ...words.slice(i + 1)].join(' ');
        let clipped = rest;
        while (clipped.length > 3 && ctx.measureText(`${clipped}…`).width > maxWidth) {
          clipped = clipped.slice(0, -1);
        }
        lines.push(clipped !== rest ? `${clipped}…` : rest);
        return lines;
      }
    }
  }
  lines.push(current);
  return lines;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'PL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function generateProfileIdCardBlob(options: ProfileCardOptions): Promise<{
  blob: Blob;
  dataUrl: string;
  fileName: string;
}> {
  const { profile, photoUrl, googleDisplayName, googleEmail } = options;

  // CR80 digital landscape ID card resolution (1050 × 660 px)
  const W = 1050;
  const H = 660;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Outer card background with rounded clipping
  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, W, H, 28);
  ctx.clip();

  // Crisp light architectural stock background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.55, '#f8fafc');
  bgGrad.addColorStop(1, '#f1f5f9');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle decorative geometric corner accent
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
  ctx.beginPath();
  ctx.arc(W - 90, H - 60, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(234, 179, 8, 0.06)';
  ctx.beginPath();
  ctx.arc(110, H - 40, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Top Header Band
  const headerH = 122;
  const headerGrad = ctx.createLinearGradient(0, 0, W, headerH);
  headerGrad.addColorStop(0, '#09090b');
  headerGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, W, headerH);

  // Thin emerald & gold accent bar below header
  const stripeGrad = ctx.createLinearGradient(0, 0, W, 0);
  stripeGrad.addColorStop(0, '#10b981');
  stripeGrad.addColorStop(0.5, '#facc15');
  stripeGrad.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = stripeGrad;
  ctx.fillRect(0, headerH, W, 6);

  const orgTitle =
    profile.organization?.trim() || 'OFFICIAL MEMBER & BIODATA CARD';
  const holderName =
    profile.fullName?.trim() || googleDisplayName?.trim() || 'PaperLink User';
  const holderRole =
    profile.designation?.trim() || 'Verified Profile';
  const holderEmail =
    profile.email?.trim() || profile.userEmail?.trim() || googleEmail?.trim() || '';

  // Header left organization title + subtitle
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText('IDENTITY & PROFILE CREDENTIAL', 44, 44);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px "Inter", system-ui, -apple-system, sans-serif';
  const orgLines = wrapTextLines(ctx, orgTitle.toUpperCase(), 640, 1);
  ctx.fillText(orgLines[0] || 'OFFICIAL MEMBER CARD', 44, 84);

  // Header right green verified badge
  drawRoundedRectPath(ctx, W - 230, 38, 186, 42, 21);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(W - 204, 59, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ecfdf5';
  ctx.font = 'bold 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText('VERIFIED ACCOUNT', W - 188, 64);

  // Left Column: Portrait + Signature
  const photoX = 44;
  const photoY = 160;
  const photoW = 228;
  const photoH = 264;

  // Portrait shadow card
  ctx.save();
  drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#10b981';
  ctx.stroke();

  ctx.clip();
  const activePhotoSrc = profile.avatarUrl || photoUrl || '';
  const loadedPhoto = await loadImageCorsSafe(activePhotoSrc);
  if (loadedPhoto && loadedPhoto.naturalWidth > 0 && loadedPhoto.naturalHeight > 0) {
    // Cover-crop portrait cleanly centered
    const scale = Math.max(
      photoW / loadedPhoto.naturalWidth,
      photoH / loadedPhoto.naturalHeight
    );
    const drawW = loadedPhoto.naturalWidth * scale;
    const drawH = loadedPhoto.naturalHeight * scale;
    const dx = photoX + (photoW - drawW) / 2;
    const dy = photoY + (photoH - drawH) / 2;
    ctx.drawImage(loadedPhoto, dx, dy, drawW, drawH);
  } else {
    const avatarBg = ctx.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
    avatarBg.addColorStop(0, '#0f172a');
    avatarBg.addColorStop(1, '#1e293b');
    ctx.fillStyle = avatarBg;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 76px "Inter", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(holderName), photoX + photoW / 2, photoY + photoH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Signature box directly beneath Portrait
  const sigBoxY = photoY + photoH + 18;
  const sigBoxH = 114;
  drawRoundedRectPath(ctx, photoX, sigBoxY, photoW, sigBoxH, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const loadedSig = await loadImageCorsSafe(profile.signatureUrl);
  if (loadedSig && loadedSig.naturalWidth > 0 && loadedSig.naturalHeight > 0) {
    const pad = 12;
    const maxSW = photoW - pad * 2;
    const maxSH = sigBoxH - 36;
    const sc = Math.min(maxSW / loadedSig.naturalWidth, maxSH / loadedSig.naturalHeight);
    const sw = loadedSig.naturalWidth * sc;
    const sh = loadedSig.naturalHeight * sc;
    ctx.drawImage(
      loadedSig,
      photoX + (photoW - sw) / 2,
      sigBoxY + 8 + (maxSH - sh) / 2,
      sw,
      sh
    );
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 13px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Authorized Signature', photoX + photoW / 2, sigBoxY + 50);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(photoX + 18, sigBoxY + sigBoxH - 28);
  ctx.lineTo(photoX + photoW - 18, sigBoxY + sigBoxH - 28);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 10px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIGNATURE', photoX + photoW / 2, sigBoxY + sigBoxH - 11);
  ctx.textAlign = 'left';

  // Right Column: Holder Headline + Metadata Grid
  const rightX = photoX + photoW + 38;
  const rightW = W - rightX - 44;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px "Inter", system-ui, -apple-system, sans-serif';
  const nameLines = wrapTextLines(ctx, holderName, rightW, 1);
  ctx.fillText(nameLines[0] || holderName, rightX, 194);

  // Designation badge row
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 16px "Inter", system-ui, -apple-system, sans-serif';
  const roleLines = wrapTextLines(ctx, holderRole, rightW, 1);
  ctx.fillText(roleLines[0] || 'Verified Profile', rightX, 224);

  // Divider rule
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rightX, 244);
  ctx.lineTo(rightX + rightW, 244);
  ctx.stroke();

  const detailFields: Array<{ label: string; value: string; fullWidth?: boolean }> = [
    { label: "FATHER'S NAME", value: profile.fatherName?.trim() || '—' },
    { label: 'CONTACT NUMBER', value: profile.contactNumber?.trim() || '—' },
    { label: 'EMAIL ADDRESS', value: holderEmail || '—' },
    {
      label: 'NATIONAL ID / CNIC',
      value: profile.nationalIdNumber?.trim() || 'Not specified',
    },
    ...(profile.passportNumber?.trim()
      ? [{ label: 'PASSPORT NO.', value: profile.passportNumber.trim() }]
      : []),
    ...(profile.dateOfBirth?.trim()
      ? [{ label: 'DATE OF BIRTH', value: profile.dateOfBirth.trim() }]
      : []),
    ...(profile.address?.trim()
      ? [{ label: 'ADDRESS', value: profile.address.trim(), fullWidth: true }]
      : []),
  ];

  // Layout 2-column grid cleanly
  let curY = 278;
  const colGap = 24;
  const halfW = (rightW - colGap) / 2;
  let colIdx = 0;

  for (const field of detailFields) {
    if (field.fullWidth) {
      if (colIdx !== 0) {
        curY += 74;
        colIdx = 0;
      }
      if (curY > 545) break;
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px "Inter", system-ui, -apple-system, sans-serif';
      ctx.fillText(field.label, rightX, curY);

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 17px "Inter", system-ui, -apple-system, sans-serif';
      const valLines = wrapTextLines(ctx, field.value, rightW, 2);
      valLines.forEach((line, idx) => {
        ctx.fillText(line, rightX, curY + 23 + idx * 21);
      });
      curY += valLines.length > 1 ? 82 : 68;
      continue;
    }

    if (curY > 545) break;
    const fx = rightX + colIdx * (halfW + colGap);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px "Inter", system-ui, -apple-system, sans-serif';
    ctx.fillText(field.label, fx, curY);

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 18px "Inter", system-ui, -apple-system, sans-serif';
    const valLines = wrapTextLines(ctx, field.value, halfW - 6, 1);
    ctx.fillText(valLines[0] || field.value, fx, curY + 24);

    if (colIdx === 1) {
      colIdx = 0;
      curY += 74;
    } else {
      colIdx = 1;
    }
  }

  // Bottom Footer Strip + Mini PaperLink Watermark at the bottom
  const footerY = H - 52;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
  ctx.fillRect(0, footerY, W, 52);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(W, footerY);
  ctx.stroke();

  // Left footer issue date
  const issuedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  ctx.fillStyle = '#64748b';
  ctx.font = '600 12px "Inter", system-ui, sans-serif';
  ctx.fillText(`ISSUED: ${issuedDate.toUpperCase()}`, 44, footerY + 31);

  // Bottom-right Mini PaperLink Watermark Badge
  ctx.save();
  ctx.globalAlpha = 0.72;
  const wmRight = W - 40;
  const wmCenterY = footerY + 26;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.font = '800 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText('PaperLink', wmRight, wmCenterY + 5);

  const wordWidth = ctx.measureText('PaperLink').width;
  const miniIconSize = 18;
  const iconX = wmRight - wordWidth - miniIconSize - 8;
  const iconY = wmCenterY - miniIconSize / 2;

  drawRoundedRectPath(ctx, iconX, iconY, miniIconSize, miniIconSize, 5);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 11px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('P', iconX + miniIconSize / 2, wmCenterY + 4);
  ctx.restore();

  ctx.restore(); // end outer rounded clip

  // Subtle card perimeter border
  drawRoundedRectPath(ctx, 1, 1, W - 2, H - 2, 28);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode ID card PNG.'))),
      'image/png'
    );
  });

  const dataUrl = canvas.toDataURL('image/png');
  const safeName =
    holderName
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'User';

  return {
    blob,
    dataUrl,
    fileName: `${safeName}_PaperLink_ID_Card.png`,
  };
}
