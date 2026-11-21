import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';
import { executeDocumentSolve } from './solve-document.ts';
import type { SolveDocumentRequest } from './solve-document.ts';

export interface ChatRequestBody {
  action?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  message?: string;
  attachedFilesSummary?: Array<{
    name: string;
    sizeBytes: number;
    extension: string;
    mimeType: string;
  }>;
  previousOutputsSummary?: Array<{
    name: string;
    sizeBytes: number;
    extension: string;
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
2. **PDF & Office Utility Tools** (20 100% browser-private tools):
   - PDF to Word (.docx) [Editable or Visual Layout mode]
   - Word to PDF (.pdf)
   - PPT to PDF (.pptx → print-ready PDF, optional speaker notes)
   - PPT to Image (.pptx → PNG, JPG, or WebP slides + ZIP)
   - Excel to PDF (.xlsx, .xls, .csv, .ods → Landscape/Portrait formatted table PDF)
   - Excel to Image (.xlsx, .xls, .csv → PNG, JPG, or WebP table cards + ZIP)
   - PDF to Excel (.xlsx or .csv table extraction)
   - PDF to PPT (.pptx presentation builder)
   - PDF Merge (custom order + page ranges)
   - PDF Compress (continuous quality slider 15%-100% + live approximate size reducer + Lossless/Balanced/Maximum)
   - Split & Extract Pages (ranges like 1-3, 5 or fixed-size page chunks)
   - Images to PDF (JPG/PNG/WebP scan packs into A4/Letter/Fit PDF)
   - Add Pictures to PDF (visual canvas to drop, resize, rotate, opacity-blend, round corners, and stamp photos/IDs onto existing PDF pages)
   - Watermark Remover (PDF) (clean vector watermark streams/annotations OR smart pixel-clean & corner badge eraser on scanned PDFs)
   - Watermark & Page # (PDF) (diagonal/tiled text or PNG logo watermarks + page numbering)
   - Rotate & Organize Pages (rotate 90°, delete, reorder thumbnails)
   - Sign & Stamp (draw signature or APPROVED/CONFIDENTIAL stamps)
   - Visual PDF Editor (add resizeable text boxes, resizeable pictures, highlights, whiteout, ink drawings)
   - Protect / Unlock PDF (AES-256 / AES-128 password encryption + print/copy permissions, or decrypt with password)
   - PDF to Image (render pages up to 3x sharpness into PNG, JPG, or WebP + ZIP)
3. **Graphic Designer Image Studio** (11 local studio tools):
   - Background Remover (AI neural subject segmentation + studio corner flood-fill + eyedropper color-key + split slider + transparent/solid/gradient fill + drop shadow)
   - Bulk BG Remover (process multiple images -> single ZIP)
   - Watermark Remover (Image) (brush or box-mask watermarks, logos, timestamps & glare with Photo Inpaint, Document Paper heal, or Soft Deblend)
   - Blur & Redact (interactive privacy blur, pixelate mosaic, or solid blackout bars for faces, plates & sensitive text)
   - Photo Grid & ID Front/Back Joiner (combine multiple photos or ID front & back into A4 ID sheets, 2x2/3x2 grids, or side-by-side layouts)
   - PDF to Image
   - Image Resize (batch resize with locked aspect ratios & Instagram/YouTube/A4 presets)
   - Change Format (PNG, JPG, WebP, 24-bit BMP, multi-res ICO Favicon)
   - Crop & Rotate (aspect presets, rotate 90°, flip H/V)
   - Image Compress (quality slider + live approximate size reducer + max-width cap)
   - Filters & Hex Palette Extractor (brightness/contrast/saturation/hue/blur/grayscale/sepia/sharpen + top 6 dominant hex colors)

### Direct Action, Complex Prompt & Multiwork Pipeline Rules (CRITICAL)
- You have real browser tools declared below that execute PaperLink's local engines directly on attached files, pasted text, OR previous outputs from this conversation.
- **MULTIWORK & MULTI-STEP PIPELINED COMMANDS:** Users frequently give complex prompts combining sequential chains AND/OR parallel multi-file jobs in a single message:
  - Sequential chain example 1: *"convert this png into the pdf, add a basic cover without qr, stamp CONFIDENTIAL on all pages, and protect it with password 123"* → emit in order:
    1. \`images_to_pdf\`
    2. \`add_cover_to_pdf\` (\`themeStyle: "basic"\`, \`includeQr: false\`)
    3. \`stamp_pdf\` (\`text: "CONFIDENTIAL"\`, \`pages: "all"\`)
    4. \`protect_pdf\` (\`password: "123"\`)
  - Sequential chain example 2: *"create a PDF from these meeting notes ..., add an executive corporate cover, rotate page 2 by 90 degrees, and compress it"* → emit \`text_to_pdf\` → \`add_cover_to_pdf\` → \`organize_pdf_pages\` → \`compress_pdf\`.
  - Parallel mixed-file multiwork example: User attaches \`report.docx\`, \`slides.pptx\`, \`budget.xlsx\`, and \`logo.png\` and says *"convert the word, ppt and excel to PDF, merge them all together, compress the merged PDF, AND remove background from logo.png and resize it to 512x512"* → emit ALL tool calls in logical execution order:
    1. \`word_to_pdf\`
    2. \`ppt_to_pdf\`
    3. \`excel_to_pdf\`
    4. \`merge_pdfs\`
    5. \`compress_pdf\`
    6. \`remove_image_background\`
    7. \`resize_image\` (\`width: 512\`, \`height: 512\`)
  - **AI DOCUMENT SOLVER (Lab Manuals & Question Papers):** Whenever the user attaches a Lab Manual, Worksheet, Assignment, Exam, or Question Paper (PDF, Word, or Image) and asks you to **answer it, solve it, fill empty fields/tables, draw/fill diagrams, or attach separate authentic answer pages** (e.g. *"solve this lab manual"*, *"answer this sheet and fill diagrams"*, *"solve this question paper and attach answer pages"*), ALWAYS call \`solve_document_ai\` directly!
    - By default set \`mode: "auto"\` so the solver automatically detects empty tables/lines/diagram boxes (filling directly in-place in the same format) vs Question Papers without blank spaces (attaching formatted separate Authentic Answer Sheet pages).
    - If the user asks *"fill inside the sheet"* use \`mode: "fill-in-place"\`; if they ask *"attach separate answer pages / separate answer sheet"* use \`mode: "separate-answer-sheet"\`.
  - Multi-image creative pipeline example: *"rotate image 90 degrees, crop 1:1 square, apply grayscale + sharpen filter, extract hex palette, and convert to webp"* → emit \`crop_rotate_image\` → \`filter_or_palette_image\` → \`convert_image_format\`.
- Our client pipeline runner feeds Step N outputs straight into Step N+1 in memory AND preserves unconsumed files of other types for parallel multiwork steps. **NEVER** stop after Step 1 or ask the user to re-attach an intermediate file created inside the same turn.
- **FOLLOW-UP ON PREVIOUS OUTPUTS:** If \`[Previously Generated Outputs in This Chat]\` lists output file(s) and the user says *"now compress that"*, *"stamp APPROVED on it"*, *"add a cover to the PDF you just made"*, or *"lock it with password 999"* without re-attaching files, STILL emit the requested tool call(s) directly — the client automatically reuses the previously generated file(s)!
- **TEXT / NOTES TO PDF WITH NO FILE:** If the user pastes notes, a letter, or markdown/plain text directly in chat and asks to make/convert it into a PDF (or attach a \`.txt\`/\`.md\`/\`.rtf\` file), call \`text_to_pdf\` with \`contentText\` (when pasted in prompt) or it will read the attached text file automatically.
- Distinguish clearly between:
  - \`add_cover_to_pdf\`: Directly generates and prepends Page 1 cover onto the PDF automatically right in chat (set \`includeQr: false\` for "without QR" / "no QR" / "basic cover without QR").
  - \`open_in_cover_studio\`: Opens the interactive Cover Studio visual editor UI when the user explicitly asks to edit/design inside Cover Studio.
- Only ask the user to attach a file with **+** if NO matching attached file, NO previous output file of that type, and NO earlier creation step in the same turn can provide it.
- If the user asks to open a page or tool view, call \`navigate_workspace\`.
- Keep text replies brief, confident, and structured cleanly around the steps executed.`;

const PAPERLINK_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'compress_pdf',
    description:
      'Compress one or more PDF files (attached or created by an earlier step in the same turn) using PaperLink PDF Compressor.',
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
      'Compress attached or pipeline image files (PNG, JPG, WebP, BMP) using PaperLink Image Compressor.',
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
      'Convert an attached or pipeline PDF file into an editable Word (.docx) document using PaperLink.',
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
    description: 'Extract specific pages or split an attached or pipeline PDF into separate files.',
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
      'Render pages of an attached or pipeline PDF into PNG, JPG, or WebP images (packed as ZIP if multiple pages).',
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
    description: 'Combine one or more attached or pipeline images (JPG, PNG, WebP) into a PDF document.',
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
    name: 'add_cover_to_pdf',
    description:
      'Generate and prepend a Cover Page as Page 1 onto an attached or previously created PDF in this pipeline. Supports basic plain covers without QR as well as styled covers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Optional title for the cover page. Defaults automatically from the filename.',
        },
        subtitle: {
          type: Type.STRING,
          description: 'Optional subtitle or course/project description.',
        },
        preparedBy: {
          type: Type.STRING,
          description: 'Optional author or Prepared By name.',
        },
        organization: {
          type: Type.STRING,
          description: 'Optional organization or company header.',
        },
        themeStyle: {
          type: Type.STRING,
          description:
            'Cover look: "basic" (clean ink-friendly ruled white cover), "centered" (minimalist centered print), "left-bar" (clean left accent bar), "corporate" (executive slate), "dark" (obsidian gold), or "academic". Defaults to "basic".',
        },
        includeQr: {
          type: Type.BOOLEAN,
          description:
            'Whether to include a QR code block on the cover footer. Set to false whenever the user says "without qr", "no qr", "basic cover", or no Drive link is requested. Defaults to false.',
        },
        paperSize: {
          type: Type.STRING,
          description: '"a4" or "letter". Defaults to "a4".',
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
    description: 'Resize attached or pipeline image(s) to target pixel width and height.',
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
    description: 'Convert attached or pipeline image(s) into PNG, JPG, WebP, BMP, or ICO format.',
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
    description:
      'Encrypt/lock an attached or previously created PDF with a password using AES-256 encryption.',
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
    name: 'unlock_pdf',
    description: 'Remove password protection from an encrypted PDF using its current password.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        password: {
          type: Type.STRING,
          description: 'The current password required to unlock the encrypted PDF.',
        },
      },
      required: ['password'],
    },
  },
  {
    name: 'open_in_cover_studio',
    description:
      'Load an attached document (.pdf, .docx, .txt) into the interactive Cover Studio editor UI, or apply an attached image as the Cover Studio brand logo.',
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
    name: 'ppt_to_pdf',
    description:
      'Convert an attached PowerPoint (.pptx) presentation into a PDF document.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        layout: {
          type: Type.STRING,
          description:
            '"slide-fit" (exact slide 16:9/4:3 fit, default), "a4-landscape", or "a4-portrait".',
        },
        includeNotes: {
          type: Type.BOOLEAN,
          description: 'Include speaker notes when using "a4-portrait" layout.',
        },
      },
    },
  },
  {
    name: 'ppt_to_images',
    description:
      'Export slides from an attached PowerPoint (.pptx) deck as PNG, JPG, or WebP images (+ ZIP).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: '"png", "jpg", or "webp". Defaults to "png".',
        },
        scale: {
          type: Type.NUMBER,
          description: 'Resolution multiplier: 1, 1.5, or 2. Defaults to 1.5.',
        },
      },
    },
  },
  {
    name: 'excel_to_pdf',
    description:
      'Convert an attached Excel/CSV spreadsheet (.xlsx, .xls, .csv, .ods) into a formatted PDF document.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orientation: {
          type: Type.STRING,
          description: '"landscape" (default, best for wide tables) or "portrait".',
        },
        paperSize: {
          type: Type.STRING,
          description: '"a4" or "letter". Defaults to "a4".',
        },
      },
    },
  },
  {
    name: 'excel_to_images',
    description:
      'Render sheets of an attached Excel/CSV spreadsheet (.xlsx, .xls, .csv, .ods) as PNG, JPG, or WebP images (+ ZIP).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: '"png", "jpg", or "webp". Defaults to "png".',
        },
        scale: {
          type: Type.NUMBER,
          description: 'Resolution multiplier: 1, 1.5, or 2. Defaults to 1.5.',
        },
      },
    },
  },
  {
    name: 'pdf_to_excel',
    description:
      'Extract tabular data from an attached or pipeline PDF into an Excel (.xlsx) or CSV (.csv) file.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: '"xlsx" (default) or "csv".',
        },
      },
    },
  },
  {
    name: 'pdf_to_ppt',
    description:
      'Convert an attached or pipeline PDF document into a PowerPoint (.pptx) presentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        scale: {
          type: Type.NUMBER,
          description: 'Render sharpness: 1.5 (default) or 2.',
        },
      },
    },
  },
  {
    name: 'text_to_pdf',
    description:
      'Create a clean paginated PDF from attached plain-text files (.txt, .md, .rtf) OR directly from text/notes pasted in the user prompt.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Optional document heading / output base filename.',
        },
        contentText: {
          type: Type.STRING,
          description:
            'Text body to render into PDF when user pasted text/notes in chat instead of attaching a .txt/.md file.',
        },
        paperSize: {
          type: Type.STRING,
          description: '"a4" or "letter". Defaults to "a4".',
        },
      },
    },
  },
  {
    name: 'organize_pdf_pages',
    description:
      'Rotate pages (90/180/270 degrees), delete specific pages, keep only specific pages, or reverse page order of an attached or pipeline PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rotateDegrees: {
          type: Type.NUMBER,
          description: 'Clockwise rotation degrees to apply: 0, 90, 180, or 270.',
        },
        rotatePagesExpr: {
          type: Type.STRING,
          description: 'Optional 1-based page list/range to rotate (e.g. "2" or "1-3"). Empty means all pages.',
        },
        deletePagesExpr: {
          type: Type.STRING,
          description: 'Optional 1-based page list/range to remove (e.g. "1, 4-5").',
        },
        keepPagesExpr: {
          type: Type.STRING,
          description: 'Optional 1-based page list/range to keep (e.g. "1-3, 5"), deleting all others.',
        },
        reverseOrder: {
          type: Type.BOOLEAN,
          description: 'Set true to reverse page sequence.',
        },
      },
    },
  },
  {
    name: 'stamp_pdf',
    description:
      'Place a crisp visual box stamp (e.g. CONFIDENTIAL, APPROVED, DRAFT, URGENT, COPY, FINAL) onto one or all pages of an attached or pipeline PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'Short uppercase stamp label such as "CONFIDENTIAL", "APPROVED", or "DRAFT".',
        },
        color: {
          type: Type.STRING,
          description: 'Optional hex color: "#dc2626" (red), "#16a34a" (green), "#d97706" (amber), "#2563eb" (blue).',
        },
        pages: {
          type: Type.STRING,
          description: '"all", "first", or a 1-based range like "1, 3". Defaults to "all".',
        },
        position: {
          type: Type.STRING,
          description: '"top-right" (default), "top-left", "bottom-right", or "center".',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'crop_rotate_image',
    description:
      'Rotate (90/180/270 deg), flip horizontally or vertically, or center-crop an attached or pipeline image to an aspect ratio.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rotateDeg: {
          type: Type.NUMBER,
          description: 'Clockwise rotation: 0, 90, 180, or 270.',
        },
        flipH: {
          type: Type.BOOLEAN,
          description: 'Flip image horizontally (mirror left-right).',
        },
        flipV: {
          type: Type.BOOLEAN,
          description: 'Flip image vertically (upside down).',
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'Optional center-crop ratio: "original", "1:1", "4:5", "16:9", "4:3", or "3:2".',
        },
        format: {
          type: Type.STRING,
          description: '"png", "jpg", or "webp". Defaults to "png".',
        },
      },
    },
  },
  {
    name: 'filter_or_palette_image',
    description:
      'Apply studio color filters (grayscale/black-and-white, vintage sepia, vivid contrast, crisp sharpen, brightness, blur) and/or extract the dominant hex color palette from attached or pipeline images.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        preset: {
          type: Type.STRING,
          description: 'Optional preset: "bw" (grayscale), "vintage" (sepia), "vivid", "crisp", or "none".',
        },
        grayscale: { type: Type.NUMBER, description: '0 to 100 percent.' },
        sepia: { type: Type.NUMBER, description: '0 to 100 percent.' },
        brightness: { type: Type.NUMBER, description: '50 to 180 percent (100 normal).' },
        contrast: { type: Type.NUMBER, description: '50 to 180 percent (100 normal).' },
        saturate: { type: Type.NUMBER, description: '0 to 200 percent (100 normal).' },
        blur: { type: Type.NUMBER, description: '0 to 10 pixels.' },
        sharpen: { type: Type.BOOLEAN, description: 'Apply crisp sharpen kernel.' },
        extractPalette: {
          type: Type.BOOLEAN,
          description: 'Set true to extract top 6 dominant hex color swatches from the image.',
        },
        format: {
          type: Type.STRING,
          description: '"png", "jpg", or "webp". Defaults to "png".',
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
            'Optional PDF/Office sub-tool ID when view is "tools" (e.g. "pdf-compress", "pdf-to-word", "word-to-pdf", "ppt-to-pdf", "ppt-to-image", "excel-to-pdf", "excel-to-image", "pdf-to-excel", "pdf-to-ppt", "pdf-merge", "pdf-split", "image-to-pdf", "pdf-add-images", "pdf-watermark-remove", "pdf-watermark-add", "pdf-organize", "pdf-sign", "pdf-edit", "pdf-protect", "pdf-to-image").',
        },
        imageTool: {
          type: Type.STRING,
          description:
            'Optional Image sub-tool ID when view is "image-tools" (e.g. "bg-remove", "bulk-bg-remove", "watermark-remove", "blur-redact", "grid-collage", "pdf-to-image", "resize", "convert", "crop", "compress", "filters").',
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'solve_document_ai',
    description:
      'AI Document Solver for attached Lab Manuals, Worksheets, Assignments, or Question Papers (PDF, Word, or Images). Automatically fills empty table cells, blank answer lines, and schematic SVG diagrams directly in-place in the same format OR attaches clean separate Authentic Answer Sheet pages for Question Papers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description:
            '"auto" (default: auto-detects lab manual with blanks vs question paper), "fill-in-place" (write answers & diagrams directly inside blank fields), or "separate-answer-sheet" (keep original paper and attach separate authentic answer pages).',
        },
        inkStyle: {
          type: Type.STRING,
          description:
            '"blue-ink" (default authentic pen/academic blue ink for in-place fills) or "black" (crisp dark black ink).',
        },
        instruction: {
          type: Type.STRING,
          description:
            'Exact user instruction or focus notes (e.g., "solve review questions and complete observation table, draw circuit diagram if missing").',
        },
      },
    },
  },
];

