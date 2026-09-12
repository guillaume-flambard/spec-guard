# cli Specification

## Purpose

The command line: what it accepts, what it writes where, and what it returns to
the shell.

## Requirements

### Requirement: Four exit codes, each meaning one thing

The system SHALL return 0 on success, 1 for a violated gate and nothing else, 2
for a faulty input or option, and 3 for an internal error. A 2 is the caller's
fault and a 3 is ours; collapsing them turns every regression into a hunt for an
innocent spec file.

#### Scenario: A clean run

<!-- openspec-guard:test="exits zero on a clean run" -->

- **WHEN** every criterion passes
- **THEN** the command exits 0

#### Scenario: A violated gate

<!-- openspec-guard:test="exits 1, and only 1, when a gate is violated" -->

- **WHEN** a gate is violated
- **THEN** the command exits 1 and prints the violation

#### Scenario: An option that does not exist

<!-- openspec-guard:test="exits 2 on an unknown option" -->

- **WHEN** an unknown option is passed
- **THEN** the command exits 2 rather than ignoring it

#### Scenario: A command that does not exist

<!-- openspec-guard:test="exits 2 on an unknown command" -->

- **WHEN** an unknown command is passed
- **THEN** the command exits 2 and names the commands it knows

#### Scenario: A threshold outside its range

<!-- openspec-guard:test="exits 2 on an out-of-range threshold" -->

- **WHEN** a threshold is given outside zero to one
- **THEN** the command exits 2

#### Scenario: A verdict that does not exist

<!-- openspec-guard:test="exits 2 on an unknown --fail-on verdict" -->

- **WHEN** `--fail-on` names something that is not a verdict
- **THEN** the command exits 2

#### Scenario: A spec root with no spec in it

<!-- openspec-guard:test="exits 2 on a spec root holding no spec" -->

- **WHEN** the spec root holds no spec
- **THEN** the command exits 2

#### Scenario: A baseline that cannot be read

<!-- openspec-guard:test="refuses a baseline that does not exist, with exit 2" -->

- **WHEN** `--baseline` names a file that does not exist
- **THEN** the command exits 2 with the error code in the message

### Requirement: Standard output carries the document and nothing else

The system SHALL write the JSON document to standard output alone, and SHALL
send every human line, warnings and maintenance messages included, to standard
error, so that redirecting the output writes exactly the document.

#### Scenario: Redirecting the JSON

<!-- openspec-guard:test="puts the JSON document on stdout and nothing else" -->

- **WHEN** the command runs with `--format json`
- **THEN** standard output parses as the document, whole

#### Scenario: Writing a baseline while asking for JSON

<!-- openspec-guard:test="announces a baseline write on stderr, keeping stdout clean" -->

- **WHEN** a baseline is written during a JSON run
- **THEN** the announcement goes to standard error and the document stays clean

#### Scenario: Output into a pipe

<!-- openspec-guard:test="emits no colour when stdout is a pipe" -->

- **WHEN** standard output is not a terminal
- **THEN** no colour is emitted

### Requirement: Configuration errors are reported all at once

The system SHALL report every annotation error of a run together, and SHALL
check nothing, rather than reporting a run built on a spec it could not read.

#### Scenario: Several broken directives

<!-- openspec-guard:test="exits 2 and lists every annotation error at once" -->

- **WHEN** a spec holds two broken directives
- **THEN** both are printed and nothing is checked

### Requirement: An interactive command refuses to run blind

The system SHALL refuse to walk scenarios without a terminal, and SHALL name
what to do instead, rather than answering its own questions in a pipeline.

#### Scenario: link with no terminal attached

<!-- openspec-guard:test="refuses to run link without a terminal, and says what to do instead" -->

- **WHEN** `link` runs with no terminal
- **THEN** it stops and points at the command that freezes debt without asking anything

### Requirement: An option outside its vocabulary stops the run

The system SHALL reject a value that is not one of the ones an option knows,
rather than falling back to a default the caller did not ask for.

#### Scenario: An order that does not exist

<!-- openspec-guard:test="exits 2 on an unknown --order" -->

- **WHEN** `--order` names something other than confidence or document
- **THEN** the command exits 2

### Requirement: The command can describe itself

The system SHALL print its usage and its version on request, and exit zero.

#### Scenario: Asking for help

<!-- openspec-guard:test="prints help and exits zero" -->

- **WHEN** `--help` is passed
- **THEN** the usage is printed and the command exits 0

#### Scenario: Asking for the version

<!-- openspec-guard:test="prints the version and exits zero" -->

- **WHEN** `--version` is passed
- **THEN** the version is printed and the command exits 0
