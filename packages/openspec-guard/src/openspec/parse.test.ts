import { describe, expect, it } from 'vitest';

import { parseSpec } from './parse.js';

function parse(source: string) {
  return parseSpec(source, 'openspec/specs/demo/spec.md', 'demo');
}

const BASE = `# demo Specification

## Purpose

Some prose that is not a requirement.

## Requirements

### Requirement: Access is server resolved

The system SHALL restrict the console to privileged accounts.

#### Scenario: Anonymous visitor

- **WHEN** a request without a valid session reaches a page
- **THEN** the system redirects to \`/login\`

#### Scenario: Privileged staff

- **WHEN** a privileged user reaches the console
- **THEN** access is granted
`;

describe('parseSpec', () => {
  it('reads requirements and scenarios of a base spec', () => {
    const spec = parse(BASE);
    expect(spec.warnings).toEqual([]);
    expect(spec.requirements).toHaveLength(1);
    const [requirement] = spec.requirements;
    expect(requirement?.name).toBe('Access is server resolved');
    expect(requirement?.operation).toBe('base');
    expect(requirement?.statement).toBe(
      'The system SHALL restrict the console to privileged accounts.',
    );
    expect(requirement?.scenarios.map((scenario) => scenario.name)).toEqual([
      'Anonymous visitor',
      'Privileged staff',
    ]);
    expect(requirement?.scenarios[0]?.line).toBe(13);
  });

  it('does not leak prose from outside the requirements section', () => {
    const spec = parse(BASE);
    expect(spec.requirements[0]?.statement).not.toContain('not a requirement');
  });

  it('reads each delta section with its operation', () => {
    const source = [
      '## ADDED Requirements',
      '',
      '### Requirement: A',
      '',
      '#### Scenario: a',
      '',
      '## MODIFIED Requirements',
      '',
      '### Requirement: B',
      '',
      '#### Scenario: b',
      '',
      '## REMOVED Requirements',
      '',
      '### Requirement: C',
      '',
      '#### Scenario: c',
      '',
      '## RENAMED Requirements',
      '',
      '### Requirement: D',
      '',
      '- FROM: `old`',
      '- TO: `new`',
      '',
      '#### Scenario: d',
      '',
    ].join('\n');
    expect(parse(source).requirements.map((requirement) => requirement.operation)).toEqual([
      'added',
      'modified',
      'removed',
      'renamed',
    ]);
  });

  it('keeps RENAMED bullets in the statement, never as headings', () => {
    const source = '## RENAMED Requirements\n\n### Requirement: D\n\n- FROM: `a`\n- TO: `b`\n';
    expect(parse(source).requirements[0]?.statement).toBe('- FROM: `a`\n- TO: `b`');
  });

  it('treats a non-Scenario #### heading as a scenario, and flags it', () => {
    const source = '## Requirements\n\n### Requirement: A\n\n#### Notes\n\n- something\n';
    const scenario = parse(source).requirements[0]?.scenarios[0];
    expect(scenario?.isNamedScenario).toBe(false);
    expect(scenario?.name).toBe('Notes');
  });

  it('keeps indented continuation lines in the scenario body', () => {
    const source = [
      '## Requirements',
      '',
      '### Requirement: A',
      '',
      '#### Scenario: a',
      '',
      '- **THEN** the privilege is resolved, and',
      '  cross-tenant reads go through the gate',
      '',
    ].join('\n');
    expect(parse(source).requirements[0]?.scenarios[0]?.bodyLines).toEqual([
      '',
      '- **THEN** the privilege is resolved, and',
      '  cross-tenant reads go through the gate',
    ]);
  });

  it('ignores headings inside a fenced code block', () => {
    const source = [
      '## Requirements',
      '',
      '### Requirement: A',
      '',
      '#### Scenario: a',
      '',
      '```md',
      '#### Scenario: not a real scenario',
      '### Requirement: not a real requirement',
      '```',
      '',
    ].join('\n');
    const spec = parse(source);
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0]?.scenarios).toHaveLength(1);
    expect(spec.requirements[0]?.scenarios[0]?.bodyLines).toContain(
      '#### Scenario: not a real scenario',
    );
  });

  it('accepts CRLF input', () => {
    const spec = parseSpec(BASE.replace(/\n/g, '\r\n'), 'a/spec.md', 'a');
    expect(spec.requirements[0]?.scenarios).toHaveLength(2);
    expect(spec.requirements[0]?.scenarios[0]?.bodyLines.join('')).not.toContain('\r');
  });

  it('preserves accents in names', () => {
    const source = '## Requirements\n\n### Requirement: Création\n\n#### Scenario: Réservé\n';
    const requirement = parse(source).requirements[0];
    expect(requirement?.name).toBe('Création');
    expect(requirement?.scenarios[0]?.name).toBe('Réservé');
  });

  it('warns about a requirement without any scenario', () => {
    const source = '## Requirements\n\n### Requirement: A\n\nThe system SHALL do things.\n';
    expect(parse(source).warnings.map((warning) => warning.code)).toEqual([
      'W_REQUIREMENT_WITHOUT_SCENARIO',
    ]);
  });

  it('warns about a scenario found before any requirement', () => {
    const source = '## Requirements\n\n#### Scenario: orphan\n';
    expect(parse(source).warnings.map((warning) => warning.code)).toContain(
      'W_SCENARIO_WITHOUT_REQUIREMENT',
    );
  });

  it('warns when no requirements section exists at all', () => {
    expect(parse('# Title\n\n## Purpose\n\nprose\n').warnings.map((w) => w.code)).toEqual([
      'W_NO_REQUIREMENTS_SECTION',
    ]);
  });

  it('warns about a requirement heading missing its colon, and still reads it', () => {
    const source = '## Requirements\n\n### Requirement A\n\n#### Scenario: a\n';
    const spec = parse(source);
    expect(spec.warnings.map((warning) => warning.code)).toEqual(['W_REQUIREMENT_HEADING_FORM']);
    expect(spec.requirements[0]?.name).toBe('A');
  });

  it('ignores a requirement declared outside any requirements section', () => {
    const source = '## Purpose\n\n### Requirement: A\n\n#### Scenario: a\n';
    const spec = parse(source);
    expect(spec.requirements).toEqual([]);
    expect(spec.warnings.map((warning) => warning.code)).toContain('W_REQUIREMENT_OUTSIDE_SECTION');
  });
});
