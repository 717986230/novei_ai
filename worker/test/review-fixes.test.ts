import { describe, expect, it } from 'vitest';
import { Repo } from '../src/db';
import { HttpError } from '../src/errors';
import { mergeStates } from '../src/pipeline';
import { selectionPrompt, selectionSchema } from '../src/prompts';
import type { Book, Chapter, StoryState } from '../src/types';

// ---------------------------------------------------------------------------
// Minimal in-memory D1 stand-in. It only implements the SQL shapes the Repo
// methods under test actually issue (INSERT / SELECT / UPDATE / DELETE with
// `?` binds, ORDER BY col ASC/DESC, LIMIT ?). Anything else throws, so a
// test fails loudly instead of silently passing against a wrong query.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

class FakeStmt {
  constructor(
    private db: FakeDb,
    private sql: string,
    private params: any[] = [],
  ) {}
  bind(...params: any[]) {
    return new FakeStmt(this.db, this.sql, params);
  }
  async run() {
    return this.db.exec(this.sql, this.params);
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.query(this.sql, this.params) as T[] };
  }
  async first<T>(): Promise<T | null> {
    const r = this.db.query(this.sql, this.params);
    return (r[0] ?? null) as T | null;
  }
}

class FakeDb {
  tables: Record<string, Row[]> = { books: [], chapters: [], chapter_versions: [], chapter_issues: [], jobs: [], settings: [] };
  private seq = 0;

  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }
  async batch(stmts: FakeStmt[]) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }

  exec(sql: string, params: any[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO/i.test(s)) return this.insert(s, params);
    if (/^UPDATE/i.test(s)) return this.update(s, params);
    if (/^DELETE FROM/i.test(s)) return this.delete(s, params);
    throw new Error(`FakeDb: unsupported statement: ${s}`);
  }

  query(sql: string, params: any[]): Row[] {
    const s = sql.replace(/\s+/g, ' ').trim();
    const m = s.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (.*?))?(?: ORDER BY (.*?))?(?: LIMIT (?:\?|\d+))?$/i);
    if (!m) throw new Error(`FakeDb: unsupported SELECT: ${s}`);
    const [, , table, where, order] = m;
    let rows = [...(this.tables[table] ?? [])];
    let p = 0;
    if (where) {
      for (const cond of where.split(/\s+AND\s+/i)) {
        const c = cond.trim();
        const eq = c.match(/^(\w+)\s*=\s*\?$/);
        const lit = c.match(/^(\w+)\s*=\s*'([^']*)'$/);
        const litNum = c.match(/^(\w+)\s*=\s*(\d+)$/);
        const notIn = c.match(/^(\w+)\s+NOT IN \(([\?,\s]+)\)$/);
        const isNotNull = c.match(/^(\w+) IS NOT NULL$/);
        if (eq) {
          const v = params[p++];
          rows = rows.filter((r) => r[eq[1]] === v);
        } else if (lit) {
          rows = rows.filter((r) => r[lit[1]] === lit[2]);
        } else if (litNum) {
          rows = rows.filter((r) => r[litNum[1]] === Number(litNum[2]));
        } else if (notIn) {
          const n = notIn[2].split(',').length;
          const vals = params.slice(p, p + n);
          p += n;
          rows = rows.filter((r) => !vals.includes(r[notIn[1]]));
        } else if (isNotNull) {
          rows = rows.filter((r) => r[isNotNull[1]] !== null && r[isNotNull[1]] !== undefined);
        } else {
          throw new Error(`FakeDb: unsupported WHERE condition: ${c}`);
        }
      }
    }
    if (order) {
      for (const part of order.split(',').reverse()) {
        const om = part.trim().match(/^(\w+)(?: (ASC|DESC))?$/i);
        if (!om) continue; // e.g. CASE severity ... — ignored, tests do not depend on it
        const [, col, dir] = om;
        const key = col === 'rowid' ? '_seq' : col;
        rows.sort((a, b) => {
          if (a[key] === b[key]) return 0;
          return (a[key] < b[key] ? -1 : 1) * (dir?.toUpperCase() === 'DESC' ? -1 : 1);
        });
      }
    }
    const lm = s.match(/\bLIMIT (\?|\d+)$/);
    const limit = lm ? (lm[1] === '?' ? params[params.length - 1] : Number(lm[1])) : undefined;
    if (typeof limit === 'number') rows = rows.slice(0, limit);
    return rows;
  }

  private insert(sql: string, params: any[]) {
    const m = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/i);
    if (!m) throw new Error(`FakeDb: unsupported INSERT: ${sql}`);
    const [, table, cols, vals] = m;
    const row: Row = { _seq: ++this.seq };
    let p = 0;
    cols.split(',').forEach((col, i) => {
      const tok = vals.split(',')[i].trim();
      if (tok === '?') row[col.trim()] = params[p++];
      else if (/^'.*'$/.test(tok)) row[col.trim()] = tok.slice(1, -1);
      else row[col.trim()] = Number(tok);
    });
    (this.tables[table] ??= []).push(row);
    return { meta: { changes: 1 } };
  }

  private update(sql: string, params: any[]) {
    const m = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
    if (!m) throw new Error(`FakeDb: unsupported UPDATE: ${sql}`);
    const [, table, setPart, wherePart] = m;
    let p = 0;
    const sets: [string, any][] = [];
    for (const a of setPart.split(',')) {
      const [col, tok] = a.split('=').map((x) => x.trim());
      if (tok === '?') sets.push([col, params[p++]]);
      else if (/^'.*'$/.test(tok)) sets.push([col, tok.slice(1, -1)]);
      else sets.push([col, Number(tok)]);
    }
    const rows = (this.tables[table] ?? []).filter((r) => this.matchesWhere(r, wherePart, params.slice(p)));
    for (const r of rows) for (const [col, v] of sets) r[col] = v;
    return { meta: { changes: rows.length } };
  }

  private delete(sql: string, params: any[]) {
    const m = sql.match(/^DELETE FROM (\w+) WHERE (.+)$/i);
    if (!m) throw new Error(`FakeDb: unsupported DELETE: ${sql}`);
    const [, table, wherePart] = m;
    const before = (this.tables[table] ?? []).length;
    this.tables[table] = (this.tables[table] ?? []).filter((r) => !this.matchesWhere(r, wherePart, params));
    return { meta: { changes: before - this.tables[table].length } };
  }

  private matchesWhere(row: Row, wherePart: string, params: any[]): boolean {
    let p = 0;
    for (const cond of wherePart.split(/\s+AND\s+/i)) {
      const c = cond.trim();
      const eq = c.match(/^(\w+)\s*=\s*\?$/);
      const lt = c.match(/^(\w+)\s*<\s*\?$/);
      const lit = c.match(/^(\w+)\s*=\s*'([^']*)'$/);
      const litNum = c.match(/^(\w+)\s*=\s*(\d+)$/);
      const notIn = c.match(/^(\w+)\s+NOT IN \(([\?,\s]+)\)$/);
      if (eq) {
        if (row[eq[1]] !== params[p++]) return false;
      } else if (lt) {
        if (!(row[lt[1]] < params[p++])) return false;
      } else if (lit) {
        if (row[lit[1]] !== lit[2]) return false;
      } else if (litNum) {
        if (row[litNum[1]] !== Number(litNum[2])) return false;
      } else if (notIn) {
        const n = notIn[2].split(',').length;
        const vals = params.slice(p, p + n);
        p += n;
        if (vals.includes(row[notIn[1]])) return false;
      } else {
        throw new Error(`FakeDb: unsupported WHERE condition: ${c}`);
      }
    }
    return true;
  }
}

