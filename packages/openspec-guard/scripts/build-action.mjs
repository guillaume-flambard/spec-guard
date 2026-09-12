import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

/**
 * Bundles the GitHub Action.
 *
 * A JavaScript action runs whatever file `action.yml` points at, with no
 * install step, so everything it needs has to be in that one file. CommonJS on
 * purpose: `typescript` reaches for `require` at runtime, which an ESM bundle
 * turns into "Dynamic require of \"fs\" is not supported" at load.
 */
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/action/entry.ts'],
  outfile: 'action-dist/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
  legalComments: 'none',
  // The bundle has no manifest beside it to read the version from.
  define: { __OPENSPEC_GUARD_VERSION__: JSON.stringify(version) },
});

console.log(`action-dist/index.cjs built for openspec-guard ${version}`);
