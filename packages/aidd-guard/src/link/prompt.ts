import { createInterface, type Interface } from 'node:readline/promises';

import type { Candidate } from '../types.js';
import type { LinkAsk, LinkChoice, LinkProposal } from '../commands/link.js';

/**
 * The terminal front end for `link`.
 *
 * Everything here is I/O. The decision logic lives in `commands/link.ts` and is
 * driven through the same `LinkAsk` interface, so the command is tested without
 * a terminal and this file stays thin enough to read in one sitting.
 *
 * It writes to stderr, never stdout: a `link` session is a conversation, and
 * whatever the shell is redirecting should not fill up with it.
 */

function renderWith(
  proposal: LinkProposal,
  candidates: readonly Candidate[],
  index: number,
  total: number,
): string {
  const { criterion } = proposal;
  const claim = criterion.claimed === true ? '  [ticked]' : '';
  const lines = [
    '',
    `[${index}/${total}] ${criterion.text}${claim}`,
    `        ${criterion.file}:${criterion.line}  ${criterion.section}`,
    '',
  ];

  if (candidates.length === 0) {
    lines.push(
      '  No candidate test shares a significant word with this criterion.',
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

function render(proposal: LinkProposal, index: number, total: number): string {
  return renderWith(proposal, proposal.candidates, index, total);
}

type Parsed = LinkChoice | 'retry' | { kind: 'search'; query: string };

function parse(
  answer: string,
  proposal: LinkProposal,
  candidates: readonly Candidate[] = proposal.candidates,
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

  /*
   * Lines are queued as they arrive rather than pulled one `rl.question` at a
   * time.
   *
   * `question` is the obvious API and it is wrong here: when the input is a
   * pipe or a file, Node delivers every line and closes the interface before
   * the second question is ever asked, so `question` rejects with
   * ERR_USE_AFTER_CLOSE and the answers already sitting in the buffer are
   * thrown away. Queuing keeps a scripted session working exactly like a typed
   * one, and end of input simply means "quit and keep what is decided".
   */
  const pending: string[] = [];
  const waiting: ((line: string | null) => void)[] = [];
  let closed = false;

  rl.on('line', (line: string) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else pending.push(line);
  });

  rl.once('close', () => {
    closed = true;
    while (waiting.length > 0) waiting.shift()?.(null);
  });

  /** The next line, or `null` once the input is exhausted. */
  const nextLine = (): Promise<string | null> => {
    const queued = pending.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiting.push(resolve));
  };

  const ask: LinkAsk = async (proposal) => {
    index += 1;
    // The numbered list is whatever is on screen right now: the proposed
    // candidates at first, the last search results after a /query.
    let shown: readonly Candidate[] = proposal.candidates;
    write(renderWith(proposal, shown, index, total));

    for (;;) {
      write('  > ');
      const answer = await nextLine();
      if (answer === null) return { kind: 'quit' };

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
