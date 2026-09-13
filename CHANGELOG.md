# Changelog

## 0.3.0 (2026-09-13)

### Fixed

- Nonempty spec files with no recognized OpenSpec scenarios now stop with
  `E_NO_CRITERIA` and exit code 2. Previously they could produce an empty success,
  including with CI gates enabled. The message names the expected headings and
  explains that other formats, including Spec Kit, are unsupported.
- The check stops before rewriting a baseline or emitting successful Action outputs.
  The interactive linker applies the same input check. `--allow-empty` retains its
  original scope: a directory containing no spec files. Recognized removal-only
  deltas remain valid.

### Added since npm 0.2.0

- Interactive scenario linking with test-title search and a confidence-ordered queue.
- `--min-coverage` and Action coverage input/output. Baselines do not raise this percentage.
- Suggested next commands in the terminal report.

### Documentation

- Runnable signup example, pinned sku demo and experimental Spec Kit feasibility probe.
- npm examples now target 0.3.0. Historical probes remain pinned to 0.2.0 to preserve
  their measurements; their old empty-success result is fixed in this release.

Spec Kit support is still experimental and is not included as a native adapter.
