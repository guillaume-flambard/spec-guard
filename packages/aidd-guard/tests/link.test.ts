import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runCheck } from '../src/commands/check.js';
import { runLink, type LinkAsk, type LinkChoice, type LinkProposal } from '../src/commands/link.js';

/**
 * `link` writes into real files, so every test here runs on a throwaway copy of
 * the fixture repository. The decision loop is scripted rather than typed: the
 * command takes its `ask` as a parameter precisely so this is possible.
 */

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const temporaries: string[] = [];

afterEach(async () => {
  await Promise.all(temporaries.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function copyFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'aidd-guard-link-'));
  temporaries.push(dir);
  await cp(path.join(fixtures, 'linked'), dir, { recursive: true });
  return dir;
}

/** Answers each proposal from a script, and records what it was shown. */
function scripted(choices: readonly LinkChoice[]): {
  ask: LinkAsk;
  seen: LinkProposal[];
} {
  const seen: LinkProposal[] = [];
  let index = 0;
  const ask: LinkAsk = (proposal) => {
    seen.push(proposal);
    const choice = choices[index] ?? { kind: 'quit' };
    index += 1;
    return Promise.resolve(choice);
  };
  return { ask, seen };
}

describe('what it offers', () => {
  it('walks only the criteria that carry no annotation', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    const result = await runLink({ cwd, dryRun: true, ask });

    // Seven criteria, three already annotated in the fixture.
    expect(result.considered).toBe(4);
    expect(seen[0]?.criterion.annotation).toBeNull();
  });

  it('offers the best candidate first', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    await runLink({ cwd, dryRun: true, ask });

    const [first] = seen;
    expect(first?.candidates[0]?.fullName).toContain('streams rows');
    expect(first?.candidates[0]?.score).toBeGreaterThan(0.5);
  });

  it('walks the best-ranked criteria first, so a short session pays', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    await runLink({ cwd, dryRun: true, ask });

    const scores = seen.map((proposal) => proposal.candidates[0]?.score ?? 0);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it('searches every test title, for a criterion similarity cannot reach', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    await runLink({ cwd, dryRun: true, ask });

    const proposal = seen[0];
    expect(proposal?.titleCount).toBe(3);
    expect(proposal?.search('anonymous')[0]?.fullName).toBe(
      'export > refuses an anonymous visitor',
    );
    expect(proposal?.search('nothing at all')).toEqual([]);
  });

  it('walks only ticked criteria under --claimed', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    const result = await runLink({ cwd, claimedOnly: true, dryRun: true, ask });

    expect(result.considered).toBe(1);
    expect(seen[0]?.criterion.claimed).toBe(true);
  });
});

describe('what it writes', () => {
  it('writes the selector, and check then passes that criterion', async () => {
    const cwd = await copyFixture();
    const { ask } = scripted([{ kind: 'test', selector: 'writes the export as JSON' }]);
    const result = await runLink({ cwd, limit: 1, ask });

    expect(result.linked).toHaveLength(1);
    expect(result.filesWritten).toHaveLength(1);

    const written = result.linked[0] as { file: string; text: string };
    const source = await readFile(path.join(cwd, written.file), 'utf8');
    expect(source).toContain('<!-- aidd-guard:test="writes the export as JSON" -->');

    const { report } = await runCheck({ cwd });
    const criterion = report.results.find((result) => result.text === written.text);
    expect(criterion?.reason).toBe('selector');
  });

  it('writes a non-testable reason', async () => {
    const cwd = await copyFixture();
    const { ask } = scripted([{ kind: 'non-testable', reason: 'Needs a human' }]);
    const result = await runLink({ cwd, limit: 1, ask });

    expect(result.markedNonTestable).toHaveLength(1);
    const source = await readFile(path.join(cwd, result.markedNonTestable[0]!.file), 'utf8');
    expect(source).toContain('<!-- aidd-guard:non-testable reason="Needs a human" -->');
  });

  it('writes nothing under --dry-run', async () => {
    const cwd = await copyFixture();
    const before = await readFile(
      path.join(cwd, 'aidd_docs/tasks/2026_09/2026_09_11_export/plan.md'),
      'utf8',
    );

    const { ask } = scripted([{ kind: 'test', selector: 'writes the export as JSON' }]);
    const result = await runLink({ cwd, limit: 1, dryRun: true, ask });

    expect(result.linked).toHaveLength(1);
    expect(result.filesWritten).toEqual([]);
    expect(
      await readFile(path.join(cwd, 'aidd_docs/tasks/2026_09/2026_09_11_export/plan.md'), 'utf8'),
    ).toBe(before);
  });

  it('keeps what was decided when the operator quits halfway', async () => {
    const cwd = await copyFixture();
    const { ask } = scripted([
      { kind: 'test', selector: 'writes the export as JSON' },
      { kind: 'quit' },
    ]);
    const result = await runLink({ cwd, ask });

    expect(result.linked).toHaveLength(1);
    expect(result.filesWritten).toHaveLength(1);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('leaves the file alone when everything is skipped', async () => {
    const cwd = await copyFixture();
    const target = path.join(cwd, 'aidd_docs/tasks/2026_09/2026_09_11_export/spec.md');
    const before = await readFile(target, 'utf8');

    const { ask } = scripted([
      { kind: 'skip' },
      { kind: 'skip' },
      { kind: 'skip' },
      { kind: 'skip' },
    ]);
    const result = await runLink({ cwd, ask });

    expect(result.skipped).toBe(4);
    expect(result.filesWritten).toEqual([]);
    expect(await readFile(target, 'utf8')).toBe(before);
  });

  it('refuses an empty selector rather than writing a link to nothing', async () => {
    const cwd = await copyFixture();
    const { ask } = scripted([{ kind: 'test', selector: '   ' }]);

    await expect(runLink({ cwd, limit: 1, ask })).rejects.toMatchObject({
      code: 'E_LINK_EMPTY_SELECTOR',
    });
  });

  it('never touches a criterion that already carries an annotation', async () => {
    const cwd = await copyFixture();
    const { ask, seen } = scripted([]);
    await runLink({ cwd, dryRun: true, ask });

    const texts = seen.map((proposal) => proposal.criterion.text);
    expect(texts.some((text) => text.includes('produces a JSON file'))).toBe(false);
    expect(texts.some((text) => text.includes('legal retention notice'))).toBe(false);
  });
});
