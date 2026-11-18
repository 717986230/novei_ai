import { LANGUAGE_NAMES, getPlatform } from './platforms';
import type { Book, Chapter, ChapterOutline, CharacterEntry, StoryBible, StoryState } from './types';

const HEAT: Record<Book['heatLevel'], string> = {
  clean: 'Clean: no sexual content and no profanity beyond mild words. Romance stays at longing glances and kisses.',
  sweet: 'Sweet/sensual: romantic and physical tension is welcome, kisses can be passionate, but intimate scenes fade to black.',
  steamy: 'Steamy but non-graphic: sensual tension and implied intimacy between consenting adults; describe emotion and sensation, never explicit sexual acts.',
};

const CRAFT_RULES = [
  'All characters involved in any romantic or sexual situation are adults (18+). Never sexualise minors.',
  'Original work only: do not copy text, characters or distinctive plots from existing books, films or games.',
  "Show, don't tell. Concrete sensory details, specific verbs, varied sentence length.",
  'Every scene needs a goal, an obstacle and a change; cut scenes where nothing changes.',
];

/** Prose rules that remove the "written by AI" feel. Kept separate so the line-edit pass can reuse them. */
export const HUMAN_PROSE_RULES = [
  'Write like a skilled human author, not a model: plain, precise words beat dramatic ones. If a simpler word works, use it.',
  'Banned phrases: "a testament to", "tapestry", "delve", "little did they know", "couldn\'t help but", "a breath I didn\'t know I was holding", "voice dropping an octave", "barely above a whisper", "shivers down her spine", "a jolt/spark of electricity", "something raw/unreadable flickers", "the world fades away", "knuckles turning white", "the air leaves my lungs", "palpable", "practiced ease", "with a mixture of", "what seemed like an eternity", "maybe, just maybe", "a symphony/dance/kaleidoscope of", "life would never be the same".',
  'Use these at most once per chapter: traitorous, smirk, vibrate, fraction of a second, heart hammering/pounding, breath catching, eyes darkening/flashing, a muscle ticking in his jaw, dangerous(ly), deliberate(ly), entirely/utterly/absolutely.',
  'No over-explaining: if the scene shows an emotion or a gesture, do not explain it in the next sentence. Trust the reader.',
  'Avoid lists of three (three adjectives, three sensory details, "X, Y, and Z"). Use one or two, or four. At most two triads per chapter.',
  'Do not stack adjectives ("slow, deliberate grin", "cold, humorless laugh"). Pick one exact word or show it through action.',
  'At most two "the way X does Y" similes per chapter; prefer direct images.',
  'Avoid "not X, but Y" / "it\'s not X, it\'s Y" constructions; say the thing directly. Different characters must not share the same rhetorical tricks.',
  'Fixed appearance (eye colour, hair, height, scars) is mentioned at most once per chapter, only when it matters. Never re-describe a character\'s eyes in every scene.',
  'Em dashes: at most one per 500 words. Prefer commas and full stops.',
  'Dialogue sounds spoken, not written: include interruptions, false starts, trailing off, wrong words. At least one imperfect line per scene. Tags are mostly "said"/"asked" or none; avoid "rasped/growled/hissed/purred" on every line.',
  'Vary rhythm: mix very short sentences and fragments with longer ones, and vary paragraph length (one-line paragraphs for impact, longer ones for build-up).',
  'Keep at least 70% of the chapter in live scene (action + dialogue); use summary only to compress time. At most two scene breaks, only for real time or place jumps.',
  'Include one moment per chapter that does not go as the reader expects (a wrong remark, an emotion arriving early, a beat interrupting another).',
  'Do not end every paragraph or chapter on a neat one-line zinger, moral or rhetorical question. Vary how chapters end.',
];

