import { existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Restores `package.json` from the backup `strip-private-deps.mjs` (the
 * `prepack` script) writes before stripping `@spec-guard/core` out of it.
 *
 * Runs automatically as `postpack`. It is also a plain script anyone can run
 * by hand: if a `pnpm pack` is interrupted between `prepack` and `postpack`
 * (the build failed partway through `prepare`, for instance), `postpack`
 * never runs, `package.json` is left stripped, and `package.json.orig` is
 * left sitting next to it holding the real one. Running
 * `node scripts/restore-package-json.mjs` puts it back and removes the
 * backup, whether that is done by the lifecycle or by a person after the
 * fact.
 *
 * A no-op, not an error, when there is nothing to restore: `postpack` always
 * runs after a successful pack, including hypothetical ones where `prepack`
 * itself was never reached to create a backup in the first place.
 */
const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
const backupPath = `${manifestPath}.orig`;

if (!existsSync(backupPath)) {
  console.log('No package.json.orig to restore from; nothing to do.');
} else {
  renameSync(backupPath, manifestPath);
  console.log('package.json restored from package.json.orig');
}
