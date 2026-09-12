import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { OpenSpecGuardError } from './errors.js';

/**
 * Everything that touches the filesystem lives here: root resolution, tree
 * walking, exclusions, stable ordering, relative POSIX paths. No other module
 * reads a directory.
 */

/**
 * Always excluded, not configurable. These are build outputs and dependency
 * trees; a test title found in one of them describes someone else's code.
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.git',
  '.turbo',
  '.cache',
  '.output',
  '.svelte-kit',
  '.expo',
  '.nuxt',
  'vendor',
]);

export const DEFAULT_TEST_GLOBS = [
  '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '**/__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];

export interface DiscoveryOptions {
  /** Always passed in. No module below the CLI calls `process.cwd()`. */
  cwd: string;
  /** `--specs`, bypasses detection. */
  specsPath?: string | undefined;
  /** `--code`, defaults to `cwd`. */
  codePath?: string | undefined;
  /** `--tests`, defaults to `DEFAULT_TEST_GLOBS`. */
  testGlobs?: readonly string[] | undefined;
  /** `--include-changes`: also read delta specs under `openspec/changes`. */
  includeChanges?: boolean | undefined;
  /** `--allow-empty`: tolerate a spec root that holds no `spec.md`. */
  allowEmpty?: boolean | undefined;
}

export interface DiscoveredSpec {
  /** Absolute path. */
  absolutePath: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** Path segments between the walk root and the file's directory. */
  capability: string;
}

/** A `package.json` found under the code root, parsed. */
export interface Manifest {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  json: Record<string, unknown>;
}

export interface Discovery {
  specRoot: string;
  specs: DiscoveredSpec[];
  codeRoot: string;
  /** Absolute paths, sorted by their relative path. */
  testFiles: string[];
  /** Every parsed `package.json` under the code root, sorted by path. */
  manifests: Manifest[];
  /** Relative paths of `vitest.config.*`, `vitest.workspace.*`, `jest.config.*`. */
  runnerConfigFiles: string[];
  relative(absolutePath: string): string;
}

const RUNNER_CONFIG = /^(vitest\.(config|workspace)\.[cm]?[jt]s|jest\.config\.([cm]?[jt]s|json))$/;

/** `path.relative`, forced to POSIX separators so reports are portable. */
export function toRelativePosix(cwd: string, absolutePath: string): string {
  return path.relative(cwd, absolutePath).split(path.sep).join('/');
}

