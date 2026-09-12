# baseline Specification

## Purpose

Letting a repository that already has hundreds of uncovered scenarios turn the
gate on today, by freezing what exists and failing only on what is new.

## Requirements

### Requirement: Writing a baseline records reality, whatever it is

The system SHALL, under `--update-baseline`, write every uncovered criterion to
a file and exit zero, SHALL NOT record a pass or a skip as debt, and SHALL NOT
fail a gate while doing it, because recording is maintenance and not a check.

#### Scenario: Freezing an uncovered repository

<!-- openspec-guard:test="freezes what is uncovered, and nothing else" -->

- **WHEN** a repository with an uncovered scenario is frozen
- **THEN** the file holds that criterion, with its verdict and its reason

#### Scenario: A covered repository

<!-- openspec-guard:test="never records a pass or a skip as debt" -->

- **WHEN** every criterion passes or is declared non-testable
- **THEN** the baseline is empty

#### Scenario: Freezing with a gate configured

<!-- openspec-guard:test="exits zero even when a gate would have failed" -->

- **WHEN** a gate is set and the run writes a baseline
- **THEN** the run exits zero

#### Scenario: What changed since last time

<!-- openspec-guard:test="reports what it added and what it dropped" -->

- **WHEN** a baseline is rewritten
- **THEN** the run reports what it added and what it dropped

### Requirement: A baseline is a reviewable file

The system SHALL write sorted entries with no clock and no absolute path, so
the file diffs cleanly in a pull request and does not depend on the machine
that wrote it.

#### Scenario: Two writes of the same repository

<!-- openspec-guard:test="writes the same bytes twice" -->

- **WHEN** the same repository is frozen twice
- **THEN** the two files are byte for byte identical

#### Scenario: Nothing in it belongs to one machine

<!-- openspec-guard:test="carries no clock and no absolute path" -->

- **WHEN** a baseline is written
- **THEN** it holds no timestamp and no absolute path

### Requirement: A baseline hides old debt, and only old debt

The system SHALL let a gate pass on criteria the baseline lists, SHALL leave
their verdicts untouched in the report, and SHALL fail on anything the baseline
does not cover.

#### Scenario: The gate looks away from frozen debt

<!-- openspec-guard:test="lets a gate pass on frozen debt" -->

- **WHEN** every failing criterion is listed in the baseline
- **THEN** the gate passes while the report still says they failed

#### Scenario: A scenario added after the freeze

<!-- openspec-guard:test="fails on a scenario added after the freeze" -->

- **WHEN** a new scenario is written with no test
- **THEN** the gate fails on it alone

#### Scenario: A failure that changes kind

<!-- openspec-guard:test="stops suppressing when the failure changes kind" -->

- **WHEN** a criterion frozen with no candidate now carries a selector matching nothing
- **THEN** it is no longer suppressed, because that is a fresh mistake

#### Scenario: A rewritten scenario

<!-- openspec-guard:test="stops suppressing when the scenario text is rewritten" -->

- **WHEN** the text of a frozen scenario is edited
- **THEN** it is checked again, which is the right moment to ask about its test

#### Scenario: An entry that no longer matches anything

<!-- openspec-guard:test="reports an entry that has been fixed, so the file can be pruned" -->

- **WHEN** a frozen criterion is fixed
- **THEN** the stale entry is reported so the file can be pruned

### Requirement: A baseline that cannot be read stops the run

The system SHALL refuse a baseline that is missing, malformed, or of another
schema version, rather than continuing with an empty one, because a typo in the
path would otherwise fail a build for reasons nobody can see.

#### Scenario: The path is wrong

<!-- openspec-guard:test="refuses a baseline that does not exist" -->

- **WHEN** `--baseline` names a file that does not exist
- **THEN** the run stops

#### Scenario: The file is not JSON

<!-- openspec-guard:test="refuses a baseline that is not valid JSON" -->

- **WHEN** the file is corrupt
- **THEN** the run stops

#### Scenario: The file is from another version

<!-- openspec-guard:test="refuses a baseline from another schema version" -->

- **WHEN** the schema version is not the one this release writes
- **THEN** the run stops and asks for a regeneration
