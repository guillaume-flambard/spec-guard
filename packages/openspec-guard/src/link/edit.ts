import { OpenSpecGuardError } from '../errors.js';

/**
 * Writing annotations back into a spec file.
 *
 * A pure string function on purpose. Editing someone's specs is the one thing
 * this tool does that is not read-only, so the transformation has to be
 * inspectable in a test without touching a disk.
 *
 * The edit is deliberately minimal: one comment line inserted under a heading,
 * with the blank lines a markdown formatter would put there anyway. Nothing
 * else on the page moves.
 */

export interface LinkEdit {
  /** 1-based line of the `####` heading to annotate. */
  line: number;
  /** The full comment, without its newline. */
  annotation: string;
}

export function testAnnotation(selector: string): string {
  return `<!-- openspec-guard:test=${JSON.stringify(selector)} -->`;
}

export function nonTestableAnnotation(reason: string): string {
  return `<!-- openspec-guard:non-testable reason=${JSON.stringify(reason)} -->`;
}

const HEADING = /^####\s+\S/;

/**
 * Applies edits to one spec source.
 *
 * Edits are applied from the bottom up, so an insertion never shifts the line
 * numbers of the ones still to come.
 */
export function applyEdits(source: string, edits: readonly LinkEdit[], file: string): string {
  if (edits.length === 0) return source;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  const ordered = [...edits].sort((left, right) => right.line - left.line);
  let previous: number | null = null;

  for (const edit of ordered) {
    if (previous !== null && edit.line === previous) {
      throw new OpenSpecGuardError('E_LINK_CONFLICT', 'Two annotations for the same scenario.', {
        file,
        line: edit.line,
      });
    }
    previous = edit.line;

    const index = edit.line - 1;
    const heading = lines[index];
    if (heading === undefined || !HEADING.test(heading)) {
      // The file changed under us between the read and the write. Refusing is
      // the only safe answer: a blind insert would land in another scenario.
      throw new OpenSpecGuardError(
        'E_LINK_CONFLICT',
        'Expected a scenario heading here. The spec changed since it was read.',
        { file, line: edit.line },
      );
    }

    const next = lines[index + 1];
    const block = (next ?? '').trim() === '' ? ['', edit.annotation] : ['', edit.annotation, ''];
    lines.splice(index + 1, 0, ...block);
  }

  return lines.join(newline);
}
