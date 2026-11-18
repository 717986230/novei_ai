// Minimal fake Gemini API for local end-to-end testing without a key or quota.
//   node scripts/mock-gemini.mjs            (listens on :9999; DELAY_MS=1500 simulates slow generation)
//   .dev.vars: GEMINI_BASE_URL=http://127.0.0.1:9999  GEMINI_API_KEY=anything
import http from 'node:http';

const port = Number(process.env.PORT || 9999);
let calls = 0;

const para = (i) =>
  `Rain hammered the windows of the pack house as Mara counted her breaths, number ${i}. *Don't look at him.* ` +
  `"You're late," Kael said, his voice low enough to make the glass hum, and every wolf in the hall went still.`;

function reply(body) {
  const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
  const schema = body.generationConfig?.responseSchema;
  if (schema?.properties?.characters) {
    const n = Number(/chapters 1 to (\d+)/.exec(prompt)?.[1] ?? 5);
    return JSON.stringify({
      logline: 'A rejected she-wolf returns as the Alpha of a rival pack.',
      blurb: 'Five years ago he rejected me in front of everyone. Now I am back — and I am not alone.',
      tags: ['werewolf', 'rejected mate', 'alpha', 'second chance'],
      setting: 'The Silver Pines territory, modern-day Oregon.',
      characters: [
        { name: 'Mara Quinn', role: 'heroine', description: '24, rejected mate turned Alpha.' },
        { name: 'Kael Blackwood', role: 'love interest', description: '27, Alpha of Silver Pines.' },
      ],
      outline: Array.from({ length: n }, (_, i) => ({ number: i + 1, title: `Return ${i + 1}`, beats: `Beat for chapter ${i + 1}.` })),
    });
  }
  if (schema?.properties?.outline) {
    const m = /from chapter (\d+) to chapter (\d+)/.exec(prompt);
    const from = Number(m?.[1] ?? 1), to = Number(m?.[2] ?? from + 4);
    return JSON.stringify({ outline: Array.from({ length: to - from + 1 }, (_, i) => ({ number: from + i, title: `Storm ${from + i}`, beats: `Escalation ${from + i}.` })) });
  }
  if (prompt.startsWith('Summarise')) return 'Mara confronts Kael in the pack hall; he realises she is an Alpha now.';
  if (prompt.includes('chapter title')) return '"Chapter 9: Moonfall"';
  if (prompt.includes('Revise chapter')) return '# Chapter 1\n\n' + Array.from({ length: 12 }, (_, i) => 'REVISED. ' + para(i)).join('\n\n');
  return '# Chapter X: Heading to strip\n\n' + Array.from({ length: 14 }, (_, i) => para(i)).join('\n') + '\n---\nThe end of the scene.';
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      calls++;
      const ok = /\/v1beta\/models\/[^/:]+:generateContent$/.test(req.url) && req.headers['x-goog-api-key'];
      res.setHeader('content-type', 'application/json');
      if (!ok) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: `bad request ${req.url}` } }));
      }
      if (process.env.FAIL_FIRST && calls === 1) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: { message: 'overloaded' } }));
      }
      const text = reply(JSON.parse(raw || '{}'));
      setTimeout(() => res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 1 } })), Number(process.env.DELAY_MS || 0));
    });
  })
  .listen(port, () => console.log(`mock gemini on :${port}`));
