import { describe, expect, it } from 'vitest';

import { parseAnnotations, type AnnotationLine } from './annotations.js';

function lines(...texts: string[]): AnnotationLine[] {
  return texts.map((text, index) => ({ text, line: index + 10 }));
}

describe('parseAnnotations', () => {
  it('reads a test selector', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="creates a user" -->', '- **WHEN**'),
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toEqual({ kind: 'test', selector: 'creates a user', line: 10 });
  });

  it('reads a non-testable reason', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:non-testable reason="legal review" -->'),
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toEqual({
      kind: 'non-testable',
      reason: 'legal review',
      line: 10,
    });
  });

  it('accepts blank lines before the directive', () => {
    const result = parseAnnotations(lines('', '<!-- openspec-guard:test="a" -->', '- **WHEN**'));
    expect(result.errors).toEqual([]);
    expect(result.annotation?.kind).toBe('test');
  });

  it('unescapes an escaped double quote inside a selector', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:test="says \\"hi\\"" -->'));
    expect(result.errors).toEqual([]);
    expect(result.annotation).toMatchObject({ selector: 'says "hi"' });
  });

  it('rejects the two kinds together as a conflict', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="a" -->', '<!-- openspec-guard:non-testable reason="b" -->'),
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_CONFLICT']);
  });

  it('rejects two test directives as a duplicate', () => {
    const result = parseAnnotations(
      lines('<!-- openspec-guard:test="a" -->', '<!-- openspec-guard:test="b" -->'),
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_DUPLICATE']);
  });

  it('rejects a missing reason', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:non-testable -->'));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects an empty reason', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:non-testable reason="" -->'));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_EMPTY_REASON']);
  });

  it('rejects a whitespace-only reason', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:non-testable reason="   " -->'));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_EMPTY_REASON']);
  });

  it('rejects an empty selector', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:test="" -->'));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects single quotes', () => {
    const result = parseAnnotations(lines("<!-- openspec-guard:test='a' -->"));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_SYNTAX']);
  });

  it('rejects an unknown directive rather than ignoring it', () => {
    const result = parseAnnotations(lines('<!-- openspec-guard:tets="a" -->'));
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_UNKNOWN']);
  });

  it('rejects a directive placed after the start of the body', () => {
    const result = parseAnnotations(
      lines('- **WHEN** something', '<!-- openspec-guard:test="a" -->', '- **THEN** something'),
    );
    expect(result.errors.map((error) => error.code)).toEqual(['E_ANNOTATION_MISPLACED']);
    expect(result.annotation).toBeNull();
  });

  it('ignores foreign HTML comments, wherever they are', () => {
    const result = parseAnnotations(
      lines('<!-- prettier-ignore -->', '- **WHEN** x', '<!-- TODO: rewrite -->'),
    );
    expect(result.errors).toEqual([]);
    expect(result.annotation).toBeNull();
  });

  it('returns nothing on a plain scenario', () => {
    const result = parseAnnotations(lines('- **WHEN** x', '- **THEN** y'));
    expect(result.errors).toEqual([]);
    expect(result.annotation).toBeNull();
  });
});
