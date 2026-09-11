# spec-guard monorepo, plan 1: the core and openspec-guard 0.3.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `openspec-guard` repository into the `spec-guard` monorepo with a private `@spec-guard/core` and a format adapter, keeping `openspec-guard` behaviour identical, and publish it as 0.3.0.

**Architecture:** Everything except spec parsing and annotation write-back moves into `packages/core`. Parsing talks to the core through one interface, `SpecFormat`, over a format-neutral `ParsedCriterion`. The OpenSpec vocabulary that leaked into shared types (`DeltaOperation`) becomes opaque adapter metadata. A conformance suite in the core states the invariants every future adapter owes it.

**Tech Stack:** TypeScript 5.9, Node 24, pnpm 11 workspaces, Vitest 3, ESLint 9, Prettier 3, esbuild for the Action bundle.

**Spec:** `docs/superpowers/specs/2026-09-11-spec-guard-monorepo-design.md`

## Global Constraints

- Node floor: `>=20.11`. Package manager: `pnpm@11.24.0`, pinned in `packageManager`.
- One runtime dependency, `typescript`. Do not add another. Argument parsing uses `parseArgs` from `node:util`, never a parser library.
- No module below the CLI calls `process.cwd()`. The working directory is always a parameter.
- Report bytes are stable: no timestamp, no duration, no absolute path, no machine name, anywhere in `--format json`.
- Every path in a report is relative to the working directory, POSIX separators.
- `results` is sorted by file, then line, then id. Absent scalars are `null`, never omitted. Scores are rounded to four decimals.
- Exit codes: 0 ok, 1 gate violated, 2 input at fault, 3 our bug.
- Prose written for humans (README, help text, error messages, commit messages) contains no em dash and no en dash. Grep for both before committing.
- No AI attribution anywhere: no `Co-Authored-By: Claude`, no "Generated with" line, in any commit, PR or file.

---

### Task 1: Rename the repository and point the local clone at it

This task is the only one that touches anything outside the repository, and it
temporarily breaks publishing on purpose. Nothing is published until Task 10.

**Files:**
- Modify: `package.json` (the `repository`, `homepage` and `bugs` URLs)
- Modify: `README.md` (badge and clone URLs)

**Interfaces:**
- Consumes: nothing.
- Produces: the remote `origin` at `https://github.com/guillaume-flambard/spec-guard.git`.

- [ ] **Step 1: Confirm with Guillaume before touching GitHub**

Renaming a repository is outward facing and it breaks the npm trusted publisher
entry until Task 10 repairs it. Do not run the next step without an explicit
yes in the conversation.

State this: "Renaming `guillaume-flambard/openspec-guard` to `spec-guard`.
GitHub keeps redirecting the old path, so clones, `uses:` references and npm
links keep working. Publishing stays broken until we repair the npmjs.com
trusted publisher entry in Task 10. No tag is pushed before then. Confirm?"

- [ ] **Step 2: Rename on GitHub**

```bash
gh repo rename spec-guard --repo guillaume-flambard/openspec-guard --yes
```

- [ ] **Step 3: Point the local clone at the new name**

```bash
git remote set-url origin https://github.com/guillaume-flambard/spec-guard.git
git remote -v
```

Expected: both lines read `.../spec-guard.git`.

- [ ] **Step 4: Verify the redirect works from the old name**

```bash
git ls-remote https://github.com/guillaume-flambard/openspec-guard.git HEAD
```

Expected: a SHA, not an error. This proves existing consumers keep resolving.

- [ ] **Step 5: Update the URLs in the manifest**

In `package.json`, replace the three occurrences of `openspec-guard.git`,
`openspec-guard#readme` and `openspec-guard/issues` so they read:

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/guillaume-flambard/spec-guard.git"
  },
  "homepage": "https://github.com/guillaume-flambard/spec-guard#readme",
  "bugs": {
    "url": "https://github.com/guillaume-flambard/spec-guard/issues"
  }
```

Leave `"name": "openspec-guard"` alone. The package keeps its name; only the
repository is renamed.

- [ ] **Step 6: Update the clone and badge URLs in README.md**

```bash
grep -n "openspec-guard" README.md
```

Change only URLs that point at `github.com/guillaume-flambard/openspec-guard`.
Leave every mention of the npm package name, the CLI name and the annotation
prefix exactly as they are.

- [ ] **Step 7: Prove nothing else regressed**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm format && pnpm typecheck && pnpm build && pnpm test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add package.json README.md
git commit -m "chore: rename the repository to spec-guard

The package keeps its name. Only the GitHub path moves, and GitHub keeps
redirecting the old one. Publishing stays broken until the npmjs.com trusted
publisher entry is repaired, which is why no tag is pushed yet."
```

---

### Task 2: Move the package under packages/openspec-guard

A pure move. No file content changes except paths in configuration.

**Files:**
- Create: `pnpm-workspace.yaml` (extend the existing one with `packages:`)
- Create: `packages/openspec-guard/` (everything that is the package today)
- Modify: root `package.json` (becomes the workspace root, publishes nothing)

**Interfaces:**
- Consumes: Task 1's renamed remote.
- Produces: `pnpm --filter openspec-guard <script>` works for every script that worked at the root.

- [ ] **Step 1: Move the package files with git so history follows**

