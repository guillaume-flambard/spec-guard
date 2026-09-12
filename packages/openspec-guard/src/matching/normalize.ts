/**
 * Tokenization for similarity scoring.
 *
 * Read this before trusting a score: the English and French stopword lists are
 * merged so that both languages are CLEANED the same way. Nothing here
 * translates. `changer` does not become `change`, and `langue` does not become
 * `language`. A French scenario title and an English test title share tokens
 * only by lexical accident, mostly on borrowed words and code identifiers.
 *
 * That is why the explicit `openspec-guard:test` selector is the primary mechanism
 * and similarity is a convenience for single-language repositories.
 *
 * No stemming either. A French stemmer is a real dependency, and it would not
 * cross the language barrier any better.
 */

const MIN_TOKEN_LENGTH = 3;

// Space-separated so the lists stay readable. Split once, at module load.
const ENGLISH_STOPWORDS = `
  the and for with that this from when then given should shall must will not but are was were
  been being has have had does did can could would may might into onto over under out off its
  his her their our your any all each some such than they them there here what which who whom
  how why own via per about after before while also only very just still yet because without
  within
`;

const FRENCH_STOPWORDS = `
  les des une aux que qui quoi dont pour par sur sous dans avec sans mais donc car est sont
  etait etaient ete etre avoir fait faire plus moins tout tous toute toutes meme aussi ainsi
  alors quand lorsque depuis jusqu entre chez leur leurs elle elles nous vous ils ses son cet
  cette ces celui celle ceux doit doivent peut peuvent pas non oui deja encore apres avant
  pendant vers selon afin
`;

function words(list: string): string[] {
  return list.split(/\s+/).filter((word) => word !== '');
}

export const STOPWORDS: ReadonlySet<string> = new Set([
  ...words(ENGLISH_STOPWORDS),
  ...words(FRENCH_STOPWORDS),
]);

export interface NormalizedTitle {
  /** Significant tokens, in first-seen order, deduplicated. */
  tokens: string[];
  set: ReadonlySet<string>;
}

/** Folds diacritics: `Réservé` becomes `reserve`, so both spellings tokenize alike. */
function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '');
}

export function normalize(text: string): NormalizedTitle {
  const folded = foldDiacritics(text)
    .toLowerCase()
    // Apostrophes are separators, not letters: `j'aime` becomes `j aime`, and
    // the one-letter `j` then falls below the length floor.
    .replace(/['’]/g, ' ');

  const tokens: string[] = [];
  const set = new Set<string>();

  for (const raw of folded.split(/[^a-z0-9]+/)) {
    if (raw.length < MIN_TOKEN_LENGTH) continue;
    if (STOPWORDS.has(raw)) continue;
    if (set.has(raw)) continue;
    set.add(raw);
    tokens.push(raw);
  }

  return { tokens, set };
}

/** Intersection size over union size. Zero when either side is empty. */
export function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Shared tokens, in the left-hand order, so a score is always explainable. */
export function sharedTerms(left: NormalizedTitle, right: ReadonlySet<string>): string[] {
  return left.tokens.filter((token) => right.has(token));
}

/** Four decimals, so a report never prints `0.30000000000000004`. */
export function roundScore(score: number): number {
  return Math.round(score * 10000) / 10000;
}
