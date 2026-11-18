import { router } from './router';

const KEY = 'novel-ai-token';
export const getToken = () => localStorageSafe.get(KEY) ?? '';
export const setToken = (t: string) => localStorageSafe.set(KEY, t);

const memory = new Map<string, string>();
const localStorageSafe = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return memory.get(k) ?? null; }
  },
  set(k: string, v: string) {
    try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { v ? memory.set(k, v) : memory.delete(k); }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${getToken()}`, ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    setToken('');
    router.push('/login');
    throw new ApiError(401, '登录已失效');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? `请求失败 (${res.status})`);
  }
  return (opts.raw ? res.text() : res.json()) as Promise<T>;
}

export async function download(path: string, fallbackName: string) {
  const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? '导出失败');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- shared types (mirror worker/src/types.ts) ----
export interface Platform {
  id: string; name: string; url: string; audience: string; genres: string[]; defaultWords: number;
  wordRange: [number, number]; defaultPov: 'first' | 'third'; defaultTense: 'past' | 'present';
  style: string[]; pasteFormat: 'plain' | 'html'; policyNote: string; disclosureNote: string; languages: string[];
}
export interface Outline { number: number; title: string; beats: string }
export interface Bible {
  logline: string; blurb: string; tags: string[]; setting: string;
  characters: { name: string; role: string; description: string }[]; outline: Outline[];
}
export interface Book {
  id: string; title: string; platform: string; language: string; genre: string; tropes: string[]; premise: string;
  pov: 'first' | 'third'; tense: 'past' | 'present'; heatLevel: 'clean' | 'sweet' | 'steamy';
  wordsPerChapter: number; targetChapters: number; styleNotes: string; bible: Bible | null; autoDaily: number;
  createdAt: string; updatedAt: string;
  hasBible?: boolean; chapterCount?: number; totalWords?: number; publishedCount?: number;
}
export interface Chapter {
  id: string; bookId: string; number: number; title: string; content: string; summary: string; wordCount: number;
  status: 'draft' | 'ready' | 'published'; publishedUrl: string; publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface Job { id: string; type: string; status: string; detail: string; error: string; created_at: string; finished_at: string | null }

let platformCache: Promise<{ platforms: Platform[]; languages: Record<string, string> }> | null = null;
export const loadPlatforms = () => (platformCache ??= api('/platforms'));

export const STATUS_LABEL: Record<Chapter['status'], string> = { draft: '草稿', ready: '待发布', published: '已发布' };
export const HEAT_LABEL = { clean: '清水', sweet: '甜宠（拉灯）', steamy: '火热（不露骨）' } as const;
