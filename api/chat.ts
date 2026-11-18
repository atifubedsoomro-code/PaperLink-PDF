import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

export interface ChatRequestBody {
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  message?: string;
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

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
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
  - **5.** Manahil Shamsi

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
- If the user asks to perform an operation requiring a file (like PDF compression) but has NOT attached a file yet, politely ask them to attach or drag-and-drop their file using the **+** button and confirm you will process it immediately.
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
          description:
            '"editable" (extracts editable paragraphs & headings) or "layout" (preserves exact visual page renders). Defaults to "editable".',
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
          description:
            'Page range expression like "1-3, 5" for extract-range, or pages per chunk like "1" for fixed-chunks.',
        },
      },
      required: ['rangeOrInterval'],
    },
  },
  {
    name: 'pdf_to_images',
    description:
      'Render pages of an attached PDF into PNG, JPG, or WebP images (packed as ZIP if multiple pages).',
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
          description:
            '"document" to open the attached PDF/Word file as Cover Studio source, or "logo" to use attached image as the cover logo.',
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
          description:
            'Optional PDF sub-tool ID when view is "tools" (e.g. "pdf-compress", "pdf-to-word", "word-to-pdf", "pdf-merge", "pdf-split", "image-to-pdf", "pdf-organize", "pdf-sign", "pdf-edit", "pdf-protect", "pdf-to-image").',
        },
        imageTool: {
          type: Type.STRING,
          description:
            'Optional Image sub-tool ID when view is "image-tools" (e.g. "bg-remove", "bulk-bg-remove", "pdf-to-image", "resize", "convert", "crop", "compress", "filters").',
        },
      },
      required: ['view'],
    },
  },
];

export async function executePaperLinkChat(
  body: ChatRequestBody
): Promise<{ status: number; payload: Record<string, any> }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 503,
      payload: {
        error:
          'GEMINI_API_KEY is not configured on the server yet. Add GEMINI_API_KEY to your environment variables (Vercel Project Settings -> Environment Variables or AI Studio Secrets).',
      },
    };
  }

  try {
    const userMessage = (body.message || '').trim();
    const attachedSummary = Array.isArray(body.attachedFilesSummary)
      ? body.attachedFilesSummary
      : [];
    const inlineImages = Array.isArray(body.inlineImages) ? body.inlineImages : [];

    if (!userMessage && attachedSummary.length === 0) {
      return {
        status: 400,
        payload: { error: 'Message or file attachment is required.' },
      };
    }

    const speedMode = body.speedMode === 'fast' ? 'fast' : 'balanced';
    const hasFilesOrActionHint = attachedSummary.length > 0;
    const primaryModel =
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
      primaryModel === 'gemini-4-hydrogen'
        ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
        : ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-4-hydrogen'];

    let response: Awaited<ReturnType<ReturnType<typeof ai.chats.create>['sendMessage']>> | null =
      null;
    let activeModel = primaryModel;
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
        const isInvalidKey =
          errStr.includes('API_KEY_INVALID') ||
          errStr.includes('API key not valid') ||
          errStr.includes('API_KEY');
        if (isInvalidKey) {
          throw err;
        }
        console.warn(`Model ${candidate} failed (${err?.status || 'error'}), trying fallback model...`);
      }
    }

    if (!response) {
      throw lastErr || new Error('Unable to obtain a response from Gemini.');
    }

    const functionCalls = response.functionCalls || [];
    const replyText = (response.text || '').trim();

    return {
      status: 200,
      payload: {
        reply: replyText,
        functionCalls: functionCalls.map((fc) => ({
          id: fc.id,
          name: fc.name,
          args: fc.args || {},
        })),
        modelUsed: activeModel,
      },
    };
  } catch (err: any) {
    console.error('Gemini /api/chat error:', err);
    const status =
      typeof err?.status === 'number' && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    const rawMsg = err?.message || 'Unable to process chat request with Gemini.';
    return {
      status,
      payload: { error: rawMsg },
    };
  }
}

async function readJsonBody(
  req: IncomingMessage & { body?: any }
): Promise<ChatRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as ChatRequestBody;
  }
  if (typeof req.body === 'string') {
    return (req.body ? JSON.parse(req.body) : {}) as ChatRequestBody;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as ChatRequestBody;
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

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST /api/chat.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await executePaperLinkChat(body);
    sendJson(res, result.status, result.payload);
  } catch (err: any) {
    sendJson(res, 400, {
      error: err?.message || 'Invalid JSON request payload.',
    });
  }
}
