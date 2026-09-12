# Publishing

Nothing publishes itself. A version reaches npm when a tag is pushed, the full
gate runs again on that commit, and npm accepts the workflow's own identity.

## Why there is no token in this repository

npm **removed classic and automation tokens in November 2025**; only granular
tokens remain. A granular token can be given a "Bypass 2FA" option, but that
option is on its way out too: since August 2026 it cannot perform account
actions, and **publishing with it stops working in January 2027**
([about access tokens](https://docs.npmjs.com/about-access-tokens)).

What replaces it is **trusted publishing**: npm trades this workflow's OIDC
identity for a short-lived credential. No secret is stored anywhere, and the
only thing on earth that can publish this package is this workflow in this
repository ([trusted publishers](https://docs.npmjs.com/trusted-publishers)).

Requirements, from that page: npm 11.5.1 or later, Node 22.14 or later, and
`permissions: id-token: write` in the job. All three hold in
[`release.yml`](../.github/workflows/release.yml), and the CLI version is
checked explicitly so a runner image that moves backwards fails with a sentence
instead of an authentication error.

## One-time setup, on npmjs.com

This is the only part that needs a human and a browser.

1. Sign in on <https://www.npmjs.com>.
2. Add a trusted publisher for the package `@zoanlogia/aidd-guard`, with exactly:
   - provider: **GitHub Actions**
   - organization or user: `guillaume-flambard`
   - repository: `aidd-guard`
   - workflow filename: `release.yml`
   - environment: leave empty
3. Save.

npm **does not validate that entry when you save it**. A typo in the repository
name or the workflow filename surfaces only at the first publish attempt, as an
authentication failure. Check the three fields before leaving the page.

## The first publish is not the ones after it

Measured on 2026-09-11, publishing `0.1.0` from this workflow with nothing
published under the name yet:

```
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/aidd-guard
npm error 404  The requested resource 'aidd-guard@0.1.0' could not be found or you do not have permission to access it.
```

A 404 on a PUT is what npm answers when the request carries no identity it
accepts, and the trusted publisher setting lives on the **package settings
page**, which does not exist until the package does. The documentation says
nothing either way about a name that has never been published; that silence is
the whole of what it says, and the run above is the only evidence there is.

## The name npm refused

`aidd-guard`, unscoped, is refused at the PUT with a 403:

```
npm error 403 Package name too similar to existing package aid-guard1
```

`aid-guard1` is a single-version package from March 2024 whose description is its
own name. It locks the whole unscoped family, and **nothing in the registry says
so beforehand**: a GET on `aidd-guard` answers 404, which reads as "free" and is
not. The similarity filter only ever speaks at publish time. Hence the scope.

`@memolabs` was the first choice and the name was already taken, so the package
went out under the account's own scope, `@zoanlogia/aidd-guard`, published with
`access: public`. The binary is `aidd-guard` either way, which is the name
anybody actually types.

## The first publish, by hand, once

```sh
npm login                       # browser, with the two-factor challenge
pnpm build
npm publish
```

That first tarball has **no provenance attestation**: provenance is signed from
the workflow's OIDC identity, and a laptop has none. Every version after it does,
because the trusted publisher can be configured as soon as the package exists.

Then come back and do the one-time setup above.

## Cutting a release

```sh
# the manifest version and the tag must agree; the workflow refuses them otherwise
git tag v0.1.0
git push origin v0.1.0
```

The workflow then lints, formats, typechecks, builds, tests, verifies that the
tag matches `package.json`, asks the registry whether that version already
exists, and only then publishes with `--provenance`.

`workflow_dispatch` exists so a failed publish can be retried without inventing
a new tag.
