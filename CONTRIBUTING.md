# Contributing to OpenSpec Guard

OpenSpec Guard is deliberately narrow: it connects OpenSpec scenario headings to
Vitest or Jest test titles. It does not run tests or inspect their assertions.
Please keep proposals inside that boundary, or open an issue before investing in
a larger change.

## Before opening an issue

Search the existing issues first. For a matching problem, include:

- the exact OpenSpec Guard version;
- the command you ran;
- the relevant scenario heading and test title;
- the actual verdict and the verdict you expected;
- the smallest public example that reproduces the problem.

Do not post private specifications, source code, credentials, or customer data.

## Local setup

The repository requires Node.js 20.11 or later and uses pnpm 11.24.0.

```bash
git clone https://github.com/guillaume-flambard/spec-guard.git
cd spec-guard
corepack enable
pnpm install --frozen-lockfile
```

Run the complete local gate before opening a pull request:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm build
pnpm test
pnpm spec:check
git diff --exit-code -- action-dist
```

The build must run before the tests because the CLI integration tests execute
the built artifact.

## Repository map

- `src/` contains the CLI, parser, matching, reporting, baseline, and Action code.
- `tests/` contains integration tests and self-contained fixture repositories.
- `openspec/specs/` specifies the tool's own behaviour.
- `examples/signup/` is the smallest public first-run example.
- `docs/` contains measurements, reproducible demonstrations, and research notes.
- `action-dist/` is the committed JavaScript bundle executed by GitHub Actions.

Read the [documentation index](docs/README.md) before changing measured claims or
fixture behaviour.

## Changing behaviour

A behaviour change normally needs three pieces:

1. an OpenSpec scenario that states the expected behaviour;
2. a focused unit or integration test;
3. the implementation change.

Link the scenario to its test with an `openspec-guard:test` comment. The
`pnpm spec:check` gate verifies those links.

Fixtures must stay self-contained. Do not add symlinks, absolute paths, private
content, or a dependency on files outside `tests/fixtures`. When adding a
fixture, register its name in `tests/fixtures.test.ts`.

If Action behaviour changes, run `pnpm build` and commit the resulting
`action-dist/` update. CI rejects a source change whose committed bundle is stale.

## Documentation changes

Installation commands in public documentation must name a version that exists on
npm. Claims about released behaviour must be checked against that published
package, not only against the current source tree.

Keep experiments clearly labelled. A successful conversion or probe does not
mean a format is supported by the published package.

## Pull requests

Keep each pull request focused. In its description, state:

- the observed problem;
- the change made;
- the exact verification commands and outcomes;
- any limitation or follow-up left open.

Do not include generated-by notices or AI co-author lines in commits or pull
requests.

Publishing to npm, moving Action tags, and creating GitHub releases remain
maintainer tasks.

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
