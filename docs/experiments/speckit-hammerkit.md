# Spec Kit feasibility: Hammerkit

Measured on 2026-09-13. This is a bounded feasibility probe, not a released adapter
or a claim that Hammerkit uses Spec Guard.

## Reproduce

From a clone of this repository, with Node 20.11+, npm and git:

```bash
node scripts/probe-speckit.mjs
```

The script fetches [Hammerkit at 41f331b](https://github.com/no0dles/hammerkit/tree/41f331b24cb33edab98962a02f0c585fd04b6fa9)
into a temporary directory. It uses npm `openspec-guard@0.2.0`, without installing
Hammerkit dependencies or executing its code or tests. The original specs remain
unchanged. Temporary converted specs, a source map and JSON reports are retained
at the printed path. [Recorded summary](speckit-hammerkit-summary.json).

## Scope and result

Hammerkit has 27 Spec Kit documents marked as current-state descriptions. The
probe reads their numbered acceptance scenarios, preserving the full
Given/When/Then text as matching input. Functional requirements, success criteria,
edge-case lists and task checkboxes are excluded from this measurement.

| Measurement                              | Result |
| ---------------------------------------- | -----: |
| Acceptance scenarios extracted           |    166 |
| Test files selected (`src/**/*.spec.ts`) |    114 |
| Statically extracted test titles         |    462 |
| Automatic passes                         |      0 |
| Uncertain candidates                     |     21 |
| Low-similarity candidates                |    145 |
| Dynamic-title diagnostics                |     89 |

The diagnostics include suite declarations and are not a count of missing tests.
The title inventory is incomplete where names cannot be read statically.
These numbers measure this conversion and matching configuration. They are not
Hammerkit's test coverage. Long acceptance sentences compared with short test
names are a likely contributor to low scores; this probe does not isolate that
cause or establish the best matching strategy.

## One reviewed link, then a broken-link check

[The scenario](https://github.com/no0dles/hammerkit/blob/41f331b24cb33edab98962a02f0c585fd04b6fa9/specs/service/kubernetes/spec.md#L41)
requires a service to inherit namespace, context and kubeconfig from the selected
environment when none is set on the service.

[The test](https://github.com/no0dles/hammerkit/blob/41f331b24cb33edab98962a02f0c585fd04b6fa9/src/planner/utils/append-work-service.spec.ts#L50)
asserts those three resolved values. I inspected those assertions but did not run
them. Its full title is:

```text
appendWorkService (kubernetes service env inheritance) > inherits context, kubeconfig and namespace from the selected environment
```

The heuristic scores that pair 0.50, below the 0.60 pass threshold. Adding its
explicit selector to the temporary OpenSpec conversion produces one pass, 20
uncertain and 145 fail. All 165 other verdicts remain unchanged.

The probe then freezes the existing debt. The gate passes with the link intact.
Replacing the selector with a nonexistent title produces `selector-unmatched`
and exit 1, despite the baseline. Two repeated runs before and after annotation
produce identical JSON bytes.

This verifies a relationship and its failure mode. It does not prove runtime
behaviour or the completeness of the scenario's tests.

## A native-format blocker

Running npm 0.2.0 directly on Hammerkit's `specs/` finds **zero** criteria and exits
0, even with `--fail-on fail,uncertain`. It emits parse warnings. The published
OpenSpec parser does not recognize these Spec Kit documents.

Do not use that native invocation as a Spec Kit gate. A supported adapter must
parse the actual format and reject an empty result for this nonempty corpus.
The temporary conversion is only a way to assess the existing matching engine.

The probe supports the exact single-line acceptance-list syntax in this pinned
corpus and rejects unexpected nonempty lines inside those lists. It verifies
both per-file extraction counts and the expected corpus total. It is not a
parser for all Spec Kit variants, including multiline scenarios or custom templates.
A native adapter would also need stable source identities and annotation placement
that survive renumbering and preserve the original Markdown.

## Comparison with SpecTest

I inspected [SpecTest at 646a2d1](https://github.com/Quratulain-bilal/spec-kit-spectest/tree/646a2d14bd3066980adef61f3d8640d4fc4290fc).
Its extension registers four Markdown commands for an agent. The
[coverage command](https://github.com/Quratulain-bilal/spec-kit-spectest/blob/646a2d14bd3066980adef61f3d8640d4fc4290fc/commands/speckit.test.coverage.md)
asks the agent to extract requirements, find tests and classify relationships.
There is no executable coverage calculator in that revision.

| Question                  | SpecTest's documented approach                                 | This Guard probe                                 |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Matching                  | Agent applies keyword, file-reference and requirement-ID rules | Fixed lexical score or exact test-title selector |
| Scope                     | Requirements, scenarios, success criteria and design decisions | Numbered acceptance scenarios only               |
| Selected inheritance pair | Keyword evidence would fit its Medium category                 | 0.50 uncertain, then explicit pass               |
| CI evidence               | Prompt requests threshold comparison and pass/fail reporting   | Broken selector verified to return exit 1        |

The Medium classification is my application of its written rubric, not output
from a SpecTest run. I did not execute the extension or compare accuracy rates.
Earlier project notes calling SpecTest a deterministic no-LLM CLI were incorrect.

## Decision

The engine can enforce a selected relationship after conversion. Automatic
matching on this corpus does not justify an adapter on its own. Ask the
maintainer whether explicit scenario/test links would be useful before expanding
this prototype. If there is interest, prioritize original-source annotations,
empty-result rejection and a workflow for finding the right test title.
