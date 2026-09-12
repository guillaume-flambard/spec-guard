# discovery Specification

## Purpose

Everything that touches the filesystem: finding the spec root, walking it,
finding the test files, and turning absolute paths into portable relative ones.
No other capability reads a directory.

## Requirements

### Requirement: The spec root is found, or the run stops

The system SHALL look for `openspec/specs`, then `specs`. It SHALL NOT guess
when both exist, and SHALL NOT treat a spec root holding no `spec.md` as an
empty success, because reporting success on zero criteria is the worst failure
mode for a gate.

#### Scenario: Both candidate roots exist

<!-- openspec-guard:test="refuses to guess when both openspec/specs and specs exist" -->

- **WHEN** a repository holds both `openspec/specs` and `specs`
- **THEN** the run stops and asks for `--specs`

#### Scenario: An explicit root settles the ambiguity

<!-- openspec-guard:test="resolves the ambiguity when --specs is given" -->

- **WHEN** `--specs` names one of them
- **THEN** that one is used and nothing is guessed

#### Scenario: No spec root at all

<!-- openspec-guard:test="reports a missing spec root" -->

- **WHEN** neither candidate exists and `--specs` points nowhere
- **THEN** the run stops with a message naming what was expected

#### Scenario: A spec root that holds no spec

<!-- openspec-guard:test="refuses a spec root that holds no spec.md" -->

- **WHEN** the spec root exists but contains no `spec.md`
- **THEN** the run stops rather than reporting zero criteria as success

#### Scenario: Allowing an empty spec root on purpose

<!-- openspec-guard:test="accepts an empty spec root with --allow-empty" -->

- **WHEN** `--allow-empty` is given for the same repository
- **THEN** the run succeeds with no criteria

#### Scenario: A code root that is not a directory

<!-- openspec-guard:test="reports a --code path that is not a directory" -->

- **WHEN** `--code` points at something that is not a directory
- **THEN** the run stops with a message naming the path

### Requirement: The walk reaches every spec and prunes what is not ours

The system SHALL read `spec.md` at any depth under the spec root, SHALL derive
the capability from the path between the root and the file, and SHALL NEVER
descend into a dependency tree or a build output.

#### Scenario: Specs nested at any depth

<!-- openspec-guard:test="walks the spec root at any depth and derives the capability from the path" -->

- **WHEN** specs sit at one and two path segments under the root
- **THEN** all of them are read and each carries the capability its path implies

#### Scenario: A spec inside a dependency tree

<!-- openspec-guard:test="never reads a spec living under an excluded directory" -->

- **WHEN** a `spec.md` exists under `node_modules`
- **THEN** it is never read, because it describes somebody else's code

#### Scenario: Build output is not a source of test titles

<!-- openspec-guard:test="collects test files by the default globs, pruning build output" -->

- **WHEN** a compiled test file sits under `dist`
- **THEN** it contributes no test title

#### Scenario: Scoping the test files by hand

<!-- openspec-guard:test="honours an explicit --tests glob" -->

- **WHEN** `--tests` is given
- **THEN** only the files it matches are read

### Requirement: Change deltas are read only when asked for

The system SHALL ignore `openspec/changes` by default, SHALL read it under
`--include-changes`, and SHALL NEVER read the archive, whose changes are already
folded into the base specs.

#### Scenario: Changes are off by default

<!-- openspec-guard:test="ignores changes by default" -->

- **WHEN** a repository has changes beside its specs
- **THEN** a plain run reads none of them

#### Scenario: Changes on demand, archive never

<!-- openspec-guard:test="reads change deltas with --include-changes, but never the archive" -->

- **WHEN** `--include-changes` is given
- **THEN** live change specs are read and archived ones are not