```bash
mkdir -p packages/openspec-guard
git mv src tests scripts openspec action.yml action-dist \
       tsconfig.json tsconfig.build.json vitest.config.ts eslint.config.js \
       package.json README.md LICENSE .prettierrc.json .prettierignore \
       packages/openspec-guard/
```

If `tests` or `action-dist` does not exist at the root, drop it from the list
rather than creating it.

- [ ] **Step 2: Declare the workspace**

Append to `pnpm-workspace.yaml`, keeping the existing `allowBuilds` block:

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Write the workspace root manifest**

Create `package.json` at the root:

```json
{
  "name": "spec-guard-workspace",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.11" },
  "packageManager": "pnpm@11.24.0",
  "scripts": {
    "lint": "pnpm -r lint",
    "format": "pnpm -r format",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build",
    "test": "pnpm -r test"
  }
}
```

`private: true` is what stops the workspace root from ever being published.

- [ ] **Step 4: Reinstall so pnpm links the workspace**

```bash
pnpm install
```

- [ ] **Step 5: Run the whole gate from the root**

```bash
pnpm lint && pnpm format && pnpm typecheck && pnpm build && pnpm test
```

Expected: all green, and the test count is identical to Task 1 Step 7.

- [ ] **Step 6: Fix the CI workflow paths**

In `.github/workflows/ci.yml`, any step that runs a package script must now go
through the workspace. Replace `run: pnpm spec:check` style steps with:

```yaml
      - run: pnpm --filter openspec-guard spec:check
```

Leave `release.yml` alone. Task 10 rewrites it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move the package under packages/openspec-guard

A move and nothing else: same files, same scripts, same test count. The
workspace root is private so it can never be published."
```

---

### Task 3: Bring aidd-guard in with its history

The code arrives and is parked. It is deliberately excluded from the build so
the gate stays green while the core is extracted.

**Files:**
- Create: `packages/aidd-guard/` (from the other repository)
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: Task 2's workspace.
- Produces: `packages/aidd-guard` on disk with its commit history reachable.

- [ ] **Step 1: Confirm both trees are clean before merging histories**

```bash
git status --short
git -C ../aidd-guard status --short
git -C ../aidd-guard branch --show-current
```

Expected: no output from either status, and `main` from the branch.

- [ ] **Step 2: Add the subtree**

```bash
git subtree add --prefix=packages/aidd-guard ../aidd-guard main
```

- [ ] **Step 3: Prove the history came with it**

```bash
git log --oneline -- packages/aidd-guard | tail -5
```

Expected: the `aidd-guard` commits, including `a00a45c docs: the first publish
cannot use trusted publishing, and here is the proof`.

- [ ] **Step 4: Park it out of the build**

In `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - '!packages/aidd-guard'
```

A comment above it, so the next reader knows this is temporary:

```yaml
# aidd-guard is parked until it runs on the core. Plan 2 removes this line.
```

- [ ] **Step 5: Prove the gate is still green and still only runs one package**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: green, and no `aidd-guard` in the output.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: park aidd-guard in the workspace until it runs on the core

Its history came in with the subtree. It is excluded from the build on
purpose: the gate must stay green while the core is extracted."
```

---

### Task 4: Create @spec-guard/core and move the format-neutral modules into it

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsconfig.build.json`, `packages/core/vitest.config.ts`, `packages/core/eslint.config.js`, `packages/core/src/index.ts`
- Move into `packages/core/src/`: `baseline.ts`, `criteria.ts`, `criteria.test.ts`, `discovery.ts`, `discovery.test.ts`, `errors.ts`, `types.ts`, `verdict.ts`, `verdict.test.ts`, `matching/`, `report/`, `tests/`, `link/`
- Modify: `packages/openspec-guard/package.json` (depend on the core)

**Interfaces:**
- Consumes: Task 2's workspace.
- Produces: `@spec-guard/core` exporting everything `packages/openspec-guard/src/index.ts` exports today, minus `parseSpec` and the OpenSpec annotation module.

- [ ] **Step 1: Scaffold the core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@spec-guard/core",
  "version": "0.3.0",
  "description": "Shared engine for the spec-guard family. Not published.",
  "private": true,
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20.11" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "format": "prettier --check .",
    "test": "vitest run"
  },
  "dependencies": { "typescript": "^5.9.3" },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^22.19.2",
    "eslint": "^9.39.1",
    "prettier": "^3.6.2",
    "typescript-eslint": "^8.46.4",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Copy the four config files from the package, unchanged**

```bash
cp packages/openspec-guard/tsconfig.json packages/core/tsconfig.json
cp packages/openspec-guard/tsconfig.build.json packages/core/tsconfig.build.json
cp packages/openspec-guard/vitest.config.ts packages/core/vitest.config.ts
cp packages/openspec-guard/eslint.config.js packages/core/eslint.config.js
cp packages/openspec-guard/.prettierrc.json packages/core/.prettierrc.json
```

- [ ] **Step 3: Move the format-neutral modules with git**

```bash
mkdir -p packages/core/src
git mv packages/openspec-guard/src/baseline.ts \
       packages/openspec-guard/src/criteria.ts \
       packages/openspec-guard/src/criteria.test.ts \
       packages/openspec-guard/src/discovery.ts \
       packages/openspec-guard/src/discovery.test.ts \
       packages/openspec-guard/src/errors.ts \
       packages/openspec-guard/src/types.ts \
       packages/openspec-guard/src/verdict.ts \
       packages/openspec-guard/src/verdict.test.ts \
       packages/openspec-guard/src/version.ts \
       packages/core/src/
