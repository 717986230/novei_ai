import { LANGUAGE_NAMES, getPlatform } from './platforms';
import type { Book, Chapter, ChapterOutline, StoryBible } from './types';

const HEAT: Record<Book['heatLevel'], string> = {
  clean: 'Clean: no sexual content and no profanity beyond mild words. Romance stays at longing glances and kisses.',
  sweet: 'Sweet/sensual: romantic and physical tension is welcome, kisses can be passionate, but intimate scenes fade to black.',
  steamy: 'Steamy but non-graphic: sensual tension and implied intimacy between consenting adults; describe emotion and sensation, never explicit sexual acts.',
};

const UNIVERSAL_RULES = [
  'All characters involved in any romantic or sexual situation are adults (18+). Never sexualise minors.',
  'Original work only: do not copy text, characters or distinctive plots from existing books, films or games.',
  'Show, don\'t tell. Concrete sensory details, specific verbs, varied sentence length.',
  'Avoid AI-sounding filler: no "a testament to", "tapestry", "delve", "in a world where", "little did they know", no moralising summaries at the end of scenes.',
  'Dialogue must sound like real people of the setting; give each main character a distinct voice.',
];

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function systemPrompt(book: Book): string {
  const p = getPlatform(book.platform);
  return [
    `You are a bestselling web-novel author writing an original serial for ${p.name}.`,
    `Audience: ${p.audience}`,
    `Write everything in ${languageName(book.language)}, with natural native phrasing (not translated-sounding).`,
    '',
    'Platform craft rules:',
    ...p.style.map((s) => `- ${s}`),
    '',
    'Universal rules:',
    ...UNIVERSAL_RULES.map((s) => `- ${s}`),
    `- Content level: ${HEAT[book.heatLevel]}`,
    book.styleNotes ? `\nAuthor's personal style notes (follow these closely):\n${book.styleNotes}` : '',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim();
}

function bookBrief(book: Book): string {
  return [
    `Title: ${book.title}`,
    `Genre: ${book.genre || '(choose what fits the premise)'}`,
    book.tropes.length ? `Tropes: ${book.tropes.join(', ')}` : '',
    `Premise: ${book.premise || '(invent a compelling, original premise for this genre)'}`,
    `Narration: ${book.pov === 'first' ? 'first person' : 'third person limited'}, ${book.tense} tense`,
    `Planned length: about ${book.targetChapters} chapters of ~${book.wordsPerChapter} words`,
  ]
    .filter(Boolean)
    .join('\n');
}

const outlineItemSchema = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    title: { type: 'string' },
    beats: { type: 'string', description: '3-5 sentences: what happens, the emotional turn, and the closing hook' },
  },
  required: ['number', 'title', 'beats'],
};

export const bibleSchema = {
  type: 'object',
  properties: {
    logline: { type: 'string' },
    blurb: { type: 'string', description: 'Back-cover blurb for the platform story page, 120-200 words' },
    tags: { type: 'array', items: { type: 'string' }, description: '6-10 platform tags' },
    setting: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string', description: 'Age (adults 18+ for any romantic lead), look, personality, goal, secret' },
        },
        required: ['name', 'role', 'description'],
      },
    },
    outline: { type: 'array', items: outlineItemSchema },
  },
  required: ['logline', 'blurb', 'tags', 'setting', 'characters', 'outline'],
};

export const outlineSchema = { type: 'object', properties: { outline: { type: 'array', items: outlineItemSchema } }, required: ['outline'] };

export function biblePrompt(book: Book, outlineCount: number): string {
  return [
    'Create the story bible for a new web novel.',
    '',
    bookBrief(book),
    '',
    'Deliver:',
    '- logline: one sentence.',
    '- blurb: the story-page description that makes readers click "Read".',
    '- tags: platform-style tags.',
    '- setting: world, time, key locations, and (if any) the magic/power/system rules.',
    '- characters: 4-8 main characters. Romantic leads must be adults.',
    `- outline: chapters 1 to ${outlineCount}. The story arc must be able to continue to about chapter ${book.targetChapters}. Chapter 1 must open with an inciting incident; the first 3 chapters must hook hard.`,
  ].join('\n');
}

