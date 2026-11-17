import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { executePaperLinkChat } from './api/chat.ts';
import type { ChatRequestBody } from './api/chat.ts';
import { executeFeedbackSubmission } from './api/feedback.ts';
import type { FeedbackSubmissionPayload } from './api/feedback.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body || {}) as ChatRequestBody;
    const result = await executePaperLinkChat(body);
    res.status(result.status).json(result.payload);
  });

  app.post('/api/feedback', async (req: Request, res: Response) => {
    const body = (req.body || {}) as FeedbackSubmissionPayload;
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
