export type ToolCategory =
  | 'Cover Studio'
  | 'PDF & Word Tools'
  | 'Designer Image Studio'
  | 'PaperLink AI Chatbot'
  | 'Batch & Library'
  | 'General Experience';

export type FeedbackType =
  | 'Feature Request'
  | 'Bug Report'
  | 'Compliment / Praise'
  | 'UI / UX Suggestion'
  | 'Performance';

export type FeedbackPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type FeedbackStatus = 'New' | 'In Review' | 'Resolved' | 'Saved Locally';

export interface FeedbackEntry {
  feedbackId: string;
  date: string;
  userName: string;
  toolCategory: ToolCategory;
  specificTool: string;
  feedbackType: FeedbackType;
  rating: number;
  details: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  resolutionNotes: string;
  syncedToGoogleSheet?: boolean;
  syncedToFirestore?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface FeedbackTrackerStats {
  totalSubmissions: number;
  averageRating: number;
  openIssues: number;
  resolutionRate: number;
  source: 'google-sheet' | 'local';
  spreadsheetTitle?: string;
  activeTabName?: string;
  recentRows?: FeedbackEntry[];
}

export const TOOL_OPTIONS_BY_CATEGORY: Record<ToolCategory, string[]> = {
  'Cover Studio': [
    'Cover Page Builder',
    'Theme Selector (22 Templates)',
    'Google Drive QR Sync',
    'Merged PDF Export',
    'Email Share Modal',
  ],
  'PDF & Word Tools': [
    'PDF to Word (.docx)',
    'Word to PDF (.pdf)',
    'PDF Merge',
    'PDF Compress',
    'Split & Extract',
    'Images to PDF',
    'Rotate & Organize',
    'Sign & Stamp PDF',
    'PDF Editor',
    'Protect / Unlock PDF',
    'PDF to Image',
    'PPT to PDF (.pptx)',
    'PPT to Image',
    'Excel to PDF (.xlsx/.csv)',
    'Excel to Image',
    'PDF to Excel (.xlsx/.csv)',
    'PDF to PPT (.pptx)',
  ],
  'Designer Image Studio': [
    'Background Remover',
    'Bulk BG Remover (ZIP)',
    'PDF to Image',
    'Image Resize',
    'Change Image Format',
    'Crop & Rotate',
    'Image Compress',
    'Filters & Hex Palette',
  ],
  'PaperLink AI Chatbot': [
    'File Action Automation',
    'Document Preview in Chat',
    'Minimize & Compact Bar',
    'Markdown & Formatting',
  ],
  'Batch & Library': [
    'Batch Processing Queue',
    'Document Library',
    'Saved Brand Kits',
  ],
  'General Experience': [
    'Overall Website & Design',
    'Document Preview Modal',
    'Settings & Preferences',
    'Dark / Light Theme',
  ],
};

export const SHEET_COLUMN_HEADERS = [
  'Feedback ID',
  'Date',
  'User Name',
  'Tool Category',
  'Specific Tool',
  'Feedback Type',
  'Rating',
  'Details & Comments',
  'Priority',
  'Status',
  'Resolution Notes',
] as const;

const LOCAL_FEEDBACK_KEY = 'paperlink_feedback_entries_v1';
export const FEEDBACK_SHEET_URL_KEY = 'paperlink_feedback_sheet_url';
export const FEEDBACK_WEBHOOK_URL_KEY = 'paperlink_feedback_webhook_url';

export function readStoredSheetUrl(): string {
  try {
    const saved = localStorage.getItem(FEEDBACK_SHEET_URL_KEY);
    if (saved) return saved;
  } catch {
    // ignore storage restrictions
  }
  return (import.meta as any).env?.VITE_FEEDBACK_SHEET_ID || '';
}

export function readStoredWebhookUrl(): string {
  try {
    const saved = localStorage.getItem(FEEDBACK_WEBHOOK_URL_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return (import.meta as any).env?.VITE_FEEDBACK_WEBHOOK_URL || '';
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const paramMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/i);
  if (paramMatch?.[1]) return paramMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function generateFeedbackId(): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FB-${yymm}-${rand}`;
}

export function getLocalFeedbackEntries(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalFeedbackEntry(entry: FeedbackEntry): FeedbackEntry[] {
  const existing = getLocalFeedbackEntries().filter((e) => e.feedbackId !== entry.feedbackId);
  const updated = [entry, ...existing].slice(0, 100);
  try {
    localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
  return updated;
}

export function computeLocalStats(entries: FeedbackEntry[]): FeedbackTrackerStats {
  const totalSubmissions = entries.length;
  const averageRating =
    totalSubmissions > 0
      ? Number((entries.reduce((acc, e) => acc + (Number(e.rating) || 0), 0) / totalSubmissions).toFixed(1))
      : 0;
  const resolvedCount = entries.filter((e) => {
    const st = (e.status || '').toLowerCase();
    return st.includes('resolved') || st.includes('closed') || Boolean((e.resolutionNotes || '').trim());
  }).length;
  const openIssues = Math.max(0, totalSubmissions - resolvedCount);
  const resolutionRate = totalSubmissions > 0 ? Math.round((resolvedCount / totalSubmissions) * 100) : 0;

  return {
    totalSubmissions,
    averageRating,
    openIssues,
    resolutionRate,
    source: entries.some((e) => e.syncedToGoogleSheet) ? 'google-sheet' : 'local',
    recentRows: entries.slice(0, 12),
  };
}

export function mergeFeedbackEntries(
  remoteEntries: FeedbackEntry[],
  localEntries: FeedbackEntry[]
): FeedbackEntry[] {
  const map = new Map<string, FeedbackEntry>();
  for (const loc of localEntries) {
    map.set(loc.feedbackId, loc);
  }
  for (const rem of remoteEntries) {
    const existing = map.get(rem.feedbackId);
    const remStatus = rem.status === 'Saved Locally' ? 'New' : rem.status;
    const remNewer = (rem.updatedAt || 0) >= (existing?.updatedAt || 0);
    map.set(rem.feedbackId, {
      ...existing,
      ...rem,
      status: (remStatus || existing?.status || 'New') as FeedbackStatus,
      resolutionNotes: remNewer
        ? rem.resolutionNotes ?? existing?.resolutionNotes ?? ''
        : existing?.resolutionNotes || rem.resolutionNotes || '',
      syncedToGoogleSheet: Boolean(rem.syncedToGoogleSheet || existing?.syncedToGoogleSheet),
      syncedToFirestore: Boolean(rem.syncedToFirestore || existing?.syncedToFirestore),
      createdAt: existing?.createdAt || rem.createdAt || Date.now(),
    });
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function fetchLiveFeedbackEntries(options?: {
  sheetUrl?: string;
  webhookUrl?: string;
}): Promise<{
  entries: FeedbackEntry[];
  source: 'google-sheet' | 'server-store' | 'local';
  webhookConfigured: boolean;
  sheetConfigured: boolean;
}> {
  const local = getLocalFeedbackEntries();
  try {
    const params = new URLSearchParams();
    if (options?.sheetUrl?.trim()) params.set('sheetUrl', options.sheetUrl.trim());
    if (options?.webhookUrl?.trim()) params.set('webhookUrl', options.webhookUrl.trim());
    const qs = params.toString();
    const res = await fetch(`/api/feedback${qs ? `?${qs}` : ''}`);
    if (!res.ok) {
      return { entries: local, source: 'local', webhookConfigured: false, sheetConfigured: false };
    }
    const data = await res.json();
    const remote: FeedbackEntry[] = Array.isArray(data?.entries) ? data.entries : [];
    const merged = mergeFeedbackEntries(remote, local);
    try {
      localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify(merged.slice(0, 100)));
    } catch {
      // ignore storage restrictions
    }
    return {
      entries: merged,
      source: data?.source || 'server-store',
      webhookConfigured: Boolean(data?.webhookConfigured),
      sheetConfigured: Boolean(data?.sheetConfigured),
    };
  } catch {
    return { entries: local, source: 'local', webhookConfigured: false, sheetConfigured: false };
  }
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    data.feedbackId, data.date, data.userName || 'Anonymous',
    data.toolCategory, data.specificTool, data.feedbackType,
    data.rating, data.details, data.priority, data.status || 'New', data.resolutionNotes || ''
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows })).setMimeType(ContentService.MimeType.JSON);
}`;

export interface SheetStructureInfo {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTabName: string;
  startColumn: 'A' | 'B';
  headerRowNumber: number;
  stats: FeedbackTrackerStats;
}

function parseSheetsApiError(status: number, bodyText: string): Error {
  let msg = bodyText.slice(0, 240);
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) msg = parsed.error.message;
  } catch {
    // ignore
  }
  if (status === 401) {
    return new Error('Google session expired. Please reconnect your Google account to sync with Google Sheets.');
  }
  if (status === 403) {
    if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('scope')) {
      return new Error(
        'Google Sheets permission was not granted yet. Click "Reconnect With Sheets Permission" and approve spreadsheet access.'
      );
    }
    return new Error(
      `Google Sheets access denied (${msg}). Make sure your Google Sheet is shared as Editor or owned by your signed-in account.`
    );
  }
  if (status === 404) {
    return new Error('Spreadsheet not found. Double-check the Google Spreadsheet link or ID.');
  }
  return new Error(`Google Sheets API error (${status}): ${msg}`);
}

