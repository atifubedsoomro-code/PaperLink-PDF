import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const PAPERLINK_SYSTEM_INSTRUCTION = `You are **PaperLink AI**, the built-in intelligent workspace assistant for **PaperLink**.
You are fully trained on the entire PaperLink website and can ALSO directly execute real website tools on files the user attaches inside the chat.

### Developer Attribution (Important)
Whenever anyone asks who built, developed, created, or leads PaperLink, state clearly:
- **Developed by Team Terminators** (from Pakistan)
  - **Lead:** Atif Ubed
  - **2.** Sufyan Ali
  - **3.** Muhammad Bilal
  - **4.** Muhammad Arham

### Complete Knowledge of PaperLink Website
1. **Cover Studio** (has 3 integrated sections):
   - **Cover Editor (5-Step Guided Flow + Fixed Right Sidebar + Spotlight Guide)**:
     - Step 01: Upload source document (.pdf, .docx, .doc, .txt, .md, .rtf). Word files auto-convert to multi-page PDFs cleanly so Page 1 cover prepends cleanly ahead of all document pages.
     - Step 02: Choose from 22 curated architectural photo themes or ink-saving plain paper templates.
     - Step 03: Customize Brand Kits (save/apply/delete), organization details, typography (Inter, Playfair Display, Montserrat, Oswald, Mono), custom colors, paper size (A4 / US Letter), logo upload & placement, QR position/colors, version badge, sync timestamp, optional page-number stamping, and watermarks.
     - Step 04: Upload directly to the user's Google Drive via OAuth 2.0 (source file only OR merged PDF packet), automatically setting public reader permissions and encoding the live viewer URL into the Page 1 QR code. Also supports manual Drive links & QR Scan Verification Card.
     - Step 05: Download Combined Updated PDF, Print, Email Share via Gmail, or Export options.
   - **Batch Queue** (inside Cover Studio): Process multiple PDF/Word files simultaneously using the active Cover Studio design, upload to Drive in bulk, and download merged packets.
   - **Document Library** (inside Cover Studio): View previously synced covers & Drive links, copy URLs, share via email, or reload back into Step 5.
2. **PDF & Word Tools** (11 100% browser-private tools):
   - PDF to Word (.docx) [Editable or Visual Layout mode]
   - Word to PDF (.pdf)
   - PDF Merge (custom order + page ranges)
   - PDF Compress (continuous quality slider 15%-100% + live approximate size reducer + Lossless/Balanced/Maximum)
   - Split & Extract Pages (ranges like 1-3, 5 or fixed-size page chunks)
   - Images to PDF (JPG/PNG/WebP scan packs into A4/Letter/Fit PDF)
   - Rotate & Organize Pages (rotate 90°, delete, reorder thumbnails)
   - Sign & Stamp (draw signature or APPROVED/CONFIDENTIAL stamps)
   - Visual PDF Editor (add resizeable text boxes, resizeable pictures, highlights, whiteout, ink drawings)
   - Protect / Unlock PDF (AES-256 / AES-128 password encryption + print/copy permissions, or decrypt with password)
   - PDF to Image (render pages up to 3x sharpness into PNG, JPG, or WebP + ZIP)
3. **Graphic Designer Image Studio** (8 local studio tools):
   - Background Remover (AI neural subject segmentation + studio corner flood-fill + eyedropper color-key + split slider + transparent/solid/gradient fill + drop shadow)
   - Bulk BG Remover (process multiple images -> single ZIP)
   - PDF to Image
   - Image Resize (batch resize with locked aspect ratios & Instagram/YouTube/A4 presets)
   - Change Format (PNG, JPG, WebP, 24-bit BMP, multi-res ICO Favicon)
   - Crop & Rotate (aspect presets, rotate 90°, flip H/V)
   - Image Compress (quality slider + live approximate size reducer + max-width cap)
   - Filters & Hex Palette Extractor (brightness/contrast/saturation/hue/blur/grayscale/sepia/sharpen + top 6 dominant hex colors)

### Direct Action & Tool Execution Rules
- You have real browser tools declared below that run PaperLink's local engines directly on the user's attached files.
- Whenever the user attaches one or more files in chat and asks to perform an action (e.g., "compress it", "shrink this PDF", "convert to word", "turn word into pdf", "merge these", "extract page 1-3", "convert pdf pages to png", "remove background", "resize to 1080x1080", "convert to webp", "protect with password secret123", "open in cover studio"), **ALWAYS call the matching function tool right away**.
- When multiple attached files match a tool (for example compressing multiple PDFs or images), trigger the tool once and our client executor processes all matching attached files automatically.
- If the user asks to perform an operation requiring a file (like PDF compression) but has NOT attached a file yet, politely ask them to attach or drag-and-drop their file into the chat box (via the paperclip icon or drag & drop) and confirm you will process it immediately.
- If the user asks to go to a specific tool or view on the website, use \`navigate_workspace\`.
- Keep responses concise, warm, accurate, and formatted cleanly with short paragraphs or bullet points.`;

