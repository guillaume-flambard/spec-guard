# OpenSpec Guard

Answers one question about a repository, deterministically: **which OpenSpec
scenarios are covered by a test?**

It reads your specs and the titles of your Vitest or Jest tests. It never runs
the tests, never imports your code, and never calls an LLM. The same input
always produces the same bytes.

```bash
npx openspec-guard check
```

## Link a scenario to a test

The primary mechanism is an explicit selector. Put it directly under the
scenario heading, as an HTML comment:

```md
#### Scenario: Sign up with a valid email

<!-- openspec-guard:test="creates a user with a valid email" -->

- **WHEN** a visitor submits a valid email
- **THEN** the system creates the user
```

The selector is compared, exactly, against the test's leaf title and against
its full name. Use the full name when a title occurs more than once:

```md
<!-- openspec-guard:test="signup > empty field" -->
```

For a scenario that no automated test can cover, say so and say why:

```md
#### Scenario: Manual compliance sign-off

<!-- openspec-guard:non-testable reason="Requires a human legal assessment" -->
```

The two directives are mutually exclusive, and `non-testable` requires a
non-empty reason. That reason is what keeps a skipped criterion auditable.

> These annotations are a **OpenSpec Guard convention, not OpenSpec syntax**. They
> are HTML comments on purpose: the official OpenSpec parser treats every `####`
> heading as a scenario, so a `#### OpenSpec Guard metadata` block would silently
> become a bogus scenario. A comment cannot.

## What similarity can and cannot do

When a scenario has no selector, OpenSpec Guard falls back to a Jaccard score over
significant words. Be clear about what that is:

**It compares words. It does not translate them.** French and English stopwords
are merged so both languages are _cleaned_ the same way, but `changer` never
becomes `change`, and `langue` never becomes `language`. A scenario written in
one language and a test title written in another share tokens only by lexical
accident, and a two-word accident is exactly the false positive a compliance
tool must not produce.

So: **the explicit selector is the mechanism, similarity is a convenience** for
repositories whose specs and tests are written in the same language. On a
bilingual repository, run with `--require-selector` and get an honest report
instead of a wall of near-zero scores.

Where the languages do match, similarity earns its place. Measured on five
public repositories, 8,860 criteria in total: 2 to 10 percent of criteria pass
outright, the median passing match shares four to five significant words, and
none of those passes looked wrong on inspection. Most of the rest lands in
`uncertain`, which is less a shrug than a work queue: about half of that band is
the right test, one keypress away in `openspec-guard link`. Numbers in
[docs/measurements.md](docs/measurements.md).

The report always separates the asserted from the guessed:

```
84 criteria: 12 pass (11 by selector, 1 by similarity), 3 uncertain, 68 fail, 1 skip
```

## Verdicts and reasons

Four verdicts, and a reason that says what to do about it.

| Verdict     | Reason                 | What it means                                       |
| ----------- | ---------------------- | --------------------------------------------------- |
| `pass`      | `selector`             | Linked by an explicit selector                      |
| `pass`      | `heuristic`            | Linked by similarity above the threshold            |
| `uncertain` | `heuristic-weak`       | A candidate exists, the score is in the middle band |
| `fail`      | `selector-unmatched`   | The selector points at a title that does not exist  |
| `fail`      | `selector-ambiguous`   | The selector matches several tests                  |
| `fail`      | `matched-test-skipped` | The matched test is skipped                         |
| `fail`      | `low-similarity`       | A candidate was seen, and is too weak to claim      |
| `fail`      | `no-candidate`         | No significant word shared with any test title      |
| `fail`      | `missing-selector`     | `--require-selector` and no selector here           |
| `skip`      | `non-testable`         | Declared not testable, with a reason                |

A skipped test never counts as coverage. `it.skip` is exactly the state
OpenSpec Guard exists to reveal, so it produces `fail`, never `skip`.

## Paying the debt down: `link`

A baseline freezes what is uncovered. `link` is how it gets uncovered no more.
It walks every scenario with no directive, shows what it has, and writes your
answer into the spec:

```bash
openspec-guard link
```

```
[3/57] account/settings  Rejects a pen name that is too short

  1) pen name > rejects a pen name shorter than two characters
     lib/names.test.ts:13  score 0.71  shared: rejects, name, shorter

  1-9 link to that test     /word search the test titles
  t <title> link to a title you type
  n <reason> not testable   s skip   q quit and write what is done
```

Press `1` and the annotation is written under the heading, with the shortest
selector that still names exactly one test: the leaf title when it is unique,
the full `describe > it` path when it is not.

The walk is ordered by what it has to offer, best candidate first, so a
`--limit 20` session is spent on the twenty scenarios with something to accept
rather than on whatever sits at the top of the first file. `--order document`
walks them as they appear, for working through one file at a time.

**`/word` is the important key.** On a repository whose specs and tests are
written in different languages, similarity proposes nothing at all, so scoring
cannot help you. Searching can: type a word you know is in the test title and
pick from what comes back. Accents and case are ignored, so `/reglage` finds
`Réglages` and `/ANONYMOUS` finds `anonymous`.

`q` stops the walk and still writes everything decided so far. `--dry-run`
decides everything and writes nothing. `--limit n` does a handful at a time,
which is how this actually gets done: twenty minutes, once a week.

The command never touches a scenario that already carries a directive, and
running it twice in a row has nothing left to consider.

It needs a terminal, since it asks a question per scenario. In CI, use
`check --update-baseline` instead.

## Adopting on an existing repository

A repository that has been writing specs for a while will start with hundreds
of uncovered scenarios. Fixing them all before turning the gate on means the
gate never gets turned on, so freeze them instead:

```bash
openspec-guard check --update-baseline
git add .openspec-guard-baseline.json
```

Then gate on what is new:

```bash
openspec-guard check --baseline .openspec-guard-baseline.json --fail-on fail
```

Today's debt is recorded and ignored by the gate. A scenario added tomorrow
without a test fails the build.

The baseline is a committed JSON file, sorted, with no timestamp, so it diffs
cleanly in a pull request and a reviewer can see exactly what was frozen.

Three things it deliberately does **not** let you get away with:

- **A new scenario is never frozen.** Only what existed at freeze time is.
- **A different kind of failure stops being suppressed.** If a criterion was
  frozen as `no-candidate` and now reads `selector-unmatched`, someone wrote a
  selector pointing at a test that does not exist. That is a fresh mistake, not
  old debt, and the gate fires.
- **Rewriting a scenario un-freezes it.** Criterion ids hash the scenario text,
  so an edited scenario gets a new id, its entry stops matching, and you are
  asked about its test again. Which is the right moment to ask.

Entries that no longer match anything, because the scenario was fixed,
rewritten or deleted, are reported so the file can be pruned with
`--update-baseline` instead of growing forever.

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `0`  | Success                                                   |
| `1`  | A gate was violated, and nothing else                     |
| `2`  | The input or an option is at fault                        |
| `3`  | An internal error: a OpenSpec Guard bug, please report it |

`2` and `3` are kept apart on purpose. A `2` is your input; a `3` is our bug.
Collapsing them turns every regression of this tool into a hunt for an innocent
spec file.

By default a run exits `0` even with failures: it reports, it does not judge.
Gates are opt-in.

```bash
openspec-guard check --fail-on fail,uncertain
openspec-guard check --min-pass 40
openspec-guard check --min-coverage 80
```

Every gate applies, and every violation is reported.

`--min-coverage` is the percentage of criteria linked to a test. Scenarios
declared non-testable leave the denominator, because a decision that was made
and reasoned is not a gap.

It differs from the other two on purpose: `--fail-on` and `--min-pass` read what
a baseline does not hold back, because they are about what is new, while
`--min-coverage` reads the whole repository. **Freezing debt must never make the
number go up**, or the baseline becomes a way to report something that is not
true. So one gate stops the bleeding and the other tracks the healing, and they
are meant to be used together:

```bash
openspec-guard check --baseline .openspec-guard-baseline.json \
  --fail-on fail --min-coverage 40
```

## In CI

As a step, with no install:

```yaml
- uses: guillaume-flambard/openspec-guard@v0
  with:
    fail-on: fail
    baseline: .openspec-guard-baseline.json
```

Uncovered scenarios come back as annotations on the spec files themselves, in
the diff, where a reviewer already is. The step also writes a table to the job
summary and exposes `total`, `pass`, `uncertain`, `fail`, `skip`, `baselined`
and `gate-passed` as outputs.

GitHub displays at most ten annotations per level per step, so `max-annotations`
defaults to 20 and the rest are counted in the summary rather than lost.

Or as a plain command, if you would rather not add an action:

```yaml
- run: npx openspec-guard check --fail-on fail
```

Start without a gate, read the report, freeze the debt, then turn the gate on.
Turning it on first only teaches the team to pass `--allow-empty`.

## Adopting on an existing repository

A repository that has been writing specs for a while will start with hundreds
of uncovered scenarios. Fixing them all before turning the gate on means the
gate never gets turned on, so freeze them instead:

```bash
openspec-guard check --update-baseline
git add .openspec-guard-baseline.json
```

Then gate on what is new:

```bash
openspec-guard check --baseline .openspec-guard-baseline.json --fail-on fail
```

Today's debt is recorded and ignored by the gate. A scenario added tomorrow
without a test fails the build.

The baseline is a committed JSON file, sorted, with no timestamp, so it diffs
cleanly in a pull request and a reviewer can see exactly what was frozen.

Three things it deliberately does **not** let you get away with:

- **A new scenario is never frozen.** Only what existed at freeze time is.
- **A different kind of failure stops being suppressed.** If a criterion was
  frozen as `no-candidate` and now reads `selector-unmatched`, someone wrote a
  selector pointing at a test that does not exist. That is a fresh mistake, not
  old debt, and the gate fires.
- **Rewriting a scenario un-freezes it.** Criterion ids hash the scenario text,
  so an edited scenario gets a new id, its entry stops matching, and you are
  asked about its test again. Which is the right moment to ask.

Entries that no longer match anything, because the scenario was fixed,
rewritten or deleted, are reported so the file can be pruned with
`--update-baseline` instead of growing forever.

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `0`  | Success                                                   |
| `1`  | A gate was violated, and nothing else                     |
| `2`  | The input or an option is at fault                        |
| `3`  | An internal error: a OpenSpec Guard bug, please report it |

`2` and `3` are kept apart on purpose. A `2` is your input; a `3` is our bug.
Collapsing them turns every regression of this tool into a hunt for an innocent
spec file.

By default a run exits `0` even with failures: it reports, it does not judge.
Gates are opt-in.

```bash
openspec-guard check --fail-on fail,uncertain
openspec-guard check --min-pass 40
```

Both gates apply together, and both violations are reported when both break.

## In CI

```yaml
- name: Spec coverage
  run: npx openspec-guard check --fail-on fail,uncertain
```

Start without a gate, read the report, add selectors, then turn the gate on.
Turning it on first only teaches the team to pass `--allow-empty`.

## Options