/**
 * Fetches spreadsheet metadata (discovering actual tab names — never hardcoding "Sheet1")
 * and inspects header placement (Col B vs Col A, matching Feedback_Form_a2d58e40) + live stats.
 */
export async function inspectFeedbackSpreadsheet(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetStructureInfo> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    throw parseSheetsApiError(metaRes.status, await metaRes.text());
  }

  const meta = await metaRes.json();
  const spreadsheetTitle: string = meta?.properties?.title || 'User Feedback Tracker';
  const sheetTabName: string = meta?.sheets?.[0]?.properties?.title || '';
  if (!sheetTabName) {
    throw new Error('Could not find any worksheet tab inside this Google Spreadsheet.');
  }

  const escapedTab = `'${sheetTabName.replace(/'/g, "''")}'`;
  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escapedTab}!A1:L250`)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!valuesRes.ok) {
    throw parseSheetsApiError(valuesRes.status, await valuesRes.text());
  }

  const valuesData = await valuesRes.json();
  const rows: any[][] = Array.isArray(valuesData?.values) ? valuesData.values : [];

  // Auto-detect header row & start column ('B' in exported template vs 'A' if shifted)
  let startColumn: 'A' | 'B' = 'B';
  let headerRowNumber = 7;

  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || [];
    const colA = String(row[0] || '').trim().toLowerCase();
    const colB = String(row[1] || '').trim().toLowerCase();
    if (colB === 'feedback id' || colB === 'id') {
      startColumn = 'B';
      headerRowNumber = r + 1;
      break;
    }
    if (colA === 'feedback id' || colA === 'id') {
      startColumn = 'A';
      headerRowNumber = r + 1;
      break;
    }
  }

  const colOffset = startColumn === 'B' ? 1 : 0;
  const parsedEntries: FeedbackEntry[] = [];

  for (let r = headerRowNumber; r < rows.length; r++) {
    const row = rows[r] || [];
    const idVal = String(row[colOffset] || '').trim();
    const userVal = String(row[colOffset + 2] || '').trim();
    const detailsVal = String(row[colOffset + 7] || '').trim();
    if (!idVal && !userVal && !detailsVal) continue;

    const rawDateStr = String(row[colOffset + 1] || '').trim();
    const parsedDateMs = rawDateStr ? Date.parse(rawDateStr) : NaN;
    const stableCreatedAt = Number.isFinite(parsedDateMs)
      ? parsedDateMs + r
      : Date.now() - (rows.length - r) * 1000;

    parsedEntries.push({
      feedbackId: idVal || `ROW-${r + 1}`,
      date: rawDateStr || new Date(stableCreatedAt).toISOString().slice(0, 10),
      userName: userVal || 'Anonymous',
      toolCategory: (String(row[colOffset + 3] || 'General Experience') as any),
      specificTool: String(row[colOffset + 4] || ''),
      feedbackType: (String(row[colOffset + 5] || 'Feature Request') as any),
      rating: Number(row[colOffset + 6]) || 5,
      details: detailsVal,
      priority: (String(row[colOffset + 8] || 'Medium') as any),
      status: (String(row[colOffset + 9] || 'New') as any),
      resolutionNotes: String(row[colOffset + 10] || ''),
      syncedToGoogleSheet: true,
      createdAt: stableCreatedAt,
    });
  }

  const totalSubmissions = parsedEntries.length;
  const averageRating =
    totalSubmissions > 0
      ? Number(
          (parsedEntries.reduce((sum, e) => sum + (Number(e.rating) || 0), 0) / totalSubmissions).toFixed(1)
        )
      : 0;
  const resolvedCount = parsedEntries.filter((e) => {
    const st = e.status.toLowerCase();
    return st.includes('resolved') || st.includes('closed') || st.includes('done');
  }).length;
  const openIssues = Math.max(0, totalSubmissions - resolvedCount);
  const resolutionRate = totalSubmissions > 0 ? Math.round((resolvedCount / totalSubmissions) * 100) : 0;

  return {
    spreadsheetId,
    spreadsheetTitle,
    sheetTabName,
    startColumn,
    headerRowNumber,
    stats: {
      totalSubmissions,
      averageRating,
      openIssues,
      resolutionRate,
      source: 'google-sheet',
      spreadsheetTitle,
      activeTabName: sheetTabName,
      recentRows: parsedEntries.slice(-60).reverse(),
    },
  };
}

/**
 * Appends a single FeedbackEntry row to the configured Google Spreadsheet,
 * aligned with columns B:L (or A:K) of the User Feedback Tracker template.
 */
export async function appendFeedbackToGoogleSheet(params: {
  spreadsheetId: string;
  accessToken: string;
  entry: FeedbackEntry;
}): Promise<SheetStructureInfo> {
  const structure = await inspectFeedbackSpreadsheet(params.spreadsheetId, params.accessToken);
  const escapedTab = `'${structure.sheetTabName.replace(/'/g, "''")}'`;
  const endCol = structure.startColumn === 'B' ? 'L' : 'K';
  const startRow = structure.headerRowNumber + 1;
  const appendRange = `${escapedTab}!${structure.startColumn}${startRow}:${endCol}`;

  const rowValues = [
    params.entry.feedbackId,
    params.entry.date,
    params.entry.userName || 'Anonymous',
    params.entry.toolCategory,
    params.entry.specificTool,
    params.entry.feedbackType,
    params.entry.rating,
    params.entry.details,
    params.entry.priority,
    'New',
    params.entry.resolutionNotes || '',
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      params.spreadsheetId
    )}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    }
  );

  if (!res.ok) {
    throw parseSheetsApiError(res.status, await res.text());
  }

  return inspectFeedbackSpreadsheet(params.spreadsheetId, params.accessToken);
}

