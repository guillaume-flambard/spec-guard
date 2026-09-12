import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { annotationsFor, renderOutputs, summaryFor } from '../src/action/annotate.js';
import { readConfig, type Env } from '../src/action/inputs.js';
import { runAction, type ActionIo } from '../src/action/main.js';
import { runCheck } from '../src/commands/check.js';
import { EXIT_GATE, EXIT_INPUT, EXIT_OK, isOpenSpecGuardError } from '../src/errors.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

/** A runner that is entirely in memory: no files, no process, no network. */
function fakeIo(env: Env): ActionIo & { lines: string[]; files: Map<string, string> } {
  const lines: string[] = [];
  const files = new Map<string, string>();
  return {
    env,
    lines,
    files,
    log: (line) => lines.push(line),
    appendTo: (name, content) => {
      // Keyed by the path the runner named, the way the real one appends to it.
      const target = env[name];
      if (target === undefined) return Promise.resolve();
      files.set(target, (files.get(target) ?? '') + content);
      return Promise.resolve();
    },
  };
}

function codeOf(run: () => unknown): string {
  try {
    run();
    return 'no-error';
  } catch (error) {
    return isOpenSpecGuardError(error) ? error.code : 'not-an-openspec-guard-error';
  }
}

describe('readConfig', () => {
  it('takes its working directory from the workspace', () => {
    const config = readConfig({ GITHUB_WORKSPACE: '/work' });
    expect(config.check.cwd).toBe('/work');
  });

  it('resolves working-directory against the workspace', () => {
    const config = readConfig({ GITHUB_WORKSPACE: '/work', 'INPUT_WORKING-DIRECTORY': 'apps/web' });
    expect(config.check.cwd).toBe(path.resolve('/work/apps/web'));
  });

  it('maps kebab-case inputs to their environment names', () => {
    const config = readConfig({
      GITHUB_WORKSPACE: '/work',
      'INPUT_INCLUDE-CHANGES': 'true',
      'INPUT_REQUIRE-SELECTOR': 'true',
      'INPUT_MIN-PASS': '12',
      'INPUT_PASS-THRESHOLD': '0.8',
    });
    expect(config.check).toMatchObject({
      includeChanges: true,
      requireSelector: true,
      minPass: 12,
      passThreshold: 0.8,
    });
  });

  it('reads the coverage floor', () => {
    const config = readConfig({ GITHUB_WORKSPACE: '/work', 'INPUT_MIN-COVERAGE': '80' });
    expect(config.check.minCoverage).toBe(80);
  });

  it('splits a list input on commas and newlines', () => {
    const config = readConfig({
      GITHUB_WORKSPACE: '/work',
      INPUT_TESTS: 'lib/**/*.test.ts,\napps/**/*.test.ts\n',
      'INPUT_FAIL-ON': 'fail, uncertain',
    });
    expect(config.check.testGlobs).toEqual(['lib/**/*.test.ts', 'apps/**/*.test.ts']);
    expect(config.check.failOn).toEqual(['fail', 'uncertain']);
  });

  it('treats an unset input as absent, not as an empty string', () => {
    const config = readConfig({ GITHUB_WORKSPACE: '/work', INPUT_SPECS: '   ' });
    expect(config.check.specsPath).toBeUndefined();
  });

  it('refuses a boolean that is neither true nor false', () => {
    expect(codeOf(() => readConfig({ GITHUB_WORKSPACE: '/w', INPUT_ANNOTATIONS: 'yes' }))).toBe(
      'E_OPTION',
    );
  });

  it('refuses an unknown runner, verdict or format', () => {
    expect(codeOf(() => readConfig({ GITHUB_WORKSPACE: '/w', INPUT_RUNNER: 'mocha' }))).toBe(
      'E_OPTION',
    );
    expect(codeOf(() => readConfig({ GITHUB_WORKSPACE: '/w', 'INPUT_FAIL-ON': 'broken' }))).toBe(
      'E_OPTION',
    );
    expect(codeOf(() => readConfig({ GITHUB_WORKSPACE: '/w', INPUT_FORMAT: 'xml' }))).toBe(
      'E_OPTION',
    );
  });

  it('defaults annotations and summary on, at twenty annotations', () => {
    const config = readConfig({ GITHUB_WORKSPACE: '/w' });
    expect(config).toMatchObject({ annotations: true, summary: true, maxAnnotations: 20 });
  });
});

