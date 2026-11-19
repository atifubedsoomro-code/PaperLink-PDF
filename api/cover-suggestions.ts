import { GoogleGenAI, Type } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

export type CoverSuggestionEngine = 'ai' | 'ai-sites';

export interface CoverSuggestionsStartRequest {
  action?: 'start' | 'poll';
  title?: string;
  subtitle?: string;
  documentName?: string;
  documentText?: string;
  customPrompt?: string;
  count?: number;
  preferredEngine?: CoverSuggestionEngine;
  jobs?: Array<{
    id: string;
    jobId?: string;
    label?: string;
    visualStyle?: string;
    prompt?: string;
    searchQuery?: string;
    palette?: {
      primary: string;
      accent: string;
      background: string;
    };
    forceFallback?: boolean;
  }>;
  detectedTopic?: string;
}

interface DesignedConcept {
  label: string;
  visualStyle: string;
  imagePrompt: string;
  searchQuery: string;
  palette: {
    primary: string;
    accent: string;
    background: string;
  };
}

export interface CoverSuggestionResultItem {
  id: string;
  label: string;
  visualStyle: string;
  prompt: string;
  searchQuery: string;
  palette: {
    primary: string;
    accent: string;
    background: string;
  };
  status: 'queued' | 'ready' | 'error';
  jobId?: string;
  imageDataUrl?: string;
  sourceType?: 'sd35' | 'flux' | 'ai-horde' | 'civitai-ai' | 'wikimedia-ai';
  queuePosition?: number;
  waitTimeSec?: number;
  errorMessage?: string;
}

const AI_HORDE_API_BASE = 'https://aihorde.net/api/v2';
const AI_HORDE_ANONYMOUS_KEY = '0000000000';
const AI_HORDE_CLIENT_AGENT = 'PaperLink:1.0:paperlink-pdf.vercel.app';
const AI_HORDE_FAST_SFW_MODELS = [
  'Deliberate',
  'stable_diffusion',
  "ICBINP - I Can't Believe It's Not Photography",
  'AbsoluteReality',
];

const HF_SD35_SPACE = 'https://stabilityai-stable-diffusion-3-5-large-turbo.hf.space';
const HF_FLUX_SCHNELL_SPACE = 'https://black-forest-labs-flux-1-schnell.hf.space';
let zeroGpuCooldownUntil = 0;

const NO_TEXT_POSITIVE_SUFFIX =
  'pure atmospheric AI artwork with generous smooth negative space for document cover background, soft cinematic lighting, strictly no text, no letters, no words, no numbers, no typography, no titles, no watermark, no logos';

const AI_HORDE_NEGATIVE_PROMPT =
  'text, words, letters, alphabet, numbers, digits, typography, font, title, subtitle, caption, watermark, signature, logo, brand, label, stamp, badge, frame, collage, screenshot, cluttered, nsfw, nude, human face, portrait';

const BLOCKED_AI_SITE_CONTENT_RE =
  /(1girl|1boy|solo|nsfw|nude|bikini|lingerie|breasts|cleavage|waifu|anime\s+girl|pinup|erotic|watermark|text|logo|portrait|selfie)/i;

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

function sanitizeHex(hex?: string, fallback = '#1e293b'): string {
  if (typeof hex !== 'string') return fallback;
  const cleaned = hex.trim();
  return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned : fallback;
}

