import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runCheck } from '../src/commands/check.js';
import { runLink, type LinkAsk, type LinkChoice, type LinkProposal } from '../src/commands/link.js';
import { isOpenSpecGuardError } from '../src/errors.js';
import { applyEdits, nonTestableAnnotation, testAnnotation } from '../src/link/edit.js';
import { __testing } from '../src/link/prompt.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));
const workspaces: string[] = [];

async function scratch(fixture: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'openspec-guard-link-'));
  await cp(path.join(FIXTURES, fixture), dir, { recursive: true });
  workspaces.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A scripted operator: one answer per scenario, in order. */
function scripted(...answers: LinkChoice[]): { ask: LinkAsk; seen: LinkProposal[] } {
  const seen: LinkProposal[] = [];
  let index = 0;
  const ask: LinkAsk = (proposal) => {
    seen.push(proposal);
    return Promise.resolve(answers[index++] ?? { kind: 'skip' });
  };
  return { ask, seen };
}

describe('applyEdits', () => {
  const spec = [
    '## Requirements',
    '',
    '### Requirement: A',
    '',
    '#### Scenario: a',
    '',
    '- **WHEN** x',
    '',
  ].join('\n');

  it('inserts the annotation under the heading, with blank lines around it', () => {
    const out = applyEdits(spec, [{ line: 5, annotation: testAnnotation('does a thing') }], 'a.md');
    expect(out.split('\n').slice(4, 9)).toEqual([
      '#### Scenario: a',
      '',
      '<!-- openspec-guard:test="does a thing" -->',
      '',
      '- **WHEN** x',
    ]);
  });

  it('adds the trailing blank line when the body starts immediately', () => {
    const tight = '#### Scenario: a\n- **WHEN** x\n';
    const out = applyEdits(tight, [{ line: 1, annotation: testAnnotation('t') }], 'a.md');
    expect(out).toBe('#### Scenario: a\n\n<!-- openspec-guard:test="t" -->\n\n- **WHEN** x\n');
  });

  it('applies several edits without shifting the lines still to come', () => {
    const two = ['#### Scenario: a', '', '- x', '', '#### Scenario: b', '', '- y', ''].join('\n');
    const out = applyEdits(
      two,
      [
        { line: 1, annotation: testAnnotation('first') },
        { line: 5, annotation: testAnnotation('second') },
      ],
      'a.md',
    );
    expect(out).toContain('#### Scenario: a\n\n<!-- openspec-guard:test="first" -->');
    expect(out).toContain('#### Scenario: b\n\n<!-- openspec-guard:test="second" -->');
  });

  it('escapes a double quote inside a selector', () => {
    const out = applyEdits(spec, [{ line: 5, annotation: testAnnotation('says "hi"') }], 'a.md');
    expect(out).toContain('<!-- openspec-guard:test="says \\"hi\\"" -->');
  });

  it('preserves CRLF line endings', () => {
    const crlf = spec.replace(/\n/g, '\r\n');
    const out = applyEdits(crlf, [{ line: 5, annotation: testAnnotation('t') }], 'a.md');
    expect(out.includes('\r\n')).toBe(true);
    expect(out.split('\r\n')).toContain('<!-- openspec-guard:test="t" -->');
  });

  it('refuses to write where the heading is no longer a heading', () => {
    try {
      applyEdits(spec, [{ line: 7, annotation: testAnnotation('t') }], 'a.md');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isOpenSpecGuardError(error) && error.code).toBe('E_LINK_CONFLICT');
    }
  });

  it('returns the source untouched when there is nothing to do', () => {
    expect(applyEdits(spec, [], 'a.md')).toBe(spec);
  });
});

describe('the answer parser', () => {
  const proposal = {
    criterion: {} as never,
    titleCount: 2,
    search: () => [],
    candidates: [
      { fullName: 'suite > alpha', leaf: 'alpha', leafAmbiguous: false } as never,
      { fullName: 'suite > beta', leaf: 'beta', leafAmbiguous: true } as never,
    ],
  } as unknown as LinkProposal;

  it('picks a candidate by number, using the shortest unique selector', () => {
    expect(__testing.parse('1', proposal)).toEqual({ kind: 'test', selector: 'alpha' });
  });

  it('falls back to the full path when the leaf is ambiguous', () => {
    expect(__testing.parse('2', proposal)).toEqual({ kind: 'test', selector: 'suite > beta' });
  });

  it('accepts a typed title', () => {
    expect(__testing.parse('t some other test', proposal)).toEqual({
      kind: 'test',
      selector: 'some other test',
    });
  });

  it('requires a reason for non-testable', () => {
    expect(__testing.parse('n', proposal)).toBe('retry');
    expect(__testing.parse('n needs a human', proposal)).toEqual({
      kind: 'non-testable',
      reason: 'needs a human',
    });
  });

  it('treats an empty answer as skip, and knows s and q', () => {
    expect(__testing.parse('', proposal)).toEqual({ kind: 'skip' });
    expect(__testing.parse('s', proposal)).toEqual({ kind: 'skip' });
    expect(__testing.parse('q', proposal)).toEqual({ kind: 'quit' });
  });

  it('reads /word as a search', () => {
    expect(__testing.parse('/login page', proposal)).toEqual({
      kind: 'search',
      query: 'login page',
    });
    expect(__testing.parse('/', proposal)).toBe('retry');
  });

  it('numbers the list it was given, not the original candidates', () => {
    const found = [{ fullName: 's > gamma', leaf: 'gamma', leafAmbiguous: false }] as never;
    expect(__testing.parse('1', proposal, found)).toEqual({ kind: 'test', selector: 'gamma' });
  });

  it('asks again on a number with no candidate behind it', () => {
    expect(__testing.parse('9', proposal)).toBe('retry');
    expect(__testing.parse('nope', proposal)).toBe('retry');
  });
});

