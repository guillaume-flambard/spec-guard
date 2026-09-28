import type { AnnotationLine, ParseWarning } from './types.js';

/**
 * The seam between the engine and the spec format it reads.
 *
 * Everything below the CLI used to know that a spec was OpenSpec markdown: the
 * annotation prefix, the directory layout, the file name, the baseline name,
 * the binary's name in its own remediation text. A second format could not run
 * on that engine without editing it.
 *
 * A format now says all of it on one object. Adding a format means writing one
 * of these; nothing in the core changes.
 */

/**
 * One checkable statement, as an adapter reports it. Flat on purpose: how a
 * format nests its criteria is the adapter's business, not the core's.
 */
export interface ParsedCriterion {
  /** Path segments between the spec root and the file's directory. */
  capability: string;
  /** The enclosing requirement, story or section. */
  requirement: string;
  /**
   * Display name of the criterion, format vocabulary removed: the adapter
   * strips its own `Scenario:` marker here so the report never shows it.
   */
  scenario: string;
  /**
   * The heading line exactly as it stands in the file, marker included
   * (`#### Scenario: Sign up`). This is what gets hashed, and it is the
   * adapter's job to build it: the core must not know what a heading marker
   * looks like in this format.
   */
  heading: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** 1-based line of the heading. */
  line: number;
  /** False when the heading did not carry the format's expected prefix. */
  isNamedScenario: boolean;
  bodyLines: string[];
  annotationLines: AnnotationLine[];
  /**
   * Whether the format lets an author mark this as done, and whether they did.
   * `null` means the format has no such notion, which is what makes
   * `--fail-claimed` refuse rather than pass vacuously.
   */
  claimedDone: boolean | null;
  /** Parsed and counted, never checked. OpenSpec REMOVED deltas set this. */
  excluded: boolean;
  /** Opaque to the core. Surfaced in the report under the format's key. */
  meta: Readonly<Record<string, string>>;
}

export interface ParsedDocument {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  criteria: ParsedCriterion[];
  warnings: ParseWarning[];
}

export interface ParseInput {
  source: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  capability: string;
}

export interface AnnotationTarget {
  /**
   * The working directory the file path is relative to.
   *
   * Passed in rather than read: no module below the CLI calls
   * `process.cwd()`, which is what lets the GitHub Action hand over
   * `GITHUB_WORKSPACE` and change nothing else.
   */
  cwd: string;
  /** Path relative to `cwd`, POSIX separators. */
  file: string;
  /** 1-based line of the criterion heading. */
  line: number;
}

/**
 * What a spec format owes the core. Adding a format means writing one of
 * these and passing the conformance suite. Nothing in the core changes.
 */
export interface SpecFormat {
  /** Open on purpose: a fourth format must not require editing the core. */
  readonly id: string;
  /** Human-facing name, for report headers. */
  readonly name: string;

  /** The binary's name, for the baseline stamp and the remediation text. */
  readonly toolName: string;

  /**
   * The prefix this binary WRITES. One value, because the annotation parser
   * and the id normalizer both read it: two copies that drift apart would
   * change every criterion hash and silently invalidate every baseline.
   */
  readonly annotationPrefix: string;
  /** Every prefix this binary ACCEPTS on read, its own included. */
  readonly acceptedPrefixes: readonly string[];

  /** Spec roots tried in order when `--specs` is absent. */
  readonly defaultSpecRoots: readonly string[];
  /** The spec file's name, for example `spec.md`. */
  readonly specFileName: string;
  /**
   * Where in-flight change deltas live in this format's default layout, or
   * null when the format has no such notion. The core reads the last segment
   * and looks for it beside whatever spec root is in use, so `--specs` keeps
   * working on a repository that moved its specs.
   */
  readonly changesRoot: string | null;

  /** Default baseline file path, relative to cwd. */
  readonly defaultBaselinePath: string;

  parse(input: ParseInput): ParsedDocument;
  /**
   * Writes one annotation into a spec file, under the heading at
   * `target.line`.
   *
   * One criterion at a time, re-reading the file each call: a caller
   * annotating several criteria in the same file must work from the bottom
   * up, or the first insertion shifts the lines still to come.
   */
  writeAnnotation(target: AnnotationTarget, selector: string): Promise<void>;
}

/**
 * The three views of a format the core actually consumes. Each module asks for
 * exactly the part of the contract it reads, and a whole `SpecFormat`
 * satisfies all of them.
 */

/** What the annotation parser and the id normalizer read. */
export type AnnotationVocabulary = Pick<SpecFormat, 'annotationPrefix' | 'acceptedPrefixes'>;

/** What the filesystem walk reads. */
export type SpecLayout = Pick<SpecFormat, 'defaultSpecRoots' | 'specFileName' | 'changesRoot'>;

/** What the baseline stamp and the remediation text read. */
export type ToolIdentity = Pick<
  SpecFormat,
  'toolName' | 'annotationPrefix' | 'defaultBaselinePath'
>;
