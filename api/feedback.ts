import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface FeedbackSubmissionPayload {
  feedbackId: string;
  date: string;
  userName?: string;
  toolCategory: string;
  specificTool: string;
  feedbackType: string;
  rating: number;
  details: string;
  priority: string;
  status?: string;
  resolutionNotes?: string;
}

export interface ServerFeedbackEntry extends FeedbackSubmissionPayload {
  userName: string;
  status: string;
  resolutionNotes: string;
  syncedToGoogleSheet?: boolean;
  source?: 'google-sheet' | 'server-store';
  createdAt: number;
}

const STORE_FILE = path.join(os.tmpdir(), 'paperlink-feedback-entries-v1.json');

function readServerFeedbackStore(): ServerFeedbackEntry[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeServerFeedbackStore(entries: ServerFeedbackEntry[]): void {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(entries.slice(0, 200), null, 2), 'utf8');
  } catch {
    // Non-fatal in read-only runtimes
  }
}

function upsertServerFeedbackStore(entry: ServerFeedbackEntry): ServerFeedbackEntry[] {
  const existing = readServerFeedbackStore().filter((e) => e.feedbackId !== entry.feedbackId);
  const next = [entry, ...existing].slice(0, 200);
  writeServerFeedbackStore(next);
  return next;
}

function resolveWebhookUrl(override?: string): string {
  const candidate = (
    override ||
    process.env.FEEDBACK_SHEET_WEBHOOK_URL ||
    process.env.FEEDBACK_WEBHOOK_URL ||
    process.env.VITE_FEEDBACK_WEBHOOK_URL ||
    ''
  ).trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec/i.test(candidate)
    ? candidate
    : '';
}

function extractSheetIdSafe(override?: string): string {
  const candidate = (
    override ||
    process.env.FEEDBACK_SHEET_ID ||
    process.env.VITE_FEEDBACK_SHEET_ID ||
    ''
  ).trim();
  if (!candidate) return '';
  const match = candidate.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(candidate) ? candidate : '';
}

function normalizeStatus(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'New';
  const low = s.toLowerCase();
  if (low.includes('resolv') || low.includes('done') || low.includes('fix') || low.includes('close')) {
    return 'Resolved';
  }
  if (low.includes('review') || low.includes('progress') || low.includes('work')) {
    return 'In Review';
  }
  return s === 'Saved Locally' ? 'New' : s;
}

function normalizeSheetRowsToEntries(rows: any[][]): ServerFeedbackEntry[] {
  let startCol = 0;
  let headerRow = -1;

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    const colA = String(row[0] ?? '').trim().toLowerCase();
    const colB = String(row[1] ?? '').trim().toLowerCase();
    if (colB === 'feedback id' || colB === 'id') {
      startCol = 1;
      headerRow = r;
      break;
    }
    if (colA === 'feedback id' || colA === 'id') {
      startCol = 0;
      headerRow = r;
      break;
    }
  }

  const startDataRow = headerRow >= 0 ? headerRow + 1 : 0;
  const entries: ServerFeedbackEntry[] = [];

  for (let r = startDataRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const idVal = String(row[startCol] ?? '').trim();
    const dateVal = String(row[startCol + 1] ?? '').trim();
    const userVal = String(row[startCol + 2] ?? '').trim();
    const catVal = String(row[startCol + 3] ?? '').trim();
    const toolVal = String(row[startCol + 4] ?? '').trim();
    const typeVal = String(row[startCol + 5] ?? '').trim();
    const ratingVal = Number(row[startCol + 6]);
    const detailsVal = String(row[startCol + 7] ?? '').trim();
    const priorityVal = String(row[startCol + 8] ?? '').trim();
    const statusVal = String(row[startCol + 9] ?? '').trim();
    const notesVal = String(row[startCol + 10] ?? '').trim();

    if (!detailsVal && !idVal) continue;
    if (idVal.toLowerCase() === 'feedback id') continue;

    const parsedDateMs = dateVal ? Date.parse(dateVal) : NaN;
    const stableCreatedAt = Number.isFinite(parsedDateMs)
      ? parsedDateMs + r
      : Date.now() - (rows.length - r) * 1000;

    entries.push({
      feedbackId: idVal || `ROW-${r + 1}`,
      date: dateVal || new Date(stableCreatedAt).toISOString().slice(0, 10),
      userName: userVal || 'Anonymous',
      toolCategory: catVal || 'General Experience',
      specificTool: toolVal || '',
      feedbackType: typeVal || 'Feature Request',
      rating: Number.isFinite(ratingVal) && ratingVal > 0 ? Math.min(5, Math.max(1, ratingVal)) : 5,
      details: detailsVal || '(No details provided)',
      priority: priorityVal || 'Medium',
      status: normalizeStatus(statusVal),
      resolutionNotes: notesVal,
      syncedToGoogleSheet: true,
      source: 'google-sheet',
      createdAt: stableCreatedAt,
    });
  }

  return entries.reverse();
}