git mv packages/openspec-guard/src/matching packages/core/src/matching
git mv packages/openspec-guard/src/report packages/core/src/report
git mv packages/openspec-guard/src/tests packages/core/src/tests
git mv packages/openspec-guard/src/link packages/core/src/link
```

`src/openspec/`, `src/commands/`, `src/action/`, `src/cli.ts` and `src/index.ts`
stay in `packages/openspec-guard`.

- [ ] **Step 4: Rename the error class to its format-neutral name**

`OpenSpecGuardError` is thrown by `discovery.ts`, which is now shared. Rename
the class, keep the old names as aliases so nothing downstream breaks yet.

In `packages/core/src/errors.ts`, rename `OpenSpecGuardError` to
`SpecGuardError` and `isOpenSpecGuardError` to `isSpecGuardError`, updating
`this.name = 'SpecGuardError'`, then append:

```ts
/**
 * Kept so `openspec-guard`'s published type exports do not break. Removed in
 * the next major, not before.
 */
export { SpecGuardError as OpenSpecGuardError, isSpecGuardError as isOpenSpecGuardError };
```

Then update every `import` of it inside `packages/core/src/`:

```bash
grep -rln "OpenSpecGuardError" packages/core/src | xargs sed -i '' \
  -e 's/isOpenSpecGuardError/isSpecGuardError/g' \
  -e 's/OpenSpecGuardError/SpecGuardError/g'
```

That `sed` also rewrites the alias line you just wrote, so restore it by hand
afterwards and confirm with `grep -n "OpenSpecGuardError" packages/core/src/errors.ts`
that the alias is present exactly once.

- [ ] **Step 5: Write the core's public entry point**

Create `packages/core/src/index.ts`:

```ts
/**
 * The format-neutral engine. Everything here is independent of which spec
 * format produced the criteria.
 */

export {
  buildCriteria,
  criterionId,
  disambiguateIds,
  normalizeScenarioText,
  type BuildCriteriaResult,
} from './criteria.js';
export {
  discover,
  toRelativePosix,
  DEFAULT_TEST_GLOBS,
  type Discovery,
  type DiscoveryOptions,
  type DiscoveredSpec,
  type Manifest,
} from './discovery.js';
export {
  EXIT_GATE,
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_OK,
  isSpecGuardError,
  SpecGuardError,
  isOpenSpecGuardError,
  OpenSpecGuardError,
  type ErrorCode,
  type ErrorLocation,
} from './errors.js';
export {
  buildBaseline,
  diffBaseline,
  isBaselined,
  loadBaseline,
  staleEntries,
  writeBaseline,
  DEFAULT_BASELINE_PATH,
  BASELINE_SCHEMA_VERSION,
  type Baseline,
  type BaselineEntry,
  type BaselineFile,
} from './baseline.js';
export { renderJson } from './report/json.js';
export {
  renderTerminal,
  DEFAULT_TERMINAL_OPTIONS,
  type TerminalOptions,
} from './report/terminal.js';
export {
  SCHEMA_VERSION,
  type CriterionResult,
  type Report,
  type ReportDiagnostics,
  type ReportInput,
  type ReportOptions,
  type TestRef,
} from './report/types.js';
export { type Runner } from './tests/detect.js';
export {
  type Annotation,
  type Criterion,
  type MatchReason,
  type TestTitle,
  type Verdict,
} from './types.js';
export { type Summary } from './verdict.js';
```

If `discover` is not the exported name in `discovery.ts`, run
`grep -n "^export function" packages/core/src/discovery.ts` and use the real
one.

- [ ] **Step 6: Depend on the core from openspec-guard**

In `packages/openspec-guard/package.json`, add to `dependencies`:

```json
    "@spec-guard/core": "workspace:*"
```

- [ ] **Step 7: Repoint the imports in openspec-guard**

Every remaining file under `packages/openspec-guard/src/` that imported a moved
module now imports from the core. For example, in `src/commands/check.ts`:

```ts
import { buildCriteria, discover, EXIT_GATE, EXIT_INPUT, EXIT_OK, SpecGuardError } from '@spec-guard/core';
```

Find them all:

```bash
grep -rn "from '\.\./\(baseline\|criteria\|discovery\|errors\|types\|verdict\|version\)\.js'\|from '\./\(baseline\|criteria\|discovery\|errors\|types\|verdict\|version\)\.js'\|from '\.\.\/\(matching\|report\|tests\|link\)\/" packages/openspec-guard/src
```

- [ ] **Step 8: Build the core before the package that consumes it**

```bash
pnpm install
pnpm --filter @spec-guard/core build
pnpm --filter openspec-guard build
```

Expected: both succeed. If `openspec-guard` cannot resolve `@spec-guard/core`,
the core's `dist` is missing, which means its build did not run first.

- [ ] **Step 9: Run the full gate**

```bash
pnpm lint && pnpm format && pnpm typecheck && pnpm build && pnpm test
```

Expected: green, and the total test count equals Task 2 Step 5.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: extract the format-neutral engine into @spec-guard/core

Discovery, matching, verdict, reports, baseline and link move out. Only spec
parsing, annotation write-back and the CLI stay behind. The error class takes
its neutral name and keeps the old one as an alias, so the published type
exports do not break."
```