describe('runLink', () => {
  it('writes a selector that makes the criterion pass', async () => {
    const cwd = await scratch('pass-heuristic');
    const { ask, seen } = scripted({ kind: 'test', selector: 'rejects an invalid email address' });

    const result = await runLink({ cwd, ask });

    expect(result.considered).toBe(1);
    expect(seen[0]?.candidates[0]?.fullName).toBe('rejects an invalid email address');
    expect(result.linked).toHaveLength(1);
    expect(result.filesWritten).toEqual(['openspec/specs/demo/spec.md']);

    const after = await runCheck({ cwd });
    expect(after.report.results[0]).toMatchObject({ verdict: 'pass', reason: 'selector' });
  });

  it('writes a non-testable directive with its reason', async () => {
    const cwd = await scratch('fail-no-candidate');
    await runLink({ cwd, ask: scripted({ kind: 'non-testable', reason: 'human judgement' }).ask });

    const after = await runCheck({ cwd });
    expect(after.report.results[0]).toMatchObject({
      verdict: 'skip',
      nonTestableReason: 'human judgement',
    });
  });

  it('offers no candidate across a language barrier, and a search instead', async () => {
    const cwd = await scratch('fail-no-candidate');
    const { ask, seen } = scripted({ kind: 'skip' });
    await runLink({ cwd, ask });

    const proposal = seen[0];
    // Similarity is inert here. This is exactly the case search exists for.
    expect(proposal?.candidates).toEqual([]);
    expect(proposal?.titleCount).toBe(1);
    expect(proposal?.search('locale').map((c) => c.fullName)).toEqual([
      'falls back to English for an unknown locale',
    ]);
  });

  it('searches by substring, ignoring case and accents', async () => {
    const cwd = await scratch('corpus');
    const { ask, seen } = scripted({ kind: 'skip' });
    await runLink({ cwd, limit: 1, ask });
    const search = seen[0]?.search;

    expect(search?.('MODERATION').map((c) => c.leaf)).toEqual(['logs every moderation action']);
    expect(search?.('pen name').map((c) => c.fullName)[0]).toContain('pen name');
    expect(search?.('zzz')).toEqual([]);
  });

  it('links through a search result on a bilingual spec', async () => {
    const cwd = await scratch('fail-no-candidate');
    let picked: string | undefined;
    await runLink({
      cwd,
      ask: (proposal) => {
        const found = proposal.search('locale');
        picked = found[0]?.leaf;
        return Promise.resolve({ kind: 'test', selector: picked as string });
      },
    });

    const after = await runCheck({ cwd });
    expect(after.report.results[0]).toMatchObject({ verdict: 'pass', reason: 'selector' });
    expect(after.report.results[0]?.selector).toBe(picked);
  });

  it('never touches a scenario that already carries a directive', async () => {
    const cwd = await scratch('pass-explicit');
    const spec = path.join(cwd, 'openspec/specs/demo/spec.md');
    const before = await readFile(spec, 'utf8');

    const result = await runLink({ cwd, ask: scripted().ask });

    expect(result.considered).toBe(0);
    expect(await readFile(spec, 'utf8')).toBe(before);
  });

  it('stops at quit and keeps what was already decided', async () => {
    const cwd = await scratch('corpus');
    const result = await runLink({
      cwd,
      ask: scripted(
        { kind: 'test', selector: 'redirects an anonymous request to the login page' },
        {
          kind: 'quit',
        },
      ).ask,
    });

    expect(result.linked).toHaveLength(1);
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.filesWritten).toHaveLength(1);
  });

  /** The corpus plus one English scenario, so scores are not all zero. */
  async function mixedCorpus(): Promise<string> {
    const cwd = await scratch('corpus');
    const spec = path.join(cwd, 'openspec/specs/console/spec.md');
    await writeFile(
      spec,
      `${await readFile(spec, 'utf8')}
#### Scenario: Accepts a pen name of twenty-four characters

- **WHEN** a reader submits a name of exactly twenty-four characters
- **THEN** the system accepts it
`,
      'utf8',
    );
    return cwd;
  }

  it('walks the best-ranked scenarios first', async () => {
    const cwd = await mixedCorpus();
    const { ask, seen } = scripted();
    await runLink({ cwd, ask });

    const scores = seen.map((proposal) => proposal.candidates[0]?.score ?? 0);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    // The point of the order: what has something to offer comes first.
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[scores.length - 1]).toBe(0);
    expect(seen[0]?.criterion.scenario).toBe('Accepts a pen name of twenty-four characters');
  });

  it('walks in document order when asked to', async () => {
    const cwd = await scratch('corpus');
    const { ask, seen } = scripted();
    await runLink({ cwd, order: 'document', ask });

    const keys = seen.map(
      (proposal) => [proposal.criterion.file, proposal.criterion.line] as const,
    );
    const sorted = [...keys].sort((left, right) =>
      left[0] === right[0] ? left[1] - right[1] : left[0] < right[0] ? -1 : 1,
    );
    expect(keys).toEqual(sorted);
  });

  it('spends a --limit on the best candidates, not on the first file', async () => {
    const cwd = await mixedCorpus();
    const { ask, seen } = scripted();
    await runLink({ cwd, limit: 1, ask });
    expect(seen).toHaveLength(1);
    // Document order would have spent the single slot on a French scenario
    // with nothing to offer, which is the whole point of the change.
    expect(seen[0]?.candidates[0]?.score ?? 0).toBeGreaterThan(0);
  });

  it('honours --limit', async () => {
    const cwd = await scratch('corpus');
    const result = await runLink({ cwd, limit: 2, ask: scripted().ask });
    expect(result.skipped).toBe(2);
    expect(result.remaining).toBe(result.considered - 2);
  });

  it('writes nothing under dry run, and says so', async () => {
    const cwd = await scratch('pass-heuristic');
    const spec = path.join(cwd, 'openspec/specs/demo/spec.md');
    const before = await readFile(spec, 'utf8');

    const result = await runLink({
      cwd,
      dryRun: true,
      ask: scripted({ kind: 'test', selector: 'rejects an invalid email address' }).ask,
    });

    expect(result.linked).toHaveLength(1);
    expect(result.filesWritten).toEqual([]);
    expect(await readFile(spec, 'utf8')).toBe(before);
  });

  it('hides candidates below --min-score', async () => {
    const cwd = await scratch('fail-low-similarity');
    const { ask, seen } = scripted({ kind: 'skip' });
    await runLink({ cwd, minScore: 0.5, ask });
    expect(seen[0]?.candidates).toEqual([]);
  });

  it('is idempotent: a second run has nothing left to consider', async () => {
    const cwd = await scratch('pass-heuristic');
    const answer = { kind: 'test', selector: 'rejects an invalid email address' } as const;
    await runLink({ cwd, ask: scripted(answer).ask });
    const second = await runLink({ cwd, ask: scripted(answer).ask });
    expect(second.considered).toBe(0);
  });

  it('leaves the spec parseable, with the annotation where the parser looks', async () => {
    const cwd = await scratch('corpus');
    await runLink({
      cwd,
      limit: 1,
      ask: scripted({ kind: 'test', selector: 'logs every moderation action' }).ask,
    });
    const after = await runCheck({ cwd });
    expect(after.report.diagnostics.parseWarnings).toEqual([]);
    expect(after.report.summary.passBySelector).toBeGreaterThan(0);
  });
});

