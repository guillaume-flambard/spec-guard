// Feasibility probe for one pinned corpus, not a supported Spec Kit adapter.
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

const revision = '41f331b24cb33edab98962a02f0c585fd04b6fa9';
const cwd = mkdtempSync(join(tmpdir(), 'speckit-guard-hammerkit-'));
const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
git('init', '--quiet');
git('remote', 'add', 'origin', 'https://github.com/no0dles/hammerkit.git');
git('fetch', '--quiet', '--depth=1', 'origin', revision);
git('checkout', '--quiet', '--detach', 'FETCH_HEAD');
console.log(`Probe checkout: ${cwd}`);

const check = (specs, extra = []) => {
  const run = spawnSync(
    'npx',
    [
      '--yes',
      'openspec-guard@0.2.0',
      'check',
      '--cwd',
      cwd,
      '--specs',
      specs,
      '--tests',
      'src/**/*.spec.ts',
      '--runner',
      'vitest',
      '--format',
      'json',
      ...extra,
    ],
    { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  if (run.error) throw run.error;
  assert.ok(run.status === 0 || run.status === 1, run.stderr || run.stdout);
  return { exitCode: run.status, report: JSON.parse(run.stdout), bytes: run.stdout };
};
const native = check('specs', ['--fail-on', 'fail,uncertain']);
writeFileSync(join(cwd, 'native.json'), native.bytes);
console.log(
  `Native OpenSpec parser: ${native.report.summary.total} criteria, exit ${native.exitCode}`,
);

const specFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry) =>
      entry.isDirectory()
        ? specFiles(join(dir, entry.name))
        : entry.name === 'spec.md'
          ? [join(dir, entry.name)]
          : [],
    );
const manifest = [];
const files = specFiles(join(cwd, 'specs'));
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const source = relative(cwd, file).split('\\').join('/');
  const output = join('.guard-probe-specs', relative(join(cwd, 'specs'), file));
  let story = null;
  let accepting = false;
  const scenarios = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^### (User Story \d+ .+)$/);
    if (heading) story = heading[1];
    if (/^#{1,6} |^---\s*$/.test(line)) accepting = false;
    if (line.trim() === '**Acceptance Scenarios**:') {
      accepting = true;
      continue;
    }
    if (!accepting || !line.trim()) continue;
    // The pinned corpus uses one numbered G/W/T scenario per line.
    // Reject anything else instead of silently dropping multiline criteria.
    const match = line.match(/^(\d+)\. (\*\*Given\*\* .+)$/);
    assert.ok(match && story, `Unsupported acceptance line: ${source}:${index + 1}`);
    assert.ok(match[2].includes('**When**') && match[2].includes('**Then**'));
    scenarios.push({ source, line: index + 1, story, ordinal: Number(match[1]), text: match[2] });
  }
  assert.ok(scenarios.length > 0, `No scenarios in ${source}`);
  // Independent inventory guards the probe against missing an acceptance block.
  assert.equal(scenarios.length, lines.filter((line) => /^\d+\. \*\*Given\*\*/.test(line)).length);
  let converted = '# Spec Kit acceptance scenarios (temporary conversion)\n\n## Requirements\n';
  for (const scenario of scenarios) {
    converted += `\n### Requirement: ${scenario.story} / ${scenario.ordinal}\n\n`;
    // Preserve the full scenario text as the matching input. No invented short title.
    const generatedLine = converted.split('\n').length;
    converted += `#### Scenario: ${scenario.text}\n\n${scenario.text}\n`;
    manifest.push({ ...scenario, generatedFile: output.split('\\').join('/'), generatedLine });
  }
  mkdirSync(dirname(join(cwd, output)), { recursive: true });
  writeFileSync(join(cwd, output), converted);
}
assert.equal(files.length, 27);
assert.equal(manifest.length, 166);
writeFileSync(join(cwd, 'source-map.json'), JSON.stringify(manifest, null, 2) + '\n');
const before = check('.guard-probe-specs');
assert.equal(before.report.summary.total, manifest.length);
assert.equal(before.bytes, check('.guard-probe-specs').bytes, 'Repeated reports differ');
writeFileSync(join(cwd, 'before.json'), before.bytes);
console.log(
  JSON.stringify(
    {
      revision,
      specFiles: files.length,
      summary: before.report.summary,
      input: before.report.input,
    },
    null,
    2,
  ),
);
console.log(
  'No source specs changed. Temporary conversion and source-map.json are retained for inspection.',
);