/**
 * Optional zero-login submission via Google Apps Script Web App URL (if configured in Settings).
 */
export async function postFeedbackToWebhook(webhookUrl: string, entry: FeedbackEntry): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      feedbackId: entry.feedbackId,
      date: entry.date,
      userName: entry.userName || 'Anonymous',
      toolCategory: entry.toolCategory,
      specificTool: entry.specificTool,
      feedbackType: entry.feedbackType,
      rating: entry.rating,
      details: entry.details,
      priority: entry.priority,
      status: 'New',
      resolutionNotes: entry.resolutionNotes || '',
    }),
  });
  // With mode: 'no-cors' opaque response type has status 0 and ok false; treat network fulfillment as dispatched.
  if (res.type !== 'opaque' && !res.ok) {
    throw new Error(`Webhook returned HTTP ${res.status}`);
  }
}

export function exportFeedbackCsv(entries: FeedbackEntry[], fileName = 'PaperLink_User_Feedback_Tracker.csv'): void {
  const header = ['', ...SHEET_COLUMN_HEADERS].join(',');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = entries.map((e) =>
    [
      '',
      e.feedbackId,
      e.date,
      e.userName || 'Anonymous',
      e.toolCategory,
      e.specificTool,
      e.feedbackType,
      e.rating,
      e.details,
      e.priority,
      e.status,
      e.resolutionNotes || '',
    ]
      .map(esc)
      .join(',')
  );

  const csv = [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