---

### Task 5: Define the SpecFormat contract over a neutral ParsedCriterion

The core currently consumes `ParsedSpec`, which is OpenSpec-shaped: a tree of
requirements carrying a `DeltaOperation`. This task replaces that with a flat,
format-neutral list.

**Files:**
- Create: `packages/core/src/format.ts`
- Create: `packages/core/src/format.test.ts`
- Modify: `packages/core/src/criteria.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/openspec-guard/src/openspec/parse.ts`

**Interfaces:**
- Consumes: `@spec-guard/core` from Task 4.
- Produces: `SpecFormat`, `ParsedCriterion`, `ParsedDocument`, and
  `buildCriteria(documents: readonly ParsedDocument[]): BuildCriteriaResult`.

- [ ] **Step 1: Write the failing test for the neutral shape**

Create `packages/core/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildCriteria } from './criteria.js';
import type { ParsedDocument } from './format.js';

function document(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    file: 'specs/account/spec.md',
    warnings: [],
    criteria: [],
    ...overrides,
  };
}

describe('buildCriteria over ParsedDocument', () => {
  it('carries adapter metadata through without reading it', () => {
    const result = buildCriteria([
      document({
        criteria: [
          {
            capability: 'account',
            requirement: 'Sign up',
            scenario: 'Sign up with a valid email',
            file: 'specs/account/spec.md',
            line: 12,
            isNamedScenario: true,
            bodyLines: ['- **WHEN** a visitor submits a valid email'],
            annotationLines: [],
            claimedDone: null,
            excluded: false,
            meta: { operation: 'added' },
          },
        ],
      }),
    ]);

    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]?.meta).toEqual({ operation: 'added' });
  });

  it('counts an excluded criterion without turning it into one', () => {
    const result = buildCriteria([
      document({
        criteria: [
          {
            capability: 'account',
            requirement: 'Close the account',
            scenario: 'Closing removes the profile',
            file: 'specs/account/spec.md',
            line: 40,
            isNamedScenario: true,
            bodyLines: [],
            annotationLines: [],
            claimedDone: null,
            excluded: true,
            meta: { operation: 'removed' },
          },
        ],
      }),
    ]);

    expect(result.criteria).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @spec-guard/core test -- format.test.ts
```

Expected: FAIL, cannot resolve `./format.js`.

- [ ] **Step 3: Write the contract**

Create `packages/core/src/format.ts`:

```ts
import type { AnnotationLine } from './types.js';

/**
 * One checkable statement, as an adapter reports it. Flat on purpose: how a
 * format nests its criteria is the adapter's business, not the core's.
 */
export interface ParsedCriterion {
  /** Path segments between the spec root and the file's directory. */
  capability: string;
  /** The enclosing requirement, story or section. */
  requirement: string;
  /** The criterion's own heading text. */
  scenario: string;
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

export interface ParseWarning {
  code: string;
  message: string;
  line: number;
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
  /** Path relative to cwd, POSIX separators. */
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
  readonly name: string;
  /** The prefix this binary writes, for example `openspec-guard`. */
  readonly annotationPrefix: string;
  /** Every prefix this binary accepts on read, its own included. */
  readonly acceptedPrefixes: readonly string[];
  /** Tried in order when `--specs` is absent. */
  readonly defaultSpecRoots: readonly string[];
  parse(input: ParseInput): ParsedDocument;
  writeAnnotation(target: AnnotationTarget, selector: string): Promise<void>;
}
```

If `AnnotationLine` is not exported from `types.ts`, export it there first:
`grep -n "AnnotationLine" packages/core/src/types.ts packages/openspec-guard/src/openspec/parse.ts`.

- [ ] **Step 4: Rewrite buildCriteria against the neutral shape**

In `packages/core/src/criteria.ts`, change the signature and the loop. The
three-level walk over `spec.requirements[].scenarios[]` becomes one level, the
`operation === 'removed'` test becomes `criterion.excluded`, and
`removedScenarioCount` becomes `excludedCount`:

```ts
export interface BuildCriteriaResult {
  criteria: Criterion[];
  /** Annotation problems. Any of these stops the run with exit code 2. */
  errors: SpecGuardError[];
  /** Criteria the adapter marked excluded: counted, never checked. */
  excludedCount: number;
}

export function buildCriteria(documents: readonly ParsedDocument[]): BuildCriteriaResult {
  const draft: Omit<Criterion, 'id'>[] = [];
  const rawIds: string[] = [];
  const errors: SpecGuardError[] = [];
  let excludedCount = 0;

  for (const document of documents) {
    for (const parsed of document.criteria) {
      if (parsed.excluded) {
        excludedCount += 1;
        continue;
      }
      // ... the existing per-scenario body, reading `parsed` instead of
      // `scenario`, `parsed.requirement` instead of `requirement.name`, and
      // `parsed.capability` instead of `spec.capability`.
    }
  }
  // ... the existing id disambiguation and return, with excludedCount.
}
```

Keep the id derivation byte for byte. Changing it would invalidate every
baseline in the wild.

