import { describe, expect, it } from 'vitest';

import { isAnnotationComment } from './annotations.js';
import { buildCriteria, criterionId, normalizeScenarioText } from './criteria.js';
import type { AnnotationVocabulary, ParsedCriterion, ParsedDocument } from './format.js';

/**
 * The seam itself.
 *
 * `buildCriteria` used to walk an OpenSpec tree and read its delta vocabulary.
 * It now takes a flat list any format can produce. These tests hold the two
 * things that would break silently if the seam were cut wrong.
 */

const FORMAT: AnnotationVocabulary = {
  annotationPrefix: 'openspec-guard',
  acceptedPrefixes: ['openspec-guard', 'spec-guard'],
};

function criterion(overrides: Partial<ParsedCriterion> = {}): ParsedCriterion {
  return {
    capability: 'account',
    requirement: 'Sign up',
    scenario: 'Sign up with a valid email',
    heading: '#### Scenario: Sign up with a valid email',
    file: 'specs/account/spec.md',
    line: 12,
    isNamedScenario: true,
    bodyLines: ['- **WHEN** a visitor submits a valid email'],
    annotationLines: [{ text: '- **WHEN** a visitor submits a valid email', line: 13 }],
    claimedDone: null,
    excluded: false,
    meta: { operation: 'added' },
    ...overrides,
  };
}

function document(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    file: 'specs/account/spec.md',
    warnings: [],
    criteria: [],
    ...overrides,
  };
}

describe('buildCriteria over ParsedDocument', () => {
  it('carries adapter metadata through without reading it', () => {
    const result = buildCriteria([document({ criteria: [criterion()] })], FORMAT);

    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]?.meta).toEqual({ operation: 'added' });
  });

  it('counts an excluded criterion without turning it into one', () => {
    const result = buildCriteria(
      [
        document({
          criteria: [
            criterion({
              requirement: 'Close the account',
              scenario: 'Closing removes the profile',
              heading: '#### Scenario: Closing removes the profile',
              line: 40,
              bodyLines: [],
              annotationLines: [],
              excluded: true,
              meta: { operation: 'removed' },
            }),
          ],
        }),
      ],
      FORMAT,
    );

    expect(result.criteria).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });

  it('carries claimedDone through, null included', () => {
    const result = buildCriteria(
      [
        document({
          criteria: [criterion(), criterion({ line: 20, claimedDone: true })],
        }),
      ],
      FORMAT,
    );

    expect(result.criteria.map((entry) => entry.claimedDone)).toEqual([null, true]);
  });

  it("reads a criterion's own file, so one document may span several", () => {
    const result = buildCriteria(
      [
        document({
          file: 'specs/account/spec.md',
          criteria: [criterion({ file: 'specs/account/other.md' })],
        }),
      ],
      FORMAT,
    );

    expect(result.criteria[0]?.file).toBe('specs/account/other.md');
  });

  it('never sees a heading marker: it hashes what the adapter reports', () => {
    // A format with no `####` anywhere still produces a stable id, which is
    // only true because the core does not build the heading itself.
    const result = buildCriteria(
      [document({ criteria: [criterion({ heading: 'AC-1: the visitor is signed in' })] })],
      FORMAT,
    );

    expect(result.criteria[0]?.id).toBe(
      criterionId(
        'specs/account/spec.md',
        'Sign up',
        normalizeScenarioText(
          'AC-1: the visitor is signed in',
          ['- **WHEN** a visitor submits a valid email'],
          FORMAT,
        ),
      ),
    );
  });
});

/**
 * Invariant 1: one prefix value, two call sites.
 *
 * `parseAnnotations` decides what is a directive, and `normalizeScenarioText`
 * decides what is stripped before hashing. They used to carry two copies of
 * the same literal. If those two ever derive from different values, adding a
 * selector to a scenario moves its id, and every baseline in the wild is
 * silently invalidated.
 */
describe('the annotation prefix has one source', () => {
  const annotated = (text: string): ParsedDocument =>
    document({
      criteria: [
        criterion({
          bodyLines: [text, '- **WHEN** a visitor submits a valid email'],
          annotationLines: [
            { text, line: 13 },
            { text: '- **WHEN** a visitor submits a valid email', line: 14 },
          ],
        }),
      ],
    });

  it('parses the directive AND strips it from the hashed text, from one format', () => {
    const plain = buildCriteria([document({ criteria: [criterion()] })], FORMAT);
    const withSelector = buildCriteria(
      [annotated('<!-- openspec-guard:test="creates a user" -->')],
      FORMAT,
    );

    // Parsed by annotations.ts.
    expect(withSelector.criteria[0]?.annotation).toEqual({
      kind: 'test',
      selector: 'creates a user',
      line: 13,
    });
    // Stripped by criteria.ts. Same prefix, or these two would differ.
    expect(withSelector.criteria[0]?.id).toBe(plain.criteria[0]?.id);
  });

  it('holds for every accepted spelling, not just the one this binary writes', () => {
    const plain = buildCriteria([document({ criteria: [criterion()] })], FORMAT);

    for (const prefix of FORMAT.acceptedPrefixes) {
      const line = `<!-- ${prefix}:test="creates a user" -->`;
      const result = buildCriteria([annotated(line)], FORMAT);

      expect(isAnnotationComment(line, FORMAT)).toBe(true);
      expect(result.criteria[0]?.annotation).not.toBeNull();
      expect(result.criteria[0]?.id).toBe(plain.criteria[0]?.id);
    }
  });

  it("leaves a foreign format's comment both unparsed and unstripped", () => {
    const line = '<!-- aidd-guard:test="creates a user" -->';
    const plain = buildCriteria([document({ criteria: [criterion()] })], FORMAT);
    const result = buildCriteria([annotated(line)], FORMAT);

    expect(isAnnotationComment(line, FORMAT)).toBe(false);
    expect(result.criteria[0]?.annotation).toBeNull();
    // Not ours, so it is content: it belongs in the hash.
    expect(result.criteria[0]?.id).not.toBe(plain.criteria[0]?.id);
  });
});
