import { createInterface, type Interface } from 'node:readline/promises';

import type { LinkAsk, LinkChoice, LinkProposal } from '../commands/link.js';

/**
 * The terminal front end for `link`.
 *
 * Everything here is I/O. The decision logic lives in `commands/link.ts` and is
 * driven through the same `LinkAsk` interface, so the command is tested without
 * a terminal and this file stays thin enough to read in one sitting.
 */

function render(proposal: LinkProposal, index: number, total: number): string {
  return renderWith(proposal, proposal.candidates, index, total);
}

function renderWith(
  proposal: LinkProposal,
  candidates: readonly LinkProposal['candidates'][number][],
  index: number,
  total: number,
): string {
  const { criterion } = proposal;
  const lines = [
    '',
    `[${index}/${total}] ${criterion.capability}  ${criterion.scenario}`,
    `        ${criterion.file}:${criterion.line}`,
    '',
  ];

  if (candidates.length === 0) {
    lines.push(
      '  No candidate test shares a significant word with this scenario.',
      `  Search the ${proposal.titleCount} test titles instead: /word`,
    );
  } else {
    candidates.forEach((candidate, position) => {
      lines.push(
        `  ${position + 1}) ${candidate.fullName}`,
        `     ${candidate.file}:${candidate.line}  score ${candidate.score.toFixed(2)}` +
          (candidate.sharedTerms.length > 0
            ? `  shared: ${candidate.sharedTerms.join(', ')}`
            : '') +
          (candidate.skipped ? '  [test is skipped]' : ''),
      );
    });
  }

  lines.push(
    '',
    '  1-9 link to that test     /word search the test titles',
    '  t <title> link to a title you type',
    '  n <reason> not testable   s skip   q quit and write what is done',
    '',
  );
  return lines.join('\n');
}

type Parsed = LinkChoice | 'retry' | { kind: 'search'; query: string };

function parse(
  answer: string,
  proposal: LinkProposal,
  candidates: readonly LinkProposal['candidates'][number][] = proposal.candidates,
): Parsed {
  const input = answer.trim();
  if (input === '') return { kind: 'skip' };

  if (input.startsWith('/')) {
    const query = input.slice(1).trim();
    return query === '' ? 'retry' : { kind: 'search', query };
  }

  const [head, ...rest] = input.split(/\s+/);
  const tail = input.slice((head ?? '').length).trim();

  if (head === 'q') return { kind: 'quit' };
  if (head === 's') return { kind: 'skip' };

  if (head === 't') {
    return tail === '' ? 'retry' : { kind: 'test', selector: tail };
  }

  if (head === 'n') {
    // A reason is mandatory here for the same reason the parser demands one:
    // a skipped criterion without a reason is not auditable.
    return tail === '' ? 'retry' : { kind: 'non-testable', reason: tail };
  }

  if (/^[1-9]$/.test(head ?? '') && rest.length === 0) {
    const candidate = candidates[Number(head) - 1];
    // The shortest selector that still names exactly one test: the leaf when it
    // is unique, the full describe path when it is not.
    return candidate
      ? { kind: 'test', selector: candidate.leafAmbiguous ? candidate.fullName : candidate.leaf }
      : 'retry';
  }

  return 'retry';
}

export function createTerminalAsk(
  total: number,
  write: (text: string) => void = (text) => process.stderr.write(text),
  rl: Interface = createInterface({ input: process.stdin, output: process.stderr }),
): { ask: LinkAsk; close: () => void } {
  let index = 0;

  const ask: LinkAsk = async (proposal) => {
    index += 1;
    // The numbered list is whatever is on screen right now: the proposed
    // candidates at first, the last search results after a /query.
    let shown = proposal.candidates;
    write(renderWith(proposal, shown, index, total));

    for (;;) {
      const answer = await rl.question('  > ');
      const choice = parse(answer, proposal, shown);

      if (choice === 'retry') {
        write('  Not understood. Enter a number, /word, or t/n/s/q.\n');
        continue;
      }
      if (choice.kind === 'search') {
        shown = proposal.search(choice.query);
        if (shown.length === 0) write(`  Nothing matches ${JSON.stringify(choice.query)}.\n`);
        else write(renderWith(proposal, shown, index, total));
        continue;
      }
      return choice;
    }
  };

  return { ask, close: () => rl.close() };
}

export const __testing = { render, parse };
