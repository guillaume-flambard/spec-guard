import { createHash } from 'node:crypto';

import { isAnnotationComment, parseAnnotations } from './annotations.js';
import { SpecGuardError } from './errors.js';
import type { AnnotationVocabulary, ParsedDocument } from './format.js';
import type { Criterion } from './types.js';

/**
 * Criterion identifier derivation.
 *
 * Three structural decisions, made once:
 *
 * 1. The requirement name is part of the hash. Scenario titles are not unique,
 *    not even within a single file: real corpora contain several
 *    `Scenario: Anonymous visitor`. The path alone cannot tell two criteria
 *    apart.
 * 2. The tool's own annotation comments are stripped from the normalized
 *    text. Otherwise adding a selector to a scenario would change its id, and
 *    any future baseline would be invalidated by the very first selector
 *    someone writes. What counts as one of our comments is decided by
 *    `isAnnotationComment`, the same function the annotation parser uses: one
 *    value, never two copies that could drift.
 * 3. The heading is hashed exactly as the adapter reports it, marker included.
 *    The core does not know what a heading looks like in any format, so it
 *    never builds one.
 *
 * Every baseline file in every repository using this tool keys on the result.
 * Nothing here moves without invalidating all of them.
 */

/**
 * Canonical text of a criterion: heading then body, annotations stripped,
 * trailing whitespace cut, consecutive blank lines collapsed to one, NFC.
 */
export function normalizeScenarioText(
  heading: string,
  bodyLines: readonly string[],
  format: AnnotationVocabulary,
): string {
  const kept = bodyLines.filter((line) => !isAnnotationComment(line, format));
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
  errors: SpecGuardError[];
  /** Criteria the adapter marked excluded: counted, never checked. */
  excludedCount: number;
}

/**
 * Turns parsed documents into criteria.
 *
 * A criterion the adapter marked `excluded` is parsed and counted, but never
 * becomes a criterion: we do not ask for a test covering what is being
 * removed. Which criteria those are is the format's decision, not ours.
 */
export function buildCriteria(
  documents: readonly ParsedDocument[],
  format: AnnotationVocabulary,
): BuildCriteriaResult {
  const draft: Omit<Criterion, 'id'>[] = [];
  const rawIds: string[] = [];
  const errors: SpecGuardError[] = [];
  let excludedCount = 0;

  for (const document of documents) {
    for (const parsed of document.criteria) {
      if (parsed.excluded) {
        excludedCount += 1;
        continue;
      }

      const annotations = parseAnnotations(parsed.annotationLines, format);
      for (const error of annotations.errors) {
        errors.push(
          new SpecGuardError(error.code, error.message, {
            file: parsed.file,
            line: error.line,
          }),
        );
      }

      rawIds.push(
        criterionId(
          parsed.file,
          parsed.requirement,
          normalizeScenarioText(parsed.heading, parsed.bodyLines, format),
        ),
      );
      draft.push({
        capability: parsed.capability,
        requirement: parsed.requirement,
        scenario: parsed.scenario,
        file: parsed.file,
        line: parsed.line,
        isNamedScenario: parsed.isNamedScenario,
        claimedDone: parsed.claimedDone,
        meta: parsed.meta,
        annotation: annotations.annotation,
      });
    }
  }

  const ids = disambiguateIds(rawIds);
  const criteria = draft.map((entry, index) => ({ id: ids[index] as string, ...entry }));

  return { criteria, errors, excludedCount };
}
