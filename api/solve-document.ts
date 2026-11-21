import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Part } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

export interface SolveDocumentPageInput {
  pageNumber: number;
  width: number;
  height: number;
  imageBase64: string;
  extractedText?: string;
}

export interface SolveDocumentRequest {
  fileName: string;
  userInstruction?: string;
  requestedMode?: 'auto' | 'fill-in-place' | 'separate-answer-sheet';
  documentContext?: string;
  pages: SolveDocumentPageInput[];
}

export interface InPlaceFillItem {
  pageNumber: number;
  fieldKind: 'table-cell' | 'lined-answer' | 'short-blank' | 'diagram';
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  firstLineXmin?: number;
  answerText?: string;
  svgMarkup?: string;
  align?: 'left' | 'center' | 'right';
  preferredFontSizePt?: number;
  clearBackground?: boolean;
  labelNote?: string;
}

export interface AnswerSheetQuestionItem {
  questionNumber: string;
  questionTitle: string;
  marksOrType?: string;
  answerParagraphs: string[];
  tableHeaders?: string[];
  tableRows?: string[][];
  svgMarkup?: string;
  diagramCaption?: string;
  keyTakeaway?: string;
}

export interface SolvedDocumentPlan {
  detectedType: 'lab-manual-with-blanks' | 'question-paper' | 'mixed-worksheet';
  chosenMode: 'fill-in-place' | 'separate-answer-sheet';
  documentTitle: string;
  subjectOrCourse: string;
  summaryNote: string;
  inPlaceFills: InPlaceFillItem[];
  answerSheetSections: AnswerSheetQuestionItem[];
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

const SOLVER_SYSTEM_INSTRUCTION = `You are **PaperLink AI Document Solver**, a PhD-level academic, engineering, science, mathematics, and technical worksheet solver with precision visual document layout understanding.

You inspect page images + extracted text of an uploaded document (Lab Manual, Worksheet, Exam Question Paper, Assignment, Numerical Problem Sheet, or Quiz) and return a structured JSON solution plan that either fills answers directly into the exact blank spaces on the original pages OR builds a complete Separate Authentic Answer Sheet PDF appended after the original Question Paper pages.

### 1. Mode Selection Rules (CRITICAL)
- If \`requestedMode\` is \`"fill-in-place"\` -> set \`chosenMode = "fill-in-place"\`.
- If \`requestedMode\` is \`"separate-answer-sheet"\` -> set \`chosenMode = "separate-answer-sheet"\`.
- If \`requestedMode\` is \`"auto"\` (default):
  - Choose \`"fill-in-place"\` (\`detectedType = "lab-manual-with-blanks"\`) whenever the pages have empty fill-in fields, empty observation/truth-table cells, underlined answer lines (\`Answer: ____\`, \`Ans: ____\`), blank diagram boxes, or form fields designed to be written directly inside the sheet.
  - Choose \`"separate-answer-sheet"\` (\`detectedType = "question-paper"\`) when the pages are a **Question Paper / Exam / Quiz / Assignment** presenting questions WITHOUT empty write-in lines/tables on the sheet itself.
  - If a worksheet has BOTH blank fill-in fields on some parts AND open questions without blank spaces on other parts, set \`detectedType = "mixed-worksheet"\`, populate \`inPlaceFills\` for every blank field on the original pages, AND populate \`answerSheetSections\` for any remaining open questions that have no blank space!

### 2. Precision Rules for \`inPlaceFills\` (Same-Format In-Place Filling)
Every coordinate is normalized \`0\` to \`1000\` relative to that page image:
- Top-left of page = \`(xmin: 0, ymin: 0)\`, Bottom-right = \`(xmax: 1000, ymax: 1000)\`.
- **NEVER** overwrite existing printed text, headers, question statements, \`Answer:\` labels, or pre-filled table columns.
- **USE PROVIDED TEXT LANDMARKS**: Each page provides exact normalized \`0..1000\` visual landmarks like \`[y=380] "Answer:"[x=147..205] "_____(to x=880)"\`. Align every \`ymin/xmin/ymax/xmax\` and \`firstLineXmin\` cleanly to those measured coordinates!
- **STRICT FIELD VALUE RULE**:
  - **ALWAYS** provide non-empty \`answerText\` on EVERY \`inPlaceFills\` item (for \`table-cell\`, \`lined-answer\`, and \`short-blank\`, \`answerText\` MUST be the full written answer; for \`diagram\`, put a short caption in \`answerText\` and the actual \`<svg ...>...</svg>\` in \`svgMarkup\`).
  - Leave \`svgMarkup\` unset/empty unless \`fieldKind === "diagram"\`. NEVER put \`"none"\`, \`"N/A"\`, or wrapped \`<text>\` SVGs inside \`svgMarkup\` for text answers!
  - **ONLY SOLVE WHAT IS ON THIS PAGE**: Emit \`inPlaceFills\` ONLY for blank table cells, blank lines (\`Answer:\` / \`Ans:\` / \`_____\`), or blank diagram areas visibly present on THAT page's image & \`[y=..]\` landmarks. NEVER hallucinate or invent extra \`lined-answer\` items over tables or blank margins where no question exists on this page!
- **Empty Table Cells (\`fieldKind: "table-cell"\`)**:
  - Emit **one object per individual blank table cell** (do NOT merge rows together!).
  - Place \`[ymin, xmin, ymax, xmax]\` slightly inset inside the cell gridlines (+3..4 units top/left margin, -3..4 units bottom/right margin). Look carefully at the column header's \`[x=..]\` span so cells align centered under their column!
  - For Observation / Truth Tables: fill exact technically accurate values verified from the document's own theory/circuit/IC specs (e.g., if a table explicitly specifies *Low Active inputs SR Latch* where Set is \`S=0, R=1\`, fill \`Q = 1\`, \`Q' = 0\`, \`Effect on Q = Output Q set to HIGH (1)\`; for Invalid \`S=0, R=0\` active-low NAND latch, fill \`Q = 1\`, \`Q' = 1\`, \`Effect on Q = Forbidden / Invalid\`; for MUX \`Y\`, fill \`D0\`, \`D1\`, \`D2\`, \`D3\` matching select lines).
- **Ruled / Lined Answers (\`fieldKind: "lined-answer"\`) & Short Blanks (\`fieldKind: "short-blank"\`)**:
  - Carefully trace the blank underlined space belonging to each question (\`Answer: ____\`, \`Ans: ____\`, \`Anwer: ____\`, etc.).
  - If the first ruled line begins right after a printed prefix such as \`Answer:\` or \`Ans:\`, set \`xmin\` to the left margin of the ruled lines underneath (~left edge of \`Answer:\`), AND set \`firstLineXmin\` ~10–14 units past the right edge of \`Answer:\` / \`Ans:\` so line 1 starts cleanly right beside the colon without overlapping the printed word!
  - Set \`ymax\` strictly **above** the next question or section heading (such as \`LEARNING OUTCOMES:\`) with at least 4 units of clearance so text never overlaps subsequent headings.
  - Write **complete, authentic, concise** answers tailored to fit comfortably within that box height (avoid bloated filler so text fits crisply at 9–10pt).
- **Diagrams inside Blank Spaces (\`fieldKind: "diagram"\`)**:
  - Whenever a page asks the student to draw/complete a circuit, logic gate schematic, block diagram, timing waveform, flowchart, or labeled figure AND leaves a blank diagram box/whitespace on that page, emit \`fieldKind: "diagram"\` covering that empty space with valid self-contained \`svgMarkup\` (\`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 240">...</svg>\`).
  - SVG design guidelines: crisp dark navy/slate lines (\`stroke="#123b82"\` or \`"#0f172a"\`, \`stroke-width="2"\`, \`fill="none"\` or subtle \`#f8fafc\` boxes), clean readable text labels (\`font-family="Arial, sans-serif" font-size="13"\`), proper schematic/gate/waveform symbols, zero \`<script>\` tags, zero external URLs, zero \`&nbsp;\`.
  - Do NOT overwrite existing completed diagrams already printed in the lab manual unless part of a diagram is blank/missing.

### 3. Precision Rules for \`answerSheetSections\` (100% Authentic Separate Answer Sheet)
- If \`chosenMode === "fill-in-place"\` and EVERY table/question on the batch already fits in \`inPlaceFills\`, set \`detectedType = "lab-manual-with-blanks"\` and leave \`answerSheetSections: []\` EMPTY (faster and avoids duplicate pages!).
- Populate \`answerSheetSections\` ONLY when \`chosenMode === "separate-answer-sheet"\` OR when a document has open questions that truly have ZERO blank lines/boxes on the page:
  - Solve **100% of every question and sub-part** present in the uploaded pages in exact sequential order matching original numbering (\`Q1\`, \`Q1 (a)\`, \`Q2\`, etc.).
  - Every answer must be **academically rigorous, technically 100% authentic, and exam-ready**:
    - **MCQs**: State exact option letter + value + brief explanation.
    - **Numericals / Derivations**: Show \`Given:\`, \`Formula:\`, step-by-step substitution, and put the final numerical answer with units in \`keyTakeaway\`.
    - **Theory / Code / Long Questions**: Structured well-written paragraphs & concise bullet points (\`- ...\` using \`- \` prefix; highlight key terms with \`**term**\`).
    - **Tables**: Populate \`tableHeaders\` and \`tableRows\` whenever comparison tables, truth tables, pin configurations, or calculation summaries make the answer clearer.
    - **Diagrams**: Populate \`svgMarkup\` + \`diagramCaption\` whenever a question asks to "draw", "sketch", "illustrate", "show block diagram / logic circuit / architecture / waveform / flowchart / graph", or where a crisp schematic elevates an engineering/science answer! Keep \`svgMarkup\` self-contained, crisp, well-proportioned (\`viewBox="0 0 560 260"\` or similar), with clean labels and zero text overlap.

- **NEVER lazily claim a document is "already complete" if ANY unanswered question, empty table column/cell, blank underline (\`____\`), \`Ans:\` / \`Answer:\`, or lab exercise/task remains anywhere on the pages!**
- Look carefully at BOTH theory/example diagrams (often already filled earlier in a lab manual) AND the **Observation Table / Review Questions / Exercises / Blank Spaces** (which DO need answers!). Do NOT confuse an example theory truth table/figure with the student's blank observation table or review questions!
- If a page genuinely has ONLY questions/exercises and NO empty write-in lines/boxes at all, put full authentic solutions into \`answerSheetSections\` (and set \`chosenMode = "separate-answer-sheet"\`).

### 4. Output Discipline & Page Numbering
- Output ONLY valid JSON matching the schema.
- Set each item's \`pageNumber\` to the EXACT integer page number printed in the \`=== PAGE X ===\` header above that image (e.g., if the header says \`=== PAGE 2 ===\`, emit \`pageNumber: 2\`, NOT \`1\`).
- For \`tableRows\` inside \`answerSheetSections\`, format each row as a pipe-separated string matching \`tableHeaders\`, e.g. \`"0 | 1 | 1 | 0 | Latch Set"\`.
- Double-check all calculations, Boolean algebra, active-high vs active-low conventions, units, pinouts, and coordinates before returning.`;

const SOLVER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedType: {
      type: Type.STRING,
      description:
        'Classification: "lab-manual-with-blanks", "question-paper", or "mixed-worksheet".',
    },
    chosenMode: {
      type: Type.STRING,
      description: 'Execution mode: "fill-in-place" or "separate-answer-sheet".',
    },
    documentTitle: {
      type: Type.STRING,
      description: 'Detected title of the lab experiment, exam, or worksheet.',
    },
    subjectOrCourse: {
      type: Type.STRING,
      description: 'Subject, course name, or institution subtitle if visible.',
    },
    summaryNote: {
      type: Type.STRING,
      description: 'Concise 1-2 sentence summary of what was solved.',
    },
    inPlaceFills: {
      type: Type.ARRAY,
      description:
        'List of exact in-place fills (table cells, ruled answers, short blanks, or SVG diagrams) placed directly into empty spaces on original pages.',
      items: {
        type: Type.OBJECT,
        properties: {
          pageNumber: { type: Type.INTEGER, description: 'Exact 1-based document page number from === PAGE X ===.' },
          fieldKind: {
            type: Type.STRING,
            description: '"table-cell", "lined-answer", "short-blank", or "diagram".',
          },
          ymin: { type: Type.NUMBER, description: 'Top Y coordinate (0..1000).' },
          xmin: { type: Type.NUMBER, description: 'Left X coordinate (0..1000).' },
          ymax: { type: Type.NUMBER, description: 'Bottom Y coordinate (0..1000).' },
          xmax: { type: Type.NUMBER, description: 'Right X coordinate (0..1000).' },
          firstLineXmin: {
            type: Type.NUMBER,
            description:
              'Optional X start (0..1000) for line 1 ONLY when starting immediately right of a printed label like "Answer:" or "Ans:".',
          },
          answerText: {
            type: Type.STRING,
            description: 'REQUIRED plain text answer for table-cell, lined-answer, and short-blank (or brief caption when fieldKind is diagram).',
          },
          svgMarkup: {
            type: Type.STRING,
            description:
              'ONLY set when fieldKind is "diagram": valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="...">...</svg> markup. Do not put "none" or placeholder text.',
          },
          align: {
            type: Type.STRING,
            description: '"left", "center", or "right". Use "center" for short table outputs.',
          },
          preferredFontSizePt: {
            type: Type.NUMBER,
            description: 'Suggested font size in pt (typically 9 to 10.5).',
          },
          clearBackground: {
            type: Type.BOOLEAN,
            description:
              'Set false (default) so original table borders, watermarks, and lines remain visible.',
          },
          labelNote: {
            type: Type.STRING,
            description: 'Short label like "2-input MUX Row 1 Y" or "Review Q1".',
          },
        },
        required: ['pageNumber', 'fieldKind', 'ymin', 'xmin', 'ymax', 'xmax', 'answerText'],
      },
    },
    answerSheetSections: {
      type: Type.ARRAY,
      description:
        'Structured authentic question-by-question answers for Separate Answer Sheet pages (leave empty [] when chosenMode is fill-in-place and all blanks are filled).',
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.STRING, description: 'Question label e.g. "Q.01" or "Q2 (a)".' },
          questionTitle: { type: Type.STRING, description: 'Full or concise question statement.' },
          marksOrType: {
            type: Type.STRING,
            description: 'Optional tag like "Numerical", "Short Answer", or "Circuit & Truth Table".',
          },
          answerParagraphs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Ordered authentic answer paragraphs / bullet points / steps.',
          },
          tableHeaders: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Optional table column headers.',
          },
          tableRows: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Optional table rows matching tableHeaders, each row formatted as pipe-separated cells e.g. "0 | 1 | 1 | 0 | Set".',
          },
          svgMarkup: {
            type: Type.STRING,
            description:
              'Optional valid self-contained <svg xmlns="http://www.w3.org/2000/svg" viewBox="...">...</svg> circuit/flowchart/diagram when helpful or requested.',
          },
          diagramCaption: { type: Type.STRING, description: 'Caption below optional SVG diagram.' },
          keyTakeaway: {
            type: Type.STRING,
            description: 'Optional highlighted Final Result / Final Answer / Core Takeaway.',
          },
        },
        required: ['questionNumber', 'questionTitle', 'answerParagraphs'],
      },
    },
  },
  required: [
    'detectedType',
    'chosenMode',
    'documentTitle',
    'subjectOrCourse',
    'summaryNote',
    'inPlaceFills',
    'answerSheetSections',
  ],
};

