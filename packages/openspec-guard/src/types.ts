/** Types shared across modules. No logic here. */

/** Operation carried by the `##` section that contains the requirement. */
export type DeltaOperation = 'base' | 'added' | 'modified' | 'removed' | 'renamed';

/**
 * A SpecGuard extension, never OpenSpec syntax: an HTML comment placed
 * directly under the scenario heading.
 */
export type Annotation =
  | { kind: 'test'; selector: string; line: number }
  | { kind: 'non-testable'; reason: string; line: number };

/** A spec scenario, turned into a checkable criterion. */
export interface Criterion {
  /** `sg_` plus 16 hex characters. See `criteria.ts` for the derivation. */
  id: string;
  /** Path segments between the spec root and the directory holding `spec.md`. */
  capability: string;
  requirement: string;
  scenario: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** 1-based line of the `####` heading. */
  line: number;
  operation: DeltaOperation;
  /** `false` when the `####` heading was not prefixed with `Scenario:`. */
  isNamedScenario: boolean;
  annotation: Annotation | null;
}

/** Modifier observed on the test call (`it.skip.each`). */
export type TestModifier =
  'skip' | 'only' | 'todo' | 'each' | 'concurrent' | 'failing' | 'sequential';

export interface TestTitle {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** 1-based line of the title. */
  line: number;
  /** `['formatDistance', 'rounds under 1 km to 10 m']` */
  path: string[];
  /** `path.join(' > ')` */
  fullName: string;
  /** Last segment of the path. */
  leaf: string;
  modifiers: TestModifier[];
  /** `.each`: the title is a template (`%s`, `$name`), never expanded. */
  parameterized: boolean;
  /** Skipped directly, or inherited from a skipped suite. */
  skipped: boolean;
}

export type Verdict = 'pass' | 'uncertain' | 'fail' | 'skip';

/**
 * Why this verdict. Orthogonal to the verdict itself: three different `fail`
 * reasons call for three different user actions.
 */
export type MatchReason =
  /** Explicit selector, exactly one matching test. */
  | 'selector'
  /** Explicit selector pointing at a title that does not exist. */
  | 'selector-unmatched'
  /** Explicit selector matching more than one test. */
  | 'selector-ambiguous'
  /** Similarity at or above the pass threshold. */
  | 'heuristic'
  /** Similarity inside the uncertain band. */
  | 'heuristic-weak'
  /** A candidate exists but scores below the uncertain threshold. */
  | 'low-similarity'
  /** No significant word shared with any test title. */
  | 'no-candidate'
  /** The only matched test is skipped (`it.skip`, `xit`, `todo`). */
  | 'matched-test-skipped'
  /** `--require-selector` is on and this criterion has no selector. */
  | 'missing-selector'
  /** Marked `non-testable` with a reason. */
  | 'non-testable';

export interface Candidate {
  fullName: string;
  /** Last segment of the path, the shortest selector that could name it. */
  leaf: string;
  /** True when another test shares this leaf, so only the full name is unique. */
  leafAmbiguous: boolean;
  file: string;
  line: number;
  /** Jaccard score, rounded to 4 decimals. */
  score: number;
  matchedOn: 'leaf' | 'fullName';
  sharedTerms: string[];
  skipped: boolean;
}

export interface MatchResult {
  reason: MatchReason;
  best: Candidate | null;
  /** At most two, sorted, present only when a non-zero score exists. */
  runnersUp: Candidate[];
}
