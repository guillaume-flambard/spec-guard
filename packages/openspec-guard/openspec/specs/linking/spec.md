# linking Specification

## Purpose

Paying the debt down: walking the scenarios that carry no directive, and writing
the operator's answer back into the spec.

## Requirements

### Requirement: The operator can find the test, whatever the language

The system SHALL offer the scored candidates, and SHALL offer a free-text search
over every extracted test title, because on a repository whose specs and tests
are written in different languages the score proposes nothing at all.

#### Scenario: Nothing to propose across a language barrier

<!-- openspec-guard:test="offers no candidate across a language barrier, and a search instead" -->

- **WHEN** a French scenario is walked against English tests
- **THEN** no candidate is proposed and the search is offered instead

#### Scenario: Searching by a word from the title

<!-- openspec-guard:test="searches by substring, ignoring case and accents" -->

- **WHEN** the operator searches for a word
- **THEN** matching titles come back, whatever their case or accents

#### Scenario: Linking through a search result

<!-- openspec-guard:test="links through a search result on a bilingual spec" -->

- **WHEN** the operator picks a searched title on a bilingual spec
- **THEN** the criterion passes on that selector afterwards

#### Scenario: The shortest selector that still names one test

<!-- openspec-guard:test="picks a candidate by number, using the shortest unique selector" -->

- **WHEN** the chosen test has a leaf title no other test carries
- **THEN** the leaf alone is written

#### Scenario: A leaf title several tests share

<!-- openspec-guard:test="falls back to the full path when the leaf is ambiguous" -->

- **WHEN** the chosen test shares its leaf title
- **THEN** the full describe path is written instead

### Requirement: The most productive scenarios come first

The system SHALL walk the scenarios that have the best ranked candidate first,
so that a short session is spent where there is something to accept rather than
on whatever happens to sit at the top of the first file. It SHALL offer the
document order for anyone working through one file at a time.

#### Scenario: The queue is ordered by what it has to offer

<!-- openspec-guard:test="walks the best-ranked scenarios first" -->

- **WHEN** a repository holds scenarios with and without a ranked candidate
- **THEN** those with the best candidate are walked first

#### Scenario: A short session

<!-- openspec-guard:test="spends a --limit on the best candidates, not on the first file" -->

- **WHEN** the walk is limited to a single scenario
- **THEN** that scenario is one with something to accept

#### Scenario: Working through one file at a time

<!-- openspec-guard:test="walks in document order when asked to" -->

- **WHEN** the document order is asked for
- **THEN** the scenarios are walked as they appear

### Requirement: The walk answers to the operator, not the other way round

The system SHALL accept a typed title, a non-testable reason, a skip and a
quit, SHALL require a reason for non-testable, and SHALL write everything
already decided when the operator quits.

#### Scenario: A title typed by hand

<!-- openspec-guard:test="accepts a typed title" -->

- **WHEN** the operator types a title rather than picking one
- **THEN** that title becomes the selector

#### Scenario: Declaring a scenario not testable

<!-- openspec-guard:test="requires a reason for non-testable" -->

- **WHEN** the operator declares a scenario non-testable
- **THEN** a reason is required, as everywhere else

#### Scenario: Quitting halfway

<!-- openspec-guard:test="stops at quit and keeps what was already decided" -->

- **WHEN** the operator quits after deciding one scenario
- **THEN** that decision is written and the rest is left alone

#### Scenario: A handful at a time

<!-- openspec-guard:test="honours --limit" -->

- **WHEN** `--limit` is given
- **THEN** the walk stops there and reports what remains

#### Scenario: Deciding without writing

<!-- openspec-guard:test="writes nothing under dry run, and says so" -->

- **WHEN** the walk runs under `--dry-run`
- **THEN** everything is decided and no file changes

### Requirement: Writing into a spec disturbs nothing else

The system SHALL insert one comment line under the scenario heading, SHALL
apply several edits without shifting the lines still to come, and SHALL refuse
to write where the heading is no longer a heading.

#### Scenario: The shape of the edit

<!-- openspec-guard:test="inserts the annotation under the heading, with blank lines around it" -->

- **WHEN** an annotation is written
- **THEN** it sits under the heading, with the blank lines a formatter would add

#### Scenario: Several scenarios in one file

<!-- openspec-guard:test="applies several edits without shifting the lines still to come" -->

- **WHEN** two scenarios of one file are annotated in a single run
- **THEN** both land on their own heading

#### Scenario: The file changed under us

<!-- openspec-guard:test="refuses to write where the heading is no longer a heading" -->

- **WHEN** the line to annotate is no longer a scenario heading
- **THEN** nothing is written, because a blind insert would land in another scenario

#### Scenario: Windows line endings survive

<!-- openspec-guard:test="preserves CRLF line endings" -->

- **WHEN** the spec uses CRLF
- **THEN** the rewritten file still does

#### Scenario: A title containing a double quote

<!-- openspec-guard:test="escapes a double quote inside a selector" -->

- **WHEN** the chosen title contains a double quote
- **THEN** it is escaped in the directive

### Requirement: A decision already made is never overwritten

The system SHALL walk only the scenarios that carry no directive, so a second
run has nothing left to consider and no human decision is undone.

#### Scenario: A scenario that is already annotated

<!-- openspec-guard:test="never touches a scenario that already carries a directive" -->

- **WHEN** every scenario already carries a directive
- **THEN** nothing is considered and the file is untouched

#### Scenario: Running the walk twice

<!-- openspec-guard:test="is idempotent: a second run has nothing left to consider" -->

- **WHEN** the walk is run again after writing
- **THEN** it has nothing left to consider

#### Scenario: The result is still a valid spec

<!-- openspec-guard:test="leaves the spec parseable, with the annotation where the parser looks" -->

- **WHEN** a spec is rewritten by the walk
- **THEN** it parses with no warning and the criterion now passes on its selector
