import { describe, expect, it } from 'vitest';

import { parseDocument } from './aidd/parse.js';
import { buildCriteria, deriveId } from './criteria.js';

const build = (content: string, file = 'plan.md', task = '2026_09/x') =>
  buildCriteria([{ ...parseDocument(content, file), task }]);

describe('identifiers', () => {
  it('is the same for the same criterion in the same place', () => {
    expect(deriveId('plan.md', 'a', 'Phase 1', 'It holds.')).toBe(
      deriveId('plan.md', 'a', 'Phase 1', 'It holds.'),
    );
  });

  it('separates two identical texts written in different tasks', () => {
    expect(deriveId('plan.md', 'a', 'Phase 1', 'It holds.')).not.toBe(
      deriveId('plan.md', 'b', 'Phase 1', 'It holds.'),
    );
  });

  it('separates two identical texts written in different sections', () => {
    expect(deriveId('plan.md', 'a', 'Phase 1', 'It holds.')).not.toBe(
      deriveId('plan.md', 'a', 'Phase 2', 'It holds.'),
    );
  });

  it('does not change when the box is ticked', () => {
    const before = build('- [ ] The export produces a JSON file.');
    const after = build('- [x] The export produces a JSON file.');

    expect(after.criteria[0]?.id).toBe(before.criteria[0]?.id);
    expect(after.criteria[0]?.claimed).toBe(true);
  });

  it('does not change when a selector is added', () => {
    const before = build('- [ ] The export produces a JSON file.');
    const after = build(
      ['- [ ] The export produces a JSON file.', '  <!-- aidd-guard:test="writes JSON" -->'].join(
        '\n',
      ),
    );

    expect(after.criteria[0]?.id).toBe(before.criteria[0]?.id);
    expect(after.criteria[0]?.annotation).toMatchObject({ kind: 'test' });
  });

  it('suffixes a criterion written twice in the same section', () => {
    const built = build(['- [ ] Same line.', '- [ ] Same line.'].join('\n'));
    const [first, second] = built.criteria;

    expect(first?.id).not.toBe(second?.id);
    expect(second?.id).toBe(`${first?.id}#2`);
  });
});

describe('building', () => {
  it('carries the location, the task and the carrier', () => {
    const built = build('- [ ] It holds.', 'aidd_docs/tasks/2026_09/x/plan.md', '2026_09/x');

    expect(built.criteria[0]).toMatchObject({
      task: '2026_09/x',
      source: 'checkbox',
      file: 'aidd_docs/tasks/2026_09/x/plan.md',
      line: 1,
    });
  });

  it('counts the ticked boxes', () => {
    const built = build(['- [x] One.', '- [ ] Two.', '- [x] Three.'].join('\n'));
    expect(built.claimedCount).toBe(2);
  });

  it('locates an annotation error in the document', () => {
    const built = build(['- [ ] It holds.', '  <!-- aidd-guard:test="" -->'].join('\n'));

    expect(built.errors).toHaveLength(1);
    expect(built.errors[0]?.location).toEqual({ file: 'plan.md', line: 2 });
    expect(built.errors[0]?.exitCode).toBe(2);
  });
});
