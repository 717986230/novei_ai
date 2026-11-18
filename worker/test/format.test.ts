import { describe, expect, it } from 'vitest';
import { cleanChapterText, cleanTitle, countWords, exportBook, toHtml, toPlain } from '../src/format';

describe('cleanChapterText', () => {
  it('drops a leading chapter heading and normalises paragraphs', () => {
    const raw = '# Chapter 3: The Alpha\n\nShe ran.\nHe followed.\n\n\n**Mine,** he thought.\n---\nMorning came.';
    expect(cleanChapterText(raw, 'The Alpha')).toBe('She ran.\n\nHe followed.\n\n*Mine,* he thought.\n\n***\n\nMorning came.');
  });
  it('strips <think> blocks and code fences', () => {
    expect(cleanChapterText('<think>plan</think>```\nHello there.\n```')).toBe('Hello there.');
  });
  it('drops word-numbered and localized headings', () => {
    expect(cleanChapterText('Chapter Twenty-One: Moonfall\n\nShe ran.')).toBe('She ran.');
    expect(cleanChapterText('## Capítulo 3\n\nElla corrió.')).toBe('Ella corrió.');
    expect(cleanChapterText('**Chapter 2**\nGo.')).toBe('Go.');
  });
  it('keeps a first line that is not a heading', () => {
    expect(cleanChapterText('Chapter one of my life ended the day I met him, and I knew it.')).toContain('Chapter one');
  });
});

describe('cleanTitle', () => {
  it('removes prefixes and quotes', () => {
    expect(cleanTitle('"Chapter 4: Blood Moon"')).toBe('Blood Moon');
    expect(cleanTitle('Chapter Nine - Ashes')).toBe('Ashes');
    expect(cleanTitle('<think>x</think>\n# The Rejection\nextra')).toBe('The Rejection');
  });
});

describe('countWords', () => {
  it('counts latin words and CJK chars', () => {
    expect(countWords('Hello, *dark* world — again.')).toBe(4);
    expect(countWords('你好 world')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});

describe('exports', () => {
  const content = 'He smiled. *Liar.*\n\n***\n\nA <door> & a key.';
  it('plain strips markup', () => {
    expect(toPlain(content)).toBe('He smiled. Liar.\n\n* * *\n\nA <door> & a key.');
  });
  it('html escapes and converts italics', () => {
    expect(toHtml(content)).toBe('<p>He smiled. <em>Liar.</em></p>\n<hr>\n<p>A &lt;door&gt; &amp; a key.</p>');
  });
  it('book export includes headings and author note', () => {
    const out = exportBook('My Book', [{ number: 1, title: 'Start', content: 'Hi.' }], 'txt', { authorNote: 'AI note' });
    expect(out).toBe('My Book\n\nChapter 1: Start\n\nHi.\n\nAI note\n');
    expect(exportBook('B', [{ number: 2, title: '', content: 'x' }], 'html')).toContain('<h2>Chapter 2</h2>');
  });
});