export function outlinePrompt(book: Book, bible: StoryBible, from: number, to: number, recentSummaries: string): string {
  return [
    `Continue the chapter outline for "${book.title}" from chapter ${from} to chapter ${to}.`,
    '',
    bookBrief(book),
    '',
    `Setting: ${bible.setting}`,
    `Characters:\n${bible.characters.map((c) => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}`,
    '',
    'Existing outline (last 10 chapters):',
    bible.outline
      .filter((o) => o.number < from)
      .slice(-10)
      .map((o) => `${o.number}. ${o.title} — ${o.beats}`)
      .join('\n'),
    recentSummaries ? `\nWhat was actually written recently:\n${recentSummaries}` : '',
    '',
    `Escalate stakes; introduce at least one new complication or reveal every 5 chapters. Story should be heading toward a satisfying ending around chapter ${book.targetChapters}.`,
  ].join('\n');
}

export interface ChapterContext {
  number: number;
  outline: ChapterOutline | undefined;
  previous: Pick<Chapter, 'number' | 'title' | 'summary'>[];
  previousTail: string;
  instruction?: string;
}

export function chapterPrompt(book: Book, ctx: ChapterContext): string {
  const bible = book.bible;
  const words = book.wordsPerChapter;
  return [
    `Write chapter ${ctx.number} of "${book.title}".`,
    '',
    bookBrief(book),
    bible ? `\nSetting: ${bible.setting}` : '',
    bible ? `Characters:\n${bible.characters.map((c) => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}` : '',
    ctx.previous.length
      ? `\nStory so far (chapter summaries):\n${ctx.previous.map((c) => `Ch ${c.number}${c.title ? ` "${c.title}"` : ''}: ${c.summary}`).join('\n')}`
      : '\nThis is the first chapter.',
    ctx.previousTail ? `\nThe previous chapter ended with:\n"""\n${ctx.previousTail}\n"""\nContinue seamlessly from here (no recap).` : '',
    ctx.outline ? `\nPlan for this chapter — "${ctx.outline.title}":\n${ctx.outline.beats}` : '\nNo outline for this chapter: advance the main plot meaningfully.',
    ctx.instruction ? `\nExtra direction from the author: ${ctx.instruction}` : '',
    '',
    'Output format:',
    `- About ${words} words (between ${Math.round(words * 0.85)} and ${Math.round(words * 1.2)}).`,
    '- Only the chapter body. No chapter heading, no title, no notes, no summary after.',
    '- Paragraphs separated by a blank line. Use *asterisks* for italics (thoughts/emphasis). Use a line with *** for scene breaks.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function rewritePrompt(book: Book, chapter: Chapter, instruction: string): string {
  return [
    `Revise chapter ${chapter.number}${chapter.title ? ` ("${chapter.title}")` : ''} of "${book.title}".`,
    `Author's revision request: ${instruction}`,
    '',
    'Keep the plot events, names and continuity unless the request says otherwise. Keep roughly the same length unless asked.',
    'Output only the revised chapter body in the same format (blank-line paragraphs, *italics*, *** scene breaks).',
    '',
    '"""',
    chapter.content,
    '"""',
  ].join('\n');
}

export function titlePrompt(book: Book, number: number, content: string): string {
  return [
    `Give chapter ${number} of the ${languageName(book.language)} web novel "${book.title}" a short, intriguing chapter title (2-6 words) in ${languageName(book.language)}.`,
    'Output only the title, no quotes, no "Chapter N".',
    '',
    content.slice(0, 3000),
  ].join('\n');
}

export function summaryPrompt(content: string): string {
  return [
    'Summarise this web-novel chapter in 3-5 sentences of plain English for the author\'s continuity notes.',
    'Include: key events, who learned what, relationship changes, any new names/places/items/stats, and how it ends.',
    '',
    content,
  ].join('\n');
}