- [ ] **Step 5: Add `meta` and `claimedDone` to Criterion, drop `operation`**

In `packages/core/src/types.ts`, in `interface Criterion`, delete the
`operation: DeltaOperation` field and the `DeltaOperation` type, then add:

```ts
  /** Whether the format lets an author claim this done, and whether they did. */
  claimedDone: boolean | null;
  /** Opaque adapter metadata. The core never reads it. */
  meta: Readonly<Record<string, string>>;
```

- [ ] **Step 6: Make the OpenSpec parser produce a ParsedDocument**

In `packages/openspec-guard/src/openspec/parse.ts`, keep the whole existing
parser and add a flattening adapter at the end of the file:

```ts
import type { ParsedDocument, ParseInput } from '@spec-guard/core';

/** The OpenSpec tree, flattened into what the core consumes. */
export function parseDocument(input: ParseInput): ParsedDocument {
  const spec = parseSpec(input.source, input.file, input.capability);
  const criteria = spec.requirements.flatMap((requirement) =>
    requirement.scenarios.map((scenario) => ({
      capability: spec.capability,
      requirement: requirement.name,
      scenario: scenario.heading,
      file: spec.file,
      line: scenario.line,
      isNamedScenario: scenario.isNamedScenario,
      bodyLines: scenario.bodyLines,
      annotationLines: scenario.annotationLines,
      claimedDone: null,
      excluded: requirement.operation === 'removed',
      meta: { operation: requirement.operation },
    })),
  );
  return { file: spec.file, criteria, warnings: spec.warnings };
}
```

`claimedDone: null` is the honest answer: OpenSpec has no checkbox.

- [ ] **Step 7: Repoint the call site**

In `packages/openspec-guard/src/commands/check.ts`, the `Promise.all` over
`discovery.specs` now calls `parseDocument` and passes the result straight to
`buildCriteria`. Rename the local `removedScenarioCount` to `excludedCount`
and follow it into `ReportInput` (Task 6 renames the field in the report).

- [ ] **Step 8: Run the new test and the whole suite**

```bash
pnpm --filter @spec-guard/core test -- format.test.ts
pnpm build && pnpm test
```

Expected: the new test passes and every pre-existing test still passes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): consume a format-neutral ParsedCriterion

The core walked an OpenSpec tree and read its delta vocabulary. It now takes a
flat list any format can produce, carries adapter metadata it never reads, and
generalises the REMOVED rule into an excluded flag. The id derivation is
untouched: changing it would invalidate every baseline in the wild."
```

---

### Task 6: Report schema version 2

**Files:**
- Modify: `packages/core/src/report/types.ts`
- Modify: `packages/core/src/report/json.ts`
- Modify: `packages/core/src/report/json.test.ts`

**Interfaces:**
- Consumes: Task 5's `Criterion` with `meta` and `claimedDone`.
- Produces: `SCHEMA_VERSION = 2`, `Report.format`, `CriterionResult.meta`,
  `ReportInput.excludedCount`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/report/json.test.ts`:

```ts
describe('schema version 2', () => {
  it('states the version and the format that produced the report', () => {
    const json = JSON.parse(renderJson(sampleReport()));
    expect(json.schemaVersion).toBe(2);
    expect(json.format).toBe('openspec');
  });

  it('surfaces adapter metadata per criterion instead of a delta operation', () => {
    const json = JSON.parse(renderJson(sampleReport()));
    expect(json.results[0]).not.toHaveProperty('operation');
    expect(json.results[0].meta).toEqual({ operation: 'added' });
  });
});
```

Use the file's existing fixture helper rather than `sampleReport()` if it has
one: `grep -n "function \|const sample" packages/core/src/report/json.test.ts`.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @spec-guard/core test -- report/json.test.ts
```

Expected: FAIL, `schemaVersion` is 1.

- [ ] **Step 3: Bump the schema and add the two fields**

In `packages/core/src/report/types.ts`:

```ts
/**
 * Version 2. Version 1 was published by two packages with incompatible field
 * sets, so a consumer could not tell which shape it held. Version 2 names the
 * format that produced it, and the OpenSpec delta vocabulary that leaked into
 * `operation` now lives under the opaque `meta`.
 */
export const SCHEMA_VERSION = 2;
```

In `interface CriterionResult`, delete `operation: DeltaOperation` and add:

```ts
  /** Opaque to the core. Whatever the adapter attached to this criterion. */
  meta: Readonly<Record<string, string>>;
  /** `null` when the format has no notion of claiming a criterion done. */
  claimedDone: boolean | null;
```

In `interface ReportInput`, rename `removedScenarioCount` to `excludedCount`
and update its comment to drop the OpenSpec wording.

In `interface Report` (or wherever `schemaVersion` is assembled), add
`format: string`.

- [ ] **Step 4: Emit the new fields**

In `packages/core/src/report/json.ts`, add `format` to the emitted object and
replace `operation` with `meta` and `claimedDone` in each result. Keep the key
order deterministic: the file already relies on a fixed key order for stable
bytes, so insert the new keys in the same place in every result.

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @spec-guard/core test -- report/json.test.ts
pnpm test
```

