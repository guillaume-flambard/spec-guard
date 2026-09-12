# reporting Specification

## Purpose

Two reports: a JSON document that a machine can diff, and a terminal report a
human can act on.

## Requirements

### Requirement: The JSON document is a function of the repository alone

The system SHALL emit no clock, no duration, no absolute path and no machine
name, and SHALL sort its results, so that two runs on the same input produce
identical bytes and a report can be committed and diffed.

#### Scenario: Nothing in it comes from the clock

<!-- openspec-guard:test="carries no clock and no machine identity" -->

- **WHEN** a report is rendered
- **THEN** it holds no timestamp, duration or elapsed field

#### Scenario: Nothing in it comes from this machine

<!-- openspec-guard:test="carries no absolute path, so the output does not depend on the machine" -->

- **WHEN** a report is rendered
- **THEN** every path in it is relative

#### Scenario: Two runs of the same repository

<!-- openspec-guard:test="produces identical bytes on two consecutive runs" -->

- **WHEN** the same repository is checked twice
- **THEN** the two documents are byte for byte identical

#### Scenario: Results in a stable order

<!-- openspec-guard:test="sorts results by file, then line, then id" -->

- **WHEN** a report holds several criteria
- **THEN** they are ordered by file, then line, then identifier

#### Scenario: The shape does not shift between runs

<!-- openspec-guard:test="keeps every array present and every absent scalar null" -->

- **WHEN** a criterion has no candidate and no selector
- **THEN** the arrays are empty and the absent scalars are null, never missing

#### Scenario: The top-level keys keep their order

<!-- openspec-guard:test="keeps the top-level keys in a fixed order" -->

- **WHEN** a document is rendered
- **THEN** its keys appear in the documented order

#### Scenario: It parses back to what it was

<!-- openspec-guard:test="ends with a newline and parses back to the same object" -->

- **WHEN** a rendered document is parsed again
- **THEN** it equals the report it came from

### Requirement: The terminal report is grouped by what to do about it

The system SHALL separate a criterion with no candidate from one with a
candidate too weak, SHALL name the weak candidate and its score, and SHALL fold
away the passes and skips unless asked for them.

#### Scenario: Two kinds of failure

<!-- openspec-guard:test="separates a missing candidate from a weak one" -->

- **WHEN** one criterion shares no word and another has a weak candidate
- **THEN** they appear under different headings

#### Scenario: A weak candidate is named

<!-- openspec-guard:test="names the weak candidate and its score" -->

- **WHEN** a candidate scores below the threshold
- **THEN** the report names it and prints its score

#### Scenario: A dead selector

<!-- openspec-guard:test="shows a dead selector as its own group, with the selector text" -->

- **WHEN** a selector matches nothing
- **THEN** it is its own group and the selector text is shown

#### Scenario: What passed is folded away

<!-- openspec-guard:test="folds passes and skips away unless verbose" -->

- **WHEN** a run is not verbose
- **THEN** the passing criteria are counted, not listed

#### Scenario: A long group of failures

<!-- openspec-guard:test="truncates a long group and says how many rows are left" -->

- **WHEN** a group holds more rows than the limit
- **THEN** it is truncated and the remaining count is printed

#### Scenario: Frozen debt is not something to act on

<!-- openspec-guard:test="folds baselined criteria out of the actionable groups" -->

- **WHEN** every failing criterion is frozen by a baseline
- **THEN** none of them appears among the actionable groups

### Requirement: The report says how a pass was earned

The system SHALL print the split between passes earned by selector and by
similarity, and SHALL say once, and only when it is true, that similarity found
nothing because it does not translate.

#### Scenario: The summary line

<!-- openspec-guard:test="splits the summary between selector and similarity" -->

- **WHEN** a run has passes
- **THEN** the summary says how many of each kind

#### Scenario: Similarity found nothing at all

<!-- openspec-guard:test="prints the language notice only when similarity did nothing at all" -->

- **WHEN** a repository has tests, no selectors, and no similarity pass
- **THEN** the report explains that similarity compares words and does not translate them

#### Scenario: The notice is not printed when it would be noise

<!-- openspec-guard:test="never prints the language notice under --require-selector" -->

- **WHEN** similarity is switched off
- **THEN** the notice is absent, because it would explain a mechanism nobody used

#### Scenario: A stale baseline

<!-- openspec-guard:test="says when baseline entries no longer match anything" -->

- **WHEN** baseline entries match nothing any more
- **THEN** the report says so and names the command that prunes them

#### Scenario: Titles matching could not see

<!-- openspec-guard:test="mentions dynamic titles that matching could not see" -->

- **WHEN** some test titles could not be read statically
- **THEN** the report says how many, so they are not hunted for in vain

### Requirement: A report ends with the one thing to do next

A first run on a real repository returns thousands of criteria, and reporting
them is not the same as being usable. The system SHALL name the single most
useful next command for the state the repository is in, SHALL prefer a broken
selector over anything else because it is a ten-second fix, and SHALL say
nothing when there is nothing to do.

#### Scenario: A repository with ranked candidates

<!-- openspec-guard:test="ends with the one command to run next" -->

- **WHEN** uncovered scenarios have a candidate test ranked for them
- **THEN** the report names the command that walks them

#### Scenario: A selector that points at nothing

<!-- openspec-guard:test="sends a broken selector to the front of the queue" -->

- **WHEN** a selector matches no test
- **THEN** that is named as the next thing to do, ahead of everything else

#### Scenario: A repository with real debt and no baseline

<!-- openspec-guard:test="tells a repository with real debt to freeze it first" -->

- **WHEN** dozens of scenarios are uncovered and no baseline is in use
- **THEN** the report names the two commands that freeze the debt and gate on the rest

#### Scenario: Nothing left to do

<!-- openspec-guard:test="says nothing about what to do next when there is nothing to do" -->

- **WHEN** every criterion passes or is declared non-testable
- **THEN** no next step is printed

### Requirement: Colour is never forced on a log file

The system SHALL emit no escape sequence when colour is off.

#### Scenario: Colour off

<!-- openspec-guard:test="emits no ANSI sequence when color is off" -->

- **WHEN** colour is disabled
- **THEN** the output holds no escape sequence

#### Scenario: Colour on

<!-- openspec-guard:test="emits ANSI sequences when color is on" -->

- **WHEN** colour is enabled
- **THEN** the groups are coloured
