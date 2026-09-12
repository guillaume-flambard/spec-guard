import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCheck } from '../src/commands/check.js';
import type { Report } from '../src/report/types.js';

const CORPUS = path.resolve(fileURLToPath(new URL('./fixtures/corpus', import.meta.url)));

/**
 * The adoption path, end to end: take a repository whose specs are written in
 * one language and whose tests are written in another, add selectors, and watch
 * the verdicts flip.
 *
 * The second assertion is the important one. Criterion ids must NOT move when
 * an annotation is added, otherwise the first selector anyone writes would
 * invalidate every id already recorded elsewhere.
 */

const SELECTORS: Record<string, string> = {
  '#### Scenario: Visiteur anonyme\n\n- **WHEN** une requete sans session valide':
    'redirects an anonymous request to the login page',
  '#### Scenario: Visiteur anonyme\n\n- **WHEN** un visiteur anonyme tente':
    'logs every moderation action',
};

let workspace: string;
let before: Report;
let after: Report;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'openspec-guard-annotate-'));
  await cp(CORPUS, workspace, { recursive: true });

  before = (await runCheck({ cwd: workspace })).report;

  const specPath = path.join(workspace, 'openspec/specs/console/spec.md');
  let spec = await readFile(specPath, 'utf8');
  for (const [anchor, selector] of Object.entries(SELECTORS)) {
    expect(spec).toContain(anchor);
    const [heading, ...rest] = anchor.split('\n\n');
    spec = spec.replace(
      anchor,
      `${heading as string}\n<!-- openspec-guard:test="${selector}" -->\n\n${rest.join('\n\n')}`,
    );
  }
  await writeFile(specPath, spec, 'utf8');

  after = (await runCheck({ cwd: workspace })).report;
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('adding selectors to a bilingual spec', () => {
  it('starts with no similarity link at all', () => {
    expect(before.summary.passByHeuristic).toBe(0);
    const anonymous = before.results.filter((result) => result.scenario === 'Visiteur anonyme');
    expect(anonymous.map((result) => result.reason)).toEqual(['no-candidate', 'no-candidate']);
  });

  it('turns those criteria into asserted passes', () => {
    const anonymous = after.results.filter((result) => result.scenario === 'Visiteur anonyme');
    expect(anonymous.map((result) => result.verdict)).toEqual(['pass', 'pass']);
    expect(anonymous.map((result) => result.reason)).toEqual(['selector', 'selector']);
    expect(after.summary.passBySelector).toBe(before.summary.passBySelector + 2);
    expect(after.summary.passByHeuristic).toBe(0);
  });

  it('leaves every criterion id untouched', () => {
    expect(after.results.map((result) => result.id)).toEqual(
      before.results.map((result) => result.id),
    );
  });

  it('moves only the line numbers of the annotated scenarios', () => {
    const moved = after.results.filter((result, index) => {
      const previous = before.results[index];
      return previous !== undefined && previous.source.line !== result.source.line;
    });
    expect(moved.every((result) => result.source.file.endsWith('console/spec.md'))).toBe(true);
  });
});