Expected: green, including the terminal renderer's snapshot if it has one. If a
terminal snapshot changed because it printed `operation`, update the renderer
to print nothing rather than printing raw `meta`: the terminal output is for
humans and delta noise was never in it.

- [ ] **Step 6: Document the break**

Add to `packages/openspec-guard/README.md`, under a `## Changelog` heading if
there is none:

```markdown
### 0.3.0

`--format json` moves to schema version 2. Two things changed, and a consumer
that reads `schemaVersion` before parsing will not be surprised by either:

- the report names the format that produced it, in a new top-level `format`;
- the per-result `operation` field, which was OpenSpec delta vocabulary in a
  shape meant to be format neutral, moves under `meta`.

Version 1 was published by two packages with incompatible field sets under the
same number. That is the bug being fixed.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat!: report schema version 2

Version 1 went out under two incompatible field sets, so a consumer reading
schemaVersion 1 could not tell which shape it held. Version 2 names its format
and moves the OpenSpec delta vocabulary under an opaque meta."
```

---

### Task 7: --fail-claimed, and refusing it where it cannot mean anything

**Files:**
- Modify: `packages/core/src/verdict.ts`
- Modify: `packages/core/src/verdict.test.ts`
- Modify: `packages/openspec-guard/src/cli.ts`

**Interfaces:**
- Consumes: `Criterion.claimedDone` from Task 5.
- Produces: a `failClaimed` option on the check input, and error code
  `E_OPTION` when the active format never populates `claimedDone`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/verdict.test.ts`:

```ts
describe('failClaimed', () => {
  it('fails a criterion claimed done with no test behind it', () => {
    const summary = summarise(
      [criterion({ claimedDone: true, verdict: 'fail' })],
      { failOn: [], failClaimed: true },
    );
    expect(summary.gateViolated).toBe(true);
  });

  it('leaves a criterion claimed done that has a test alone', () => {
    const summary = summarise(
      [criterion({ claimedDone: true, verdict: 'pass' })],
      { failOn: [], failClaimed: true },
    );
    expect(summary.gateViolated).toBe(false);
  });

  it('ignores a criterion whose format has no notion of claiming', () => {
    const summary = summarise(
      [criterion({ claimedDone: null, verdict: 'fail' })],
      { failOn: [], failClaimed: true },
    );
    expect(summary.gateViolated).toBe(false);
  });
});
```

Adapt `summarise` and `criterion` to the real names in that file:
`grep -n "^export function\|^function" packages/core/src/verdict.ts packages/core/src/verdict.test.ts`.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @spec-guard/core test -- verdict.test.ts
```

Expected: FAIL, `failClaimed` is not an option.

- [ ] **Step 3: Implement it**

In `packages/core/src/verdict.ts`, add `failClaimed?: boolean` to the options
and, in the gate computation, violate the gate when any criterion has
`claimedDone === true` and a verdict other than `pass`. `claimedDone === null`
never violates: the format cannot express the claim.

- [ ] **Step 4: Refuse the flag where it is meaningless**

In `packages/openspec-guard/src/cli.ts`, after parsing, if `--fail-claimed` was
passed and every criterion has `claimedDone === null`, throw:

```ts
throw new SpecGuardError(
  'E_OPTION',
  '--fail-claimed needs a format where an author can mark a criterion done. ' +
    'OpenSpec has no such marker, so the flag would pass on everything. ' +
    'Remove it, or run aidd-guard on a task document that has checkboxes.',
);
```

Silently accepting it would be a gate that always passes, which is the exact
failure this tool exists to prevent.

- [ ] **Step 5: Run the tests**

```bash
pnpm test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): --fail-claimed, refused where it cannot mean anything

A ticked box with no test behind it is the best idea either codebase had, and
it belongs in the engine. It only bites where the adapter can express the
claim; on a format that cannot, the flag is refused rather than silently
passing on everything."
```

---

### Task 8: The conformance suite

This is what makes a fourth format cost a parser and nothing more.

**Files:**
- Create: `packages/core/src/conformance.ts`
- Create: `packages/openspec-guard/src/openspec/conformance.test.ts`

**Interfaces:**
- Consumes: `SpecFormat` from Task 5.
- Produces: `describeFormatConformance(format: SpecFormat, fixtures: FormatFixture[]): void`.

- [ ] **Step 1: Write the suite itself**

