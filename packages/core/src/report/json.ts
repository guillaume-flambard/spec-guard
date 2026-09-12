import type { Report } from './types.js';

/**
 * Stable serialization.
 *
 * `JSON.stringify` preserves insertion order for non-numeric keys, and every
 * object in `Report` is built in a fixed order, so the key order is fixed too.
 * Nothing here reads the clock, the environment or the filesystem: that is what
 * makes "two identical runs produce identical bytes" true rather than likely.
 *
 * The document goes to stdout and nowhere else. Every human-facing line,
 * warnings included, goes to stderr, so `openspec-guard check --format json > out.json`
 * writes exactly the document.
 */
export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