describe('the rendered question', () => {
  it('shows the score, the shared words and a skipped marker', () => {
    const text = __testing.render(
      {
        criterion: {
          capability: 'demo',
          scenario: 'Rejects an invalid email',
          file: 'openspec/specs/demo/spec.md',
          line: 12,
        },
        titleCount: 12,
        search: () => [],
        candidates: [
          {
            fullName: 'email > rejects an invalid email address',
            file: 'src/demo.test.ts',
            line: 4,
            score: 0.75,
            sharedTerms: ['rejects', 'invalid', 'email'],
            skipped: true,
          },
        ],
      } as unknown as LinkProposal,
      1,
      3,
    );
    expect(text).toContain('[1/3] demo  Rejects an invalid email');
    expect(text).toContain('score 0.75');
    expect(text).toContain('shared: rejects, invalid, email');
    expect(text).toContain('[test is skipped]');
  });

  it('says plainly when nothing was found', () => {
    const text = __testing.render(
      {
        criterion: { capability: 'a', scenario: 'b', file: 'c', line: 1 },
        candidates: [],
        titleCount: 7,
        search: () => [],
      } as unknown as LinkProposal,
      1,
      1,
    );
    expect(text).toContain('No candidate test shares a significant word');
    expect(text).toContain('Search the 7 test titles instead: /word');
  });
});

it('exposes the annotation writers used by the command', () => {
  expect(testAnnotation('a')).toBe('<!-- openspec-guard:test="a" -->');
  expect(nonTestableAnnotation('b')).toBe('<!-- openspec-guard:non-testable reason="b" -->');
});
