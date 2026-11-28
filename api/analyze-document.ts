import { GoogleGenAI, Type } from '@google/genai';
import type { FontStyle } from '../src/types';

export interface AnalyzeDocumentRequest {
  fileName?: string;
  extractedTitle?: string;
  documentText?: string;
  pageCount?: number;
}

export interface AnalyzeDocumentResponse {
  category:
    | 'Academic / Lab Report'
    | 'Thesis & Research'
    | 'Engineering & Technical'
    | 'Corporate & Executive'
    | 'Financial & Invoice'
    | 'Legal & Compliance'
    | 'Proposal & Pitch'
    | 'Resume & Portfolio'
    | 'General Document';
  suggestedThemeId: string;
  suggestedFont: FontStyle;
  primaryColor: string;
  accentColor: string;
  title: string;
  subtitle: string;
  summary: string;
  source: 'gemini' | 'heuristic';
  confidenceNote: string;
}

const VALID_THEME_PRESETS: Record<
  string,
  { themeId: string; font: FontStyle; primaryColor: string; accentColor: string }
> = {
  'Academic / Lab Report': {
    themeId: 'academic-thesis',
    font: 'merriweather',
    primaryColor: '#1e3a8a',
    accentColor: '#ca8a04',
  },
  'Thesis & Research': {
    themeId: 'crimson-gazette',
    font: 'playfair',
    primaryColor: '#7f1d1d',
    accentColor: '#d97706',
  },
  'Engineering & Technical': {
    themeId: 'technical-blueprint',
    font: 'space',
    primaryColor: '#0c4a6e',
    accentColor: '#0284c7',
  },
  'Corporate & Executive': {
    themeId: 'executive-horizon',
    font: 'inter',
    primaryColor: '#0f172a',
    accentColor: '#2563eb',
  },
  'Financial & Invoice': {
    themeId: 'emerald-chronicle',
    font: 'montserrat',
    primaryColor: '#064e3b',
    accentColor: '#10b981',
  },
  'Legal & Compliance': {
    themeId: 'legal-governance',
    font: 'playfair',
    primaryColor: '#111827',
    accentColor: '#991b1b',
  },
  'Proposal & Pitch': {
    themeId: 'official-ribbon-seal',
    font: 'montserrat',
    primaryColor: '#1e3a8a',
    accentColor: '#d97706',
  },
  'Resume & Portfolio': {
    themeId: 'clean-scandinavian',
    font: 'playfair',
    primaryColor: '#18181b',
    accentColor: '#52525b',
  },
  'General Document': {
    themeId: 'official-dossier-memo',
    font: 'inter',
    primaryColor: '#0f172a',
    accentColor: '#2563eb',
  },
};

