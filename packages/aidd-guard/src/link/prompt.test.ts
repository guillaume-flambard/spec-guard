import { createInterface } from 'node:readline/promises';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import type { LinkProposal } from '../commands/link.js';
import type { Candidate, Criterion } from '../types.js';

import { __testing, createTerminalAsk } from './prompt.js';

const { parse, render } = __testing;

/** A session driven by a script, the way a pipe or a heredoc drives one. */
function scriptedAsk(lines: readonly string[]): ReturnType<typeof createTerminalAsk> {
  const input = Readable.from(lines.map((line) => `${line}\n`));
  return createTerminalAsk(2, () => {}, createInterface({ input }));
}

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  fullName: 'export > writes the export as JSON',
  leaf: 'writes the export as JSON',
  leafAmbiguous: false,
  file: 'src/export.test.ts',
  line: 4,
  score: 0.75,
  matchedOn: 'leaf',
  sharedTerms: ['export', 'json'],
  skipped: false,
  ...overrides,
});

const criterion: Criterion = {
  id: 'ag_0000000000000000',
  task: '2026_09/x',
  source: 'checkbox',
  section: 'Acceptance criteria',
  text: 'The export produces a JSON file.',
  file: 'plan.md',
  line: 12,
  endLine: 12,
  indent: 0,
  claimed: true,
  annotation: null,
};

const proposal = (candidates: Candidate[] = [candidate()]): LinkProposal => ({
  criterion,
  candidates,
  search: () => [],
  titleCount: 42,
});

describe('what the operator sees', () => {
  it('shows the criterion, where it lives, and that it was ticked', () => {
    const screen = render(proposal(), 1, 9);

    expect(screen).toContain('[1/9] The export produces a JSON file.');
    expect(screen).toContain('[ticked]');
    expect(screen).toContain('plan.md:12');
  });

  it('shows the score and the shared words behind a candidate', () => {
    const screen = render(proposal(), 1, 9);

    expect(screen).toContain('1) export > writes the export as JSON');
    expect(screen).toContain('score 0.75');
    expect(screen).toContain('shared: export, json');
  });

  it('marks a candidate whose test is skipped', () => {
    expect(render(proposal([candidate({ skipped: true })]), 1, 1)).toContain('[test is skipped]');
  });

  it('points at search when nothing shares a word', () => {
    const screen = render(proposal([]), 1, 1);

    expect(screen).toContain('No candidate test shares a significant word');
    expect(screen).toContain('42 test titles');
  });
});

describe('what the operator types', () => {
  it('links to a numbered candidate by its leaf title', () => {
    expect(parse('1', proposal())).toEqual({
      kind: 'test',
      selector: 'writes the export as JSON',
    });
  });

  it('uses the full name when the leaf is not unique', () => {
    const shown = [candidate({ leafAmbiguous: true })];
    expect(parse('1', proposal(shown), shown)).toEqual({
      kind: 'test',
      selector: 'export > writes the export as JSON',
    });
  });

  it('reads a typed title', () => {
    expect(parse('t some other title', proposal())).toEqual({
      kind: 'test',
      selector: 'some other title',
    });
  });

  it('reads a non-testable reason', () => {
    expect(parse('n needs a human', proposal())).toEqual({
      kind: 'non-testable',
      reason: 'needs a human',
    });
  });

  it('refuses non-testable with no reason, which would not be auditable', () => {
    expect(parse('n', proposal())).toBe('retry');
  });

  it('reads a search', () => {
    expect(parse('/anonymous', proposal())).toEqual({ kind: 'search', query: 'anonymous' });
  });

  it('treats an empty line as a skip, which is the safe default', () => {
    expect(parse('', proposal())).toEqual({ kind: 'skip' });
  });

  it('reads skip and quit', () => {
    expect(parse('s', proposal())).toEqual({ kind: 'skip' });
    expect(parse('q', proposal())).toEqual({ kind: 'quit' });
  });

  it('asks again rather than guessing', () => {
    expect(parse('yes please', proposal())).toBe('retry');
    expect(parse('7', proposal())).toBe('retry');
    expect(parse('/', proposal())).toBe('retry');
  });
});

describe('a session driven by a pipe', () => {
  /*
   * The bug this pins: `rl.question` rejects with ERR_USE_AFTER_CLOSE once the
   * input ends, which crashed the command and threw away answers that had
   * already arrived. Queuing the lines is what makes a scripted session behave
   * like a typed one.
   */
  it('answers every proposal from the script, in order', async () => {
    const { ask } = scriptedAsk(['1', 'n needs a human']);

    expect(await ask(proposal())).toEqual({
      kind: 'test',
      selector: 'writes the export as JSON',
    });
    expect(await ask(proposal())).toEqual({ kind: 'non-testable', reason: 'needs a human' });
  });

  it('quits when the input runs out, rather than throwing', async () => {
    const { ask } = scriptedAsk(['1']);

    await ask(proposal());
    await expect(ask(proposal())).resolves.toEqual({ kind: 'quit' });
  });

  it('quits on empty input without asking anything', async () => {
    const { ask } = scriptedAsk([]);
    await expect(ask(proposal())).resolves.toEqual({ kind: 'quit' });
  });
});
