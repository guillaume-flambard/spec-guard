import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCheck } from '../commands/check.js';
import { renderJson } from './json.js';
import type { Report } from './types.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('../../tests/fixtures', import.meta.url)));

async function corpus(): Promise<Report> {
  return (await runCheck({ cwd: path.join(FIXTURES, 'corpus'), includeChanges: true })).report;
}

/** Every key name found anywhere in the document. */
function everyKey(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) everyKey(entry, keys);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      everyKey(entry, keys);
    }
  }
  return keys;
}

/** Every string leaf found anywhere in the document. */
function everyString(value: unknown, strings: string[] = []): string[] {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) for (const entry of value) everyString(entry, strings);
  else if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) everyString(entry, strings);
  }
  return strings;
}

describe('renderJson', () => {
  it('carries no clock and no machine identity', async () => {
    const forbidden = new Set(['timestamp', 'time', 'date', 'duration', 'elapsed', 'cwd', 'host']);
    const found = everyKey(await corpus()).filter((key) => forbidden.has(key.toLowerCase()));
    expect(found).toEqual([]);
  });

  it('carries no absolute path, so the output does not depend on the machine', async () => {
    const absolute = everyString(await corpus()).filter((value) => /^\/|^[A-Za-z]:\\/.test(value));
    expect(absolute).toEqual([]);
  });

  it('keeps every array present and every absent scalar null', async () => {
    const report = await corpus();
    for (const result of report.results) {
      expect(Array.isArray(result.match.sharedTerms)).toBe(true);
      expect(Array.isArray(result.match.runnersUp)).toBe(true);
      expect('selector' in result).toBe(true);
      expect('nonTestableReason' in result).toBe(true);
      expect('matchedOn' in result.match).toBe(true);
    }
  });

  it('rounds scores to four decimals', async () => {
    for (const result of (await corpus()).results) {
      expect(result.match.score).toBe(Math.round(result.match.score * 10000) / 10000);
    }
  });

  it('produces identical bytes for the same report', async () => {
    const report = await corpus();
    expect(renderJson(report)).toBe(renderJson(report));
  });

  it('ends with a newline and parses back to the same object', async () => {
    const report = await corpus();
    const text = renderJson(report);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it('keeps the top-level keys in a fixed order', async () => {
    expect(Object.keys(await corpus())).toEqual([
      'schemaVersion',
      'tool',
      'input',
      'options',
      'summary',
      'gates',
      'results',
      'diagnostics',
    ]);
  });
});