function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"' && csvText[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      continue;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeWebhookObjectList(rawList: any[]): ServerFeedbackEntry[] {
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => ({
      feedbackId: String(item.feedbackId || item['Feedback ID'] || item.id || `SHEET-${idx + 1}`).trim(),
      date: String(item.date || item['Date'] || new Date().toISOString().slice(0, 10)).trim(),
      userName: String(item.userName || item['User Name'] || 'Anonymous').trim() || 'Anonymous',
      toolCategory: String(item.toolCategory || item['Tool Category'] || 'General Experience').trim(),
      specificTool: String(item.specificTool || item['Specific Tool'] || '').trim(),
      feedbackType: String(item.feedbackType || item['Feedback Type'] || 'Feature Request').trim(),
      rating: Math.min(5, Math.max(1, Math.round(Number(item.rating ?? item['Rating'] ?? 5) || 5))),
      details: String(item.details || item['Details & Comments'] || '').trim(),
      priority: String(item.priority || item['Priority'] || 'Medium').trim(),
      status: normalizeStatus(String(item.status || item['Status'] || 'New')),
      resolutionNotes: String(
        item.resolutionNotes || item['Resolution Notes'] || item.solution || item['Solution'] || ''
      ).trim(),
      syncedToGoogleSheet: true,
      source: 'google-sheet' as const,
      createdAt: Number(item.createdAt) || Date.now() - idx * 1000,
    }))
    .filter((e) => e.details.length > 0 || e.resolutionNotes.length > 0);
}

async function fetchEntriesFromWebhook(webhookUrl: string): Promise<ServerFeedbackEntry[]> {
  try {
    const res = await fetch(webhookUrl, { method: 'GET', redirect: 'follow' });
    if (!res.ok) return [];
    const text = (await res.text()).trim();
    if (!text || /^<!doctype|^<html/i.test(text)) return [];
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
      ? parsed.entries
      : Array.isArray(parsed?.rows)
      ? parsed.rows
      : Array.isArray(parsed?.data)
      ? parsed.data
      : null;
    if (!list) return [];
    if (list.length > 0 && Array.isArray(list[0])) {
      return normalizeSheetRowsToEntries(list);
    }
    return normalizeWebhookObjectList(list);
  } catch {
    return [];
  }
}

async function fetchEntriesFromPublicSheet(sheetId: string): Promise<ServerFeedbackEntry[]> {
  // 1. Try GViz JSON feed first (works when sheet is viewable with link)
  try {
    const gvizRes = await fetch(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json`,
      { method: 'GET', redirect: 'follow' }
    );
    if (gvizRes.ok) {
      const text = await gvizRes.text();
      const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
      if (jsonMatch?.[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        const cols: string[] = (parsed?.table?.cols || []).map((c: any) => String(c?.label || '').trim());
        const tableRows: any[][] = (parsed?.table?.rows || []).map((r: any) =>
          (r?.c || []).map((cell: any) => cell?.f ?? cell?.v ?? '')
        );
        const matrix = cols.some(Boolean) ? [cols, ...tableRows] : tableRows;
        const normalized = normalizeSheetRowsToEntries(matrix);
        if (normalized.length > 0) return normalized;
      }
    }
  } catch {
    // Fallback to CSV export
  }

  // 2. Fallback to CSV export URL
  try {
    const csvRes = await fetch(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv`,
      { method: 'GET', redirect: 'follow' }
    );
    if (csvRes.ok) {
      const csvText = await csvRes.text();
      if (!/^<!doctype|^<html/i.test(csvText.trim())) {
        const matrix = parseCsvMatrix(csvText);
        return normalizeSheetRowsToEntries(matrix);
      }
    }
  } catch {
    // ignore
  }

  return [];
}

