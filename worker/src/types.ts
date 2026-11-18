export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY: string;
  ADMIN_TOKEN: string;
  GEMINI_MODEL?: string;
  /** Optional. Defaults to https://generativelanguage.googleapis.com. Set to a Cloudflare AI Gateway URL to proxy. */
  GEMINI_BASE_URL?: string;
}

export type PlatformId = 'stary' | 'webnovel' | 'royalroad' | 'wattpad';
export type HeatLevel = 'clean' | 'sweet' | 'steamy';
export type ChapterStatus = 'draft' | 'ready' | 'published';

export interface CharacterEntry {
  name: string;
  role: string;
  description: string;
}

export interface ChapterOutline {
  number: number;
  title: string;
  beats: string;
}

export interface StoryBible {
  logline: string;
  blurb: string;
  tags: string[];
  setting: string;
  characters: CharacterEntry[];
  outline: ChapterOutline[];
}

export interface Book {
  id: string;
  title: string;
  platform: PlatformId;
  language: string;
  genre: string;
  tropes: string[];
  premise: string;
  pov: 'first' | 'third';
  tense: 'past' | 'present';
  heatLevel: HeatLevel;
  wordsPerChapter: number;
  targetChapters: number;
  styleNotes: string;
  bible: StoryBible | null;
  autoDaily: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  content: string;
  summary: string;
  wordCount: number;
  status: ChapterStatus;
  publishedUrl: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  model: string;
  temperature: number;
}
