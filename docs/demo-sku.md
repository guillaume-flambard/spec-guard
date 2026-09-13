# Three explicit links in a public OpenSpec repository

Measured on 2026-09-13 with npm `openspec-guard@0.2.0` and
[seek-oss/sku at c144760](https://github.com/seek-oss/sku/tree/c1447604023e93970169f3da17d72db7677c31bf).
This is an independent demonstration. SEEK has not adopted or endorsed Guard.

## Reproduce

From a clone of the Spec Guard repository, with Node 20.11+, npm and git:

```bash
node scripts/demo-sku.mjs
```

The script fetches a pinned sku revision into a fresh temporary directory and runs
the published npm package. It does not install sku's dependencies or run its tests.
It adds three annotations in that temporary checkout, checks again and verifies
that the other verdicts have not changed. The checkout and both JSON reports are
kept at the printed path for inspection.

```text
Before: 6 criteria, 0 pass (0 by selector), 3 uncertain, 3 fail
After: 6 criteria, 3 pass (3 by selector), 1 uncertain, 2 fail
```

Scope: [local-dev-hosts/spec.md](https://github.com/seek-oss/sku/blob/c1447604023e93970169f3da17d72db7677c31bf/openspec/specs/local-dev-hosts/spec.md)
against [hosts.test.ts](https://github.com/seek-oss/sku/blob/c1447604023e93970169f3da17d72db7677c31bf/packages/sku/src/context/hosts.test.ts).
Six scenarios, one Vitest file. These are not whole-repository coverage numbers.

## The three links

| Scenario                          | Explicit test selector                                      | Before    | After |
| --------------------------------- | ----------------------------------------------------------- | --------- | ----- |
| Missing .localhost host is silent | `checkHosts > should not warn for missing .localhost hosts` | uncertain | pass  |
| .localhost host is written        | `setupHosts > should set app-wide hosts`                    | fail      | pass  |
| Exact localhost is not written    | `setupHosts > should skip exact localhost`                  | uncertain | pass  |

I inspected the scenario text and test assertions before selecting these titles.
The first test checks that nothing is logged for a missing `.localhost` host.
The second checks that the configured `.localhost` hosts are passed to the hosts
writer. The third checks that exact `localhost` is not written.
Guard itself reads none of those assertions, and this demo does not execute them.

The only edits are HTML comments below the corresponding scenario headings. For example:

```md
<!-- openspec-guard:test="setupHosts > should set app-wide hosts" -->
```

No scenario was removed and no test was added to make the report greener.

## A suggestion I did not accept

For the scenario about warning on a missing **non-localhost** host, the highest
ranked candidate is `should not warn for missing .localhost hosts`.
That is the opposite behaviour. Shared words do not capture the distinction.
It remains `uncertain`, with no annotation added by this demo.

A test titled `should warn for missing non-localhost hosts` also exists, but the
scenario additionally calls for a suggestion to run `setup-hosts` with elevated
privileges. The test assertions do not check that entire condition. This is why
accepting a matching title cannot certify the whole scenario.

The two remaining `fail` verdicts concern HTTPS and documentation examples.
Those behaviours are outside this selected test file's scope; the verdicts do
not establish that sku lacks those tests elsewhere.

## Try your own repository

```bash
npx --yes openspec-guard@0.2.0 check
```

[Report a wrong match or a confusing result](https://github.com/guillaume-flambard/spec-guard/issues/new).
Include the command, version, scenario and candidate title if you can share them.
A concrete failure is more useful than a star.
