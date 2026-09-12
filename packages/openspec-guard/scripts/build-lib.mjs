import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { generateDtsBundle } from 'dts-bundle-generator';
import { build } from 'esbuild';

/**
 * Bundles the published CLI and the published library entry point.
 *
 * `@spec-guard/core` is `private: true` and never published: at publish time
 * pnpm would rewrite its `workspace:*` dependency to a version number that
 * does not exist on the registry, so a plain `import '@spec-guard/core'` left
 * in `dist/cli.js` or `dist/index.js` would break for every installer. Both
 * entry points are bundled here so the core's code ships inside them instead,
 * the same way `build-action.mjs` bundles the Action. `typescript` stays
 * external: it is a real dependency, resolved from the installer's own
 * `node_modules`, not something to fold in.
 *
 * `tsc` (run first, see the `build` script) produces a `.d.ts` next to every
 * module, most of which import from `@spec-guard/core` too, and none of which
 * are reachable from outside the package: `exports` only ever names `.`. This
 * script overwrites `dist/cli.js` and `dist/index.js` with the bundles below,
 * replaces `dist/index.d.ts` with one that has the core's types inlined, and
 * then deletes everything else `tsc` left behind, so nothing shipped can
 * still name a package that will never exist on the registry.
 */
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/cli.ts', 'src/index.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['typescript'],
  legalComments: 'none',
  // `version.ts` already knows how to take this branch: it is the same
  // substitution `build-action.mjs` uses for the Action bundle.
  define: { __OPENSPEC_GUARD_VERSION__: JSON.stringify(version) },
});

console.log(`dist/cli.js and dist/index.js bundled for openspec-guard ${version}`);

const [indexDts] = generateDtsBundle(
  [
    {
      filePath: 'src/index.ts',
      libraries: { inlinedLibraries: ['@spec-guard/core'] },
    },
  ],
  { preferredConfigPath: 'tsconfig.json' },
);
writeFileSync('dist/index.d.ts', indexDts);

console.log('dist/index.d.ts bundled with @spec-guard/core inlined');

const KEEP = new Set(['cli.js', 'index.js', 'index.d.ts']);
for (const entry of readdirSync('dist')) {
  if (!KEEP.has(entry)) rmSync(`dist/${entry}`, { recursive: true, force: true });
}

console.log('dist pruned to the two published entry points');
