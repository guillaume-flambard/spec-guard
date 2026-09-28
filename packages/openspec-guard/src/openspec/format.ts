import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AnnotationTarget,
  ParsedCriterion,
  ParsedDocument,
  ParseInput,
  SpecFormat,
} from '@spec-guard/core';

import { applyEdits, testAnnotation } from '../link/edit.js';
import { parseSpec } from './parse.js';

/**
 * OpenSpec, as a format the core can run on.
 *
 * Every value here was a literal somewhere under `packages/core/src` until
 * this file existed: the annotation prefix, the directory layout, the spec
 * file name, the baseline path, this binary's name in its own remediation
 * text. They are all exactly what they were, so nothing a user sees moves.
 *
 * `acceptedPrefixes` is the one deliberate widening: a spec that spells the
 * namespace `spec-guard:` now reads too, while `annotationPrefix` keeps
 * writing `openspec-guard:` so no existing file changes.
 */

/** The OpenSpec tree, flattened into what the core consumes. */
export function parseDocument(input: ParseInput): ParsedDocument {
  const spec = parseSpec(input.source, input.file, input.capability);
  const criteria: ParsedCriterion[] = spec.requirements.flatMap((requirement) =>
    requirement.scenarios.map((scenario) => ({
      capability: spec.capability,
      requirement: requirement.name,
      scenario: scenario.name,
      // The heading line as it stands in the file, `####` included. The core
      // hashes this verbatim and never builds a marker of its own.
      heading: `#### ${scenario.heading}`,
      file: spec.file,
      line: scenario.line,
      isNamedScenario: scenario.isNamedScenario,
      bodyLines: scenario.bodyLines,
      annotationLines: scenario.annotationLines,
      // The honest answer: OpenSpec has no checkbox. `--fail-claimed` refuses
      // rather than passing vacuously.
      claimedDone: null,
      // We do not ask for a test covering what is being removed.
      excluded: requirement.operation === 'removed',
      meta: { operation: requirement.operation },
    })),
  );
  return { file: spec.file, criteria, warnings: spec.warnings };
}

/**
 * Writes one selector under one heading.
 *
 * Re-reads the file on every call, so a caller annotating several criteria in
 * the same file must work from the bottom up: the first insertion shifts every
 * line below it. `runLink` batches its edits instead, for exactly that reason.
 */
async function writeAnnotation(target: AnnotationTarget, selector: string): Promise<void> {
  const absolute = path.resolve(target.cwd, target.file);
  const source = await readFile(absolute, 'utf8');
  const updated = applyEdits(
    source,
    [{ line: target.line, annotation: testAnnotation(selector) }],
    target.file,
  );
  await writeFile(absolute, updated, 'utf8');
}

export const openspecFormat: SpecFormat = {
  id: 'openspec',
  name: 'OpenSpec',
  toolName: 'openspec-guard',
  annotationPrefix: 'openspec-guard',
  acceptedPrefixes: ['openspec-guard', 'spec-guard'],
  defaultSpecRoots: ['openspec/specs', 'specs'],
  specFileName: 'spec.md',
  changesRoot: 'openspec/changes',
  defaultBaselinePath: '.openspec-guard-baseline.json',
  parse: parseDocument,
  writeAnnotation,
};
