# demo Specification

## Requirements

### Requirement: Email validation

The system SHALL reject an invalid email address.

#### Scenario: Rejects an invalid email
<!-- openspec-guard:test="a" -->
<!-- openspec-guard:non-testable reason="b" -->

- **WHEN** a visitor submits a malformed address
- **THEN** the system refuses it

#### Scenario: Rejects a blank field
<!-- openspec-guard:non-testable -->

- **WHEN** a visitor submits nothing
- **THEN** the system refuses it
