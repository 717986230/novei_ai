import { describe, expect, it } from 'vitest';
import { aiReportToInstructions, analyseAiTells } from '../src/aitells';

const sloppy = Array.from({ length: 8 }, () =>
  'His voice dropping an octave, he gave a slow, lethal grin. A jolt of electricity ran through me—my traitorous heart hammering—and the air left my lungs. His amber eyes darkened. "Not just a game, but a war," he rasped, barely above a whisper, his amber eyes never leaving mine.',
).join('\n\n');

const clean = `I found the key under the third flowerpot, which was where Dad always swore he'd never leave it.

"You're late," Mara said.

"Traffic." I held up the coffee. "And this. Peace offering."

She took it, sniffed, made a face. "Oat milk?"

"They were out of the regular."

"Liar." But she drank it anyway, and for a while neither of us said anything. The kitchen clock had stopped at 4:12 sometime last winter and nobody had bothered to fix it. I kept looking at it anyway. Old habit.`;

describe('analyseAiTells', () => {
  it('flags stacked AI tells and asks for an edit', () => {
    const r = analyseAiTells(sloppy);
    expect(r.needsEdit).toBe(true);
    const ids = r.violations.map((v) => v.label);
    expect(ids).toEqual(expect.arrayContaining(['voice dropping an octave', 'jolt/spark of electricity', 'barely above a whisper', 'slow, lethal/wicked grin']));
    expect(r.repeatedDescriptors[0].phrase).toBe('amber eyes');
    expect(aiReportToInstructions(r)).toContain('amber eyes');
  });
  it('leaves natural prose alone', () => {
    const r = analyseAiTells(clean);
    expect(r.score).toBeLessThan(3);
    expect(r.needsEdit).toBe(false);
  });
});
