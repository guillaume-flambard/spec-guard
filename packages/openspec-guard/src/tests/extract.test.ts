import { describe, expect, it } from 'vitest';

import { extractTestTitles } from './extract.js';

function names(source: string, file = 'a.test.ts'): string[] {
  return extractTestTitles(source, file).titles.map((title) => title.fullName);
}

describe('extractTestTitles', () => {
  it('reads nested suites three levels deep', () => {
    const source = `
      describe('a', () => {
        describe('b', () => {
          it('c', () => {});
        });
      });
    `;
    expect(names(source)).toEqual(['a > b > c']);
  });

  it('reads every suite and test alias', () => {
    const source = `
      suite('s', () => { it('one', () => {}); });
      context('c', () => { test('two', () => {}); });
    `;
    expect(names(source)).toEqual(['s > one', 'c > two']);
  });

  it('records the line of the title', () => {
    const source = "describe('a', () => {\n  it('b', () => {});\n});\n";
    expect(extractTestTitles(source, 'a.test.ts').titles[0]?.line).toBe(2);
  });

  it('keeps an each template as written, never expanded', () => {
    const source = "it.each([[1], [2]])('adds %i', () => {});";
    const [title] = extractTestTitles(source, 'a.test.ts').titles;
    expect(title?.leaf).toBe('adds %i');
    expect(title?.parameterized).toBe(true);
    expect(title?.modifiers).toContain('each');
  });

  it('handles describe.each with a tagged template', () => {
    const source = 'describe.each`\na\n${1}\n`("group $a", () => { it("inner", () => {}); });';
    expect(names(source)).toEqual(['group $a > inner']);
  });

  it('marks it.skip, xit and todo as skipped', () => {
    const source = `
      it.skip('a', () => {});
      xit('b', () => {});
      it.todo('c');
    `;
    const { titles } = extractTestTitles(source, 'a.test.ts');
    expect(titles.map((title) => title.skipped)).toEqual([true, true, true]);
  });

  it('inherits skip from an enclosing suite', () => {
    const source = "describe.skip('outer', () => { it('inner', () => {}); });";
    expect(extractTestTitles(source, 'a.test.ts').titles[0]?.skipped).toBe(true);
  });

  it('records only without letting it change anything else', () => {
    const source = "it.only('a', () => {}); fit('b', () => {});";
    const { titles } = extractTestTitles(source, 'a.test.ts');
    expect(titles.map((title) => title.modifiers)).toEqual([['only'], ['only']]);
    expect(titles.every((title) => !title.skipped)).toBe(true);
  });

  it('reports a template literal title instead of emitting it', () => {
    const source = 'const n = 1; it(`case ${n}`, () => {});';
    const result = extractTestTitles(source, 'a.test.ts');
    expect(result.titles).toEqual([]);
    expect(result.dynamicTitles[0]?.reason).toContain('template literal');
  });

  it('drops every leaf under a dynamically named suite', () => {
    const source = 'const n = "x"; describe(n, () => { it("inner", () => {}); });';
    const result = extractTestTitles(source, 'a.test.ts');
    expect(result.titles).toEqual([]);
    expect(result.dynamicTitles).toHaveLength(2);
    expect(result.dynamicTitles[1]?.reason).toContain('enclosing suite');
  });

  it('folds a concatenation of string literals', () => {
    expect(names("it('a' + ' ' + 'b', () => {});")).toEqual(['a b']);
  });

  it('reports a title taken from a variable', () => {
    const result = extractTestTitles('const t = "x"; it(t, () => {});', 'a.test.ts');
    expect(result.titles).toEqual([]);
    expect(result.dynamicTitles[0]?.reason).toContain('variable');
  });

  it('reads a test declared inside a helper function', () => {
    const source = `
      function cases() { it('from a helper', () => {}); }
      describe('outer', () => { cases(); });
    `;
    expect(names(source)).toEqual(['from a helper']);
  });

  it('parses a tsx file with a generic arrow function', () => {
    const source = "const identity = <T,>(value: T) => value;\nit('generic', () => {});";
    const result = extractTestTitles(source, 'a.test.tsx');
    expect(result.unparsedFiles).toEqual([]);
    expect(result.titles.map((title) => title.leaf)).toEqual(['generic']);
  });

  it('records a syntactically broken file instead of throwing', () => {
    const result = extractTestTitles("it('a', () => {  ", 'broken.test.ts');
    expect(result.unparsedFiles).toHaveLength(1);
    expect(result.unparsedFiles[0]?.file).toBe('broken.test.ts');
  });

  it('ignores a test-looking call on some other object', () => {
    expect(names("foo.it('a', () => {}); this.test('b', () => {});")).toEqual([]);
  });

  it('ignores it( inside a comment or a string', () => {
    const source = `
      // it('commented out', () => {});
      const s = "it('in a string', () => {})";
      it('real', () => {});
    `;
    expect(names(source)).toEqual(['real']);
  });

  it('keeps an apostrophe inside a title', () => {
    expect(names('it("j\'aime les tests", () => {});')).toEqual(["j'aime les tests"]);
  });

  it('reports a call with no title argument', () => {
    const result = extractTestTitles('it();', 'a.test.ts');
    expect(result.dynamicTitles[0]?.reason).toContain('no title argument');
  });
});
