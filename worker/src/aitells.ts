/**
 * "AI-flavour" detector for English fiction.
 *
 * Counts phrases and habits that readers of web fiction recognise as machine-written.
 * Each tell has a per-chapter allowance; anything above it is a violation. The report
 * drives an optional line-edit pass and is stored on the chapter for the author.
 */

export interface Tell {
  id: string;
  label: string;
  pattern: RegExp;
  /** Allowed occurrences per chapter (scaled for long chapters). */
  allow: number;
}

// Patterns are matched case-insensitively against the plain chapter text.
export const TELLS: Tell[] = [
  // Stock phrases
  { id: 'testament', label: 'a testament to', pattern: /\ba testament to\b/gi, allow: 0 },
  { id: 'tapestry', label: 'tapestry', pattern: /\btapestr(y|ies)\b/gi, allow: 0 },
  { id: 'delve', label: 'delve', pattern: /\bdelv(e|es|ed|ing)\b/gi, allow: 0 },
  { id: 'little-did', label: 'little did (s)he know', pattern: /\blittle did (he|she|they|i|we) know\b/gi, allow: 0 },
  { id: 'couldnt-help', label: "couldn't help but", pattern: /\b(couldn't|could not|can't) help but\b/gi, allow: 0 },
  { id: 'breath-holding', label: "breath (s)he didn't know (s)he was holding", pattern: /breath (i|he|she|they|we) (didn't|did not) (know|realize)/gi, allow: 0 },
  { id: 'fraction-second', label: 'fraction of a second', pattern: /\bfraction of a second\b/gi, allow: 1 },
  { id: 'octave', label: 'voice dropping an octave', pattern: /\b(drop(s|ping|ped)?|lower(s|ing|ed)?) (an|half an) octave\b/gi, allow: 0 },
  { id: 'electricity', label: 'jolt/spark of electricity', pattern: /\b(jolt|spark|shock|current|bolt) of (pure |raw |white-hot )?electric(ity)?\b/gi, allow: 0 },
  { id: 'traitorous', label: 'traitorous (heart/pulse/body)', pattern: /\btraitorous\b/gi, allow: 1 },
  { id: 'something-raw', label: 'something raw/unreadable/dark flickers', pattern: /\bsomething (raw|unreadable|dark|dangerous|heavy|sharper|primal)\b/gi, allow: 1 },
  { id: 'vibrate', label: 'vibrates (voice/chest)', pattern: /\bvibrat(e|es|ed|ing|ion)\b/gi, allow: 1 },
  { id: 'heart-hammer', label: 'heart hammers/pounds against ribs', pattern: /\b(heart|pulse) (hammer|pound|thud|slam|race|stutter)(s|ed|ing)?\b/gi, allow: 1 },
  { id: 'breath-catch', label: 'breath catches/hitches', pattern: /\bbreath (catch|hitch)(es|ed|ing)?\b/gi, allow: 1 },
  { id: 'air-lungs', label: 'air leaves my lungs', pattern: /\b(air|breath) (leave|leaves|left|rush(es|ed)? out of|evacuates?) (my|his|her) lungs\b/gi, allow: 0 },
  { id: 'smirk', label: 'smirk', pattern: /\bsmirk(s|ed|ing)?\b/gi, allow: 2 },
  { id: 'adj-grin', label: 'slow, lethal/wicked grin', pattern: /\bslow, \w+ (grin|smirk|smile)\b/gi, allow: 0 },
  { id: 'low-rumble', label: 'low, rumbling chuckle/growl', pattern: /\blow,? rumbling\b/gi, allow: 0 },
  { id: 'eyes-darken', label: 'eyes darken/flash/glint', pattern: /\beyes (darken|flash|glint|gleam|soften|blaze|burn)(s|ed|ing)?\b/gi, allow: 1 },
  { id: 'jaw-tick', label: 'muscle ticks/jumps in jaw', pattern: /\b(muscle|jaw) (tick|twitch|jump|flex|clench)(s|ed|ing)?\b/gi, allow: 1 },
  { id: 'intensifiers', label: 'entirely/utterly/absolutely', pattern: /\b(entirely|utterly|absolutely)\b/gi, allow: 2 },
  { id: 'chalk-white', label: 'knuckles turn white', pattern: /\b(knuckles|chalk)[- ](turn |turning |went |go )?(chalk[- ])?white\b/gi, allow: 0 },
  { id: 'dangerous', label: 'dangerous(ly)', pattern: /\bdangerous(ly)?\b/gi, allow: 1 },
  { id: 'deliberate', label: 'deliberate(ly)', pattern: /\bdeliberate(ly)?\b/gi, allow: 1 },
  { id: 'world-falls-away', label: 'the world fades/vanishes/stops', pattern: /\b(world|room|everything) (around us )?(fades|vanishes|stops|falls away|melts away)\b/gi, allow: 0 },
  // Fiction slop over-represented in LLM output (sam-paech/antislop-sampler slop list)
  { id: 'whisper', label: 'barely above a whisper', pattern: /\bbarely (above )?a whisper\b/gi, allow: 0 },
  { id: 'shivers', label: 'shivers down/up the spine', pattern: /\bshivers? (down|up|racing down|ran down)\b/gi, allow: 0 },
  { id: 'ministrations', label: 'ministrations', pattern: /\bministrations?\b/gi, allow: 0 },
  { id: 'palpable', label: 'palpable', pattern: /\bpalpable\b/gi, allow: 0 },
  { id: 'practiced-ease', label: 'practiced ease', pattern: /\bpractic?sed ease\b/gi, allow: 0 },
  { id: 'eyes-never-leaving', label: 'eyes never leaving', pattern: /\beyes never leav(e|ing)\b/gi, allow: 0 },
  { id: 'cold-calculating', label: 'cold and calculating', pattern: /\bcold and calculating\b/gi, allow: 0 },
  { id: 'mixture-of', label: 'with a mixture of', pattern: /\b(with )?a mixture of\b/gi, allow: 0 },
  { id: 'eternity', label: 'what seemed like an eternity', pattern: /\bwhat (seemed|felt) like an eternity\b/gi, allow: 0 },
  { id: 'maybe-just-maybe', label: 'maybe, just maybe / that was enough', pattern: /\b(maybe, just maybe|perhaps, just perhaps|(and )?(for now, )?that was enough)\b/gi, allow: 0 },
  { id: 'symphony', label: 'symphony/orchestra/dance/kaleidoscope of', pattern: /\b(symphony|orchestra|dance|kaleidoscope|cacophony) of\b/gi, allow: 0 },
  { id: 'consume', label: 'threatens to consume/swallow', pattern: /\bthreaten(s|ed|ing)? to (consume|swallow|overwhelm)\b/gi, allow: 0 },
  { id: 'rasped', label: 'rasped/growled/hissed as dialogue tag', pattern: /,["”]? (he|she|they|i|[A-Z][a-z]+) (rasp|growl|hiss|purr|snarl)(s|ed)\b/g, allow: 2 },
  { id: 'not-x-but-y', label: 'not X, but Y / not just X', pattern: /\b(not (just|only|merely) [^.;!?]{1,40}, (but|it'?s|it is)|it'?s not [^.;!?]{1,30}, it'?s)\b/gi, allow: 1 },
  { id: 'the-way', label: '"the way" simile', pattern: /\bthe way (a|an|the|that|he|she|it|they|someone|something)\b/gi, allow: 2 },
  { id: 'never-same', label: 'life would never be the same / only just beginning', pattern: /\b(would never be the same|(was|is) only just (beginning|getting started))\b/gi, allow: 0 },
];

/** Names that LLMs overuse in fiction (antislop list); flag them in bibles. */
export const CLICHE_NAMES = ['Elara', 'Lyra', 'Kael', 'Jaxon', 'Elias', 'Elian', 'Aria', 'Eira', 'Elysia', 'Seraphina', 'Thorne', 'Eldoria', 'Whisperwood', 'Oakhaven', 'Ravenswood', 'Zephyria'];

export interface TellHit {
  id: string;
  label: string;
  count: number;
  allow: number;
}

export interface AiReport {
  words: number;
  /** Tells that went over their allowance. */
  violations: TellHit[];
  emDashes: number;
  emDashLimit: number;
  /** Fixed appearance details repeated too often (e.g. eye colour every scene). */
  repeatedDescriptors: { phrase: string; count: number }[];
  /** Adjective pairs like "slow, deliberate" / "cold, humorless". */
  adjectivePairs: number;
  /** Groups of three ("X, Y, and Z"); autonovel: more than two per chapter is a pattern. */
  triads: number;
  /** Scene breaks; more than two turns a chapter into vignettes. */
  sceneBreaks: number;
  /** Coefficient of variation of sentence length; low = monotone rhythm (human prose is "bursty"). */
  sentenceVariation: number;
  /** Over-limit points; 0 = clean. */
  score: number;
  needsEdit: boolean;
}

const EYE_OR_HAIR = /\b((?:[a-z]+-)?(?:blue|grey|gray|green|amber|brown|hazel|golden|silver|black|dark|blonde|caramel|red|auburn)(?:-[a-z]+)?) (eyes|hair|gaze)\b/gi;
const ADJ_PAIR = /\b(slow|cold|low|dark|sharp|soft|deep|raw|quiet|smooth|heavy|warm|harsh|thick|bright|wicked|lethal|cruel|steady|gentle|rough|tight|hot|bitter|sweet), (\w+(ly|ing|ed|ous|ful|less|ive|ant|ent|al|ic|y)|deliberate|lethal|humorless|amused|possessive|dangerous|gravelly|predatory|calculating)\b/gi;

export function analyseAiTells(text: string): AiReport {
  const plain = text.replace(/\*/g, '');
  const words = (plain.match(/[A-Za-z']+/g) || []).length;
  // Long chapters get proportionally more room (baseline 2,000 words).
  const scale = Math.max(1, words / 2000);
  const violations: TellHit[] = [];
  for (const t of TELLS) {
    const count = (plain.match(t.pattern) || []).length;
    const allow = Math.floor(t.allow * scale);
    if (count > allow) violations.push({ id: t.id, label: t.label, count, allow });
  }
  const emDashes = (plain.match(/—|--/g) || []).length;
  const emDashLimit = Math.max(2, Math.floor(words / 500));

  const descCounts = new Map<string, number>();
  for (const m of plain.matchAll(EYE_OR_HAIR)) {
    const k = m[0].toLowerCase();
    descCounts.set(k, (descCounts.get(k) || 0) + 1);
  }
  const repeatedDescriptors = [...descCounts.entries()]
    .filter(([, c]) => c > 2)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count);

  const adjectivePairs = (plain.match(ADJ_PAIR) || []).length;
  const adjLimit = Math.floor(3 * scale);
  const triads = (plain.match(/\b[\w'-]+(?: [\w'-]+){0,3}, [\w'-]+(?: [\w'-]+){0,3},? and [\w'-]+/g) || []).length;
  const triadLimit = Math.floor(3 * scale);
  const sceneBreaks = (text.match(/^\s*\*\*\*\s*$/gm) || []).length;
  const sentLens = plain
    .split(/(?<=[.!?…])["”’]?\s+/)
    .map((x) => (x.match(/[A-Za-z']+/g) || []).length)
    .filter((n) => n > 0);
  const mean = sentLens.reduce((a, b) => a + b, 0) / Math.max(1, sentLens.length);
  const sd = Math.sqrt(sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sentLens.length));
  const sentenceVariation = sentLens.length > 10 ? Math.round((sd / Math.max(1, mean)) * 100) / 100 : 1;

  const score =
    violations.reduce((s, v) => s + (v.count - v.allow), 0) +
    Math.max(0, emDashes - emDashLimit) +
    repeatedDescriptors.reduce((s, d) => s + (d.count - 2), 0) +
    Math.max(0, adjectivePairs - adjLimit) +
    Math.max(0, triads - triadLimit) +
    Math.max(0, sceneBreaks - 2) +
    (sentenceVariation < 0.45 ? 3 : 0);

  return {
    words,
    violations: violations.sort((a, b) => b.count - b.allow - (a.count - a.allow)),
    emDashes,
    emDashLimit,
    repeatedDescriptors,
    adjectivePairs,
    triads,
    sceneBreaks,
    sentenceVariation,
    score,
    needsEdit: score >= 5,
  };
}

/** Human-readable checklist for the line-edit prompt. */
export function aiReportToInstructions(r: AiReport): string {
  const lines: string[] = [];
  for (const v of r.violations) lines.push(`- "${v.label}" appears ${v.count}x (allowed ${v.allow}). Rewrite those sentences with fresh, specific wording.`);
  if (r.emDashes > r.emDashLimit) lines.push(`- ${r.emDashes} em dashes (max ${r.emDashLimit}). Replace most with commas, full stops or restructured sentences.`);
  for (const d of r.repeatedDescriptors) lines.push(`- "${d.phrase}" is mentioned ${d.count}x. Mention it at most once; elsewhere use the name or an action instead.`);
  if (r.adjectivePairs > 3) lines.push(`- ${r.adjectivePairs} stacked adjective pairs like "slow, deliberate". Keep the stronger word or replace with a concrete action.`);
  if (r.triads > 3) lines.push(`- ${r.triads} lists of three ("X, Y, and Z"). Cut most of them to one or two items.`);
  if (r.sceneBreaks > 2) lines.push(`- ${r.sceneBreaks} scene breaks. Keep at most two (real time/place jumps); bridge the rest with transitions.`);
  if (r.sentenceVariation < 0.45) lines.push('- Sentence lengths are too uniform. Mix in very short sentences and fragments, and a few long flowing ones.');
  return lines.join('\n');
}
