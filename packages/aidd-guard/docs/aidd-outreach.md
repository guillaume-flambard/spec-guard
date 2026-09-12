# What to post to ai-driven-dev, and where

Their CONTRIBUTING says: _"Just a question? → Discussions"_, and an issue is
issue-first, validated by a Certified Member or Maintainer before any PR exists.

Two open questions decide the shape of this thing, and neither is mine to
answer, so **the Discussion goes first**. The issue below is what to open only
if someone there asks for one.

**Posted on 2026-09-11** in the Ideas category:
<https://github.com/ai-driven-dev/framework/discussions/855>

---

## 1. Discussion (posted)

**Category**: Ideas
**Title**: `A deterministic check for acceptance criteria that no test covers`

Hi everyone,

`09-for-sure` carries a rule I keep coming back to: _"never set
`status: implemented` until the success condition genuinely passes"_. Same spirit
in `03-assert` and `06-test`. It is the right rule. It is also an instruction
addressed to a model, and nothing outside the model checks it.

So I spent a day asking a smaller question: **which acceptance criteria in a
repository actually have a test behind them?** Not "is the test good", just "is
there one, and which".

I ran the measurement on this repository, at `f6c61cf`, because it is the
largest public corpus of AIDD task documents and it is written by the people who
designed the format. Reading every document under `aidd_docs/tasks`:

| | |
| --- | --- |
| Criteria found | 315 (74 `Done-when` bullets, 241 checkboxes) |
| Ticked boxes | 202 |
| Ticked boxes with no test title behind them | 200 |
| Criteria sharing no significant word with any test | **0** |

Three honest caveats before anyone reads that as an accusation:

1. **Most of those 200 are in `review.md`.** A box there means "I read this",
   not "this behaviour is guaranteed". My tool leaves review documents out of its
   default scope for exactly that reason; the number is here because you asked
   for nothing and I would rather show the whole measurement than the flattering
   half.
2. **The last row is the real finding.** Zero criteria out of 315 fail for lack
   of a candidate: every single one shares vocabulary with some test title in the
   repository. What is missing is not tests. It is the link between a criterion
   and the test that covers it, and that link is one line.
3. **The plan template ships a `#### Acceptance criteria` section that nobody
   fills.** Zero such headings in the repository; plans carry `## Guards` and
   `## Proof` prose instead. That is a fact about the template, not about anyone's
   discipline, and it matters for anything built on top.

The tool is here, MIT, working, CI green, 161 tests:
<https://github.com/guillaume-flambard/aidd-guard>

It reads `## Done-when` bullets and `- [ ]` checkboxes, reads Vitest and Jest
test titles from the TypeScript syntax tree, and matches the two. Never runs a
test, never imports your code, never calls a model, and gives identical bytes for
identical input. A criterion is linked to a test with an HTML comment, never a
heading, so your own parsers and `spec-validator.yml` see nothing new:

```md
- [ ] The export produces a JSON file the user can download.
  <!-- aidd-guard:test="writes the export as JSON" -->
```

It specifies itself in that format and gates its own build on it: 27 criteria,
26 linked by an explicit selector, one declared non-testable with a written
reason.

Two questions for you, and I genuinely do not have a preference:

1. **Does this belong anywhere near the framework?** A skill in `aidd-dev`, a
   hook, or nothing at all and it stays a companion tool people can install.
2. **Should the plan template say what plans actually say?** Any checkbox-based
   check is checking a section people are not writing today.

Happy to do the work whichever way you want it, and happy for it to live under
the `ai-driven-dev` org rather than mine if that makes more sense. If the answer
is "interesting, but not in the framework", that is a perfectly good answer and I
will say so in the README.

---

## 2. Issue (only if a maintainer asks for one)

Template: 🌱 Quick Contribution. The title field is prefilled with
`feat(<scope>): `.

**Title**

```
feat(aidd-dev): a deterministic check for acceptance criteria that no test covers
```

**Problem to solve**

`aidd-dev:09-for-sure` carries the rule "never set `status: implemented` until
the success condition genuinely passes", and `03-assert` and `06-test` rest on
the same honesty. Today that rule is an instruction addressed to a model, and
nothing outside the model checks it. A phase can be ticked, a task marked
implemented, and no test anywhere name the behaviour that was promised.

Measured on this repository at `f6c61cf`, across every task document: 315
criteria, 202 ticked boxes, 200 of them with no test title behind them, and zero
criteria that share no significant word with any test. Most of those 200 are
review checkboxes rather than product promises, which is why the default scope
of the tool leaves `review.md` out.

**Proposed solution**

A deterministic check, runnable from a skill or from CI, that answers one
question: which acceptance criteria are covered by a test? It reads
`## Done-when` bullets and `- [ ]` checkboxes, reads Vitest and Jest test titles
from the syntax tree, and matches the two. Linking is an HTML comment, so
`spec-validator.yml` and the framework's own parsers see nothing new. No test is
run, no code imported, no model called, and exit codes separate "a gate was
violated" from "your input is malformed" from "the tool has a bug".

Working implementation, MIT, 161 tests, CI green:
<https://github.com/guillaume-flambard/aidd-guard>

**Content type**: Skill
**Target tool(s)**: Claude Code
