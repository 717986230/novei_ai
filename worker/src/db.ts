import { HttpError } from './errors';
import type { Book, Chapter, ChapterStatus, QcReport, Settings, StoryBible, StoryState } from './types';

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function rowToBook(r: any): Book {
  return {
    id: r.id,
    title: r.title,
    platform: r.platform,
    language: r.language,
    genre: r.genre,
    tropes: parseJson<string[]>(r.tropes, []),
    premise: r.premise,
    pov: r.pov,
    tense: r.tense,
    heatLevel: r.heat_level,
    wordsPerChapter: r.words_per_chapter,
    targetChapters: r.target_chapters,
    styleNotes: r.style_notes,
    bible: parseJson<StoryBible | null>(r.bible, null),
    autoDaily: r.auto_daily,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToChapter(r: any): Chapter {
  return {
    id: r.id,
    bookId: r.book_id,
    number: r.number,
    title: r.title,
    content: r.content ?? '',
    summary: r.summary ?? '',
    state: parseJson<StoryState | null>(r.state, null),
    qc: parseJson<QcReport | null>(r.qc, null),
    wordCount: r.word_count,
    status: r.status,
    publishedUrl: r.published_url,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class Repo {
  constructor(private db: D1Database) {}

  // ---------- books ----------
  async listBooks() {
    const { results } = await this.db
      .prepare(
        `SELECT b.*, COUNT(c.id) AS chapter_count, COALESCE(SUM(c.word_count),0) AS total_words,
                SUM(CASE WHEN c.status='published' THEN 1 ELSE 0 END) AS published_count
         FROM books b LEFT JOIN chapters c ON c.book_id=b.id
         GROUP BY b.id ORDER BY b.updated_at DESC`,
      )
      .all();
    return results.map((r: any) => ({
      ...rowToBook(r),
      bible: undefined,
      hasBible: !!r.bible,
      chapterCount: r.chapter_count ?? 0,
      totalWords: r.total_words ?? 0,
      publishedCount: r.published_count ?? 0,
    }));
  }

  async getBook(id: string): Promise<Book> {
    const r = await this.db.prepare('SELECT * FROM books WHERE id=?').bind(id).first();
    if (!r) throw new HttpError(404, 'Book not found');
    return rowToBook(r);
  }

  async createBook(b: Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'bible'>): Promise<Book> {
    const id = newId();
    const t = now();
    await this.db
      .prepare(
        `INSERT INTO books (id,title,platform,language,genre,tropes,premise,pov,tense,heat_level,words_per_chapter,target_chapters,style_notes,auto_daily,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(id, b.title, b.platform, b.language, b.genre, JSON.stringify(b.tropes), b.premise, b.pov, b.tense, b.heatLevel, b.wordsPerChapter, b.targetChapters, b.styleNotes, b.autoDaily, t, t)
      .run();
    return this.getBook(id);
  }

  async updateBook(id: string, patch: Partial<Book>): Promise<Book> {
    const map: Record<string, [string, (v: any) => unknown]> = {
      title: ['title', String],
      platform: ['platform', String],
      language: ['language', String],
      genre: ['genre', String],
      tropes: ['tropes', (v) => JSON.stringify(v)],
      premise: ['premise', String],
      pov: ['pov', String],
      tense: ['tense', String],
      heatLevel: ['heat_level', String],
      wordsPerChapter: ['words_per_chapter', Number],
      targetChapters: ['target_chapters', Number],
      styleNotes: ['style_notes', String],
      bible: ['bible', (v) => (v ? JSON.stringify(v) : null)],
      autoDaily: ['auto_daily', Number],
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const m = map[k];
      if (!m || v === undefined) continue;
      sets.push(`${m[0]}=?`);
      vals.push(m[1](v));
    }
    if (sets.length) {
      sets.push('updated_at=?');
      vals.push(now(), id);
      const r = await this.db.prepare(`UPDATE books SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
      if (!r.meta.changes) throw new HttpError(404, 'Book not found');
    }
    return this.getBook(id);
  }

  async touchBook(id: string) {
    await this.db.prepare('UPDATE books SET updated_at=? WHERE id=?').bind(now(), id).run();
  }

  async deleteBook(id: string) {
    await this.db.batch([
      this.db.prepare('DELETE FROM chapters WHERE book_id=?').bind(id),
      this.db.prepare('DELETE FROM jobs WHERE book_id=?').bind(id),
      this.db.prepare('DELETE FROM books WHERE id=?').bind(id),
    ]);
  }

  async booksWithAutoDaily(): Promise<Book[]> {
    const { results } = await this.db.prepare('SELECT * FROM books WHERE auto_daily>0 ORDER BY updated_at').all();
    return results.map(rowToBook);
  }

  // ---------- chapters ----------
  async listChapters(bookId: string, withContent = false): Promise<Chapter[]> {
    const cols = withContent
      ? '*'
      : "id,book_id,number,title,'' AS content,summary,NULL AS state,qc,word_count,status,published_url,published_at,created_at,updated_at";
    const { results } = await this.db.prepare(`SELECT ${cols} FROM chapters WHERE book_id=? ORDER BY number`).bind(bookId).all();
    return results.map(rowToChapter);
  }

  async getChapter(id: string): Promise<Chapter> {
    const r = await this.db.prepare('SELECT * FROM chapters WHERE id=?').bind(id).first();
    if (!r) throw new HttpError(404, 'Chapter not found');
    return rowToChapter(r);
  }

  async getChapterByNumber(bookId: string, number: number): Promise<Chapter | null> {
    const r = await this.db.prepare('SELECT * FROM chapters WHERE book_id=? AND number=?').bind(bookId, number).first();
    return r ? rowToChapter(r) : null;
  }

  async nextChapterNumber(bookId: string): Promise<number> {
    const r = await this.db.prepare('SELECT COALESCE(MAX(number),0) AS n FROM chapters WHERE book_id=?').bind(bookId).first<{ n: number }>();
    return (r?.n ?? 0) + 1;
  }

  /** Summaries of chapters before `number` (most recent `limit`). */
  async previousSummaries(bookId: string, number: number, limit: number) {
    const { results } = await this.db
      .prepare('SELECT number,title,summary FROM chapters WHERE book_id=? AND number<? ORDER BY number DESC LIMIT ?')
      .bind(bookId, number, limit)
      .all<{ number: number; title: string; summary: string }>();
    return results.reverse();
  }

  /** Continuity ledger at the end of the closest earlier chapter (normally number-1). */
  async stateBefore(bookId: string, number: number): Promise<StoryState | null> {
    const r = await this.db
      .prepare('SELECT state FROM chapters WHERE book_id=? AND number<? AND state IS NOT NULL ORDER BY number DESC LIMIT 1')
      .bind(bookId, number)
      .first<{ state: string }>();
    return parseJson<StoryState | null>(r?.state, null);
  }

  async latestState(bookId: string): Promise<StoryState | null> {
    return this.stateBefore(bookId, Number.MAX_SAFE_INTEGER);
  }

  async upsertChapter(c: {
    bookId: string;
    number: number;
    title: string;
    content: string;
    summary: string;
    state: StoryState | null;
    wordCount: number;
  }): Promise<Chapter> {
    const t = now();
    await this.db
      .prepare(
        `INSERT INTO chapters (id,book_id,number,title,content,summary,state,word_count,status,published_url,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,'draft','',?,?)
         ON CONFLICT(book_id,number) DO UPDATE SET title=excluded.title, content=excluded.content, summary=excluded.summary,
           state=excluded.state, word_count=excluded.word_count, updated_at=excluded.updated_at`,
      )
      .bind(newId(), c.bookId, c.number, c.title, c.content, c.summary, c.state ? JSON.stringify(c.state) : null, c.wordCount, t, t)
      .run();
    await this.touchBook(c.bookId);
    return (await this.getChapterByNumber(c.bookId, c.number))!;
  }

  async updateChapter(
    id: string,
    patch: Partial<Pick<Chapter, 'title' | 'content' | 'summary' | 'status' | 'publishedUrl' | 'state' | 'qc'>> & { wordCount?: number },
  ): Promise<Chapter> {
    const current = await this.getChapter(id);
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
      sets.push(`${col}=?`);
      vals.push(v);
    };
    if (patch.title !== undefined) set('title', patch.title);
    if (patch.content !== undefined) set('content', patch.content);
    if (patch.wordCount !== undefined) set('word_count', patch.wordCount);
    if (patch.summary !== undefined) set('summary', patch.summary);
    if (patch.state !== undefined) set('state', patch.state ? JSON.stringify(patch.state) : null);
    if (patch.qc !== undefined) set('qc', patch.qc ? JSON.stringify(patch.qc) : null);
    if (patch.publishedUrl !== undefined) set('published_url', patch.publishedUrl);
    if (patch.status !== undefined) {
      if (!['draft', 'ready', 'published'].includes(patch.status)) throw new HttpError(400, 'Invalid status');
      set('status', patch.status as ChapterStatus);
      if (patch.status === 'published' && current.status !== 'published') set('published_at', now());
      if (patch.status !== 'published') set('published_at', null);
    }
    if (sets.length) {
      set('updated_at', now());
      vals.push(id);
      await this.db.prepare(`UPDATE chapters SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
      await this.touchBook(current.bookId);
    }
    return this.getChapter(id);
  }

  async deleteChapter(id: string) {
    await this.db.prepare('DELETE FROM chapters WHERE id=?').bind(id).run();
  }

  // ---------- jobs (also used as a per-book lock) ----------
  async startJob(bookId: string | null, type: string, detail = ''): Promise<string> {
    if (bookId) {
      // A job older than 15 minutes is considered dead (generation + automatic QC can take several minutes).
      const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await this.db
        .prepare("UPDATE jobs SET status='failed', error='timed out', finished_at=? WHERE book_id=? AND status='running' AND created_at<?")
        .bind(now(), bookId, stale)
        .run();
      const running = await this.db
        .prepare("SELECT type, detail FROM jobs WHERE book_id=? AND status='running' LIMIT 1")
        .bind(bookId)
        .first<{ type: string; detail: string }>();
      if (running) throw new HttpError(409, `This book is busy (${running.type} ${running.detail}). Wait for it to finish.`);
    }
    const id = newId();
    await this.db
      .prepare("INSERT INTO jobs (id,book_id,type,status,detail,created_at) VALUES (?,?,?,'running',?,?)")
      .bind(id, bookId, type, detail, now())
      .run();
    return id;
  }

  async finishJob(id: string, error?: string) {
    await this.db
      .prepare('UPDATE jobs SET status=?, error=?, finished_at=? WHERE id=?')
      .bind(error ? 'failed' : 'done', error ?? '', now(), id)
      .run();
  }

  async listJobs(bookId?: string, limit = 30) {
    const q = bookId
      ? this.db.prepare('SELECT * FROM jobs WHERE book_id=? ORDER BY created_at DESC LIMIT ?').bind(bookId, limit)
      : this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').bind(limit);
    const { results } = await q.all();
    return results;
  }

  // ---------- settings ----------
  async getSettings(defaults: Settings): Promise<Settings> {
    const { results } = await this.db.prepare('SELECT key,value FROM settings').all<{ key: string; value: string }>();
    const s: Settings = { ...defaults };
    for (const r of results) {
      if (r.key === 'model' && r.value) s.model = r.value;
      if (r.key === 'fallbackModel') s.fallbackModel = r.value;
      if (r.key === 'autoQc') s.autoQc = r.value !== 'false';
      if (r.key === 'temperature' && !Number.isNaN(Number(r.value))) s.temperature = Number(r.value);
    }
    return s;
  }

  async saveSettings(s: Partial<Settings>) {
    const stmts = Object.entries(s)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => this.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, String(v)));
    if (stmts.length) await this.db.batch(stmts);
  }
}
