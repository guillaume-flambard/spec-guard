# aidd-guard

## Target

Report, deterministically, which AIDD acceptance criteria are covered by a test.

## Hard constraints

- No model is ever called, and no test is ever executed.
- One runtime dependency, `typescript`, used only to read test titles.
- Two identical runs produce identical bytes.

## Non-goals

- Judging whether a test is any good.
- Reading a format other than AIDD task documents.
- Writing anything into a task document without being asked.

## Done-when

- A bullet under the Done-when heading of a spec is read as one criterion.
  <!-- aidd-guard:test="reads the bullets under the Done-when heading" -->
- A bullet written outside that section is not a criterion.
  <!-- aidd-guard:test="ignores bullets outside the Done-when section" -->
- An acceptance checkbox is read as a criterion, and its ticked state is carried.
  <!-- aidd-guard:test="reads a checkbox anywhere in the document, with its state" -->
- The bulleted body of a template's instruction comment never becomes a criterion.
  <!-- aidd-guard:test="ignores the bulleted body of a multi-line HTML comment" -->
- A bullet inside a fenced block never becomes a criterion.
  <!-- aidd-guard:test="ignores bullets and boxes inside a fenced block" -->
- A criterion that wrapped onto the next line is read whole.
  <!-- aidd-guard:test="joins a criterion that wrapped onto the next line" -->
- An unfilled template placeholder is reported, never counted.
  <!-- aidd-guard:test="drops an unfilled template placeholder and says so" -->
- Ticking a box leaves the criterion's identifier unchanged.
  <!-- aidd-guard:test="does not change when the box is ticked" -->
- Writing the first selector leaves every identifier unchanged.
  <!-- aidd-guard:test="does not change when a selector is added" -->
- A criterion linked by an explicit selector passes, and says it was the selector.
  <!-- aidd-guard:test="passes a criterion linked by a leaf selector" -->
- A selector naming a title that occurs twice is refused rather than guessed.
  <!-- aidd-guard:test="refuses two directives of the same kind" -->
- A criterion whose only matching test is skipped never counts as covered.
  <!-- aidd-guard:test="a repository that uses selectors > never reads a skipped test as coverage" -->
- A ticked box with no test behind it is counted apart from every other gap.
  <!-- aidd-guard:test="the summary > counts a ticked box with no test behind it" -->
- A ticked box declared non-testable with a reason is not an unproven claim.
  <!-- aidd-guard:test="does not call a reasoned non-testable claim unproven" -->
- The gate fails a build when a ticked box proves nothing.
  <!-- aidd-guard:test="fails a ticked box with no test under --fail-claimed" -->
- A task root holding no document is an error, never a silent success.
  <!-- aidd-guard:test="refuses a task root holding no document, which would report a false success" -->
- Two runs on the same input produce the same bytes.
  <!-- aidd-guard:test="produces identical bytes for two identical runs" -->
- No absolute path ever reaches the report.
  <!-- aidd-guard:test="holds no absolute path" -->
- A mistyped option is refused, never ignored.
  <!-- aidd-guard:test="refuses an unknown option instead of ignoring it" -->
- A violated gate exits 1, and a bad input exits 2.
  <!-- aidd-guard:test="exits 1, not 2, when only a gate was violated" -->
- A criterion that already carries an annotation is never walked again, and never
  overwritten.
  <!-- aidd-guard:test="never touches a criterion that already carries an annotation" -->
- The selector written by `link` lands under the criterion, and `check` then reads it.
  <!-- aidd-guard:test="writes the selector, and check then passes that criterion" -->
- An annotation is written after the last line of a criterion that wrapped.
  <!-- aidd-guard:test="writes after the last line of a criterion that wrapped" -->
- A `link` session driven by a pipe decides exactly what a typed one would.
  <!-- aidd-guard:test="answers every proposal from the script, in order" -->
- Input that runs out ends the session and keeps what was decided, rather than failing.
  <!-- aidd-guard:test="quits when the input runs out, rather than throwing" -->
- Nothing is written under `--dry-run`.
  <!-- aidd-guard:test="writes nothing under --dry-run" -->
- The command works when a package manager runs it through a symlink, not only
  when it is run by path.
  <!-- aidd-guard:test="prints its report rather than exiting silently" -->
- The published package installs and runs on a machine that has never seen it.
  <!-- aidd-guard:non-testable reason="Proven by a release, not by a unit test: the published tarball is checked by hand on a clean machine." -->

## Stakeholders

- Decider: Guillaume Flambard
- Consumer: any repository that writes AIDD task documents
