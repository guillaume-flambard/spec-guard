import ts from 'typescript';

import type { TestModifier, TestTitle } from '../types.js';

/**
 * Test title extraction.
 *
 * We use the TypeScript compiler through `ts.createSourceFile`, which is a
 * purely syntactic parse: no Program, no type checker, no tsconfig resolution,
 * no disk access beyond the string we hand it. `typescript` is already a
 * dependency, so this costs no extra dependency tree.
 *
 * Not chosen, and why:
 *   - `@babel/parser`: a wider dependency tree and a second TypeScript dialect
 *     to keep up with.
 *   - `oxc-parser` / `swc`: native binaries, which would close the door on the
 *     self-contained Action bundle that has to run without an install.
 *   - a regular expression: broken by apostrophes inside titles, by `it(` in a
 *     comment or a string, and by escapes. Not negotiable.
 *
 * The module boundary is deliberately narrow, `(source, relPath) => result`,
 * so swapping the parser later stays a one-file change.
 */

const SUITE_NAMES = new Set(['describe', 'suite', 'context', 'fdescribe', 'xdescribe']);
const TEST_NAMES = new Set(['it', 'test', 'fit', 'xit']);
/** Names that are skipped or focused by the identifier itself. */
const X_PREFIXED = new Set(['xit', 'xdescribe']);
const F_PREFIXED = new Set(['fit', 'fdescribe']);

const MODIFIERS = new Set<TestModifier>([
  'skip',
  'only',
  'todo',
  'each',
  'concurrent',
  'failing',
  'sequential',
]);

export interface DynamicTitle {
  file: string;
  line: number;
  reason: string;
}

export interface ExtractionResult {
  titles: TestTitle[];
  unparsedFiles: { file: string; message: string }[];
  /** Calls whose title could not be known statically. Surfaced to the user. */
  dynamicTitles: DynamicTitle[];
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  // Explicit TSX is mandatory: parsed as TS, a generic arrow `<T>() => {}`
  // reads as JSX and the whole file breaks.
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
};

function scriptKindOf(relPath: string): ts.ScriptKind {
  const dot = relPath.lastIndexOf('.');
  const extension = dot === -1 ? '' : relPath.slice(dot);
  return SCRIPT_KINDS[extension] ?? ts.ScriptKind.TS;
}

interface CallInfo {
  kind: 'suite' | 'test';
  modifiers: TestModifier[];
  skipped: boolean;
}

/**
 * Unwraps the callee through property accesses, intermediate calls and tagged
 * templates, so `describe.skip.each([...])(...)` and ``describe.each`t`(...)``
 * both resolve to the root identifier `describe` plus its modifier chain.
 *
 * The root must be a bare identifier: `foo.it(...)` and `this.it(...)` are
 * rejected, because they are somebody else's `it`.
 */
function analyzeCallee(expression: ts.Expression): { root: string; properties: string[] } | null {
  const properties: string[] = [];
  let current: ts.Node = expression;

  for (;;) {
    if (ts.isIdentifier(current)) {
      return { root: current.text, properties: properties.reverse() };
    }
    if (ts.isPropertyAccessExpression(current)) {
      properties.push(current.name.text);
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isTaggedTemplateExpression(current)) {
      current = current.tag;
      continue;
    }
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    return null;
  }
}

function classify(node: ts.CallExpression): CallInfo | null {
  const callee = analyzeCallee(node.expression);
  if (!callee) return null;

  const isSuite = SUITE_NAMES.has(callee.root);
  const isTest = TEST_NAMES.has(callee.root);
  if (!isSuite && !isTest) return null;

  const modifiers = callee.properties.filter((property): property is TestModifier =>
    MODIFIERS.has(property as TestModifier),
  );
  if (X_PREFIXED.has(callee.root)) modifiers.unshift('skip');
  if (F_PREFIXED.has(callee.root)) modifiers.unshift('only');

  return {
    kind: isSuite ? 'suite' : 'test',
    modifiers,
    skipped: modifiers.includes('skip') || modifiers.includes('todo'),
  };
}

/**
 * A title is usable only when it can be known without running anything:
 * string literals, templates without substitution, and concatenations of
 * those. Anything else is reported, never guessed.
 */
function staticTitle(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticTitle(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticTitle(node.left);
    const right = staticTitle(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}

function dynamicReason(node: ts.Expression | undefined): string {
  if (!node) return 'call has no title argument';
  if (ts.isTemplateExpression(node)) return 'template literal with a substitution';
  if (ts.isIdentifier(node)) return `title comes from the variable \`${node.text}\``;
  if (ts.isCallExpression(node)) return 'title comes from a function call';
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return 'title comes from a property lookup';
  }
  return 'title is not a static string';
}

/** A frame with a `null` title is a suite whose name could not be resolved. */
interface Frame {
  title: string | null;
  skipped: boolean;
}

export function extractTestTitles(source: string, relPath: string): ExtractionResult {
  const titles: TestTitle[] = [];
  const dynamicTitles: DynamicTitle[] = [];
  const unparsedFiles: { file: string; message: string }[] = [];

  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKindOf(relPath),
  );

  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  const firstDiagnostic = diagnostics?.[0];
  if (firstDiagnostic) {
    // A broken file must not take the whole run down. We record it and move on,
    // because the partial tree is still worth reading.
    unparsedFiles.push({
      file: relPath,
      message: ts.flattenDiagnosticMessageText(firstDiagnostic.messageText, ' '),
    });
  }

  const lineOf = (node: ts.Node): number =>
    ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;

  const stack: Frame[] = [];

  const visit = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const info = classify(node);
    if (!info) {
      ts.forEachChild(node, visit);
      return;
    }

    const titleArgument = node.arguments[0];
    const title = staticTitle(titleArgument);
    const inheritedSkip = stack.some((frame) => frame.skipped);
    const skipped = info.skipped || inheritedSkip;

    if (info.kind === 'suite') {
      if (title === null) {
        dynamicTitles.push({
          file: relPath,
          line: lineOf(titleArgument ?? node),
          reason: `suite: ${dynamicReason(titleArgument)}`,
        });
      }
      stack.push({ title, skipped });
      ts.forEachChild(node, visit);
      stack.pop();
      return;
    }

    const hasDynamicAncestor = stack.some((frame) => frame.title === null);
    if (title === null || hasDynamicAncestor) {
      // Emitting `undefined > my test` would produce an unstable full name and
      // a selector nobody could write. We report instead.
      dynamicTitles.push({
        file: relPath,
        line: lineOf(titleArgument ?? node),
        reason:
          title === null
            ? dynamicReason(titleArgument)
            : 'enclosing suite title is not statically known',
      });
      ts.forEachChild(node, visit);
      return;
    }

    const suitePath = stack.map((frame) => frame.title as string);
    const fullPath = [...suitePath, title];
    titles.push({
      file: relPath,
      line: lineOf(titleArgument ?? node),
      path: fullPath,
      fullName: fullPath.join(' > '),
      leaf: title,
      modifiers: info.modifiers,
      parameterized: info.modifiers.includes('each'),
      skipped,
    });

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  return { titles, unparsedFiles, dynamicTitles };
}