/** The continuity contract. Repeated in the system prompt so it outranks everything else. */
const CONTINUITY_RULES = [
  'CANON IS LAW. The story bible, the continuity ledger and earlier chapters are canon. Never contradict them.',
  'Names, ages, appearance (hair, eyes, height, scars, clothing style), titles, family ties, abilities and power levels stay exactly as established. Never rename or re-describe a character differently.',
  'Every character keeps their established voice (vocabulary, rhythm, verbal tics) and personality. Changes in attitude must be motivated on the page by events.',
  'Characters only know what they have witnessed or been told in the story. No one acts on information they have not learned yet (check the ledger "knowledge" field).',
  'Respect physical continuity: where each character is, injuries and exhaustion, time of day, weather, who is in the room, objects carried. Moving between places takes believable time.',
  'Dead characters stay dead, destroyed things stay destroyed, revealed secrets stay revealed, unless the canon has set up otherwise.',
  'Relationships progress from their current state in the ledger; never reset them or skip stages without cause.',
  'World / magic / system rules, costs and limits apply every time. Stats and numbers only change for an on-page reason.',
  'Open threads are promises to the reader: advance or pay them off; do not silently drop them, and do not resolve a big one casually.',
  'Do not invent major new lore that conflicts with the setting. Small new details are fine if consistent; they become canon.',
];

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function systemPrompt(book: Book): string {
  const p = getPlatform(book.platform);
  return [
    `You are a bestselling web-novel author writing an original serial for ${p.name}, famous for tight continuity: readers binge hundreds of chapters and notice every inconsistency.`,
    `Audience: ${p.audience}`,
    `Write everything in ${languageName(book.language)}, with natural native phrasing (not translated-sounding).`,
    `Narration: ${book.pov === 'first' ? 'first person, staying strictly inside the narrator\'s head' : 'third person limited, one POV character per scene, no head-hopping'}, ${book.tense} tense. Keep tense and POV consistent.`,
    '',
    'Continuity rules (highest priority):',
    ...CONTINUITY_RULES.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Platform craft rules:',
    ...p.style.map((s) => `- ${s}`),
    '',
    'General craft rules:',
    ...CRAFT_RULES.map((s) => `- ${s}`),
    '',
    'Prose style (avoid the AI feel):',
    ...HUMAN_PROSE_RULES.map((s) => `- ${s}`),
    `- Content level: ${HEAT[book.heatLevel]}`,
    book.styleNotes ? `\nAuthor's personal style notes (follow closely):\n${book.styleNotes}` : '',
  ]
    .join('\n')
    .trim();
}

function bookBrief(book: Book): string {
  return [
    `Title: ${book.title}`,
    `Genre: ${book.genre || '(choose what fits the premise)'}`,
    book.tropes.length ? `Tropes: ${book.tropes.join(', ')}` : '',
    `Premise: ${book.premise || '(invent a compelling, original premise for this genre)'}`,
    `Planned length: about ${book.targetChapters} chapters of ~${book.wordsPerChapter} words`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function characterSheet(chars: CharacterEntry[]): string {
  return chars
    .map((c) =>
      [
        `• ${c.name} — ${c.role}`,
        `  ${c.description}`,
        c.appearance ? `  Appearance (fixed): ${c.appearance}` : '',
        c.voice ? `  Voice: ${c.voice}` : '',
        c.relationships ? `  Relationships at start: ${c.relationships}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');
}

export function bibleBlock(bible: StoryBible): string {
  return [
    '=== STORY BIBLE (canon) ===',
    `Setting: ${bible.setting}`,
    bible.worldRules?.length ? `World / power-system rules:\n${bible.worldRules.map((r) => `- ${r}`).join('\n')}` : '',
    `Characters:\n${characterSheet(bible.characters)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function stateBlock(state: StoryState | null): string {
  if (!state) return '';
  return [
    '=== CONTINUITY LEDGER (state at the end of the previous chapter) ===',
    `Time: ${state.time}`,
    `Location: ${state.location}`,
    'Characters right now:',
    ...state.characters.map(
      (c) => `- ${c.name}: ${c.status} | at: ${c.location} | knows: ${c.knowledge} | relationships: ${c.relationships}`,
    ),
    state.openThreads.length ? `Open threads (keep alive / pay off):\n${state.openThreads.map((t) => `- ${t}`).join('\n')}` : '',
    state.facts.length ? `Established facts (never contradict):\n${state.facts.map((f) => `- ${f}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------- schemas ----------------

const outlineItemSchema = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    title: { type: 'string' },
    beats: {
      type: 'string',
      description: '3-5 sentences: POV, where/when, what happens, the emotional turn, which thread it advances, and the closing hook',
    },
  },
  required: ['number', 'title', 'beats'],
};

export const bibleSchema = {
  type: 'object',
  properties: {
    logline: { type: 'string' },
    blurb: { type: 'string', description: 'Back-cover blurb for the platform story page, 120-200 words' },
    tags: { type: 'array', items: { type: 'string' }, description: '6-10 platform tags' },
    setting: { type: 'string', description: 'World, era, key locations with short descriptions' },
    worldRules: { type: 'array', items: { type: 'string' }, description: 'Hard rules of magic/power/system/society, with costs and limits' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full name as used in the story (first and last name where natural)' },
          role: { type: 'string' },
          description: { type: 'string', description: 'Age (romantic leads 18+), background, personality, goal, fear, secret, arc' },
          appearance: { type: 'string', description: 'Fixed physical details: hair, eyes, build, height, distinguishing marks, typical clothing' },
          voice: { type: 'string', description: 'Speech style: vocabulary, rhythm, verbal tics, an example line' },
          relationships: { type: 'string', description: 'How they relate to the other main characters at the start' },
        },
        required: ['name', 'role', 'description', 'appearance', 'voice', 'relationships'],
      },
    },
    outline: { type: 'array', items: outlineItemSchema },
  },
  required: ['logline', 'blurb', 'tags', 'setting', 'worldRules', 'characters', 'outline'],
};

export const outlineSchema = { type: 'object', properties: { outline: { type: 'array', items: outlineItemSchema } }, required: ['outline'] };

export const stateSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '4-6 sentences: key events in order, reveals, decisions, how the chapter ends' },
    state: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'In-story day/date and time of day at chapter end; elapsed time since story start if known' },
        location: { type: 'string', description: 'Where the POV character is at chapter end' },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              status: { type: 'string', description: 'Alive/dead, injuries, mood, power level/stats, notable possessions' },
              location: { type: 'string' },
              knowledge: { type: 'string', description: 'Key secrets they know AND key things they do not know yet' },
              relationships: { type: 'string', description: 'Current state of their important relationships' },
            },
            required: ['name', 'status', 'location', 'knowledge', 'relationships'],
          },
        },
        openThreads: { type: 'array', items: { type: 'string' } },
        facts: { type: 'array', items: { type: 'string' } },
      },
      required: ['time', 'location', 'characters', 'openThreads', 'facts'],
    },
  },
  required: ['summary', 'state'],
};

