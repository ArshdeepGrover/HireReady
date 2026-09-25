/** Runs every check and assembles the report. */

import { CATEGORIES, CHECK_MODULES } from './checks';
import { buildFacts } from './text';
import type { Band, BandId, CategoryScore, CheckResult, ParsedResume, Report } from './types';

const BANDS: ReadonlyArray<{ id: BandId; min: number; label: string; message: string }> = [
  {
    id: 'ready',
    min: 85,
    label: 'Ready to send',
    message:
      'This clears the usual filters. Tailor the skills line to each posting and apply.',
  },
  {
    id: 'close',
    min: 70,
    label: 'Nearly there',
    message:
      'The structure is sound. The fixes below are small and worth doing before you send it anywhere.',
  },
  {
    id: 'weak',
    min: 50,
    label: 'Needs work',
    message:
      'The substance is here but the form is working against you. Start at the top of the list.',
  },
  {
    id: 'rework',
    min: 0,
    label: 'Rebuild it',
    message:
      'Rebuild around what you have actually made, then add the rest. The fixes are in priority order.',
  },
];

function bandFor(score: number): Band {
  const match = BANDS.find((band) => score >= band.min) ?? BANDS[BANDS.length - 1]!;
  return { id: match.id, label: match.label, message: match.message };
}

/**
 * Failures cost more than warnings, and a heavy check costs more than a light
 * one. Sorting by points lost puts the highest-leverage edit first.
 */
function actionPriority(check: CheckResult): number {
  const lost = check.weight - check.score;
  const severity = check.state === 'fail' ? 1.35 : 1;
  return lost * severity;
}

export function analyse(doc: ParsedResume): Report {
  const facts = buildFacts(doc);
  const checks = CHECK_MODULES.flatMap((run) => run(facts, doc));

  const categories: CategoryScore[] = CATEGORIES.map((meta) => {
    const own = checks.filter((check) => check.category === meta.id);
    const score = own.reduce((sum, check) => sum + check.score, 0);
    const weight = own.reduce((sum, check) => sum + check.weight, 0);
    return {
      id: meta.id,
      name: meta.name,
      blurb: meta.blurb,
      score,
      weight,
      pct: weight > 0 ? Math.round((score / weight) * 100) : 0,
      checks: own,
    };
  }).filter((category) => category.checks.length > 0);

  const totalScore = categories.reduce((sum, category) => sum + category.score, 0);
  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
  const score = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;

  const actions = checks
    .filter((check) => check.state === 'fail' || check.state === 'warn')
    .sort((a, b) => actionPriority(b) - actionPriority(a))
    .slice(0, 5);

  return {
    score,
    band: bandFor(score),
    categories,
    checks,
    actions,
    facts: {
      wordCount: facts.wordCount,
      charCount: facts.charCount,
      bulletCount: facts.bullets.length,
      pageCount: doc.pageCount,
      sectionCount: facts.sections.length,
    },
    source: doc.source,
    fileName: doc.fileName,
    generatedAt: new Date().toISOString(),
  };
}
