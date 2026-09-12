import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseDocument } from '../aidd/parse.js';
import { buildCriteria } from '../criteria.js';
import { discover, type DiscoveryOptions } from '../discovery.js';
import { AiddGuardError, AnnotationErrors } from '../errors.js';
import { applyEdits, nonTestableAnnotation, testAnnotation, type LinkEdit } from '../link/edit.js';
import {
  buildTestIndex,
  DEFAULT_MATCH_OPTIONS,
  matchCriterion,
  type MatchOptions,
} from '../matching/match.js';
import { normalize } from '../matching/normalize.js';
import { detectRunner, type Runner } from '../tests/detect.js';
import { extractTestTitles } from '../tests/extract.js';
import type { Candidate, Criterion, TestTitle } from '../types.js';

/**
 * `aidd-guard link`.
 *
 * `check` says what is not linked. This is how that gets paid down: for every
 * criterion with no selector, show the candidate test titles the matcher
 * already computed, and write the chosen one back into the document.
 *
 * It exists because of a measurement: on the AIDD framework repository, half
 * the criteria land in `uncertain`, which is less a shrug than a work queue.
 * The right test is usually on screen already; what is missing is one line.
 *
 * The decision loop is injected rather than hard-wired to a terminal, so the
 * whole command is testable without a TTY, and so another front end could
 * drive the same core later.
 */

export interface LinkProposal {
  criterion: Criterion;
  /** Best first, deterministic order. Possibly empty. */
  candidates: Candidate[];
  /**
   * Free-text search over every extracted test title.
   *
   * This is what makes the command useful on a repository whose documents and
   * tests are written in different languages: similarity proposes nothing
   * there, so the operator needs to look for the test by a word they know is
   * in its title.
   */
  search: (query: string) => Candidate[];
  /** How many test titles the search can see at all. */
  titleCount: number;
}

export type LinkChoice =
  | { kind: 'test'; selector: string }
  | { kind: 'non-testable'; reason: string }
  | { kind: 'skip' }
  | { kind: 'quit' };

export type LinkAsk = (proposal: LinkProposal) => Promise<LinkChoice>;

export interface LinkInput extends DiscoveryOptions {
  runner?: Runner | undefined;
  /** How many candidates to offer per criterion. */
  maxCandidates?: number | undefined;
  /** Stop after this many criteria. */
  limit?: number | undefined;
  /** Write nothing; report what would have been written. */
  dryRun?: boolean | undefined;
  /** Minimum score for a candidate to be offered at all. */
  minScore?: number | undefined;
  /** Only walk criteria whose box is already ticked. */
  claimedOnly?: boolean | undefined;
  /**
   * `confidence` walks the best-ranked criteria first, which is what makes a
   * twenty-minute session the most productive twenty minutes. `document` walks
   * them in the order they appear, for working through one file at a time.
   */
  order?: 'confidence' | 'document' | undefined;
  matchOptions?: Partial<MatchOptions> | undefined;
  ask: LinkAsk;
}

export interface LinkRecord {
  id: string;
  file: string;
  text: string;
}

export interface LinkResult {
  /** Criteria that had no annotation when the run started. */
  considered: number;
  linked: (LinkRecord & { selector: string })[];
  markedNonTestable: (LinkRecord & { reason: string })[];
  skipped: number;
  /** Criteria never reached, because the operator quit or a limit was hit. */
  remaining: number;
  /** Files that were rewritten. Empty under --dry-run. */
  filesWritten: string[];
  dryRun: boolean;
}

const DEFAULT_MAX_CANDIDATES = 5;