function seedChapter(db: FakeDb, overrides: Partial<Row> = {}): Chapter {
  db.tables.books.push({ id: 'b1', title: 'Test Book' });
  const row: Row = {
    id: 'c1', book_id: 'b1', number: 1, title: 'Ch 1', content: 'old text', summary: 'old summary',
    state: null, word_count: 2, status: 'draft', published_url: '', published_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...overrides,
  };
  db.tables.chapters.push(row);
  return {
    id: row.id, bookId: 'b1', number: 1, title: row.title, content: row.content, summary: row.summary,
    state: null, wordCount: 2, status: 'draft', publishedUrl: '', publishedAt: null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const book: Book = {
  id: 'b1', title: 'Test Book', platform: 'stary', language: 'en', genre: '', tropes: [], premise: '',
  pov: 'third', tense: 'past', heatLevel: 'sweet', wordsPerChapter: 2000, targetChapters: 10,
  styleNotes: '', bible: null, autoDaily: 0, createdAt: '', updatedAt: '',
};

const stateA: StoryState = {
  time: 'Day 1', location: 'Hall',
  characters: [{ name: 'Mara', status: 'tired', location: 'hall', knowledge: 'knows the secret', relationships: 'hates Kael' }],
  openThreads: ['Who poisoned the Alpha?'],
  facts: ['Mara has grey eyes'],
};

describe('chapter versions', () => {
  it('snapshots the old text on update, skips identical writes, and restores', async () => {
    const db = new FakeDb();
    const chapter = seedChapter(db);
    const repo = new Repo(db as unknown as D1Database);

    await repo.updateChapter('c1', { content: 'new text', wordCount: 2 }, { reason: 'edit' });
    let versions = await repo.listChapterVersions('c1');
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe('old text');
    expect(versions[0].reason).toBe('edit');

    // Same content again: no new version.
    await repo.updateChapter('c1', { content: 'new text', wordCount: 2 });
    expect(await repo.listChapterVersions('c1')).toHaveLength(1);

    // Restore: chapter goes back, and the pre-restore text is itself snapshotted.
    const restored = await repo.restoreChapterVersion(versions[0].id);
    expect(restored.content).toBe('old text');
    versions = await repo.listChapterVersions('c1');
    expect(versions).toHaveLength(2);
    expect(versions[0].reason).toBe('restore-backup');
    expect(versions[0].content).toBe('new text');
  });

  it('upsertChapter snapshots the overwritten chapter as a generate version', async () => {
    const db = new FakeDb();
    seedChapter(db);
    const repo = new Repo(db as unknown as D1Database);
    await repo.upsertChapter(
      { bookId: 'b1', number: 1, title: 'Ch 1', content: 'regenerated', summary: 's2', state: null, wordCount: 1 },
      { reason: 'generate' },
    );
    const versions = await repo.listChapterVersions('c1');
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe('old text');
    expect(versions[0].reason).toBe('generate');
  });

  it('summary/state-only updates do not snapshot', async () => {
    const db = new FakeDb();
    seedChapter(db);
    const repo = new Repo(db as unknown as D1Database);
    await repo.updateChapter('c1', { summary: 'new summary', state: stateA });
    expect(await repo.listChapterVersions('c1')).toHaveLength(0);
  });

  it('restoring an unknown version throws 404', async () => {
    const db = new FakeDb();
    const repo = new Repo(db as unknown as D1Database);
    await expect(repo.restoreChapterVersion('nope')).rejects.toThrowError(HttpError);
  });
});

describe('persisted continuity issues', () => {
  it('upserts by problem text and marks vanished issues fixed', async () => {
    const db = new FakeDb();
    const chapter = seedChapter(db);
    const repo = new Repo(db as unknown as D1Database);
    const a = { severity: 'high' as const, category: 'character', quote: 'q1', problem: 'Mara is in two places', fix: 'Move her' };
    const b = { severity: 'low' as const, category: 'plot', quote: 'q2', problem: 'A minor gap', fix: 'Add a line' };

    await repo.saveChapterIssues(chapter, [a, b], 'auto');
    expect((await repo.listChapterIssues('c1')).filter((i) => !i.fixed)).toHaveLength(2);

    const c = { severity: 'medium' as const, category: 'timeline', quote: 'q3', problem: 'Wrong day', fix: 'Fix the date' };
    await repo.saveChapterIssues(chapter, [a, c], 'manual');
    const all = await repo.listChapterIssues('c1');
    expect(all).toHaveLength(3);
    expect(all.find((i) => i.problem === 'A minor gap')?.fixed).toBe(true);
    expect(all.find((i) => i.problem === 'Mara is in two places')?.fixed).toBe(false);
    expect(all.find((i) => i.problem === 'Mara is in two places')?.source).toBe('manual');
    expect((await repo.listChapterIssues('c1')).filter((i) => !i.fixed)).toHaveLength(2);
  });
});

describe('per-book job lock', () => {
  it('a second job for the same book throws 409 until the first finishes', async () => {
    const db = new FakeDb();
    const repo = new Repo(db as unknown as D1Database);
    const id = await repo.startJob('b1', 'chapter', '#1');
    await expect(repo.startJob('b1', 'chapter', '#2')).rejects.toThrowError(/busy/);
    await repo.finishJob(id);
    await expect(repo.startJob('b1', 'chapter', '#2')).resolves.toBeTruthy();
  });

  it('a stale running job is marked failed and does not block a new one', async () => {
    const db = new FakeDb();
    const repo = new Repo(db as unknown as D1Database);
    db.tables.jobs.push({
      id: 'old', book_id: 'b1', type: 'chapter', status: 'running', detail: '#1', error: '',
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), finished_at: null,
    });
    await expect(repo.startJob('b1', 'chapter', '#2')).resolves.toBeTruthy();
    expect(db.tables.jobs.find((j) => j.id === 'old')?.status).toBe('failed');
  });
});

describe('mergeStates', () => {
  it('unions facts, merges characters by name, and keeps old threads only when the new list is empty', () => {
    const next: StoryState = {
      time: 'Day 2', location: '',
      characters: [
        { name: 'Mara', status: 'healed', location: '', knowledge: '', relationships: 'trusts Kael now' },
        { name: 'Kael', status: 'angry', location: 'forest', knowledge: 'knows the traitor', relationships: '' },
      ],
      openThreads: ['The trial'],
      facts: ['Kael is the Alpha', 'Mara has grey eyes'],
    };
    const merged = mergeStates(stateA, next);
    expect(merged.time).toBe('Day 2');
    expect(merged.location).toBe('Hall'); // new value was empty: keep old
    expect(merged.facts).toEqual(['Kael is the Alpha', 'Mara has grey eyes']);
    expect(merged.openThreads).toEqual(['The trial']); // new list wins
    const mara = merged.characters.find((c) => c.name === 'Mara')!;
    expect(mara.status).toBe('healed');
    expect(mara.location).toBe('hall'); // empty new value keeps old
    expect(mara.knowledge).toBe('knows the secret');
    expect(mara.relationships).toBe('trusts Kael now');
    expect(merged.characters.find((c) => c.name === 'Kael')).toBeTruthy();
  });

  it('keeps the old open threads when the model returns none', () => {
    const merged = mergeStates(stateA, { ...stateA, openThreads: [], facts: [] });
    expect(merged.openThreads).toEqual(['Who poisoned the Alpha?']);
  });

  it('returns the normalised new state when there is no previous state', () => {
    expect(mergeStates(null, stateA)).toEqual(stateA);
  });
});

describe('selectionPrompt', () => {
  const chapter: Chapter = {
    id: 'c1', bookId: 'b1', number: 3, title: 'Moon', content: 'AAA BBB CCC', summary: '', state: null,
    wordCount: 3, status: 'draft', publishedUrl: '', publishedAt: null, createdAt: '', updatedAt: '',
  };
  it('rewrite mode includes the passage, context, and a replace-only rule', () => {
    const p = selectionPrompt(book, chapter, 'BBB', 'rewrite', { contextBefore: 'AAA ', contextAfter: ' CCC' });
    expect(p).toContain('BBB');
    expect(p).toContain('AAA');
    expect(p).toContain('CCC');
    expect(p).toContain('ONLY the selected passage');
  });
  it('expand asks for about twice the length; variants asks for JSON with 3 candidates', () => {
    expect(selectionPrompt(book, chapter, 'BBB', 'expand')).toMatch(/twice/i);
    const v = selectionPrompt(book, chapter, 'BBB', 'variants');
    expect(v).toContain('3 DISTINCT versions');
    expect(v).toContain('candidates');
    expect(selectionSchema.properties.candidates.type).toBe('array');
  });
  it('style mode carries the author instruction', () => {
    expect(selectionPrompt(book, chapter, 'BBB', 'style', { instruction: 'colder, terser' })).toContain('colder, terser');
  });
});
