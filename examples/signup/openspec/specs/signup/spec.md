# Signup

## Purpose

Describe the email validation used when signing up.

## Requirements

### Requirement: Reject an empty email

The system SHALL reject an empty email address.

#### Scenario: Empty email is rejected

<!-- openspec-guard:test="rejects an empty email" -->

- **WHEN** a visitor submits an empty email
- **THEN** signup rejects the request
