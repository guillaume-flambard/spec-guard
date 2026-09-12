import { describe, expect, it } from 'vitest';

import { parseDocument } from './parse.js';

const texts = (content: string): string[] =>
  parseDocument(content, 'spec.md').criteria.map((criterion) => criterion.text);

describe('Done-when bullets', () => {
  it('reads the bullets under the Done-when heading', () => {
    const parsed = parseDocument(
      ['# Feature', '', '## Done-when', '', '- The export produces a JSON file.', ''].join('\n'),
      'aidd_docs/tasks/2026_09/x/spec.md',
    );

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0]).toMatchObject({
      source: 'done-when',
      section: 'Done-when',
      text: 'The export produces a JSON file.',
      line: 5,
      claimed: null,
    });
  });

  it('ignores bullets outside the Done-when section', () => {
    const content = [
      '## Non-goals',
      '',
      '- Nothing about billing.',
      '',
      '## Done-when',
      '',
      '- The export produces a JSON file.',
      '',
      '## Stakeholders',
      '',
      '- Decider: the product owner.',
    ].join('\n');

    expect(texts(content)).toEqual(['The export produces a JSON file.']);
  });

  it('accepts the spellings a human types for the heading', () => {
    for (const heading of ['## Done-when', '## Done when', '## DONE-WHEN']) {
      expect(texts([heading, '', '- It holds.'].join('\n'))).toEqual(['It holds.']);
    }
  });

  it('closes the section on a heading of the same or a higher level', () => {
    const content = [
      '## Done-when',
      '',
      '- Inside the section.',
      '',
      '### A sub-heading stays inside',
      '',
      '- Still inside.',
      '',
      '## Context',
      '',
      '- Outside.',
    ].join('\n');

    expect(texts(content)).toEqual(['Inside the section.', 'Still inside.']);
  });
});

describe('acceptance checkboxes', () => {
  it('reads a checkbox anywhere in the document, with its state', () => {
    const parsed = parseDocument(
      [
        '### Phase 1: Read the hooks',
        '',
        '#### Acceptance criteria',
        '',
        '- [ ] The repair never runs when the delegate is absent.',
        '- [x] A session started in a subdirectory writes nowhere above it.',
      ].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria).toHaveLength(2);
    expect(parsed.criteria[0]?.claimed).toBe(false);
    expect(parsed.criteria[1]?.claimed).toBe(true);
    expect(parsed.criteria[1]?.section).toBe('Acceptance criteria');
    expect(parsed.criteria[0]?.source).toBe('checkbox');
  });

  it('accepts an upper-case tick', () => {
    const parsed = parseDocument('- [X] Done already.', 'plan.md');
    expect(parsed.criteria[0]?.claimed).toBe(true);
  });

  it('does not read a checkbox as a Done-when bullet', () => {
    const parsed = parseDocument(
      ['## Done-when', '', '- [ ] A ticked outcome.'].join('\n'),
      'spec.md',
    );
    expect(parsed.criteria[0]?.source).toBe('checkbox');
  });
});

describe('what a naive reader gets wrong', () => {
  it('ignores the bulleted body of a multi-line HTML comment', () => {
    const content = [
      '<!--  AI INSTRUCTIONS ONLY -- Follow those rules, do not output them.',
      '',
      '- ENGLISH ONLY',
      '- Each phase MUST have acceptance criteria.',
      '-->',
      '',
      '## Done-when',
      '',
      '- The report lists one row per flow.',
    ].join('\n');

    expect(texts(content)).toEqual(['The report lists one row per flow.']);
  });

  it('ignores bullets and boxes inside a fenced block', () => {
    const content = [
      '## Done-when',
      '',
      '```mermaid',
      'flowchart LR',
      '  - not a criterion',
      '```',
      '',
      '- A real criterion.',
      '',
      '```sh',
      '- [ ] neither is this',
      '```',
    ].join('\n');

    expect(texts(content)).toEqual(['A real criterion.']);
  });

  it('joins a criterion that wrapped onto the next line', () => {
    const content = [
      '- [ ] A `prepare-commit-msg` overwritten between two commits calls the delegate again after',
      '      the repair, so the trailer survives.',
    ].join('\n');

    expect(texts(content)).toEqual([
      'A `prepare-commit-msg` overwritten between two commits calls the delegate again after ' +
        'the repair, so the trailer survives.',
    ]);
  });

  it('carries the last line of a wrapped criterion, so an annotation lands after it', () => {
    const parsed = parseDocument(
      ['- [ ] A criterion that runs', '      onto a second line.'].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria[0]?.line).toBe(1);
    expect(parsed.criteria[0]?.endLine).toBe(2);
  });

  it('carries the indentation of a nested criterion', () => {
    const parsed = parseDocument('  - [ ] Nested under something.', 'plan.md');

    expect(parsed.criteria[0]?.indent).toBe(2);
    expect(parsed.criteria[0]?.endLine).toBe(1);
  });

  it('does not swallow the next criterion as a continuation', () => {
    const content = ['- [ ] First criterion.', '- [ ] Second criterion.'].join('\n');
    expect(texts(content)).toEqual(['First criterion.', 'Second criterion.']);
  });

  it('drops an unfilled template placeholder and says so', () => {
    const parsed = parseDocument(
      ['#### Acceptance criteria', '', '- [ ] {verifiable boolean condition 1}'].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria).toEqual([]);
    expect(parsed.warnings[0]?.code).toBe('W_PLACEHOLDER');
  });
});

describe('attached lines', () => {
  it('attaches an annotation written under the criterion', () => {
    const parsed = parseDocument(
      [
        '- [ ] The export produces a JSON file.',
        '  <!-- aidd-guard:test="writes the export as JSON" -->',
      ].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria[0]?.attached).toHaveLength(1);
    expect(parsed.criteria[0]?.text).toBe('The export produces a JSON file.');
  });

  it('keeps an annotation that follows a blank line', () => {
    const parsed = parseDocument(
      [
        '- [ ] The export produces a JSON file.',
        '',
        '  <!-- aidd-guard:test="writes the export as JSON" -->',
      ].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria[0]?.attached).toHaveLength(1);
  });

  it('does not attach an annotation to the criterion after it', () => {
    const parsed = parseDocument(
      ['- [ ] First.', '  <!-- aidd-guard:test="one" -->', '- [ ] Second.'].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria[0]?.attached).toHaveLength(1);
    expect(parsed.criteria[1]?.attached).toEqual([]);
  });

  it('leaves a foreign HTML comment out of the criterion text', () => {
    const parsed = parseDocument(
      ['- [ ] The export produces a JSON file.', '  <!-- a note to a human -->'].join('\n'),
      'plan.md',
    );

    expect(parsed.criteria[0]?.text).toBe('The export produces a JSON file.');
    expect(parsed.criteria[0]?.attached).toEqual([]);
  });
});

describe('robustness', () => {
  it('reports an unclosed fence rather than reading past it', () => {
    const parsed = parseDocument(['## Done-when', '', '```', '- swallowed'].join('\n'), 'spec.md');

    expect(parsed.criteria).toEqual([]);
    expect(parsed.warnings[0]?.code).toBe('W_UNCLOSED_FENCE');
  });

  it('reads an empty document as no criteria and no error', () => {
    expect(parseDocument('', 'spec.md')).toEqual({ file: 'spec.md', criteria: [], warnings: [] });
  });

  it('handles CRLF line endings', () => {
    const parsed = parseDocument('## Done-when\r\n\r\n- It holds.\r\n', 'spec.md');
    expect(parsed.criteria[0]?.text).toBe('It holds.');
  });
});
