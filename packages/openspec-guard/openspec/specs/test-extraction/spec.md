# test-extraction Specification

## Purpose

Reading the titles of Vitest and Jest tests, syntactically, without running
anything and without importing the project's code.

## Requirements

### Requirement: Titles are read from the syntax, never guessed

The system SHALL read a title only when it can be known without executing
anything, and SHALL report a title it cannot read rather than inventing one,
because an invented full name produces a selector nobody could write.

#### Scenario: Suites nested several levels deep

<!-- openspec-guard:test="reads nested suites three levels deep" -->

- **WHEN** a test sits inside two nested suites
- **THEN** its full name is the path of all three titles

#### Scenario: Every alias of suite and test

<!-- openspec-guard:test="reads every suite and test alias" -->

- **WHEN** a file uses `suite`, `context`, `it` and `test`
- **THEN** all of them are recognised

#### Scenario: A title built from a template literal

<!-- openspec-guard:test="reports a template literal title instead of emitting it" -->

- **WHEN** a title interpolates a value
- **THEN** no title is emitted and the call is reported as dynamic

#### Scenario: A suite whose own name is dynamic

<!-- openspec-guard:test="drops every leaf under a dynamically named suite" -->

- **WHEN** a suite title comes from a variable
- **THEN** every test inside it is reported rather than emitted under a made-up name

#### Scenario: A concatenation of literals

<!-- openspec-guard:test="folds a concatenation of string literals" -->

- **WHEN** a title is written as two string literals joined with a plus
- **THEN** the folded title is read

#### Scenario: A parameterised title

<!-- openspec-guard:test="keeps an each template as written, never expanded" -->

- **WHEN** a test uses `.each` with a template title
- **THEN** the template is kept exactly as written, never expanded

### Requirement: A skipped test is never coverage

The system SHALL mark a test skipped when it is skipped directly or through an
enclosing suite, and SHALL record focus without letting it change anything,
because nothing is ever executed.

#### Scenario: The three ways to skip a test

<!-- openspec-guard:test="marks it.skip, xit and todo as skipped" -->

- **WHEN** tests use `it.skip`, `xit` and `it.todo`
- **THEN** all three are marked skipped

#### Scenario: A skipped suite

<!-- openspec-guard:test="inherits skip from an enclosing suite" -->

- **WHEN** a suite is skipped
- **THEN** the tests inside it are skipped too

#### Scenario: A focused test

<!-- openspec-guard:test="records only without letting it change anything else" -->

- **WHEN** a test is focused with `only` or `fit`
- **THEN** the modifier is recorded and nothing else changes

### Requirement: A file that does not parse does not stop the run

The system SHALL record a file it could not parse and continue, and SHALL NOT
mistake a call on another object for a test.

#### Scenario: A syntactically broken test file

<!-- openspec-guard:test="records a syntactically broken file instead of throwing" -->

- **WHEN** a test file is missing a closing brace
- **THEN** it is recorded as unparsed and the run continues

#### Scenario: A generic arrow function in a TSX file

<!-- openspec-guard:test="parses a tsx file with a generic arrow function" -->

- **WHEN** a `.tsx` file declares a generic arrow function
- **THEN** it parses, because the file is read as TSX and not as TS

#### Scenario: Somebody else's it

<!-- openspec-guard:test="ignores a test-looking call on some other object" -->

- **WHEN** a file calls `foo.it(...)` or `this.test(...)`
- **THEN** neither is read as a test

#### Scenario: A test call inside a comment or a string

<!-- openspec-guard:test="ignores it( inside a comment or a string" -->

- **WHEN** the text `it(` appears in a comment and inside a string literal
- **THEN** neither becomes a title, which is why this is parsed and not matched

#### Scenario: An apostrophe inside a title

<!-- openspec-guard:test="keeps an apostrophe inside a title" -->

- **WHEN** a title contains an apostrophe
- **THEN** the title is read whole
