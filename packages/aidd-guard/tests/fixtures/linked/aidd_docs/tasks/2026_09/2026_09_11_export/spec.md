# Account export

## Target

Let an authenticated user download their account data as a JSON file.

## Hard constraints

- The export never contains another user's data.

## Non-goals

- No CSV, no XML.

## Done-when

- The export produces a JSON file the user can download.
  <!-- aidd-guard:test="writes the export as JSON" -->
- An anonymous visitor asking for an export is refused.
  <!-- aidd-guard:test="export > refuses an anonymous visitor" -->
- A large account streams rows instead of buffering them, so a thirty thousand row
  account behaves like a small one.
- The legal retention notice is reviewed before each release.
  <!-- aidd-guard:non-testable reason="Requires a human legal assessment" -->
- Nothing here shares any word with a test title whatsoever.