Create `packages/core/src/conformance.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ParsedCriterion, SpecFormat } from './format.js';

export interface FormatFixture {
  name: string;
  /** The spec file's exact source. */
  source: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  capability: string;
  /** Exactly what the adapter must produce, in order. */
  expected: ParsedCriterion[];
}

/**
 * The invariants every adapter owes the core. An adapter that passes this can
 * be added without touching a line of the engine.
 */
export function describeFormatConformance(
  format: SpecFormat,
  fixtures: readonly FormatFixture[],
): void {
  describe(`${format.name} conformance`, () => {
    it('declares its own prefix among the ones it accepts', () => {
      expect(format.acceptedPrefixes).toContain(format.annotationPrefix);
    });

    it('offers at least one default spec root', () => {
      expect(format.defaultSpecRoots.length).toBeGreaterThan(0);
    });

    for (const fixture of fixtures) {
      describe(fixture.name, () => {
        it('produces exactly the expected criteria, in order', () => {
          const parsed = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          expect(parsed.criteria).toEqual(fixture.expected);
        });

        it('reports paths relative to cwd with POSIX separators', () => {
          const parsed = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          for (const criterion of parsed.criteria) {
            expect(criterion.file).not.toMatch(/^\//);
            expect(criterion.file).not.toContain('\\');
          }
        });

        it('reports 1-based line numbers that exist in the source', () => {
          const lineCount = fixture.source.split('\n').length;
          const parsed = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          for (const criterion of parsed.criteria) {
            expect(criterion.line).toBeGreaterThanOrEqual(1);
            expect(criterion.line).toBeLessThanOrEqual(lineCount);
          }
        });

        it('is a pure function of its input', () => {
          const once = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          const twice = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          expect(twice).toEqual(once);
        });

        it('normalises CRLF to the same result as LF', () => {
          const lf = format.parse({
            source: fixture.source,
            file: fixture.file,
            capability: fixture.capability,
          });
          const crlf = format.parse({
            source: fixture.source.replace(/\n/g, '\r\n'),
            file: fixture.file,
            capability: fixture.capability,
          });
          expect(crlf).toEqual(lf);
        });
      });
    }
  });
}
```

- [ ] **Step 2: Export it from the core**

Add to `packages/core/src/index.ts`:

```ts
export { describeFormatConformance, type FormatFixture } from './conformance.js';
export {
  type AnnotationTarget,
  type ParseInput,
  type ParsedCriterion,
  type ParsedDocument,
  type ParseWarning,
  type SpecFormat,
} from './format.js';
```

- [ ] **Step 3: Turn it on for OpenSpec**

Create `packages/openspec-guard/src/openspec/conformance.test.ts`:

```ts
import { describeFormatConformance, type FormatFixture } from '@spec-guard/core';

import { openSpecFormat } from './format.js';

const SIGN_UP = `# Account

## ADDED Requirements

### Requirement: Sign up

The system lets a visitor create an account.

#### Scenario: Sign up with a valid email

- **WHEN** a visitor submits a valid email
- **THEN** the system creates the user
`;

const fixtures: FormatFixture[] = [
  {
    name: 'a single added requirement with one scenario',
    source: SIGN_UP,
    file: 'openspec/specs/account/spec.md',
    capability: 'account',
    expected: [
      {
        capability: 'account',
        requirement: 'Sign up',
        scenario: 'Scenario: Sign up with a valid email',
        file: 'openspec/specs/account/spec.md',
        line: 9,
        isNamedScenario: true,
        bodyLines: [
          '- **WHEN** a visitor submits a valid email',
          '- **THEN** the system creates the user',
        ],
        annotationLines: [
          { text: '- **WHEN** a visitor submits a valid email', line: 11 },
          { text: '- **THEN** the system creates the user', line: 12 },
        ],
        claimedDone: null,
        excluded: false,
        meta: { operation: 'added' },
      },
    ],
  },
];

describeFormatConformance(openSpecFormat, fixtures);
```

The `line` numbers and the `annotationLines` shape above are a first guess.
Run the test, read the actual values from the failure output, and correct the
fixture to match. Correcting the fixture is right here: the existing parser's
behaviour is the specification, and this test is pinning it, not changing it.

- [ ] **Step 4: Write the OpenSpec SpecFormat object**

Create `packages/openspec-guard/src/openspec/format.ts`:

```ts
import {
  writeSelector,
  type AnnotationTarget,
  type ParseInput,
  type ParsedDocument,
  type SpecFormat,
} from '@spec-guard/core';

import { parseDocument } from './parse.js';

export const openSpecFormat: SpecFormat = {
  id: 'openspec',
  name: 'OpenSpec',
  annotationPrefix: 'openspec-guard',
  acceptedPrefixes: ['openspec-guard', 'spec-guard'],
  defaultSpecRoots: ['openspec/specs', 'specs'],
  parse(input: ParseInput): ParsedDocument {
    return parseDocument(input);
  },
  async writeAnnotation(target: AnnotationTarget, selector: string): Promise<void> {
    await writeSelector(target, selector, 'openspec-guard');
  },
};
```

`writeSelector` must be exported from the core for that import to resolve.
Check its real name and signature first with
`grep -n "^export" packages/core/src/link/edit.ts`, then add it to
`packages/core/src/index.ts`. If it does not already take the written prefix as
a parameter, add one: the core writes whichever prefix the calling adapter
declares.

- [ ] **Step 5: Run the conformance suite**

```bash
pnpm build && pnpm --filter openspec-guard test -- conformance.test.ts
```

Expected: passes once the fixture matches the parser's real output.

- [ ] **Step 6: Run everything**

```bash
pnpm lint && pnpm format && pnpm typecheck && pnpm build && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(core): a conformance suite every adapter must pass

Pins what an adapter owes the engine: exact criteria in order, relative POSIX
paths, real 1-based lines, purity, and CRLF read the same as LF. Adding a
format is now writing a parser and turning this on."
```

---

### Task 9: The Action learns a format input

**Files:**
- Modify: `packages/openspec-guard/action.yml`
- Modify: `packages/openspec-guard/src/action/inputs.ts`
- Modify: `packages/openspec-guard/src/action/main.ts`

**Interfaces:**
- Consumes: `openSpecFormat` from Task 8.
- Produces: an Action whose behaviour with no `format` input is byte for byte
  what it was at 0.2.0.

