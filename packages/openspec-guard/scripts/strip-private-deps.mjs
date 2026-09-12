import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
 * `npm install` run directly inside the unpacked package tries to resolve the
 * full graph, `devDependencies` included, and fails outright on that name.
 * This script runs as `prepack`, so the tarball never carries the string at
 * all.
 *
 * The restore is `restore-package-json.mjs`, run as `postpack`, not `git
 * checkout`: the real lifecycle order is `prepack` then `prepare` (the
 * build) then `postpack`, and if the build fails, `postpack` never runs at
 * all, so a `git`-based restore is never the fix for that case anyway. A
 * plain on-disk backup is what makes the halted-chain case recoverable, and
 * it is also the only thing that can restore an uncommitted edit to
 * `package.json` (a version bump made but not yet committed, for instance):
 * `HEAD` never had that edit to restore.
 *
 * A leftover `package.json.orig` when this script starts means exactly that:
 * an earlier pack was interrupted after this step ran but before
 * `postpack` restored it, so `package.json` on disk may still be stripped
 * and the backup is the only copy of the real manifest. Overwriting it would
 * destroy that copy, so this refuses to run until it is dealt with by hand.
 */
const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
const backupPath = `${manifestPath}.orig`;

if (existsSync(backupPath)) {
  // Assigning exitCode and falling through, never calling process.exit():
  // banned package-wide, see eslint.config.js.
  process.exitCode = 1;
  console.error(
    `${backupPath} already exists.\n` +
      'An earlier `pnpm pack` was interrupted after this script ran but ' +
      'before `postpack` restored package.json (the build likely failed in ' +
      'between). package.json on disk may still be stripped of ' +
      '@spec-guard/core, and this backup is the only copy of the real one.\n' +
      'Restore it by hand first: node scripts/restore-package-json.mjs\n' +
      'Then re-run pack.',
  );
} else {
  copyFileSync(manifestPath, backupPath);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    delete manifest[field]?.['@spec-guard/core'];
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('package.json backed up to package.json.orig and stripped of @spec-guard/core');
}