```
openspec-guard check [options]     report coverage, optionally gate on it
openspec-guard link  [options]     walk unlinked scenarios and write selectors

Discovery
  --cwd <dir>              Working directory (default: the current one)
  --specs <dir>            Spec root (default: openspec/specs, else specs)
  --code <dir>             Code root (default: --cwd)
  --tests <glob>           Test file glob, repeatable
  --runner vitest|jest     Skip runner detection
  --include-changes        Also read delta specs under openspec/changes
  --allow-empty            Succeed on a spec root that holds no spec.md

Matching
  --require-selector       Turn similarity off; only explicit selectors link
  --pass-threshold <n>     Similarity needed to pass (default: 0.6)
  --uncertain-threshold <n>  Similarity needed to be uncertain (default: 0.25)
  --min-shared-terms <n>   Shared words needed to pass (default: 2)

Output
  --format terminal|json   Report format (default: terminal)
  --verbose                Print every row, including passes and skips
  --no-color               Never emit ANSI colour
  --max-rows <n>           Rows per group before truncation (default: 20)

link
  --limit <n>              Stop after n scenarios
  --max-candidates <n>     Candidates offered per scenario (default: 5)
  --min-score <n>          Hide candidates below this similarity (default: 0)
  --dry-run                Decide everything, write nothing
  --order confidence|document  Walk best-ranked first (default), or in order

Baseline
  --baseline <file>        Freeze the criteria listed there: gates ignore them
  --update-baseline        Rewrite the baseline from this run, then exit 0

Gates
  --fail-on <list>         Verdicts that must not appear
  --min-pass <n>           Minimum number of passing criteria
  --min-coverage <n>       Minimum percentage of criteria linked to a test
```

`--tests` matters in a repository where `*.spec.ts` also means Playwright: a
default run collects those titles too, and they pollute the index.

## The JSON report

`--format json` writes the document to stdout and nothing else; every
human-facing line goes to stderr. So this is exactly the document:

```bash
openspec-guard check --format json > coverage.json
```

Its guarantees are part of the contract, not an implementation detail:

- no timestamp, no duration, no absolute path, no machine name, anywhere;
- every path relative to the working directory, POSIX separators;
- `results` sorted by file, then line, then id;
- arrays always present, absent scalars always `null` and never omitted, so a
  diff between two reports stays readable;
- scores rounded to four decimals.

Two runs on the same input produce identical bytes. That is what makes the
report diffable in CI.

Each criterion carries a stable id, `sg_` plus 16 hex characters, derived from
the file path, the requirement name, and the normalized scenario text. Adding
or removing an annotation does not move it. Editing the scenario body does:
that is the correct signal for "the spec changed", and it means ids are not
permanent identifiers. Do not build a suppression file on them yet.

## It checks itself

This repository's own behaviour is specified in OpenSpec, under `openspec/specs`,
and every scenario is linked to the test that covers it. The build runs:

```bash
pnpm spec:check
```

```
206 criteria: 205 pass (205 by selector, 0 by similarity), 0 uncertain, 0 fail, 1 skip
100% of 205 checkable criteria are linked to a test
```

Twelve capabilities, 206 scenarios, one of them declared non-testable with its
reason: how many annotations GitHub renders per step is GitHub's decision, and
nothing here can observe it. A scenario added to those specs without a test
fails the build.

Two things worth noticing in that line. Every pass is earned by an explicit
selector and none by similarity, on a repository whose specs and tests were
written together, in the same language, by the same person, in the same sitting.
And the run reports one test title it could not read statically, a title built
in a loop in `src/verdict.test.ts`, which is the documented limitation showing up
in the tool's own house rather than in somebody else's.

## What it does not do

Not in this version: `node:test`, spec formats other than OpenSpec, a baseline
file, per-package scoping in a monorepo, `.gitignore` awareness, stemming or
translation, expanding `.each` tables, watch mode, SARIF, and any reading of a
test **body**.

OpenSpec Guard matches titles. It never reads an assertion, so it cannot tell you
whether a test is any good, only whether one exists.

## Programmatic use

```ts
import { runCheck, renderJson } from 'openspec-guard';

const { report, exitCode } = await runCheck({
  cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
  failOn: ['fail'],
});
```

`cwd` is a parameter, never read from the ambient process inside the library.

## Requirements

Node 20.11 or later.

## A note on the name

There is an unrelated package called `specguard`, one word, published on npm in
February 2026. This one is `openspec-guard`, named after the spec format it
reads and after the `openspec-*` convention the rest of that ecosystem already
uses. Different package, different binary, no overlap.

```bash
npx openspec-guard check      # no install
pnpm add -D openspec-guard    # then: pnpm openspec-guard check
```

## License

MIT. Published by Memo Labs (Guillaume Flambard).
