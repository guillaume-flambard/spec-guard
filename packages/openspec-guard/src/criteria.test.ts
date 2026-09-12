import { describe, expect, it } from 'vitest';

import { criterionId, disambiguateIds, normalizeScenarioText } from './criteria.js';

const HEADING = '#### Scenario: Anonymous visitor';
const BODY = [
  '',
  '- **WHEN** a request without a valid session reaches a console page',
  '- **THEN** the system redirects to `/login` without rendering admin data',
  '',
];

function id(
  heading: string,
  body: readonly string[],
  file = 'openspec/specs/a/spec.md',
  req = 'R',
) {
  return criterionId(file, req, normalizeScenarioText(heading, body));
}

describe('normalizeScenarioText', () => {
  it('strips openspec-guard comments from the canonical text', () => {
    const withAnnotation = normalizeScenarioText(HEADING, [
      '<!-- openspec-guard:test="shows the login page" -->',
      ...BODY,
    ]);
    expect(withAnnotation).toBe(normalizeScenarioText(HEADING, BODY));
  });

  it('cuts trailing whitespace and trailing blank lines', () => {
    expect(normalizeScenarioText('#### Scenario: A   ', ['- **WHEN** x  ', '', ''])).toBe(
      '#### Scenario: A\n- **WHEN** x',
    );
  });

  it('collapses consecutive blank lines to one', () => {
    expect(normalizeScenarioText('#### A', ['', '', '- x', '', '', '- y'])).toBe(
      '#### A\n\n- x\n\n- y',
    );
  });

  it('preserves accents and normalizes to NFC', () => {
    const decomposed = 'Scenario: Création'; // e + combining acute
    expect(normalizeScenarioText(`#### ${decomposed}`, [])).toBe('#### Scenario: Création');
  });
});

describe('criterionId', () => {
  it('has the shape sg_ plus 16 hex characters', () => {
    expect(id(HEADING, BODY)).toMatch(/^sg_[0-9a-f]{16}$/);
  });

  it('is identical across two calls', () => {
    expect(id(HEADING, BODY)).toBe(id(HEADING, BODY));
  });

  it('does not move when an annotation is added then removed', () => {
    const base = id(HEADING, BODY);
    const annotated = id(HEADING, ['<!-- openspec-guard:test="a" -->', ...BODY]);
    const nonTestable = id(HEADING, [
      '<!-- openspec-guard:non-testable reason="legal" -->',
      ...BODY,
    ]);
    expect(annotated).toBe(base);
    expect(nonTestable).toBe(base);
  });

  it('changes when the scenario body changes', () => {
    expect(id(HEADING, [...BODY, '- **AND** something else'])).not.toBe(id(HEADING, BODY));
  });

  it('changes when the file moves', () => {
    expect(id(HEADING, BODY, 'openspec/specs/b/spec.md')).not.toBe(id(HEADING, BODY));
  });

  it('changes when the requirement changes, at identical scenario text', () => {
    expect(id(HEADING, BODY, 'openspec/specs/a/spec.md', 'R2')).not.toBe(id(HEADING, BODY));
  });

  it('does not confuse two different splits of the same concatenated fields', () => {
    // The separator is a NUL byte, absent from every path and every title.
    expect(criterionId('a/b', 'c', 'd')).not.toBe(criterionId('a', 'b/c', 'd'));
  });
});

describe('disambiguateIds', () => {
  it('leaves unique ids untouched', () => {
    expect(disambiguateIds(['sg_a', 'sg_b'])).toEqual(['sg_a', 'sg_b']);
  });

  it('suffixes duplicates in document order', () => {
    expect(disambiguateIds(['sg_a', 'sg_a', 'sg_b', 'sg_a'])).toEqual([
      'sg_a',
      'sg_a-2',
      'sg_b',
      'sg_a-3',
    ]);
  });
});
