# Measurements

Every number here was produced by running the tool, not estimated. The command
and the commit are given so anyone can reproduce them.

## The corpus

[`ai-driven-dev/framework`](https://github.com/ai-driven-dev/framework), the AIDD
marketplace itself, at commit `f6c61cfb82d351af43413ff5fe30dcbf85b2e7ff`
(2026-09-09). It is the largest public repository that writes AIDD task
documents, and it is written by the people who designed the format.

```sh
git clone --depth 1 https://github.com/ai-driven-dev/framework
cd framework
npx aidd-guard check --format json > report.json
```

No annotation was added to that repository. Nobody there has ever seen this
tool, so every link below was earned by word overlap alone, which is the
weakest way this tool can work.

## Default scope: spec, plan and phase documents

|                          |                                      |
| ------------------------ | ------------------------------------ |
| Documents read           | 122                                  |
| Criteria                 | **97** (74 Done-when, 23 checkboxes) |
| Test files / test titles | 506 / 5,665                          |
| pass                     | 3 (0 by selector, 3 by similarity)   |
| uncertain                | 49                                   |
| fail                     | 45                                   |
| Criteria linked          | 3.1%                                 |

## Every markdown document under `aidd_docs/tasks`

`--docs "**/*.md"` also reads `review.md`, where the repository keeps its review
checklists.

|                                       |                                        |
| ------------------------------------- | -------------------------------------- |
| Documents read                        | 164                                    |
| Criteria                              | **315** (74 Done-when, 241 checkboxes) |
| Ticked boxes                          | **202**                                |
| Ticked boxes with no test behind them | **200**                                |
| pass                                  | 5                                      |
| uncertain                             | 91                                     |
| fail                                  | 219                                    |

## What these numbers say, and what they do not

**Zero criteria out of 315 fail for lack of a candidate.** Every single one
shares at least one significant word with some test title in the repository;
what they lack is enough overlap to assert a match. That is the good case for
this tool: the vocabulary of the criteria and the vocabulary of the tests are
the same vocabulary, so a selector is a one-line edit, not a rewrite.

**The 200 unproven claims are review checkboxes, not product claims.** They live
in `review.md`, where a box means "I read this", not "this behaviour is
guaranteed". That is exactly why the default scope leaves them out, and the
number is printed here rather than in the headline. Read it as a measure of how
much ticking happens in an AIDD repository, not as an accusation.

**The plan template's acceptance criteria are not used.** The template ships a
`#### Acceptance criteria` section; the repository contains **zero** such
headings, and its `plan.md` files carry prose sections (`## Guards`, `## Proof`)
instead. The checkbox reader finds 23 criteria in the whole default scope, all
of them in two `spec.md` files. Whatever this tool reports about plans today, it
reports about a section people are not writing.

**3.1% is not a verdict on that repository.** It is the number any repository
gets on its first run, before a single selector is written. The comparable
number after linking is the one this repository produces about itself:

```
21 criteria: 20 pass (20 by selector, 0 by similarity), 0 uncertain, 0 fail, 1 skip · 100% linked
```

That took about twenty minutes of writing selectors, on a repository whose specs
and tests were written the same week.

## Reproducing

```sh
pnpm build
node dist/cli.js check --tasks docs/tasks \
  --tests "src/**/*.test.ts" --tests "tests/*.test.ts" \
  --runner vitest --fail-on fail,uncertain
```