// One manually inspected relationship, expressed only in the temporary conversion.
const selected = manifest.filter(
  (row) =>
    row.source === 'specs/service/kubernetes/spec.md' &&
    row.story.startsWith('User Story 2 ') &&
    row.ordinal === 2,
);
assert.equal(selected.length, 1);
const selectedSource = selected[0];
const selector =
  'appendWorkService (kubernetes service env inheritance) > inherits context, kubeconfig and namespace from the selected environment';
const convertedPath = join(cwd, selectedSource.generatedFile);
const converted = readFileSync(convertedPath, 'utf8');
const heading = `#### Scenario: ${selectedSource.text}`;
assert.equal(converted.split(heading).length, 2);
writeFileSync(
  convertedPath,
  converted.replace(heading, `${heading}\n\n<!-- openspec-guard:test="${selector}" -->`),
);
const after = check('.guard-probe-specs');
assert.equal(after.report.summary.passBySelector, 1);
const linked = after.report.results.find((row) => row.selector === selector);
assert.equal(linked.reason, 'selector');
const previous = before.report.results.find((row) => row.id === linked.id);
assert.equal(previous.verdict, 'uncertain');
for (const row of before.report.results.filter((row) => row.id !== linked.id)) {
  assert.equal(after.report.results.find((next) => next.id === row.id).verdict, row.verdict);
}
writeFileSync(join(cwd, 'after.json'), after.bytes);
assert.equal(after.bytes, check('.guard-probe-specs').bytes, 'Annotated reports differ');

// A gate is useful only if a later broken relationship is detected.
check('.guard-probe-specs', ['--update-baseline']);
assert.equal(
  check('.guard-probe-specs', [
    '--baseline',
    '.openspec-guard-baseline.json',
    '--fail-on',
    'fail,uncertain',
  ]).exitCode,
  0,
);
writeFileSync(
  convertedPath,
  readFileSync(convertedPath, 'utf8').replace(
    selector,
    'deliberately missing test title for the probe',
  ),
);
const broken = check('.guard-probe-specs', [
  '--baseline',
  '.openspec-guard-baseline.json',
  '--fail-on',
  'fail,uncertain',
]);
assert.equal(broken.exitCode, 1);
assert.equal(
  broken.report.results.find((row) => row.id === linked.id).reason,
  'selector-unmatched',
);
writeFileSync(join(cwd, 'broken-link.json'), broken.bytes);
writeFileSync(
  convertedPath,
  converted.replace(heading, `${heading}\n\n<!-- openspec-guard:test="${selector}" -->`),
);
const summary = {
  corpus: 'no0dles/hammerkit',
  revision,
  tool: 'openspec-guard@0.2.0',
  scope: 'Numbered acceptance scenarios only; full G/W/T text as matching input',
  specFiles: files.length,
  scenarios: manifest.length,
  testFiles: before.report.input.testFileCount,
  testTitles: before.report.input.testTitleCount,
  diagnostics: Object.fromEntries(
    Object.entries(before.report.diagnostics).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : value,
    ]),
  ),
  native: { criteria: native.report.summary.total, exitCode: native.exitCode },
  before: before.report.summary,
  after: after.report.summary,
  selected: {
    ...selectedSource,
    selector,
    test: linked.match.test,
    beforeScore: previous.match.score,
  },
  checks: {
    repeatedBytesIdentical: true,
    otherVerdictsUnchanged: true,
    baselineWithLinkExit: 0,
    brokenLinkExit: broken.exitCode,
  },
};
writeFileSync(join(cwd, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log(
  'Reports are in the printed checkout. No native Spec Kit support is shipped by this probe.',
);
