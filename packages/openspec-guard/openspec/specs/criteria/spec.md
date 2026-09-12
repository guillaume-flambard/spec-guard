# criteria Specification

## Purpose

Turning parsed scenarios into criteria with stable identifiers. The identifier
is what makes a baseline possible, so what moves it and what does not is part of
the contract.

## Requirements

### Requirement: An identifier is stable, and derived from what it identifies

The system SHALL derive a criterion identifier from the spec path, the
requirement name and the normalized scenario text, and SHALL produce the same
identifier for the same input on every run.

#### Scenario: The shape of an identifier

<!-- openspec-guard:test="has the shape sg_ plus 16 hex characters" -->

- **WHEN** a criterion is built
- **THEN** its identifier is `sg_` followed by sixteen hexadecimal characters

#### Scenario: Twice on the same input

<!-- openspec-guard:test="is identical across two calls" -->

- **WHEN** the same scenario is hashed twice
- **THEN** both identifiers are equal

#### Scenario: The requirement name is part of the identity

<!-- openspec-guard:test="changes when the requirement changes, at identical scenario text" -->

- **WHEN** two requirements in one file hold a scenario with the same text
- **THEN** the two criteria have different identifiers

#### Scenario: The fields cannot be confused for one another

<!-- openspec-guard:test="does not confuse two different splits of the same concatenated fields" -->

- **WHEN** two different field splits would concatenate to the same string
- **THEN** their identifiers still differ, because a NUL separates the fields

#### Scenario: Two identical scenarios in one file

<!-- openspec-guard:test="suffixes duplicates in document order" -->

- **WHEN** a file holds the same scenario twice under the same requirement
- **THEN** the second identifier is suffixed, in document order

### Requirement: Annotating a scenario does not move its identifier

The system SHALL exclude `openspec-guard:` comments from the hashed text. Were
it otherwise, writing the first selector would change every identifier and
invalidate any baseline.

#### Scenario: A selector is added, then removed

<!-- openspec-guard:test="does not move when an annotation is added then removed" -->

- **WHEN** a directive is added to a scenario and later removed
- **THEN** the identifier never changed

#### Scenario: The comment leaves no trace in the canonical text

<!-- openspec-guard:test="strips openspec-guard comments from the canonical text" -->

- **WHEN** the canonical text of an annotated scenario is computed
- **THEN** it is identical to the text of the same scenario without a directive

### Requirement: Rewriting a scenario asks the question again

The system SHALL change the identifier when the scenario body, its file or its
requirement changes, so that an edited scenario is checked again rather than
staying frozen under an old decision.

#### Scenario: The body is edited

<!-- openspec-guard:test="changes when the scenario body changes" -->

- **WHEN** a bullet of the scenario is rewritten
- **THEN** the identifier changes

#### Scenario: The spec file is moved

<!-- openspec-guard:test="changes when the file moves" -->

- **WHEN** the same scenario lives at another path
- **THEN** the identifier changes

### Requirement: Canonical text is normalized before hashing

The system SHALL trim trailing whitespace, collapse consecutive blank lines and
normalize to NFC, so that cosmetic edits do not move an identifier.

#### Scenario: Trailing whitespace and blank lines

<!-- openspec-guard:test="cuts trailing whitespace and trailing blank lines" -->

- **WHEN** a scenario has trailing spaces and blank lines at its end
- **THEN** they are absent from the canonical text

#### Scenario: Repeated blank lines inside a scenario

<!-- openspec-guard:test="collapses consecutive blank lines to one" -->

- **WHEN** a scenario body holds several blank lines in a row
- **THEN** they collapse to one

#### Scenario: Two spellings of the same accented text

<!-- openspec-guard:test="preserves accents and normalizes to NFC" -->

- **WHEN** an accent is written as a combining character
- **THEN** the canonical text is the composed form
