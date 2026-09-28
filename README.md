# OpenSpec Guard

OpenSpec Guard reports which OpenSpec scenarios are linked to a Vitest or Jest
test. It reads specs and test titles without running the tests, importing the
application, or calling an LLM.

> **Current public release: [`0.2.0`](https://www.npmjs.com/package/openspec-guard/v/0.2.0).**
> npm does not contain `0.3.0`. This repository includes unreleased `0.3.0`
> work, so the install examples below pin the version that people can actually
> download today. The matching GitHub release is
> [`v0.2.0`](https://github.com/guillaume-flambard/spec-guard/releases/tag/v0.2.0).

An OpenSpec Guard pass means that a scenario is linked to a test title. It does
not prove that the test passes or that its assertions cover the complete
behaviour.

## Try it on a repository

Requirements: Node.js 20.11 or later, an OpenSpec directory at
`openspec/specs` or `specs`, and Vitest or Jest tests.

```bash
npx --yes openspec-guard@0.2.0 check
```

The first run is read-only. It reports linked scenarios, possible matches, and
scenarios with no convincing match. Findings do not fail the command unless a
gate is requested.

Scope the test files when a repository contains several runners:

```bash
npx --yes openspec-guard@0.2.0 check \
  --tests 'src/**/*.test.ts' --runner vitest
```

Run `npx --yes openspec-guard@0.2.0 check --help` for the complete set of
released options.

## Link a scenario explicitly

Put the exact test title in an HTML comment directly below the scenario heading:

```md
#### Scenario: Empty email is rejected

<!-- openspec-guard:test="rejects an empty email" -->

- **WHEN** a visitor submits an empty email
- **THEN** signup rejects the request
```

The corresponding test can be written with Vitest or Jest:

```ts
it('rejects an empty email', () => {
  expect(() => signup('')).toThrow('Email is required');
});
```

Selectors match either the leaf title or the full suite path. Use the full path
when the same title occurs in several suites:

```md
<!-- openspec-guard:test="signup > rejects an empty email" -->
```

For a scenario that needs a manual check, record the reason:

```md
<!-- openspec-guard:non-testable reason="Requires a manual accessibility review" -->
```

These comments are an OpenSpec Guard convention, not OpenSpec syntax. A scenario
cannot have both directives, and a skipped test never counts as a link.

The repository contains a complete [signup example](examples/signup) and a
[reproducible check against a pinned public repository](docs/demo-sku.md).

## Adopt it without hiding existing debt

Record the current unlinked scenarios after reviewing the first report:

```bash
npx --yes openspec-guard@0.2.0 check --update-baseline
git add .openspec-guard-baseline.json
```

Then fail only when a new scenario is unlinked:

```bash
npx --yes openspec-guard@0.2.0 check \
  --baseline .openspec-guard-baseline.json --fail-on fail
```

The baseline changes the gate, not the report. Existing failures remain visible.
A new scenario, changed scenario text, or changed failure reason is not silently
suppressed. Review baseline changes like any other code change.

For repositories whose spec and test titles use different languages, add
`--require-selector`. Similarity compares words. It does not translate them or
understand negation.

## Use it in GitHub Actions

The released Action is pinned to the same public version:

```yaml
- uses: guillaume-flambard/spec-guard@v0.2.0
  with:
    fail-on: fail
    baseline: .openspec-guard-baseline.json
```

The Action annotates spec files, writes a job summary, and exposes the verdict
counts as outputs. It bundles its runtime and does not install dependencies in
the checked repository.

## Read the report

| Verdict     | Meaning                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `pass`      | An explicit selector resolves, or title similarity exceeds the threshold      |
| `uncertain` | A candidate exists and needs review                                           |
| `fail`      | No usable link exists, or the selected test is missing, ambiguous, or skipped |
| `skip`      | The scenario is declared non-testable with a reason                           |

Exit code `0` means the report completed and every requested gate passed. Code
`1` means a gate failed, `2` means the input or an option is invalid, and `3`
means OpenSpec Guard failed internally.

JSON output uses relative paths and stable ordering:

```bash
npx --yes openspec-guard@0.2.0 check --format json > report.json
```

## Evidence and limits

The [measurements](docs/measurements.md) include the cases where title similarity
helps and the cases where it produces noise. A separate
[Spec Kit experiment](docs/experiments/speckit-hammerkit.md) uses a temporary
conversion to exercise the engine. It is not native Spec Kit support.

OpenSpec Guard does not inspect assertions, execute tests, translate titles,
expand every dynamic or parameterized title, or support other spec formats. It
cannot certify behavioural test coverage.

## Unreleased work

The source on `main` contains changes prepared for `0.3.0`, including assisted
linking, a coverage percentage gate, and stricter rejection of unrecognized spec
input. They are documented in the [changelog](CHANGELOG.md), but they are not in
the npm release yet. Do not use an `@0.3.0` install or Action reference until npm
lists that version and the GitHub release succeeds.

## Contributing

Bug reports and focused pull requests are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), which covers the repository layout, local
checks, generated Action bundle, and pull request expectations.

If a match looks wrong, [open a bug report](https://github.com/guillaume-flambard/spec-guard/issues/new?template=bug.yml)
with the package version, command, and a small scenario and test-title example.
Include only content you can share publicly.

## License and names

[MIT](LICENSE), published by Memo Labs (Guillaume Flambard).

The npm package is `openspec-guard`. Packages named `specguard` or
`@spec-guard/cli` are unrelated.