export const checkSchema = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string', enum: ['character', 'appearance', 'voice', 'knowledge', 'timeline', 'location', 'world-rules', 'plot', 'pov-tense', 'other'] },
          quote: { type: 'string', description: 'Short exact quote from the chapter where the problem is' },
          problem: { type: 'string', description: 'What contradicts what (cite the canon)' },
          fix: { type: 'string', description: 'Concrete minimal fix' },
        },
        required: ['severity', 'category', 'quote', 'problem', 'fix'],
      },
    },
  },
  required: ['issues'],
};

// ---------------- prompts ----------------

export function biblePrompt(book: Book, outlineCount: number): string {
  return [
    'Create the story bible for a new web novel. This bible is the single source of truth for every later chapter, so be specific and concrete.',
    '',
    bookBrief(book),
    '',
    'Deliver:',
    '- logline: one sentence.',
    '- blurb: the story-page description that makes readers click "Read".',
    '- tags: platform-style tags.',
    '- setting: world, era, and key recurring locations (one line each).',
    '- worldRules: the hard rules of magic / power system / society / pack hierarchy etc., including costs and limits.',
    '- characters: 5-9 main characters with FIXED appearance details, a distinctive voice, and starting relationships. Romantic leads must be adults. Give every character a distinct full name (first + last where natural; no two names starting with the same sound). Avoid names that AI stories overuse: Elara, Lyra, Kael, Jaxon, Elias, Aria, Seraphina, Thorne, Eldoria, Whisperwood.',
    `- outline: chapters 1 to ${outlineCount}. The arc must be able to continue to about chapter ${book.targetChapters}. Chapter 1 opens with the inciting incident; the first 3 chapters hook hard. Every chapter must follow causally from the previous one; plant clues before reveals.`,
  ].join('\n');
}

