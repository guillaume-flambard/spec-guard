import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCheck, type CheckInput } from '../commands/check.js';
import { DEFAULT_TERMINAL_OPTIONS, renderTerminal, type TerminalOptions } from './terminal.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('../../tests/fixtures', import.meta.url)));

async function render(
  fixture: string,
  input: Partial<CheckInput> = {},
  options: Partial<TerminalOptions> = {},
): Promise<string> {
  const { report } = await runCheck({ cwd: path.join(FIXTURES, fixture), ...input });
  return renderTerminal(report, { ...DEFAULT_TERMINAL_OPTIONS, ...options });
}

describe('renderTerminal', () => {
  it('separates a missing candidate from a weak one', async () => {
    expect(await render('fail-no-candidate')).toContain('no candidate test');
    expect(await render('fail-low-similarity')).toContain('best candidate too weak');
  });

  it('names the weak candidate and its score', async () => {
    const output = await render('fail-low-similarity');
    expect(output).toContain('score 0.20 -> rejects a blank name');
  });

  it('shows a dead selector as its own group, with the selector text', async () => {
    const output = await render('fail-selector-broken');
    expect(output).toContain('selector matches no test');
    expect(output).toContain('"rejects an invalid e-mail"');
  });

  it('splits the summary between selector and similarity', async () => {
    expect(await render('pass-explicit')).toContain('1 pass (1 by selector, 0 by similarity)');
    expect(await render('pass-heuristic')).toContain('1 pass (0 by selector, 1 by similarity)');
  });

  it('folds passes and skips away unless verbose', async () => {
    expect(await render('pass-explicit')).not.toContain('Rejects an invalid email  (openspec');
    expect(await render('pass-explicit', {}, { verbose: true })).toContain(
      'Rejects an invalid email',
    );
  });

  it('prints the language notice only when similarity did nothing at all', async () => {
    expect(await render('fail-no-candidate')).toContain('it does not translate them');
    // A repository that uses selectors is not confused about the mechanism.
    expect(await render('pass-explicit')).not.toContain('it does not translate them');
    // Neither is one where similarity is working.
    expect(await render('pass-heuristic')).not.toContain('it does not translate them');
  });

  it('never prints the language notice under --require-selector', async () => {
    const output = await render('fail-no-candidate', { requireSelector: true });
    expect(output).not.toContain('it does not translate them');
    expect(output).toContain('no selector (--require-selector)');
  });

  it('emits no ANSI sequence when color is off', async () => {
    // eslint-disable-next-line no-control-regex
    expect(await render('pass-heuristic')).not.toMatch(/\u001B\[/);
  });

  it('emits ANSI sequences when color is on', async () => {
    // eslint-disable-next-line no-control-regex
    expect(await render('pass-heuristic', {}, { color: true })).toMatch(/\u001B\[32m/);
  });

  it('truncates a long group and says how many rows are left', async () => {
    const output = await render('corpus', { includeChanges: true }, { maxRowsPerGroup: 1 });
    expect(output).toMatch(/\.\.\. and \d+ more \(--verbose\)/);
  });

  it('reports gate violations at the end', async () => {
    const output = await render('fail-no-candidate', { failOn: ['fail'] });
    expect(output).toContain("gate: 1 criteria with verdict 'fail'");
  });

  it('folds baselined criteria out of the actionable groups', async () => {
    const report = {
      ...(await runCheck({ cwd: path.join(FIXTURES, 'fail-no-candidate') })).report,
    };
    const frozen = {
      ...report,
      summary: { ...report.summary, baselined: 1 },
      results: report.results.map((result) => ({ ...result, baselined: true })),
    };
    const output = renderTerminal(frozen, DEFAULT_TERMINAL_OPTIONS);
    expect(output).not.toContain('no candidate test');
    expect(output).toContain('1 of them frozen by the baseline');
  });

  it('says when baseline entries no longer match anything', async () => {
    const report = (await runCheck({ cwd: path.join(FIXTURES, 'pass-explicit') })).report;
    const stale = {
      ...report,
      diagnostics: {
        ...report.diagnostics,
        staleBaselineEntries: [{ id: 'sg_dead', scenario: 'gone', file: 'a/spec.md' }],
      },
    };
    expect(renderTerminal(stale, DEFAULT_TERMINAL_OPTIONS)).toContain(
      'Prune with --update-baseline',
    );
  });

  it('ends with the one command to run next', async () => {
    expect(await render('fail-low-similarity')).toContain('openspec-guard link --limit 20');
  });

  it('sends a broken selector to the front of the queue', async () => {
    const output = await render('fail-selector-broken');
    expect(output).toContain('Next: 1 selector(s) point at a test that does not exist');
    expect(output).not.toContain('openspec-guard link');
  });

  it('tells a repository with real debt to freeze it first', async () => {
    const report = (await runCheck({ cwd: path.join(FIXTURES, 'fail-no-candidate') })).report;
    const heavy = {
      ...report,
      results: Array.from({ length: 60 }, (_, index) => ({
        ...(report.results[0] as (typeof report.results)[number]),
        id: `sg_${String(index).padStart(16, '0')}`,
      })),
    };
    const output = renderTerminal(heavy, DEFAULT_TERMINAL_OPTIONS);
    expect(output).toContain('--update-baseline');
  });

  it('says nothing about what to do next when there is nothing to do', async () => {
    expect(await render('pass-explicit')).not.toContain('Next:');
  });

  it('mentions dynamic titles that matching could not see', async () => {
    expect(await render('dynamic-titles')).toContain('could not be read statically');
  });
});
