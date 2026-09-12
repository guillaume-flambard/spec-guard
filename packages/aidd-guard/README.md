# aidd-guard

Answers one question about a repository, deterministically: **which AIDD
acceptance criteria are covered by a test?**

It reads your task documents and the titles of your Vitest or Jest tests. It
never runs the tests, never imports your code, and never calls a model. The same
input always produces the same bytes.

```sh
npx github:guillaume-flambard/aidd-guard check
```

```
aidd-guard 0.1.0 · aidd_docs/tasks · 2 documents · 3 test titles (vitest)

1 ticked criterion has no test behind it.

  - The export streams rows instead of buffering them. [ticked]
      aidd_docs/tasks/2026_09/2026_09_11_export/plan.md:26 · the only matching test is skipped
      → export > streams rows instead of buffering them for a large account (0.7143)
  ? The export refuses a request that carries no session.
      aidd_docs/tasks/2026_09/2026_09_11_export/plan.md:27 · weak similarity, confirm or link it
      → export > refuses an anonymous visitor (0.2857)
  ? A large account streams rows instead of buffering them, so a thirty tho…
      aidd_docs/tasks/2026_09/2026_09_11_export/spec.md:21 · weak similarity, confirm or link it
      → export > streams rows instead of buffering them for a large account (0.4615)
  - Nothing here shares any word with a test title whatsoever.
      aidd_docs/tasks/2026_09/2026_09_11_export/spec.md:25 · no test shares a significant word

7 criteria: 2 pass (2 by selector, 0 by similarity), 2 uncertain, 2 fail, 1 skip · 33.3% linked
1 ticked, of which 1 unproven by any test.
```

That is the tool's own fixture repository, printed verbatim: two criteria linked
by a selector, one ticked box whose only matching test is `it.skip`.

## What it reads

Two carriers, and only two:

- a bullet under the `## Done-when` heading of a `spec.md`;
- a `- [ ]` or `- [x]` acceptance checkbox in a plan or phase document.

`## Hard constraints` is deliberately left out: a constraint bounds the solution,
it is not an outcome a test can be seen producing.

## The number this tool exists to print

A ticked box is a claim that something is done. AIDD's own autonomous loop
carries the rule _"never set `status: implemented` until the success condition
genuinely passes"_. That is an instruction, addressed to a model, verified by
nobody.

`aidd-guard` counts the ticked boxes with no test behind them. That count is a
fact about the repository, not an opinion about the model, and you can fail a
build on it:

```sh
aidd-guard check --fail-claimed
```

## Link a criterion to a test

The primary mechanism is an explicit selector, written as an HTML comment
directly under the criterion:

```md
- [ ] The export produces a JSON file the user can download.

<!-- aidd-guard:test="writes the export as JSON" -->
```

The selector is compared, exactly, against the test's leaf title and against its
full name. Use the full name when a title occurs more than once:

```md
  <!-- aidd-guard:test="export > refuses an anonymous visitor" -->
```

For a criterion no automated test can cover, say so and say why:

```md
- [ ] The legal retention notice is reviewed before each release.

<!-- aidd-guard:non-testable reason="Requires a human legal assessment" -->
```

The two directives are mutually exclusive, and `non-testable` requires a
non-empty reason. That reason is what keeps a skipped criterion auditable.

> These annotations are an **aidd-guard convention, not AIDD syntax**. They are
> HTML comments on purpose: a task document is read by the framework's own
> skills and scored by `spec-validator.yml`, which count headings and bullets, so
> a `#### aidd-guard metadata` block would silently become a bogus section. A
> comment cannot.

## Paying down what is not linked

`check` says what has no test. `link` is how that gets paid down: it walks the
unlinked criteria, shows the candidate tests the matcher already computed, and
writes the one you pick back into the document.

```sh
aidd-guard link --limit 20        # twenty at a time
aidd-guard link --claimed         # the ticked boxes first: contradictions before gaps
aidd-guard link --dry-run         # decide everything, write nothing
```

```
[1/4] The export streams rows instead of buffering them.  [ticked]
        aidd_docs/tasks/2026_09/2026_09_11_export/plan.md:26  Acceptance criteria

  1) export > streams rows instead of buffering them for a large account
     src/export.test.ts:6  score 0.71  shared: export, streams, rows, instead, buffering  [test is skipped]
  2) export > writes the export as JSON
     src/export.test.ts:4  score 0.14  shared: export

  1-9 link to that test     /word search the test titles
  t <title> link to a title you type
  n <reason> not testable   s skip   q quit and write what is done
```

Criteria are walked best-candidate-first, so the most productive twenty minutes
come first. `/word` searches every test title, which is what makes the command
usable when documents and tests are written in different languages and
similarity proposes nothing. A criterion that already carries an annotation is
never walked and never overwritten. Quitting halfway writes what was decided and
leaves the rest untouched.

