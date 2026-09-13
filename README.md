# OpenSpec Guard

**Which OpenSpec scenarios have a test linked to them?**

OpenSpec Guard reads your specs and the titles of your Vitest or Jest tests.
It reports explicit links, possible matches and scenarios with no convincing match.
It never runs tests, imports your application or calls an LLM.
A link does not prove that the test passes or checks the right behaviour.

## Try it on your repository

From a repository with `openspec/specs` and Vitest or Jest tests:

```bash
npx --yes openspec-guard@0.2.0 check
```

This command reports without changing files. It exits successfully even when it
finds unlinked scenarios; CI gates are opt-in. Node 20.11 or later is required.

If your repository also has Playwright tests, scope the test files explicitly:

```bash
npx --yes openspec-guard@0.2.0 check --tests 'src/**/*.test.ts' --runner vitest
```

**Found a wrong match or a confusing result?**
[Open an issue](https://github.com/guillaume-flambard/spec-guard/issues/new)
with your command, package version and a small scenario/test-title example.
Include only content you can share publicly.

## A spec, a test, a result

A scenario carries the title of its test in an HTML comment:

```md
#### Scenario: Empty email is rejected

<!-- openspec-guard:test="rejects an empty email" -->

- **WHEN** a visitor submits an empty email
- **THEN** signup rejects the request
```

The corresponding Vitest test:

```ts
it('rejects an empty email', () => {
  expect(() => signup('')).toThrow('Email is required');
});
```

Run the complete [signup example](examples/signup) from a clone of this repository:

```bash
cd examples/signup
npx --yes openspec-guard@0.2.0 check \
  --runner vitest --require-selector --fail-on fail,uncertain
```

The summary is:

```text
1 criteria: 1 pass (1 by selector, 0 by similarity), 0 uncertain, 0 fail, 0 skip
```

Rename the test without updating the annotation and the gate fails with
`selector-unmatched`. The test body is never evaluated by Guard.

## A real repository: three links in sku

On a pinned revision of [seek-oss/sku](https://github.com/seek-oss/sku), I checked
six local-host scenarios against one test file using the published 0.2.0 package.
Adding three explicit annotations changed the report:

|                     | Before | After |
| ------------------- | -----: | ----: |
| Linked by selector  |      0 |     3 |
| Uncertain           |      3 |     1 |
| No convincing match |      3 |     2 |

One remaining suggestion points to the opposite behaviour. It stays uncertain.
The two remaining failures are outside the selected test file's scope.
These counts describe title matching, not sku's test coverage or quality.
This is an independent example, not an adoption or endorsement by SEEK.

[Read the cases and reproduce the result](docs/demo-sku.md).

## How links work

The annotation is an OpenSpec Guard convention, carried in an HTML comment.
Selectors match the test's leaf title or its full name exactly. Use the full name
when a title occurs in several suites:

```md
<!-- openspec-guard:test="signup > rejects an empty email" -->
```

Without a selector, Guard compares words in scenario and test titles. It does not
understand negation or translate between languages. Review suggestions before
adding a selector. `--require-selector` disables similarity matching.

For a scenario that needs a manual check, record the reason:

```md
<!-- openspec-guard:non-testable reason="Requires a manual accessibility review" -->
```

A scenario cannot carry both directives. A skipped test does not count as a link.

| Verdict     | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `pass`      | An explicit selector resolves, or similarity exceeds the threshold    |
| `uncertain` | A candidate needs review                                              |
| `fail`      | No convincing match, or a missing, ambiguous or skipped selected test |
| `skip`      | The scenario has a non-testable annotation with a reason              |

The report separates passes by selector from passes by similarity.
[Earlier measurements](docs/measurements.md) explore where similarity helps and fails.

## Adopt gradually, then gate CI

After reading the first report, record the existing unlinked scenarios:

```bash
npx --yes openspec-guard@0.2.0 check --update-baseline
git add .openspec-guard-baseline.json
```

Then fail on new failures:

```bash
npx --yes openspec-guard@0.2.0 check \
  --baseline .openspec-guard-baseline.json --fail-on fail
```

The baseline suppresses existing failures in the gate. The report still shows
them. New scenarios, changed scenario text and changed failure reasons are not
silently suppressed. Review baseline updates as code changes.

For strict explicit links, use `--require-selector` consistently when creating
the baseline and running the gate.

Without a baseline, a CI step can be:

```yaml
- run: npx --yes openspec-guard@0.2.0 check --fail-on fail,uncertain
```

A bundled GitHub Action is also available:

```yaml
- uses: guillaume-flambard/spec-guard@v0.2.0
  with:
    fail-on: fail
```

| Exit code | Meaning                                     |
| --------- | ------------------------------------------- |
| `0`       | Report completed and requested gates passed |
| `1`       | A requested gate failed                     |
| `2`       | Invalid input or option                     |
| `3`       | Internal error; please report it            |

## JSON and options

```bash
npx --yes openspec-guard@0.2.0 check --format json > report.json
npx --yes openspec-guard@0.2.0 check --help
```

JSON uses relative paths and stable ordering, with no timestamp or machine name.
The same input and options produce the same bytes. Each criterion has an ID
derived from its path, requirement and scenario text. Adding an annotation does
not change it; editing scenario text can.

Useful options include `--cwd`, `--specs`, repeatable `--tests`,
`--runner vitest|jest`, `--include-changes`, `--require-selector`, `--verbose`,
`--fail-on` and `--min-pass`.

The source branch also contains the interactive `link` command and
`--min-coverage`. They are not in npm 0.2.0. The examples above use the published
version so you can run them without building this repository.

## Limitations

Guard matches titles. It does not inspect assertions or execute tests, and cannot
prove that a scenario's behaviour is tested correctly. Similarity can suggest
unrelated or opposite behaviours. Dynamic titles and parameterized test tables
are not fully expanded. Scope mixed test runners with `--tests`.

The published package supports OpenSpec with Vitest or Jest. It does not support
`node:test`, other spec formats, translation, watch mode or SARIF.

## License

MIT. Published by Memo Labs (Guillaume Flambard).

The npm package is `openspec-guard`. Other packages named `specguard` or
`@spec-guard/cli` are unrelated.