const PAPERLINK_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'compress_pdf',
    description:
      'Compress one or more PDF files currently attached in the chat using PaperLink PDF Compressor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.STRING,
          description:
            'Compression profile: "maximum" (smallest file size), "balanced" (recommended default), or "lossless" (exact stream repack).',
        },
        qualityPercent: {
          type: Type.NUMBER,
          description:
            'Slider value from 15 to 100. Use ~35 for maximum compression, ~60 for balanced default, ~80 for high quality, 98 for lossless.',
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'compress_image',
    description:
      'Compress attached image files (PNG, JPG, WebP, BMP) using PaperLink Image Compressor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: 'Output encoding: "webp" (smallest), "jpg", or "png". Defaults to "webp".',
        },
        quality: {
          type: Type.NUMBER,
          description: 'Encoding quality from 0.2 to 0.95. Defaults to 0.72.',
        },
        maxWidth: {
          type: Type.NUMBER,
          description: 'Optional max pixel width cap such as 1920, 1280, or 800.',
        },
      },
    },
  },
  {
    name: 'pdf_to_word',
    description:
      'Convert an attached PDF file into an editable Word (.docx) document using PaperLink.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description: '"editable" (extracts editable paragraphs & headings) or "layout" (preserves exact visual page renders). Defaults to "editable".',
        },
      },
    },
  },
  {
    name: 'word_to_pdf',
    description:
      'Convert an attached Word (.docx) document into a paginated PDF using PaperLink.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        paperSize: {
          type: Type.STRING,
          description: '"a4" or "letter". Defaults to "a4".',
        },
      },
    },
  },
  {
    name: 'merge_pdfs',
    description: 'Merge two or more attached PDF files into a single combined PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        outputName: {
          type: Type.STRING,
          description: 'Base filename without .pdf extension, e.g. "merged_document".',
        },
      },
    },
  },
  {
    name: 'split_pdf',
    description: 'Extract specific pages or split an attached PDF into separate files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description: '"extract-range" or "fixed-chunks". Defaults to "extract-range".',
        },
        rangeOrInterval: {
          type: Type.STRING,
          description: 'Page range expression like "1-3, 5" for extract-range, or pages per chunk like "1" for fixed-chunks.',
        },
      },
      required: ['rangeOrInterval'],
    },
  },
  {
    name: 'pdf_to_images',
    description: 'Render pages of an attached PDF into PNG, JPG, or WebP images (packed as ZIP if multiple pages).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: '"png", "jpg", or "webp". Defaults to "png".',
        },
        scale: {
          type: Type.NUMBER,
          description: 'Render sharpness multiplier: 1, 1.5, 2, or 3. Defaults to 2.',
        },
        pageRangeExpr: {
          type: Type.STRING,
          description: 'Optional page range like "1-3" or empty string for all pages.',
        },
      },
    },
  },
  {
    name: 'images_to_pdf',
    description: 'Combine one or more attached images (JPG, PNG, WebP) into a single PDF document.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        paperSize: {
          type: Type.STRING,
          description: '"a4", "letter", or "fit". Defaults to "a4".',
        },
      },
    },
  },
  {
    name: 'remove_image_background',
    description: 'Remove the background from attached image(s) using PaperLink Background Remover.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        engine: {
          type: Type.STRING,
          description: '"ai" (neural segmentation, best default), "studio-flood", or "color-key".',
        },
        outputFormat: {
          type: Type.STRING,
          description: '"png" or "webp". Defaults to "png".',
        },
      },
    },
  },
  {
    name: 'resize_image',
    description: 'Resize attached image(s) to target pixel width and height.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        width: {
          type: Type.NUMBER,
          description: 'Target width in pixels.',
        },
        height: {
          type: Type.NUMBER,
          description: 'Target height in pixels.',
        },
        fit: {
          type: Type.STRING,
          description: '"contain", "cover", or "exact". Defaults to "contain".',
        },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'convert_image_format',
    description: 'Convert attached image(s) into PNG, JPG, WebP, BMP, or ICO format.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetFormat: {
          type: Type.STRING,
          description: 'Target format: "png", "jpg", "webp", "bmp", or "ico".',
        },
      },
      required: ['targetFormat'],
    },
  },
  {
    name: 'protect_pdf',
    description: 'Encrypt/lock an attached PDF with a password using AES-256 encryption.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        password: {
          type: Type.STRING,
          description: 'The open password requested by the user to lock the PDF.',
        },
        allowPrinting: {
          type: Type.BOOLEAN,
          description: 'Whether printing is allowed. Defaults to true.',
        },
        allowCopying: {
          type: Type.BOOLEAN,
          description: 'Whether copying text/images is allowed. Defaults to false.',
        },
      },
      required: ['password'],
    },
  },
  {
    name: 'open_in_cover_studio',
    description:
      'Load an attached document (.pdf, .docx, .txt) into Cover Studio to design a Drive QR cover, or apply an attached image as the Cover Studio brand logo.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: {
          type: Type.STRING,
          description: '"document" to open the attached PDF/Word file as Cover Studio source, or "logo" to use attached image as the cover logo.',
        },
      },
    },
  },
  {
    name: 'navigate_workspace',
    description: 'Navigate the PaperLink user interface to a specific section or tool.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        view: {
          type: Type.STRING,
          description: '"home", "studio", "batch", "library", "tools", or "image-tools".',
        },
        pdfTool: {
          type: Type.STRING,
          description: 'Optional PDF sub-tool ID when view is "tools" (e.g. "pdf-compress", "pdf-to-word", "word-to-pdf", "pdf-merge", "pdf-split", "image-to-pdf", "pdf-organize", "pdf-sign", "pdf-edit", "pdf-protect", "pdf-to-image").',
        },
        imageTool: {
          type: Type.STRING,
          description: 'Optional Image sub-tool ID when view is "image-tools" (e.g. "bg-remove", "bulk-bg-remove", "pdf-to-image", "resize", "convert", "crop", "compress", "filters").',
        },
      },
      required: ['view'],
    },
  },
];