function normalizePromptNoText(raw: string): string {
  const cleaned = raw
    .replace(/\b(text|words?|letters?|typography|title|subtitle|logo|watermark)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    ? `${cleaned}, ${NO_TEXT_POSITIVE_SUFFIX}`
    : `minimalist soft architectural light and organic abstract AI artwork, ${NO_TEXT_POSITIVE_SUFFIX}`;
}

function buildHeuristicConcepts(
  docSummarySource: string,
  customPrompt: string,
  count: number
): { detectedTopic: string; concepts: DesignedConcept[] } {
  const lower = `${docSummarySource} ${customPrompt}`.toLowerCase();
  let detectedTopic = 'Editorial & Modern Art';

  let pool: DesignedConcept[] = [
    {
      label: 'Sunlit Sandstone Geometry',
      visualStyle: 'AI architectural sandstone forms & warm light',
      imagePrompt: normalizePromptNoText(
        customPrompt ||
          'minimalist AI architectural sandstone wall with warm golden afternoon sunbeams and gentle geometric shadow gradients, clean editorial depth'
      ),
      searchQuery: 'minimalist architecture',
      palette: { primary: '#1e293b', accent: '#f59e0b', background: '#f8fafc' },
    },
    {
      label: 'Translucent Sapphire Waves',
      visualStyle: 'AI frosted glass fluid curves & sky glow',
      imagePrompt: normalizePromptNoText(
        customPrompt
          ? `${customPrompt}, frosted translucent glass layers`
          : 'smooth translucent cobalt blue frosted glass 3D AI render waves with subtle warm studio rim light, serene modern gradient artwork'
      ),
      searchQuery: 'abstract 3d glass',
      palette: { primary: '#0f172a', accent: '#38bdf8', background: '#f0f9ff' },
    },
    {
      label: 'Sage Botanical Diffusion',
      visualStyle: 'Soft AI botanical silk leaves & quiet linen mist',
      imagePrompt: normalizePromptNoText(
        customPrompt
          ? `${customPrompt}, soft minimalist botanical tone`
          : 'dreamy soft focus sunlit eucalyptus botanical AI illustration against pale linen cream background, peaceful minimalist mood'
      ),
      searchQuery: 'minimalist background',
      palette: { primary: '#14532d', accent: '#34d399', background: '#f7fee7' },
    },
  ];

  if (
    /(comput|program|code|coding|software|algorithm|data structure|python|java|javascript|typescript|react|html|css|sql|database|linux|cpu|ram|memory|kernel|operating system|compiler|binary|tcp|http|network|cloud|api|hardware|motherboard|silicon|ai|machine learning|neural|cyber)/i.test(
      lower
    )
  ) {
    detectedTopic = 'Computing & Software';
    pool = [
      {
        label: 'Silicon Circuit Depth',
        visualStyle: 'AI macro microchip traces & cobalt bokeh glow',
        imagePrompt: normalizePromptNoText(
          customPrompt ||
            'macro AI render of sleek dark blue and copper silicon computer circuit board traces glowing softly out of focus, shallow depth of field, spacious calm tech backdrop'
        ),
        searchQuery: 'circuit',
        palette: { primary: '#0f172a', accent: '#38bdf8', background: '#f0f9ff' },
      },
      {
        label: 'Fiber-Optic Light Stream',
        visualStyle: 'AI translucent cyan optical fiber pathways',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, optical computing fibers`
            : 'flowing glowing cyan and indigo glass fiber optic strands against smooth deep obsidian computing backdrop, clean atmospheric digital AI art'
        ),
        searchQuery: 'futuristic tech',
        palette: { primary: '#1e1b4b', accent: '#22d3ee', background: '#f8fafc' },
      },
      {
        label: 'Cybernetic Obsidian Grid',
        visualStyle: 'Clean dark hardware geometry & amber indicator glow',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, modern dark server hardware aesthetic`
            : 'minimalist sleek dark server corridor abstract architectural perspective with soft teal and warm amber reflections, soft AI concept art'
        ),
        searchQuery: 'cyberpunk background',
        palette: { primary: '#18181b', accent: '#facc15', background: '#f4f4f5' },
      },
    ];
  } else if (/(finance|quarter|revenue|audit|tax|bank|budget|invest|market|invoice|equity|account)/i.test(lower)) {
    detectedTopic = 'Finance & Corporate';
    pool = [
      {
        label: 'Obsidian Marble Gold',
        visualStyle: 'AI executive slate stone & champagne gold horizon',
        imagePrompt: normalizePromptNoText(
          customPrompt ||
            'subtle brushed obsidian marble AI artwork with delicate warm champagne gold horizon light, executive corporate minimalism'
        ),
        searchQuery: 'luxury dark gold',
        palette: { primary: '#0f172a', accent: '#eab308', background: '#f8fafc' },
      },
      {
        label: 'Modern Glass Facade',
        visualStyle: 'AI architectural glass & sky geometry',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, crisp corporate glass reflection`
            : 'minimalist upward AI architectural rendering of bright contemporary glass skyscraper facade reflecting soft sky clouds, airy clean negative space'
        ),
        searchQuery: 'architecture',
        palette: { primary: '#1e3a8a', accent: '#60a5fa', background: '#f8fafc' },
      },
      {
        label: 'Ivory Limestone Vault',
        visualStyle: 'AI ivory travertine curves in soft morning light',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, calm ivory travertine tones`
            : 'minimalist ivory limestone sculptural arches washed in soft morning daylight, refined peaceful AI minimalism'
        ),
        searchQuery: 'minimalist architecture',
        palette: { primary: '#334155', accent: '#d97706', background: '#fafaf9' },
      },
    ];
  } else if (/(bio|med|health|clinic|patient|science|lab|chem|research|eco|climate|earth)/i.test(lower)) {
    detectedTopic = 'Science & Healthcare';
    pool = [
      {
        label: 'Microscopic Emerald Light',
        visualStyle: 'AI cellular emerald refraction & calm mist',
        imagePrompt: normalizePromptNoText(
          customPrompt ||
            'soft luminous emerald and teal microscopic cellular AI art over clean pale mist surface, scientific elegance, smooth uncluttered center'
        ),
        searchQuery: 'biology abstract',
        palette: { primary: '#064e3b', accent: '#10b981', background: '#ecfdf5' },
      },
      {
        label: 'Botanical Crystal Glow',
        visualStyle: 'AI translucent emerald botanical prism light',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, botanical soft sunlight`
            : 'translucent emerald glass botanical AI artwork with bright airy light refraction, serene natural science cover backdrop'
        ),
        searchQuery: 'nature abstract',
        palette: { primary: '#14532d', accent: '#22c55e', background: '#f7fee7' },
      },
      {
        label: 'Alpine Glacier Silk',
        visualStyle: 'AI crisp cyan ice contours & atmospheric haze',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, pale arctic cyan light`
            : 'minimalist aerial AI landscape of smooth white and pale cyan glacier ridges under soft overcast daylight'
        ),
        searchQuery: 'landscape watercolor',
        palette: { primary: '#0c4a6e', accent: '#06b6d4', background: '#f0f9ff' },
      },
    ];
  } else if (/(math|calcul|algebra|geometry|physics|quantum|statistic|probabil|equation)/i.test(lower)) {
    detectedTopic = 'Mathematics & Physics';
    pool = [
      {
        label: 'Optical Glass Prism',
        visualStyle: 'AI refracted spectrum ribbons & geometric planes',
        imagePrompt: normalizePromptNoText(
          customPrompt ||
            'minimalist crystal glass prism AI 3D render casting soft spectrum light ribbons over smooth dark slate surface, scientific clarity'
        ),
        searchQuery: '3d render glass',
        palette: { primary: '#1e1b4b', accent: '#6366f1', background: '#f8fafc' },
      },
      {
        label: 'Parametric Concrete Curve',
        visualStyle: 'AI pure parabolic curves & sunlit shadow',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, geometric parabolic light`
            : 'minimalist sculptural white concrete parabolic arch AI render casting crisp geometric shadows in bright daylight'
        ),
        searchQuery: 'geometric abstract',
        palette: { primary: '#334155', accent: '#f59e0b', background: '#fafaf9' },
      },
      {
        label: 'Celestial Nebula Haze',
        visualStyle: 'AI deep indigo cosmic horizon & soft starlight',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, quiet deep space horizon`
            : 'smooth dark indigo nebula sky AI painting over calm horizon silhouette, clean uncluttered atmosphere'
        ),
        searchQuery: 'space nebula',
        palette: { primary: '#0f172a', accent: '#818cf8', background: '#f8fafc' },
      },
    ];
  } else if (/(law|legal|contract|agreement|policy|thesis|academic|history|essay|education|notes|lecture)/i.test(lower)) {
    detectedTopic = 'Academic & Policy';
    pool = [
      {
        label: 'Classical Travertine Hall',
        visualStyle: 'AI classical marble colonnade & soft shadows',
        imagePrompt: normalizePromptNoText(
          customPrompt ||
            'minimalist classical travertine stone arches in soft diffused daylight, calm dignified neutral cream and charcoal AI artwork'
        ),
        searchQuery: 'architecture',
        palette: { primary: '#292524', accent: '#b45309', background: '#fafaf9' },
      },
      {
        label: 'Warm Linen Paper Craft',
        visualStyle: 'AI sunlit cream minimalism & serene geometry',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, warm cream minimalism`
            : 'minimalist textured warm cream artistic surface illuminated by delicate window sunlight shadows, serene editorial backdrop'
        ),
        searchQuery: 'minimalist background',
        palette: { primary: '#3f3f46', accent: '#d97706', background: '#fefce8' },
      },
      {
        label: 'Midnight Indigo Silk',
        visualStyle: 'AI deep sapphire drapery with warm amber rim light',
        imagePrompt: normalizePromptNoText(
          customPrompt
            ? `${customPrompt}, deep indigo soft folds`
            : 'minimalist smooth deep navy velvet ripples under soft warm ambient studio glow, elegant quiet academic AI cover artwork'
        ),
        searchQuery: 'abstract dark blue',
        palette: { primary: '#172554', accent: '#eab308', background: '#f8fafc' },
      },
    ];
  }

  return {
    detectedTopic,
    concepts: pool.slice(0, count),
  };
}

async function designConceptsWithGemini(
  title: string,
  subtitle: string,
  documentName: string,
  documentText: string,
  customPrompt: string,
  count: number
): Promise<{ detectedTopic: string; concepts: DesignedConcept[] }> {
  const ai = getGeminiClient();
  const excerpt = documentText.slice(0, 3800).trim();
  const heuristic = buildHeuristicConcepts(`${title} ${subtitle} ${documentName} ${excerpt}`, customPrompt, count);

  if (!ai) {
    return heuristic;
  }

  try {
    const prompt = [
      `Read this uploaded document carefully, identify its exact subject domain (e.g., "Computing & Algorithms", "Financial Audit Report", "Organic Chemistry Notes"), and design ${count} distinct AI-ARTWORK cover background concepts strictly tailored to that subject.`,
      `Document Filename: ${documentName || 'Untitled'}`,
      `Document Title: ${title || 'Untitled Document'}`,
      subtitle ? `Subtitle: ${subtitle}` : '',
      customPrompt ? `User Requested Aesthetic / Scene: ${customPrompt}` : '',
      excerpt ? `Actual Document Content:\n${excerpt}` : '',
      `CRITICAL RULES:`,
      `1. If the document is about Computing / Software / Programming / IT / AI / Networking, every concept MUST be tech/computing AI artwork (circuit board macros, glowing silicon traces, translucent optical fibers, minimalist dark-glass server ambiance) — NOT generic trees or plain buildings.`,
      `2. Describe ONLY pure AI background artwork — STRICTLY NO text, NO letters, NO numbers, NO code symbols, NO titles, NO logos, NO human faces/portraits.`,
      `3. Include a clean 1-2 word "searchQuery" suited for searching AI art model galleries (e.g., "circuit", "futuristic tech", "architecture", "3d glass", "minimalist").`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        temperature: 0.65,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedTopic: {
              type: Type.STRING,
              description: '2-4 word detected document domain, e.g. Computing & Software',
            },
            concepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: 'Short 2-4 word AI artwork concept title' },
                  visualStyle: { type: Type.STRING, description: 'Concise 5-8 word AI style summary' },
                  imagePrompt: {
                    type: Type.STRING,
                    description: 'Detailed English AI diffusion prompt for pure background AI artwork with zero text or faces',
                  },
                  searchQuery: {
                    type: Type.STRING,
                    description: 'Short 1-2 word AI art gallery search keyword (e.g. circuit, architecture, abstract)',
                  },
                  primaryHex: { type: Type.STRING, description: '6-digit hex color like #0f172a' },
                  accentHex: { type: Type.STRING, description: '6-digit hex color like #38bdf8' },
                  backgroundHex: { type: Type.STRING, description: '6-digit hex color like #f8fafc' },
                },
                required: ['label', 'visualStyle', 'imagePrompt', 'searchQuery', 'primaryHex', 'accentHex', 'backgroundHex'],
              },
            },
          },
          required: ['detectedTopic', 'concepts'],
        },
      },
    });

    const rawText = response.text?.trim() || '';
    const parsed = JSON.parse(rawText) as {
      detectedTopic?: string;
      concepts?: Array<{
        label?: string;
        visualStyle?: string;
        imagePrompt?: string;
        searchQuery?: string;
        primaryHex?: string;
        accentHex?: string;
        backgroundHex?: string;
      }>;
    };

    const items = Array.isArray(parsed?.concepts) ? parsed.concepts.slice(0, count) : [];
    if (items.length === 0) return heuristic;

    return {
      detectedTopic: (parsed.detectedTopic || heuristic.detectedTopic).trim().slice(0, 48),
      concepts: items.map((item, idx) => {
        const fb = heuristic.concepts[idx % heuristic.concepts.length];
        return {
          label: (item.label || fb.label).trim().slice(0, 44),
          visualStyle: (item.visualStyle || fb.visualStyle).trim().slice(0, 72),
          imagePrompt: normalizePromptNoText(item.imagePrompt || fb.imagePrompt),
          searchQuery: (item.searchQuery || fb.searchQuery).replace(/[^\w\s-]/g, ' ').trim() || fb.searchQuery,
          palette: {
            primary: sanitizeHex(item.primaryHex, fb.palette.primary),
            accent: sanitizeHex(item.accentHex, fb.palette.accent),
            background: sanitizeHex(item.backgroundHex, fb.palette.background),
          },
        };
      }),
    };
  } catch (err) {
    console.warn('Cover concepts fallback triggered:', err);
    return heuristic;
  }
}

async function fetchImageUrlAsDataUrl(imageUrl: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PaperLink/1.0 (https://paperlink-pdf.vercel.app)',
        Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength < 1000 || arrayBuffer.byteLength > 6_000_000) return null;
    const b64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

async function generateWithFreeHfSpace(
  imagePrompt: string,
  preferFlux: boolean
): Promise<{ imageDataUrl: string; sourceType: 'sd35' | 'flux' } | null> {
  if (Date.now() < zeroGpuCooldownUntil) {
    return null;
  }

  const attempts: Array<{ spaceBase: string; sourceType: 'sd35' | 'flux'; data: any[] }> = preferFlux
    ? [
        {
          spaceBase: HF_FLUX_SCHNELL_SPACE,
          sourceType: 'flux',
          data: [imagePrompt, Math.floor(Math.random() * 99999), true, 512, 768, 4],
        },
        {
          spaceBase: HF_SD35_SPACE,
          sourceType: 'sd35',
          data: [imagePrompt, AI_HORDE_NEGATIVE_PROMPT, Math.floor(Math.random() * 99999), true, 512, 768, 0, 4],
        },
      ]
    : [
        {
          spaceBase: HF_SD35_SPACE,
          sourceType: 'sd35',
          data: [imagePrompt, AI_HORDE_NEGATIVE_PROMPT, Math.floor(Math.random() * 99999), true, 512, 768, 0, 4],
        },
        {
          spaceBase: HF_FLUX_SCHNELL_SPACE,
          sourceType: 'flux',
          data: [imagePrompt, Math.floor(Math.random() * 99999), true, 512, 768, 4],
        },
      ];

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14_000);
    try {
      const startRes = await fetch(`${attempt.spaceBase}/gradio_api/call/infer`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: attempt.data }),
      });
      if (!startRes.ok) continue;

      const startJson = (await startRes.json().catch(() => ({}))) as { event_id?: string };
      if (!startJson?.event_id) continue;

      const streamRes = await fetch(`${attempt.spaceBase}/gradio_api/call/infer/${startJson.event_id}`, {
        signal: controller.signal,
      });
      if (!streamRes.ok) continue;

      const sseBody = await streamRes.text();
      if (/ZeroGPU quota/i.test(sseBody)) {
        zeroGpuCooldownUntil = Date.now() + 90_000;
        return null;
      }

      const lines = sseBody.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('event: complete') && lines[i + 1]?.startsWith('data:')) {
          const arr = JSON.parse(lines[i + 1].slice(5).trim()) as Array<{ url?: string }>;
          const fileUrl = arr?.[0]?.url;
          if (!fileUrl) break;
          const dataUrl = await fetchImageUrlAsDataUrl(fileUrl, 7000);
          if (dataUrl) {
            return { imageDataUrl: dataUrl, sourceType: attempt.sourceType };
          }
        }
      }
    } catch {
      // ignore timeout or quota and continue to fallback
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

async function submitAiHordeJob(imagePrompt: string): Promise<{ jobId?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const fullPrompt = `${imagePrompt} ### ${AI_HORDE_NEGATIVE_PROMPT}`;
    const resp = await fetch(`${AI_HORDE_API_BASE}/generate/async`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: AI_HORDE_ANONYMOUS_KEY,
        'Client-Agent': AI_HORDE_CLIENT_AGENT,
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        params: {
          steps: 12,
          width: 512,
          height: 512,
          n: 1,
          cfg_scale: 7,
          karras: true,
        },
        models: AI_HORDE_FAST_SFW_MODELS,
        nsfw: false,
        censor_nsfw: true,
        r2: true,
        shared: false,
      }),
    });
    clearTimeout(timer);

    const payload = (await resp.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!resp.ok || !payload?.id) {
      return { error: payload?.message || `AI Horde status ${resp.status}` };
    }
    return { jobId: payload.id };
  } catch (err: any) {
    return { error: err?.message || 'AI Horde unavailable' };
  }
}

