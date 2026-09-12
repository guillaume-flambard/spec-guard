# verdicts Specification

## Purpose

Turning a match into a verdict, and deciding whether a run fails a build.

## Requirements

### Requirement: A skipped test is a failure with a name, never a skip

The system SHALL reserve the `skip` verdict for a scenario declared
non-testable, and SHALL report a criterion matched only by a skipped test as a
failure of its own kind.

#### Scenario: The only matching test is skipped

<!-- openspec-guard:test="matchCriterion, similarity > never counts a skipped test as coverage" -->

- **WHEN** the best candidate is a skipped test
- **THEN** the criterion fails rather than counting as covered

#### Scenario: The two are never confused

<!-- openspec-guard:test="reserves skip for non-testable, never for a skipped test" -->

- **WHEN** the verdict table is consulted
- **THEN** only `non-testable` yields a skip

### Requirement: The summary separates the asserted from the guessed

The system SHALL count passes earned by an explicit selector apart from passes
earned by similarity, because the two are not worth the same thing.

#### Scenario: A mix of both

<!-- openspec-guard:test="counts verdicts and splits pass by how it was earned" -->

- **WHEN** a run holds passes of both kinds and failures of every kind
- **THEN** each is counted in its own field

#### Scenario: The split always adds up

<!-- openspec-guard:test="always has passBySelector plus passByHeuristic equal to pass" -->

- **WHEN** any run is summarized
- **THEN** the two pass counts sum to the total number of passes

### Requirement: Coverage counts what can be covered

The system SHALL report the percentage of criteria linked to a test, over a
denominator that excludes scenarios declared non-testable, since a declared and
reasoned decision is not a gap. It SHALL NOT count an uncertain criterion as
covered, and SHALL read 100 when nothing is left to cover.

#### Scenario: A repository with passes, failures and a declared exception

<!-- openspec-guard:test="computes coverage over the criteria that can be covered" -->

- **WHEN** a repository holds passing, failing and non-testable criteria
- **THEN** the percentage is computed over everything but the non-testable ones

#### Scenario: A criterion the tool is unsure about

<!-- openspec-guard:test="does not count an uncertain criterion as covered" -->

- **WHEN** a criterion sits in the uncertain band
- **THEN** it does not count as covered

#### Scenario: Nothing left to cover

<!-- openspec-guard:test="reads 100 when there is nothing left to cover" -->

- **WHEN** every criterion is declared non-testable, or there is none at all
- **THEN** the coverage reads 100

#### Scenario: A non-testable scenario does not hold the number down

<!-- openspec-guard:test="leaves a non-testable scenario out of the coverage denominator" -->

- **WHEN** a spec holds one scenario, declared non-testable with a reason
- **THEN** a coverage floor of 100 is satisfied

### Requirement: A coverage floor reads the whole repository

The system SHALL fail when the coverage is below the floor given by
`--min-coverage`. Unlike the other gates, it SHALL read the whole repository and
not what a baseline holds back: freezing debt must never make the number go up,
or the baseline becomes a way to report something that is not true.

#### Scenario: Coverage below the floor

<!-- openspec-guard:test="fails when coverage is below the floor" -->

- **WHEN** the coverage is under the required percentage
- **THEN** the gate is violated and both numbers are named

#### Scenario: A floor set on a repository that has frozen its debt

<!-- openspec-guard:test="reads coverage on the whole repository, so a baseline never raises it" -->

- **WHEN** a baseline hides every failure and a coverage floor is set
- **THEN** the floor is measured against the repository, not against what is left

#### Scenario: Freezing debt does not move the number

<!-- openspec-guard:test="never raises the coverage number" -->

- **WHEN** a repository freezes its debt and the gate on new failures passes
- **THEN** the coverage is exactly what it was before the freeze

#### Scenario: A floor on the command line

<!-- openspec-guard:test="fails the gate on a coverage floor" -->

- **WHEN** `--min-coverage` is given
- **THEN** a repository under it fails and one at or above it passes

### Requirement: Gates are opt-in, and both apply

The system SHALL exit zero by default whatever the verdicts, SHALL fail when a
verdict named by `--fail-on` appears, SHALL fail when `--min-pass` is not
reached, and SHALL report both violations when both are broken.

#### Scenario: No gate at all

<!-- openspec-guard:test="passes when no gate is set" -->

- **WHEN** a run has failures but no gate
- **THEN** it succeeds, because it reports rather than judges

#### Scenario: A forbidden verdict appears

<!-- openspec-guard:test="fails on a forbidden verdict" -->

- **WHEN** a verdict named by the gate is present
- **THEN** the gate is violated and the count is named

#### Scenario: A forbidden verdict that never occurs

<!-- openspec-guard:test="ignores a forbidden verdict that does not occur" -->

- **WHEN** the gate names verdicts that no criterion carries
- **THEN** the gate passes

#### Scenario: Not enough passing criteria

<!-- openspec-guard:test="fails when min-pass is not reached" -->

- **WHEN** fewer criteria pass than `--min-pass` requires
- **THEN** the gate is violated

#### Scenario: Both gates broken at once

<!-- openspec-guard:test="reports both violations when both gates are broken" -->

- **WHEN** a run violates both gates
- **THEN** both violations are reported, not just the first
