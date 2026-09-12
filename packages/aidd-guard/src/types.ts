/** Types shared across modules. No logic here. */

/**
 * Where a criterion was written.
 *
 * The two carriers are not interchangeable. A `done-when` line states an
 * outcome a spec promised. A `checkbox` line states a phase's acceptance
 * criterion, and it carries something a spec line cannot: someone ticked it.
 */
export type CriterionSource = 'done-when' | 'checkbox';

/**
 * An aidd-guard extension, never AIDD syntax: an HTML comment placed directly
 * under the criterion line.
 */
export type Annotation =
  | { kind: 'test'; selector: string; line: number }
  | { kind: 'non-testable'; reason: string; line: number };

/** One line of a task document, turned into a checkable criterion. */
export interface Criterion {
  /** `ag_` plus 16 hex characters. See `criteria.ts` for the derivation. */
  id: string;
  /** Task folder, relative to the tasks root: `2026_09/2026_09_04_memory-check`. */
  task: string;
  source: CriterionSource;
  /**
   * The heading that owns the line: `Done-when` for a spec, the phase title
   * for a plan. Empty when the line sits under no heading.
   */
  section: string;
  /** The criterion itself, continuation lines joined, marker removed. */
  text: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** 1-based line of the criterion's first line. */
  line: number;
  /** 1-based line of its last line, equal to `line` unless the criterion wrapped. */
  endLine: number;
  /** Columns of indentation before the bullet marker. */
  indent: number;
  /**
   * `true` when the box was ticked, `false` when it was not, `null` for a
   * `done-when` line, which has no box.
   *
   * A ticked box is a claim that the work is done. A claim with no test behind
   * it is the single most interesting thing this tool can report, so it is
   * carried all the way to the report rather than folded into the verdict.
   */
  claimed: boolean | null;
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