- [ ] **Step 1: Write the failing test**

In the file that tests `src/action/inputs.ts` (find it with
`ls packages/openspec-guard/src/action/`), add:

```ts
it('defaults the format to openspec so existing workflows do not move', () => {
  expect(readInputs({}).format).toBe('openspec');
});

it('refuses a format this binary does not implement', () => {
  expect(() => readInputs({ 'INPUT_FORMAT': 'bmad' })).toThrow(/openspec/);
});
```

Match the real input-reading function name and its environment variable
convention.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter openspec-guard test -- action
```

Expected: FAIL, `format` is not read.

- [ ] **Step 3: Add the input**

In `packages/openspec-guard/action.yml`, after `working-directory`:

```yaml
  format:
    description: 'Spec format. This action implements openspec.'
    required: false
    default: openspec
```

Also update the top-level `name:` and `description:` to say `spec-guard` rather
than `openspec-guard`, since the action now names its format in an input.

- [ ] **Step 4: Read and validate it**

In `src/action/inputs.ts`, read `format`, default it to `openspec`, and throw
`SpecGuardError('E_OPTION', ...)` for any other value, naming what this binary
implements.

- [ ] **Step 5: Rebuild the Action bundle**

```bash
pnpm --filter openspec-guard build
git status --short packages/openspec-guard/action-dist
```

Expected: the bundle changed. It is committed, so it must be staged.

- [ ] **Step 6: Run the tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(action): a format input, defaulting to openspec

Existing workflows keep their exact behaviour: no input means openspec. One
action serves the family rather than one action per package at a subdirectory
path, which would have broken every current consumer."
```

---

### Task 10: Per-package release, the trusted publisher entry, and 0.3.0

Nothing here is reversible by us alone, so the order matters and the npmjs.com
step is Guillaume's.

**Files:**
- Delete: `.github/workflows/release.yml`
- Create: `.github/workflows/release-openspec-guard.yml`
- Modify: `packages/openspec-guard/package.json` (version 0.3.0)

**Interfaces:**
- Consumes: a green gate from Task 9.
- Produces: `openspec-guard@0.3.0` on npm with provenance.

- [ ] **Step 1: Write the per-package release workflow**

Create `.github/workflows/release-openspec-guard.yml` from the existing
`release.yml`, with four changes and nothing else:

- the tag filter becomes `tags: ['openspec-guard@*.*.*']`, so each package
  releases on its own tag and a version bump in one never publishes another;
- every `pnpm` script call becomes `pnpm --filter openspec-guard <script>`;
- the manifest read becomes
  `node -p "require('./packages/openspec-guard/package.json').version"`, and the
  tag comparison strips the `openspec-guard@` prefix rather than `v`;
- the publish step runs in the package directory:
  `working-directory: packages/openspec-guard`.

Keep every comment from the original. They record why there is no token, why
the registry is asked before publishing, and why the npm version is checked.

- [ ] **Step 2: Delete the old workflow**

```bash
git rm .github/workflows/release.yml
```

The moving `v0` tag that the Action is consumed through keeps working: it is a
git tag, unaffected by which workflow file exists.

- [ ] **Step 3: Bump the version**

In `packages/openspec-guard/package.json`, set `"version": "0.3.0"`.

- [ ] **Step 4: Run the full gate one last time**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm format && pnpm typecheck && pnpm build && pnpm test
```

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore(release): one release workflow per package, openspec-guard 0.3.0

Each package releases on its own tag, so a version bump in one can never
publish another."
git push origin main
```

- [ ] **Step 6: Stop. Guillaume repairs the trusted publisher entry**

Do not push a tag yet. Tell him, in these terms:

"`openspec-guard`'s trusted publisher entry on npmjs.com still points at the
old repository name and at `release.yml`. Both moved. Until you update it to
repository `guillaume-flambard/spec-guard` and workflow
`release-openspec-guard.yml`, the publish will fail with an authentication
error and nothing will say why beforehand: your own comment in the workflow
records that npm does not validate that entry when it is saved. Tell me when it
is done."

Wait for his confirmation before the next step.

- [ ] **Step 7: Cut the release**

```bash
git tag openspec-guard@0.3.0
git push origin openspec-guard@0.3.0
gh run watch
```

- [ ] **Step 8: Prove it published**

```bash
npm view openspec-guard version
npm view openspec-guard dist-tags
```

Expected: `0.3.0`.

- [ ] **Step 9: Move the moving major tag**

```bash
git tag -f v0
git push -f origin v0
```

This is what `guillaume-flambard/spec-guard@v0` resolves to for Action
consumers. The release workflow deliberately does not fire on it.

---

## What plan 1 does not do

- `aidd-guard` stays parked and unbuilt. Plan 2 ports it onto the core, renames
  its `location` field to the core's `source`, removes the exclusion line from
  `pnpm-workspace.yaml`, retries the bare npm name, deprecates
  `@zoanlogia/aidd-guard` toward it, and archives the old GitHub repository
  once the new package is published.
- `spec-kit-guard` does not exist yet. Plan 3 writes the adapter, runs it
  against a real Spec Kit repository, and only then writes the catalogue
  submission issue.
- Nothing is contributed upstream to `github/spec-kit`.