describe('annotationsFor', () => {
  it('emits an error per failing criterion, with file and line', async () => {
    const { report } = await runCheck({ cwd: fixture('fail-selector-broken') });
    const [line] = annotationsFor(report, { max: 20 });
    expect(line).toContain('::error file=openspec/specs/demo/spec.md,line=');
    expect(line).toContain('No test is titled');
  });

  it('emits a warning, not an error, for uncertain', async () => {
    const { report } = await runCheck({ cwd: fixture('uncertain') });
    expect(annotationsFor(report, { max: 20 })[0]).toContain('::warning ');
  });

  it('says nothing about passes and skips', async () => {
    const { report } = await runCheck({ cwd: fixture('pass-explicit') });
    expect(annotationsFor(report, { max: 20 })).toEqual([]);
  });

  it('stays silent on frozen debt, or every pull request carries hundreds', async () => {
    const { report } = await runCheck({ cwd: fixture('fail-no-candidate') });
    const frozen = {
      ...report,
      results: report.results.map((result) => ({ ...result, baselined: true })),
    };
    expect(annotationsFor(frozen, { max: 20 })).toEqual([]);
  });

  it('caps the list and says how many it left out', async () => {
    const { report } = await runCheck({ cwd: fixture('corpus') });
    const lines = annotationsFor(report, { max: 1 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('::notice ');
    expect(lines[1]).toContain('more uncovered scenarios');
  });

  it('escapes newlines and commas, which would otherwise end the command early', async () => {
    const { report } = await runCheck({ cwd: fixture('fail-selector-broken') });
    const hostile = {
      ...report,
      results: report.results.map((result) => ({
        ...result,
        scenario: 'a, b\nc',
        source: { ...result.source, file: 'a,b.md' },
      })),
    };
    const [line] = annotationsFor(hostile, { max: 1 });
    expect(line).not.toContain('\n');
    expect(line).toContain('file=a%2Cb.md');
    expect(line).toContain('%0A');
  });
});

describe('summaryFor', () => {
  it('reports the counts and how the passes were earned', async () => {
    const { report } = await runCheck({ cwd: fixture('pass-explicit') });
    const summary = summaryFor(report);
    expect(summary).toContain('## openspec-guard');
    expect(summary).toContain('| pass | 1 |');
    expect(summary).toContain('1 are linked by an explicit selector');
  });

  it('states the coverage percentage', async () => {
    const { report } = await runCheck({ cwd: fixture('pass-explicit') });
    expect(summaryFor(report)).toContain('**100%** of the 1 checkable criteria');
  });

  it('lists the gate violations when there are any', async () => {
    const { report } = await runCheck({ cwd: fixture('fail-no-candidate'), failOn: ['fail'] });
    expect(summaryFor(report)).toContain('### Gate');
  });

  it('says plainly when nothing passes', async () => {
    const { report } = await runCheck({ cwd: fixture('fail-no-candidate') });
    expect(summaryFor(report)).toContain('Nothing passes yet.');
  });
});

describe('renderOutputs', () => {
  it('uses the delimiter form, so a value can never break the file', () => {
    const rendered = renderOutputs({
      total: '5',
      pass: '1',
      uncertain: '0',
      fail: '3',
      skip: '1',
      baselined: '0',
      coverage: '20',
      'gate-passed': 'false',
    });
    expect(rendered).toContain('total<<__OPENSPEC_GUARD__\n5\n__OPENSPEC_GUARD__');
    expect(rendered.endsWith('\n')).toBe(true);
  });
});

describe('runAction', () => {
  it('exits zero and writes a summary on a clean repository', async () => {
    const io = fakeIo({
      GITHUB_WORKSPACE: fixture('pass-explicit'),
      GITHUB_STEP_SUMMARY: '/summary',
      GITHUB_OUTPUT: '/output',
    });
    expect(await runAction(io)).toBe(EXIT_OK);
    expect(io.files.get('/summary')).toContain('## openspec-guard');
    expect(io.files.get('/output')).toContain('gate-passed');
  });

  it('exits one and turns the step red when a gate is violated', async () => {
    const io = fakeIo({
      GITHUB_WORKSPACE: fixture('fail-no-candidate'),
      'INPUT_FAIL-ON': 'fail',
    });
    expect(await runAction(io)).toBe(EXIT_GATE);
    expect(io.lines.some((line) => line.startsWith('::error title=openspec-guard::'))).toBe(true);
  });

  it('reports a bad input as an annotation, and exits two', async () => {
    const io = fakeIo({ GITHUB_WORKSPACE: fixture('pass-explicit'), INPUT_RUNNER: 'mocha' });
    expect(await runAction(io)).toBe(EXIT_INPUT);
    expect(io.lines[0]).toContain('::error title=openspec-guard::');
    expect(io.lines[0]).toContain('mocha');
  });

  it('annotates every annotation error on its own line', async () => {
    const io = fakeIo({ GITHUB_WORKSPACE: fixture('bad-annotation') });
    expect(await runAction(io)).toBe(EXIT_INPUT);
    const errors = io.lines.filter((line) => line.startsWith('::error file='));
    expect(errors).toHaveLength(2);
  });

  it('reports a missing spec root rather than crashing', async () => {
    const io = fakeIo({ GITHUB_WORKSPACE: fixture('empty-specs') });
    expect(await runAction(io)).toBe(EXIT_INPUT);
    expect(io.lines.join('\n')).toContain('E_SPECS_EMPTY');
  });

  it('writes nothing to a file the runner did not name', async () => {
    const io = fakeIo({ GITHUB_WORKSPACE: fixture('pass-explicit') });
    expect(await runAction(io)).toBe(EXIT_OK);
    expect(io.files.size).toBe(0);
  });

  it('can be told to log the JSON document instead of the table', async () => {
    const io = fakeIo({ GITHUB_WORKSPACE: fixture('pass-explicit'), INPUT_FORMAT: 'json' });
    await runAction(io);
    expect(JSON.parse(io.lines[0] as string)).toHaveProperty('schemaVersion', 1);
  });

  it('can be told to stay quiet', async () => {
    const io = fakeIo({
      GITHUB_WORKSPACE: fixture('fail-no-candidate'),
      GITHUB_STEP_SUMMARY: '/summary',
      INPUT_ANNOTATIONS: 'false',
      INPUT_SUMMARY: 'false',
    });
    await runAction(io);
    expect(io.lines.some((line) => line.startsWith('::'))).toBe(false);
    expect(io.files.has('/summary')).toBe(false);
  });
});