export async function executePaperLinkChat(
  body: ChatRequestBody
): Promise<{ status: number; payload: Record<string, any> }> {
  if (body && body.action === 'solve-document') {
    return executeDocumentSolve(body as unknown as SolveDocumentRequest);
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 500,
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
    const previousOutputsSummary = Array.isArray(body.previousOutputsSummary)
      ? body.previousOutputsSummary
      : [];
    const inlineImages = Array.isArray(body.inlineImages) ? body.inlineImages : [];

    if (!userMessage && attachedSummary.length === 0) {
      return {
        status: 400,
        payload: { error: 'Message or file attachment is required.' },
      };
    }

    const speedMode = body.speedMode === 'fast' ? 'fast' : 'balanced';
    const isGenuineMultiStep =
      attachedSummary.length > 1 ||
      userMessage.length > 95 ||
      /\b(and then|and also|after that|afterwards|first[, ]+then|finally|both|all of them|and\s+(?:compress|merge|stamp|rotate|protect|lock|encrypt|crop|resize|convert|remove))\b/i.test(
        userMessage
      ) ||
      (userMessage.match(/,/g) || []).length >= 2;

    const primaryModel =
      speedMode === 'fast' || !isGenuineMultiStep
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
    if (previousOutputsSummary.length > 0) {
      const prevList = previousOutputsSummary
        .map(
          (f, idx) =>
            `${idx + 1}. "${f.name}" (.${f.extension}, ${Math.max(1, Math.round(f.sizeBytes / 1024))} KB)`
        )
        .join('\n');
      contextLines.push(
        `[Previously Generated Outputs in This Chat (automatically reused if user asks a follow-up tool command without attaching a new file):\n${prevList}]`
      );
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

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const getErrorStatus = (err: any): number | undefined => {
      if (typeof err?.status === 'number') return err.status;
      if (typeof err?.code === 'number') return err.code;
      const msg = String(err?.message || '');
      if (/\b503\b|UNAVAILABLE/i.test(msg)) return 503;
      if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return 429;
      if (/\b504\b|DEADLINE_EXCEEDED/i.test(msg)) return 504;
      if (/\b502\b/.test(msg)) return 502;
      if (/\b500\b|INTERNAL/i.test(msg)) return 500;
      return undefined;
    };

    const isDailyQuotaError = (err: any): boolean => {
      const msg = String(err?.message || '');
      return /PerDay|GenerateRequestsPerDay|daily/i.test(msg);
    };

    const isFatalAuthError = (err: any): boolean => {
      const code = getErrorStatus(err);
      const msg = String(err?.message || '');
      return (
        code === 401 ||
        code === 403 ||
        /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(msg)
      );
    };

    const formatFriendlyGeminiError = (err: any): { status: number; message: string } => {
      const code = getErrorStatus(err);
      const raw = String(err?.message || '');
      if (isFatalAuthError(err)) {
        return {
          status: 400,
          message:
            'Your Gemini API key is invalid or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.',
        };
      }
      if (code === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw)) {
        const retryMatch = raw.match(/retry in\s+([0-9hms.]+)/i);
        const retryNote = retryMatch ? ` Retry window: ${retryMatch[1]}.` : '';
        return {
          status: 429,
          message: isDailyQuotaError(err)
            ? `Free-tier daily Gemini API quota reached.${retryNote} You can use a billing-enabled API key in Settings > Secrets for higher limits.`
            : `Gemini API rate limit reached momentarily.${retryNote} Please wait a few seconds and try again.`,
        };
      }
      if (code === 503 || /UNAVAILABLE|high demand|overloaded/i.test(raw)) {
        return {
          status: 500,
          message:
            'Gemini AI servers are experiencing a brief traffic spike (HTTP 503). Please wait a few seconds and try again.',
        };
      }
      if (code === 504 || /timed out/i.test(raw)) {
        return {
          status: 500,
          message: 'The AI request timed out under load. Please try again in a moment.',
        };
      }
      // Strip raw embedded JSON payloads from error messages
      const jsonIdx = raw.indexOf('{');
      if (jsonIdx >= 0) {
        try {
          const parsedErr = JSON.parse(raw.slice(jsonIdx));
          const clean = parsedErr?.error?.message;
          if (typeof clean === 'string' && clean.trim()) {
            return { status: code === 400 ? 400 : 500, message: clean.trim() };
          }
        } catch {
          // ignore parse errors
        }
      }
      return {
        status: code === 400 ? 400 : 500,
        message: raw || 'Unable to process chat request with Gemini.',
      };
    };

    const withChatTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms
        );
        promise.then(
          (val) => {
            clearTimeout(timer);
            resolve(val);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          }
        );
      });

    // Preserve gemini-4-hydrogen's stricter free-tier RPD quota by preferring gemini-3.1-flash-lite first
    // unless multi-step planning is needed, and skip retrying any model whose daily quota is exhausted.
    const candidateAttempts: Array<{ model: string; level: ThinkingLevel; timeoutMs: number }> =
      primaryModel === 'gemini-4-hydrogen'
        ? [
            { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, timeoutMs: 14000 },
            { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.LOW, timeoutMs: 14000 },
            { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, timeoutMs: 14000 },
          ]
        : [
            { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, timeoutMs: 12000 },
            { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, timeoutMs: 13000 },
            { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, timeoutMs: 15000 },
          ];

    let response: Awaited<ReturnType<ReturnType<typeof ai.chats.create>['sendMessage']>> | null =
      null;
    let activeModel = primaryModel;
    let lastErr: unknown = null;
    const dailyExhaustedModels = new Set<string>();

    for (let idx = 0; idx < candidateAttempts.length; idx++) {
      const attempt = candidateAttempts[idx];
      if (dailyExhaustedModels.has(attempt.model)) {
        continue;
      }
      try {
        const chat = ai.chats.create({
          model: attempt.model,
          history: formattedHistory,
          config: {
            systemInstruction: PAPERLINK_SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: PAPERLINK_TOOL_DECLARATIONS }],
            thinkingConfig: {
              thinkingLevel: attempt.level,
            },
          },
        });

        response = await withChatTimeout(
          chat.sendMessage({ message: messageParts }),
          attempt.timeoutMs,
          attempt.model
        );
        activeModel = attempt.model;
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (isFatalAuthError(err)) {
          throw err;
        }
        if (isDailyQuotaError(err)) {
          dailyExhaustedModels.add(attempt.model);
        }
        const status = getErrorStatus(err);
        // Back off gently before retrying high-demand 503 or transient errors
        const backoffMs = status === 503 ? 1100 + idx * 600 : 400;
        if (idx < candidateAttempts.length - 1) {
          await sleep(backoffMs);
        }
      }
    }

    if (!response) {
      const formatted = formatFriendlyGeminiError(lastErr);
      return {
        status: formatted.status,
        payload: { error: formatted.message },
      };
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
    const msg = String(err?.message || '');
    const isQuota = /\b429\b|RESOURCE_EXHAUSTED/i.test(msg);
    const isDemand = /\b503\b|UNAVAILABLE|high demand|overloaded/i.test(msg);
    const cleanMsg = isQuota
      ? 'Free-tier daily Gemini API quota reached. Wait a moment for limits to reset or attach a billing-enabled API key in Settings > Secrets.'
      : isDemand
      ? 'Gemini AI servers are experiencing temporary high demand (HTTP 503). Please try again in a few seconds.'
      : msg.includes('{')
      ? 'Gemini AI request could not be completed right now. Please try again.'
      : msg || 'Unable to process chat request with Gemini.';
    return {
      status: isQuota ? 429 : err?.status === 400 ? 400 : 500,
      payload: { error: cleanMsg },
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
