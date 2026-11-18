/**
 * Chapter text convention (what Gemini is asked to produce and what the editor stores):
 * - paragraphs separated by a blank line
 * - *single asterisks* for italics (thoughts, emphasis, system voices)
 * - a line containing only "***" or "* * *" is a scene break
 */

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // CJK characters count individually; everything else by whitespace-separated tokens.
  const cjk = (t.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
  const latin = t.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return cjk + latin;
}

/** Normalise raw model output into the stored chapter convention. */
export function cleanChapterText(raw: string, title?: string): string {
  let t = raw.replace(/\r\n?/g, '\n');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/^```[a-z]*\n?|```$/gim, '');
  const lines = t.split('\n');
  // Drop a leading heading like "# Chapter 3: Title" / "Chapter 3" / "**Title**" — the title is stored separately.
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length) {
    const rawFirst = lines[0].trim();
    const first = rawFirst.replace(/^#+\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
    const chapterWord = /^(chapter|cap[ií]tulo|chapitre|bab|kabanata|bölüm)\s+[\w\-]+\s*([:.\-–—].*)?$/i;
    const isHeading =
      (/^#/.test(rawFirst) && first.length < 120) ||
      (chapterWord.test(first) && first.length < 80 && !/[.!?]["”]?$/.test(first)) ||
      (!!title && first.toLowerCase() === title.trim().toLowerCase());
    if (isHeading) lines.shift();
  }
  t = lines.join('\n');
  t = t.replace(/\*\*(.+?)\*\*/g, '*$1*'); // bold -> italics; platforms rarely want bold body text
  t = t.replace(/^\s*(\*\s*\*\s*\*|-{3,}|#{3,})\s*$/gm, '***');
  // Ensure paragraphs are separated by exactly one blank line.
  const paras = t
    .split(/\n\s*\n|\n(?=\S)/)
    .map((p) => p.replace(/\s+\n/g, '\n').trim())
    .filter(Boolean);
  return paras.join('\n\n');
}

export function cleanTitle(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^#+\s*/, '')
    .replace(/^["'*“”]+|["'*“”]+$/g, '')
    .replace(/^(chapter\s+[\w\-]+\s*[:.\-–—]\s*)/i, '')
    .replace(/^["'*“”]+|["'*“”]+$/g, '')
    .trim()
    .slice(0, 120) ?? '';
}

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

const isBreak = (p: string) => p === '***';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toPlain(text: string): string {
  return paragraphs(text)
    .map((p) => (isBreak(p) ? '* * *' : p.replace(/\*(.+?)\*/g, '$1')))
    .join('\n\n');
}

export function toHtml(text: string): string {
  return paragraphs(text)
    .map((p) => {
      if (isBreak(p)) return '<hr>';
      const inner = escapeHtml(p).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
      return `<p>${inner}</p>`;
    })
    .join('\n');
}

export function toMarkdown(text: string): string {
  return paragraphs(text).join('\n\n');
}

export type ExportFormat = 'txt' | 'md' | 'html';

export interface ExportChapter {
  number: number;
  title: string;
  content: string;
}

export function chapterHeading(c: ExportChapter): string {
  return c.title ? `Chapter ${c.number}: ${c.title}` : `Chapter ${c.number}`;
}

export function exportBook(
  bookTitle: string,
  chapters: ExportChapter[],
  format: ExportFormat,
  opts: { authorNote?: string } = {},
): string {
  const note = opts.authorNote?.trim();
  if (format === 'html') {
    const body = chapters
      .map(
        (c) =>
          `<section>\n<h2>${escapeHtml(chapterHeading(c))}</h2>\n${toHtml(c.content)}${
            note ? `\n<p><em>${escapeHtml(note)}</em></p>` : ''
          }\n</section>`,
      )
      .join('\n\n');
    return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(bookTitle)}</title>
<style>body{max-width:720px;margin:2rem auto;font:18px/1.7 Georgia,serif;padding:0 1rem}h2{margin-top:3rem}hr{border:0;text-align:center}hr:after{content:"* * *"}</style>
</head><body>\n<h1>${escapeHtml(bookTitle)}</h1>\n${body}\n</body></html>\n`;
  }
  const render = format === 'md' ? toMarkdown : toPlain;
  const head = format === 'md' ? `# ${bookTitle}\n\n` : `${bookTitle}\n\n`;
  return (
    head +
    chapters
      .map((c) => {
        const h = format === 'md' ? `## ${chapterHeading(c)}` : chapterHeading(c);
        return `${h}\n\n${render(c.content)}${note ? `\n\n${format === 'md' ? `*${note}*` : note}` : ''}`;
      })
      .join('\n\n\n') +
    '\n'
  );
}
