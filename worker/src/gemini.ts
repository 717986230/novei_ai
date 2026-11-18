import { HttpError } from './errors';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Tried in order when the primary model is overloaded, rate-limited or too slow to start. */
  fallbackModels?: string[];
  /** Abort and fall back if response headers don't arrive within this many ms (default 75s). */
  firstByteTimeoutMs?: number;
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
  model?: string;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
/** Circuit breaker shared by all requests in this isolate: model -> skip until (epoch ms). */
const overloadedUntil = new Map<string, number>();
const BREAKER_MS = 10 * 60 * 1000;
export const _resetBreaker = () => overloadedUntil.clear();
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
    const all = [this.opts.model, ...(this.opts.fallbackModels ?? [])].filter((m, i, a) => m && a.indexOf(m) === i);
    const now = Date.now();
    // Skip models that were overloaded recently, but always keep at least one to try.
    const healthy = all.filter((m) => (overloadedUntil.get(m) ?? 0) < now);
    const models = healthy.length ? [...healthy, ...all.filter((m) => !healthy.includes(m))] : all;
    let lastErr: HttpError | null = null;
    for (const model of models) {
      try {
        const r = await this.generateWith(model, req);
        overloadedUntil.delete(model);
        return { ...r, model };
      } catch (e) {
        // Only capacity/timeout problems justify switching model; bad key, safety blocks etc. do not.
        if (e instanceof HttpError && e.status === 503) {
          if (all.length > 1) overloadedUntil.set(model, Date.now() + BREAKER_MS);
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new HttpError(502, 'Gemini unavailable');
  }

  /** Attempts on one model. Throws HttpError(503) when the model looks overloaded so the caller can fall back. */
  private async generateWith(model: string, req: GenerateRequest): Promise<GenerateResult> {
    // Streaming (SSE): response headers come with the first chunk instead of after the whole chapter.
    const url = `${this.base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const body = JSON.stringify(this.buildBody(req));
    const hasFallback = (this.opts.fallbackModels ?? []).some((m) => m !== model);
    // With a fallback available, give up on an overloaded model quickly.
    const maxRetries = hasFallback ? Math.min(1, this.opts.maxRetries ?? 3) : (this.opts.maxRetries ?? 3);
    const backoff = this.opts.backoffMs ?? 2000;
    const firstByte = this.opts.firstByteTimeoutMs ?? 75_000;
    let lastErr = '';
    let overloaded = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), firstByte);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
          body,
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        const timedOut = ctrl.signal.aborted;
        lastErr = timedOut ? `${model} did not respond within ${Math.round(firstByte / 1000)}s (overloaded)` : `Network error calling Gemini: ${(e as Error).message}`;
        overloaded = true;
        if (timedOut && hasFallback) break; // don't wait another 75s on the same model
        if (attempt < maxRetries) {
          await sleep(backoff * 2 ** attempt);
          continue;
        }
        break;
      }
      clearTimeout(timer);

      if (res.ok) {
        try {
          return parseResponse(await readSse(res));
        } catch (e) {
          // A stream that dies mid-way is retryable; content/safety errors are not.
          if (e instanceof HttpError && e.status !== 502) throw e;
          lastErr = (e as Error).message;
          overloaded = true;
          if (attempt < maxRetries) {
            await sleep(backoff * 2 ** attempt);
            continue;
          }
          break;
        }
      }

      const errText = await res.text();
      lastErr = `Gemini HTTP ${res.status} (${model}): ${extractError(errText)}`;
      if (RETRYABLE.has(res.status)) {
        overloaded = true;
        // Daily quota exhaustion won't fix itself with a retry; move on.
        if (res.status === 429 && /per day|limit: 0/i.test(errText)) break;
        if (attempt < maxRetries) {
          await sleep(backoff * 2 ** attempt);
          continue;
        }
        break;
      }
      throw new HttpError(res.status === 400 || res.status === 403 ? 400 : 502, lastErr);
    }
    throw new HttpError(overloaded ? 503 : 502, lastErr);
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

/** Read a Gemini SSE stream and merge the chunks into one generateContent-shaped response. */
export async function readSse(res: Response): Promise<any> {
  if (!res.body) return mergeChunks(parseSseText(await res.text()));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const chunks: any[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      const c = parseSseLine(line);
      if (c) chunks.push(c);
    }
    if (done) break;
  }
  const last = parseSseLine(buf.trim());
  if (last) chunks.push(last);
  return mergeChunks(chunks);
}

function parseSseLine(line: string): any {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function parseSseText(text: string): any[] {
  return text.split('\n').map((l) => parseSseLine(l.trim())).filter(Boolean);
}

export function mergeChunks(chunks: any[]): any {
  if (!chunks.length) throw new HttpError(502, 'Gemini stream ended without data');
  const err = chunks.find((c) => c.error);
  if (err) throw new HttpError(502, `Gemini error: ${err.error.message ?? JSON.stringify(err.error)}`);
  const parts: any[] = [];
  let finishReason: string | undefined;
  let promptFeedback: any;
  let usageMetadata: any;
  for (const c of chunks) {
    if (c.promptFeedback) promptFeedback = c.promptFeedback;
    if (c.usageMetadata) usageMetadata = c.usageMetadata;
    const cand = c.candidates?.[0];
    if (!cand) continue;
    if (cand.finishReason) finishReason = cand.finishReason;
    for (const p of cand.content?.parts ?? []) parts.push(p);
  }
  return {
    promptFeedback,
    usageMetadata,
    candidates: parts.length || finishReason ? [{ content: { parts }, finishReason }] : [],
  };
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
