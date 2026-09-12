# spec-parsing Specification

## Purpose

Reading OpenSpec markdown into requirements and scenarios, following the
official format rather than a convenient subset.

## Requirements

### Requirement: Requirements are read only from a requirements section

The system SHALL read requirements under `## Requirements` and under the delta
sections `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`, and SHALL NOT read a
requirement declared anywhere else.

#### Scenario: A base spec

<!-- openspec-guard:test="reads requirements and scenarios of a base spec" -->

- **WHEN** a spec has a purpose and a requirements section
- **THEN** its requirements and scenarios are read with their line numbers

#### Scenario: Prose from another section stays there

<!-- openspec-guard:test="does not leak prose from outside the requirements section" -->

- **WHEN** a spec has a `## Purpose` before its requirements
- **THEN** that prose never becomes part of a requirement statement

#### Scenario: Each delta section carries its operation

<!-- openspec-guard:test="reads each delta section with its operation" -->

- **WHEN** a change spec holds ADDED, MODIFIED, REMOVED and RENAMED sections
- **THEN** every requirement carries the operation of its section

#### Scenario: A requirement outside any section

<!-- openspec-guard:test="ignores a requirement declared outside any requirements section" -->

- **WHEN** a requirement heading appears under `## Purpose`
- **THEN** it is ignored and a warning says so

### Requirement: Every fourth-level heading under a requirement is a scenario

The system SHALL treat every `####` heading under a requirement as a scenario,
not only those named `Scenario:`, because that is what the official parser does.
It SHALL record which form was used so the anomaly is visible.

#### Scenario: A heading that is not named Scenario

<!-- openspec-guard:test="treats a non-Scenario #### heading as a scenario, and flags it" -->

- **WHEN** a requirement contains `#### Notes`
- **THEN** it becomes a criterion, flagged as not a named scenario

#### Scenario: A scenario before any requirement

<!-- openspec-guard:test="warns about a scenario found before any requirement" -->

- **WHEN** a `####` heading appears with no requirement above it
- **THEN** it is ignored and a warning says so

### Requirement: The body of a scenario survives intact

The system SHALL keep the bullets of a scenario, including indented
continuation lines, and SHALL NOT read a heading that sits inside a fenced code
block.

#### Scenario: An indented continuation line

<!-- openspec-guard:test="keeps indented continuation lines in the scenario body" -->

- **WHEN** a THEN bullet wraps onto an indented second line
- **THEN** both lines belong to the scenario body

#### Scenario: A heading inside a code fence

<!-- openspec-guard:test="ignores headings inside a fenced code block" -->

- **WHEN** an example in a fence contains a scenario heading
- **THEN** it is content, not structure

#### Scenario: Windows line endings

<!-- openspec-guard:test="accepts CRLF input" -->

- **WHEN** a spec uses CRLF
- **THEN** it parses identically and no carriage return survives in the body

#### Scenario: Accents are displayed, so they are preserved

<!-- openspec-guard:test="preserves accents in names" -->

- **WHEN** a requirement or scenario name carries accents
- **THEN** they are preserved exactly

### Requirement: An odd spec is reported, not rejected

The system SHALL emit warnings for structural oddities and SHALL still return
what it could read, because a spec that is odd is still worth checking. Only
annotation problems stop a run.

#### Scenario: A requirement with no scenario

<!-- openspec-guard:test="warns about a requirement without any scenario" -->

- **WHEN** a requirement has no scenario at all
- **THEN** a warning names it and the run continues

#### Scenario: A file with no requirements section

<!-- openspec-guard:test="warns when no requirements section exists at all" -->

- **WHEN** a spec file has no requirements section
- **THEN** a warning says so

#### Scenario: A requirement heading missing its colon

<!-- openspec-guard:test="warns about a requirement heading missing its colon, and still reads it" -->

- **WHEN** a heading reads `### Requirement A`
- **THEN** it is read anyway and a warning names the form
