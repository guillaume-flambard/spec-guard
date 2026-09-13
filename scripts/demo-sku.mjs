import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Pin both inputs so the published example stays reproducible.
const revision = 'c1447604023e93970169f3da17d72db7677c31bf';
const cwd = mkdtempSync(join(tmpdir(), 'openspec-guard-sku-'));
const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
git('init', '--quiet');
git('remote', 'add', 'origin', 'https://github.com/seek-oss/sku.git');
git('fetch', '--quiet', '--depth=1', 'origin', revision);
git('checkout', '--quiet', '--detach', 'FETCH_HEAD');
console.log(`Demo checkout: ${cwd}`);
console.log(`sku revision: ${revision}`);

// No sku dependency installation or test execution. Only specs and titles are read.
const check = () =>
  JSON.parse(
    execFileSync(
      'npx',
      [
        '--yes',
        'openspec-guard@0.2.0',
        'check',
        '--cwd',
        cwd,
        '--specs',
        'openspec/specs/local-dev-hosts',
        '--tests',
        'packages/sku/src/context/hosts.test.ts',
        '--runner',
        'vitest',
        '--format',
        'json',
      ],
      { cwd, encoding: 'utf8' },
    ),
  );
const before = check();
const links = new Map([
  [
    'Missing .localhost host is silent',
    'checkHosts > should not warn for missing .localhost hosts',
  ],
  ['.localhost host is written', 'setupHosts > should set app-wide hosts'],
  ['Exact localhost is not written', 'setupHosts > should skip exact localhost'],
]);
const specPath = join(cwd, 'openspec/specs/local-dev-hosts/spec.md');
let spec = readFileSync(specPath, 'utf8');
for (const [scenario, selector] of links) {
  const heading = `#### Scenario: ${scenario}`;
  assert.equal(spec.split(heading).length, 2, `Expected one heading: ${scenario}`);
  spec = spec.replace(heading, `${heading}\n\n<!-- openspec-guard:test="${selector}" -->`);
}
writeFileSync(specPath, spec);
const after = check();
assert.equal(before.summary.total, 6);
assert.equal(before.summary.pass, 0);
assert.equal(after.summary.passBySelector, 3);
for (const scenario of links.keys()) {
  const result = after.results.find((row) => row.scenario === scenario);
  assert.equal(result?.reason, 'selector');
}
// Linking selected cases must not silently turn the remaining candidates green.
for (const previous of before.results.filter((row) => !links.has(row.scenario))) {
  const next = after.results.find((row) => row.id === previous.id);
  assert.equal(next.verdict, previous.verdict);
}
for (const [label, report] of [
  ['Before', before],
  ['After', after],
]) {
  const s = report.summary;
  console.log(
    `${label}: ${s.total} criteria, ${s.pass} pass (${s.passBySelector} by selector), ${s.uncertain} uncertain, ${s.fail} fail`,
  );
  writeFileSync(join(cwd, `${label.toLowerCase()}.json`), JSON.stringify(report, null, 2) + '\n');
}
console.log('Only three annotations changed. Inspect them with:');
console.log(`git -C "${cwd}" diff`);
console.log(
  'These are title links, not proof that tests pass or assertions cover each requirement.',
);
