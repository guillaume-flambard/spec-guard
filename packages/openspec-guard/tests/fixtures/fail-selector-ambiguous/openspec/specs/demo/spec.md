# demo Specification

## Requirements

### Requirement: Email validation

The system SHALL reject an invalid email address.

#### Scenario: Rejects an empty field
<!-- openspec-guard:test="empty field" -->

- **WHEN** a visitor submits nothing
- **THEN** the system refuses it
