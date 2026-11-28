import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { executePaperLinkChat } from './api/chat.ts';
import type { ChatRequestBody } from './api/chat.ts';
import {
  executeFeedbackSubmission,
  executeFetchFeedbackEntries,
} from './api/feedback.ts';
import type { FeedbackSubmissionPayload } from './api/feedback.ts';
import { executeCoverSuggestions } from './api/cover-suggestions.ts';
import type { CoverSuggestionsStartRequest } from './api/cover-suggestions.ts';
import { executeDocumentSolve } from './api/solve-document.ts';
import type { SolveDocumentRequest } from './api/solve-document.ts';
import { executeAnalyzeDocument } from './api/analyze-document.ts';
import type { AnalyzeDocumentRequest } from './api/analyze-document.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body || {}) as ChatRequestBody;
    const result = await executePaperLinkChat(body);
    res.status(result.status).json(result.payload);
  });

  app.post('/api/solve-document', async (req: Request, res: Response) => {
    const body = (req.body || {}) as SolveDocumentRequest;
    const result = await executeDocumentSolve(body);
    res.status(result.status).json(result.payload);
  });

  app.post('/api/analyze-document', async (req: Request, res: Response) => {
    const body = (req.body || {}) as AnalyzeDocumentRequest;
    const result = await executeAnalyzeDocument(body);
    res.status(result.status).json(result.payload);
  });

  app.post('/api/cover-suggestions', async (req: Request, res: Response) => {
    const body = (req.body || {}) as CoverSuggestionsStartRequest;
    const result = await executeCoverSuggestions(body);
    res.status(result.status).json(result.payload);
  });

  app.get('/api/feedback', async (req: Request, res: Response) => {
    const sheetUrl = typeof req.query.sheetUrl === 'string' ? req.query.sheetUrl : undefined;
    const webhookUrl = typeof req.query.webhookUrl === 'string' ? req.query.webhookUrl : undefined;
    const result = await executeFetchFeedbackEntries({ sheetUrl, webhookUrl });
    res.status(200).json(result);
  });

  app.post('/api/feedback', async (req: Request, res: Response) => {
    const body = (req.body || {}) as FeedbackSubmissionPayload;
    if (!body?.details || String(body.details).trim().length < 2) {
      res.status(400).json({ error: 'Feedback details are required.' });
      return;
    }
    const result = await executeFeedbackSubmission(body);
    res.status(result.status).json(result.body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PaperLink server running on http://0.0.0.0:${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start PaperLink server:', err);
  process.exit(1);
});