export function outlinePrompt(book: Book, bible: StoryBible, from: number, to: number, recentSummaries: string, state: StoryState | null): string {
  return [
    `Continue the chapter outline for "${book.title}" from chapter ${from} to chapter ${to}.`,
    '',
    bookBrief(book),
    '',
    bibleBlock(bible),
    '',
    stateBlock(state),
    '',
    'Existing outline (last 10 chapters):',
    bible.outline
      .filter((o) => o.number < from)
      .slice(-10)
      .map((o) => `${o.number}. ${o.title} — ${o.beats}`)
      .join('\n'),
    recentSummaries ? `\nWhat was actually written recently (this overrides the old outline where they differ):\n${recentSummaries}` : '',
    '',
    'Requirements:',
    '- Continue causally from what was actually written and from the ledger state.',
    '- Advance or pay off the open threads; introduce a new complication or reveal about every 5 chapters.',
    '- Keep every character consistent with the bible; any change in a relationship must be earned across chapters.',
    `- Head toward a satisfying ending around chapter ${book.targetChapters}.`,
  ].join('\n');
}

export interface ChapterContext {
  number: number;
  outline: ChapterOutline | undefined;
  nextOutline?: ChapterOutline;
  previous: Pick<Chapter, 'number' | 'title' | 'summary'>[];
  state: StoryState | null;
  previousTail: string;
  instruction?: string;
}

