import { describe, expect, it } from 'vitest';
import { chapterPrompt, systemPrompt } from '../src/prompts';
import type { Book } from '../src/types';

const book: Book = {
  id: 'b', title: 'Rejected Luna', platform: 'stary', language: 'es', genre: 'Werewolf', tropes: ['Rejected mate'],
  premise: 'p', pov: 'first', tense: 'present', heatLevel: 'steamy', wordsPerChapter: 2000, targetChapters: 80,
  styleNotes: 'No head hopping.', bible: null, autoDaily: 0, createdAt: '', updatedAt: '',
};

describe('prompts', () => {
  it('system prompt carries platform style, language, safety and heat rules', () => {
    const s = systemPrompt(book);
    expect(s).toContain('Stary Writing / Dreame');
    expect(s).toContain('Spanish');
    expect(s).toContain('adults (18+)');
    expect(s).toContain('never explicit');
    expect(s).toContain('No head hopping.');
    expect(s).toContain('CANON IS LAW');
    expect(s).toContain('first person');
  });
  it('chapter prompt includes continuity context and length target', () => {
    const p = chapterPrompt(book, {
      number: 4, outline: { number: 4, title: 'Moon', beats: 'She refuses him.' },
      previous: [{ number: 3, title: 'T', summary: 'He rejected her.' }], previousTail: '...the door slammed.',
      nextOutline: { number: 5, title: 'Run', beats: 'She flees.' },
      state: {
        time: 'Night 3, midnight', location: 'Pack hall',
        characters: [{ name: 'Mara', status: 'bruised wrist', location: 'pack hall', knowledge: 'does not know Kael is her mate', relationships: 'hates Kael' }],
        openThreads: ['Who poisoned the Alpha?'], facts: ['Mara has grey eyes'],
      },
    });
    expect(p).toContain('CONTINUITY LEDGER');
    expect(p).toContain('does not know Kael is her mate');
    expect(p).toContain('Who poisoned the Alpha?');
    expect(p).toContain('Mara has grey eyes');
    expect(p).toContain('Next chapter will be: "Run"');
    expect(p).toContain('Ch 3 "T": He rejected her.');
    expect(p).toContain('the door slammed');
    expect(p).toContain('She refuses him.');
    expect(p).toMatch(/between 1700 and 2400/);
  });
});
