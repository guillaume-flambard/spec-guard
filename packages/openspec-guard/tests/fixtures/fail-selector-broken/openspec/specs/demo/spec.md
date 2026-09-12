# demo Specification

## Requirements

### Requirement: Email validation

The system SHALL reject an invalid email address.

#### Scenario: Rejects an invalid email
<!-- openspec-guard:test="rejects an invalid e-mail" -->

- **WHEN** a visitor submits a malformed address
- **THEN** the system refuses it
