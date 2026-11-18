import { HttpError } from './errors';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  /** Base backoff in ms; tests set this to 0. */
  backoffMs?: number;
}

export interface GenerateRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** When set, Gemini returns JSON matching this OpenAPI-subset schema. */
  responseSchema?: Record<string, unknown>;
}

export interface GenerateResult {
  text: string;
  finishReason: string;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class GeminiClient {
  private base: string;
  private fetchImpl: typeof fetch;

  constructor(private opts: GeminiOptions) {
    if (!opts.apiKey) throw new HttpError(500, 'GEMINI_API_KEY is not configured (npx wrangler secret put GEMINI_API_KEY)');
    this.base = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  get model() {
    return this.opts.model;
  }

  buildBody(req: GenerateRequest) {
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.9,
      // Thinking models count reasoning tokens against this budget, so keep it generous.
      maxOutputTokens: req.maxOutputTokens ?? 16384,
    };
    if (req.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = req.responseSchema;
    }
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig,
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    return body;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const url = `${this.base}/v1beta/models/${encodeURIComponent(this.opts.model)}:generateContent`;
    const body = JSON.stringify(this.buildBody(req));
    const maxRetries = this.opts.maxRetries ?? 3;
    const backoff = this.opts.backoffMs ?? 2000;
    let lastErr = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
          body,
        });
      } catch (e) {
        lastErr = `Network error calling Gemini: ${(e as Error).message}`;
        if (attempt < maxRetries) {
          await sleep(backoff * 2 ** attempt);
          continue;
        }
        throw new HttpError(502, lastErr);
      }

      if (res.ok) return parseResponse(await res.json());

      const errText = await res.text();
      lastErr = `Gemini HTTP ${res.status}: ${extractError(errText)}`;
      if (RETRYABLE.has(res.status) && attempt < maxRetries) {
        await sleep(backoff * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status === 400 || res.status === 403 ? 400 : 502, lastErr);
    }
    throw new HttpError(502, lastErr);
  }

  async generateJson<T>(req: GenerateRequest & { responseSchema: Record<string, unknown> }): Promise<T> {
    const r = await this.generate(req);
    try {
      return JSON.parse(stripFences(r.text)) as T;
    } catch {
      throw new HttpError(502, `Gemini returned invalid JSON (finishReason=${r.finishReason}). Try again or raise maxOutputTokens.`);
    }
  }
}

export function parseResponse(data: any): GenerateResult {
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new HttpError(422, `Gemini blocked the prompt (${block}). Soften the premise or heat level.`);
  const cand = data?.candidates?.[0];
  if (!cand) throw new HttpError(502, 'Gemini returned no candidates');
  const finishReason: string = cand.finishReason ?? 'UNKNOWN';
  const text = (cand.content?.parts ?? [])
    .filter((p: any) => typeof p.text === 'string' && !p.thought)
    .map((p: any) => p.text)
    .join('');
  if (!text) {
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      throw new HttpError(422, `Gemini stopped for safety (${finishReason}). Lower the heat level or adjust the premise.`);
    }
    throw new HttpError(502, `Gemini returned empty text (finishReason=${finishReason})`);
  }
  return { text, finishReason, usage: data.usageMetadata };
}

function extractError(raw: string): string {
  try {
    return JSON.parse(raw)?.error?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