async function pollAiHordeJob(jobId: string): Promise<{
  state: 'queued' | 'done' | 'failed';
  imageUrl?: string;
  queuePosition?: number;
  waitTimeSec?: number;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(`${AI_HORDE_API_BASE}/generate/status/${encodeURIComponent(jobId)}`, {
      signal: controller.signal,
      headers: {
        'Client-Agent': AI_HORDE_CLIENT_AGENT,
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { state: 'failed' };
    }
    const status = (await resp.json()) as {
      done?: boolean;
      faulted?: boolean;
      is_possible?: boolean;
      wait_time?: number;
      queue_position?: number;
      generations?: Array<{ img?: string; censored?: boolean }>;
    };

    if (status.faulted || status.is_possible === false) {
      return { state: 'failed' };
    }
    const firstGen = status.generations?.[0];
    if (status.done && firstGen?.img && !firstGen.censored) {
      return { state: 'done', imageUrl: firstGen.img };
    }
    if (status.done) {
      return { state: 'failed' };
    }
    return {
      state: 'queued',
      queuePosition: typeof status.queue_position === 'number' ? status.queue_position : undefined,
      waitTimeSec: typeof status.wait_time === 'number' ? status.wait_time : undefined,
    };
  } catch {
    return { state: 'queued' };
  }
}

async function fetchCivitaiAiArtDataUrl(
  searchQuery: string,
  usedUrls: Set<string>
): Promise<{ imageDataUrl: string; sourceType: 'civitai-ai' } | null> {
  const words = `${searchQuery}`.trim().split(/\s+/).filter(Boolean);
  const queries = Array.from(
    new Set([words.slice(0, 2).join(' '), words[0], 'minimalist abstract', 'futuristic abstract'].filter(Boolean))
  );

  for (const query of queries) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const url = `https://civitai.com/api/v1/models?query=${encodeURIComponent(query)}&nsfw=false&limit=6`;
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PaperLink/1.0' },
      });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const json = (await resp.json()) as {
        items?: Array<{
          name?: string;
          nsfw?: boolean;
          tags?: string[];
          modelVersions?: Array<{
            images?: Array<{
              url?: string;
              type?: string;
              nsfw?: boolean;
              nsfwLevel?: number | string;
              meta?: { prompt?: string };
            }>;
          }>;
        }>;
      };

      for (const model of json?.items || []) {
        if (model.nsfw) continue;
        const modelText = `${model.name || ''} ${(model.tags || []).join(' ')}`;
        if (BLOCKED_AI_SITE_CONTENT_RE.test(modelText)) continue;

        for (const ver of (model.modelVersions || []).slice(0, 1)) {
          for (const img of ver.images || []) {
            if (img.type !== 'image' || !img.url) continue;
            if (img.nsfw === true) continue;
            if (img.nsfwLevel !== 1 && img.nsfwLevel !== 'None') continue;
            const imgPrompt = img.meta?.prompt || '';
            if (imgPrompt && BLOCKED_AI_SITE_CONTENT_RE.test(imgPrompt)) continue;

            const optimizedUrl = img.url.replace('/original=true/', '/width=768/');
            if (usedUrls.has(optimizedUrl)) continue;
            usedUrls.add(optimizedUrl);

            const dataUrl = await fetchImageUrlAsDataUrl(optimizedUrl, 5500);
            if (dataUrl) {
              return { imageDataUrl: dataUrl, sourceType: 'civitai-ai' };
            }
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchWikimediaAiArtDataUrl(
  searchQuery: string,
  usedUrls: Set<string>
): Promise<{ imageDataUrl: string; sourceType: 'wikimedia-ai' } | null> {
  const words = `${searchQuery}`.trim().split(/\s+/).filter(Boolean);
  const queriesToTry = Array.from(
    new Set([words.slice(0, 2).join(' '), words[0], ''].filter((v) => v !== undefined))
  );

  for (const kw of queriesToTry) {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('generator', 'search');
      url.searchParams.set(
        'gsrsearch',
        kw
          ? `filetype:bitmap deepcategory:"AI-generated images" ${kw}`
          : `filetype:bitmap deepcategory:"AI-generated images" abstract`
      );
      url.searchParams.set('gsrnamespace', '6');
      url.searchParams.set('gsrlimit', '10');
      url.searchParams.set('prop', 'imageinfo');
      url.searchParams.set('iiprop', 'url|mime');
      url.searchParams.set('iiurlwidth', '900');
      url.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const resp = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'PaperLink/1.0 (https://paperlink-pdf.vercel.app)' },
      });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const json = (await resp.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              title?: string;
              imageinfo?: Array<{
                thumburl?: string;
                url?: string;
                mime?: string;
              }>;
            }
          >;
        };
      };

      const pages = Object.values(json?.query?.pages || {});
      for (const page of pages) {
        const title = (page.title || '').toLowerCase();
        if (/(portrait|chart|graph|diagram|screenshot|flag|logo|coat_of_arms|signature|coin|bell_curve|chromatogra)/.test(title)) {
          continue;
        }
        const info = page.imageinfo?.[0];
        if (!info) continue;
        const mime = (info.mime || '').toLowerCase();
        if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') continue;
        const candidateUrl = info.thumburl || info.url;
        if (!candidateUrl || usedUrls.has(candidateUrl)) continue;
        usedUrls.add(candidateUrl);

        const dataUrl = await fetchImageUrlAsDataUrl(candidateUrl, 5500);
        if (dataUrl) {
          return { imageDataUrl: dataUrl, sourceType: 'wikimedia-ai' };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveAiSiteArtwork(
  searchQuery: string,
  imagePrompt: string,
  usedUrls: Set<string>,
  preferWikimediaFirst = false
): Promise<{
  status: 'ready' | 'queued' | 'error';
  imageDataUrl?: string;
  jobId?: string;
  sourceType?: CoverSuggestionResultItem['sourceType'];
  errorMessage?: string;
}> {
  if (preferWikimediaFirst) {
    const wiki = await fetchWikimediaAiArtDataUrl(searchQuery, usedUrls);
    if (wiki) return { status: 'ready', ...wiki };
    const civ = await fetchCivitaiAiArtDataUrl(searchQuery, usedUrls);
    if (civ) return { status: 'ready', ...civ };
  } else {
    const civ = await fetchCivitaiAiArtDataUrl(searchQuery, usedUrls);
    if (civ) return { status: 'ready', ...civ };
    const wiki = await fetchWikimediaAiArtDataUrl(searchQuery, usedUrls);
    if (wiki) return { status: 'ready', ...wiki };
  }

  const submitted = await submitAiHordeJob(imagePrompt);
  if (submitted.jobId) {
    return { status: 'queued', jobId: submitted.jobId };
  }

  return { status: 'error', errorMessage: 'Free AI artwork sites temporarily unavailable. Retry in a moment.' };
}

export async function executeCoverSuggestions(
  body: CoverSuggestionsStartRequest
): Promise<{
  status: number;
  payload: { suggestions: CoverSuggestionResultItem[]; engineUsed: string; detectedTopic?: string };
}> {
  const action = body.action === 'poll' ? 'poll' : 'start';
  const usedUrls = new Set<string>();

  if (action === 'poll') {
    const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, 3) : [];
    const results = await Promise.all(
      jobs.map(async (job, idx): Promise<CoverSuggestionResultItem> => {
        const palette = job.palette || { primary: '#1e293b', accent: '#f59e0b', background: '#f8fafc' };
        const base: CoverSuggestionResultItem = {
          id: job.id,
          label: job.label || `AI Artwork ${idx + 1}`,
          visualStyle: job.visualStyle || 'Text-free AI cover artwork',
          prompt: job.prompt || '',
          searchQuery: job.searchQuery || 'abstract',
          palette,
          status: 'queued',
          jobId: job.jobId,
        };

        if (job.forceFallback || !job.jobId) {
          const siteRes = await resolveAiSiteArtwork(base.searchQuery, base.prompt, usedUrls, idx % 2 === 1);
          return {
            ...base,
            ...siteRes,
          };
        }

        const polled = await pollAiHordeJob(job.jobId);
        if (polled.state === 'done' && polled.imageUrl) {
          const dataUrl = await fetchImageUrlAsDataUrl(polled.imageUrl);
          if (dataUrl) {
            return {
              ...base,
              status: 'ready',
              imageDataUrl: dataUrl,
              sourceType: 'ai-horde',
            };
          }
          const siteRes = await resolveAiSiteArtwork(base.searchQuery, base.prompt, usedUrls, idx % 2 === 1);
          return { ...base, ...siteRes };
        }

        if (polled.state === 'failed') {
          const siteRes = await resolveAiSiteArtwork(base.searchQuery, base.prompt, usedUrls, idx % 2 === 1);
          return { ...base, ...siteRes };
        }

        return {
          ...base,
          status: 'queued',
          queuePosition: polled.queuePosition,
          waitTimeSec: polled.waitTimeSec,
        };
      })
    );

    return {
      status: 200,
      payload: {
        suggestions: results,
        engineUsed: 'free-ai-art',
        detectedTopic: body.detectedTopic,
      },
    };
  }

  const count = Math.min(3, Math.max(1, Math.round(Number(body.count) || 3)));
  const preferredEngine: CoverSuggestionEngine =
    body.preferredEngine === 'ai-sites' ? 'ai-sites' : 'ai';

  const { detectedTopic, concepts } = await designConceptsWithGemini(
    String(body.title || ''),
    String(body.subtitle || ''),
    String(body.documentName || ''),
    String(body.documentText || ''),
    String(body.customPrompt || ''),
    count
  );

  const suggestions = await Promise.all(
    concepts.map(async (concept, idx): Promise<CoverSuggestionResultItem> => {
      const id = `sug_${Date.now()}_${idx}`;

      if (preferredEngine === 'ai-sites') {
        const siteRes = await resolveAiSiteArtwork(
          concept.searchQuery,
          concept.imagePrompt,
          usedUrls,
          idx === 1
        );
        return {
          id,
          label: concept.label,
          visualStyle: concept.visualStyle,
          prompt: concept.imagePrompt,
          searchQuery: concept.searchQuery,
          palette: concept.palette,
          ...siteRes,
        };
      }

      // Free AI Generator mode:
      // Slot 0 tries instant SD 3.5 Turbo / FLUX.1-schnell (fast free HuggingFace ZeroGPU)
      if (idx === 0) {
        const hfResult = await generateWithFreeHfSpace(concept.imagePrompt, false);
        if (hfResult) {
          return {
            id,
            label: concept.label,
            visualStyle: concept.visualStyle,
            prompt: concept.imagePrompt,
            searchQuery: concept.searchQuery,
            palette: concept.palette,
            status: 'ready',
            imageDataUrl: hfResult.imageDataUrl,
            sourceType: hfResult.sourceType,
          };
        }
      }

      // Free unlimited AI Horde fast SFW cluster (steps=12, Delib/SD/ICBINP/AbsoluteReality)
      const submitted = await submitAiHordeJob(concept.imagePrompt);
      if (submitted.jobId) {
        return {
          id,
          label: concept.label,
          visualStyle: concept.visualStyle,
          prompt: concept.imagePrompt,
          searchQuery: concept.searchQuery,
          palette: concept.palette,
          status: 'queued',
          jobId: submitted.jobId,
        };
      }

      // Fallback strictly to verified AI Artwork Sites (never plain stock photos or generic SVGs)
      const siteRes = await resolveAiSiteArtwork(
        concept.searchQuery,
        concept.imagePrompt,
        usedUrls,
        idx % 2 === 1
      );
      return {
        id,
        label: concept.label,
        visualStyle: concept.visualStyle,
        prompt: concept.imagePrompt,
        searchQuery: concept.searchQuery,
        palette: concept.palette,
        ...siteRes,
      };
    })
  );

  return {
    status: 200,
    payload: {
      suggestions,
      engineUsed: preferredEngine,
      detectedTopic,
    },
  };
}

async function readJsonBody(
  req: IncomingMessage & { body?: any }
): Promise<CoverSuggestionsStartRequest> {
  if (req.body && typeof req.body === 'object') {
    return req.body as CoverSuggestionsStartRequest;
  }
  if (typeof req.body === 'string') {
    return (req.body ? JSON.parse(req.body) : {}) as CoverSuggestionsStartRequest;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as CoverSuggestionsStartRequest;
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
    sendJson(res, 405, { error: 'Method not allowed. Use POST /api/cover-suggestions.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await executeCoverSuggestions(body);
    sendJson(res, result.status, result.payload);
  } catch (err: any) {
    sendJson(res, 400, {
      error: err?.message || 'Unable to generate free AI cover artwork suggestions.',
    });
  }
}