Answers can come from a pipe as well as a keyboard, so a session can be scripted.

## What similarity can and cannot do

With no selector, aidd-guard falls back to a Jaccard score over significant
words. Be clear about what that is: **it compares words, it does not translate
them.** French and English stopwords are merged so both languages are _cleaned_
the same way, but `changer` never becomes `change`. A criterion written in one
language and a test title written in another share tokens only by accident, and
a two-word accident is exactly the false positive a compliance tool must not
produce.

So the explicit selector is the mechanism, and similarity is a convenience for
repositories whose documents and tests are written in the same language. On a
bilingual repository, run with `--require-selector` and get an honest report
instead of a wall of near-zero scores.

The report always separates the asserted from the guessed. This repository,
checked against its own spec:

```
21 criteria: 20 pass (20 by selector, 0 by similarity), 0 uncertain, 0 fail, 1 skip · 100% linked
```

Measured on the AIDD framework repository itself, with no annotations at all:
3 of 97 criteria link by similarity alone, and **not one** of the 315 criteria in
its full corpus fails for lack of a candidate. Every criterion shares
vocabulary with some test, which is what makes writing a selector a one-line
edit. Numbers, commands and caveats in [docs/measurements.md](docs/measurements.md).

## Use it as a gate

```sh
aidd-guard check --fail-on fail,uncertain     # nothing unlinked, nothing guessed
aidd-guard check --fail-claimed               # no ticked box without a test
aidd-guard check --min-coverage 80            # at least 80% of criteria linked
aidd-guard check --require-selector           # similarity is not evidence here
```

Exit codes are distinct on purpose:

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 0    | every gate you asked for held                |
| 1    | a gate was violated, and nothing else        |
| 2    | your input, option or annotation is at fault |
| 3    | aidd-guard's own bug                         |

A 2 and a 3 are never the same thing: collapsing them turns every regression of
this tool into a hunt through an innocent task document.

## Options

```
--tasks <path>          Task documents root (default: aidd_docs/tasks, then docs/tasks)
--docs <glob>           Documents to read, repeatable
                        (default: **/spec.md, **/plan.md, **/phase-*.md)
--code <path>           Where the tests live (default: the working directory)
--tests <glob>          Test files, repeatable (default: **/*.{test,spec}.*)
--runner vitest|jest    Skip runner detection
--require-selector      A criterion with no explicit selector fails
--fail-on <verdicts>    Comma-separated: fail,uncertain,skip,pass
--min-pass <n>          Fail under n linked criteria
--min-coverage <pct>    Fail under pct% of checkable criteria linked
--fail-claimed          Fail when a ticked box has no test behind it
--allow-empty           Do not fail when no task document is found
--format terminal|json  Output shape (default: terminal)
--verbose               List every criterion, not only what needs an action
--no-color              Never emit ANSI colour
```

`link` takes the same discovery options, plus `--limit`, `--claimed`,
`--order confidence|document`, `--max-candidates`, `--min-score` and `--dry-run`.

`--format json` is a contract: no timestamp, no absolute path, results sorted by
file then line, absent values `null` rather than omitted. Two runs on the same
input produce identical bytes, so a report can be diffed between commits.

## What it does not do

It does not judge whether a test is any good, does not run anything, does not
write into your documents, and does not know whether the criterion it matched is
the criterion the test meant. It reports what is linked and what is not. Every
pass earned by similarity is labelled as such precisely because it is a guess.

## Relationship to AIDD

This is a community tool. It is **not** an official
[AI-Driven Dev](https://github.com/ai-driven-dev) project and is not affiliated
with it; it reads the format that project defines. If the AIDD maintainers ever
want it under their own org, it is theirs for the asking.

`aidd` on npm is an unrelated framework by
[paralleldrive](https://github.com/paralleldrive/aidd). The AIDD framework this
tool reads publishes as [`@ai-driven-dev/cli`](https://www.npmjs.com/package/@ai-driven-dev/cli).

## Install

Straight from the repository, which needs nothing published anywhere:

```sh
npx github:guillaume-flambard/aidd-guard check
```

The npm package is `@zoanlogia/aidd-guard`, and the binary it installs is
`aidd-guard`:

```sh
npm i -D @zoanlogia/aidd-guard      # pnpm add -D @zoanlogia/aidd-guard
```

How releases work, and why this repository stores no npm token:
[docs/publishing.md](docs/publishing.md).

Node 20.11 or later. One runtime dependency, `typescript`, used only to read
test titles from the syntax tree, because a regular expression breaks on the
apostrophes that real test titles contain.

## License

MIT © Guillaume Flambard
