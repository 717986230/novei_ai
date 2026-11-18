import { describe, expect, it } from 'vitest';
import { GeminiClient, _resetBreaker, mergeChunks, parseResponse, parseSseText } from '../src/gemini';
import { beforeEach } from 'vitest';
beforeEach(() => _resetBreaker());
import { normaliseOutline } from '../src/pipeline';

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join('');
const ok = (text: string) =>
  new Response(sse({ candidates: [{ content: { parts: [{ text: text.slice(0, 3) }] } }] }, { candidates: [{ content: { parts: [{ text: text.slice(3) }] }, finishReason: 'STOP' }] }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

describe('GeminiClient', () => {
  it('sends key header, system instruction and schema', async () => {
    let seen: any;
    const c = new GeminiClient({
      apiKey: 'k', model: 'gemini-x', baseUrl: 'https://gw.example/', backoffMs: 0,
      fetchImpl: (async (url: string, init: any) => { seen = { url, init }; return ok('{"a":1}'); }) as any,
    });
    const r = await c.generateJson<{ a: number }>({ system: 'S', prompt: 'P', responseSchema: { type: 'object' } });
    expect(r.a).toBe(1);
    expect(seen.url).toBe('https://gw.example/v1beta/models/gemini-x:streamGenerateContent?alt=sse');
    expect(seen.init.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(seen.init.body);
    expect(body.systemInstruction.parts[0].text).toBe('S');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('omits temperature for Gemini 3+ but keeps it for older models', () => {
    const c3 = new GeminiClient({ apiKey: 'k', model: 'gemini-3.8-flash' });
    expect(c3.buildBody({ prompt: 'x', temperature: 0.2 }).generationConfig).not.toHaveProperty('temperature');
    const c2 = new GeminiClient({ apiKey: 'k', model: 'gemini-2.5-flash' });
    expect((c2.buildBody({ prompt: 'x', temperature: 0.2 }).generationConfig as any).temperature).toBe(0.2);
  });

  it('retries 503 then succeeds; does not retry 400', async () => {
    let n = 0;
    const c = new GeminiClient({ apiKey: 'k', model: 'm', backoffMs: 0, fetchImpl: (async () => (++n < 3 ? new Response('busy', { status: 503 }) : ok('hi'))) as any });
    expect((await c.generate({ prompt: 'x' })).text).toBe('hi');
    expect(n).toBe(3);

    let m = 0;
    const bad = new GeminiClient({ apiKey: 'k', model: 'm', backoffMs: 0, fetchImpl: (async () => { m++; return new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }); }) as any });
    await expect(bad.generate({ prompt: 'x' })).rejects.toThrow(/API key not valid/);
    expect(m).toBe(1);
  });

  it('falls back to the next model when the primary is overloaded', async () => {
    const seen: string[] = [];
    const c = new GeminiClient({
      apiKey: 'k', model: 'big', fallbackModels: ['lite'], backoffMs: 0,
      fetchImpl: (async (url: string) => { seen.push(url.includes('/big:') ? 'big' : 'lite'); return url.includes('/big:') ? new Response('busy', { status: 503 }) : ok('from lite'); }) as any,
    });
    const r = await c.generate({ prompt: 'x' });
    expect(r.text).toBe('from lite');
    expect(r.model).toBe('lite');
    expect(seen).toEqual(['big', 'big', 'lite']);
    // breaker: the next call goes straight to the fallback
    seen.length = 0;
    await c.generate({ prompt: 'y' });
    expect(seen).toEqual(['lite']);
  });

  it('falls back when the primary does not start responding in time', async () => {
    const c = new GeminiClient({
      apiKey: 'k', model: 'big', fallbackModels: ['lite'], backoffMs: 0, firstByteTimeoutMs: 20,
      fetchImpl: ((url: string, init: any) =>
        url.includes('/big:')
          ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
          : Promise.resolve(ok('quick'))) as any,
    });
    expect((await c.generate({ prompt: 'x' })).model).toBe('lite');
  });

  it('does not fall back on a bad request', async () => {
    let n = 0;
    const c = new GeminiClient({ apiKey: 'k', model: 'big', fallbackModels: ['lite'], backoffMs: 0, fetchImpl: (async () => { n++; return new Response('{}', { status: 400 }); }) as any });
    await expect(c.generate({ prompt: 'x' })).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });

  it('requires an api key', () => {
    expect(() => new GeminiClient({ apiKey: '', model: 'm' })).toThrow(/GEMINI_API_KEY/);
  });
});

describe('SSE merge', () => {
  it('joins text across chunks, keeps last finishReason and drops thoughts', () => {
    const chunks = parseSseText(sse(
      { candidates: [{ content: { parts: [{ text: 'plan', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'world' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 9 } },
    ));
    const r = parseResponse(mergeChunks(chunks));
    expect(r.text).toBe('Hello world');
    expect(r.finishReason).toBe('STOP');
    expect(r.usage?.totalTokenCount).toBe(9);
  });
  it('retries when a stream returns nothing', async () => {
    let n = 0;
    const c = new GeminiClient({ apiKey: 'k', model: 'm', backoffMs: 0, fetchImpl: (async () => (++n < 2 ? new Response('', { status: 200 }) : ok('fine'))) as any });
    expect((await c.generate({ prompt: 'x' })).text).toBe('fine');
    expect(n).toBe(2);
  });
});

describe('parseResponse', () => {
  it('skips thought parts and reports safety blocks', () => {
    expect(parseResponse({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'shown' }] } }] }).text).toBe('shown');
    expect(() => parseResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/blocked/);
    expect(() => parseResponse({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })).toThrow(/safety/);
  });
});

describe('normaliseOutline', () => {
  it('renumbers when numbering is broken', () => {
    const r = normaliseOutline([{ number: 1, title: 'A', beats: 'x' }, { number: 1, title: 'B', beats: 'y' }] as any, 21);
    expect(r.map((o) => o.number)).toEqual([21, 22]);
  });
  it('keeps correct numbering', () => {
    expect(normaliseOutline([{ number: 5, title: '"Chapter 5: Five"', beats: 'b' }], 5)).toEqual([{ number: 5, title: 'Five', beats: 'b' }]);
  });
});
