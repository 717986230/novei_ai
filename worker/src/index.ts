import { Hono } from 'hono';
import { Repo } from './db';
import { HttpError } from './errors';
import { countWords, exportBook, type ExportFormat } from './format';
import { Pipeline, loadSettings, makeClient, runDaily } from './pipeline';
import { LANGUAGE_NAMES, PLATFORMS, getPlatform } from './platforms';
import type { Book, Env, PlatformId } from './types';

type Ctx = { Bindings: Env; Variables: { repo: Repo } };
const app = new Hono<Ctx>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});

// ---- auth: single-owner bearer token ----
app.use('*', async (c, next) => {
  if (c.req.path === '/api/health') return next();
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) throw new HttpError(500, 'ADMIN_TOKEN is not configured (npx wrangler secret put ADMIN_TOKEN)');
  const got = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await safeEqual(got, expected))) throw new HttpError(401, 'Unauthorized');
  c.set('repo', new Repo(c.env.DB));
  await next();
});

async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && a.length > 0;
}

const pipelineFor = async (c: { env: Env; get: (k: 'repo') => Repo }) => {
  const repo = c.get('repo');
  const settings = await loadSettings(c.env, repo);
  return new Pipeline(repo, makeClient(c.env, settings), settings);
};

// ---- meta ----
app.get('/health', (c) =>
  c.json({ ok: true, gemini: !!c.env.GEMINI_API_KEY, auth: !!c.env.ADMIN_TOKEN, model: c.env.GEMINI_MODEL ?? null }),
);
app.get('/platforms', (c) => c.json({ platforms: Object.values(PLATFORMS), languages: LANGUAGE_NAMES }));

app.get('/settings', async (c) => c.json(await loadSettings(c.env, c.get('repo'))));
app.put('/settings', async (c) => {
  const b = await c.req.json<{ model?: string; temperature?: number }>();
  const patch: Record<string, unknown> = {};
  if (b.model !== undefined) {
    if (!/^[\w.\-]+$/.test(b.model)) throw new HttpError(400, 'Invalid model id');
    patch.model = b.model;
  }
  if (b.temperature !== undefined) {
    const t = Number(b.temperature);
    if (!(t >= 0 && t <= 2)) throw new HttpError(400, 'temperature must be 0-2');
    patch.temperature = t;
  }
  await c.get('repo').saveSettings(patch);
  return c.json(await loadSettings(c.env, c.get('repo')));
});
app.post('/settings/test', async (c) => {
  const p = await pipelineFor(c);
  const t0 = Date.now();
  const r = await p.ai.generate({ prompt: 'Reply with the single word: ready', maxOutputTokens: 1024, temperature: 0 });
  return c.json({ ok: true, model: p.ai.model, reply: r.text.trim().slice(0, 50), ms: Date.now() - t0 });
});

