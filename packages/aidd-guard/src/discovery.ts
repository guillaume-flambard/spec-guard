import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { AiddGuardError } from './errors.js';

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

/**
 * The three carriers AIDD actually writes, measured on the framework
 * repository: `spec.md` holds Done-when, `plan.md` and `phase-N.md` hold the
 * acceptance checkboxes. A `review.md` or a `brainstorm.md` also contains
 * boxes, but they track a reading, not a promise about the product, so they
 * stay out unless `--docs` asks for them.
 */
export const DEFAULT_DOC_GLOBS = ['**/spec.md', '**/plan.md', '**/phase-*.md'];

export const DEFAULT_TEST_GLOBS = [
  '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '**/__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];

export interface DiscoveryOptions {
  /** Always passed in. No module below the CLI calls `process.cwd()`. */
  cwd: string;
  /** `--tasks`, bypasses detection. */
  tasksPath?: string | undefined;
  /** `--docs`, defaults to `DEFAULT_DOC_GLOBS`, relative to the tasks root. */
  docGlobs?: readonly string[] | undefined;
  /** `--code`, defaults to `cwd`. */
  codePath?: string | undefined;
  /** `--tests`, defaults to `DEFAULT_TEST_GLOBS`. */
  testGlobs?: readonly string[] | undefined;
  /** `--allow-empty`: tolerate a tasks root that holds no document. */
  allowEmpty?: boolean | undefined;
}

export interface DiscoveredDocument {
  /** Absolute path. */
  absolutePath: string;
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /**
   * The task folder, relative to the tasks root:
   * `2026_09/2026_09_04_memory-check`. Empty for a document sitting directly
   * in the root.
   */
  task: string;
}

/** A `package.json` found under the code root, parsed. */
export interface Manifest {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  json: Record<string, unknown>;
}

export interface Discovery {
  tasksRoot: string;
  documents: DiscoveredDocument[];
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
 * Minimal glob to RegExp conversion: `*`, `**`, `?`, `{a,b}`. Enough for file
 * patterns, and it keeps the package dependency-free and deterministic.
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

/**
 * `aidd_docs/tasks` is where `/aidd-pm:04-spec` writes, so it is the default.
 * `docs/tasks` is accepted because a repository that renamed the folder still
 * keeps the shape, and `--tasks` settles anything else.
 */
function resolveTasksRoot(cwd: string, tasksPath: string | undefined): string {
  if (tasksPath !== undefined) {
    const explicit = path.resolve(cwd, tasksPath);
    if (!existsSync(explicit)) {
      throw new AiddGuardError(
        'E_TASKS_NOT_FOUND',
        `--tasks points at ${toRelativePosix(cwd, explicit)}, which does not exist.`,
      );
    }
    return explicit;
  }

  const aidd = path.join(cwd, 'aidd_docs', 'tasks');
  const bare = path.join(cwd, 'docs', 'tasks');
  const hasAidd = existsSync(aidd);
  const hasBare = existsSync(bare);

  if (hasAidd && hasBare) {
    throw new AiddGuardError(
      'E_TASKS_AMBIGUOUS',
      'Both aidd_docs/tasks and docs/tasks exist. Pass --tasks to say which one holds the tasks.',
    );
  }
  if (hasAidd) return aidd;
  if (hasBare) return bare;
  throw new AiddGuardError(
    'E_TASKS_NOT_FOUND',
    'No task directory found. Expected aidd_docs/tasks or docs/tasks, or pass --tasks.',
  );
}

function taskOf(root: string, absolutePath: string): string {
  return path.relative(root, path.dirname(absolutePath)).split(path.sep).join('/');
}

export async function discover(options: DiscoveryOptions): Promise<Discovery> {
  const cwd = path.resolve(options.cwd);
  const tasksRoot = resolveTasksRoot(cwd, options.tasksPath);

  const docGlobs = (options.docGlobs ?? DEFAULT_DOC_GLOBS).map(globToRegExp);
  const documents: DiscoveredDocument[] = [];

  await walk(tasksRoot, (absolutePath) => {
    const relative = path.relative(tasksRoot, absolutePath).split(path.sep).join('/');
    if (!docGlobs.some((glob) => glob.test(relative))) return;
    documents.push({
      absolutePath,
      file: toRelativePosix(cwd, absolutePath),
      task: taskOf(tasksRoot, absolutePath),
    });
  });

  documents.sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));

  if (documents.length === 0 && options.allowEmpty !== true) {
    throw new AiddGuardError(
      'E_TASKS_EMPTY',
      `${toRelativePosix(cwd, tasksRoot)} contains no task document. ` +
        'Reporting success on zero criteria is the worst failure mode for a gate; ' +
        'pass --allow-empty if that is genuinely what you want.',
    );
  }

  const codeRoot = path.resolve(cwd, options.codePath ?? '.');
  if (!(await isDirectory(codeRoot))) {
    throw new AiddGuardError(
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
    tasksRoot,
    documents,
    codeRoot,
    testFiles,
    manifests,
    runnerConfigFiles,
    relative: (absolutePath: string) => toRelativePosix(cwd, absolutePath),
  };
}