/**
 * Minimal glob to RegExp conversion: `*`, `**`, `?`, `{a,b}`. Enough for test
 * file patterns, and it keeps the package dependency-free and deterministic.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] as string;
    if (char === '*') {
      const isDouble = glob[index + 1] === '*';
      if (isDouble) {
        // `**/` matches zero or more directories, `**` matches anything.
        if (glob[index + 2] === '/') {
          out += '(?:[^/]+/)*';
          index += 2;
        } else {
          out += '.*';
          index += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      continue;
    }
    if (char === '{') {
      const end = glob.indexOf('}', index);
      if (end !== -1) {
        const alternatives = glob
          .slice(index + 1, end)
          .split(',')
          .map((alternative) => alternative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        out += `(?:${alternatives.join('|')})`;
        index = end;
        continue;
      }
    }
    out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

async function readManifest(target: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(target, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Recursive walk, excluded directories pruned, symlinks not followed. */
async function walk(root: string, onFile: (absolutePath: string) => void): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      await walk(absolutePath, onFile);
      continue;
    }
    if (entry.isFile()) onFile(absolutePath);
  }
}

function resolveSpecRoot(cwd: string, specsPath: string | undefined): string {
  if (specsPath !== undefined) {
    const explicit = path.resolve(cwd, specsPath);
    if (!existsSync(explicit)) {
      throw new OpenSpecGuardError(
        'E_SPECS_NOT_FOUND',
        `--specs points at ${toRelativePosix(cwd, explicit)}, which does not exist.`,
      );
    }
    return explicit;
  }

  const openspec = path.join(cwd, 'openspec', 'specs');
  const bare = path.join(cwd, 'specs');
  const hasOpenspec = existsSync(openspec);
  const hasBare = existsSync(bare);

  if (hasOpenspec && hasBare) {
    throw new OpenSpecGuardError(
      'E_SPECS_AMBIGUOUS',
      'Both openspec/specs and specs exist. Pass --specs to say which one holds the specs.',
    );
  }
  if (hasOpenspec) return openspec;
  if (hasBare) return bare;
  throw new OpenSpecGuardError(
    'E_SPECS_NOT_FOUND',
    'No spec directory found. Expected openspec/specs or specs, or pass --specs.',
  );
}

function capabilityOf(root: string, absolutePath: string, prefix: string): string {
  const relative = path.relative(root, path.dirname(absolutePath)).split(path.sep).join('/');
  const parts = [prefix, relative].filter((part) => part !== '');
  return parts.join('/');
}

export async function discover(options: DiscoveryOptions): Promise<Discovery> {
  const cwd = path.resolve(options.cwd);
  const specRoot = resolveSpecRoot(cwd, options.specsPath);

  const specs: DiscoveredSpec[] = [];
  const collectSpecs = async (root: string, prefix: string): Promise<void> => {
    await walk(root, (absolutePath) => {
      if (path.basename(absolutePath) !== 'spec.md') return;
      specs.push({
        absolutePath,
        file: toRelativePosix(cwd, absolutePath),
        capability: capabilityOf(root, absolutePath, prefix),
      });
    });
  };

  await collectSpecs(specRoot, '');

  if (options.includeChanges === true) {
    // Changes live beside the specs, not inside them. Archived changes are
    // skipped: they describe work already folded into the base specs.
    const changesRoot = path.join(path.dirname(specRoot), 'changes');
    if (await isDirectory(changesRoot)) {
      const entries = await readdir(changesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive') continue;
        await collectSpecs(path.join(changesRoot, entry.name), `changes/${entry.name}`);
      }
    }
  }

  specs.sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));

  if (specs.length === 0 && options.allowEmpty !== true) {
    throw new OpenSpecGuardError(
      'E_SPECS_EMPTY',
      `${toRelativePosix(cwd, specRoot)} contains no spec.md. ` +
        'Reporting success on zero criteria is the worst failure mode for a gate; ' +
        'pass --allow-empty if that is genuinely what you want.',
    );
  }

  const codeRoot = path.resolve(cwd, options.codePath ?? '.');
  if (!(await isDirectory(codeRoot))) {
    throw new OpenSpecGuardError(
      'E_CODE_NOT_FOUND',
      `--code points at ${toRelativePosix(cwd, codeRoot)}, which is not a directory.`,
    );
  }

  const globs = (options.testGlobs ?? DEFAULT_TEST_GLOBS).map(globToRegExp);
  const testFiles: string[] = [];
  const manifestPaths: string[] = [];
  const runnerConfigFiles: string[] = [];

  // One walk of the code root feeds three things: the test files, the
  // manifests and the runner config files. Runner detection stays a pure
  // function over what this walk found.
  await walk(codeRoot, (absolutePath) => {
    const basename = path.basename(absolutePath);
    if (basename === 'package.json') manifestPaths.push(absolutePath);
    if (RUNNER_CONFIG.test(basename)) runnerConfigFiles.push(toRelativePosix(cwd, absolutePath));
    const relative = path.relative(codeRoot, absolutePath).split(path.sep).join('/');
    if (globs.some((glob) => glob.test(relative))) testFiles.push(absolutePath);
  });

  const byPath = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  testFiles.sort(byPath);
  manifestPaths.sort(byPath);
  runnerConfigFiles.sort(byPath);

  const manifests: Manifest[] = [];
  for (const manifestPath of manifestPaths) {
    const parsed = await readManifest(manifestPath);
    // A malformed package.json is not our business: we are not the package
    // manager. It simply provides no evidence.
    if (parsed) manifests.push({ file: toRelativePosix(cwd, manifestPath), json: parsed });
  }

  return {
    specRoot,
    specs,
    codeRoot,
    testFiles,
    manifests,
    runnerConfigFiles,
    relative: (absolutePath: string) => toRelativePosix(cwd, absolutePath),
  };
}