export function chapterPrompt(book: Book, ctx: ChapterContext): string {
  const words = book.wordsPerChapter;
  return [
    `Write chapter ${ctx.number} of "${book.title}".`,
    '',
    bookBrief(book),
    '',
    book.bible ? bibleBlock(book.bible) : '',
    '',
    ctx.previous.length
      ? `=== STORY SO FAR (chapter summaries) ===\n${ctx.previous.map((c) => `Ch ${c.number}${c.title ? ` "${c.title}"` : ''}: ${c.summary}`).join('\n')}`
      : '=== This is the first chapter. Establish the main character, the world and the hook quickly. ===',
    '',
    stateBlock(ctx.state),
    ctx.previousTail
      ? `\n=== LAST LINES OF THE PREVIOUS CHAPTER ===\n"""\n${ctx.previousTail}\n"""\nPick up exactly from here: same moment (or a clearly marked time skip), same place, same characters present. No recap.`
      : '',
    '',
    ctx.outline ? `=== PLAN FOR THIS CHAPTER: "${ctx.outline.title}" ===\n${ctx.outline.beats}` : '=== No outline for this chapter: advance the main plot meaningfully from the ledger state. ===',
    ctx.nextOutline ? `(Next chapter will be: "${ctx.nextOutline.title}" — ${ctx.nextOutline.beats} — end this chapter so it leads naturally there, but do not write those events.)` : '',
    ctx.instruction ? `\nExtra direction from the author (follow it unless it breaks canon): ${ctx.instruction}` : '',
    '',
    'Before writing, silently check: who is present and where, what time it is, what each character knows, their injuries/possessions, and which open threads this chapter touches. Then write.',
    ctx.previousTail ? 'End this chapter with a different kind of beat than the previous chapter ended with.' : '',
    '',
    'Output format:',
    `- LENGTH IS A HARD REQUIREMENT: about ${words} words (between ${Math.round(words * 0.85)} and ${Math.round(words * 1.2)}), roughly ${Math.round(words / 45)}-${Math.round(words / 30)} paragraphs. Develop each scene fully with dialogue and reactions instead of rushing to the hook.`,
    '- Only the chapter body. No chapter heading, no title, no notes, no summary after.',
    '- Paragraphs separated by a blank line. Use *asterisks* for italics (thoughts/emphasis). Use a line with *** for scene breaks.',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function statePrompt(book: Book, number: number, content: string, prevState: StoryState | null): string {
  return [
    book.bible ? bibleBlock(book.bible) : '',
    '',
    prevState ? `Previous ledger (end of chapter ${number - 1}):\n${JSON.stringify(prevState)}` : 'There is no previous ledger: build it from the bible and this chapter.',
    '',
    `Chapter ${number} text:`,
    '"""',
    content,
    '"""',
    '',
    `Based on the material above: you maintain the continuity ledger for the web novel "${book.title}". Read chapter ${number} and produce:`,
    '1) summary: the chapter summary for continuity notes (English).',
    `2) state: the COMPLETE updated ledger as of the END of chapter ${number} (English).`,
    '',
    'Ledger rules:',
    '- Start from the previous ledger and apply what happened in this chapter. Carry over everything still true.',
    '- characters: every main character plus any recurring side character who matters now; dead characters stay listed with status "dead".',
    '- knowledge: record important secrets each character knows AND important things they still do not know.',
    '- openThreads: add new mysteries/promises/foreshadowing; remove only threads that were clearly resolved.',
    '- facts: concrete canon details introduced so far that must not be contradicted (names of places/people/items, numbers, stats, rules, dates, physical details, events). Keep the most important ~40; merge duplicates.',
    '- Be concrete and terse. Do not invent anything that is not in the text or the previous ledger.',
  ].join('\n');
}

export function checkPrompt(book: Book, chapter: Chapter, prevState: StoryState | null, previous: Pick<Chapter, 'number' | 'title' | 'summary'>[]): string {
  return [
    book.bible ? bibleBlock(book.bible) : '',
    '',
    previous.length ? `Story so far:\n${previous.map((c) => `Ch ${c.number}: ${c.summary}`).join('\n')}` : '',
    '',
    stateBlock(prevState),
    '',
    `Chapter ${chapter.number} text:`,
    '"""',
    chapter.content,
    '"""',
    '',
    `Based on the canon above, you are the continuity editor of "${book.title}". List every inconsistency in chapter ${chapter.number}.`,
    'Look for: wrong names or appearance details; characters acting out of personality or speaking out of voice; characters knowing things they could not know; people in the wrong place or teleporting; time-of-day / timeline errors; injuries or items that appear or vanish; world-rule or power-level violations; contradictions with earlier events; dropped threads that should have been addressed; POV or tense slips.',
    `Narration should be: ${book.pov === 'first' ? 'first person' : 'third person limited'}, ${book.tense} tense.`,
    'Severity: high = a reader would notice a contradiction with canon; medium = noticeable slip; low = nitpick. Do not report style preferences. If there are no real problems, return an empty list.',
  ].join('\n');
}

export function rewritePrompt(book: Book, chapter: Chapter, instruction: string, prevState: StoryState | null): string {
  return [
    book.bible ? bibleBlock(book.bible) : '',
    '',
    stateBlock(prevState),
    '',
    `Chapter ${chapter.number}${chapter.title ? ` ("${chapter.title}")` : ''} of "${book.title}":`,
    '"""',
    chapter.content,
    '"""',
    '',
    `Revise the chapter above. Author's revision request: ${instruction}`,
    'Keep plot events, names and continuity with the canon above unless the request says otherwise. Keep roughly the same length unless asked. Follow the prose style rules from the system instructions.',
    'Output only the revised chapter body in the same format (blank-line paragraphs, *italics*, *** scene breaks).',
  ].join('\n');
}

export function expandPrompt(book: Book, number: number, content: string, current: number): string {
  return [
    book.bible ? bibleBlock(book.bible) : '',
    '',
    `Chapter ${number} of "${book.title}" (${current} words):`,
    '"""',
    content,
    '"""',
    '',
    `The chapter above is too short; it must be about ${book.wordsPerChapter} words.`,
    `Rewrite it at full length (${Math.round(book.wordsPerChapter * 0.9)}-${Math.round(book.wordsPerChapter * 1.15)} words) by deepening the existing scenes: more dialogue exchanges, concrete detail, the POV character's reactions and small physical actions. Do not pad with description or summary.`,
    'Keep every event, fact, name and the exact ending (including the final line). Do not add new plot events or new characters.',
    'Output only the chapter body in the same format (blank-line paragraphs, *italics*, *** scene breaks).',
  ].join('\n');
}

export function deAiPrompt(book: Book, number: number, content: string, checklist: string): string {
  return [
    `Chapter ${number} of "${book.title}":`,
    '"""',
    content,
    '"""',
    '',
    'Line-edit the chapter above so it reads like it was written by a skilled human author.',
    '',
    'Problems found by an automatic scan (fix every one):',
    checklist,
    '',
    'Constraints:',
    '- Keep every event, fact, name, line of plot-relevant dialogue and the ending exactly as they are. This is a line edit, not a rewrite.',
    '- Keep the length within 10% of the original. Keep the POV and tense.',
    '- Follow the prose style rules from the system instructions.',
    '- Output only the edited chapter body in the same format (blank-line paragraphs, *italics*, *** scene breaks).',
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
