import { describe, expect, it } from 'vitest';

import { isAnnotationLine, parseAnnotations } from './annotations.js';

const at = (...lines: string[]): { text: string; line: number }[] =>
  lines.map((text, index) => ({ text, line: index + 1 }));

describe('isAnnotationLine', () => {
  it('recognizes our namespace and nothing else', () => {
    expect(isAnnotationLine('<!-- aidd-guard:test="x" -->')).toBe(true);
    expect(isAnnotationLine('  <!--   aidd-guard:test="x"   -->')).toBe(true);
    expect(isAnnotationLine('<!-- a note for a human -->')).toBe(false);
    expect(isAnnotationLine('<!-- openspec-guard:test="x" -->')).toBe(false);
    expect(isAnnotationLine('not a comment')).toBe(false);
  });
});

describe('the test directive', () => {
  it('reads a selector', () => {
    const { annotation, errors } = parseAnnotations(at('<!-- aidd-guard:test="writes JSON" -->'));
    expect(errors).toEqual([]);
    expect(annotation).toEqual({ kind: 'test', selector: 'writes JSON', line: 1 });
  });

  it('reads a full name selector', () => {
    const { annotation } = parseAnnotations(at('<!-- aidd-guard:test="signup > empty field" -->'));
    expect(annotation).toMatchObject({ selector: 'signup > empty field' });
  });

  it('unescapes an escaped quote', () => {
    const { annotation } = parseAnnotations(at('<!-- aidd-guard:test="says \\"no\\"" -->'));
    expect(annotation).toMatchObject({ selector: 'says "no"' });
  });

  it('refuses single quotes rather than guessing', () => {
    const { annotation, errors } = parseAnnotations(at("<!-- aidd-guard:test='writes JSON' -->"));
    expect(annotation).toBeNull();
    expect(errors[0]?.code).toBe('E_ANNOTATION_SYNTAX');
  });

  it('refuses an empty selector', () => {
    const { errors } = parseAnnotations(at('<!-- aidd-guard:test="" -->'));
    expect(errors[0]?.code).toBe('E_ANNOTATION_SYNTAX');
  });
});

describe('the non-testable directive', () => {
  it('reads a reason', () => {
    const { annotation } = parseAnnotations(
      at('<!-- aidd-guard:non-testable reason="Needs a human" -->'),
    );
    expect(annotation).toEqual({ kind: 'non-testable', reason: 'Needs a human', line: 1 });
  });

  it('refuses an empty reason, which is what makes a skip auditable', () => {
    const { errors } = parseAnnotations(at('<!-- aidd-guard:non-testable reason="" -->'));
    expect(errors[0]?.code).toBe('E_ANNOTATION_EMPTY_REASON');
  });

  it('refuses a missing reason', () => {
    const { errors } = parseAnnotations(at('<!-- aidd-guard:non-testable -->'));
    expect(errors[0]?.code).toBe('E_ANNOTATION_SYNTAX');
  });
});

describe('a typo is an error, never silence', () => {
  it('refuses an unknown directive', () => {
    const { errors } = parseAnnotations(at('<!-- aidd-guard:tests="x" -->'));
    expect(errors[0]?.code).toBe('E_ANNOTATION_UNKNOWN');
  });

  it('ignores a comment that is not ours', () => {
    const { annotation, errors } = parseAnnotations(at('<!-- TODO: link this one -->'));
    expect(annotation).toBeNull();
    expect(errors).toEqual([]);
  });
});

describe('one directive per criterion', () => {
  it('refuses two directives of the same kind', () => {
    const { errors } = parseAnnotations(
      at('<!-- aidd-guard:test="one" -->', '<!-- aidd-guard:test="two" -->'),
    );
    expect(errors[0]?.code).toBe('E_ANNOTATION_DUPLICATE');
  });

  it('refuses a criterion both linked and declared non-testable', () => {
    const { errors } = parseAnnotations(
      at('<!-- aidd-guard:test="one" -->', '<!-- aidd-guard:non-testable reason="why" -->'),
    );
    expect(errors[0]?.code).toBe('E_ANNOTATION_CONFLICT');
  });
});
