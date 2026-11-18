import { Repo } from './db';
import { HttpError } from './errors';
import { cleanChapterText, cleanTitle, countWords } from './format';
import { GeminiClient } from './gemini';
import {
  bibleSchema,
  biblePrompt,
  chapterPrompt,
  checkPrompt,
  expandPrompt,
  checkSchema,
  outlinePrompt,
  outlineSchema,
  rewritePrompt,
  statePrompt,
  stateSchema,
  systemPrompt,
  titlePrompt,
} from './prompts';
import type { Book, Chapter, ChapterOutline, Env, Settings, StoryBible, StoryState } from './types';

export interface ContinuityIssue {
  severity: 'high' | 'medium' | 'low';
  category: string;
  quote: string;
  problem: string;
  fix: string;
}

export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_FALLBACK = 'gemini-3.5-flash-lite';
const OUTLINE_BATCH = 20;
const SUMMARY_WINDOW = 12;
const TAIL_CHARS = 1800;

export async function loadSettings(env: Env, repo: Repo): Promise<Settings> {
  return repo.getSettings({ model: env.GEMINI_MODEL || DEFAULT_MODEL, fallbackModel: DEFAULT_FALLBACK, temperature: 0.9 });
}

export function makeClient(env: Env, settings: Settings, fetchImpl?: typeof fetch) {
  return new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    model: settings.model,
    fallbackModels: settings.fallbackModel ? [settings.fallbackModel] : [],
    baseUrl: env.GEMINI_BASE_URL,
    fetchImpl,
  });
}

export class Pipeline {
  constructor(private repo: Repo, readonly ai: GeminiClient, private settings: Settings) {}

  private async withJob<T>(bookId: string, type: string, detail: string, fn: () => Promise<T>): Promise<T> {
    const jobId = await this.repo.startJob(bookId, type, detail);
    try {
      const r = await fn();
      await this.repo.finishJob(jobId);
      return r;
    } catch (e) {
      await this.repo.finishJob(jobId, (e as Error).message);
      throw e;
    }
  }

  /** Story bible + first batch of chapter outlines. */
  generateBible(bookId: string): Promise<Book> {
    return this.withJob(bookId, 'bible', '', async () => {
      const book = await this.repo.getBook(bookId);
      const count = Math.min(OUTLINE_BATCH, book.targetChapters);
      const bible = await this.ai.generateJson<StoryBible>({
        system: systemPrompt(book),
        prompt: biblePrompt(book, count),
        responseSchema: bibleSchema,
        temperature: this.settings.temperature,
      });
      bible.outline = normaliseOutline(bible.outline, 1);
      return this.repo.updateBook(bookId, { bible });
    });
  }

  /** Append the next batch of outlines after the last outlined chapter. */
  extendOutline(bookId: string, count = OUTLINE_BATCH): Promise<Book> {
    return this.withJob(bookId, 'outline', '', async () => {
      const book = await this.repo.getBook(bookId);
      if (!book.bible) throw new HttpError(400, 'Generate the story bible first');
      return this.extendOutlineInner(book, count);
    });
  }

  private async extendOutlineInner(book: Book, count: number): Promise<Book> {
    const bible = book.bible!;
    const last = bible.outline.reduce((m, o) => Math.max(m, o.number), 0);
    const from = last + 1;
    const to = from + count - 1;
    const recent = await this.repo.previousSummaries(book.id, from, 8);
    const state = await this.repo.latestState(book.id);
    const r = await this.ai.generateJson<{ outline: ChapterOutline[] }>({
      system: systemPrompt(book),
      prompt: outlinePrompt(book, bible, from, to, recent.map((c) => `Ch ${c.number}: ${c.summary}`).join('\n'), state),
      responseSchema: outlineSchema,
      temperature: this.settings.temperature,
    });
    const added = normaliseOutline(r.outline, from).filter((o) => o.number >= from);
    bible.outline = [...bible.outline.filter((o) => o.number < from), ...added];
    return this.repo.updateBook(book.id, { bible });
  }

