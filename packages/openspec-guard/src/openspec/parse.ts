import type { DeltaOperation } from '../types.js';
import type { AnnotationLine } from './annotations.js';

/**
 * OpenSpec markdown parser. Pure function over a string, no I/O.
 *
 * It follows the official format rather than a convenient subset:
 *
 * - requirements are only read under `## Requirements` (base spec) or under a
 *   `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` delta section;
 * - EVERY `####` heading under a requirement counts as a scenario, not only
 *   those literally named `Scenario:`. That is what the official parser does.
 *   We keep `isNamedScenario` so the anomaly is visible instead of silent.
 *
 * Structural problems produce warnings, not errors: a spec that is odd is
 * still worth checking. Only annotation problems stop a run.
 */

export interface ParsedScenario {
  /** Raw text after `#### `. */
  heading: string;
  /** Heading without the `Scenario:` prefix when there is one. */
  name: string;
  isNamedScenario: boolean;
  /** 1-based line of the `####` heading. */
  line: number;
  /** Body lines, heading excluded, trailing blank lines trimmed. */
  bodyLines: string[];
  /** Same body lines, carrying their 1-based line numbers. */
  annotationLines: AnnotationLine[];
}

export interface ParsedRequirement {
  name: string;
  /** 1-based line of the `###` heading. */
  line: number;
  operation: DeltaOperation;
  /** Normative prose between the requirement heading and the first scenario. */
  statement: string;
  scenarios: ParsedScenario[];
}

export interface ParseWarning {
  code: string;
  message: string;
  line: number;
}

export interface ParsedSpec {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  capability: string;
  requirements: ParsedRequirement[];
  warnings: ParseWarning[];
}

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const REQUIREMENT_HEADING = /^###\s+Requirement\s*:\s*(.+?)\s*$/;
const REQUIREMENT_HEADING_LOOSE = /^###\s+Requirement\s+(.+?)\s*$/;
const SCENARIO_HEADING = /^####\s+(.+?)\s*$/;
const ANY_HEADING = /^(#{1,6})\s/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const SCENARIO_PREFIX = /^Scenario\s*:\s*/;

const DELTA_SECTIONS: Record<string, DeltaOperation> = {
  requirements: 'base',
  'added requirements': 'added',
  'modified requirements': 'modified',
  'removed requirements': 'removed',
  'renamed requirements': 'renamed',
};

/** CRLF to LF, BOM stripped, NFC. Accents are preserved: they are displayed. */
function normalizeSource(source: string): string {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC');
}

function trimTrailingBlanks(lines: AnnotationLine[]): void {
  while (lines.length > 0 && (lines[lines.length - 1]?.text ?? '').trim() === '') lines.pop();
}

export function parseSpec(source: string, file: string, capability: string): ParsedSpec {
  const lines = normalizeSource(source).split('\n');
  const warnings: ParseWarning[] = [];
  const requirements: ParsedRequirement[] = [];

  let operation: DeltaOperation | null = null;
  let requirement: ParsedRequirement | null = null;
  let scenario: ParsedScenario | null = null;
  let statementLines: string[] = [];
  let sawRequirementsSection = false;
  let fence: string | null = null;

  const closeScenario = (): void => {
    if (!scenario) return;
    trimTrailingBlanks(scenario.annotationLines);
    scenario.bodyLines = scenario.annotationLines.map((entry) => entry.text);
    scenario = null;
  };

  const closeRequirement = (): void => {
    closeScenario();
    if (!requirement) return;
    requirement.statement = statementLines.join('\n').trim();
    if (requirement.scenarios.length === 0) {
      warnings.push({
        code: 'W_REQUIREMENT_WITHOUT_SCENARIO',
        message: `Requirement ${JSON.stringify(requirement.name)} has no scenario.`,
        line: requirement.line,
      });
    }
    requirement = null;
    statementLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? '';
    const lineNumber = index + 1;

    // Fenced code blocks suspend heading detection: a `#### ` inside an
    // example is content, not structure.
    const fenceMatch = FENCE.exec(text);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    if (fence !== null || !ANY_HEADING.test(text)) {
      if (scenario) scenario.annotationLines.push({ text, line: lineNumber });
      else if (requirement) statementLines.push(text);
      continue;
    }

    const section = SECTION_HEADING.exec(text);
    if (section) {
      closeRequirement();
      const key = (section[1] ?? '').toLowerCase();
      operation = DELTA_SECTIONS[key] ?? null;
      if (operation !== null) sawRequirementsSection = true;
      continue;
    }

    const strict = REQUIREMENT_HEADING.exec(text);
    const loose = strict ? null : REQUIREMENT_HEADING_LOOSE.exec(text);
    if (strict || loose) {
      closeRequirement();
      if (loose) {
        warnings.push({
          code: 'W_REQUIREMENT_HEADING_FORM',
          message: 'Requirement heading is missing its colon. Expected `### Requirement: name`.',
          line: lineNumber,
        });
      }
      if (operation === null) {
        warnings.push({
          code: 'W_REQUIREMENT_OUTSIDE_SECTION',
          message:
            'Requirement found outside a `## Requirements` or `## ADDED|MODIFIED|REMOVED|' +
            'RENAMED Requirements` section. It is ignored.',
          line: lineNumber,
        });
        continue;
      }
      requirement = {
        name: (strict?.[1] ?? loose?.[1] ?? '').trim(),
        line: lineNumber,
        operation,
        statement: '',
        scenarios: [],
      };
      statementLines = [];
      requirements.push(requirement);
      continue;
    }

    const scenarioHeading = SCENARIO_HEADING.exec(text);
    if (scenarioHeading) {
      closeScenario();
      if (!requirement) {
        warnings.push({
          code: 'W_SCENARIO_WITHOUT_REQUIREMENT',
          message: 'Scenario heading found before any requirement. It is ignored.',
          line: lineNumber,
        });
        continue;
      }
      const heading = (scenarioHeading[1] ?? '').trim();
      const isNamedScenario = SCENARIO_PREFIX.test(heading);
      scenario = {
        heading,
        name: isNamedScenario ? heading.replace(SCENARIO_PREFIX, '').trim() : heading,
        isNamedScenario,
        line: lineNumber,
        bodyLines: [],
        annotationLines: [],
      };
      requirement.scenarios.push(scenario);
      continue;
    }

    // Any other heading (`#`, `###` that is not a Requirement, `#####`) closes
    // the current scenario but leaves the requirement open.
    closeScenario();
  }

  closeRequirement();

  if (!sawRequirementsSection) {
    warnings.push({
      code: 'W_NO_REQUIREMENTS_SECTION',
      message: 'No `## Requirements` or delta requirements section found in this file.',
      line: 1,
    });
  }

  return { file, capability, requirements, warnings };
}
