/**
 * Engine smoke test. Runs the analyser over the bundled samples and prints the
 * result, so scoring behaviour can be checked without a browser.
 *
 * Usage: npm run smoke
 */

import { matchJobDescription } from '../src/core/jobmatch';
import { fromPastedText } from '../src/core/parsers/plain';
import { SAMPLE_JOB_DESCRIPTION, SAMPLES } from '../src/core/samples';
import { analyse } from '../src/core/score';

let failures = 0;

function expect(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

for (const sample of SAMPLES) {
  const report = analyse(fromPastedText(sample.text));
  console.log(`\n${sample.label} (${sample.id}) — ${report.score}/100 · ${report.band.label}`);
  console.log(
    `  words ${report.facts.wordCount} · bullets ${report.facts.bulletCount} · sections ${report.facts.sectionCount}`,
  );
  for (const category of report.categories) {
    console.log(`  ${category.name.padEnd(18)} ${String(category.pct).padStart(3)}%  (${category.score}/${category.weight})`);
  }
  console.log('  top actions:');
  for (const action of report.actions) {
    console.log(`    - [${action.state}] ${action.label}: ${action.summary}`);
  }

  if (sample.id === 'weak') {
    expect('weak sample scores below 55', report.score < 55, `got ${report.score}`);
    expect(
      'weak sample flags personal details',
      report.checks.some((c) => c.id === 'hygiene.personal' && c.state !== 'pass'),
      'personal details check passed unexpectedly',
    );
    expect(
      'weak sample flags missing metrics',
      report.checks.some((c) => c.id === 'impact.metrics' && c.state === 'fail'),
      'metrics check did not fail',
    );
    expect(
      'weak sample flags filler',
      report.checks.some((c) => c.id === 'impact.filler' && c.state !== 'pass'),
      'filler check passed unexpectedly',
    );
    expect('weak sample produced actions', report.actions.length >= 3, 'too few actions');
  }

  if (sample.id === 'strong') {
    expect('strong sample scores 80 or above', report.score >= 80, `got ${report.score}`);
    expect(
      'strong sample passes contact',
      report.checks.find((c) => c.id === 'contact.reachable')?.state === 'pass',
      'contact check did not pass',
    );
    expect(
      'strong sample passes metrics',
      report.checks.find((c) => c.id === 'impact.metrics')?.state === 'pass',
      'metrics check did not pass',
    );
    expect(
      'strong sample passes links',
      report.checks.find((c) => c.id === 'contact.links')?.state === 'pass',
      'links check did not pass',
    );
    expect(
      'strong sample has no personal-details flag',
      report.checks.find((c) => c.id === 'hygiene.personal')?.state === 'pass',
      'personal details flagged unexpectedly',
    );
  }

  expect(
    'every non-pass check carries a fix',
    report.checks.filter((c) => c.state === 'fail' || c.state === 'warn').every((c) => Boolean(c.fix)),
    'a failing check has no fix text',
  );
  expect('score is within range', report.score >= 0 && report.score <= 100, `got ${report.score}`);
}

/* ---- layout checks must not be scored for pasted text ---- */
const pastedReport = analyse(fromPastedText(SAMPLES[1]!.text));
const infoChecks = pastedReport.checks.filter((c) => c.state === 'info');
expect('pasted text yields info-only layout checks', infoChecks.length >= 3, `got ${infoChecks.length}`);
expect(
  'info checks carry no weight',
  infoChecks.every((c) => c.weight === 0),
  'an info check has non-zero weight',
);

/* ---- job description matching ---- */
console.log('\nJob description match');
for (const sample of SAMPLES) {
  const match = matchJobDescription(sample.text, SAMPLE_JOB_DESCRIPTION);
  console.log(
    `  ${sample.label.padEnd(7)} coverage ${String(match.coverage).padStart(3)}%  skills ${String(match.skillCoverage).padStart(3)}%  terms ${match.terms.length}`,
  );
  console.log(`    missing: ${match.missing.slice(0, 8).map((m) => m.term).join(', ')}`);
  expect(
    `${sample.id}: terms were extracted`,
    match.terms.length >= 10,
    `only ${match.terms.length} terms`,
  );
}

const weakMatch = matchJobDescription(SAMPLES[0]!.text, SAMPLE_JOB_DESCRIPTION);
const strongMatch = matchJobDescription(SAMPLES[1]!.text, SAMPLE_JOB_DESCRIPTION);
expect(
  'rewritten resume matches the posting better',
  strongMatch.coverage > weakMatch.coverage,
  `weak ${weakMatch.coverage}% vs strong ${strongMatch.coverage}%`,
);

/* ---- degenerate input must not throw ---- */
for (const input of ['', '   ', 'x', 'a\nb\nc', '•'.repeat(200), '12345 67890']) {
  const report = analyse(fromPastedText(input));
  expect(
    `degenerate input (${JSON.stringify(input.slice(0, 12))}) is handled`,
    Number.isFinite(report.score) && report.score >= 0,
    `score was ${report.score}`,
  );
}

console.log(failures === 0 ? '\nAll engine checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