  /** Generate (or regenerate) a chapter. Defaults to the next chapter number. */
  generateChapter(bookId: string, opts: { number?: number; instruction?: string } = {}): Promise<Chapter> {
    return this.withJob(bookId, 'chapter', opts.number ? `#${opts.number}` : 'next', async () => {
      let book = await this.repo.getBook(bookId);
      const number = opts.number ?? (await this.repo.nextChapterNumber(bookId));
      if (number < 1) throw new HttpError(400, 'Chapter number must be >= 1');

      // Keep the outline ahead of the writing.
      if (book.bible && !book.bible.outline.some((o) => o.number === number) && number <= book.targetChapters + 50) {
        book = await this.extendOutlineInner(book, OUTLINE_BATCH);
      }
      const outline = book.bible?.outline.find((o) => o.number === number);
      const nextOutline = book.bible?.outline.find((o) => o.number === number + 1);
      const previous = await this.repo.previousSummaries(bookId, number, SUMMARY_WINDOW);
      const prevChapter = number > 1 ? await this.repo.getChapterByNumber(bookId, number - 1) : null;
      const state = await this.repo.stateBefore(bookId, number);

      const res = await this.ai.generate({
        system: systemPrompt(book),
        prompt: chapterPrompt(book, {
          number,
          outline,
          nextOutline,
          previous,
          state,
          previousTail: prevChapter ? prevChapter.content.slice(-TAIL_CHARS) : '',
          instruction: opts.instruction,
        }),
        temperature: this.settings.temperature,
      });
      const title0 = outline?.title ?? '';
      let content = cleanChapterText(res.text, title0);
      if (countWords(content) < 200) throw new HttpError(502, `Gemini returned a very short chapter (finishReason=${res.finishReason}). Try again.`);
      content = await this.expandIfShort(book, number, content);

      const [title, ledger] = await Promise.all([
        title0 ? Promise.resolve(title0) : this.makeTitle(book, number, content),
        this.makeLedger(book, number, content, state),
      ]);
      return this.repo.upsertChapter({ bookId, number, title, content, summary: ledger.summary, state: ledger.state, wordCount: countWords(content) });
    });
  }

  rewriteChapter(chapterId: string, instruction: string): Promise<Chapter> {
    if (!instruction.trim()) throw new HttpError(400, 'instruction is required');
    return this.repo.getChapter(chapterId).then((chapter) =>
      this.withJob(chapter.bookId, 'rewrite', `#${chapter.number}`, async () => {
        const book = await this.repo.getBook(chapter.bookId);
        const prevState = await this.repo.stateBefore(book.id, chapter.number);
        const res = await this.ai.generate({
          system: systemPrompt(book),
          prompt: rewritePrompt(book, chapter, instruction, prevState),
          temperature: this.settings.temperature,
        });
        const content = cleanChapterText(res.text, chapter.title);
        const ledger = await this.makeLedger(book, chapter.number, content, prevState);
        return this.repo.updateChapter(chapterId, { content, summary: ledger.summary, state: ledger.state, wordCount: countWords(content) });
      }),
    );
  }

  /** One expansion pass when the model under-delivers on length (common with lite/fallback models). */
  private async expandIfShort(book: Book, number: number, content: string): Promise<string> {
    const words = countWords(content);
    if (words >= book.wordsPerChapter * 0.8) return content;
    try {
      const r = await this.ai.generate({ system: systemPrompt(book), prompt: expandPrompt(book, number, content, words), temperature: this.settings.temperature });
      const expanded = cleanChapterText(r.text);
      // Accept only if it really got longer.
      return countWords(expanded) > words * 1.15 ? expanded : content;
    } catch {
      return content;
    }
  }

  /** Summary + continuity ledger as of the end of this chapter. */
  async makeLedger(book: Book, number: number, content: string, prevState: StoryState | null): Promise<{ summary: string; state: StoryState }> {
    const r = await this.ai.generateJson<{ summary: string; state: StoryState }>({
      prompt: statePrompt(book, number, content, prevState),
      responseSchema: stateSchema,
      temperature: 0.2,
    });
    return { summary: String(r.summary ?? '').trim(), state: normaliseState(r.state) };
  }

  /** Re-extract the ledger for a chapter (e.g. after manual edits). */
  refreshLedger(chapterId: string): Promise<Chapter> {
    return this.repo.getChapter(chapterId).then((chapter) =>
      this.withJob(chapter.bookId, 'ledger', `#${chapter.number}`, async () => {
        const book = await this.repo.getBook(chapter.bookId);
        const prevState = await this.repo.stateBefore(book.id, chapter.number);
        const ledger = await this.makeLedger(book, chapter.number, chapter.content, prevState);
        return this.repo.updateChapter(chapterId, { summary: ledger.summary, state: ledger.state });
      }),
    );
  }

