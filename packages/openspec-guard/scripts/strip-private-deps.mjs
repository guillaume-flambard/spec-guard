import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Removes every mention of `@spec-guard/core` from the manifest that is about
 * to be packed or published.
 *
 * `pnpm pack`/`npm pack` write the package's own `package.json` into the
 * tarball verbatim, `devDependencies` included, and pnpm rewrites a
 * `workspace:*` reference there to a concrete version number
 * (`@spec-guard/core@0.3.0`) on the way in. That version does not exist on the
 * registry: `@spec-guard/core` is `private: true` and never published. A
 * plain `npm install` of the packed tarball as someone else's dependency
 * never looks at its `devDependencies`, so this is harmless there, but
 * `npm install` run directly inside the unpacked package tries to resolve
 * the full graph, `devDependencies` included, and fails outright on that
 * name. This script runs as `prepack`, so the tarball never carries the
 * string at all; `postpack` (`git checkout -- package.json`) restores the
 * working copy, since the copy on disk is only ever needed by this
 * repository's own build.
 */
const path = new URL('../package.json', import.meta.url);
const manifest = JSON.parse(readFileSync(path, 'utf8'));

for (const field of [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]) {
  delete manifest[field]?.['@spec-guard/core'];
}

writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('package.json stripped of @spec-guard/core for packing');