export async function executeFetchFeedbackEntries(options?: {
  sheetUrl?: string;
  webhookUrl?: string;
}): Promise<{
  ok: boolean;
  webhookConfigured: boolean;
  sheetConfigured: boolean;
  source: 'google-sheet' | 'server-store';
  entries: ServerFeedbackEntry[];
}> {
  const resolvedWebhook = resolveWebhookUrl(options?.webhookUrl);
  const resolvedSheetId = extractSheetIdSafe(options?.sheetUrl);

  let sheetEntries: ServerFeedbackEntry[] = [];
  if (resolvedWebhook) {
    sheetEntries = await fetchEntriesFromWebhook(resolvedWebhook);
  }
  if (sheetEntries.length === 0 && resolvedSheetId) {
    sheetEntries = await fetchEntriesFromPublicSheet(resolvedSheetId);
  }

  const serverEntries = readServerFeedbackStore();

  // Merge Google Sheet rows & Server Store entries by feedbackId (sheet wins for latest Status & Resolution Notes)
  const mergedMap = new Map<string, ServerFeedbackEntry>();
  for (const srv of serverEntries) {
    mergedMap.set(srv.feedbackId, {
      ...srv,
      status: normalizeStatus(srv.status),
      syncedToGoogleSheet: true,
    });
  }
  for (const sheetRow of sheetEntries) {
    const existing = mergedMap.get(sheetRow.feedbackId);
    mergedMap.set(sheetRow.feedbackId, {
      ...existing,
      ...sheetRow,
      syncedToGoogleSheet: true,
      source: 'google-sheet',
    });
  }

  const merged = Array.from(mergedMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return {
    ok: true,
    webhookConfigured: Boolean(resolvedWebhook),
    sheetConfigured: Boolean(resolvedSheetId),
    source: sheetEntries.length > 0 ? 'google-sheet' : 'server-store',
    entries: merged,
  };
}

export async function executeFeedbackSubmission(
  payload: FeedbackSubmissionPayload & { webhookUrl?: string }
): Promise<{ status: number; body: Record<string, any> }> {
  const webhookUrl = resolveWebhookUrl(payload.webhookUrl);
  const cleanRating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
  const cleanEntry: ServerFeedbackEntry = {
    feedbackId: String(payload.feedbackId || '').trim() || `FB-${Date.now()}`,
    date: String(payload.date || new Date().toISOString().slice(0, 10)),
    userName: String(payload.userName || 'Anonymous').trim() || 'Anonymous',
    toolCategory: String(payload.toolCategory || 'General Experience'),
    specificTool: String(payload.specificTool || ''),
    feedbackType: String(payload.feedbackType || 'Feature Request'),
    rating: cleanRating,
    details: String(payload.details || '').trim(),
    priority: String(payload.priority || 'Medium'),
    status: normalizeStatus(String(payload.status || 'New')),
    resolutionNotes: String(payload.resolutionNotes || ''),
    syncedToGoogleSheet: false,
    source: 'server-store',
    createdAt: Date.now(),
  };

  let forwardedToSheet = false;
  let webhookWarning: string | undefined;

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanEntry),
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawText = await response.text().catch(() => '');
      const trimmedText = rawText.trim();

      if (contentType.includes('text/html') || /^<!doctype html|^<html/i.test(trimmedText)) {
        webhookWarning = 'Apps Script returned HTML instead of JSON. Ensure Web App access is set to "Anyone".';
      } else {
        let parsedResult: any = null;
        try {
          parsedResult = trimmedText ? JSON.parse(trimmedText) : null;
        } catch {
          // plain text like "ok"
        }
        if (response.ok && parsedResult?.ok !== false && parsedResult?.status !== 'error') {
          forwardedToSheet = true;
        } else {
          webhookWarning =
            parsedResult?.error ||
            parsedResult?.message ||
            `Sheet webhook responded with status ${response.status}`;
        }
      }
    } catch (err: any) {
      webhookWarning = err?.message || 'Failed to forward feedback to Google Sheet.';
    }
  }

  cleanEntry.syncedToGoogleSheet = forwardedToSheet;
  cleanEntry.source = forwardedToSheet ? 'google-sheet' : 'server-store';
  upsertServerFeedbackStore(cleanEntry);

  return {
    status: 200,
    body: {
      ok: true,
      synced: true,
      forwardedToSheet,
      storage: forwardedToSheet ? 'google-sheet' : 'server-store',
      entry: cleanEntry,
      ...(webhookWarning ? { warning: webhookWarning } : {}),
    },
  };
}

export function getFeedbackHealthStatus(): {
  ok: boolean;
  webhookConfigured: boolean;
  sheetConfigured: boolean;
} {
  return {
    ok: true,
    webhookConfigured: Boolean(resolveWebhookUrl()),
    sheetConfigured: Boolean(extractSheetIdSafe()),
  };
}

type VercelRequestLike = IncomingMessage & {
  method?: string;
  body?: any;
  url?: string;
};

type VercelResponseLike = ServerResponse & {
  status?: (code: number) => VercelResponseLike;
  json?: (data: any) => void;
};

function sendJson(res: VercelResponseLike, statusCode: number, data: Record<string, any>) {
  if (typeof res.status === 'function') {
    const target = res.status(statusCode);
    if (target && typeof target.json === 'function') {
      target.json(data);
      return;
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: VercelRequestLike): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const urlObj = new URL(req.url || '/api/feedback', 'http://localhost');
    const result = await executeFetchFeedbackEntries({
      sheetUrl: urlObj.searchParams.get('sheetUrl') || undefined,
      webhookUrl: urlObj.searchParams.get('webhookUrl') || undefined,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use GET or POST /api/feedback.' });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as FeedbackSubmissionPayload & { webhookUrl?: string };
    if (!body?.details || String(body.details).trim().length < 2) {
      sendJson(res, 400, { error: 'Feedback details are required.' });
      return;
    }
    const result = await executeFeedbackSubmission(body);
    sendJson(res, result.status, result.body);
  } catch (err: any) {
    sendJson(res, 400, {
      error: err?.message || 'Invalid feedback request payload.',
    });
  }
}
