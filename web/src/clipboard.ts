import { toHtml, toPlain } from '../../worker/src/format';

/** Copy chapter text. HTML mode puts both rich text and plain text on the clipboard so rich editors keep italics. */
export async function copyChapter(content: string, mode: 'plain' | 'html'): Promise<void> {
  const plain = toPlain(content);
  if (mode === 'html' && 'ClipboardItem' in window) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([toHtml(content)], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      /* fall back to plain */
    }
  }
  try {
    await navigator.clipboard.writeText(plain);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: plain });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export { toHtml, toPlain };
