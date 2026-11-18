import { Repo } from './db';
import { HttpError } from './errors';
import { cleanChapterText, cleanTitle, countWords } from './format';
import { GeminiClient } from './gemini';
import {
  bibleSchema,
  biblePrompt,
  chapterPrompt,
  outlinePrompt,
  outlineSchema,
  rewritePrompt,
  summaryPrompt,
  systemPrompt,
  titlePrompt,
} from './prompts';
import type { Book, Chapter, ChapterOutline, Env, Settings, StoryBible } from './types';

export const DEFAULT_MODEL = 'gemini-3.8-flash';
const OUTLINE_BATCH = 20;
const SUMMARY_WINDOW = 12;
const TAIL_CHARS = 1800;

export async function loadSettings(env: Env, repo: Repo): Promise<Settings> {
  return repo.getSettings({ model: env.GEMINI_MODEL || DEFAULT_MODEL, temperature: 0.9 });
}

export function makeClient(env: Env, settings: Settings, fetchImpl?: typeof fetch) {
  return new GeminiClient({ apiKey: env.GEMINI_API_KEY, model: settings.model, baseUrl: env.GEMINI_BASE_URL, fetchImpl });
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
    const recent = await this.repo.previousSummaries(book.id, from, 5);
    const r = await this.ai.generateJson<{ outline: ChapterOutline[] }>({
      system: systemPrompt(book),
      prompt: outlinePrompt(book, bible, from, to, recent.map((c) => `Ch ${c.number}: ${c.summary}`).join('\n')),
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
      const previous = await this.repo.previousSummaries(bookId, number, SUMMARY_WINDOW);
      const prevChapter = number > 1 ? await this.repo.getChapterByNumber(bookId, number - 1) : null;

      const res = await this.ai.generate({
        system: systemPrompt(book),
        prompt: chapterPrompt(book, {
          number,
          outline,
          previous,
          previousTail: prevChapter ? prevChapter.content.slice(-TAIL_CHARS) : '',
          instruction: opts.instruction,
        }),
        temperature: this.settings.temperature,
      });
      const title0 = outline?.title ?? '';
      const content = cleanChapterText(res.text, title0);
      if (countWords(content) < 200) throw new HttpError(502, `Gemini returned a very short chapter (finishReason=${res.finishReason}). Try again.`);

      const [title, summary] = await Promise.all([
        title0 ? Promise.resolve(title0) : this.makeTitle(book, number, content),
        this.makeSummary(content),
      ]);
      return this.repo.upsertChapter({ bookId, number, title, content, summary, wordCount: countWords(content) });
    });
  }

  rewriteChapter(chapterId: string, instruction: string): Promise<Chapter> {
    if (!instruction.trim()) throw new HttpError(400, 'instruction is required');
    return this.repo.getChapter(chapterId).then((chapter) =>
      this.withJob(chapter.bookId, 'rewrite', `#${chapter.number}`, async () => {
        const book = await this.repo.getBook(chapter.bookId);
        const res = await this.ai.generate({
          system: systemPrompt(book),
          prompt: rewritePrompt(book, chapter, instruction),
          temperature: this.settings.temperature,
        });
        const content = cleanChapterText(res.text, chapter.title);
        const summary = await this.makeSummary(content);
        return this.repo.updateChapter(chapterId, { content, summary, wordCount: countWords(content) });
      }),
    );
  }

  async makeSummary(content: string): Promise<string> {
    const r = await this.ai.generate({ prompt: summaryPrompt(content), temperature: 0.3, maxOutputTokens: 4096 });
    return r.text.trim();
  }

  private async makeTitle(book: Book, number: number, content: string): Promise<string> {
    const r = await this.ai.generate({ prompt: titlePrompt(book, number, content), temperature: 0.8, maxOutputTokens: 2048 });
    return cleanTitle(r.text);
  }
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
