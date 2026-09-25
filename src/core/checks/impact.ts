/** Does the writing show what you did and what came of it? */

import {
  ACTION_VERBS,
  FILLER_PHRASES,
  METRIC_UNIT_PATTERN,
  PRONOUN_PATTERN,
  WEAK_OPENERS,
} from '../dictionaries';
import { excerpt, findPhrases, listPhrase, pluralise } from '../text';
import type { CheckFn, CheckResult } from '../types';

const VERB_SET = new Set(ACTION_VERBS);

/** Openings that describe a duty rather than an accomplishment. */
const DUTY_OPENERS =
  /^(?:responsible for|was responsible|involved in|was involved|worked on|helped(?: in| with)?|assisted(?: in| with)?|participated in|tasked with|duties includ|handled the|part of|my role|learn(?:ed|t) about|studied|familiar with|exposure to)/i;

function firstWord(sentence: string): string {
  return (sentence.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

export const impactChecks: CheckFn = (facts) => {
  const checks: CheckResult[] = [];
  const bullets = facts.bullets;

  /* ---- bullets that open with a verb ---- */
  if (bullets.length === 0) {
    checks.push({
      id: 'impact.verbs',
      category: 'impact',
      label: 'Bullets open with a verb',
      state: 'fail',
      score: 0,
      weight: 9,
      summary: 'No bullet points found.',
      fix: 'Rewrite your projects and experience as bullets. One line of prose per project hides the work; three bullets starting with Built, Designed, Automated make it visible.',
    });
  } else {
    const strong = bullets.filter((b) => VERB_SET.has(firstWord(b)));
    const duties = bullets.filter((b) => DUTY_OPENERS.test(b.trim()));
    const ratio = strong.length / bullets.length;

    checks.push({
      id: 'impact.verbs',
      category: 'impact',
      label: 'Bullets open with a verb',
      weight: 9,
      ...(ratio >= 0.7
        ? {
            state: 'pass' as const,
            score: 9,
            summary: `${strong.length} of ${bullets.length} bullets start with an action verb.`,
            evidence: strong.slice(0, 2).map((b) => excerpt(b, 70)),
          }
        : ratio >= 0.35
          ? {
              state: 'warn' as const,
              score: 5,
              summary: `${strong.length} of ${bullets.length} bullets start with an action verb.`,
              fix: 'Rewrite the rest to open with what you did: Built, Designed, Automated, Reduced, Migrated, Shipped.',
              evidence: duties.slice(0, 2).map((b) => excerpt(b, 70)),
            }
          : {
              state: 'fail' as const,
              score: 0,
              summary: `Only ${strong.length} of ${bullets.length} bullets start with an action verb.`,
              fix: '"Responsible for" and "Was involved in" describe a job description, not you. Start with the verb: "Built a REST API handling 400 requests a minute".',
              evidence: duties.slice(0, 3).map((b) => excerpt(b, 70)),
            }),
    });
  }

  /* ---- measurable outcomes ---- */
  METRIC_UNIT_PATTERN.lastIndex = 0;
  const metrics = [...new Set(facts.text.match(METRIC_UNIT_PATTERN) ?? [])].filter(
    // Years and dates are not achievements.
    (m) => !/^\b(?:19|20)\d{2}\b$/.test(m.trim()),
  );

  checks.push({
    id: 'impact.metrics',
    category: 'impact',
    label: 'Results with numbers',
    weight: 8,
    ...(metrics.length >= 4
      ? {
          state: 'pass' as const,
          score: 8,
          summary: `${pluralise(metrics.length, 'quantified detail')} found.`,
          evidence: metrics.slice(0, 4).map((m) => m.trim()),
        }
      : metrics.length >= 1
        ? {
            state: 'warn' as const,
            score: 4,
            summary: `Only ${pluralise(metrics.length, 'quantified detail')}.`,
            fix: 'Aim for a number in most bullets. Users, records, requests, percentage saved, hours cut, team size. Estimates are fine if you can defend them.',
            evidence: metrics.slice(0, 3).map((m) => m.trim()),
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: 'Nothing is quantified.',
            fix: 'This is the fastest upgrade available to you. "Managed book records" becomes "Handled 500+ book records with search across 4 fields". The number is what makes it believable.',
          }),
  });

  /* ---- first person ---- */
  PRONOUN_PATTERN.lastIndex = 0;
  const pronouns = facts.text.match(PRONOUN_PATTERN) ?? [];
  checks.push({
    id: 'impact.pronouns',
    category: 'impact',
    label: 'No "I" or "my"',
    weight: 3,
    ...(pronouns.length === 0
      ? { state: 'pass' as const, score: 3, summary: 'Written in implied first person, as it should be.' }
      : pronouns.length <= 2
        ? {
            state: 'warn' as const,
            score: 2,
            summary: `${pluralise(pronouns.length, 'first-person pronoun')} found.`,
            fix: 'Drop them. "Built a weather app" rather than "I made a weather app".',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `${pluralise(pronouns.length, 'first-person pronoun')} found.`,
            fix: 'Resumes leave the subject implied. Delete every "I", "my" and "me" and start the sentence with the verb instead.',
          }),
  });

  /* ---- filler ---- */
  const filler = findPhrases(facts.lower, FILLER_PHRASES);
  checks.push({
    id: 'impact.filler',
    category: 'impact',
    label: 'No filler phrases',
    weight: 5,
    ...(filler.length === 0
      ? { state: 'pass' as const, score: 5, summary: 'No stock phrases found.' }
      : filler.length <= 2
        ? {
            state: 'warn' as const,
            score: 3,
            summary: `Found ${listPhrase(filler)}.`,
            fix: 'Replace each one with the evidence behind it. Instead of "team player", name the project you built with three other people.',
            evidence: filler,
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `${pluralise(filler.length, 'filler phrase')}, including ${listPhrase(filler, 2)}.`,
            fix: 'Every fresher writes these, so they cancel out. Cut them and use the space for a project bullet with a number in it.',
            evidence: filler.slice(0, 6),
          }),
  });

  /* ---- the objective statement ---- */
  const weakOpener = findPhrases(facts.lower, WEAK_OPENERS);
  const hasSummary = facts.sectionKeys.has('summary');
  if (hasSummary || weakOpener.length > 0) {
    checks.push({
      id: 'impact.objective',
      category: 'impact',
      label: 'Summary earns its space',
      weight: 4,
      ...(weakOpener.length === 0
        ? {
            state: 'pass' as const,
            score: 4,
            summary: 'Your summary avoids the template phrasing.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `Template objective detected: "${excerpt(weakOpener[0] ?? '', 52)}".`,
            fix: 'An objective that states what you want helps nobody. Either delete it, or replace it with two lines of what you are: "Final-year BCA student. Built three full-stack apps in React and Node, one with 200 monthly users."',
            evidence: weakOpener,
          }),
    });
  }

  /* ---- bullet length ---- */
  if (bullets.length >= 3) {
    const lengths = bullets.map((b) => b.split(/\s+/).length);
    const tooLong = lengths.filter((n) => n > 34).length;
    const tooShort = lengths.filter((n) => n < 6).length;
    const average = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);

    checks.push({
      id: 'impact.bullet-length',
      category: 'impact',
      label: 'Bullet length',
      weight: 3,
      ...(tooLong === 0 && tooShort <= 1
        ? {
            state: 'pass' as const,
            score: 3,
            summary: `Averaging ${average} words per bullet, which scans well.`,
          }
        : tooLong > 0
          ? {
              state: 'warn' as const,
              score: 1,
              summary: `${pluralise(tooLong, 'bullet')} run past 34 words.`,
              fix: 'Long bullets get skipped. Split them, or cut to the action and the result. One to two lines each.',
            }
          : {
              state: 'warn' as const,
              score: 1,
              summary: `${pluralise(tooShort, 'bullet')} are only a few words long.`,
              fix: 'Fragments like "Used Java" say nothing. Name what you built with it and what happened.',
            }),
    });
  }

  /* ---- repetition ---- */
  if (bullets.length >= 4) {
    const openers = bullets.map(firstWord).filter(Boolean);
    const counts = new Map<string, number>();
    for (const opener of openers) counts.set(opener, (counts.get(opener) ?? 0) + 1);
    const repeated = [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    checks.push({
      id: 'impact.variety',
      category: 'impact',
      label: 'Varied phrasing',
      weight: 2,
      ...(repeated.length === 0
        ? { state: 'pass' as const, score: 2, summary: 'Your bullets do not repeat the same opener.' }
        : {
            state: 'warn' as const,
            score: 1,
            summary: `"${repeated[0]?.[0]}" opens ${repeated[0]?.[1]} bullets.`,
            fix: 'Vary the verb. Repetition makes distinct work blur into one thing.',
            evidence: repeated.map(([word, count]) => `${word} ×${count}`),
          }),
    });
  }

  return checks;
};
