# Signup example

This directory contains one OpenSpec scenario and one matching Vitest title. No
dependencies need to be installed because OpenSpec Guard reads the files without
running the test.

From this directory, with Node.js 20.11 or later:

```bash
npx --yes openspec-guard@0.2.0 check \
  --runner vitest --require-selector --fail-on fail,uncertain
```

Expected summary:

```text
1 criteria: 1 pass (1 by selector, 0 by similarity), 0 uncertain, 0 fail, 0 skip
```

Rename the test without changing the annotation and run the command again. The
gate exits with code 1 and reports `selector-unmatched`.
