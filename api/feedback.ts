import type { IncomingMessage, ServerResponse } from 'http';

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

export async function executeFeedbackSubmission(
  payload: FeedbackSubmissionPayload
): Promise<{ status: number; body: Record<string, any> }> {
  const webhookUrl = (
    process.env.FEEDBACK_SHEET_WEBHOOK_URL ||
    process.env.FEEDBACK_WEBHOOK_URL ||
    process.env.VITE_FEEDBACK_WEBHOOK_URL ||
    ''
  ).trim();

  if (!webhookUrl) {
    return {
      status: 200,
      body: {
        ok: true,
        synced: false,
        reason: 'webhook_not_configured',
      },
    };
  }

  const cleanRating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedbackId: String(payload.feedbackId || '').trim(),
        date: String(payload.date || new Date().toISOString().slice(0, 10)),
        userName: String(payload.userName || 'Anonymous').trim() || 'Anonymous',
        toolCategory: String(payload.toolCategory || 'General Experience'),
        specificTool: String(payload.specificTool || ''),
        feedbackType: String(payload.feedbackType || 'Feature Request'),
        rating: cleanRating,
        details: String(payload.details || '').trim(),
        priority: String(payload.priority || 'Medium'),
        status: String(payload.status || 'New'),
        resolutionNotes: String(payload.resolutionNotes || ''),
      }),
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const rawText = await response.text().catch(() => '');
    const trimmedText = rawText.trim();

    // Google Apps Script returns an HTML login/error page with HTTP 200 if access is not set to "Anyone"
    if (contentType.includes('text/html') || /^<!doctype html|^<html/i.test(trimmedText)) {
      return {
        status: 502,
        body: {
          ok: false,
          synced: false,
          error: 'Apps Script returned HTML instead of JSON. Ensure Web App access is set to "Anyone".',
        },
      };
    }

    let parsedResult: any = null;
    try {
      parsedResult = trimmedText ? JSON.parse(trimmedText) : null;
    } catch {
      // Apps Script may return plain text like "ok"
    }

    if (!response.ok || parsedResult?.ok === false || parsedResult?.status === 'error') {
      return {
        status: 502,
        body: {
          ok: false,
          synced: false,
          error:
            parsedResult?.error ||
            parsedResult?.message ||
            `Sheet webhook responded with status ${response.status}`,
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        synced: true,
        result: parsedResult ?? { ok: true },
      },
    };
  } catch (err: any) {
    return {
      status: 500,
      body: {
        ok: false,
        synced: false,
        error: err?.message || 'Failed to forward feedback to Google Sheet.',
      },
    };
  }
}

export function getFeedbackHealthStatus(): { ok: boolean; webhookConfigured: boolean } {
  const webhookUrl = (
    process.env.FEEDBACK_SHEET_WEBHOOK_URL ||
    process.env.FEEDBACK_WEBHOOK_URL ||
    process.env.VITE_FEEDBACK_WEBHOOK_URL ||
    ''
  ).trim();
  return {
    ok: true,
    webhookConfigured: /^https:\/\/script\.google\.com\/macros\/s\//i.test(webhookUrl),
  };
}

type VercelRequestLike = IncomingMessage & {
  method?: string;
  body?: any;
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
    sendJson(res, 200, getFeedbackHealthStatus());
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST /api/feedback.' });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as FeedbackSubmissionPayload;
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
