# account/settings Specification

## Requirements

### Requirement: Pen name validation

The system SHALL reject a pen name that is too short or too long.

#### Scenario: Rejects a pen name that is too short
<!-- openspec-guard:test="rejects a pen name shorter than two characters" -->

- **WHEN** a reader submits a one-character pen name
- **THEN** the system refuses it with a message

#### Scenario: Manual accessibility review
<!-- openspec-guard:non-testable reason="Requires a human accessibility audit" -->

- **WHEN** the settings page changes
- **THEN** an accessibility review is recorded