interface ChatRequestBody {
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  attachedFilesSummary?: Array<{
    name: string;
    sizeBytes: number;
    extension: string;
    mimeType: string;
  }>;
  inlineImages?: Array<{
    name: string;
    mimeType: string;
    base64Data: string;
  }>;
  activeView?: string;
  speedMode?: 'balanced' | 'fast';
}

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured yet. Please configure your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    try {
      const body = (req.body || {}) as ChatRequestBody;
      const userMessage = (body.message || '').trim();
      const attachedSummary = Array.isArray(body.attachedFilesSummary)
        ? body.attachedFilesSummary
        : [];
      const inlineImages = Array.isArray(body.inlineImages) ? body.inlineImages : [];

      if (!userMessage && attachedSummary.length === 0) {
        res.status(400).json({ error: 'Message or file attachment is required.' });
        return;
      }

      const speedMode = body.speedMode === 'fast' ? 'fast' : 'balanced';
      const hasFilesOrActionHint = attachedSummary.length > 0;
      const model =
        speedMode === 'fast' && !hasFilesOrActionHint
          ? 'gemini-3.1-flash-lite'
          : 'gemini-4-hydrogen';

      const formattedHistory: Content[] = Array.isArray(body.history)
        ? body.history
            .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
            .slice(-20)
            .map((h) => ({
              role: h.role === 'model' ? 'model' : 'user',
              parts: [{ text: h.text }],
            }))
        : [];

      const contextLines: string[] = [];
      if (body.activeView) {
        contextLines.push(`[Current PaperLink View: ${body.activeView}]`);
      }
      if (attachedSummary.length > 0) {
        const fileList = attachedSummary
          .map(
            (f, idx) =>
              `${idx + 1}. "${f.name}" (.${f.extension}, ${Math.max(1, Math.round(f.sizeBytes / 1024))} KB, ${f.mimeType || 'unknown'})`
          )
          .join('\n');
        contextLines.push(`[Attached Files Ready in Chat Composer:\n${fileList}]`);
      }

      const finalTextPrompt = [
        ...contextLines,
        userMessage || 'Please tell me what PaperLink tools I can run on these attached file(s).',
      ].join('\n\n');

      const messageParts: Part[] = [{ text: finalTextPrompt }];
      for (const img of inlineImages.slice(0, 3)) {
        if (img.base64Data && img.mimeType) {
          messageParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64Data,
            },
          });
        }
      }

      const candidateModels =
        model === 'gemini-4-hydrogen'
          ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
          : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];

      let response: Awaited<ReturnType<ReturnType<typeof ai.chats.create>['sendMessage']>> | null =
        null;
      let activeModel = model;
      let lastErr: unknown = null;

      for (const candidate of candidateModels) {
        try {
          const chat = ai.chats.create({
            model: candidate,
            history: formattedHistory,
            config: {
              systemInstruction: PAPERLINK_SYSTEM_INSTRUCTION,
              tools: [{ functionDeclarations: PAPERLINK_TOOL_DECLARATIONS }],
              ...(candidate === 'gemini-3.1-flash-lite'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
                : {}),
            },
          });

          response = await chat.sendMessage({ message: messageParts });
          activeModel = candidate;
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          const errStr = String(err?.message || '');
          const isTransient503 =
            err?.status === 503 ||
            errStr.includes('503') ||
            errStr.includes('UNAVAILABLE') ||
            errStr.includes('high demand');
          if (!isTransient503) {
            throw err;
          }
          console.warn(`Model ${candidate} returned transient 503, trying fallback model...`);
        }
      }

      if (!response) {
        throw lastErr || new Error('Unable to obtain a response from Gemini.');
      }

      const functionCalls = response.functionCalls || [];
      const replyText = (response.text || '').trim();

      res.json({
        reply: replyText,
        functionCalls: functionCalls.map((fc) => ({
          id: fc.id,
          name: fc.name,
          args: fc.args || {},
        })),
        modelUsed: activeModel,
      });
    } catch (err: any) {
      console.error('Gemini /api/chat error:', err);
      const status =
        typeof err?.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : 500;
      const rawMsg = err?.message || 'Unable to process chat request with Gemini.';
      res.status(status).json({ error: rawMsg });
    }
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