export async function runLink(input: LinkInput): Promise<LinkResult> {
  const discovery = await discover(input);

  const sources = new Map<string, string>();
  const documents = await Promise.all(
    discovery.documents.map(async (document) => {
      const source = await readFile(document.absolutePath, 'utf8');
      sources.set(document.file, source);
      return { ...parseDocument(source, document.file), task: document.task };
    }),
  );

  const { criteria, errors } = buildCriteria(documents);
  if (errors.length > 0) throw new AnnotationErrors(errors);

  // Detection is not used to branch, only to fail clearly on a repository with
  // no runner at all: there would be nothing to link to.
  detectRunner(discovery.manifests, discovery.runnerConfigFiles, input.runner);

  const titles: TestTitle[] = [];
  for (const absolutePath of discovery.testFiles) {
    const relative = discovery.relative(absolutePath);
    titles.push(...extractTestTitles(await readFile(absolutePath, 'utf8'), relative).titles);
  }
  const index = buildTestIndex(titles);

  const leafCount = new Map<string, number>();
  for (const title of titles) {
    leafCount.set(title.leaf.trim(), (leafCount.get(title.leaf.trim()) ?? 0) + 1);
  }

  const asCandidate = (title: TestTitle): Candidate => ({
    fullName: title.fullName,
    leaf: title.leaf,
    leafAmbiguous: (leafCount.get(title.leaf.trim()) ?? 0) > 1,
    file: title.file,
    line: title.line,
    score: 0,
    matchedOn: 'fullName',
    sharedTerms: [],
    skipped: title.skipped,
  });

  /**
   * Substring search on the folded, lowercased title, so `reglage` finds
   * `Réglages` and `login` finds `Login`. Deliberately not the Jaccard scorer:
   * the operator is telling us the word, they do not need to be scored.
   */
  const search = (query: string): Candidate[] => {
    const needle = normalize(query).tokens;
    const raw = query.trim().toLowerCase();
    if (raw === '') return [];
    return titles
      .filter((title) => {
        const hay = normalize(title.fullName);
        return (
          title.fullName.toLowerCase().includes(raw) ||
          (needle.length > 0 && needle.every((token) => hay.set.has(token)))
        );
      })
      .map(asCandidate);
  };

  const matchOptions: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...input.matchOptions };
  const minScore = input.minScore ?? 0;
  const maxCandidates = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  // Only criteria that carry no directive at all. An existing annotation is a
  // human decision, and this command never overwrites one.
  const unlinked = criteria.filter((criterion) => {
    if (criterion.annotation !== null) return false;
    // `--claimed` walks the contradictions first: a box someone ticked, with
    // nothing behind it, is worth more of an operator's attention than a
    // criterion nobody has claimed yet.
    if (input.claimedOnly === true && criterion.claimed !== true) return false;
    return true;
  });

  // Every match is computed up front, which costs nothing extra and is what
  // lets the walk be ordered by how much it has to offer.
  const proposals = unlinked.map((criterion) => {
    const match = matchCriterion({ ...criterion, annotation: null }, index, matchOptions);
    const candidates = [match.best, ...match.runnersUp]
      .filter((candidate): candidate is Candidate => candidate !== null)
      .filter((candidate) => candidate.score >= minScore)
      .slice(0, maxCandidates);
    return { criterion, candidates, best: match.best?.score ?? 0 };
  });

  if ((input.order ?? 'confidence') === 'confidence') {
    proposals.sort((left, right) => {
      if (left.best !== right.best) return right.best - left.best;
      if (left.criterion.file !== right.criterion.file) {
        return left.criterion.file < right.criterion.file ? -1 : 1;
      }
      return left.criterion.line - right.criterion.line;
    });
  }

  const result: LinkResult = {
    considered: unlinked.length,
    linked: [],
    markedNonTestable: [],
    skipped: 0,
    remaining: 0,
    filesWritten: [],
    dryRun: input.dryRun === true,
  };

  const editsByFile = new Map<string, LinkEdit[]>();
  const limit = input.limit ?? unlinked.length;
  let handled = 0;

  for (const { criterion, candidates } of proposals) {
    if (handled >= limit) break;
    handled += 1;

    const choice = await input.ask({
      criterion,
      candidates,
      search: (query) => search(query).slice(0, maxCandidates),
      titleCount: titles.length,
    });

    if (choice.kind === 'quit') break;
    if (choice.kind === 'skip') {
      result.skipped += 1;
      continue;
    }

    if (choice.kind === 'test' && choice.selector.trim() === '') {
      throw new AiddGuardError('E_LINK_EMPTY_SELECTOR', 'An empty selector links nothing.', {
        file: criterion.file,
        line: criterion.line,
      });
    }

    const annotation =
      choice.kind === 'test'
        ? testAnnotation(choice.selector)
        : nonTestableAnnotation(choice.reason);

    const edit: LinkEdit = {
      line: criterion.endLine,
      indent: criterion.indent,
      annotation,
    };
    const bucket = editsByFile.get(criterion.file);
    if (bucket) bucket.push(edit);
    else editsByFile.set(criterion.file, [edit]);

    const record: LinkRecord = { id: criterion.id, file: criterion.file, text: criterion.text };
    if (choice.kind === 'test') {
      result.linked.push({ ...record, selector: choice.selector });
    } else {
      result.markedNonTestable.push({ ...record, reason: choice.reason });
    }
  }

  result.remaining = unlinked.length - handled;

  // Written once per file, at the end. A run that is interrupted halfway
  // leaves either a whole file or nothing, never a half-annotated document.
  for (const [file, edits] of [...editsByFile.entries()].sort()) {
    const source = sources.get(file);
    if (source === undefined) continue;
    const updated = applyEdits(source, edits, file);
    if (!result.dryRun) {
      await writeFile(path.resolve(input.cwd, file), updated, 'utf8');
      result.filesWritten.push(file);
    }
  }

  return result;
}