// ---- books ----
function validateBook(input: any, partial: boolean): Partial<Book> {
  const out: Partial<Book> = {};
  const str = (k: string, max: number) => {
    if (input[k] === undefined) return;
    if (typeof input[k] !== 'string') throw new HttpError(400, `${k} must be a string`);
    if (input[k].length > max) throw new HttpError(400, `${k} is too long (max ${max})`);
    (out as any)[k] = input[k].trim();
  };
  const int = (k: string, min: number, max: number) => {
    if (input[k] === undefined) return;
    const n = Number(input[k]);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${k} must be an integer ${min}-${max}`);
    (out as any)[k] = n;
  };
  const oneOf = (k: string, vals: string[]) => {
    if (input[k] === undefined) return;
    if (!vals.includes(input[k])) throw new HttpError(400, `${k} must be one of ${vals.join(', ')}`);
    (out as any)[k] = input[k];
  };
  str('title', 200);
  oneOf('platform', Object.keys(PLATFORMS));
  oneOf('language', Object.keys(LANGUAGE_NAMES));
  str('genre', 100);
  str('premise', 4000);
  oneOf('pov', ['first', 'third']);
  oneOf('tense', ['past', 'present']);
  oneOf('heatLevel', ['clean', 'sweet', 'steamy']);
  int('wordsPerChapter', 500, 8000);
  int('targetChapters', 1, 3000);
  str('styleNotes', 4000);
  int('autoDaily', 0, 10);
  if (input.tropes !== undefined) {
    if (!Array.isArray(input.tropes) || input.tropes.some((t: unknown) => typeof t !== 'string')) throw new HttpError(400, 'tropes must be an array of strings');
    out.tropes = input.tropes.map((t: string) => t.trim()).filter(Boolean).slice(0, 20);
  }
  if (input.bible !== undefined) out.bible = input.bible; // manual edits to the story bible
  if (!partial && !out.title) throw new HttpError(400, 'title is required');
  if (!partial && !out.platform) throw new HttpError(400, 'platform is required');
  if (out.platform && out.language && !PLATFORMS[out.platform as PlatformId].languages.includes(out.language)) {
    throw new HttpError(400, `${PLATFORMS[out.platform as PlatformId].name} does not support language ${out.language}`);
  }
  return out;
}

app.get('/books', async (c) => c.json({ books: await c.get('repo').listBooks() }));

app.post('/books', async (c) => {
  const v = validateBook(await c.req.json(), false);
  const p = getPlatform(v.platform!);
  const book = await c.get('repo').createBook({
    title: v.title!,
    platform: p.id,
    language: v.language ?? 'en',
    genre: v.genre ?? p.genres[0],
    tropes: v.tropes ?? [],
    premise: v.premise ?? '',
    pov: v.pov ?? p.defaultPov,
    tense: v.tense ?? p.defaultTense,
    heatLevel: v.heatLevel ?? 'sweet',
    wordsPerChapter: v.wordsPerChapter ?? p.defaultWords,
    targetChapters: v.targetChapters ?? 100,
    styleNotes: v.styleNotes ?? '',
    autoDaily: v.autoDaily ?? 0,
  });
  return c.json({ book }, 201);
});

app.get('/books/:id', async (c) => {
  const repo = c.get('repo');
  const id = c.req.param('id');
  const [book, chapters, jobs] = await Promise.all([repo.getBook(id), repo.listChapters(id), repo.listJobs(id, 10)]);
  return c.json({ book, chapters, jobs });
});

app.patch('/books/:id', async (c) => {
  const v = validateBook(await c.req.json(), true);
  return c.json({ book: await c.get('repo').updateBook(c.req.param('id'), v) });
});

app.delete('/books/:id', async (c) => {
  await c.get('repo').deleteBook(c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/books/:id/bible', async (c) => c.json({ book: await (await pipelineFor(c)).generateBible(c.req.param('id')) }));
app.post('/books/:id/outline', async (c) => c.json({ book: await (await pipelineFor(c)).extendOutline(c.req.param('id')) }));

app.post('/books/:id/chapters/generate', async (c) => {
  const b = await c.req.json<{ number?: number; instruction?: string }>().catch(() => ({}) as any);
  const chapter = await (await pipelineFor(c)).generateChapter(c.req.param('id'), {
    number: b.number ? Number(b.number) : undefined,
    instruction: typeof b.instruction === 'string' ? b.instruction.slice(0, 2000) : undefined,
  });
  return c.json({ chapter });
});

app.get('/books/:id/export', async (c) => {
  const repo = c.get('repo');
  const book = await repo.getBook(c.req.param('id'));
  const format = (c.req.query('format') ?? 'txt') as ExportFormat;
  if (!['txt', 'md', 'html'].includes(format)) throw new HttpError(400, 'format must be txt, md or html');
  const from = Number(c.req.query('from') ?? 1);
  const to = Number(c.req.query('to') ?? Number.MAX_SAFE_INTEGER);
  const onlyUnpublished = c.req.query('unpublished') === '1';
  const chapters = (await repo.listChapters(book.id, true)).filter(
    (ch) => ch.number >= from && ch.number <= to && (!onlyUnpublished || ch.status !== 'published'),
  );
  const withNote = c.req.query('note') !== '0';
  const body = exportBook(book.title, chapters, format, { authorNote: withNote ? getPlatform(book.platform).disclosureNote : '' });
  const type = { txt: 'text/plain', md: 'text/markdown', html: 'text/html' }[format];
  const filename = `${book.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'book'}.${format}`;
  return new Response(body, {
    headers: { 'content-type': `${type}; charset=utf-8`, 'content-disposition': `attachment; filename="${filename}"` },
  });
});

app.get('/books/:id/jobs', async (c) => c.json({ jobs: await c.get('repo').listJobs(c.req.param('id')) }));

// ---- chapters ----
app.get('/chapters/:id', async (c) => c.json({ chapter: await c.get('repo').getChapter(c.req.param('id')) }));

app.patch('/chapters/:id', async (c) => {
  const b = await c.req.json<any>();
  const patch: any = {};
  for (const k of ['title', 'content', 'summary', 'status', 'publishedUrl']) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== 'string') throw new HttpError(400, `${k} must be a string`);
      patch[k] = b[k];
    }
  }
  if (patch.content !== undefined) patch.wordCount = countWords(patch.content);
  return c.json({ chapter: await c.get('repo').updateChapter(c.req.param('id'), patch) });
});

app.post('/chapters/:id/rewrite', async (c) => {
  const b = await c.req.json<{ instruction?: string }>();
  return c.json({ chapter: await (await pipelineFor(c)).rewriteChapter(c.req.param('id'), String(b.instruction ?? '').slice(0, 2000)) });
});

app.post('/chapters/:id/summary', async (c) => {
  const repo = c.get('repo');
  const ch = await repo.getChapter(c.req.param('id'));
  const summary = await (await pipelineFor(c)).makeSummary(ch.content);
  return c.json({ chapter: await repo.updateChapter(ch.id, { summary }) });
});

app.delete('/chapters/:id', async (c) => {
  await c.get('repo').deleteChapter(c.req.param('id'));
  return c.json({ ok: true });
});

// ---- manual trigger of the daily job (same as cron) ----
app.post('/cron/run', async (c) => c.json({ report: await runDaily(c.env) }));

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runDaily(env).then((r) => console.log('daily generation', JSON.stringify(r))),
    );
  },
} satisfies ExportedHandler<Env>;

export { app };
