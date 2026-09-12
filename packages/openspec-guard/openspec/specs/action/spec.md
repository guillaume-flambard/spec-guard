# action Specification

## Purpose

The GitHub Action: the same check, surfaced where a reviewer already is.

## Requirements

### Requirement: Inputs are read the way the runner sends them

The system SHALL read inputs from `INPUT_<NAME>` environment variables,
uppercased with spaces turned into underscores and hyphens kept, and SHALL take
its working directory from the workspace.

#### Scenario: The working directory comes from the workspace

<!-- openspec-guard:test="takes its working directory from the workspace" -->

- **WHEN** no working directory is given
- **THEN** the checkout directory is used

#### Scenario: A directory inside the workspace

<!-- openspec-guard:test="resolves working-directory against the workspace" -->

- **WHEN** `working-directory` names a subdirectory
- **THEN** it is resolved against the workspace

#### Scenario: A hyphenated input name

<!-- openspec-guard:test="maps kebab-case inputs to their environment names" -->

- **WHEN** an input name contains a hyphen
- **THEN** it is read, because the runner keeps hyphens and only replaces spaces

#### Scenario: The coverage floor as an input

<!-- openspec-guard:test="reads the coverage floor" -->

- **WHEN** the coverage floor is given as an input
- **THEN** it is read as a number and applied

#### Scenario: A list input

<!-- openspec-guard:test="splits a list input on commas and newlines" -->

- **WHEN** a list input is given on several lines or separated by commas
- **THEN** every entry is read

#### Scenario: An input left unset

<!-- openspec-guard:test="treats an unset input as absent, not as an empty string" -->

- **WHEN** an input is blank
- **THEN** it is treated as absent rather than as an empty value

#### Scenario: An input that is not a boolean

<!-- openspec-guard:test="refuses a boolean that is neither true nor false" -->

- **WHEN** a boolean input reads something else
- **THEN** the run stops rather than guessing

#### Scenario: An input outside its vocabulary

<!-- openspec-guard:test="refuses an unknown runner, verdict or format" -->

- **WHEN** an input names a runner, verdict or format that does not exist
- **THEN** the run stops

### Requirement: Uncovered scenarios are annotated where the reviewer is

The system SHALL emit one annotation per actionable criterion, on the spec file
and line, SHALL use an error for a failure and a warning for an uncertain, and
SHALL say nothing about what passes or what a baseline has frozen.

#### Scenario: A failing criterion

<!-- openspec-guard:test="emits an error per failing criterion, with file and line" -->

- **WHEN** a criterion fails
- **THEN** an error annotation names its file, its line and what to do

#### Scenario: An uncertain criterion

<!-- openspec-guard:test="emits a warning, not an error, for uncertain" -->

- **WHEN** a criterion is uncertain
- **THEN** the annotation is a warning

#### Scenario: What already passes

<!-- openspec-guard:test="says nothing about passes and skips" -->

- **WHEN** every criterion passes
- **THEN** no annotation is emitted

#### Scenario: Frozen debt on a pull request

<!-- openspec-guard:test="stays silent on frozen debt, or every pull request carries hundreds" -->

- **WHEN** the failing criteria are all frozen by a baseline
- **THEN** none of them is annotated

#### Scenario: More failures than annotations allowed

<!-- openspec-guard:test="caps the list and says how many it left out" -->

- **WHEN** there are more actionable criteria than the cap
- **THEN** the rest are counted in a notice rather than dropped silently

#### Scenario: A message containing a comma or a newline

<!-- openspec-guard:test="escapes newlines and commas, which would otherwise end the command early" -->

- **WHEN** a scenario name or a path holds a comma or a newline
- **THEN** it is escaped, because either would end the workflow command early

#### Scenario: How many annotations a reviewer actually sees

<!-- openspec-guard:non-testable reason="GitHub decides how many annotations it renders per step; nothing in this repository can observe that" -->

- **WHEN** a step emits more annotations than GitHub renders
- **THEN** the summary remains the complete account

### Requirement: The job summary is the complete account

The system SHALL write a table of the verdicts, say how the passes were earned,
and list the gate violations when there are any.

#### Scenario: The summary of a clean run

<!-- openspec-guard:test="reports the counts and how the passes were earned" -->

- **WHEN** a run succeeds
- **THEN** the summary holds the counts and the split between selector and similarity

#### Scenario: The coverage in the summary

<!-- openspec-guard:test="states the coverage percentage" -->

- **WHEN** a summary is written
- **THEN** it states the percentage and the number of criteria it was computed over

#### Scenario: A run that violates a gate

<!-- openspec-guard:test="lists the gate violations when there are any" -->

- **WHEN** a gate is violated
- **THEN** the summary lists the violations

#### Scenario: A run where nothing passes

<!-- openspec-guard:test="says plainly when nothing passes" -->

- **WHEN** no criterion passes
- **THEN** the summary says so plainly rather than printing an empty boast

### Requirement: The step reports through outputs and exit codes

The system SHALL expose the counts as outputs in the format the runner reads,
SHALL turn the step red on a violated gate, and SHALL report a faulty input as
an annotation rather than a stack trace.

#### Scenario: A clean repository

<!-- openspec-guard:test="exits zero and writes a summary on a clean repository" -->

- **WHEN** every criterion passes
- **THEN** the step exits zero, writes its summary and writes its outputs

#### Scenario: A violated gate turns the step red

<!-- openspec-guard:test="exits one and turns the step red when a gate is violated" -->

- **WHEN** a gate is violated
- **THEN** the step exits one and emits an error annotation

#### Scenario: An output value that could break the file

<!-- openspec-guard:test="uses the delimiter form, so a value can never break the file" -->

- **WHEN** outputs are written
- **THEN** the delimiter form is used, so no value can corrupt the ones after it

#### Scenario: A faulty input

<!-- openspec-guard:test="reports a bad input as an annotation, and exits two" -->

- **WHEN** an input is invalid
- **THEN** the step annotates the problem and exits two

#### Scenario: Broken directives in the specs

<!-- openspec-guard:test="annotates every annotation error on its own line" -->

- **WHEN** the specs hold two broken directives
- **THEN** each is annotated on its own line

#### Scenario: A repository with no spec at all

<!-- openspec-guard:test="reports a missing spec root rather than crashing" -->

- **WHEN** the spec root holds no spec
- **THEN** the step annotates the reason rather than printing a stack trace

#### Scenario: A runner that named no summary file

<!-- openspec-guard:test="writes nothing to a file the runner did not name" -->

- **WHEN** the environment names no summary or output file
- **THEN** nothing is written anywhere

#### Scenario: Asking for the document in the log

<!-- openspec-guard:test="can be told to log the JSON document instead of the table" -->

- **WHEN** the format input asks for JSON
- **THEN** the log holds the document

#### Scenario: Turning both surfaces off

<!-- openspec-guard:test="can be told to stay quiet" -->

- **WHEN** annotations and summary are both disabled
- **THEN** neither is produced
