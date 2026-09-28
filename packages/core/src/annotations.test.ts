import { describe, expect, it } from 'vitest';

import { parseAnnotations } from './annotations.js';
import type { AnnotationVocabulary } from './format.js';
import type { AnnotationLine } from './types.js';

/** The OpenSpec spelling, so the cases below read as a user writes them. */
const FORMAT: AnnotationVocabulary = {
  annotationPrefix: 'openspec-guard',
  acceptedPrefixes: ['openspec-guard', 'spec-guard'],
};

function lines(...texts: string[]): AnnotationLine[] {
  return texts.map((text, index) => ({ text, line: index + 10 }));
}

describe('parseAnnotations', () => {
  it('reads a test selector', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="creates a user" -->', '- **WHEN**'),
      FORMAT,
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toEqual({ kind: 'test', selector: 'creates a user', line: 10 });
  });

  it('reads a non-testable reason', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:non-testable reason="legal review" -->'),
      FORMAT,
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toEqual({
      kind: 'non-testable',
      reason: 'legal review',
      line: 10,
    });
  });

  it('accepts blank lines before the directive', () => {
    const result = parseAnnotations(
      lines('', '<!-- openspec-guard:test="a" -->', '- **WHEN**'),
      FORMAT,
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation?.kind).toBe('test');
  });

  it('unescapes an escaped double quote inside a selector', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:test="says \\"hi\\"" -->'), FORMAT);
    expect(result.errors).toEqual([]);
    expect(result.annotation).toMatchObject({ selector: 'says "hi"' });
  });

  it('rejects the two kinds together as a conflict', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="a" -->', '<!-- openspec-guard:non-testable reason="b" -->'),
      FORMAT,
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_CONFLICT']);
  });

  it('rejects two test directives as a duplicate', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="a" -->', '<!-- openspec-guard:test="b" -->'),
      FORMAT,
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_DUPLICATE']);
  });

  it('rejects a missing reason', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:non-testable -->'), FORMAT);
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects an empty reason', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:non-testable reason="" -->'),
      FORMAT,
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_EMPTY_REASON']);
  });

  it('rejects a whitespace-only reason', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:non-testable reason="   " -->'),
      FORMAT,
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_EMPTY_REASON']);
  });

  it('rejects an empty selector', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:test="" -->'), FORMAT);
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects single quotes', () => {
    const result = parseAnnotations(lines("<!-- openspec-guard:test='a' -->"), FORMAT);
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects an unknown directive rather than ignoring it', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:tets="a" -->'), FORMAT);
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_UNKNOWN']);
  });

  it('rejects a directive placed after the start of the body', () => {
    const result = parseAnnotations(
      lines('- **WHEN** something', '<!-- openspec-guard:test="a" -->', '- **THEN** something'),
      FORMAT,
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_MISPLACED']);
    expect(result.annotation).toBeNull();
  });

  it('ignores foreign HTML comments, wherever they are', () => {
    const result = parseAnnotations(
      lines('<!-- prettier-ignore -->', '- **WHEN** x', '<!-- TODO: rewrite -->'),
      FORMAT,
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toBeNull();
  });

  it('reads a second accepted spelling of the namespace', () => {
    const result = parseAnnotations(lines('<!-- spec-guard:test="creates a user" -->'), FORMAT);
    expect(result.errors).toEqual([]);
    expect(result.annotation).toEqual({ kind: 'test', selector: 'creates a user', line: 10 });
  });

  it('reads the namespace off the format, not off a literal', () => {
    const other: AnnotationVocabulary = {
      annotationPrefix: 'aidd-guard',
      acceptedPrefixes: ['aidd-guard'],
    };
    const mine = parseAnnotations(lines('<!-- aidd-guard:test="a" -->'), other);
    expect(mine.annotation).toEqual({ kind: 'test', selector: 'a', line: 10 });

    // The other format's prefix is a foreign comment here, not a directive.
    const foreign = parseAnnotations(lines('<!-- openspec-guard:test="a" -->'), other);
    expect(foreign.errors).toEqual([]);
    expect(foreign.annotation).toBeNull();
  });

  it("names the format's own prefix in the error it raises", () => {
    const other: AnnotationVocabulary = {
      annotationPrefix: 'aidd-guard',
      acceptedPrefixes: ['aidd-guard'],
    };
    const result = parseAnnotations(lines('<!-- aidd-guard:tets="a" -->'), other);
    expect(result.errors[0]?.message).toContain('Unknown aidd-guard directive');
  });

  it('returns nothing on a plain scenario', () => {
    const result = parseAnnotations(lines('- **WHEN** x', '- **THEN** y'), FORMAT);
    expect(result.errors).toEqual([]);
    expect(result.annotation).toBeNull();
  });
});