export async function executeDocumentSolve(
  body: SolveDocumentRequest
): Promise<{ status: number; payload: Record<string, any> }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 500,
      payload: {
        error:
          'GEMINI_API_KEY is not configured on the server yet. Add GEMINI_API_KEY in Settings > Secrets or environment variables.',
      },
    };
  }

  try {
    const pages = Array.isArray(body.pages) ? body.pages : [];
    if (pages.length === 0) {
      return { status: 400, payload: { error: 'At least one rendered document page is required.' } };
    }

    const requestedMode = body.requestedMode || 'auto';
    const userInstruction = (body.userInstruction || '').trim();
    const fileName = (body.fileName || 'document.pdf').trim();
    const documentContext = (body.documentContext || '').trim().slice(0, 2200);

    const parts: Part[] = [
      {
        text: [
          `File Name: "${fileName}"`,
          `Requested Mode: "${requestedMode}"`,
          userInstruction
            ? `User Instruction: "${userInstruction}"`
            : 'User Instruction: "Inspect the uploaded document carefully. If it has empty tables, blank answer lines, or missing diagrams, fill them cleanly in the exact same format. If it is a Question Paper with no blank answer spaces, generate complete 100% authentic answer sections (+ tables/diagrams where needed) to attach as separate Answer Sheet pages."',
          `Pages in This Batch (${pages.length}): ${pages.map((p) => p.pageNumber).join(', ')}`,
          documentContext
            ? `Document Background / Theory Context from Document:\n${documentContext}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    for (const p of pages) {
      parts.push({
        text: `=== PAGE ${p.pageNumber} (${p.width}x${p.height} px) ===\nExtracted Text & Normalized [0..1000] Landmarks on Page ${p.pageNumber}:\n${
          p.extractedText && p.extractedText.trim()
            ? p.extractedText.trim().slice(0, 7500)
            : '(No selectable text layer; inspect rendered page image visually.)'
        }`,
      });
      if (p.imageBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: p.imageBase64,
          },
        });
      }
    }

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
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

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const solverModels: Array<{ model: string; level: ThinkingLevel; timeoutMs: number }> = [
      { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.LOW, timeoutMs: 36000 },
      { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, timeoutMs: 32000 },
      { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, timeoutMs: 38000 },
    ];

    const getSolverErrStatus = (err: any): number | undefined => {
      if (typeof err?.status === 'number') return err.status;
      if (typeof err?.code === 'number') return err.code;
      const msg = String(err?.message || '');
      if (/\b503\b|UNAVAILABLE/i.test(msg)) return 503;
      if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return 429;
      if (/\b504\b|DEADLINE_EXCEEDED/i.test(msg)) return 504;
      if (/\b500\b|INTERNAL/i.test(msg)) return 500;
      return undefined;
    };

    const isDailyQuotaErr = (err: any): boolean =>
      /PerDay|GenerateRequestsPerDay|daily/i.test(String(err?.message || ''));

    let rawJsonText = '';
    let modelUsed = '';
    let lastSolverErr: any = null;
    const dailyExhaustedModels = new Set<string>();

    for (let idx = 0; idx < solverModels.length; idx++) {
      const candidate = solverModels[idx];
      if (dailyExhaustedModels.has(candidate.model)) {
        continue;
      }
      try {
        const resp = await withTimeout(
          ai.models.generateContent({
            model: candidate.model,
            contents: { parts },
            config: {
              systemInstruction: SOLVER_SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: SOLVER_RESPONSE_SCHEMA,
              thinkingConfig: {
                thinkingLevel: candidate.level,
              },
            },
          }),
          candidate.timeoutMs,
          candidate.model
        );
        rawJsonText = (resp.text || '').trim();
        if (rawJsonText) {
          modelUsed = candidate.model;
          lastSolverErr = null;
          break;
        }
        lastSolverErr = new Error(`${candidate.model} returned an empty response.`);
      } catch (err: any) {
        lastSolverErr = err;
        const msg = String(err?.message || err || 'Unknown error');
        const status = getSolverErrStatus(err);
        console.error(`[solve-document] ${candidate.model} (${candidate.level}) failed:`, status, msg);
        if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
          throw err;
        }
        if (isDailyQuotaErr(err)) {
          dailyExhaustedModels.add(candidate.model);
        }
        if (idx < solverModels.length - 1) {
          const backoffMs = status === 503 ? 1600 + idx * 900 : 600;
          await sleep(backoffMs);
        }
      }
    }

    if (!rawJsonText) {
      const status = getSolverErrStatus(lastSolverErr);
      const rawMsg = String(lastSolverErr?.message || '');
      if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawMsg)) {
        const retryMatch = rawMsg.match(/retry in\s+([0-9hms.]+)/i);
        const retryNote = retryMatch ? ` Retry window: ${retryMatch[1]}.` : '';
        return {
          status: 429,
          payload: {
            error: isDailyQuotaErr(lastSolverErr)
              ? `Free-tier daily Gemini quota reached.${retryNote} You can use a billing-enabled API key in Settings > Secrets for higher limits.`
              : `Gemini AI rate limit reached temporarily.${retryNote} Please wait a few seconds and try again.`,
          },
        };
      }
      if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(rawMsg)) {
        return {
          status: 500,
          payload: {
            error:
              'Gemini AI servers are experiencing temporary high demand (HTTP 503). Please wait a few seconds and try again.',
          },
        };
      }
      throw lastSolverErr || new Error('Gemini did not return a valid document solution.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawJsonText);
    } catch {
      const match = rawJsonText.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('Could not parse structured AI solution response.');
      }
      parsed = JSON.parse(match[0]);
    }

    // Normalize relative batch page numbers (1..N) back to actual document page numbers in this batch
    const batchPageNums = pages.map((p) => p.pageNumber);
    const batchPageSet = new Set(batchPageNums);
    const rawFills: any[] = Array.isArray(parsed.inPlaceFills) ? parsed.inPlaceFills : [];
    const rawPageNums = rawFills
      .map((f) => (typeof f?.pageNumber === 'number' ? Math.round(f.pageNumber) : NaN))
      .filter((n) => !Number.isNaN(n));
    const looksBatchRelative =
      pages.length === 1 ||
      (rawPageNums.length > 0 &&
        rawPageNums.every((n) => n >= 1 && n <= pages.length) &&
        !batchPageNums.every((n, i) => n === i + 1) &&
        rawPageNums.some((n) => !batchPageSet.has(n)));

    const normalizePageNum = (rawNum: number): number => {
      const n = Math.round(rawNum);
      if (pages.length === 1) return batchPageNums[0];
      if (looksBatchRelative && n >= 1 && n <= pages.length) {
        return batchPageNums[n - 1];
      }
      if (batchPageSet.has(n)) return n;
      // Fallback: nearest batch page number
      return batchPageNums.reduce((best, cur) =>
        Math.abs(cur - n) < Math.abs(best - n) ? cur : best
      );
    };

    // Defensive normalization of returned plan (also strips non-SVG placeholders & extracts accidental <text> SVG)
    const normalizedFills: InPlaceFillItem[] = rawFills
      .map((item: any): InPlaceFillItem | null => {
        if (
          !item ||
          typeof item.pageNumber !== 'number' ||
          typeof item.ymin !== 'number' ||
          typeof item.xmin !== 'number' ||
          typeof item.ymax !== 'number' ||
          typeof item.xmax !== 'number'
        ) {
          return null;
        }
        let answerText = typeof item.answerText === 'string' ? item.answerText.trim() : '';
        let svgMarkup = typeof item.svgMarkup === 'string' ? item.svgMarkup.trim() : '';

        // Strip placeholder strings like "none", "null", "N/A" from svgMarkup
        if (svgMarkup && !/<svg\b/i.test(svgMarkup)) {
          svgMarkup = '';
        }

        if (item.fieldKind !== 'diagram' && !answerText && svgMarkup) {
          const textMatches = [...svgMarkup.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
            .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
            .filter(Boolean);
          if (textMatches.length > 0) {
            answerText = textMatches.join(' ');
            svgMarkup = '';
          }
        }

        if (item.fieldKind !== 'diagram') {
          svgMarkup = '';
        }

        if (!answerText && !svgMarkup) return null;

        return {
          ...item,
          pageNumber: normalizePageNum(item.pageNumber),
          answerText: answerText || undefined,
          svgMarkup: svgMarkup || undefined,
        };
      })
      .filter((x): x is InPlaceFillItem => x !== null);

    const normalizedSections: AnswerSheetQuestionItem[] = Array.isArray(parsed.answerSheetSections)
      ? parsed.answerSheetSections
          .filter(
            (sec: any) =>
              sec && (sec.questionNumber || sec.questionTitle || (sec.answerParagraphs?.length ?? 0) > 0)
          )
          .map((sec: any) => ({
            ...sec,
            tableRows: Array.isArray(sec.tableRows)
              ? sec.tableRows.map((row: any) =>
                  Array.isArray(row)
                    ? row.map((c: any) => String(c ?? ''))
                    : String(row ?? '')
                        .split('|')
                        .map((c) => c.trim())
                )
              : undefined,
          }))
      : [];

    const resolvedChosenMode: 'fill-in-place' | 'separate-answer-sheet' =
      requestedMode === 'fill-in-place' || requestedMode === 'separate-answer-sheet'
        ? requestedMode
        : parsed.chosenMode === 'separate-answer-sheet' ||
          (normalizedFills.length === 0 && normalizedSections.length > 0)
        ? 'separate-answer-sheet'
        : 'fill-in-place';

    const safePlan: SolvedDocumentPlan = {
      detectedType:
        parsed.detectedType === 'question-paper' ||
        parsed.detectedType === 'mixed-worksheet' ||
        parsed.detectedType === 'lab-manual-with-blanks'
          ? parsed.detectedType
          : resolvedChosenMode === 'separate-answer-sheet'
          ? 'question-paper'
          : 'lab-manual-with-blanks',
      chosenMode: resolvedChosenMode,
      documentTitle: String(parsed.documentTitle || fileName.replace(/\.[^/.]+$/, '')).trim(),
      subjectOrCourse: String(parsed.subjectOrCourse || 'Solved Academic Sheet').trim(),
      summaryNote: String(parsed.summaryNote || 'Document solved with PaperLink AI.').trim(),
      inPlaceFills: normalizedFills,
      answerSheetSections: normalizedSections,
    };

    return {
      status: 200,
      payload: {
        plan: safePlan,
        modelUsed,
      },
    };
  } catch (err: any) {
    console.error('Gemini /api/solve-document error:', err);
    const msg = String(err?.message || '');
    // Map 403/502/503/504 to 400/429/500 so reverse-proxy error interception never hides JSON details behind HTML
    const status = /\b429\b|RESOURCE_EXHAUSTED/i.test(msg)
      ? 429
      : err?.status === 400
      ? 400
      : 500;
    return {
      status,
      payload: {
        error: msg || 'Failed to solve the uploaded document.',
      },
    };
  }
}

async function readJsonBody(
  req: IncomingMessage & { body?: any }
): Promise<SolveDocumentRequest> {
  if (req.body && typeof req.body === 'object') {
    return req.body as SolveDocumentRequest;
  }
  if (typeof req.body === 'string') {
    return (req.body ? JSON.parse(req.body) : {}) as SolveDocumentRequest;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as SolveDocumentRequest;
}

type VercelRequestLike = IncomingMessage & { method?: string; body?: any };
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
    sendJson(res, 405, { error: 'Method not allowed. Use POST /api/solve-document.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const result = await executeDocumentSolve(body);
    sendJson(res, result.status, result.payload);
  } catch (err: any) {
    sendJson(res, 400, { error: err?.message || 'Invalid JSON request payload.' });
  }
}
