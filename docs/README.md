# Documentation

Start with the root [README](../README.md) for installation, the first report,
explicit selectors, baselines, and GitHub Actions.

## Reproducible examples

- [Signup example](../examples/signup): one OpenSpec scenario and one Vitest
  title linked by an explicit selector.
- [Public sku demonstration](demo-sku.md): a pinned public revision, exact
  before and after counts, and the suggestions that were deliberately rejected.

## Measurements

- [Similarity measurements](measurements.md): aggregate results on private and
  public corpora, including false suggestions and known limits.
- [Fixture provenance](fixtures.md): where the repository's synthetic fixtures
  came from and the constraints that keep them self-contained.

## Experiments and research

- [Spec Kit feasibility experiment](experiments/speckit-hammerkit.md): a measured
  temporary conversion. It does not claim native Spec Kit support.
- [Spec format conventions](research/2026-09-10-spec-format-conventions.md):
  source notes that informed the current OpenSpec-only boundary.

Experimental results are evidence about the recorded revision and command, not
support guarantees for the published package.
