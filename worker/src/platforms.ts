import type { PlatformId } from './types';
import { HttpError } from './errors';

/**
 * Writing conventions per platform. These are craft guidelines distilled from what
 * performs on each platform, not official rules — always check each platform's
 * current content & AI policy before publishing.
 */
export interface PlatformProfile {
  id: PlatformId;
  name: string;
  url: string;
  audience: string;
  genres: string[];
  defaultWords: number;
  wordRange: [number, number];
  defaultPov: 'first' | 'third';
  defaultTense: 'past' | 'present';
  /** Style rules injected into every chapter prompt. */
  style: string[];
  /** How the export should be pasted into the platform editor. */
  pasteFormat: 'plain' | 'html';
  /** Shown in the UI and appended to exports where relevant. */
  policyNote: string;
  /** Default author's note appended to exports (empty = none). */
  disclosureNote: string;
  languages: string[];
}

export const PLATFORMS: Record<PlatformId, PlatformProfile> = {
  stary: {
    id: 'stary',
    name: 'Stary Writing / Dreame',
    url: 'https://www.starywriting.com',
    audience: 'Mobile-first readers, mostly adult women, binge-reading pay-per-chapter romance.',
    genres: ['Werewolf', 'Billionaire Romance', 'Mafia Romance', 'Vampire', 'Fantasy Romance', 'Second Chance', 'Revenge'],
    defaultWords: 2000,
    wordRange: [1500, 3000],
    defaultPov: 'first',
    defaultTense: 'present',
    style: [
      'Hook the reader in the first two lines of the chapter.',
      'Short paragraphs (1-3 sentences) for phone screens; lots of dialogue.',
      'High emotional stakes: humiliation, longing, jealousy, protectiveness, revenge.',
      'End every chapter on a cliffhanger or a sharp emotional turn so readers unlock the next one.',
      'Keep the romantic tension central; the love interest should appear or be felt in every chapter.',
    ],
    pasteFormat: 'plain',
    policyNote: 'Stary/Dreame 会审核内容并有独立的内容规范与签约条款，发布前请在作者后台确认当前对 AI 辅助创作的要求。',
    disclosureNote: '',
    languages: ['en', 'es', 'pt', 'id', 'fil', 'fr'],
  },
  webnovel: {
    id: 'webnovel',
    name: 'Webnovel',
    url: 'https://www.webnovel.com',
    audience: 'Global male-leaning fantasy readers who expect daily updates and steady power growth.',
    genres: ['Cultivation / Xianxia', 'System', 'Urban Fantasy', 'Eastern Fantasy', 'Game / LitRPG', 'Reincarnation', 'Romance (Female Lead)'],
    defaultWords: 2000,
    wordRange: [1500, 3000],
    defaultPov: 'third',
    defaultTense: 'past',
    style: [
      'Clear, escalating goals for the protagonist; show tangible progress (power, resources, status) regularly.',
      'Satisfying payoffs: underdog moments, face-slapping arrogant rivals, reveals of hidden strength.',
      'Explain power systems and system notifications cleanly; keep jargon consistent.',
      'Brisk pacing; avoid long introspection. End on a hook that promises the next payoff.',
    ],
    pasteFormat: 'plain',
    policyNote: 'Webnovel 签约作品有独立的原创与内容条款，发布前请在作者后台确认当前对 AI 生成内容的要求。',
    disclosureNote: '',
    languages: ['en', 'es', 'pt', 'id', 'fil', 'fr'],
  },
  royalroad: {
    id: 'royalroad',
    name: 'Royal Road',
    url: 'https://www.royalroad.com',
    audience: 'English-speaking progression fantasy & LitRPG fans; critical readers who value consistency.',
    genres: ['LitRPG', 'Progression Fantasy', 'Portal Fantasy / Isekai', 'Dungeon Core', 'Sci-fi', 'Xianxia'],
    defaultWords: 3000,
    wordRange: [2000, 5000],
    defaultPov: 'third',
    defaultTense: 'past',
    style: [
      'Coherent, rule-bound magic or game systems; numbers and stats must stay consistent between chapters.',
      'Format system messages as their own paragraphs inside square brackets, e.g. [Skill Acquired: Ember Step (Lv. 1)].',
      'Competent, proactive protagonist; problems are solved through clever use of abilities.',
      'Mix action with downtime, crafting and training; avoid repetitive fight choreography.',
    ],
    pasteFormat: 'html',
    policyNote: 'Royal Road 官方 AI 政策要求：AI 生成的小说必须打上 “AI-Generated Content” 标签；只有少量 AI 片段才可标 “AI-Assisted”，并需在章节作者注中说明。',
    disclosureNote: "Author's note: This chapter was written with the help of AI and edited by the author.",
    languages: ['en'],
  },
  wattpad: {
    id: 'wattpad',
    name: 'Wattpad',
    url: 'https://www.wattpad.com',
    audience: 'Young readers (13+) and young adults; very large romance, teen fiction and fantasy community.',
    genres: ['Romance', 'Teen Fiction', 'Fantasy', 'Werewolf', 'Mystery / Thriller', 'New Adult', 'Paranormal'],
    defaultWords: 2500,
    wordRange: [1500, 4000],
    defaultPov: 'first',
    defaultTense: 'present',
    style: [
      'Distinct, relatable voice with humour and inner monologue; contemporary dialogue.',
      'Strong friendships, rivalries and slow-burn romance; character-driven scenes.',
      'Open each chapter in a scene, not with backstory; end with a question the reader needs answered.',
      'Wattpad has many readers under 18: any romantic or sexual content must involve adults only and stay non-explicit.',
    ],
    pasteFormat: 'html',
    policyNote: 'Wattpad 内容规范禁止任何涉及未满 18 岁角色的性内容，成熟内容需标记 Mature。发布前请确认平台当前对 AI 生成内容的要求。',
    disclosureNote: '',
    languages: ['en', 'es', 'pt', 'id', 'fil', 'fr', 'tr'],
  },
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  id: 'Indonesian',
  fil: 'Filipino (Taglish is fine where natural)',
  fr: 'French',
  tr: 'Turkish',
};

export function getPlatform(id: string): PlatformProfile {
  const p = PLATFORMS[id as PlatformId];
  if (!p) throw new HttpError(400, `Unknown platform: ${id}`);
  return p;
}
