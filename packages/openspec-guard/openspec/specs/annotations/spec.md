# annotations Specification

## Purpose

The directives that link a scenario to a test. They are a documented
openspec-guard convention carried in HTML comments, and NEVER OpenSpec syntax:
the official parser counts every `####` heading as a scenario, so a metadata
heading would silently become a bogus one. A comment cannot.

## Requirements

### Requirement: Two directives, mutually exclusive, both auditable

The system SHALL accept `openspec-guard:test="..."` and
`openspec-guard:non-testable reason="..."`. It SHALL reject both on one
scenario, SHALL reject a duplicate of either, and SHALL require a non-empty
reason, because a skipped criterion without a reason is not auditable.

#### Scenario: A test selector

<!-- openspec-guard:test="reads a test selector" -->

- **WHEN** a scenario carries a well-formed test directive
- **THEN** its selector is read with the line it sits on

#### Scenario: A non-testable declaration

<!-- openspec-guard:test="reads a non-testable reason" -->

- **WHEN** a scenario is declared non-testable with a reason
- **THEN** both the kind and the reason are read

#### Scenario: Both kinds on one scenario

<!-- openspec-guard:test="rejects the two kinds together as a conflict" -->

- **WHEN** a scenario carries a test directive and a non-testable directive
- **THEN** the run stops: a scenario is either linked or declared untestable

#### Scenario: The same directive twice

<!-- openspec-guard:test="rejects two test directives as a duplicate" -->

- **WHEN** a scenario carries two test directives
- **THEN** the run stops

#### Scenario: A non-testable with no reason

<!-- openspec-guard:test="rejects a missing reason" -->

- **WHEN** the directive is `non-testable` with no reason at all
- **THEN** the run stops

#### Scenario: A reason made only of spaces

<!-- openspec-guard:test="rejects a whitespace-only reason" -->

- **WHEN** the reason is present but blank
- **THEN** the run stops, because a blank reason audits nothing

### Requirement: The grammar is rigid, and silence is never an answer

The system SHALL reject a malformed or unknown directive rather than ignoring
it, because a typo that makes a selector invisible is the worst possible
outcome. It SHALL ignore HTML comments that are not ours.

#### Scenario: A misspelled directive

<!-- openspec-guard:test="rejects an unknown directive rather than ignoring it" -->

- **WHEN** a comment reads `openspec-guard:tets="a"`
- **THEN** the run stops instead of quietly skipping it

#### Scenario: Single quotes

<!-- openspec-guard:test="rejects single quotes" -->

- **WHEN** a selector is written with single quotes
- **THEN** the run stops

#### Scenario: An empty selector

<!-- openspec-guard:test="rejects an empty selector" -->

- **WHEN** a test directive carries an empty string
- **THEN** the run stops, because an empty selector links nothing

#### Scenario: An escaped quote inside a selector

<!-- openspec-guard:test="unescapes an escaped double quote inside a selector" -->

- **WHEN** a test title contains a double quote, escaped in the directive
- **THEN** the selector holds the real title

#### Scenario: Somebody else's HTML comment

<!-- openspec-guard:test="ignores foreign HTML comments, wherever they are" -->

- **WHEN** a scenario carries an unrelated HTML comment
- **THEN** it is ignored, wherever it sits

### Requirement: A directive belongs directly under its heading

The system SHALL recognise a directive only in the contiguous block following
the scenario heading, blank lines tolerated, and SHALL reject one placed after
the body has started rather than silently ignoring it.

#### Scenario: A blank line before the directive

<!-- openspec-guard:test="accepts blank lines before the directive" -->

- **WHEN** a blank line separates the heading from the directive
- **THEN** the directive is read

#### Scenario: A directive further down the scenario

<!-- openspec-guard:test="rejects a directive placed after the start of the body" -->

- **WHEN** a directive appears after the first bullet
- **THEN** the run stops and says where the directive must sit

#### Scenario: A scenario with no directive at all

<!-- openspec-guard:test="returns nothing on a plain scenario" -->

- **WHEN** a scenario carries no directive
- **THEN** nothing is read and nothing is reported
