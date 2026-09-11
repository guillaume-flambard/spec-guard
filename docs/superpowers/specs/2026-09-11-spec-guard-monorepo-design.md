# spec-guard: one engine, one adapter per spec format

Date: 2026-09-11
Status: proposed, awaiting review

## The problem

Two published packages do the same job against two spec formats:

| repository | npm name | downloads, last 30 days |
| --- | --- | --- |
| `guillaume-flambard/openspec-guard` (local dir `apps/spec-guard`) | `openspec-guard` 0.2.0 | 258 |
| `guillaume-flambard/aidd-guard` | `@zoanlogia/aidd-guard` 0.1.0 | 0 |

The second is a fork of the first, and the two have drifted. Measured on
2026-09-11:

| file | lines that differ |
| --- | --- |
| `src/cli.ts` | about 335 of 405 |
| `src/commands/check.ts` | about 75 |
| `src/discovery.ts` | about 70 |
| `src/verdict.ts` | about 32 |
| `src/matching/match.ts` | about 10 |

Only the parsing directory changes name: `src/openspec/` against `src/aidd/`.
Everything else is the same program written twice.

A third format is wanted (GitHub Spec Kit) and a fourth is foreseen (BMAD).
Without a shared core that is three, then four, forks to maintain.

## What already exists in this space

Checked before committing to the work, not after.

