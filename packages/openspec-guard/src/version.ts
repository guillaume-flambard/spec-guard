import { createRequire } from 'node:module';

/**
 * The published version.
 *
 * It is deliberately the only value in the JSON report that can change without
 * the input changing, and it only moves when a release is cut.
 *
 * Two ways to learn it, because this file is loaded two ways. The ESM package
 * reads its own manifest, one directory up from `dist/version.js`. The bundled
 * Action has no manifest beside it and no working `import.meta`, so the bundler
 * substitutes the constant below and the manifest branch is never reached.
 */
declare const __OPENSPEC_GUARD_VERSION__: string | undefined;

function read(): string {
  // `typeof` on an undeclared name is safe: it yields 'undefined' rather than
  // throwing, which is what makes one file serve both builds.
  if (typeof __OPENSPEC_GUARD_VERSION__ === 'string') return __OPENSPEC_GUARD_VERSION__;

  try {
    const manifest = createRequire(import.meta.url)('../package.json') as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION: string = read();
