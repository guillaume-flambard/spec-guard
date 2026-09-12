# matching Specification

## Purpose

Deciding which test, if any, covers a scenario. The order of decision is the
contract: an explicit selector first, similarity only as a convenience.

## Requirements

### Requirement: An explicit selector decides, and says when it cannot

The system SHALL look a selector up exactly, against the full name
`describe > it` and against the leaf title. A selector matching nothing or
matching several tests SHALL fail the criterion, and SHALL NOT stop the run,
because the rest of the report is still worth reading.

#### Scenario: A selector naming a leaf title

<!-- openspec-guard:test="matches a selector against the leaf title" -->

- **WHEN** a selector holds the title of one test
- **THEN** the criterion passes on that test

#### Scenario: A selector naming a full path

<!-- openspec-guard:test="matches a selector against the full name" -->

- **WHEN** a selector holds `suite > title`
- **THEN** the criterion passes on that test

#### Scenario: A selector pointing at nothing

<!-- openspec-guard:test="reports a selector that matches nothing" -->

- **WHEN** no test carries the title the selector names
- **THEN** the criterion fails, saying the selector matched nothing

#### Scenario: A selector matching several tests

<!-- openspec-guard:test="reports an ambiguous selector and lists the duplicates" -->

- **WHEN** two tests share the title a selector names
- **THEN** the criterion fails and both are listed

#### Scenario: A selector pointing at a skipped test

<!-- openspec-guard:test="refuses a selector pointing at a skipped test" -->

- **WHEN** the named test is skipped
- **THEN** the criterion fails, because a skipped test is the state this exists to reveal

#### Scenario: A scenario declared not testable

<!-- openspec-guard:test="short-circuits on non-testable" -->

- **WHEN** a scenario is declared non-testable
- **THEN** nothing is matched and the criterion is skipped

### Requirement: Similarity is scored on the scenario name alone

The system SHALL compute a Jaccard score between the scenario name and each
test title, taking the better of the leaf and the full name, and SHALL NOT
include the scenario body, which would collapse every score and make the number
impossible to explain.

#### Scenario: A score above the pass threshold

<!-- openspec-guard:test="passes at exactly the pass threshold" -->

- **WHEN** a scenario name and a test title share their significant words
- **THEN** the criterion passes on similarity

#### Scenario: A score in the middle band

<!-- openspec-guard:test="lands in the uncertain band on a partial overlap" -->

- **WHEN** two of four words are shared
- **THEN** the verdict is uncertain rather than a pass or a failure

#### Scenario: A score below the uncertain threshold

<!-- openspec-guard:test="falls to low-similarity below the uncertain threshold" -->

- **WHEN** one word out of five is shared
- **THEN** the criterion fails, and the weak candidate is still named

#### Scenario: A high score carried by one word

<!-- openspec-guard:test="rejects a high score carried by a single shared term" -->

- **WHEN** a scenario and a title share exactly one significant word
- **THEN** the criterion does not pass, whatever the score

#### Scenario: The better of the leaf and the full name

<!-- openspec-guard:test="takes the better of leaf and full name, and says which" -->

- **WHEN** the subject sits in the suite title for one test and in the leaf for another
- **THEN** each is scored on its better half, and the report says which

#### Scenario: Nothing shared at all

<!-- openspec-guard:test="reports no candidate when nothing is shared at all" -->

- **WHEN** a scenario shares no significant word with any test title
- **THEN** the criterion fails with no candidate, which is not the same as a weak one

### Requirement: Similarity compares words, it does not translate them

The system SHALL fold diacritics, lowercase, drop stopwords of both languages
and drop short tokens. It SHALL NOT stem and SHALL NOT translate, so a scenario
and a test written in different languages meet only by lexical accident.

#### Scenario: Accented and unaccented spellings

<!-- openspec-guard:test="folds diacritics" -->

- **WHEN** a title carries accents
- **THEN** it tokenizes like its unaccented spelling

#### Scenario: An apostrophe is a separator

<!-- openspec-guard:test="treats apostrophes as separators" -->

- **WHEN** a title contains an elided article
- **THEN** the article does not become a token

#### Scenario: Stopwords of both languages

<!-- openspec-guard:test="drops english stopwords" -->

- **WHEN** an English title carries common words
- **THEN** they are dropped before scoring

#### Scenario: A French scenario against an English test

<!-- openspec-guard:test="does not translate: a french title and its english test share nothing" -->

- **WHEN** a French scenario describes what an English test title also describes
- **THEN** the score is zero, because tokens do not cross languages

### Requirement: The same input always ranks the same way

The system SHALL order candidates by score, then path, then line, then name, and
SHALL round scores to four decimals, so a report never depends on iteration
order or on floating point noise.

#### Scenario: Two candidates with the same score

<!-- openspec-guard:test="breaks ties by file then line" -->

- **WHEN** several tests score identically
- **THEN** the one earliest by path and line is chosen

#### Scenario: A long list of candidates

<!-- openspec-guard:test="caps runners-up at two" -->

- **WHEN** four tests score above zero
- **THEN** at most two runners-up are carried

#### Scenario: A score that floating point would print badly

<!-- openspec-guard:test="keeps four decimals" -->

- **WHEN** a score is computed
- **THEN** it is rounded to four decimals

### Requirement: Similarity can be switched off entirely

The system SHALL, under `--require-selector`, link only through explicit
selectors and fail every criterion without one, which is the honest report on a
repository whose specs and tests are written in different languages.

#### Scenario: A scenario with no selector

<!-- openspec-guard:test="disables similarity entirely under --require-selector" -->

- **WHEN** similarity would have passed a criterion
- **THEN** it fails instead, for want of a selector

#### Scenario: A scenario with a selector

<!-- openspec-guard:test="still honours a selector under --require-selector" -->

- **WHEN** a criterion carries a selector
- **THEN** it is honoured as usual