**SpecTest**, a Spec Kit community extension, v1.0.0, MIT
(https://speckit-community.github.io/extensions/spectest). It maps acceptance
criteria to existing tests deterministically, without an LLM, without running
the tests, for Jest and Vitest. It calls itself "the missing testing layer in
the SDD workflow".

**SpecDrive** (`specdrive-cli` on npm, 513 downloads in the same 30 days)
migrates specs from both OpenSpec and Spec Kit and advertises
"complete requirement-to-test traceability" and a "deterministic governance
validator".

**V-Model Extension Pack** (`leocamello/spec-kit-v-model`) generates a
"deterministic traceability matrix".

The slice is occupied. The defensible difference is narrow and real: SpecTest
pairs by heuristic, with three confidence levels it documents as
"Strong (explicit reference), Medium (keyword match), Weak (file name match)".
spec-guard pairs on an explicit selector compared exactly, and has no Medium.
A keyword that matches by accident is a coverage number that lies. With
`--fail-on fail,uncertain`, a baseline that can never be raised, and a JSON
report whose bytes are stable across runs, spec-guard is a gate rather than a
map.

SpecTest finds gaps and scaffolds tests. spec-guard refuses a build. These are
different jobs that happen to read the same files. The README and the catalogue
submission say so explicitly rather than pretending the other tool is absent.

## Architecture

### The seam

Ten steps run today. One is specific to the spec format:

| step | format specific |
| --- | --- |
| read specs into `Criterion[]` | yes |
| write the annotation back into the spec file (`link`) | yes |
| default spec root and glob | yes |
| discover test files | no |
| read Vitest and Jest test titles into `TestTitle[]` | no |
| pair `Criterion` with `TestTitle` | no |
| verdict and summary | no |
| JSON and terminal reports | no |
| baseline and `--min-coverage` ratchet | no |
| CLI skeleton and GitHub Action | no |

So the adapter contract is small:

```ts
export interface SpecFormat {
  /** Open on purpose: a fourth format must not require editing the core. */
  readonly id: string;
  readonly name: string;
  /** Written prefix for this binary's annotations, e.g. `openspec-guard`. */
  readonly annotationPrefix: string;
  /** Tried in order when `--specs` is absent. */
  readonly defaultSpecRoots: readonly string[];
  readonly defaultDocGlobs: readonly string[];
  parse(input: ParseInput): ParseResult;
  writeAnnotation(target: AnnotationTarget, selector: string): Promise<void>;
}
```

`src/types.ts` already carries the comment "A SpecGuard extension, never
OpenSpec syntax". The seam was seen; this cuts it.

### Package layout

```
spec-guard/
  packages/
    core/             @spec-guard/core     private
    openspec-guard/   openspec-guard       bare name, already published
    aidd-guard/       aidd-guard           bare name, free on the registry
    spec-kit-guard/   spec-kit-guard       bare name, free on the registry
```

`core` stays private. Publishing it commits us to a public API for a
third-party adapter author who does not exist yet.

All four bare names returned 404 from the npm registry on 2026-09-11, so
`aidd-guard`, `spec-kit-guard` and `bmad-guard` are available. `aidd-guard`
was published under `@zoanlogia` because a commit records that npm refused the
bare name at the time; npm's similarity filter may have moved, so the bare name
is retried at publish time and the scoped package is deprecated toward the new
one only if that succeeds. It has no users to break.

## Reconciling the drift

The divergence is not symmetric, which removes the need to vote line by line.

`openspec-guard` is ahead on the engine. It has the whole `baseline.ts` module
(`diffBaseline`, `staleEntries`, the `--min-coverage` ratchet), which
`aidd-guard` does not have at all, and it parses arguments with `parseArgs`
from `node:util` in strict mode where `aidd-guard` uses a hand-written parser.
Both codebases carry a comment explaining that an unknown flag must raise
rather than be swallowed; the standard library does that without a parser to
maintain.

`aidd-guard` is ahead on ideas. It has `--require-selector`, and it has
`--fail-claimed`: a ticked checkbox with no test behind it fails. That is the
best concept in either repository and it does not exist on the OpenSpec side.

**Rule: the core takes the openspec-guard engine and absorbs the aidd-guard
ideas.** One direction, not a per-line vote.

### Consequences

**1. `--fail-claimed` is format dependent.** AIDD has checkboxes. OpenSpec does
not, and Spec Kit does not either (`FR-###` and `SC-###` carry no tick). So
`Criterion` gains an optional `claimedDone?: boolean` that the adapter fills,
and the flag only bites where the adapter fills it. Everywhere else it is
refused with a sentence saying why, never silently ignored.

**2. `operation: DeltaOperation` leaves the shared schema.** The values
`base | added | modified | removed | renamed` are OpenSpec delta vocabulary. It
becomes adapter metadata, opaque to the core, surfaced in the report under a
per-format key.

**3. `source` wins over `location`.** The same field is `left.source.file` in
one repository and `left.location.file` in the other. `source` is in the
published JSON contract of the only package with users.

**4. Both repositories export `SCHEMA_VERSION = 1` with incompatible field
sets.** A consumer reading `"schemaVersion": 1` cannot tell which shape it
holds. The unified schema is version **2** and gains a `format` field naming
the adapter that produced it. `openspec-guard` ships this as **0.3.0** with a
changelog entry. `aidd-guard` has nothing to break.

**5. Each binary writes its own annotation prefix; the core reads all of
them.** `openspec-guard` keeps writing `<!-- openspec-guard:test="..." -->`,
`spec-kit-guard` writes `<!-- spec-kit-guard:test="..." -->`. Unifying the
written prefix would force existing users to rewrite comments that work today,
for cosmetics.

## Repository and history

`guillaume-flambard/openspec-guard` is renamed to
`guillaume-flambard/spec-guard` and becomes the monorepo. GitHub keeps
redirecting the old path, so existing clones, `uses:` references and npm
`repository` links keep resolving.

`aidd-guard` is brought in with `git subtree add --prefix=packages/aidd-guard`,
which preserves its history under the new path. Its GitHub repository is
**archived**, not deleted, with a README line pointing at the monorepo.

Both working trees are clean and on `main` as of 2026-09-11, so nothing is at
risk of being lost in the move.

### The operational risk, stated plainly

`release.yml` publishes with no token, through npm trusted publishing over
OIDC. Its own comment records that the matching entry on npmjs.com is not
validated when saved, so a mistake there only ever surfaces at publish time.

That entry is bound to the repository **and** to the workflow file path. This
change does both of the things that break it:

- the repository is renamed, and
- one `release.yml` becomes one release workflow per package.

So the trusted publisher entry on npmjs.com must be updated for
`openspec-guard` before any tag is pushed, and created for each new package
before its first publish. A first publish cannot use trusted publishing at all;
a commit in `aidd-guard` already records that lesson
(`a00a45c docs: the first publish cannot use trusted publishing, and here is
the proof`).

Order of operations, so nothing publishes into a broken state:

1. Rename the repository, merge the subtree, restructure, land the code.
2. Update the npmjs.com trusted publisher entry for `openspec-guard` to the new
   repository name and the new workflow path.
3. Cut `openspec-guard@0.3.0` and confirm the publish succeeded.
4. Only then, first-publish the new packages and configure their entries.

### The GitHub Action

The root `action.yml` is consumed today as
`guillaume-flambard/openspec-guard@v0`. It gains a `format` input defaulting to
`openspec`, so existing workflows keep their exact behaviour and the same
action serves all three formats. No second action at a subdirectory path, and
no broken consumers.

## Testing

Each package keeps its own tests. The shared suites (`matching`, `normalize`,
`verdict`, `criteria`, `baseline`) move to `core` with them.

The piece that makes a fourth format cheap is a **conformance suite** in
`core`: a set of fixture spec files per format with the exact `Criterion[]`
each must produce, plus the invariants every adapter owes the core (stable ids,
paths relative to cwd with POSIX separators, results sorted by file then line
then id, no timestamp or absolute path anywhere). Adding BMAD then means
writing a parser and turning the suite on.

The repository keeps dogfooding itself: its own specs are OpenSpec, so
`pnpm spec:check` keeps running `openspec-guard` against `openspec/specs` and
gating the build.

## The Spec Kit adapter

Format, from `templates/spec-template.md` in `github/spec-kit`: acceptance
scenarios written as `**Given** [state], **When** [action], **Then** [outcome]`
under `User Story [#] - [Title] (Priority: [P1/P2/P3])`, functional
requirements as `**FR-###**: System MUST [capability]`, success criteria as
`**SC-###**: [metric]`. Artifacts live under `specs/`.

Spec Kit itself installs through Python and uv (`uv run specify`), not npm.
That does not block anything: the specs are markdown, and `spec-kit-guard`
stays an npm binary that reads them. It only serves Spec Kit projects whose
tests are Vitest or Jest, and the README says so rather than implying broader
coverage.

### Distribution

`CONTRIBUTING.md` in `github/spec-kit` states that third-party extensions are
submitted through an **Extension submission issue**, and explicitly not by
editing `extensions/catalog.community.json` in a pull request. Submissions
trigger automated validation. Contributors must disclose AI assistance and
provide evidence-backed changes with regression tests, judged on seven
dimensions including real-world evidence and cost/benefit.

So the catalogue submission is written only once `spec-kit-guard` has run
against a real Spec Kit repository and can show a result, and the full
contribution rules are read in place before submitting.

### Issue 3752, deliberately out of scope for now

`github/spec-kit#3752` reports that `/speckit.converge` can declare convergence
without enumerating per-criterion coverage. It is open, labelled
`severity-high`, assigned to a maintainer. PR #3754 by `cadugevaerd` claims to
close it; as of 2026-09-11 that PR is open with changes requested, and the
maintainer set a 5 August 2026 deadline after which he would take the work
over. That deadline passed five weeks ago.

The gap is real and it is the same gap spec-guard fills, but the upstream fix
has an owner and a stalled PR. Acting on it is a separate decision, taken after
the adapter exists and after reading what that repository currently accepts.

## Out of scope

- Publishing `@spec-guard/core`.
- A BMAD adapter. The conformance suite is built so it costs a parser, and
  nothing more, when it is wanted.
- Any change to the matching algorithm itself.
- Any code contribution to `github/spec-kit`, the fix for issue 3752 included.
  The catalogue submission is in scope, but it is written only after the
  adapter has produced a result on a real repository.

## Success criteria

- `openspec-guard@0.3.0` publishes from the renamed repository and its CLI
  behaves exactly as 0.2.0 did, minus the documented schema bump.
- `aidd-guard` and `spec-kit-guard` publish under bare names and pass the same
  conformance suite as `openspec-guard`.
- No parsing logic is duplicated between packages.
- The existing GitHub Action keeps working unchanged for current consumers.
