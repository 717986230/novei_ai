import { describe, expect, it } from 'vitest';
import { GeminiClient, parseResponse } from '../src/gemini';
import { normaliseOutline } from '../src/pipeline';

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });

describe('GeminiClient', () => {
  it('sends key header, system instruction and schema', async () => {
    let seen: any;
    const c = new GeminiClient({
      apiKey: 'k', model: 'gemini-x', baseUrl: 'https://gw.example/', backoffMs: 0,
      fetchImpl: (async (url: string, init: any) => { seen = { url, init }; return ok('{"a":1}'); }) as any,
    });
    const r = await c.generateJson<{ a: number }>({ system: 'S', prompt: 'P', responseSchema: { type: 'object' } });
    expect(r.a).toBe(1);
    expect(seen.url).toBe('https://gw.example/v1beta/models/gemini-x:generateContent');
    expect(seen.init.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(seen.init.body);
    expect(body.systemInstruction.parts[0].text).toBe('S');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
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

  it('requires an api key', () => {
    expect(() => new GeminiClient({ apiKey: '', model: 'm' })).toThrow(/GEMINI_API_KEY/);
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
