import { describe, expect, it } from 'vitest';

import { applyEdits, nonTestableAnnotation, testAnnotation } from './edit.js';

describe('the annotation it writes', () => {
  it('quotes and escapes the selector', () => {
    expect(testAnnotation('says "no"')).toBe('<!-- aidd-guard:test="says \\"no\\"" -->');
  });

  it('writes a non-testable reason', () => {
    expect(nonTestableAnnotation('needs a human')).toBe(
      '<!-- aidd-guard:non-testable reason="needs a human" -->',
    );
  });
});

describe('applying edits', () => {
  const source = ['## Done-when', '', '- First criterion.', '- Second criterion.', ''].join('\n');

  it('inserts under the criterion, indented past it', () => {
    const updated = applyEdits(
      source,
      [{ line: 3, indent: 0, annotation: '<!-- aidd-guard:test="one" -->' }],
      'spec.md',
    );

    expect(updated.split('\n')).toEqual([
      '## Done-when',
      '',
      '- First criterion.',
      '  <!-- aidd-guard:test="one" -->',
      '- Second criterion.',
      '',
    ]);
  });

  it('keeps the indentation of a nested criterion', () => {
    const nested = ['  - [ ] Nested.'].join('\n');
    const updated = applyEdits(
      nested,
      [{ line: 1, indent: 2, annotation: '<!-- aidd-guard:test="x" -->' }],
      'plan.md',
    );

    expect(updated.split('\n')[1]).toBe('    <!-- aidd-guard:test="x" -->');
  });

  it('applies several edits without shifting the ones still to come', () => {
    const updated = applyEdits(
      source,
      [
        { line: 3, indent: 0, annotation: '<!-- aidd-guard:test="one" -->' },
        { line: 4, indent: 0, annotation: '<!-- aidd-guard:test="two" -->' },
      ],
      'spec.md',
    );

    expect(updated.split('\n')).toEqual([
      '## Done-when',
      '',
      '- First criterion.',
      '  <!-- aidd-guard:test="one" -->',
      '- Second criterion.',
      '  <!-- aidd-guard:test="two" -->',
      '',
    ]);
  });

  it('writes after the last line of a criterion that wrapped', () => {
    const wrapped = ['- [ ] A criterion that runs', '      onto a second line.', ''].join('\n');
    const updated = applyEdits(
      wrapped,
      [{ line: 2, indent: 0, annotation: '<!-- aidd-guard:test="x" -->' }],
      'plan.md',
    );

    expect(updated.split('\n')[2]).toBe('  <!-- aidd-guard:test="x" -->');
  });

  it('preserves CRLF line endings', () => {
    const crlf = '- One.\r\n- Two.\r\n';
    const updated = applyEdits(
      crlf,
      [{ line: 1, indent: 0, annotation: '<!-- aidd-guard:test="x" -->' }],
      'spec.md',
    );

    expect(updated).toContain('\r\n');
    expect(updated.split('\r\n')[1]).toBe('  <!-- aidd-guard:test="x" -->');
  });

  it('changes nothing when there is nothing to do', () => {
    expect(applyEdits(source, [], 'spec.md')).toBe(source);
  });
});

describe('refusals', () => {
  it('refuses to annotate the same criterion twice in one run', () => {
    expect(() =>
      applyEdits(
        '- One.',
        [
          { line: 1, indent: 0, annotation: '<!-- aidd-guard:test="a" -->' },
          { line: 1, indent: 0, annotation: '<!-- aidd-guard:test="b" -->' },
        ],
        'spec.md',
      ),
    ).toThrowError(/Two annotations for the same criterion/);
  });

  it('refuses when the line is blank, because the file moved under us', () => {
    expect(() =>
      applyEdits(
        ['- One.', '', '- Two.'].join('\n'),
        [{ line: 2, indent: 0, annotation: '<!-- aidd-guard:test="a" -->' }],
        'spec.md',
      ),
    ).toThrowError(/changed since it was read/);
  });

  it('never overwrites an annotation that is already there', () => {
    expect(() =>
      applyEdits(
        ['- One.', '  <!-- aidd-guard:test="existing" -->'].join('\n'),
        [{ line: 1, indent: 0, annotation: '<!-- aidd-guard:test="new" -->' }],
        'spec.md',
      ),
    ).toThrowError(/already carries an annotation/);
  });
});
