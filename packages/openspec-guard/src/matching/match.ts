import type { Candidate, Criterion, MatchResult, TestTitle } from '../types.js';
import { jaccard, normalize, roundScore, sharedTerms, type NormalizedTitle } from './normalize.js';

/**
 * Matching a criterion to a test.
 *
 * Order of decision, and nothing else decides:
 *   1. `non-testable` wins outright.
 *   2. An explicit selector is looked up exactly, first against the full name
 *      `describe > describe > it`, then against the leaf title.
 *   3. With `--require-selector`, a criterion without a selector fails here.
 *   4. Otherwise, Jaccard similarity on the scenario NAME only.
 *
 * The scenario body (`WHEN` / `THEN`) is deliberately excluded from the score.
 * It would blow up the union, collapse every Jaccard value, and make the number
 * impossible to explain. `sharedTerms` is carried so any score can be justified
 * line by line.
 */

export const DEFAULT_PASS_THRESHOLD = 0.6;
export const DEFAULT_UNCERTAIN_THRESHOLD = 0.25;
export const DEFAULT_MIN_SHARED_TERMS = 2;

export interface MatchOptions {
  passThreshold: number;
  uncertainThreshold: number;
  minSharedTerms: number;
  /** `false` under `--require-selector`. */
  heuristic: boolean;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  passThreshold: DEFAULT_PASS_THRESHOLD,
  uncertainThreshold: DEFAULT_UNCERTAIN_THRESHOLD,
  minSharedTerms: DEFAULT_MIN_SHARED_TERMS,
  heuristic: true,
};

interface IndexedTitle {
  title: TestTitle;
  leaf: NormalizedTitle;
  full: NormalizedTitle;
}

export interface TestIndex {
  byLeaf: Map<string, TestTitle[]>;
  byFullName: Map<string, TestTitle[]>;
  candidates: IndexedTitle[];
  size: number;
}

function push(index: Map<string, TestTitle[]>, key: string, title: TestTitle): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(title);
  else index.set(key, [title]);
}

export function buildTestIndex(titles: readonly TestTitle[]): TestIndex {
  const byLeaf = new Map<string, TestTitle[]>();
  const byFullName = new Map<string, TestTitle[]>();
  const candidates: IndexedTitle[] = [];

  for (const title of titles) {
    push(byLeaf, title.leaf.trim(), title);
    push(byFullName, title.fullName.trim(), title);
    candidates.push({ title, leaf: normalize(title.leaf), full: normalize(title.fullName) });
  }

  return { byLeaf, byFullName, candidates, size: titles.length };
}

function toCandidate(
  title: TestTitle,
  score: number,
  matchedOn: 'leaf' | 'fullName',
  terms: string[],
  index: TestIndex,
): Candidate {
  return {
    fullName: title.fullName,
    leaf: title.leaf,
    leafAmbiguous: (index.byLeaf.get(title.leaf.trim())?.length ?? 0) > 1,
    file: title.file,
    line: title.line,
    score: roundScore(score),
    matchedOn,
    sharedTerms: terms,
    skipped: title.skipped,
  };
}

/** Deterministic order: best score first, then path, then line, then name. */
function compare(left: Candidate, right: Candidate): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.file !== right.file) return left.file < right.file ? -1 : 1;
  if (left.line !== right.line) return left.line - right.line;
  return left.fullName < right.fullName ? -1 : left.fullName > right.fullName ? 1 : 0;
}

function bySelector(selector: string, index: TestIndex): TestTitle[] {
  return index.byFullName.get(selector) ?? index.byLeaf.get(selector) ?? [];
}

export function matchCriterion(
  criterion: Criterion,
  index: TestIndex,
  options: MatchOptions,
): MatchResult {
  const annotation = criterion.annotation;

  if (annotation?.kind === 'non-testable') {
    return { reason: 'non-testable', best: null, runnersUp: [] };
  }

  if (annotation?.kind === 'test') {
    const matches = bySelector(annotation.selector, index);
    const candidates = matches
      .map((title) => toCandidate(title, 1, 'fullName', [], index))
      .sort(compare);

    const [best] = candidates;
    if (!best) return { reason: 'selector-unmatched', best: null, runnersUp: [] };
    if (candidates.length > 1) {
      // Not fatal: the run stays useful, the verdict fails, and the user sees
      // every duplicate so they can disambiguate with a full name.
      return { reason: 'selector-ambiguous', best, runnersUp: candidates.slice(1, 3) };
    }
    if (best.skipped) return { reason: 'matched-test-skipped', best, runnersUp: [] };
    return { reason: 'selector', best, runnersUp: [] };
  }

  if (!options.heuristic) {
    return { reason: 'missing-selector', best: null, runnersUp: [] };
  }

  const scenario = normalize(criterion.scenario);
  const scored: Candidate[] = [];

  for (const candidate of index.candidates) {
    // The describe chain carries the subject, while a long full name dilutes
    // the score. Taking the better of the two corrects both opposite biases.
    const leafScore = jaccard(scenario.set, candidate.leaf.set);
    const fullScore = jaccard(scenario.set, candidate.full.set);
    const useLeaf = leafScore >= fullScore;
    const score = useLeaf ? leafScore : fullScore;
    if (score <= 0) continue;
    const terms = sharedTerms(scenario, useLeaf ? candidate.leaf.set : candidate.full.set);
    scored.push(toCandidate(candidate.title, score, useLeaf ? 'leaf' : 'fullName', terms, index));
  }

  scored.sort(compare);
  const best = scored[0];
  const runnersUp = scored.slice(1, 3);

  if (!best) return { reason: 'no-candidate', best: null, runnersUp: [] };

  if (best.score >= options.passThreshold && best.sharedTerms.length >= options.minSharedTerms) {
    // A skipped test is exactly the state SpecGuard exists to reveal, so it
    // never counts as coverage.
    if (best.skipped) return { reason: 'matched-test-skipped', best, runnersUp };
    return { reason: 'heuristic', best, runnersUp };
  }
  if (best.score >= options.uncertainThreshold) {
    return { reason: 'heuristic-weak', best, runnersUp };
  }
  return { reason: 'low-similarity', best, runnersUp };
}