function cleanHeadingLine(line: string): string {
  return line
    .replace(/^[\s•*\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeuristicOutline(rawText: string, fileName: string): {
  title: string;
  subtitle: string;
  bullets: string[];
} {
  const cleanName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 120);

  // Extract explicit Lab Tasks, Chapters, Exercises, Sections, Objectives, Parts
  const taskOrSectionRegex =
    /^(lab\s*(?:task|exercise|experiment|work)?\s*#?\d*[:.\-–\s].*|task\s*#?\d+[:.\-–\s].*|experiment\s*#?\d+[:.\-–\s].*|chapter\s+\d+[:.\-–\s].*|section\s+\d+(?:\.\d+)*[:.\-–\s].*|module\s+\d+[:.\-–\s].*|part\s+[A-Z0-9]+[:.\-–\s].*|\d{1,2}[.)]\s+[A-Z].*)$/i;

  const matchedSections: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (taskOrSectionRegex.test(line)) {
      const normalized = cleanHeadingLine(line).slice(0, 88);
      const key = normalized.toLowerCase();
      if (!seen.has(key) && normalized.length >= 5) {
        seen.add(key);
        matchedSections.push(normalized);
      }
      if (matchedSections.length >= 7) break;
    }
  }

  // Fallback: look for short title-case headings inside text
  if (matchedSections.length < 3) {
    for (const line of lines) {
      if (
        line.length >= 6 &&
        line.length <= 64 &&
        !/[.!?]$/.test(line) &&
        /^[A-Z0-9]/.test(line) &&
        line.split(/\s+/).length <= 9
      ) {
        const key = line.toLowerCase();
        if (!seen.has(key) && key !== cleanName.toLowerCase()) {
          seen.add(key);
          matchedSections.push(line);
        }
        if (matchedSections.length >= 6) break;
      }
    }
  }

  // Build title
  const rawTitleCandidate =
    lines.find((l) => l.length >= 4 && l.length <= 68 && !/^page\s+\d+/i.test(l)) || cleanName;
  const title = cleanName.length >= 4 ? cleanName : rawTitleCandidate || 'Document Packet';

  // Detect course / subject / code / lab cue for subtitle
  const combinedLow = `${fileName} ${rawText.slice(0, 3500)}`.toLowerCase();
  const hasLabTasks = /\b(lab\s*task|lab\s*manual|experiment|practical|apparatus|observation|procedure|viva)\b/i.test(
    combinedLow
  );
  const hasAssignment = /\b(assignment|homework|problem\s*set|exercise|rubric|submission)\b/i.test(
    combinedLow
  );
  const hasThesis = /\b(abstract|literature\s*review|methodology|hypothesis|conclusion|references|thesis|dissertation)\b/i.test(
    combinedLow
  );
  const hasCode = /\b(algorithm|api|architecture|database|schema|endpoint|module|source\s*code|python|typescript|c\+\+|java)\b/i.test(
    combinedLow
  );

  let subtitle = 'Comprehensive Document Packet & Index';
  if (hasLabTasks) {
    subtitle = 'Lab Tasks, Practical Exercises & Technical Observations';
  } else if (hasAssignment) {
    subtitle = 'Academic Assignment & Structured Solutions';
  } else if (hasThesis) {
    subtitle = 'Research Analysis, Methodology & Findings';
  } else if (hasCode) {
    subtitle = 'Technical Specification & System Architecture';
  }

  const bullets =
    matchedSections.length > 0
      ? matchedSections
      : rawText
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.replace(/\s+/g, ' ').trim())
          .filter((s) => s.length > 24 && s.length < 130)
          .slice(0, 4);

  return { title, subtitle, bullets };
}

export function analyzeDocumentLocally(req: AnalyzeDocumentRequest): AnalyzeDocumentResponse {
  const fileName = String(req.fileName || '').trim();
  const text = String(req.documentText || '').trim();
  const sample = `${fileName}\n${text.slice(0, 5000)}`.toLowerCase();

  let category: AnalyzeDocumentResponse['category'] = 'General Document';

  if (
    /\b(lab\s*task|lab\s*manual|experiment|semester|course|university|college|department|assignment|quiz|midterm|final\s*exam|student|roll\s*no|instructor|faculty|rubric|syllabus)\b/i.test(
      sample
    )
  ) {
    category = 'Academic / Lab Report';
  } else if (
    /\b(thesis|dissertation|abstract|literature\s*review|methodology|bibliography|citation|journal|research\s*paper|peer\s*review)\b/i.test(
      sample
    )
  ) {
    category = 'Thesis & Research';
  } else if (
    /\b(invoice|receipt|balance\s*sheet|quarterly|fiscal|budget|ledger|audit|tax|payment|subtotal|remittance|revenue|financial)\b/i.test(
      sample
    )
  ) {
    category = 'Financial & Invoice';
  } else if (
    /\b(agreement|contract|nda|clause|jurisdiction|liability|hereby|witnesseth|terms\s*and\s*conditions|compliance|policy|regulation)\b/i.test(
      sample
    )
  ) {
    category = 'Legal & Compliance';
  } else if (
    /\b(architecture|api|deployment|engineering|circuit|schematic|cad|kubernetes|backend|algorithm|benchmark|firmware|software)\b/i.test(
      sample
    )
  ) {
    category = 'Engineering & Technical';
  } else if (
    /\b(proposal|scope\s*of\s*work|deliverables|milestones|pitch|executive\s*summary|roadmap|strategy|quotation|rfp)\b/i.test(
      sample
    )
  ) {
    category = 'Proposal & Pitch';
  } else if (
    /\b(resume|curriculum\s*vitae|experience|education|skills|portfolio|certifications|linkedin)\b/i.test(
      sample
    )
  ) {
    category = 'Resume & Portfolio';
  } else if (
    /\b(board|memorandum|quarterly\s*report|annual\s*report|company|operations|stakeholder|management|kpi)\b/i.test(
      sample
    )
  ) {
    category = 'Corporate & Executive';
  }

  const preset = VALID_THEME_PRESETS[category] || VALID_THEME_PRESETS['General Document'];
  const outline = extractHeuristicOutline(text, fileName);

  let subtitle = outline.subtitle;
  if (category === 'Financial & Invoice') {
    subtitle = 'Statement Breakdown, Line Items & Financial Summary';
  } else if (category === 'Legal & Compliance') {
    subtitle = 'Executed Terms, Covenants & Compliance Schedule';
  } else if (category === 'Proposal & Pitch') {
    subtitle = 'Project Scope, Key Deliverables & Implementation Plan';
  } else if (category === 'Corporate & Executive') {
    subtitle = 'Executive Briefing, Insights & Action Index';
  } else if (category === 'Resume & Portfolio') {
    subtitle = 'Professional Profile, Credentials & Selected Work';
  }

  const formattedBullets =
    outline.bullets.length > 0
      ? outline.bullets.map((b) => `• ${b}`).join('\n')
      : [
          `• Document Type: ${category}`,
          req.pageCount ? `• Total Length: ${req.pageCount} page(s) compiled` : '• Complete compiled document packet',
          '• Formatted for instant executive & print review',
        ].join('\n');

  return {
    category,
    suggestedThemeId: preset.themeId,
    suggestedFont: preset.font,
    primaryColor: preset.primaryColor,
    accentColor: preset.accentColor,
    title: req.extractedTitle?.trim() || outline.title,
    subtitle,
    summary: formattedBullets,
    source: 'heuristic',
    confidenceNote: `Auto-equipped ${category} styling from uploaded content`,
  };
}

export async function executeAnalyzeDocument(req: AnalyzeDocumentRequest): Promise<{
  status: number;
  payload: AnalyzeDocumentResponse;
}> {
  const localFallback = analyzeDocumentLocally(req);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const excerpt = String(req.documentText || '').trim().slice(0, 9000);

  if (!apiKey || (!excerpt && !req.fileName)) {
    return { status: 200, payload: localFallback };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const prompt = [
      'Analyze this uploaded document metadata and extracted text, then produce clean Cover Page metadata and a structured Contents/Index summary.',
      `Filename: ${req.fileName || 'Untitled'}`,
      `Pages: ${req.pageCount || 1}`,
      excerpt ? `Document Excerpt:\n"""\n${excerpt}\n"""` : 'No extracted text available; infer carefully from the filename.',
      '',
      'Rules:',
      '1. Pick the single best category from: Academic / Lab Report, Thesis & Research, Engineering & Technical, Corporate & Executive, Financial & Invoice, Legal & Compliance, Proposal & Pitch, Resume & Portfolio, General Document.',
      '2. Return a concise, polished title (max 8 words) and contextual subtitle (e.g. "Lab Tasks, Practical Exercises & Observations" if lab tasks are inside).',
      '3. For `summary`, provide 3 to 7 clean single-line bullet points starting with "• " summarizing either the actual Index/Contents (e.g. "• Lab Task 1: ...", "• Section 2: ...") or key contents found in the document. Separate each bullet with a newline character `\\n`. Never write a long unformatted wall of text.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            summaryBullets: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['category', 'title', 'subtitle', 'summaryBullets'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      category?: string;
      title?: string;
      subtitle?: string;
      summaryBullets?: string[];
    };

    const matchedCategory = (
      Object.keys(VALID_THEME_PRESETS).includes(parsed.category || '')
        ? parsed.category
        : localFallback.category
    ) as AnalyzeDocumentResponse['category'];
    const preset = VALID_THEME_PRESETS[matchedCategory] || VALID_THEME_PRESETS['General Document'];

    const bullets = Array.isArray(parsed.summaryBullets)
      ? parsed.summaryBullets
          .map((item) => cleanHeadingLine(String(item || '')))
          .filter((item) => item.length >= 3)
          .slice(0, 7)
      : [];

    const summary =
      bullets.length > 0 ? bullets.map((b) => `• ${b}`).join('\n') : localFallback.summary;

    return {
      status: 200,
      payload: {
        category: matchedCategory,
        suggestedThemeId: preset.themeId,
        suggestedFont: preset.font,
        primaryColor: preset.primaryColor,
        accentColor: preset.accentColor,
        title: parsed.title?.trim() || localFallback.title,
        subtitle: parsed.subtitle?.trim() || localFallback.subtitle,
        summary,
        source: 'gemini',
        confidenceNote: `AI analyzed content as ${matchedCategory}`,
      },
    };
  } catch (err) {
    console.warn('analyze-document Gemini fallback engaged:', err);
    return { status: 200, payload: localFallback };
  }
}
