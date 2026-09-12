import { createHash } from 'node:crypto';

import { OpenSpecGuardError } from './errors.js';
import { parseAnnotations } from './openspec/annotations.js';
import type { ParsedSpec } from './openspec/parse.js';
import type { Criterion } from './types.js';

/**
 * Criterion identifier derivation.
 *
 * Two structural decisions, made once:
 *
 * 1. The requirement name is part of the hash. Scenario titles are not unique,
 *    not even within a single file: real corpora contain several
 *    `Scenario: Anonymous visitor`. The path alone cannot tell two criteria
 *    apart.
 * 2. `openspec-guard:` comments are stripped from the normalized text. Otherwise
 *    adding a selector to a scenario would change its id, and any future
 *    baseline would be invalidated by the very first selector someone writes.
 */

const SPECGUARD_COMMENT = /^\s*<!--\s*openspec-guard:[\s\S]*?-->\s*$/;

/**
 * Canonical text of a scenario: heading then body, annotations stripped,
 * trailing whitespace cut, consecutive blank lines collapsed to one, NFC.
 */
export function normalizeScenarioText(heading: string, bodyLines: readonly string[]): string {
  const kept = bodyLines.filter((line) => !SPECGUARD_COMMENT.test(line));
  const lines = [heading, ...kept].map((line) => line.replace(/[ \t]+$/, ''));

  const collapsed: string[] = [];
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();

  return collapsed.join('\n').normalize('NFC');
}

/**
 * `sg_` plus 16 hex characters of sha256(path, requirement, normalized text).
 * Fields are separated by a NUL byte, which cannot occur in any of them, so no
 * two different field splits can produce the same input.
 */
export function criterionId(
  relPath: string,
  requirementName: string,
  normalizedScenarioText: string,
): string {
  const hash = createHash('sha256')
    .update(relPath, 'utf8')
    .update('\u0000')
    .update(requirementName.normalize('NFC'), 'utf8')
    .update('\u0000')
    .update(normalizedScenarioText, 'utf8')
    .digest('hex');
  return `sg_${hash.slice(0, 16)}`;
}

/**
 * Breaks residual collisions (same file, same requirement, same scenario text,
 * twice) with a suffix, in document order.
 */
export function disambiguateIds(ids: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    return count === 1 ? id : `${id}-${count}`;
  });
}

export interface BuildCriteriaResult {
  criteria: Criterion[];
  /** Annotation problems. Any of these stops the run with exit code 2. */
  errors: OpenSpecGuardError[];
  /** Scenarios under a `## REMOVED Requirements` section, counted not checked. */
  removedScenarioCount: number;
}

/**
 * Turns parsed specs into criteria.
 *
 * Scenarios under a `REMOVED` delta section are parsed and counted, but never
 * become criteria: we do not ask for a test covering what is being removed.
 */
export function buildCriteria(specs: readonly ParsedSpec[]): BuildCriteriaResult {
  const draft: Omit<Criterion, 'id'>[] = [];
  const rawIds: string[] = [];
  const errors: OpenSpecGuardError[] = [];
  let removedScenarioCount = 0;

  for (const spec of specs) {
    for (const requirement of spec.requirements) {
      for (const scenario of requirement.scenarios) {
        if (requirement.operation === 'removed') {
          removedScenarioCount += 1;
          continue;
        }

        const parsed = parseAnnotations(scenario.annotationLines);
        for (const error of parsed.errors) {
          errors.push(
            new OpenSpecGuardError(error.code, error.message, {
              file: spec.file,
              line: error.line,
            }),
          );
        }

        rawIds.push(
          criterionId(
            spec.file,
            requirement.name,
            normalizeScenarioText(`#### ${scenario.heading}`, scenario.bodyLines),
          ),
        );
        draft.push({
          capability: spec.capability,
          requirement: requirement.name,
          scenario: scenario.name,
          file: spec.file,
          line: scenario.line,
          operation: requirement.operation,
          isNamedScenario: scenario.isNamedScenario,
          annotation: parsed.annotation,
        });
      }
    }
  }

  const ids = disambiguateIds(rawIds);
  const criteria = draft.map((entry, index) => ({ id: ids[index] as string, ...entry }));

  return { criteria, errors, removedScenarioCount };
}
