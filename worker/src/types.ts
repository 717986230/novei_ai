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
  /** Age, background, personality, goal, secret. */
  description: string;
  /** Fixed physical details that must never drift (hair, eyes, height, scars...). */
  appearance?: string;
  /** How they talk: vocabulary, rhythm, verbal tics, what they never say. */
  voice?: string;
  /** Key relationships at the start of the story. */
  relationships?: string;
}

export interface CharacterState {
  name: string;
  /** Physical/emotional condition right now (injuries, mood, power level, alive/dead). */
  status: string;
  location: string;
  /** Important things this character knows or still does NOT know. */
  knowledge: string;
  /** Current state of their key relationships. */
  relationships: string;
}

/** Continuity ledger as of the end of a chapter. */
export interface StoryState {
  time: string;
  location: string;
  characters: CharacterState[];
  /** Unresolved plot threads, promises, mysteries, foreshadowing to pay off. */
  openThreads: string[];
  /** Established facts that later chapters must not contradict (names, rules, items, numbers, events). */
  facts: string[];
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
  /** Hard rules of the world / power system that must stay consistent. */
  worldRules?: string[];
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
  state: StoryState | null;
  qc: QcReport | null;
  wordCount: number;
  status: ChapterStatus;
  publishedUrl: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QcIssue {
  severity: 'high' | 'medium' | 'low';
  category: string;
  quote: string;
  problem: string;
  fix: string;
}

/** Result of the automatic quality-control pass stored on each generated chapter. */
export interface QcReport {
  ranAt: string;
  /** AI-flavour score before / after the line edit (0 = clean). */
  aiScoreBefore: number;
  aiScoreAfter: number;
  aiEditApplied: boolean;
  /** Remaining AI tells after QC, for the author to glance at. */
  aiTells: string[];
  issuesFound: QcIssue[];
  issuesFixed: number;
  /** Issues still reported after the fix pass. */
  remaining: QcIssue[];
  verdict: 'passed' | 'needs_review';
  notes: string[];
}

export interface Settings {
  /** Run AI-flavour edit + continuity check/fix after every generated chapter. */
  autoQc: boolean;
  model: string;
  /** Used automatically when the main model is overloaded. Empty = no fallback. */
  fallbackModel: string;
  temperature: number;
}
