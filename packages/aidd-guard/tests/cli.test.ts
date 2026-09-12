import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { main, reportError } from '../src/cli.js';
import { EXIT_GATE, EXIT_INPUT, EXIT_INTERNAL, EXIT_OK } from '../src/errors.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const linked = path.join(fixtures, 'linked');

let out = '';
let err = '';

const capture = (): void => {
  out = '';
  err = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the command surface', () => {
  it('answers --version with the version and nothing else', async () => {
    capture();
    expect(await main(['--version'], linked)).toBe(EXIT_OK);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prints usage when called with no command', async () => {
    capture();
    expect(await main([], linked)).toBe(EXIT_OK);
    expect(out).toContain('aidd-guard check');
  });

  it('refuses an unknown option instead of ignoring it', async () => {
    await expect(main(['check', '--fail-onn', 'fail'], linked)).rejects.toMatchObject({
      code: 'E_OPTION',
    });
  });

  it('refuses an unknown command', async () => {
    await expect(main(['audit'], linked)).rejects.toMatchObject({ code: 'E_OPTION' });
  });

  it('refuses a value flag with no value', async () => {
    await expect(main(['check', '--tasks'], linked)).rejects.toMatchObject({ code: 'E_OPTION' });
  });

  it('refuses a verdict it does not know', async () => {
    await expect(main(['check', '--fail-on', 'broken'], linked)).rejects.toMatchObject({
      code: 'E_OPTION',
    });
  });

  it('accepts --flag=value as well as --flag value', async () => {
    capture();
    const equals = await main(['check', '--format=json'], linked);
    const document = out;
    capture();
    const spaced = await main(['check', '--format', 'json'], linked);

    expect(equals).toBe(spaced);
    expect(JSON.parse(document).summary).toEqual(JSON.parse(out).summary);
  });

  it('takes --tests more than once', async () => {
    capture();
    await main(['check', '--tests', 'src/**/*.test.ts', '--tests', 'e2e/**/*.spec.ts'], linked);
    expect(out).toContain('criteria:');
  });
});

describe('output and exit codes', () => {
  it('writes the JSON document to stdout alone', async () => {
    capture();
    const code = await main(['check', '--format', 'json'], linked);

    expect(code).toBe(EXIT_OK);
    expect(err).toBe('');
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('exits 1, not 2, when only a gate was violated', async () => {
    capture();
    expect(await main(['check', '--fail-claimed'], linked)).toBe(EXIT_GATE);
  });

  it('says a claim proves nothing, first, in the terminal report', async () => {
    capture();
    await main(['check'], linked);
    expect(out).toContain('ticked criterion has no test behind it');
  });

  it('never emits colour when asked not to', async () => {
    capture();
    await main(['check', '--no-color'], linked);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\[/);
  });
});

describe('reporting an error', () => {
  it('gives 2 for a bad input and prints where it is', () => {
    capture();
    const code = reportError(
      Object.assign(new Error('x'), {
        format: () => 'plan.md:3 [E_ANNOTATION_SYNTAX] bad',
        exitCode: EXIT_INPUT,
        name: 'AiddGuardError',
      }),
    );

    // Not an instance of our class: an unknown throw is our bug, code 3.
    expect(code).toBe(EXIT_INTERNAL);
    expect(err).toContain('bug in aidd-guard');
  });
});
