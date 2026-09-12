import { describe, expect, it } from 'vitest';

import { jaccard, normalize, roundScore, sharedTerms } from './normalize.js';

describe('normalize', () => {
  it('folds diacritics', () => {
    expect(normalize('Réservé').tokens).toEqual(['reserve']);
  });

  it('treats apostrophes as separators', () => {
    expect(normalize("j'aime les tests").tokens).toEqual(['aime', 'tests']);
  });

  it('drops english stopwords', () => {
    expect(normalize('the system should redirect').tokens).toEqual(['system', 'redirect']);
  });

  it('drops french stopwords', () => {
    expect(normalize('le systeme doit rediriger').tokens).toEqual(['systeme', 'rediriger']);
  });

  it('drops tokens shorter than three characters', () => {
    expect(normalize('a bc def').tokens).toEqual(['def']);
  });

  it('deduplicates while keeping first-seen order', () => {
    expect(normalize('login page login form').tokens).toEqual(['login', 'page', 'form']);
  });

  it('keeps digits inside identifiers', () => {
    expect(normalize('rate_events is opaque').tokens).toEqual(['rate', 'events', 'opaque']);
  });

  it('does not translate: a french title and its english test share nothing', () => {
    const scenario = normalize('Changer la langue');
    const test = normalize('falls back to FR for unknown language');
    expect(jaccard(scenario.set, test.set)).toBe(0);
  });
});

describe('jaccard', () => {
  it('is zero when either side is empty', () => {
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  it('is one on identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(1);
  });

  it('is intersection over union', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 10);
  });
});

describe('sharedTerms', () => {
  it('returns the shared tokens in the left-hand order', () => {
    const left = normalize('login page form');
    expect(sharedTerms(left, new Set(['form', 'login']))).toEqual(['login', 'form']);
  });
});

describe('roundScore', () => {
  it('keeps four decimals', () => {
    expect(roundScore(0.1 + 0.2)).toBe(0.3);
    expect(roundScore(1 / 3)).toBe(0.3333);
  });
});