  /** Continuity check against bible + ledger + earlier summaries. Read-only. */
  async checkChapter(chapterId: string): Promise<ContinuityIssue[]> {
    const chapter = await this.repo.getChapter(chapterId);
    const book = await this.repo.getBook(chapter.bookId);
    const [prevState, previous] = await Promise.all([
      this.repo.stateBefore(book.id, chapter.number),
      this.repo.previousSummaries(book.id, chapter.number, SUMMARY_WINDOW),
    ]);
    const r = await this.ai.generateJson<{ issues: ContinuityIssue[] }>({
      prompt: checkPrompt(book, chapter, prevState, previous),
      responseSchema: checkSchema,
      temperature: 0.1,
    });
    return (r.issues ?? []).filter((i) => i && i.problem);
  }

  /** Rewrite the chapter fixing the given issues (minimal edits). */
  fixChapter(chapterId: string, issues: ContinuityIssue[]): Promise<Chapter> {
    if (!issues.length) throw new HttpError(400, 'No issues to fix');
    const instruction = [
      'Fix ONLY these continuity errors with minimal changes; keep everything else (wording, events, length) as is:',
      ...issues.map((i, n) => `${n + 1}. At "${i.quote}": ${i.problem} -> ${i.fix}`),
    ].join('\n');
    return this.rewriteChapter(chapterId, instruction);
  }

  private async makeTitle(book: Book, number: number, content: string): Promise<string> {
    const r = await this.ai.generate({ prompt: titlePrompt(book, number, content), temperature: 0.8, maxOutputTokens: 2048 });
    return cleanTitle(r.text);
  }
}

export function normaliseState(s: Partial<StoryState> | undefined): StoryState {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  return {
    time: str(s?.time),
    location: str(s?.location),
    characters: (Array.isArray(s?.characters) ? s!.characters : [])
      .filter((c: any) => c && str(c.name))
      .map((c: any) => ({ name: str(c.name), status: str(c.status), location: str(c.location), knowledge: str(c.knowledge), relationships: str(c.relationships) })),
    openThreads: list(s?.openThreads).slice(0, 30),
    facts: [...new Set(list(s?.facts))].slice(0, 60),
  };
}

export function normaliseOutline(items: ChapterOutline[] | undefined, startAt: number): ChapterOutline[] {
  const list = (items ?? []).filter((o) => o && (o.title || o.beats));
  // If the model forgot or mangled numbering, renumber sequentially.
  const numbersOk = list.every((o, i) => Number.isInteger(o.number) && o.number === list[0].number + i) && list[0]?.number === startAt;
  return list.map((o, i) => ({
    number: numbersOk ? o.number : startAt + i,
    title: cleanTitle(String(o.title ?? '')),
    beats: String(o.beats ?? '').trim(),
  }));
}

/**
 * Cron entry: for each book with autoDaily > 0, generate that many chapters.
 * Stops early if a book has reached its target. Errors are recorded per book and don't stop others.
 */
export async function runDaily(env: Env, fetchImpl?: typeof fetch, maxTotal = 10) {
  const repo = new Repo(env.DB);
  const settings = await loadSettings(env, repo);
  const pipeline = new Pipeline(repo, makeClient(env, settings, fetchImpl), settings);
  const report: { bookId: string; title: string; generated: number; error?: string }[] = [];
  let total = 0;
  for (const book of await repo.booksWithAutoDaily()) {
    const entry = { bookId: book.id, title: book.title, generated: 0 } as (typeof report)[number];
    report.push(entry);
    try {
      if (!book.bible) await pipeline.generateBible(book.id);
      for (let i = 0; i < book.autoDaily && total < maxTotal; i++) {
        const next = await repo.nextChapterNumber(book.id);
        if (next > book.targetChapters) break;
        await pipeline.generateChapter(book.id);
        entry.generated++;
        total++;
      }
    } catch (e) {
      entry.error = (e as Error).message;
    }
  }
  return report;
}
